import twilio from "twilio";
import { env } from "../../env.js";

let client: ReturnType<typeof twilio> | null = null;

function getClient() {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) {
    throw new Error("Twilio is not configured (set TWILIO_* env vars).");
  }
  if (!client) {
    client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
  }
  return client;
}

/**
 * Send an SMS via the Twilio Messaging API.
 * Docs: https://www.twilio.com/docs/messaging/api
 */
export async function sendSms(to: string, body: string): Promise<string> {
  const msg = await getClient().messages.create({
    to,
    from: env.TWILIO_FROM_NUMBER,
    body,
  });
  return msg.sid;
}
