import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { verifyCredentials, getUserById } from "../services/auth.js";

const loginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function authRoutes(app: FastifyInstance) {
  app.post("/auth/login", async (request, reply) => {
    const parsed = loginBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid request body" });
    }
    const user = await verifyCredentials(
      parsed.data.email,
      parsed.data.password,
    );
    if (!user) {
      return reply.code(401).send({ error: "Invalid credentials" });
    }
    const token = await reply.jwtSign(
      { id: user.id, email: user.email, role: user.role },
      { expiresIn: "7d" },
    );
    return { token, user };
  });

  app.get(
    "/auth/me",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const user = await getUserById(request.user.id);
      if (!user) return reply.code(404).send({ error: "User not found" });
      return { user };
    },
  );
}
