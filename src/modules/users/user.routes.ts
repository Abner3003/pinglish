import type { FastifyPluginAsync } from "fastify";

export const userRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", {
    schema: {
      tags: ["Users"],
      summary: "GetUsers",
      response: {
        200: {
          type: "object",
          properties: { ok: { type: "boolean" } },
        },
      },
    },
    handler: async () => ({ ok: true }),
  });
};
