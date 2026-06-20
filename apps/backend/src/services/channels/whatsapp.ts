import axios from "axios";
import { env } from "../../env.js";

/**
 * Send a WhatsApp text via Evolution API (Baileys provider).
 * POST /message/sendText/{instance}
 * Docs: https://doc.evolution-api.com/v2/en/api-reference/message-controller/send-text
 *
 * `to` is the bare phone number in international format (no +), e.g. 5511999999999.
 */
export async function sendWhatsApp(to: string, text: string): Promise<string> {
  const instance = env.EVOLUTION_INSTANCE_NAME;
  const url = `${env.EVOLUTION_API_URL}/message/sendText/${instance}`;

  const number = to.replace(/[^\d]/g, "");

  const res = await axios.post(
    url,
    { number, text },
    {
      headers: {
        "Content-Type": "application/json",
        apikey: env.EVOLUTION_API_KEY,
      },
      timeout: 15000,
    },
  );

  // Evolution returns the created message with a key.id
  const id =
    res.data?.key?.id ??
    res.data?.messageId ??
    `wa_${Date.now()}`;
  return String(id);
}
