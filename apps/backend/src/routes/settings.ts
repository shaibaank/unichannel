import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getSettings, updateSettings } from "../services/settings.js";

const patchBody = z.object({
  autoReplyEnabled: z.boolean().optional(),
  llmSystemPrompt: z.string().min(1).optional(),
  whatsappEnabled: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
  smsEnabled: z.boolean().optional(),
});

export async function settingsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get("/settings", async () => {
    return getSettings();
  });

  app.patch("/settings", async (request, reply) => {
    const parsed = patchBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid request body" });
    }
    return updateSettings(parsed.data);
  });
}
