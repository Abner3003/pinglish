import type { FastifyPluginAsync } from "fastify";

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/default", {
    schema: {
      tags: ["Default"],
      summary: "Default route",
      response: {
        200: {
          type: "object",
          properties: {
            ok: { type: "boolean" },
            service: { type: "string" },
          },
        },
      },
    },
    handler: async () => ({
      ok: true,
      service: "pinglish-api",
    }),
  });

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
