import type { Channel, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { emitNewMessage, emitConversationUpdated } from "../lib/socket.js";
import { enqueueClassify, enqueueAutoReply } from "../queue/index.js";
import { getSettings } from "./settings.js";

export interface InboundMessageInput {
  channel: Channel;
  /** Raw channel message id — used as the idempotency key. */
  externalId: string;
  body: string;
  mediaUrl?: string | null;
  contact: {
    phone?: string | null;
    email?: string | null;
    name?: string | null;
  };
  metadata?: Record<string, unknown>;
  timestamp?: Date;
}

/**
 * End-to-end inbound pipeline shared by every channel webhook:
 *   idempotency check -> upsert contact -> upsert conversation ->
 *   save message -> emit socket events -> enqueue classify (+ auto-reply).
 *
 * Returns `null` when the message is a duplicate (idempotent no-op).
 */
export async function ingestInbound(input: InboundMessageInput) {
  // 1. Idempotency — skip if we've already stored this channel message id.
  const dupe = await prisma.message.findUnique({
    where: { externalId: input.externalId },
    select: { id: true },
  });
  if (dupe) return null;

  // 2. Upsert contact by phone or email.
  const contact = await upsertContact(input.contact);

  // 3. Upsert conversation (one thread per contact per channel).
  const conversation = await prisma.conversation.upsert({
    where: {
      contactId_channel: { contactId: contact.id, channel: input.channel },
    },
    create: {
      contactId: contact.id,
      channel: input.channel,
      status: "OPEN",
    },
    update: { status: "OPEN" },
    select: { id: true, channel: true, status: true, contactId: true },
  });

  // 4. Persist the inbound message.
  let message;
  try {
    message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: "INBOUND",
        body: input.body,
        mediaUrl: input.mediaUrl ?? null,
        sentBy: "HUMAN",
        timestamp: input.timestamp ?? new Date(),
        metadata: (input.metadata ?? undefined) as
          | Prisma.InputJsonValue
          | undefined,
        externalId: input.externalId,
      },
      select: {
        id: true,
        conversationId: true,
        direction: true,
        body: true,
        mediaUrl: true,
        sentBy: true,
        timestamp: true,
      },
    });
  } catch (err) {
    // Unique violation on externalId => concurrent duplicate delivery.
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code?: string }).code === "P2002"
    ) {
      return null;
    }
    throw err;
  }

  // Touch the conversation so it sorts to the top of the inbox.
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { updatedAt: new Date() },
    select: { id: true },
  });

  // 5. Push real-time events.
  emitNewMessage({ conversationId: conversation.id, message });
  emitConversationUpdated({ conversationId: conversation.id });

  // 6. Enqueue async LLM work (webhook stays fast).
  await enqueueClassify({
    conversationId: conversation.id,
    messageId: message.id,
  });

  const settings = await getSettings();
  if (settings.autoReplyEnabled) {
    await enqueueAutoReply({ conversationId: conversation.id });
  }

  return { contact, conversation, message };
}

async function upsertContact(input: InboundMessageInput["contact"]) {
  const phone = input.phone ?? null;
  const email = input.email ?? null;

  const existing = await prisma.contact.findFirst({
    where: {
      OR: [
        ...(phone ? [{ phone }] : []),
        ...(email ? [{ email }] : []),
      ],
    },
    select: { id: true, name: true, phone: true, email: true },
  });

  if (existing) {
    // Backfill any missing fields without clobbering existing data.
    const data: Prisma.ContactUpdateInput = {};
    if (!existing.name && input.name) data.name = input.name;
    if (!existing.phone && phone) data.phone = phone;
    if (!existing.email && email) data.email = email;
    if (Object.keys(data).length > 0) {
      return prisma.contact.update({
        where: { id: existing.id },
        data,
        select: { id: true, name: true, phone: true, email: true },
      });
    }
    return existing;
  }

  return prisma.contact.create({
    data: { name: input.name ?? null, phone, email },
    select: { id: true, name: true, phone: true, email: true },
  });
}
