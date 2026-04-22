import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { Prisma } from "../../generated/prisma/index.js";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { learningEngineService } from "../learning-engine/learning-engine.module.js";
import { studyPackProviderService } from "../study-pack-provider/study-pack-provider.module.js";
import { studyOrchestratorService } from "../study-orchestrator/study-orchestrator.module.js";

const idParamsSchema = z.object({
  id: z.string().min(1),
});

const packRecordSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  date: z.string().datetime(),
  generatedAt: z.string().datetime(),
  nextReviewAt: z.string().datetime().nullable(),
  reviewCount: z.number().int().nonnegative(),
  items: z.unknown(),
  targetXp: z.number().int().nonnegative(),
  completed: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const listResponseSchema = z.object({
  items: z.array(packRecordSchema),
});

const responseSchema = z.object({
  dailyStudyPack: packRecordSchema,
});

const packByUserResponseSchema = z.object({
  packId: z.string().min(1),
  targetXp: z.number().int().nonnegative(),
  studies: z.array(
    z.object({
      itemId: z.string().min(1),
      text: z.string().min(1),
      meaning: z.string().min(1),
      source: z.string().optional(),
      order: z.number().int().nonnegative().optional(),
      type: z.string().optional(),
    }),
  ),
});

const currentStudyContextResponseSchema = z.object({
  userId: z.string().min(1),
  channel: z
    .object({
      status: z.string(),
      awaitingStudyReply: z.boolean(),
      currentPackId: z.string().nullable(),
      currentStudyItemId: z.string().nullable(),
      lastInboundAt: z.string().datetime().nullable(),
      lastOutboundAt: z.string().datetime().nullable(),
    })
    .nullable(),
  pack: z
    .object({
      id: z.string().min(1),
      date: z.string().datetime(),
      generatedAt: z.string().datetime(),
      nextReviewAt: z.string().datetime().nullable(),
      reviewCount: z.number().int().nonnegative(),
      targetXp: z.number().int().nonnegative(),
      completed: z.boolean(),
    })
    .nullable(),
  currentStudyItem: z
    .object({
      itemId: z.string().min(1),
      text: z.string().min(1),
      meaning: z.string().min(1),
      source: z.string().optional(),
      order: z.number().int().nonnegative().optional(),
      type: z.string().optional(),
    })
    .nullable(),
  analysisRequest: z
    .object({
      userId: z.string().min(1),
      packageId: z.string().min(1),
      packItemId: z.string().min(1),
      userResponse: z.string(),
    })
    .nullable(),
});

const notFoundResponseSchema = z.object({
  message: z.string(),
});

const deleteResponseSchema = z.object({
  ok: z.boolean(),
});

const bodySchema = z.object({
  userId: z.string().min(1),
  date: z.coerce.date(),
  generatedAt: z.coerce.date().optional(),
  nextReviewAt: z.coerce.date().optional().nullable(),
  reviewCount: z.number().int().nonnegative().optional(),
  items: z.unknown(),
  targetXp: z.number().int().nonnegative(),
  completed: z.boolean().default(false),
});

const updateBodySchema = bodySchema.partial();

function toRecord(pack: {
  id: string;
  userId: string;
  date: Date;
  generatedAt: Date;
  nextReviewAt: Date | null;
  reviewCount: number;
  items: Prisma.JsonValue;
  targetXp: number;
  completed: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: pack.id,
    userId: pack.userId,
    date: pack.date.toISOString(),
    generatedAt: pack.generatedAt.toISOString(),
    nextReviewAt: pack.nextReviewAt?.toISOString() ?? null,
    reviewCount: pack.reviewCount,
    items: pack.items,
    targetXp: pack.targetXp,
    completed: pack.completed,
    createdAt: pack.createdAt.toISOString(),
    updatedAt: pack.updatedAt.toISOString(),
  };
}

function normalizeUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractStoredStudies(items: Prisma.JsonValue): unknown {
  if (Array.isArray(items)) {
    return items;
  }

  if (isRecord(items) && Array.isArray(items.studies)) {
    return items.studies;
  }

  return items;
}

