import type { FastifyInstance } from "fastify";
import {
  getWhatsAppStatus,
  connectWhatsApp,
  logoutWhatsApp,
} from "../services/channels/evolution.js";

export async function channelRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get("/channels/whatsapp/status", async (_req, reply) => {
    try {
      return await getWhatsAppStatus();
    } catch (err) {
      return reply
        .code(502)
        .send({ error: (err as Error).message ?? "Evolution API unreachable" });
    }
  });

  app.post("/channels/whatsapp/connect", async (_req, reply) => {
    try {
      return await connectWhatsApp();
    } catch (err) {
      return reply
        .code(502)
        .send({ error: (err as Error).message ?? "Failed to connect WhatsApp" });
    }
  });

  app.post("/channels/whatsapp/logout", async (_req, reply) => {
    try {
      await logoutWhatsApp();
      return { ok: true };
    } catch (err) {
      return reply
        .code(502)
        .send({ error: (err as Error).message ?? "Failed to log out" });
    }
  });
}
