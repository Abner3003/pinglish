import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { twilioWebhookService } from "./twilio.module.js";

const defaultRouteResponseSchema = z.object({
  ok: z.boolean(),
  service: z.string(),
});

const twilioWebhookBodySchema = z.object({
  Body: z.string().default(""),
  From: z.string().min(1),
  To: z.string().optional(),
  WaId: z.string().optional(),
  MessageSid: z.string().optional(),
  ProfileName: z.string().optional(),
});

export const TwilioRoutes: FastifyPluginAsync = async (app) => {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  app.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string" },
    (_request, body, done) => {
      const rawBody = typeof body === "string" ? body : body.toString("utf8");
      const params = new URLSearchParams(rawBody);
      const parsed = Object.fromEntries(params.entries());

      done(null, parsed);
    },
  );

  typedApp.post("/webhooks/twilio/whatsapp", {
    schema: {
      tags: ["Default"],
      summary: "Webhook response from whatsApp users",
      body: twilioWebhookBodySchema,
      response: {
        200: defaultRouteResponseSchema,
      },
    },
    handler: async (request) => {
      const result = await twilioWebhookService.receiveInboundMessage({
        phone: request.body.From,
        externalFrom: request.body.From,
        content: request.body.Body,
        channel: "whatsapp",
        direction: "inbound",
      });

      if (result.kind === "lead-not-found") {
        app.log.warn(
          `[twilio-webhook] inbound message ignored because no lead matched phone=${request.body.From}`,
        );
      }

      return {
        ok: true,
        service: "pinglish-api",
      };
    },
  });
};
