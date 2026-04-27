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

const callbackQuerySchema = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
  wabaId: z.string().optional(),
  phoneNumberId: z.string().optional(),
  businessAccountId: z.string().optional(),
  displayPhoneNumber: z.string().optional(),
});

const finishEmbeddedSignupBodySchema = z.object({
  code: z.string().min(1).optional(),
  state: z.string().optional(),
  wabaId: z.string().min(1).optional(),
  phoneNumberId: z.string().min(1).optional(),
  businessAccountId: z.string().min(1).optional(),
  displayPhoneNumber: z.string().min(1).optional(),
  verifyToken: z.string().min(1).optional(),
  accessToken: z.string().min(1).optional(),
  appId: z.string().min(1).optional(),
  metadata: z.unknown().optional(),
});

const connectNumberBodySchema = z.object({
  wabaId: z.string().min(1).optional(),
  phoneNumberId: z.string().min(1).optional(),
  accessToken: z.string().min(1).optional(),
  pin: z.string().min(1).optional(),
});

export const metaWhatsAppRoutes: FastifyPluginAsync = async (app) => {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  const handleWebhookVerification = async (
    request: { query: z.infer<typeof verifyQuerySchema> },
    reply: { code: (status: number) => { send: (body: string) => unknown }; type: (contentType: string) => { send: (body: string) => unknown } },
  ) => {
    const mode = request.query["hub.mode"];
    const token = request.query["hub.verify_token"];
    const challenge = request.query["hub.challenge"];
    const configuredTokens = [env.WHATSAPP_VERIFY_TOKEN, env.META_WHATSAPP_VERIFY_TOKEN].filter(
      (value): value is string => Boolean(value),
    );

    if (mode !== "subscribe") {
      return reply.code(400).send("Invalid hub.mode");
    }

    if (configuredTokens.length === 0) {
      return reply.code(500).send("Webhook verify token is not configured");
    }

    if (!token || !configuredTokens.includes(token)) {
      return reply.code(403).send("Verification token mismatch");
    }

    return reply.type("text/plain; charset=utf-8").send(challenge ?? "");
  };

  typedApp.get(
    "/webhooks/whatsapp",
    {
      schema: {
        tags: ["Meta WhatsApp"],
        summary: "Verify WhatsApp webhook",
        querystring: verifyQuerySchema,
      },
    },
    handleWebhookVerification,
  );

  typedApp.get(
    "/webhook",
    {
      schema: {
        tags: ["Meta WhatsApp"],
        summary: "Verify WhatsApp webhook",
        querystring: verifyQuerySchema,
      },
    },
    handleWebhookVerification,
  );

  typedApp.post(
    "/webhooks/whatsapp",
    {
      schema: {
        tags: ["Meta WhatsApp"],
        summary: "Incoming WhatsApp webhook",
        response: {
          200: webhookResponseSchema,
        },
      },
    },
    async (request, reply) => {
      void metaWhatsAppService.handleWebhook(request.body).catch((error) => {
        app.log.error({ error }, "[meta-whatsapp] webhook processing failed");
      });

      return reply.code(200).send({ ok: true });
    },
  );

  typedApp.post(
    "/webhooks/whatsapp/connect-number",
    {
      schema: {
        tags: ["Meta WhatsApp"],
        summary: "Connect WhatsApp number",
        body: connectNumberBodySchema,
      },
    },
    async (request) => {
      const result = await metaWhatsAppService.connectNumber({
        wabaId: request.body.wabaId,
        phoneNumberId: request.body.phoneNumberId,
        accessToken: request.body.accessToken,
        pin: request.body.pin,
      });

      return result;
    },
  );

  typedApp.get(
    "/integrations/whatsapp/callback",
    {
      schema: {
        tags: ["Meta WhatsApp"],
        summary: "Embedded signup callback",
        querystring: callbackQuerySchema,
      },
    },
    async (request, reply) => {
      const payload = {
        type: "WA_EMBEDDED_SIGNUP",
        event: request.query.error ? "ERROR" : "FINISH",
        code: request.query.code ?? null,
        state: request.query.state ?? null,
        error: request.query.error ?? null,
        error_description: request.query.error_description ?? null,
        wabaId: request.query.wabaId ?? null,
        phoneNumberId: request.query.phoneNumberId ?? null,
        businessAccountId: request.query.businessAccountId ?? null,
        displayPhoneNumber: request.query.displayPhoneNumber ?? null,
      };

      return reply
        .type("text/html; charset=utf-8")
        .send(`<!doctype html>
<html>
  <body>
    <script>
      (function () {
        const payload = ${JSON.stringify(payload)};
        if (window.opener) {
          window.opener.postMessage(payload, "*");
        }
        document.body.innerText = "WhatsApp embedded signup callback received.";
        setTimeout(function () { window.close(); }, 500);
      })();
    </script>
  </body>
</html>`);
    },
  );

  typedApp.post(
    "/integrations/whatsapp/finish-embedded-signup",
    {
      schema: {
        tags: ["Meta WhatsApp"],
        summary: "Finish embedded signup",
        body: finishEmbeddedSignupBodySchema,
      },
    },
    async (request) => {
      const code = request.body.code ?? null;
      let accessToken = request.body.accessToken ?? null;
      let tokenExchangeRaw: unknown = null;

      if (!code && !accessToken) {
        return {
          ok: false,
          error: "Either code or accessToken must be provided",
        };
      }

      if (!accessToken && code) {
        const tokenExchange = await metaWhatsAppService.exchangeEmbeddedSignupCode({
          code,
        });
        accessToken = tokenExchange.accessToken;
        tokenExchangeRaw = tokenExchange.raw;
      }

      const integration = await metaWhatsAppService.saveEmbeddedSignup({
        code,
        state: request.body.state ?? null,
        appId: request.body.appId ?? env.META_WHATSAPP_APP_ID ?? null,
        accessToken,
        businessAccountId: request.body.businessAccountId ?? null,
        wabaId: request.body.wabaId ?? null,
        phoneNumberId: request.body.phoneNumberId ?? null,
        displayPhoneNumber: request.body.displayPhoneNumber ?? null,
        verifyToken: request.body.verifyToken ?? env.META_WHATSAPP_VERIFY_TOKEN ?? env.WHATSAPP_VERIFY_TOKEN ?? null,
        metadata: {
          tokenExchange: tokenExchangeRaw,
          callbackPayload: request.body.metadata ?? null,
        },
      });

      return {
        ok: true,
        integration,
      };
    },
  );
};
