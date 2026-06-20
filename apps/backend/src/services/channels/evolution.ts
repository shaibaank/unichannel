import axios from "axios";
import { env } from "../../env.js";

const api = axios.create({
  baseURL: env.EVOLUTION_API_URL,
  headers: { apikey: env.EVOLUTION_API_KEY, "Content-Type": "application/json" },
  timeout: 20000,
  // Don't throw on 4xx — we inspect status codes ourselves.
  validateStatus: () => true,
});

const INSTANCE = env.EVOLUTION_INSTANCE_NAME;

/**
 * Webhook URL Evolution should call. Inside Docker the backend is reachable
 * via host.docker.internal (dev) or the `backend` service name (full compose).
 */
function webhookUrl() {
  return env.WHATSAPP_WEBHOOK_URL;
}

const WEBHOOK_EVENTS = [
  "MESSAGES_UPSERT",
  "QRCODE_UPDATED",
  "CONNECTION_UPDATE",
];

export type WhatsAppState = "open" | "connecting" | "close" | "unknown";

export interface WhatsAppStatus {
  instance: string;
  state: WhatsAppState;
  exists: boolean;
}

export interface ConnectResult {
  state: WhatsAppState;
  qr: string | null; // data:image/png;base64,... when pairing
  pairingCode: string | null;
}

async function instanceExists(): Promise<boolean> {
  const res = await api.get(`/instance/fetchInstances?instanceName=${INSTANCE}`);
  if (res.status >= 400) return false;
  const list = Array.isArray(res.data) ? res.data : [res.data];
  return list.some(
    (i: { name?: string; instanceName?: string }) =>
      i?.name === INSTANCE || i?.instanceName === INSTANCE,
  );
}

export async function getWhatsAppStatus(): Promise<WhatsAppStatus> {
  const res = await api.get(`/instance/connectionState/${INSTANCE}`);
  if (res.status >= 400) {
    return { instance: INSTANCE, state: "unknown", exists: false };
  }
  const state: WhatsAppState = res.data?.instance?.state ?? "unknown";
  return { instance: INSTANCE, state, exists: true };
}

async function createInstance(): Promise<void> {
  await api.post("/instance/create", {
    instanceName: INSTANCE,
    integration: "WHATSAPP-BAILEYS",
    qrcode: true,
    webhook: {
      url: webhookUrl(),
      byEvents: false,
      base64: true,
      events: WEBHOOK_EVENTS,
    },
  });
}

async function ensureWebhook(): Promise<void> {
  // Make sure the webhook (and events) are configured even if the instance
  // was created earlier without them.
  await api.post(`/webhook/set/${INSTANCE}`, {
    webhook: {
      enabled: true,
      url: webhookUrl(),
      byEvents: false,
      base64: true,
      events: WEBHOOK_EVENTS,
    },
  });
}

/**
 * Ensures the instance exists, (re)configures its webhook, and returns a fresh
 * QR code for pairing (or state "open" if already connected).
 */
export async function connectWhatsApp(): Promise<ConnectResult> {
  const exists = await instanceExists();
  if (!exists) {
    await createInstance();
  } else {
    await ensureWebhook().catch(() => undefined);
  }

  const res = await api.get(`/instance/connect/${INSTANCE}`);
  const data = res.data ?? {};

  // Already connected.
  if (data?.instance?.state === "open") {
    return { state: "open", qr: null, pairingCode: null };
  }

  const qr: string | null = data.base64 ?? data.qrcode?.base64 ?? null;
  const pairingCode: string | null =
    data.pairingCode ?? data.qrcode?.pairingCode ?? null;

  return { state: "connecting", qr, pairingCode };
}

export async function logoutWhatsApp(): Promise<void> {
  await api.delete(`/instance/logout/${INSTANCE}`);
}
