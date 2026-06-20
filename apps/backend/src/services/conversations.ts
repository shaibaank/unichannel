import type { Channel, ConversationStatus, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { emitConversationUpdated } from "../lib/socket.js";
import { enqueueSummarize } from "../queue/index.js";

export interface ListConversationsParams {
  page?: number;
  pageSize?: number;
  channel?: Channel;
  status?: ConversationStatus;
  tag?: string;
  assignedTo?: string;
}

export async function listConversations(params: ListConversationsParams) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 25));

  const where: Prisma.ConversationWhereInput = {};
  if (params.channel) where.channel = params.channel;
  if (params.status) where.status = params.status;
  if (params.assignedTo) where.assignedTo = params.assignedTo;
  if (params.tag) where.tags = { some: { name: params.tag } };

  const [total, items] = await Promise.all([
    prisma.conversation.count({ where }),
    prisma.conversation.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        channel: true,
        status: true,
        sentiment: true,
        assignedTo: true,
        summary: true,
        updatedAt: true,
        contact: { select: { id: true, name: true, phone: true, email: true } },
        tags: { select: { id: true, name: true } },
        messages: {
          orderBy: { timestamp: "desc" },
          take: 1,
          select: { body: true, direction: true, timestamp: true },
        },
      },
    }),
  ]);

  return {
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
    items: items.map((c) => {
      const last = c.messages[0];
      return {
        id: c.id,
        channel: c.channel,
        status: c.status,
        sentiment: c.sentiment,
        assignedTo: c.assignedTo,
        summary: c.summary,
        updatedAt: c.updatedAt,
        contact: c.contact,
        tags: c.tags,
        lastMessage: last
          ? {
              preview: last.body.slice(0, 60),
              direction: last.direction,
              timestamp: last.timestamp,
            }
          : null,
      };
    }),
  };
}

export async function getConversation(id: string) {
  return prisma.conversation.findUnique({
    where: { id },
    select: {
      id: true,
      channel: true,
      status: true,
      sentiment: true,
      assignedTo: true,
      summary: true,
      createdAt: true,
      updatedAt: true,
      contact: { select: { id: true, name: true, phone: true, email: true } },
      tags: { select: { id: true, name: true } },
      messages: {
        orderBy: { timestamp: "asc" },
        select: {
          id: true,
          direction: true,
          body: true,
          mediaUrl: true,
          sentBy: true,
          timestamp: true,
        },
      },
    },
  });
}

export interface UpdateConversationInput {
  status?: ConversationStatus;
  assignedTo?: string | null;
  tags?: string[]; // tag names — replaces the full set
}

export async function updateConversation(
  id: string,
  input: UpdateConversationInput,
) {
  const current = await prisma.conversation.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!current) return null;

  const data: Prisma.ConversationUpdateInput = {};
  if (input.status !== undefined) data.status = input.status;
  if (input.assignedTo !== undefined) data.assignedTo = input.assignedTo;

  if (input.tags) {
    // Ensure each tag exists, then set the relation to exactly this set.
    await Promise.all(
      input.tags.map((name) =>
        prisma.tag.upsert({
          where: { name },
          create: { name },
          update: {},
          select: { id: true },
        }),
      ),
    );
    data.tags = { set: input.tags.map((name) => ({ name })) };
  }

  const updated = await prisma.conversation.update({
    where: { id },
    data,
    select: {
      id: true,
      channel: true,
      status: true,
      sentiment: true,
      assignedTo: true,
      summary: true,
      updatedAt: true,
      tags: { select: { id: true, name: true } },
    },
  });

  emitConversationUpdated({ conversationId: id });

  // Trigger summarization when a conversation transitions to CLOSED.
  if (input.status === "CLOSED" && current.status !== "CLOSED") {
    await enqueueSummarize({ conversationId: id });
  }

  return updated;
}