export const dailyStudyPackRoutes: FastifyPluginAsync = async (app) => {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.get("/", {
    schema: {
      tags: ["DailyStudyPacks"],
      summary: "List daily study packs",
      response: { 200: listResponseSchema },
    },
  }, async () => {
    const items = await prisma.dailyStudyPack.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        userId: true,
        date: true,
        generatedAt: true,
        nextReviewAt: true,
        reviewCount: true,
        items: true,
        targetXp: true,
        completed: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return { items: items.map(toRecord) };
  });

  typedApp.get("/:id", {
    schema: {
      tags: ["DailyStudyPacks"],
      summary: "Get daily study pack by id",
      params: idParamsSchema,
      response: { 200: responseSchema, 404: notFoundResponseSchema },
    },
  }, async (request, reply) => {
    const pack = await prisma.dailyStudyPack.findUnique({
      where: { id: request.params.id },
      select: {
        id: true,
        userId: true,
        date: true,
        generatedAt: true,
        nextReviewAt: true,
        reviewCount: true,
        items: true,
        targetXp: true,
        completed: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!pack) return reply.code(404).send({ message: "DailyStudyPack not found" });

    let resolvedItems = extractStoredStudies(pack.items);

    if (isRecord(pack.items)) {
      const remotePackId = typeof pack.items.remotePackId === "string" ? pack.items.remotePackId : undefined;

      if (remotePackId) {
        const remotePack = await studyPackProviderService.getPackById(remotePackId);

        if (remotePack && remotePack.studies.length > 0) {
          resolvedItems = remotePack.studies;
        }
      }
    }

    return {
      dailyStudyPack: {
        ...toRecord(pack),
        items: resolvedItems,
      },
    };
  });

  typedApp.get(
    "/by-user/:userId/today",
    {
      schema: {
        tags: ["DailyStudyPacks"],
        summary: "Get today study pack by user",
        params: z.object({
          userId: z.string().min(1),
        }),
        response: { 200: packByUserResponseSchema },
      },
    },
    async (request) => {
      const pack = await studyOrchestratorService.getTodayPackForUser(request.params.userId);

      return {
        packId: pack.packId,
        targetXp: pack.targetXp,
        studies: pack.studies,
      };
    },
  );

  typedApp.get(
    "/by-user/:userId/current",
    {
      schema: {
        tags: ["DailyStudyPacks"],
        summary: "Get current study context for user",
        params: z.object({
          userId: z.string().min(1),
        }),
        response: { 200: currentStudyContextResponseSchema },
      },
    },
    async (request) => {
      const context = await studyOrchestratorService.getCurrentStudyContext(request.params.userId);

      return context;
    },
  );

  typedApp.post("/", {
    schema: {
      tags: ["DailyStudyPacks"],
      summary: "Create daily study pack",
      body: bodySchema,
      response: { 201: responseSchema },
    },
  }, async (request, reply) => {
    const pack = await prisma.dailyStudyPack.create({
      data: {
        userId: request.body.userId,
        date: normalizeUtcDay(request.body.date),
        generatedAt: request.body.generatedAt ?? new Date(),
        nextReviewAt: null,
        reviewCount: 0,
        items: request.body.items as Prisma.InputJsonValue,
        targetXp: request.body.targetXp,
        completed: request.body.completed,
      },
      select: {
        id: true,
        userId: true,
        date: true,
        generatedAt: true,
        nextReviewAt: true,
        reviewCount: true,
        items: true,
        targetXp: true,
        completed: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return reply.code(201).send({ dailyStudyPack: toRecord(pack) });
  });

  typedApp.patch("/:id", {
    schema: {
      tags: ["DailyStudyPacks"],
      summary: "Update daily study pack",
      params: idParamsSchema,
      body: updateBodySchema,
      response: { 200: responseSchema },
    },
  }, async (request, reply) => {
    const pack = await prisma.dailyStudyPack.update({
      where: { id: request.params.id },
      data: {
        ...(request.body.userId !== undefined ? { userId: request.body.userId } : {}),
        ...(request.body.date !== undefined ? { date: normalizeUtcDay(request.body.date) } : {}),
        ...(request.body.generatedAt !== undefined ? { generatedAt: request.body.generatedAt } : {}),
        ...(request.body.nextReviewAt !== undefined ? { nextReviewAt: request.body.nextReviewAt } : {}),
        ...(request.body.reviewCount !== undefined ? { reviewCount: request.body.reviewCount } : {}),
        ...(request.body.items !== undefined ? { items: request.body.items as Prisma.InputJsonValue } : {}),
        ...(request.body.targetXp !== undefined ? { targetXp: request.body.targetXp } : {}),
        ...(request.body.completed !== undefined ? { completed: request.body.completed } : {}),
      },
      select: {
        id: true,
        userId: true,
        date: true,
        generatedAt: true,
        nextReviewAt: true,
        reviewCount: true,
        items: true,
        targetXp: true,
        completed: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return reply.code(200).send({ dailyStudyPack: toRecord(pack) });
  });

  typedApp.post(
    "/generate",
    {
      schema: {
        tags: ["DailyStudyPacks"],
        summary: "Generate daily study pack",
        body: z.object({
          userId: z.string().min(1),
          tenantId: z.string().min(1).optional().nullable(),
          date: z.coerce.date().optional(),
        }),
        response: {
          201: responseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await learningEngineService.generateDailyStudyPack({
        userId: request.body.userId,
        tenantId: request.body.tenantId ?? null,
        date: request.body.date ?? new Date(),
      });

      return reply.code(201).send({
        dailyStudyPack: toRecord(result.pack),
      });
    },
  );

  typedApp.delete("/:id", {
    schema: {
      tags: ["DailyStudyPacks"],
      summary: "Delete daily study pack",
      params: idParamsSchema,
      response: { 200: deleteResponseSchema },
    },
  }, async (request, reply) => {
    await prisma.dailyStudyPack.delete({ where: { id: request.params.id } });
    return reply.code(200).send({ ok: true });
  });
};
