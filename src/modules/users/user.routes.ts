import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

const usersResponseSchema = z.object({
  ok: z.boolean(),
});

export const userRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", {
    schema: {
      tags: ["Users"],
      summary: "GetUsers",
      response: {
        200: usersResponseSchema,
      },
    },
    handler: async () => ({ ok: true }),
  });
};
