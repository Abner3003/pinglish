import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";

const idParamsSchema = z.object({
  id: z.string().min(1),
});

const userChannelStatusSchema = z.preprocess(
  (value) => (typeof value === "string" ? value.trim().toUpperCase() : value),
  z.enum(["OPT_IN", "OPT_OUT", "ONBOARDING", "OTHER"]),
);

const userChannelRecordSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  status: z.enum(["OPT_IN", "OPT_OUT", "ONBOARDING", "OTHER"]),
  onboardingStep: z.number().int().min(1).max(6),
});

const userChannelListResponseSchema = z.object({
  items: z.array(userChannelRecordSchema),
});

const userChannelResponseSchema = z.object({
  userChannel: userChannelRecordSchema,
});

const notFoundResponseSchema = z.object({
  message: z.string(),
});

const deleteResponseSchema = z.object({
  ok: z.boolean(),
});

const userChannelBodySchema = z.object({
  userId: z.string().min(1),
  status: userChannelStatusSchema,
  onboardingStep: z.number().int().min(1).max(6),
});

const updateUserChannelBodySchema = userChannelBodySchema.partial().extend({
  userId: z.string().min(1).optional(),
});

type UserChannelRecord = z.infer<typeof userChannelRecordSchema>;

function toUserChannelRecord(userChannel: {
  id: string;
  userId: string;
  status: "OPT_IN" | "OPT_OUT" | "ONBOARDING" | "OTHER";
  onboardingStep: number;
}): UserChannelRecord {
  return userChannel;
}

export const userChannelRoutes: FastifyPluginAsync = async (app) => {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.get(
    "/",
    {
      schema: {
        tags: ["UserChannels"],
        summary: "List user channels",
        response: {
          200: userChannelListResponseSchema,
        },
      },
    },
    async () => {
      const channels = await prisma.userChannel.findMany({
        orderBy: {
          createdAt: "desc",
        },
        select: {
          id: true,
          userId: true,
          status: true,
          onboardingStep: true,
        },
      });

      return {
        items: channels.map(toUserChannelRecord),
      };
    },
  );

  typedApp.get(
    "/:id",
    {
      schema: {
        tags: ["UserChannels"],
        summary: "Get user channel by id",
        params: idParamsSchema,
        response: {
          200: userChannelResponseSchema,
          404: notFoundResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userChannel = await prisma.userChannel.findUnique({
        where: {
          id: request.params.id,
        },
        select: {
          id: true,
          userId: true,
          status: true,
          onboardingStep: true,
        },
      });

      if (!userChannel) {
        return reply.code(404).send({ message: "UserChannel not found" });
      }

      return {
        userChannel: toUserChannelRecord(userChannel),
      };
    },
  );

  typedApp.post(
    "/",
    {
      schema: {
        tags: ["UserChannels"],
        summary: "Create user channel",
        body: userChannelBodySchema,
        response: {
          201: userChannelResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const data = {
        userId: request.body.userId,
        status: request.body.status,
        onboardingStep: request.body.onboardingStep,
      };

      const userChannel = await prisma.userChannel.create({
        data,
        select: {
          id: true,
          userId: true,
          status: true,
          onboardingStep: true,
        },
      });

      return reply.code(201).send({
        userChannel: toUserChannelRecord(userChannel),
      });
    },
  );

  typedApp.patch(
    "/:id",
    {
      schema: {
        tags: ["UserChannels"],
        summary: "Update user channel",
        params: idParamsSchema,
        body: updateUserChannelBodySchema,
        response: {
          200: userChannelResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const data = {
        ...(request.body.userId !== undefined ? { userId: request.body.userId } : {}),
        ...(request.body.status !== undefined ? { status: request.body.status } : {}),
        ...(request.body.onboardingStep !== undefined
          ? { onboardingStep: request.body.onboardingStep }
          : {}),
      };

      const userChannel = await prisma.userChannel.update({
        where: {
          id: request.params.id,
        },
        data,
        select: {
          id: true,
          userId: true,
          status: true,
          onboardingStep: true,
        },
      });

      return reply.code(200).send({
        userChannel: toUserChannelRecord(userChannel),
      });
    },
  );

  typedApp.delete(
    "/:id",
    {
      schema: {
        tags: ["UserChannels"],
        summary: "Delete user channel",
        params: idParamsSchema,
        response: {
          200: deleteResponseSchema,
        },
      },
    },
    async (request, reply) => {
      await prisma.userChannel.delete({
        where: {
          id: request.params.id,
        },
      });

      return reply.code(200).send({ ok: true });
    },
  );
};
