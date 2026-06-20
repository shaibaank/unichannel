import type { FastifyInstance } from "fastify";
import { ingestInbound } from "../services/ingest.js";
import { handleInboundEmailSource } from "../services/channels/email.js";
import { emitWhatsAppQr, emitWhatsAppStatus } from "../lib/socket.js";

/**
 * Inbound channel webhooks. No auth (called by external providers).
 * Each handler must return quickly (<200ms) — all heavy work is queued
 * inside ingestInbound. Idempotency is enforced via Message.externalId.
 */
export async function webhookRoutes(app: FastifyInstance) {
  // ── WhatsApp (Evolution API messages.upsert) ──────────────────
  app.post("/webhook/whatsapp", async (request, reply) => {
    const payload = request.body as EvolutionWebhook | undefined;
    if (!payload) return reply.code(200).send({ ok: true });

    const event = (payload.event ?? "").toLowerCase();

    // Connection lifecycle events → push to the connect UI via Socket.io.
    if (event === "qrcode.updated") {
      const data = payload.data as unknown as Record<string, unknown> | undefined;
      const qrcode = (data?.qrcode ?? data ?? {}) as Record<string, unknown>;
      emitWhatsAppQr({
        base64: qrcode?.base64 ?? null,
        pairingCode: qrcode?.pairingCode ?? null,
      });
      return reply.code(200).send({ ok: true });
    }
    if (event === "connection.update") {
      const data = payload.data as unknown as { state?: string } | undefined;
      emitWhatsAppStatus({ state: data?.state ?? "unknown" });
      return reply.code(200).send({ ok: true });
    }

    // Default: inbound message (messages.upsert).
    if (!payload.data) return reply.code(200).send({ ok: true });

    const data = payload.data;
    const key = data.key;

    // Ignore our own outbound echoes and group chats.
    if (!key || key.fromMe) return reply.code(200).send({ ok: true });
    const remoteJid = key.remoteJid ?? "";
    if (remoteJid.endsWith("@g.us")) {
      return reply.code(200).send({ ok: true });
    }

    const phone = remoteJid.split("@")[0];
    const externalId = key.id;
    if (!phone || !externalId) return reply.code(200).send({ ok: true });

    const text = extractWhatsAppText(data.message);

    await ingestInbound({
      channel: "WHATSAPP",
      externalId,
      body: text || "(media message)",
      contact: { phone, name: data.pushName ?? null },
      metadata: payload as unknown as Record<string, unknown>,
      timestamp: data.messageTimestamp
        ? new Date(Number(data.messageTimestamp) * 1000)
        : new Date(),
    });

    return reply.code(200).send({ ok: true });
  });

  // ── Email (triggered internally by the IMAP polling loop, but also
  //    accepts a raw source or structured payload for manual testing) ──
  app.post("/webhook/email", async (request, reply) => {
    const body = request.body as EmailWebhook | undefined;
    if (!body) return reply.code(200).send({ ok: true });

    if (body.source) {
      await handleInboundEmailSource(body.source);
      return reply.code(200).send({ ok: true });
    }

    if (body.from && body.messageId) {
      await ingestInbound({
        channel: "EMAIL",
        externalId: body.messageId,
        body: body.body ?? "(empty message)",
        contact: { email: body.from, name: body.name ?? null },
        metadata: { subject: body.subject ?? null, from: body.from },
      });
    }
    return reply.code(200).send({ ok: true });
  });

  // ── SMS (Twilio inbound webhook, application/x-www-form-urlencoded) ──
  app.post("/webhook/sms", async (request, reply) => {
    const body = request.body as TwilioSmsWebhook | undefined;
    if (!body || !body.From || !body.MessageSid) {
      return reply.code(200).send({ ok: true });
    }

    await ingestInbound({
      channel: "SMS",
      externalId: body.MessageSid,
      body: body.Body ?? "(empty message)",
      contact: { phone: body.From },
      metadata: body as unknown as Record<string, unknown>,
    });

    // Twilio expects TwiML or an empty 200. Empty <Response/> avoids auto-replies.
    reply.header("Content-Type", "text/xml");
    return reply.code(200).send("<Response></Response>");
  });
}

// ── helpers / types ─────────────────────────────────────────────
interface EvolutionWebhook {
  event?: string;
  instance?: string;
  data?: {
    key?: { remoteJid?: string; fromMe?: boolean; id?: string };
    pushName?: string;
    message?: Record<string, unknown>;
    messageTimestamp?: number | string;
  };
}

interface EmailWebhook {
  source?: string;
  from?: string;
  name?: string;
  body?: string;
  subject?: string;
  messageId?: string;
}

interface TwilioSmsWebhook {
  From?: string;
  To?: string;
  Body?: string;
  MessageSid?: string;
}

function extractWhatsAppText(message?: Record<string, unknown>): string {
  if (!message) return "";
  if (typeof message.conversation === "string") return message.conversation;
  const ext = message.extendedTextMessage as { text?: string } | undefined;
  if (ext?.text) return ext.text;
  const img = message.imageMessage as { caption?: string } | undefined;
  if (img?.caption) return img.caption;
  const vid = message.videoMessage as { caption?: string } | undefined;
  if (vid?.caption) return vid.caption;
  return "";
}
