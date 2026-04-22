import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";

const idParamsSchema = z.object({
  id: z.string().min(1),
});

const statusSchema = z.enum(["NEW", "LEARNING", "REVIEW", "MASTERED", "SUSPENDED"]);

const recordSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  itemId: z.string().min(1),
  status: statusSchema,
  easeFactor: z.number(),
  intervalDays: z.number().int().nonnegative(),
  repetitionCount: z.number().int().nonnegative(),
  lastReviewedAt: z.string().datetime().nullable(),
  nextReviewAt: z.string().datetime().nullable(),
  lapses: z.number().int().nonnegative(),
  consecutiveCorrect: z.number().int().nonnegative(),
  consecutiveWrong: z.number().int().nonnegative(),
  masteryScore: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const listResponseSchema = z.object({
  items: z.array(recordSchema),
});

const responseSchema = z.object({
  userLearningState: recordSchema,
});

const notFoundResponseSchema = z.object({
  message: z.string(),
});

const deleteResponseSchema = z.object({
  ok: z.boolean(),
});

const bodySchema = z.object({
  userId: z.string().min(1),
  itemId: z.string().min(1),
  status: statusSchema.default("NEW"),
  easeFactor: z.number().min(1).default(2.5),
  intervalDays: z.number().int().nonnegative().default(0),
  repetitionCount: z.number().int().nonnegative().default(0),
  lastReviewedAt: z.coerce.date().optional().nullable(),
  nextReviewAt: z.coerce.date().optional().nullable(),
  lapses: z.number().int().nonnegative().default(0),
  consecutiveCorrect: z.number().int().nonnegative().default(0),
  consecutiveWrong: z.number().int().nonnegative().default(0),
  masteryScore: z.number().int().nonnegative().default(0),
});

const updateBodySchema = bodySchema.partial();

function toRecord(state: {
  id: string;
  userId: string;
  itemId: string;
  status: "NEW" | "LEARNING" | "REVIEW" | "MASTERED" | "SUSPENDED";
  easeFactor: number;
  intervalDays: number;
  repetitionCount: number;
  lastReviewedAt: Date | null;
  nextReviewAt: Date | null;
  lapses: number;
  consecutiveCorrect: number;
  consecutiveWrong: number;
  masteryScore: number;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: state.id,
    userId: state.userId,
    itemId: state.itemId,
    status: state.status,
    easeFactor: state.easeFactor,
    intervalDays: state.intervalDays,
    repetitionCount: state.repetitionCount,
    lastReviewedAt: state.lastReviewedAt?.toISOString() ?? null,
    nextReviewAt: state.nextReviewAt?.toISOString() ?? null,
    lapses: state.lapses,
    consecutiveCorrect: state.consecutiveCorrect,
    consecutiveWrong: state.consecutiveWrong,
    masteryScore: state.masteryScore,
    createdAt: state.createdAt.toISOString(),
    updatedAt: state.updatedAt.toISOString(),
  };
}

