import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { env } from "../../config/env.js";
import { metaWhatsAppService } from "./meta-whatsapp.module.js";

const verifyQuerySchema = z.object({
  "hub.mode": z.string().optional(),
  "hub.verify_token": z.string().optional(),
  "hub.challenge": z.string().optional(),
});

const webhookResponseSchema = z.object({
  ok: z.boolean(),
});

export const metaWhatsAppRoutes: FastifyPluginAsync = async (app) => {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.get("/webhook", {
    schema: {
      tags: ["Meta WhatsApp"],
      summary: "Webhook verification endpoint",
      querystring: verifyQuerySchema,
    },
    handler: async (request, reply) => {
      const mode = request.query["hub.mode"];
      const token = request.query["hub.verify_token"];
      const challenge = request.query["hub.challenge"];

      if (mode !== "subscribe") {
        return reply.code(400).send("Invalid hub.mode");
      }

      if (!env.WHATSAPP_VERIFY_TOKEN) {
        return reply.code(500).send("Webhook verify token is not configured");
      }

      if (token !== env.WHATSAPP_VERIFY_TOKEN) {
        return reply.code(403).send("Verification token mismatch");
      }

      return reply.type("text/plain; charset=utf-8").send(challenge ?? "");
    },
  });

  typedApp.post("/webhook", {
    schema: {
      tags: ["Meta WhatsApp"],
      summary: "Incoming WhatsApp webhook",
      response: {
        200: webhookResponseSchema,
      },
    },
    handler: async (request, reply) => {
      void metaWhatsAppService.handleWebhook(request.body).catch((error) => {
        app.log.error({ error }, "[meta-whatsapp] webhook processing failed");
      });

      return reply.code(200).send({ ok: true });
    },
  });
};
