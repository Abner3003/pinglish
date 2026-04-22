import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";

const idParamsSchema = z.object({
  id: z.string().min(1),
});

const kycProfessionalRecordSchema = z.object({
  id: z.string().min(1),
  professionalId: z.string().min(1),
  document: z.string().min(1),
  city: z.string().min(1),
  state: z.string().min(1),
  age: z.number().int().positive(),
});

const kycProfessionalListResponseSchema = z.object({
  items: z.array(kycProfessionalRecordSchema),
});

const kycProfessionalResponseSchema = z.object({
  kycProfessional: kycProfessionalRecordSchema,
});

const notFoundResponseSchema = z.object({
  message: z.string(),
});

const deleteResponseSchema = z.object({
  ok: z.boolean(),
});

const kycProfessionalBodySchema = z.object({
  professionalId: z.string().min(1),
  document: z.string().min(1),
  city: z.string().min(1),
  state: z.string().min(1),
  age: z.number().int().positive(),
});

const updateKycProfessionalBodySchema = kycProfessionalBodySchema.partial().extend({
  professionalId: z.string().min(1).optional(),
});

type KycProfessionalRecord = z.infer<typeof kycProfessionalRecordSchema>;

function toKycProfessionalRecord(kycProfessional: {
  id: string;
  professionalId: string;
  document: string;
  city: string;
  state: string;
  age: number;
}): KycProfessionalRecord {
  return kycProfessional;
}

export const kycProfessionalRoutes: FastifyPluginAsync = async (app) => {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.get(
    "/",
    {
      schema: {
        tags: ["KycProfessionals"],
        summary: "List professional kyc records",
        response: {
          200: kycProfessionalListResponseSchema,
        },
      },
    },
    async () => {
      const records = await prisma.kycProfessional.findMany({
        orderBy: {
          createdAt: "desc",
        },
        select: {
          id: true,
          professionalId: true,
          document: true,
          city: true,
          state: true,
          age: true,
        },
      });

      return {
        items: records.map(toKycProfessionalRecord),
      };
    },
  );

  typedApp.get(
    "/:id",
    {
      schema: {
        tags: ["KycProfessionals"],
        summary: "Get professional kyc by id",
        params: idParamsSchema,
        response: {
          200: kycProfessionalResponseSchema,
          404: notFoundResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const kycProfessional = await prisma.kycProfessional.findUnique({
        where: {
          id: request.params.id,
        },
        select: {
          id: true,
          professionalId: true,
          document: true,
          city: true,
          state: true,
          age: true,
        },
      });

      if (!kycProfessional) {
        return reply.code(404).send({ message: "KycProfessional not found" });
      }

      return {
        kycProfessional: toKycProfessionalRecord(kycProfessional),
      };
    },
  );

  typedApp.post(
    "/",
    {
      schema: {
        tags: ["KycProfessionals"],
        summary: "Create professional kyc record",
        body: kycProfessionalBodySchema,
        response: {
          201: kycProfessionalResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const data = {
        professionalId: request.body.professionalId,
        document: request.body.document,
        city: request.body.city,
        state: request.body.state,
        age: request.body.age,
      };

      const kycProfessional = await prisma.kycProfessional.create({
        data,
        select: {
          id: true,
          professionalId: true,
          document: true,
          city: true,
          state: true,
          age: true,
        },
      });

      return reply.code(201).send({
        kycProfessional: toKycProfessionalRecord(kycProfessional),
      });
    },
  );

  typedApp.patch(
    "/:id",
    {
      schema: {
        tags: ["KycProfessionals"],
        summary: "Update professional kyc record",
        params: idParamsSchema,
        body: updateKycProfessionalBodySchema,
        response: {
          200: kycProfessionalResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const data = {
        ...(request.body.professionalId !== undefined
          ? { professionalId: request.body.professionalId }
          : {}),
        ...(request.body.document !== undefined ? { document: request.body.document } : {}),
        ...(request.body.city !== undefined ? { city: request.body.city } : {}),
        ...(request.body.state !== undefined ? { state: request.body.state } : {}),
        ...(request.body.age !== undefined ? { age: request.body.age } : {}),
      };

      const kycProfessional = await prisma.kycProfessional.update({
        where: {
          id: request.params.id,
        },
        data,
        select: {
          id: true,
          professionalId: true,
          document: true,
          city: true,
          state: true,
          age: true,
        },
      });

      return reply.code(200).send({
        kycProfessional: toKycProfessionalRecord(kycProfessional),
      });
    },
  );

  typedApp.delete(
    "/:id",
    {
      schema: {
        tags: ["KycProfessionals"],
        summary: "Delete professional kyc record",
        params: idParamsSchema,
        response: {
          200: deleteResponseSchema,
        },
      },
    },
    async (request, reply) => {
      await prisma.kycProfessional.delete({
        where: {
          id: request.params.id,
        },
      });

      return reply.code(200).send({ ok: true });
    },
  );
};
