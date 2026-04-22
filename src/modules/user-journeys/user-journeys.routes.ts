import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";

const idParamsSchema = z.object({
  id: z.string().min(1),
});

const userJourneyLevelSchema = z.enum([
  "INICIANTE",
  "PRE_INTERMEDIARIO",
  "INTERMEDIARIO",
  "AVANCADO",
  "PROFICIENTE",
]);

const userJourneyRecordSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  level: userJourneyLevelSchema,
  leagueId: z.string().min(1),
  score: z.number().int().nonnegative(),
  lastUpdatedAt: z.string().datetime(),
  createdAt: z.string().datetime(),
});

const userJourneyListResponseSchema = z.object({
  items: z.array(userJourneyRecordSchema),
});

const userJourneyResponseSchema = z.object({
  userJourney: userJourneyRecordSchema,
});

const notFoundResponseSchema = z.object({
  message: z.string(),
});

const deleteResponseSchema = z.object({
  ok: z.boolean(),
});

const userJourneyBodySchema = z.object({
  userId: z.string().min(1),
  level: userJourneyLevelSchema,
  leagueId: z.string().min(1),
  score: z.number().int().nonnegative().default(0),
});

const updateUserJourneyBodySchema = userJourneyBodySchema.partial();

type UserJourneyRecord = z.infer<typeof userJourneyRecordSchema>;

function toUserJourneyRecord(userJourney: {
  id: string;
  userId: string;
  level: "INICIANTE" | "PRE_INTERMEDIARIO" | "INTERMEDIARIO" | "AVANCADO" | "PROFICIENTE";
  leagueId: string;
  score: number;
  lastUpdatedAt: Date;
  createdAt: Date;
}): UserJourneyRecord {
  return {
    id: userJourney.id,
    userId: userJourney.userId,
    level: userJourney.level,
    leagueId: userJourney.leagueId,
    score: userJourney.score,
    lastUpdatedAt: userJourney.lastUpdatedAt.toISOString(),
    createdAt: userJourney.createdAt.toISOString(),
  };
}

export const userJourneyRoutes: FastifyPluginAsync = async (app) => {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.get(
    "/",
    {
      schema: {
        tags: ["UserJourneys"],
        summary: "List user journeys",
        response: {
          200: userJourneyListResponseSchema,
        },
      },
    },
    async () => {
      const userJourneys = await prisma.userJourney.findMany({
        orderBy: {
          createdAt: "desc",
        },
        select: {
          id: true,
          userId: true,
          level: true,
          leagueId: true,
          score: true,
          lastUpdatedAt: true,
          createdAt: true,
        },
      });

      return {
        items: userJourneys.map(toUserJourneyRecord),
      };
    },
  );

  typedApp.get(
    "/:id",
    {
      schema: {
        tags: ["UserJourneys"],
        summary: "Get user journey by id",
        params: idParamsSchema,
        response: {
          200: userJourneyResponseSchema,
          404: notFoundResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userJourney = await prisma.userJourney.findUnique({
        where: {
          id: request.params.id,
        },
        select: {
          id: true,
          userId: true,
          level: true,
          leagueId: true,
          score: true,
          lastUpdatedAt: true,
          createdAt: true,
        },
      });

      if (!userJourney) {
        return reply.code(404).send({ message: "UserJourney not found" });
      }

      return {
        userJourney: toUserJourneyRecord(userJourney),
      };
    },
  );

  typedApp.post(
    "/",
    {
      schema: {
        tags: ["UserJourneys"],
        summary: "Create user journey",
        body: userJourneyBodySchema,
        response: {
          201: userJourneyResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userJourney = await prisma.userJourney.create({
        data: {
          userId: request.body.userId,
          level: request.body.level,
          leagueId: request.body.leagueId,
          score: request.body.score,
        },
        select: {
          id: true,
          userId: true,
          level: true,
          leagueId: true,
          score: true,
          lastUpdatedAt: true,
          createdAt: true,
        },
      });

      return reply.code(201).send({
        userJourney: toUserJourneyRecord(userJourney),
      });
    },
  );

  typedApp.patch(
    "/:id",
    {
      schema: {
        tags: ["UserJourneys"],
        summary: "Update user journey",
        params: idParamsSchema,
        body: updateUserJourneyBodySchema,
        response: {
          200: userJourneyResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userJourney = await prisma.userJourney.update({
        where: {
          id: request.params.id,
        },
        data: {
          ...(request.body.userId !== undefined ? { userId: request.body.userId } : {}),
          ...(request.body.level !== undefined ? { level: request.body.level } : {}),
          ...(request.body.leagueId !== undefined ? { leagueId: request.body.leagueId } : {}),
          ...(request.body.score !== undefined ? { score: request.body.score } : {}),
        },
        select: {
          id: true,
          userId: true,
          level: true,
          leagueId: true,
          score: true,
          lastUpdatedAt: true,
          createdAt: true,
        },
      });

      return reply.code(200).send({
        userJourney: toUserJourneyRecord(userJourney),
      });
    },
  );

  typedApp.delete(
    "/:id",
    {
      schema: {
        tags: ["UserJourneys"],
        summary: "Delete user journey",
        params: idParamsSchema,
        response: {
          200: deleteResponseSchema,
        },
      },
    },
    async (request, reply) => {
      await prisma.userJourney.delete({
        where: {
          id: request.params.id,
        },
      });

      return reply.code(200).send({ ok: true });
    },
  );
};
