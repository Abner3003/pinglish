import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { Prisma } from "../../generated/prisma/index.js";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";

const idParamsSchema = z.object({
  id: z.string().min(1),
});

const learningItemTypeSchema = z.enum(["LEXICAL_CHUNK", "PATTERN", "EXAMPLE", "MICRO_LESSON"]);

const learningItemRecordSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  type: learningItemTypeSchema,
  text: z.string().min(1),
  meaning: z.string().min(1),
  difficulty: z.number().int().nonnegative(),
  tags: z.array(z.string().min(1)),
  prerequisiteItemIds: z.array(z.string().min(1)),
  relatedItemIds: z.array(z.string().min(1)),
  metadata: z.unknown(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const listResponseSchema = z.object({
  items: z.array(learningItemRecordSchema),
});

const responseSchema = z.object({
  learningItem: learningItemRecordSchema,
});

const notFoundResponseSchema = z.object({
  message: z.string(),
});

const deleteResponseSchema = z.object({
  ok: z.boolean(),
});

const bodySchema = z.object({
  tenantId: z.string().min(1),
  type: learningItemTypeSchema,
  text: z.string().min(1),
  meaning: z.string().min(1),
  difficulty: z.number().int().nonnegative(),
  tags: z.array(z.string().min(1)),
  prerequisiteItemIds: z.array(z.string().min(1)).default([]),
  relatedItemIds: z.array(z.string().min(1)).default([]),
  metadata: z.unknown(),
});

const updateBodySchema = bodySchema.partial();

function toRecord(item: {
  id: string;
  tenantId: string;
  type: "LEXICAL_CHUNK" | "PATTERN" | "EXAMPLE" | "MICRO_LESSON";
  text: string;
  meaning: string;
  difficulty: number;
  tags: string[];
  prerequisiteItemIds: string[];
  relatedItemIds: string[];
  metadata: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: item.id,
    tenantId: item.tenantId,
    type: item.type,
    text: item.text,
    meaning: item.meaning,
    difficulty: item.difficulty,
    tags: item.tags,
    prerequisiteItemIds: item.prerequisiteItemIds,
    relatedItemIds: item.relatedItemIds,
    metadata: item.metadata,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

export const learningItemsRoutes: FastifyPluginAsync = async (app) => {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.get("/", {
    schema: {
      tags: ["LearningItems"],
      summary: "List learning items",
      response: { 200: listResponseSchema },
    },
  }, async () => {
    const items = await prisma.learningItem.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        tenantId: true,
        type: true,
        text: true,
        meaning: true,
        difficulty: true,
        tags: true,
        prerequisiteItemIds: true,
        relatedItemIds: true,
        metadata: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return { items: items.map(toRecord) };
  });

  typedApp.get("/:id", {
    schema: {
      tags: ["LearningItems"],
      summary: "Get learning item by id",
      params: idParamsSchema,
      response: { 200: responseSchema, 404: notFoundResponseSchema },
    },
  }, async (request, reply) => {
    const item = await prisma.learningItem.findUnique({
      where: { id: request.params.id },
      select: {
        id: true,
        tenantId: true,
        type: true,
        text: true,
        meaning: true,
        difficulty: true,
        tags: true,
        prerequisiteItemIds: true,
        relatedItemIds: true,
        metadata: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!item) return reply.code(404).send({ message: "LearningItem not found" });
    return { learningItem: toRecord(item) };
  });

  typedApp.post("/", {
    schema: {
      tags: ["LearningItems"],
      summary: "Create learning item",
      body: bodySchema,
      response: { 201: responseSchema },
    },
  }, async (request, reply) => {
    const item = await prisma.learningItem.create({
      data: {
        tenantId: request.body.tenantId,
        type: request.body.type,
        text: request.body.text,
        meaning: request.body.meaning,
        difficulty: request.body.difficulty,
        tags: request.body.tags,
        prerequisiteItemIds: request.body.prerequisiteItemIds,
        relatedItemIds: request.body.relatedItemIds,
        metadata: request.body.metadata as Prisma.InputJsonValue,
      },
      select: {
        id: true,
        tenantId: true,
        type: true,
        text: true,
        meaning: true,
        difficulty: true,
        tags: true,
        prerequisiteItemIds: true,
        relatedItemIds: true,
        metadata: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return reply.code(201).send({ learningItem: toRecord(item) });
  });

  typedApp.patch("/:id", {
    schema: {
      tags: ["LearningItems"],
      summary: "Update learning item",
      params: idParamsSchema,
      body: updateBodySchema,
      response: { 200: responseSchema },
    },
  }, async (request, reply) => {
    const item = await prisma.learningItem.update({
      where: { id: request.params.id },
      data: {
        ...(request.body.tenantId !== undefined ? { tenantId: request.body.tenantId } : {}),
        ...(request.body.type !== undefined ? { type: request.body.type } : {}),
        ...(request.body.text !== undefined ? { text: request.body.text } : {}),
        ...(request.body.meaning !== undefined ? { meaning: request.body.meaning } : {}),
        ...(request.body.difficulty !== undefined ? { difficulty: request.body.difficulty } : {}),
        ...(request.body.tags !== undefined ? { tags: request.body.tags } : {}),
        ...(request.body.prerequisiteItemIds !== undefined
          ? { prerequisiteItemIds: request.body.prerequisiteItemIds }
          : {}),
        ...(request.body.relatedItemIds !== undefined
          ? { relatedItemIds: request.body.relatedItemIds }
          : {}),
        ...(request.body.metadata !== undefined
          ? { metadata: request.body.metadata as Prisma.InputJsonValue }
          : {}),
      },
      select: {
        id: true,
        tenantId: true,
        type: true,
        text: true,
        meaning: true,
        difficulty: true,
        tags: true,
        prerequisiteItemIds: true,
        relatedItemIds: true,
        metadata: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return reply.code(200).send({ learningItem: toRecord(item) });
  });

  typedApp.delete("/:id", {
    schema: {
      tags: ["LearningItems"],
      summary: "Delete learning item",
      params: idParamsSchema,
      response: { 200: deleteResponseSchema },
    },
  }, async (request, reply) => {
    await prisma.learningItem.delete({ where: { id: request.params.id } });
    return reply.code(200).send({ ok: true });
  });
};
