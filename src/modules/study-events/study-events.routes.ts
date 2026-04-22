import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { learningEngineService } from "../learning-engine/learning-engine.module.js";

const idParamsSchema = z.object({
  id: z.string().min(1),
});

const eventTypeSchema = z.enum(["ANSWERED", "REVIEWED", "SKIPPED", "LESSON_COMPLETED"]);

const recordSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  itemId: z.string().min(1),
  packId: z.string().nullable(),
  eventType: eventTypeSchema,
  answerQuality: z.number().int().min(0).max(5).nullable(),
  isCorrect: z.boolean().nullable(),
  xpEarned: z.number().int().nonnegative().nullable(),
  occurredAt: z.string().datetime(),
  createdAt: z.string().datetime(),
});

const listResponseSchema = z.object({
  items: z.array(recordSchema),
});

const responseSchema = z.object({
  studyEvent: recordSchema,
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
  packId: z.string().min(1).optional().nullable(),
  eventType: eventTypeSchema,
  answerQuality: z.number().int().min(0).max(5).optional().nullable(),
  isCorrect: z.boolean().optional().nullable(),
  xpEarned: z.number().int().nonnegative().optional().nullable(),
  occurredAt: z.coerce.date().optional(),
});

const updateBodySchema = bodySchema.partial();

function toRecord(event: {
  id: string;
  userId: string;
  itemId: string;
  packId: string | null;
  eventType: "ANSWERED" | "REVIEWED" | "SKIPPED" | "LESSON_COMPLETED";
  answerQuality: number | null;
  isCorrect: boolean | null;
  xpEarned: number | null;
  occurredAt: Date;
  createdAt: Date;
}) {
  return {
    id: event.id,
    userId: event.userId,
    itemId: event.itemId,
    packId: event.packId,
    eventType: event.eventType,
    answerQuality: event.answerQuality,
    isCorrect: event.isCorrect,
    xpEarned: event.xpEarned,
    occurredAt: event.occurredAt.toISOString(),
    createdAt: event.createdAt.toISOString(),
  };
}

export const studyEventRoutes: FastifyPluginAsync = async (app) => {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.get("/", {
    schema: {
      tags: ["StudyEvents"],
      summary: "List study events",
      response: { 200: listResponseSchema },
    },
  }, async () => {
    const items = await prisma.studyEvent.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        userId: true,
        itemId: true,
        packId: true,
        eventType: true,
        answerQuality: true,
        isCorrect: true,
        xpEarned: true,
        occurredAt: true,
        createdAt: true,
      },
    });

    return { items: items.map(toRecord) };
  });

  typedApp.get("/:id", {
    schema: {
      tags: ["StudyEvents"],
      summary: "Get study event by id",
      params: idParamsSchema,
      response: { 200: responseSchema, 404: notFoundResponseSchema },
    },
  }, async (request, reply) => {
    const event = await prisma.studyEvent.findUnique({
      where: { id: request.params.id },
      select: {
        id: true,
        userId: true,
        itemId: true,
        packId: true,
        eventType: true,
        answerQuality: true,
        isCorrect: true,
        xpEarned: true,
        occurredAt: true,
        createdAt: true,
      },
    });

    if (!event) return reply.code(404).send({ message: "StudyEvent not found" });
    return { studyEvent: toRecord(event) };
  });

  typedApp.post("/", {
    schema: {
      tags: ["StudyEvents"],
      summary: "Create study event",
      body: bodySchema,
      response: { 201: responseSchema },
    },
  }, async (request, reply) => {
    const event = await learningEngineService.recordStudyEvent({
      userId: request.body.userId,
      itemId: request.body.itemId,
      packId: request.body.packId ?? null,
      eventType: request.body.eventType,
      answerQuality: request.body.answerQuality ?? null,
      isCorrect: request.body.isCorrect ?? null,
      xpEarned: request.body.xpEarned ?? null,
      occurredAt: request.body.occurredAt ?? new Date(),
    });

    return reply.code(201).send({ studyEvent: toRecord(event) });
  });

  typedApp.patch("/:id", {
    schema: {
      tags: ["StudyEvents"],
      summary: "Update study event",
      params: idParamsSchema,
      body: updateBodySchema,
      response: { 200: responseSchema },
    },
  }, async (request, reply) => {
    const event = await prisma.studyEvent.update({
      where: { id: request.params.id },
      data: {
        ...(request.body.userId !== undefined ? { userId: request.body.userId } : {}),
        ...(request.body.itemId !== undefined ? { itemId: request.body.itemId } : {}),
        ...(request.body.packId !== undefined ? { packId: request.body.packId } : {}),
        ...(request.body.eventType !== undefined ? { eventType: request.body.eventType } : {}),
        ...(request.body.answerQuality !== undefined ? { answerQuality: request.body.answerQuality } : {}),
        ...(request.body.isCorrect !== undefined ? { isCorrect: request.body.isCorrect } : {}),
        ...(request.body.xpEarned !== undefined ? { xpEarned: request.body.xpEarned } : {}),
        ...(request.body.occurredAt !== undefined ? { occurredAt: request.body.occurredAt } : {}),
      },
      select: {
        id: true,
        userId: true,
        itemId: true,
        packId: true,
        eventType: true,
        answerQuality: true,
        isCorrect: true,
        xpEarned: true,
        occurredAt: true,
        createdAt: true,
      },
    });

    return reply.code(200).send({ studyEvent: toRecord(event) });
  });

  typedApp.delete("/:id", {
    schema: {
      tags: ["StudyEvents"],
      summary: "Delete study event",
      params: idParamsSchema,
      response: { 200: deleteResponseSchema },
    },
  }, async (request, reply) => {
    await prisma.studyEvent.delete({ where: { id: request.params.id } });
    return reply.code(200).send({ ok: true });
  });
};
