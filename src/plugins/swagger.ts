import type { FastifyPluginAsync } from "fastify";
import swagger from "@fastify/swagger";
import swaggerUI from "@fastify/swagger-ui";
import fp from "fastify-plugin";
import { jsonSchemaTransform } from "fastify-type-provider-zod";
import { env } from "../config/env.js";

export const swaggerPlugin: FastifyPluginAsync = fp(async (app) => {
  await app.register(swagger, {
    transform: jsonSchemaTransform,
    openapi: {
      info: {
        title: "Pinglish API",
        description: "API docs",
        version: "1.0.0",
      },
      servers: [{ url: "http://localhost:" + env.PORT }],
    },
  });

  await app.register(swaggerUI, {
    routePrefix: "/docs",
  });
});
