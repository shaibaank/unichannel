import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  listConversations,
  getConversation,
  updateConversation,
} from "../services/conversations.js";
import { sendReply } from "../services/sender.js";
import {
  streamDraft,
  classifyMessages,
  runSummarizeJob,
} from "../services/llm-tasks.js";
import { prisma } from "../lib/prisma.js";

const channelEnum = z.enum(["WHATSAPP", "EMAIL", "SMS"]);
const statusEnum = z.enum(["OPEN", "CLOSED", "PENDING", "SNOOZED"]);

const listQuery = z.object({
  page: z.coerce.number().optional(),
  pageSize: z.coerce.number().optional(),
  channel: channelEnum.optional(),
  status: statusEnum.optional(),
  tag: z.string().optional(),
  assignedTo: z.string().optional(),
});

const patchBody = z.object({
  status: statusEnum.optional(),
  assignedTo: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
});

const replyBody = z.object({
  body: z.string().min(1),
});

export async function conversationRoutes(app: FastifyInstance) {
  // Everything here requires auth.
  app.addHook("preHandler", app.authenticate);

  app.get("/conversations", async (request, reply) => {
    const parsed = listQuery.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid query parameters" });
    }
    return listConversations(parsed.data);
  });

  app.get("/conversations/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const conversation = await getConversation(id);
    if (!conversation) {
      return reply.code(404).send({ error: "Conversation not found" });
    }
    return conversation;
  });

  app.patch("/conversations/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = patchBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid request body" });
    }
    const updated = await updateConversation(id, parsed.data);
    if (!updated) {
      return reply.code(404).send({ error: "Conversation not found" });
    }
    return updated;
  });

  app.post("/conversations/:id/reply", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = replyBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid request body" });
    }
    try {
      const message = await sendReply(id, parsed.data.body, "AGENT");
      return message;
    } catch (err) {
      return reply
        .code(400)
        .send({ error: (err as Error).message ?? "Failed to send reply" });
    }
  });

  // Streamed AI draft.
  app.post("/conversations/:id/draft", async (request, reply) => {
    const { id } = request.params as { id: string };
    const conversation = await getConversation(id);
    if (!conversation) {
      return reply.code(404).send({ error: "Conversation not found" });
    }

    reply.raw.setHeader("Content-Type", "text/plain; charset=utf-8");
    reply.raw.setHeader("Cache-Control", "no-cache");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.hijack();

    try {
      const stream = await streamDraft(id);
      for await (const token of stream) {
        if (token) reply.raw.write(token);
      }
    } catch (err) {
      reply.raw.write(`\n[error] ${(err as Error).message}`);
    } finally {
      reply.raw.end();
    }
  });

  app.post("/conversations/:id/summarize", async (request, reply) => {
    const { id } = request.params as { id: string };
    const conversation = await prisma.conversation.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!conversation) {
      return reply.code(404).send({ error: "Conversation not found" });
    }
    const summary = await runSummarizeJob(id);
    return { summary: summary ?? null };
  });

  app.post("/conversations/:id/classify", async (request, reply) => {
    const { id } = request.params as { id: string };
    const messages = await prisma.message.findMany({
      where: { conversationId: id },
      orderBy: { timestamp: "desc" },
      take: 10,
      select: { direction: true, body: true },
    });
    if (messages.length === 0) {
      return reply.code(404).send({ error: "No messages to classify" });
    }
    const classification = await classifyMessages(messages.reverse());
    return classification;
  });
}
