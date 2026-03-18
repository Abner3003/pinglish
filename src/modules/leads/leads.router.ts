import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  signupBodySchema,
  signupResponseSchema,
  patchSignupBodySchema,
  patchSignupResponseSchema,
} from "./leads.schemas.js";
import { leadsService } from "./leads.module.js";

export const leadsRoutes: FastifyPluginAsync = async (app) => {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.post(
    "/signup",
    {
      schema: {
        tags: ["signup"],
        summary: "Sign up a new user",
        body: signupBodySchema,
        response: {
          200: signupResponseSchema,
        },
      },
    },
    async (request, reply) => {
      await leadsService.create({
        name: request.body.name,
        email: request.body.email,
        phone: request.body.phone,
        focus: request.body.focus,
        interests: request.body.goals,
        acceptedTermsAt: new Date(),
    });

      return reply.code(200).send({ ok: true });
    }
  );

  typedApp.patch(
    "/signup",
    {
      schema: {
        tags: ["signup"],
        summary: "Patch an existing signup",
        body: patchSignupBodySchema,
        response: {
          200: patchSignupResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const body = request.body;

      await leadsService.patch(body);

      return reply.code(200).send({ ok: true });
    }
  );
};