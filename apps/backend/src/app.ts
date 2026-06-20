import Fastify from "fastify";
import cors from "@fastify/cors";
import formbody from "@fastify/formbody";
import multipart from "@fastify/multipart";
import { env } from "./env.js";
import authPlugin from "./plugins/auth.js";
import { authRoutes } from "./routes/auth.js";
import { conversationRoutes } from "./routes/conversations.js";
import { contactRoutes } from "./routes/contacts.js";
import { settingsRoutes } from "./routes/settings.js";
import { webhookRoutes } from "./routes/webhooks.js";
import { channelRoutes } from "./routes/channels.js";

export async function buildApp() {
  const app = Fastify({
    logger:
      env.NODE_ENV === "production"
        ? true
        : {
            transport: {
              target: "pino-pretty",
              options: { translateTime: "HH:MM:ss", ignore: "pid,hostname" },
            },
          },
    bodyLimit: 10 * 1024 * 1024,
  });

  await app.register(cors, {
    origin: env.CORS_ORIGIN === "*" ? true : env.CORS_ORIGIN.split(","),
    credentials: true,
  });
  await app.register(formbody); // Twilio sends x-www-form-urlencoded
  await app.register(multipart); // media uploads
  await app.register(authPlugin);

  app.get("/health", async () => ({ status: "ok" }));

  await app.register(authRoutes);
  await app.register(conversationRoutes);
  await app.register(contactRoutes);
  await app.register(settingsRoutes);
  await app.register(webhookRoutes);
  await app.register(channelRoutes);

  return app;
}
