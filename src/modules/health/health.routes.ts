import type { FastifyPluginAsync } from "fastify";

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/health", {
    schema: {
      tags: ["Health"],
      summary: "Healthcheck",
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