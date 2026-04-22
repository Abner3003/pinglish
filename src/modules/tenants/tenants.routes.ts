import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { Prisma } from "../../generated/prisma/index.js";
import { prisma } from "../../lib/prisma.js";

const idParamsSchema = z.object({
  id: z.string().min(1),
});

const tenantRecordSchema = z.object({
  id: z.string().min(1),
  professionalId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  segment: z.string().min(1),
  educationalApproach: z.unknown(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const tenantListResponseSchema = z.object({
  items: z.array(tenantRecordSchema),
});

const tenantResponseSchema = z.object({
  tenant: tenantRecordSchema,
});

const tenantInfoResponseSchema = z.object({
  tenant: tenantRecordSchema,
  professional: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    email: z.email(),
    phone: z.string().min(1),
  }),
  learningProfilesCount: z.number().int().nonnegative(),
  learningItemsCount: z.number().int().nonnegative(),
});

const notFoundResponseSchema = z.object({
  message: z.string(),
});

const deleteResponseSchema = z.object({
  ok: z.boolean(),
});

const seedItemsResponseSchema = z.object({
  created: z.number().int().nonnegative(),
  skipped: z.boolean(),
});

const tenantBodySchema = z.object({
  professionalId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  segment: z.string().min(1),
  educationalApproach: z.unknown(),
});

const updateTenantBodySchema = tenantBodySchema.partial();

type TenantRecord = z.infer<typeof tenantRecordSchema>;

function toTenantRecord(tenant: {
  id: string;
  professionalId: string;
  name: string;
  description: string;
  segment: string;
  educationalApproach: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
}): TenantRecord {
  return {
    id: tenant.id,
    professionalId: tenant.professionalId,
    name: tenant.name,
    description: tenant.description,
    segment: tenant.segment,
    educationalApproach: tenant.educationalApproach,
    createdAt: tenant.createdAt.toISOString(),
    updatedAt: tenant.updatedAt.toISOString(),
  };
}

export const tenantRoutes: FastifyPluginAsync = async (app) => {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.get(
    "/",
    {
      schema: {
        tags: ["Tenants"],
        summary: "List tenants",
        response: {
          200: tenantListResponseSchema,
        },
      },
    },
    async () => {
      const tenants = await prisma.tenant.findMany({
        orderBy: {
          createdAt: "desc",
        },
        select: {
          id: true,
          professionalId: true,
          name: true,
          description: true,
          segment: true,
          educationalApproach: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return {
        items: tenants.map(toTenantRecord),
      };
    },
  );

  typedApp.get(
    "/:id",
    {
      schema: {
        tags: ["Tenants"],
        summary: "Get tenant by id",
        params: idParamsSchema,
        response: {
          200: tenantResponseSchema,
          404: notFoundResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const tenant = await prisma.tenant.findUnique({
        where: {
          id: request.params.id,
        },
        select: {
          id: true,
          professionalId: true,
          name: true,
          description: true,
          segment: true,
          educationalApproach: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (!tenant) {
        return reply.code(404).send({ message: "Tenant not found" });
      }

      return {
        tenant: toTenantRecord(tenant),
      };
    },
  );

  typedApp.get(
    "/:id/info",
    {
      schema: {
        tags: ["Tenants"],
        summary: "Get tenant info with professional and counters",
        params: idParamsSchema,
        response: {
          200: tenantInfoResponseSchema,
          404: notFoundResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const tenant = await prisma.tenant.findUnique({
        where: {
          id: request.params.id,
        },
        select: {
          id: true,
          professionalId: true,
          name: true,
          description: true,
          segment: true,
          educationalApproach: true,
          createdAt: true,
          updatedAt: true,
          professional: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
            },
          },
          _count: {
            select: {
              learningProfiles: true,
              learningItems: true,
            },
          },
        },
      });

      if (!tenant) {
        return reply.code(404).send({ message: "Tenant not found" });
      }

      return {
        tenant: toTenantRecord(tenant),
        professional: tenant.professional,
        learningProfilesCount: tenant._count.learningProfiles,
        learningItemsCount: tenant._count.learningItems,
      };
    },
  );

  typedApp.post(
    "/",
    {
      schema: {
        tags: ["Tenants"],
        summary: "Create tenant",
        body: tenantBodySchema,
        response: {
          201: tenantResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const data: Prisma.TenantUncheckedCreateInput = {
          professionalId: request.body.professionalId,
          name: request.body.name,
          description: request.body.description,
          segment: request.body.segment,
          educationalApproach:
            request.body.educationalApproach as Prisma.InputJsonValue,
      };

      const tenant = await prisma.tenant.create({
        data,
        select: {
          id: true,
          professionalId: true,
          name: true,
          description: true,
          segment: true,
          educationalApproach: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return reply.code(201).send({
        tenant: toTenantRecord(tenant),
      });
    },
  );

  typedApp.patch(
    "/:id",
    {
      schema: {
        tags: ["Tenants"],
        summary: "Update tenant",
        params: idParamsSchema,
        body: updateTenantBodySchema,
        response: {
          200: tenantResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const data: Prisma.TenantUncheckedUpdateInput = {
        ...(request.body.professionalId !== undefined
          ? { professionalId: request.body.professionalId }
          : {}),
        ...(request.body.name !== undefined ? { name: request.body.name } : {}),
        ...(request.body.description !== undefined
          ? { description: request.body.description }
          : {}),
        ...(request.body.segment !== undefined ? { segment: request.body.segment } : {}),
        ...(request.body.educationalApproach !== undefined
          ? {
              educationalApproach:
                request.body.educationalApproach as Prisma.InputJsonValue,
            }
          : {}),
      };

      const tenant = await prisma.tenant.update({
        where: {
          id: request.params.id,
        },
        data,
        select: {
          id: true,
          professionalId: true,
          name: true,
          description: true,
          segment: true,
          educationalApproach: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return reply.code(200).send({
        tenant: toTenantRecord(tenant),
      });
    },
  );

  typedApp.delete(
    "/:id",
    {
      schema: {
        tags: ["Tenants"],
        summary: "Delete tenant",
        params: idParamsSchema,
        response: {
          200: deleteResponseSchema,
        },
      },
    },
    async (request, reply) => {
      await prisma.tenant.delete({
        where: {
          id: request.params.id,
        },
      });

      return reply.code(200).send({ ok: true });
    },
  );

  typedApp.post(
    "/:id/seed-learning-items",
    {
      schema: {
        tags: ["Tenants"],
        summary: "Seed default learning items for a tenant",
        params: idParamsSchema,
        response: {
          200: seedItemsResponseSchema,
        },
      },
    },
    async (request) => {
      const existingItems = await prisma.learningItem.count({
        where: {
          tenantId: request.params.id,
        },
      });

      if (existingItems > 0) {
        return {
          created: 0,
          skipped: true,
        };
      }

      const seedItems = [
        {
          type: "LEXICAL_CHUNK" as const,
          text: "How are you?",
          meaning: "Como você está?",
          difficulty: 1,
          tags: ["greetings", "daily-conversation"],
          prerequisiteItemIds: [],
          relatedItemIds: [],
          metadata: {
            topic: "greetings",
            context: "daily",
            grammarFocus: "question-form",
          },
        },
        {
          type: "PATTERN" as const,
          text: "I would like to...",
          meaning: "Eu gostaria de...",
          difficulty: 2,
          tags: ["politeness", "requests"],
          prerequisiteItemIds: [],
          relatedItemIds: [],
          metadata: {
            topic: "requests",
            context: "polite-interaction",
            grammarFocus: "would-like",
          },
        },
        {
          type: "EXAMPLE" as const,
          text: "I would like to book a class.",
          meaning: "Eu gostaria de reservar uma aula.",
          difficulty: 2,
          tags: ["education", "booking"],
          prerequisiteItemIds: [],
          relatedItemIds: [],
          metadata: {
            topic: "education",
            context: "booking",
            grammarFocus: "would-like",
          },
        },
        {
          type: "MICRO_LESSON" as const,
          text: "Simple present for routines",
          meaning: "Presente simples para rotinas",
          difficulty: 3,
          tags: ["grammar", "routine"],
          prerequisiteItemIds: [],
          relatedItemIds: [],
          metadata: {
            topic: "grammar",
            context: "daily-routine",
            grammarFocus: "simple-present",
          },
        },
      ];

      const result = await prisma.learningItem.createMany({
        data: seedItems.map((item) => ({
          tenantId: request.params.id,
          type: item.type,
          text: item.text,
          meaning: item.meaning,
          difficulty: item.difficulty,
          tags: item.tags,
          prerequisiteItemIds: item.prerequisiteItemIds,
          relatedItemIds: item.relatedItemIds,
          metadata: item.metadata,
        })),
      });

      return {
        created: result.count,
        skipped: false,
      };
    },
  );
};
