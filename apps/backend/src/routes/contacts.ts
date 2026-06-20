import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { listContacts } from "../services/contacts.js";

const listQuery = z.object({
  page: z.coerce.number().optional(),
  pageSize: z.coerce.number().optional(),
  search: z.string().optional(),
});

export async function contactRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get("/contacts", async (request, reply) => {
    const parsed = listQuery.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid query parameters" });
    }
    return listContacts(parsed.data);
  });
}
