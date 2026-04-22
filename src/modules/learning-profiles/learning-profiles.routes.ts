import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { resolveDefaultTenantId } from "../tenants/default-tenant.service.js";

const idParamsSchema = z.object({
  id: z.string().min(1),
});

const learningGoalSchema = z.enum(["TRAVEL", "WORK", "CONVERSATION", "SCHOOL", "OTHER"]);

const learningProfileRecordSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  tenantId: z.string().nullable(),
  timezone: z.string().min(1),
  nativeLanguage: z.string().min(1),
  targetLanguage: z.string().min(1),
  goal: learningGoalSchema,
  interests: z.array(z.string().min(1)),
  profession: z.string().nullable(),
  preferredStudyTime: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const listResponseSchema = z.object({
  items: z.array(learningProfileRecordSchema),
});

const responseSchema = z.object({
  learningProfile: learningProfileRecordSchema,
});

const notFoundResponseSchema = z.object({
  message: z.string(),
});

const deleteResponseSchema = z.object({
  ok: z.boolean(),
});

const bodySchema = z.object({
  userId: z.string().min(1),
  tenantId: z.string().min(1).optional().nullable(),
  timezone: z.string().min(1),
  nativeLanguage: z.string().min(1),
  targetLanguage: z.string().min(1),
  goal: learningGoalSchema,
  interests: z.array(z.string().min(1)),
  profession: z.string().min(1).optional(),
  preferredStudyTime: z.string().min(1).optional(),
});

const updateBodySchema = bodySchema.partial();

function toRecord(profile: {
  id: string;
  userId: string;
  tenantId: string | null;
  timezone: string;
  nativeLanguage: string;
  targetLanguage: string;
  goal: "TRAVEL" | "WORK" | "CONVERSATION" | "SCHOOL" | "OTHER";
  interests: string[];
  profession: string | null;
  preferredStudyTime: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: profile.id,
    userId: profile.userId,
    tenantId: profile.tenantId,
    timezone: profile.timezone,
    nativeLanguage: profile.nativeLanguage,
    targetLanguage: profile.targetLanguage,
    goal: profile.goal,
    interests: profile.interests,
    profession: profile.profession,
    preferredStudyTime: profile.preferredStudyTime,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
  };
}

export const learningProfileRoutes: FastifyPluginAsync = async (app) => {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.get("/", {
    schema: {
      tags: ["LearningProfiles"],
      summary: "List learning profiles",
      response: { 200: listResponseSchema },
    },
  }, async () => {
    const items = await prisma.learningProfile.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        userId: true,
        tenantId: true,
        timezone: true,
        nativeLanguage: true,
        targetLanguage: true,
        goal: true,
        interests: true,
        profession: true,
        preferredStudyTime: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return { items: items.map(toRecord) };
  });

  typedApp.get("/:id", {
    schema: {
      tags: ["LearningProfiles"],
      summary: "Get learning profile by id",
      params: idParamsSchema,
      response: { 200: responseSchema, 404: notFoundResponseSchema },
    },
  }, async (request, reply) => {
    const profile = await prisma.learningProfile.findUnique({
      where: { id: request.params.id },
      select: {
        id: true,
        userId: true,
        tenantId: true,
        timezone: true,
        nativeLanguage: true,
        targetLanguage: true,
        goal: true,
        interests: true,
        profession: true,
        preferredStudyTime: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!profile) return reply.code(404).send({ message: "LearningProfile not found" });
    return { learningProfile: toRecord(profile) };
  });

  typedApp.post("/", {
    schema: {
      tags: ["LearningProfiles"],
      summary: "Create learning profile",
      body: bodySchema,
      response: { 201: responseSchema },
    },
  }, async (request, reply) => {
    const tenantId = request.body.tenantId ?? (await resolveDefaultTenantId());

    const profile = await prisma.learningProfile.create({
      data: {
        userId: request.body.userId,
        ...(tenantId !== null ? { tenantId } : {}),
        timezone: request.body.timezone,
        nativeLanguage: request.body.nativeLanguage,
        targetLanguage: request.body.targetLanguage,
        goal: request.body.goal,
        interests: request.body.interests,
        ...(request.body.profession !== undefined ? { profession: request.body.profession } : {}),
        ...(request.body.preferredStudyTime !== undefined ? { preferredStudyTime: request.body.preferredStudyTime } : {}),
      },
      select: {
        id: true,
        userId: true,
        tenantId: true,
        timezone: true,
        nativeLanguage: true,
        targetLanguage: true,
        goal: true,
        interests: true,
        profession: true,
        preferredStudyTime: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return reply.code(201).send({ learningProfile: toRecord(profile) });
  });

  typedApp.patch("/:id", {
    schema: {
      tags: ["LearningProfiles"],
      summary: "Update learning profile",
      params: idParamsSchema,
      body: updateBodySchema,
      response: { 200: responseSchema },
    },
  }, async (request, reply) => {
    const tenantId =
      request.body.tenantId !== undefined
        ? request.body.tenantId
        : await resolveDefaultTenantId();

    const profile = await prisma.learningProfile.update({
      where: { id: request.params.id },
      data: {
        ...(request.body.userId !== undefined ? { userId: request.body.userId } : {}),
        ...(tenantId !== null ? { tenantId } : {}),
        ...(request.body.timezone !== undefined ? { timezone: request.body.timezone } : {}),
        ...(request.body.nativeLanguage !== undefined ? { nativeLanguage: request.body.nativeLanguage } : {}),
        ...(request.body.targetLanguage !== undefined ? { targetLanguage: request.body.targetLanguage } : {}),
        ...(request.body.goal !== undefined ? { goal: request.body.goal } : {}),
        ...(request.body.interests !== undefined ? { interests: request.body.interests } : {}),
        ...(request.body.profession !== undefined ? { profession: request.body.profession } : {}),
        ...(request.body.preferredStudyTime !== undefined ? { preferredStudyTime: request.body.preferredStudyTime } : {}),
      },
      select: {
        id: true,
        userId: true,
        tenantId: true,
        timezone: true,
        nativeLanguage: true,
        targetLanguage: true,
        goal: true,
        interests: true,
        profession: true,
        preferredStudyTime: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return reply.code(200).send({ learningProfile: toRecord(profile) });
  });

  typedApp.delete("/:id", {
    schema: {
      tags: ["LearningProfiles"],
      summary: "Delete learning profile",
      params: idParamsSchema,
      response: { 200: deleteResponseSchema },
    },
  }, async (request, reply) => {
    await prisma.learningProfile.delete({ where: { id: request.params.id } });
    return reply.code(200).send({ ok: true });
  });
};
