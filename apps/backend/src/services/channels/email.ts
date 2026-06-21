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
const POLL_INTERVAL_MS = 5_000;
let polling = false;

/** Process a single raw RFC822 email source through the ingest pipeline. */
export async function handleInboundEmailSource(source: Buffer | string) {
  const parsed = await simpleParser(source);
  const fromAddr = parsed.from?.value?.[0]?.address ?? null;
  const fromName = parsed.from?.value?.[0]?.name ?? null;
  const externalId =
    parsed.messageId ?? `email_${parsed.date?.getTime() ?? Date.now()}`;
  const body = (parsed.text ?? parsed.html ?? "").toString().trim();
  const subject = parsed.subject ?? "";

  if (!fromAddr) return null;

  // Magic-word filter: only surface emails containing the keyword (lets the
  // operator use a shared/personal inbox without ingesting junk).
  const keyword = env.EMAIL_FILTER_KEYWORD.trim().toLowerCase();
  if (keyword) {
    const haystack = `${subject}\n${body}`.toLowerCase();
    if (!haystack.includes(keyword)) return null;
  }

  return ingestInbound({
    channel: "EMAIL",
    externalId,
    body: body || "(empty message)",
    contact: { email: fromAddr, name: fromName },
    metadata: {
      subject: subject || null,
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
    // Fail fast instead of hanging if Gmail is slow / connection-limited.
    greetingTimeout: 8000,
    socketTimeout: 20000,
    disableAutoIdle: true,
  });

  // ImapFlow emits 'error' asynchronously; swallow it so a transient
  // connection problem never crashes the process.
  client.on("error", () => {});

  let connected = false;
  try {
    await client.connect();
    connected = true;
    const lock = await client.getMailboxLock("INBOX");
    try {
      const keyword = env.EMAIL_FILTER_KEYWORD.trim();
      const uids = new Set<number>();

      // Unseen messages (normal flow).
      const unseen = await client.search({ seen: false });
      if (unseen) for (const u of unseen) uids.add(u);

      // In keyword mode, also catch recent messages containing the keyword
      // even if already read in Gmail (idempotency prevents duplicates).
      if (keyword) {
        const since = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
        const kw = await client.search({ body: keyword, since });
        if (kw) for (const u of kw) uids.add(u);
      }

      if (uids.size > 0) {
        let ingested = 0;
        for (const uid of uids) {
          const msg = await client.fetchOne(String(uid), { source: true });
          if (msg && msg.source) {
            const res = await handleInboundEmailSource(msg.source);
            if (res) ingested++;
          }
          await client.messageFlagsAdd(String(uid), ["\\Seen"]);
        }
        log(
          `[email] checked ${uids.size} message(s), ingested ${ingested}`,
        );
      }
    } finally {
      lock.release();
    }
  } finally {
    // Always release the connection back to Gmail, even on error, to avoid
    // exhausting the per-account simultaneous-connection limit.
    if (connected) {
      try {
        await client.logout();
      } catch {
        /* ignore */
      }
    }
    try {
      client.close();
    } catch {
      /* ignore */
    }
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

  let inFlight = false;
  const tick = async () => {
    if (inFlight) return; // never run two polls at once
    inFlight = true;
    try {
      // Respect the live Settings toggle — operator can disable email ingestion.
      const settings = await getSettings();
      if (!settings.emailEnabled) return;
      await pollOnce(log);
    } catch (err) {
      log(`[email] poll error: ${(err as Error).message}`);
    } finally {
      inFlight = false;
    }
  };

  void tick();
  setInterval(() => void tick(), POLL_INTERVAL_MS);
  log(`[email] IMAP polling started (${POLL_INTERVAL_MS / 1000}s interval).`);
}
