import type { Server as IOServer } from "socket.io";

let io: IOServer | null = null;

export function setIO(server: IOServer) {
  io = server;
}

export function getIO(): IOServer | null {
  return io;
}

/** Emitted whenever a new message (inbound or outbound) is persisted. */
export function emitNewMessage(payload: unknown) {
  io?.emit("new_message", payload);
}

/** Emitted whenever a conversation's metadata changes (status, tags, etc). */
export function emitConversationUpdated(payload: unknown) {
  io?.emit("conversation_updated", payload);
}

/** Emitted when an inbound message is classified HIGH urgency. */
export function emitEscalationNeeded(payload: unknown) {
  io?.emit("escalation_needed", payload);
}

/** Emitted when Evolution pushes a refreshed WhatsApp QR code. */
export function emitWhatsAppQr(payload: unknown) {
  io?.emit("whatsapp_qr", payload);
}

/** Emitted when the WhatsApp connection state changes (open/connecting/close). */
export function emitWhatsAppStatus(payload: unknown) {
  io?.emit("whatsapp_status", payload);
}
