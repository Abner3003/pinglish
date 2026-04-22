import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { phoneSchema } from "../shared/phone.js";

const idParamsSchema = z.object({
  id: z.string().min(1),
});

const professionalRecordSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  document: z.string().nullable(),
  phone: z.string().min(1),
  email: z.email(),
  businessName: z.string().nullable(),
  planId: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  age: z.number().int().nullable(),
});

const professionalListResponseSchema = z.object({
  items: z.array(professionalRecordSchema),
});

const professionalResponseSchema = z.object({
  professional: professionalRecordSchema,
});

const notFoundResponseSchema = z.object({
  message: z.string(),
});

const deleteResponseSchema = z.object({
  ok: z.boolean(),
});

const createProfessionalBodySchema = z.object({
  name: z.string().min(1),
  document: z.string().min(1).optional(),
  phone: phoneSchema,
  email: z.email(),
  businessName: z.string().min(1).optional(),
  planId: z.string().min(1).optional(),
  city: z.string().min(1).optional(),
  state: z.string().min(1).optional(),
  age: z.number().int().positive().optional(),
});

const updateProfessionalBodySchema = createProfessionalBodySchema.partial().extend({
  email: z.email().optional(),
  phone: phoneSchema.optional(),
});

type ProfessionalRecord = z.infer<typeof professionalRecordSchema>;

function toProfessionalRecord(professional: {
  id: string;
  name: string;
  document: string | null;
  phone: string;
  email: string;
  businessName: string | null;
  planId: string | null;
  city: string | null;
  state: string | null;
  age: number | null;
}): ProfessionalRecord {
  return professional;
}

export const professionalRoutes: FastifyPluginAsync = async (app) => {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.get(
    "/",
    {
      schema: {
        tags: ["Professionals"],
        summary: "List professionals",
        response: {
          200: professionalListResponseSchema,
        },
      },
    },
    async () => {
      const professionals = await prisma.professional.findMany({
        orderBy: {
          createdAt: "desc",
        },
        select: {
          id: true,
          name: true,
          document: true,
          phone: true,
          email: true,
          businessName: true,
          planId: true,
          city: true,
          state: true,
          age: true,
        },
      });

      return {
        items: professionals.map(toProfessionalRecord),
      };
    },
  );

  typedApp.get(
    "/:id",
    {
      schema: {
        tags: ["Professionals"],
        summary: "Get professional by id",
        params: idParamsSchema,
        response: {
          200: professionalResponseSchema,
          404: notFoundResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const professional = await prisma.professional.findUnique({
        where: {
          id: request.params.id,
        },
        select: {
          id: true,
          name: true,
          document: true,
          phone: true,
          email: true,
          businessName: true,
          planId: true,
          city: true,
          state: true,
          age: true,
        },
      });

      if (!professional) {
        return reply.code(404).send({ message: "Professional not found" });
      }

      return {
        professional: toProfessionalRecord(professional),
      };
    },
  );

  typedApp.post(
    "/",
    {
      schema: {
        tags: ["Professionals"],
        summary: "Create professional",
        body: createProfessionalBodySchema,
        response: {
          201: professionalResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const data = {
        name: request.body.name,
        phone: request.body.phone,
        email: request.body.email,
        ...(request.body.document !== undefined ? { document: request.body.document } : {}),
        ...(request.body.businessName !== undefined ? { businessName: request.body.businessName } : {}),
        ...(request.body.planId !== undefined ? { planId: request.body.planId } : {}),
        ...(request.body.city !== undefined ? { city: request.body.city } : {}),
        ...(request.body.state !== undefined ? { state: request.body.state } : {}),
        ...(request.body.age !== undefined ? { age: request.body.age } : {}),
      };

      const professional = await prisma.professional.create({
        data,
        select: {
          id: true,
          name: true,
          document: true,
          phone: true,
          email: true,
          businessName: true,
          planId: true,
          city: true,
          state: true,
          age: true,
        },
      });

      return reply.code(201).send({
        professional: toProfessionalRecord(professional),
      });
    },
  );

  typedApp.patch(
    "/:id",
    {
      schema: {
        tags: ["Professionals"],
        summary: "Update professional",
        params: idParamsSchema,
        body: updateProfessionalBodySchema,
        response: {
          200: professionalResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const data = {
        ...(request.body.name !== undefined ? { name: request.body.name } : {}),
        ...(request.body.document !== undefined ? { document: request.body.document } : {}),
        ...(request.body.phone !== undefined ? { phone: request.body.phone } : {}),
        ...(request.body.email !== undefined ? { email: request.body.email } : {}),
        ...(request.body.businessName !== undefined ? { businessName: request.body.businessName } : {}),
        ...(request.body.planId !== undefined ? { planId: request.body.planId } : {}),
        ...(request.body.city !== undefined ? { city: request.body.city } : {}),
        ...(request.body.state !== undefined ? { state: request.body.state } : {}),
        ...(request.body.age !== undefined ? { age: request.body.age } : {}),
      };

      const professional = await prisma.professional.update({
        where: {
          id: request.params.id,
        },
        data,
        select: {
          id: true,
          name: true,
          document: true,
          phone: true,
          email: true,
          businessName: true,
          planId: true,
          city: true,
          state: true,
          age: true,
        },
      });

      return reply.code(200).send({
        professional: toProfessionalRecord(professional),
      });
    },
  );

  typedApp.delete(
    "/:id",
    {
      schema: {
        tags: ["Professionals"],
        summary: "Delete professional",
        params: idParamsSchema,
        response: {
          200: deleteResponseSchema,
        },
      },
    },
    async (request, reply) => {
      await prisma.professional.delete({
        where: {
          id: request.params.id,
        },
      });

      return reply.code(200).send({ ok: true });
    },
  );
};
