import { chatComplete, chatStream } from "../lib/llm.js";
import { prisma } from "../lib/prisma.js";
import { emitConversationUpdated, emitEscalationNeeded } from "../lib/socket.js";
import { getSystemPrompt } from "./settings.js";
import { sendReply } from "./sender.js";
import { retrieve } from "./rag.js";

export type Sentiment = "POSITIVE" | "NEUTRAL" | "NEGATIVE";
export type Intent = "SUPPORT" | "SALES" | "COMPLAINT" | "GENERAL";
export type Urgency = "HIGH" | "MEDIUM" | "LOW";

export interface Classification {
  sentiment: Sentiment;
  intent: Intent;
  urgency: Urgency;
}

interface ContextMessage {
  direction: "INBOUND" | "OUTBOUND";
  body: string;
}

async function getRecentMessages(
  conversationId: string,
  take: number,
): Promise<ContextMessage[]> {
  const rows = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { timestamp: "desc" },
    take,
    select: { direction: true, body: true },
  });
  return rows.reverse();
}

function toChatTranscript(messages: ContextMessage[]): string {
  return messages
    .map(
      (m) =>
        `${m.direction === "INBOUND" ? "Customer" : "Agent"}: ${m.body
          .slice(0, 800)
          .trim()}`,
    )
    .join("\n");
}

// ── classify ────────────────────────────────────────────────────
const CLASSIFY_INSTRUCTIONS = `You are a message classifier for a customer support inbox.
Analyse the conversation and respond with a JSON object containing exactly these keys:
- "sentiment": one of "POSITIVE", "NEUTRAL", "NEGATIVE"
- "intent": one of "SUPPORT", "SALES", "COMPLAINT", "GENERAL"
- "urgency": one of "HIGH", "MEDIUM", "LOW"
Respond with JSON only, no extra text.`;

function coerceClassification(raw: unknown): Classification {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const sentiment = String(obj.sentiment ?? "NEUTRAL").toUpperCase();
  const intent = String(obj.intent ?? "GENERAL").toUpperCase();
  const urgency = String(obj.urgency ?? "LOW").toUpperCase();
  const sList: Sentiment[] = ["POSITIVE", "NEUTRAL", "NEGATIVE"];
  const iList: Intent[] = ["SUPPORT", "SALES", "COMPLAINT", "GENERAL"];
  const uList: Urgency[] = ["HIGH", "MEDIUM", "LOW"];
  return {
    sentiment: (sList.includes(sentiment as Sentiment)
      ? sentiment
      : "NEUTRAL") as Sentiment,
    intent: (iList.includes(intent as Intent) ? intent : "GENERAL") as Intent,
    urgency: (uList.includes(urgency as Urgency) ? urgency : "LOW") as Urgency,
  };
}

/** Pure LLM classification — does not persist anything. */
export async function classifyMessages(
  messages: ContextMessage[],
): Promise<Classification> {
  const content = await chatComplete({
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: CLASSIFY_INSTRUCTIONS },
      { role: "user", content: toChatTranscript(messages) },
    ],
  });
  let parsed: unknown = {};
  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = {};
  }
  return coerceClassification(parsed);
}

/** classify job: classify -> persist sentiment -> upsert+link intent tag. */
export async function runClassifyJob(conversationId: string) {
  const messages = await getRecentMessages(conversationId, 10);
  if (messages.length === 0) return;

  const classification = await classifyMessages(messages);

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { sentiment: classification.sentiment },
    select: { id: true },
  });

  const tagName = classification.intent;
  await prisma.tag.upsert({
    where: { name: tagName },
    create: { name: tagName },
    update: {},
    select: { id: true },
  });
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { tags: { connect: { name: tagName } } },
    select: { id: true },
  });

  // Raise an escalation alert for urgent messages (handled here so auto-reply
  // stays a single LLM call and replies fast).
  if (classification.urgency === "HIGH") {
    emitEscalationNeeded({ conversationId, classification });
  }

  emitConversationUpdated({ conversationId });
  return classification;
}

