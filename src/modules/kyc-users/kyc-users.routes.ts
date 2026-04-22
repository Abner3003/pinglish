import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";

const idParamsSchema = z.object({
  id: z.string().min(1),
});

const kycUserRecordSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  personalPreferences: z.array(z.string().min(1)),
  language: z.string().min(1),
  languageLevel: z.string().min(1),
  city: z.string().min(1),
  state: z.string().min(1),
  age: z.number().int().positive(),
});

const kycUserListResponseSchema = z.object({
  items: z.array(kycUserRecordSchema),
});

const kycUserResponseSchema = z.object({
  kycUser: kycUserRecordSchema,
});

const notFoundResponseSchema = z.object({
  message: z.string(),
});

const deleteResponseSchema = z.object({
  ok: z.boolean(),
});

const kycUserBodySchema = z.object({
  userId: z.string().min(1),
  personalPreferences: z.array(z.string().min(1)).min(1),
  language: z.string().min(1),
  languageLevel: z.string().min(1),
  city: z.string().min(1),
  state: z.string().min(1),
  age: z.number().int().positive(),
});

const updateKycUserBodySchema = kycUserBodySchema.partial().extend({
  userId: z.string().min(1).optional(),
});

type KycUserRecord = z.infer<typeof kycUserRecordSchema>;

function toKycUserRecord(kycUser: {
  id: string;
  userId: string;
  personalPreferences: string[];
  language: string;
  languageLevel: string;
  city: string;
  state: string;
  age: number;
}): KycUserRecord {
  return kycUser;
}

export const kycUserRoutes: FastifyPluginAsync = async (app) => {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.get(
    "/",
    {
      schema: {
        tags: ["KycUsers"],
        summary: "List user kyc records",
        response: {
          200: kycUserListResponseSchema,
        },
      },
    },
    async () => {
      const records = await prisma.kycUser.findMany({
        orderBy: {
          createdAt: "desc",
        },
        select: {
          id: true,
          userId: true,
          personalPreferences: true,
          language: true,
          languageLevel: true,
          city: true,
          state: true,
          age: true,
        },
      });

      return {
        items: records.map(toKycUserRecord),
      };
    },
  );

  typedApp.get(
    "/:id",
    {
      schema: {
        tags: ["KycUsers"],
        summary: "Get user kyc by id",
        params: idParamsSchema,
        response: {
          200: kycUserResponseSchema,
          404: notFoundResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const kycUser = await prisma.kycUser.findUnique({
        where: {
          id: request.params.id,
        },
        select: {
          id: true,
          userId: true,
          personalPreferences: true,
          language: true,
          languageLevel: true,
          city: true,
          state: true,
          age: true,
        },
      });

      if (!kycUser) {
        return reply.code(404).send({ message: "KycUser not found" });
      }

      return {
        kycUser: toKycUserRecord(kycUser),
      };
    },
  );

  typedApp.post(
    "/",
    {
      schema: {
        tags: ["KycUsers"],
        summary: "Create user kyc record",
        body: kycUserBodySchema,
        response: {
          201: kycUserResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const data = {
        userId: request.body.userId,
        personalPreferences: request.body.personalPreferences,
        language: request.body.language,
        languageLevel: request.body.languageLevel,
        city: request.body.city,
        state: request.body.state,
        age: request.body.age,
      };

      const kycUser = await prisma.kycUser.create({
        data,
        select: {
          id: true,
          userId: true,
          personalPreferences: true,
          language: true,
          languageLevel: true,
          city: true,
          state: true,
          age: true,
        },
      });

      return reply.code(201).send({
        kycUser: toKycUserRecord(kycUser),
      });
    },
  );

  typedApp.patch(
    "/:id",
    {
      schema: {
        tags: ["KycUsers"],
        summary: "Update user kyc record",
        params: idParamsSchema,
        body: updateKycUserBodySchema,
        response: {
          200: kycUserResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const data = {
        ...(request.body.userId !== undefined ? { userId: request.body.userId } : {}),
        ...(request.body.personalPreferences !== undefined
          ? { personalPreferences: request.body.personalPreferences }
          : {}),
        ...(request.body.language !== undefined ? { language: request.body.language } : {}),
        ...(request.body.languageLevel !== undefined
          ? { languageLevel: request.body.languageLevel }
          : {}),
        ...(request.body.city !== undefined ? { city: request.body.city } : {}),
        ...(request.body.state !== undefined ? { state: request.body.state } : {}),
        ...(request.body.age !== undefined ? { age: request.body.age } : {}),
      };

      const kycUser = await prisma.kycUser.update({
        where: {
          id: request.params.id,
        },
        data,
        select: {
          id: true,
          userId: true,
          personalPreferences: true,
          language: true,
          languageLevel: true,
          city: true,
          state: true,
          age: true,
        },
      });

      return reply.code(200).send({
        kycUser: toKycUserRecord(kycUser),
      });
    },
  );

  typedApp.delete(
    "/:id",
    {
      schema: {
        tags: ["KycUsers"],
        summary: "Delete user kyc record",
        params: idParamsSchema,
        response: {
          200: deleteResponseSchema,
        },
      },
    },
    async (request, reply) => {
      await prisma.kycUser.delete({
        where: {
          id: request.params.id,
        },
      });

      return reply.code(200).send({ ok: true });
    },
  );
};
