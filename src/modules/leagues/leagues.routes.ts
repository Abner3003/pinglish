import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";

const idParamsSchema = z.object({
  id: z.string().min(1),
});

const leagueRankSchema = z.enum(["D", "C", "B", "A", "S", "SS"]);

const leagueRecordSchema = z.object({
  id: z.string().min(1),
  rank: leagueRankSchema,
  xpTotalMin: z.number().int().nonnegative(),
  xpTotalMax: z.number().int().nonnegative().nullable(),
  xpInRank: z.number().int().nonnegative().nullable(),
  equivalentActionsApprox: z.number().int().nonnegative().nullable(),
});

const leagueListResponseSchema = z.object({
  items: z.array(leagueRecordSchema),
});

const leagueResponseSchema = z.object({
  league: leagueRecordSchema,
});

const notFoundResponseSchema = z.object({
  message: z.string(),
});

const deleteResponseSchema = z.object({
  ok: z.boolean(),
});

const leagueBodySchema = z.object({
  rank: leagueRankSchema,
  xpTotalMin: z.number().int().nonnegative(),
  xpTotalMax: z.number().int().nonnegative().nullable().optional(),
  xpInRank: z.number().int().nonnegative().nullable(),
  equivalentActionsApprox: z.number().int().nonnegative().nullable().optional(),
});

const updateLeagueBodySchema = leagueBodySchema.partial();

type LeagueRecord = z.infer<typeof leagueRecordSchema>;

function toLeagueRecord(league: {
  id: string;
  rank: "D" | "C" | "B" | "A" | "S" | "SS";
  xpTotalMin: number;
  xpTotalMax: number | null;
  xpInRank: number | null;
  equivalentActionsApprox: number | null;
}): LeagueRecord {
  return league;
}

export const leagueRoutes: FastifyPluginAsync = async (app) => {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.get(
    "/",
    {
      schema: {
        tags: ["Leagues"],
        summary: "List leagues",
        response: {
          200: leagueListResponseSchema,
        },
      },
    },
    async () => {
      const leagues = await prisma.league.findMany({
        orderBy: {
          xpTotalMin: "asc",
        },
        select: {
          id: true,
          rank: true,
          xpTotalMin: true,
          xpTotalMax: true,
          xpInRank: true,
          equivalentActionsApprox: true,
        },
      });

      return {
        items: leagues.map(toLeagueRecord),
      };
    },
  );

  typedApp.get(
    "/:id",
    {
      schema: {
        tags: ["Leagues"],
        summary: "Get league by id",
        params: idParamsSchema,
        response: {
          200: leagueResponseSchema,
          404: notFoundResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const league = await prisma.league.findUnique({
        where: {
          id: request.params.id,
        },
        select: {
          id: true,
          rank: true,
          xpTotalMin: true,
          xpTotalMax: true,
          xpInRank: true,
          equivalentActionsApprox: true,
        },
      });

      if (!league) {
        return reply.code(404).send({ message: "League not found" });
      }

      return {
        league: toLeagueRecord(league),
      };
    },
  );

  typedApp.post(
    "/",
    {
      schema: {
        tags: ["Leagues"],
        summary: "Create league",
        body: leagueBodySchema,
        response: {
          201: leagueResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const league = await prisma.league.create({
        data: {
          rank: request.body.rank,
          xpTotalMin: request.body.xpTotalMin,
          xpTotalMax: request.body.xpTotalMax ?? null,
          xpInRank: request.body.xpInRank,
          equivalentActionsApprox:
            request.body.equivalentActionsApprox ?? null,
        },
        select: {
          id: true,
          rank: true,
          xpTotalMin: true,
          xpTotalMax: true,
          xpInRank: true,
          equivalentActionsApprox: true,
        },
      });

      return reply.code(201).send({
        league: toLeagueRecord(league),
      });
    },
  );

  typedApp.patch(
    "/:id",
    {
      schema: {
        tags: ["Leagues"],
        summary: "Update league",
        params: idParamsSchema,
        body: updateLeagueBodySchema,
        response: {
          200: leagueResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const league = await prisma.league.update({
        where: {
          id: request.params.id,
        },
        data: {
          ...(request.body.rank !== undefined ? { rank: request.body.rank } : {}),
          ...(request.body.xpTotalMin !== undefined
            ? { xpTotalMin: request.body.xpTotalMin }
            : {}),
          ...(request.body.xpTotalMax !== undefined
            ? { xpTotalMax: request.body.xpTotalMax }
            : {}),
          ...(request.body.xpInRank !== undefined
            ? { xpInRank: request.body.xpInRank }
            : {}),
          ...(request.body.equivalentActionsApprox !== undefined
            ? { equivalentActionsApprox: request.body.equivalentActionsApprox }
            : {}),
        },
        select: {
          id: true,
          rank: true,
          xpTotalMin: true,
          xpTotalMax: true,
          xpInRank: true,
          equivalentActionsApprox: true,
        },
      });

      return reply.code(200).send({
        league: toLeagueRecord(league),
      });
    },
  );

  typedApp.delete(
    "/:id",
    {
      schema: {
        tags: ["Leagues"],
        summary: "Delete league",
        params: idParamsSchema,
        response: {
          200: deleteResponseSchema,
        },
      },
    },
    async (request) => {
      await prisma.league.delete({
        where: {
          id: request.params.id,
        },
      });

      return {
        ok: true,
      };
    },
  );
};