// ── auto-reply (RAG-grounded) ───────────────────────────────────
function formatContext(
  chunks: { title: string; content: string }[],
): string {
  return chunks
    .map((c, i) => `[${i + 1}] ${c.title}: ${c.content}`)
    .join("\n");
}

/**
 * auto-reply job: build context from the last customer message via RAG,
 * answer grounded ONLY in the retrieved knowledge base, and send the reply
 * through the conversation's channel. HIGH urgency also raises an escalation
 * notification, but the customer still gets an immediate answer.
 */
export async function runAutoReplyJob(conversationId: string) {
  const messages = await getRecentMessages(conversationId, 10);
  if (messages.length === 0) return;

  const last = messages[messages.length - 1];
  // Only auto-reply when the latest message is from the customer.
  if (last?.direction !== "INBOUND") return;

  // Strip quoted email reply lines for a cleaner retrieval query.
  const question = last.body
    .split("\n")
    .filter((l) => !l.trim().startsWith(">"))
    .join("\n")
    .trim()
    .slice(0, 500);

  // RAG retrieval is local and always available, even with zero LLM quota.
  const chunks = await retrieve(question || last.body, 3);
  const context = formatContext(chunks);

  const basePrompt = await getSystemPrompt();
  const systemPrompt = `${basePrompt}

You are a support agent for Nimbus Audio. Answer the customer's question directly and concisely using the knowledge base context below. Be helpful and specific — give the actual details (times, prices, policies) from the context. Only if the question is clearly unrelated to the context should you ask the customer for clarification. Never say you are "connecting them to a human" unless they explicitly ask for one.

Knowledge base context:
${context}`;

  let reply = "";
  try {
    reply = (
      await chatComplete({
        temperature: 0.3,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Conversation so far:\n${toChatTranscript(
              messages,
            )}\n\nWrite the next reply to the customer. Reply with the message text only.`,
          },
        ],
      })
    ).trim();
  } catch {
    reply = "";
  }

  // Guaranteed fallback so the customer is never ghosted when the LLM is
  // unavailable: answer straight from the best-matching KB chunk(s).
  if (!reply) {
    const relevant = chunks.filter((c) => c.score > 0.2);
    if (relevant.length > 0) {
      // Use the top chunk, and append a second if it's also clearly relevant.
      const parts = [relevant[0].content];
      if (relevant[1] && relevant[1].score > 0.28) {
        parts.push(relevant[1].content);
      }
      reply = `${parts.join(" ")}\n\nIs there anything else I can help you with?`;
    } else {
      reply =
        "Thanks for reaching out! Could you tell me a bit more about what you need help with — orders, shipping, returns, warranty, or products?";
    }
  }

  await sendReply(conversationId, reply, "BOT");
}

// ── summarize ───────────────────────────────────────────────────
/** summarize job: summarise all messages into 2-3 sentences and persist. */
export async function runSummarizeJob(conversationId: string) {
  const all = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { timestamp: "asc" },
    select: { direction: true, body: true },
  });
  if (all.length === 0) return;

  const summary = (
    await chatComplete({
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content:
            "Summarise the following customer support conversation in 2-3 concise sentences. Capture the customer's issue and the resolution.",
        },
        { role: "user", content: toChatTranscript(all) },
      ],
    })
  ).trim();
  if (!summary) return;

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { summary },
    select: { id: true },
  });
  emitConversationUpdated({ conversationId });
  return summary;
}

// ── draft (streaming, used by the HTTP route) ───────────────────
/** Returns an async iterable of token strings for a suggested reply draft. */
export async function streamDraft(
  conversationId: string,
): Promise<AsyncGenerator<string>> {
  const messages = await getRecentMessages(conversationId, 10);
  const systemPrompt = await getSystemPrompt();

  return chatStream({
    temperature: 0.6,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Here is the recent conversation:\n\n${toChatTranscript(
          messages,
        )}\n\nDraft a helpful reply as the agent. Reply with the message text only.`,
      },
    ],
  });
}