export const userLearningStateRoutes: FastifyPluginAsync = async (app) => {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.get("/", {
    schema: {
      tags: ["UserLearningStates"],
      summary: "List user learning states",
      response: { 200: listResponseSchema },
    },
  }, async () => {
    const items = await prisma.userLearningState.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        userId: true,
        itemId: true,
        status: true,
        easeFactor: true,
        intervalDays: true,
        repetitionCount: true,
        lastReviewedAt: true,
        nextReviewAt: true,
        lapses: true,
        consecutiveCorrect: true,
        consecutiveWrong: true,
        masteryScore: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return { items: items.map(toRecord) };
  });

  typedApp.get("/:id", {
    schema: {
      tags: ["UserLearningStates"],
      summary: "Get user learning state by id",
      params: idParamsSchema,
      response: { 200: responseSchema, 404: notFoundResponseSchema },
    },
  }, async (request, reply) => {
    const state = await prisma.userLearningState.findUnique({
      where: { id: request.params.id },
      select: {
        id: true,
        userId: true,
        itemId: true,
        status: true,
        easeFactor: true,
        intervalDays: true,
        repetitionCount: true,
        lastReviewedAt: true,
        nextReviewAt: true,
        lapses: true,
        consecutiveCorrect: true,
        consecutiveWrong: true,
        masteryScore: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!state) return reply.code(404).send({ message: "UserLearningState not found" });
    return { userLearningState: toRecord(state) };
  });

  typedApp.post("/", {
    schema: {
      tags: ["UserLearningStates"],
      summary: "Create user learning state",
      body: bodySchema,
      response: { 201: responseSchema },
    },
  }, async (request, reply) => {
    const state = await prisma.userLearningState.create({
      data: {
        userId: request.body.userId,
        itemId: request.body.itemId,
        status: request.body.status,
        easeFactor: request.body.easeFactor,
        intervalDays: request.body.intervalDays,
        repetitionCount: request.body.repetitionCount,
        lastReviewedAt: request.body.lastReviewedAt ?? null,
        nextReviewAt: request.body.nextReviewAt ?? null,
        lapses: request.body.lapses,
        consecutiveCorrect: request.body.consecutiveCorrect,
        consecutiveWrong: request.body.consecutiveWrong,
        masteryScore: request.body.masteryScore,
      },
      select: {
        id: true,
        userId: true,
        itemId: true,
        status: true,
        easeFactor: true,
        intervalDays: true,
        repetitionCount: true,
        lastReviewedAt: true,
        nextReviewAt: true,
        lapses: true,
        consecutiveCorrect: true,
        consecutiveWrong: true,
        masteryScore: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return reply.code(201).send({ userLearningState: toRecord(state) });
  });

  typedApp.patch("/:id", {
    schema: {
      tags: ["UserLearningStates"],
      summary: "Update user learning state",
      params: idParamsSchema,
      body: updateBodySchema,
      response: { 200: responseSchema },
    },
  }, async (request, reply) => {
    const state = await prisma.userLearningState.update({
      where: { id: request.params.id },
      data: {
        ...(request.body.userId !== undefined ? { userId: request.body.userId } : {}),
        ...(request.body.itemId !== undefined ? { itemId: request.body.itemId } : {}),
        ...(request.body.status !== undefined ? { status: request.body.status } : {}),
        ...(request.body.easeFactor !== undefined ? { easeFactor: request.body.easeFactor } : {}),
        ...(request.body.intervalDays !== undefined ? { intervalDays: request.body.intervalDays } : {}),
        ...(request.body.repetitionCount !== undefined ? { repetitionCount: request.body.repetitionCount } : {}),
        ...(request.body.lastReviewedAt !== undefined ? { lastReviewedAt: request.body.lastReviewedAt } : {}),
        ...(request.body.nextReviewAt !== undefined ? { nextReviewAt: request.body.nextReviewAt } : {}),
        ...(request.body.lapses !== undefined ? { lapses: request.body.lapses } : {}),
        ...(request.body.consecutiveCorrect !== undefined ? { consecutiveCorrect: request.body.consecutiveCorrect } : {}),
        ...(request.body.consecutiveWrong !== undefined ? { consecutiveWrong: request.body.consecutiveWrong } : {}),
        ...(request.body.masteryScore !== undefined ? { masteryScore: request.body.masteryScore } : {}),
      },
      select: {
        id: true,
        userId: true,
        itemId: true,
        status: true,
        easeFactor: true,
        intervalDays: true,
        repetitionCount: true,
        lastReviewedAt: true,
        nextReviewAt: true,
        lapses: true,
        consecutiveCorrect: true,
        consecutiveWrong: true,
        masteryScore: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return reply.code(200).send({ userLearningState: toRecord(state) });
  });

  typedApp.delete("/:id", {
    schema: {
      tags: ["UserLearningStates"],
      summary: "Delete user learning state",
      params: idParamsSchema,
      response: { 200: deleteResponseSchema },
    },
  }, async (request, reply) => {
    await prisma.userLearningState.delete({ where: { id: request.params.id } });
    return reply.code(200).send({ ok: true });
  });
};
