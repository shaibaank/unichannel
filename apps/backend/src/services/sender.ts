import type { SentBy } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { emitNewMessage, emitConversationUpdated } from "../lib/socket.js";
import { sendWhatsApp } from "./channels/whatsapp.js";
import { sendSms } from "./channels/sms.js";
import { sendEmail } from "./channels/email.js";

export interface SendReplyResult {
  id: string;
  conversationId: string;
  direction: "OUTBOUND";
  body: string;
  sentBy: SentBy;
  timestamp: Date;
}

/**
 * Routes an outbound reply to the correct channel API based on
 * `conversation.channel`, then persists it as an OUTBOUND message.
 */
export async function sendReply(
  conversationId: string,
  body: string,
  sentBy: SentBy,
): Promise<SendReplyResult> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      id: true,
      channel: true,
      contact: { select: { phone: true, email: true } },
      messages: {
        where: { direction: "INBOUND" },
        orderBy: { timestamp: "desc" },
        take: 1,
        select: { externalId: true, metadata: true },
      },
    },
  });

  if (!conversation) {
    throw new Error(`Conversation ${conversationId} not found`);
  }

  let externalId: string;

  switch (conversation.channel) {
    case "WHATSAPP": {
      if (!conversation.contact.phone) {
        throw new Error("Contact has no phone number for WhatsApp reply");
      }
      externalId = await sendWhatsApp(conversation.contact.phone, body);
      break;
    }
    case "SMS": {
      if (!conversation.contact.phone) {
        throw new Error("Contact has no phone number for SMS reply");
      }
      externalId = await sendSms(conversation.contact.phone, body);
      break;
    }
    case "EMAIL": {
      if (!conversation.contact.email) {
        throw new Error("Contact has no email address for email reply");
      }
      const lastInbound = conversation.messages[0];
      const meta = (lastInbound?.metadata ?? {}) as Record<string, unknown>;
      const subject =
        typeof meta.subject === "string" ? `Re: ${meta.subject}` : undefined;
      externalId = await sendEmail({
        to: conversation.contact.email,
        subject,
        text: body,
        inReplyTo: lastInbound?.externalId ?? undefined,
      });
      break;
    }
    default:
      throw new Error(`Unsupported channel: ${conversation.channel}`);
  }

  const message = await prisma.message.create({
    data: {
      conversationId,
      direction: "OUTBOUND",
      body,
      sentBy,
      externalId,
      timestamp: new Date(),
    },
    select: {
      id: true,
      conversationId: true,
      direction: true,
      body: true,
      sentBy: true,
      timestamp: true,
    },
  });

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
    select: { id: true },
  });

  emitNewMessage({ conversationId, message });
  emitConversationUpdated({ conversationId });

  return message as SendReplyResult;
}
