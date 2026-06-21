import { Server as IOServer } from "socket.io";
import { env } from "./env.js";
import { buildApp } from "./app.js";
import { setIO } from "./lib/socket.js";
import { startWorker } from "./queue/worker.js";
import { startImapPolling } from "./services/channels/email.js";
import { seedKnowledgeBase } from "./services/rag.js";

async function main() {
  const app = await buildApp();

  // Attach Socket.io to Fastify's underlying HTTP server.
  const io = new IOServer(app.server, {
    cors: {
      origin: env.CORS_ORIGIN === "*" ? true : env.CORS_ORIGIN.split(","),
      credentials: true,
    },
  });
  setIO(io);
  io.on("connection", (socket) => {
    app.log.info(`[socket] client connected: ${socket.id}`);
  });

  // Background workers.
  startWorker((m) => app.log.info(m));
  startImapPolling((m) => app.log.info(m));

  // Seed the RAG knowledge base (non-blocking; embeds the mock KB).
  seedKnowledgeBase((m) => app.log.info(m)).catch((err) =>
    app.log.error(`[rag] seed failed: ${err.message}`),
  );

  await app.listen({ port: env.BACKEND_PORT, host: "0.0.0.0" });
  app.log.info(`OmniInbox backend listening on :${env.BACKEND_PORT}`);
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
