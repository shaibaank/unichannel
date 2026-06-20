import nodemailer from "nodemailer";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { env } from "../../env.js";
import { ingestInbound } from "../ingest.js";
import { getSettings } from "../settings.js";

// ── Outbound (SMTP via Nodemailer) ──────────────────────────────
let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (!env.SMTP_HOST || !env.EMAIL_USER || !env.EMAIL_PASS) {
    throw new Error("SMTP is not configured (set EMAIL_*/SMTP_* env vars).");
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: { user: env.EMAIL_USER, pass: env.EMAIL_PASS },
    });
  }
  return transporter;
}

export interface SendEmailOptions {
  to: string;
  subject?: string;
  text: string;
  inReplyTo?: string;
}

export async function sendEmail(opts: SendEmailOptions): Promise<string> {
  const info = await getTransporter().sendMail({
    from: env.EMAIL_USER,
    to: opts.to,
    subject: opts.subject ?? "Re: your message",
    text: opts.text,
    inReplyTo: opts.inReplyTo,
    references: opts.inReplyTo,
  });
  return info.messageId;
}

// ── Inbound (IMAP polling) ──────────────────────────────────────
const POLL_INTERVAL_MS = 30_000;
let polling = false;

/** Process a single raw RFC822 email source through the ingest pipeline. */
export async function handleInboundEmailSource(source: Buffer | string) {
  const parsed = await simpleParser(source);
  const fromAddr = parsed.from?.value?.[0]?.address ?? null;
  const fromName = parsed.from?.value?.[0]?.name ?? null;
  const externalId =
    parsed.messageId ?? `email_${parsed.date?.getTime() ?? Date.now()}`;
  const body = (parsed.text ?? parsed.html ?? "").toString().trim();

  if (!fromAddr) return null;

  return ingestInbound({
    channel: "EMAIL",
    externalId,
    body: body || "(empty message)",
    contact: { email: fromAddr, name: fromName },
    metadata: {
      subject: parsed.subject ?? null,
      from: fromAddr,
      messageId: externalId,
    },
    timestamp: parsed.date ?? new Date(),
  });
}

async function pollOnce(log: (msg: string) => void) {
  const client = new ImapFlow({
    host: env.EMAIL_HOST!,
    port: env.EMAIL_PORT,
    secure: env.EMAIL_PORT === 993,
    auth: { user: env.EMAIL_USER!, pass: env.EMAIL_PASS! },
    logger: false,
  });

  // ImapFlow emits 'error' asynchronously; swallow it so a transient
  // connection problem never crashes the process.
  client.on("error", () => {});

  await client.connect();
  const lock = await client.getMailboxLock("INBOX");
  try {
    const unseen = await client.search({ seen: false });
    if (unseen && unseen.length > 0) {
      for (const uid of unseen) {
        const msg = await client.fetchOne(String(uid), { source: true });
        if (msg && msg.source) {
          await handleInboundEmailSource(msg.source);
        }
        await client.messageFlagsAdd(String(uid), ["\\Seen"]);
      }
      log(`[email] processed ${unseen.length} new message(s)`);
    }
  } finally {
    lock.release();
    await client.logout();
  }
}

/** Starts a 30s IMAP polling loop. No-op if email isn't configured. */
export function startImapPolling(log: (msg: string) => void = console.log) {
  const placeholder =
    !env.EMAIL_USER ||
    env.EMAIL_USER.includes("your@") ||
    env.EMAIL_PASS === "app_password";
  if (!env.EMAIL_HOST || !env.EMAIL_USER || !env.EMAIL_PASS || placeholder) {
    log("[email] IMAP polling disabled — set real EMAIL_* credentials to enable.");
    return;
  }
  if (polling) return;
  polling = true;

  const tick = async () => {
    try {
      // Respect the live Settings toggle — operator can disable email ingestion.
      const settings = await getSettings();
      if (!settings.emailEnabled) return;
      await pollOnce(log);
    } catch (err) {
      log(`[email] poll error: ${(err as Error).message}`);
    }
  };

  void tick();
  setInterval(() => void tick(), POLL_INTERVAL_MS);
  log("[email] IMAP polling started (30s interval).");
}
