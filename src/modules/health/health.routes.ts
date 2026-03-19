import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

const defaultRouteResponseSchema = z.object({
  ok: z.boolean(),
  service: z.string(),
});

const healthRouteResponseSchema = z.object({
  ok: z.boolean(),
});

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/default", {
    schema: {
      tags: ["Default"],
      summary: "Default route",
      response: {
        200: defaultRouteResponseSchema,
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
        200: healthRouteResponseSchema,
      },
    },
    handler: async () => ({ ok: true }),
  });
};
