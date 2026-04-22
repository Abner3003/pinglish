import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { phoneSchema } from "../shared/phone.js";

const idParamsSchema = z.object({
  id: z.string().min(1),
});

const userRecordSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  email: z.email(),
  phone: z.string().min(1),
  planId: z.string().nullable(),
});

const userListResponseSchema = z.object({
  items: z.array(userRecordSchema),
});

const userResponseSchema = z.object({
  user: userRecordSchema,
});

const notFoundResponseSchema = z.object({
  message: z.string(),
});

const deleteResponseSchema = z.object({
  ok: z.boolean(),
});

const createUserBodySchema = z.object({
  name: z.string().min(1),
  email: z.email(),
  phone: phoneSchema,
  planId: z.string().min(1).optional(),
});

const updateUserBodySchema = createUserBodySchema.partial().extend({
  email: z.email().optional(),
  phone: phoneSchema.optional(),
});

type UserRecord = z.infer<typeof userRecordSchema>;

function toUserRecord(user: {
  id: string;
  name: string;
  email: string;
  phone: string;
  planId: string | null;
}): UserRecord {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    planId: user.planId,
  };
}

export const userRoutes: FastifyPluginAsync = async (app) => {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.get(
    "/",
    {
      schema: {
        tags: ["Users"],
        summary: "List users",
        response: {
          200: userListResponseSchema,
        },
      },
    },
    async () => {
      const users = await prisma.user.findMany({
        orderBy: {
          createdAt: "desc",
        },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          planId: true,
        },
      });

      return {
        items: users.map(toUserRecord),
      };
    },
  );

  typedApp.get(
    "/:id",
    {
      schema: {
        tags: ["Users"],
        summary: "Get user by id",
        params: idParamsSchema,
        response: {
          200: userResponseSchema,
          404: notFoundResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const user = await prisma.user.findUnique({
        where: {
          id: request.params.id,
        },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          planId: true,
        },
      });

      if (!user) {
        return reply.code(404).send({ message: "User not found" });
      }

      return {
        user: toUserRecord(user),
      };
    },
  );

  typedApp.post(
    "/",
    {
      schema: {
        tags: ["Users"],
        summary: "Create user",
        body: createUserBodySchema,
        response: {
          201: userResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const data = {
        name: request.body.name,
        email: request.body.email,
        phone: request.body.phone,
        ...(request.body.planId !== undefined ? { planId: request.body.planId } : {}),
      };

      const user = await prisma.user.create({
        data,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          planId: true,
        },
      });

      return reply.code(201).send({
        user: toUserRecord(user),
      });
    },
  );

  typedApp.patch(
    "/:id",
    {
      schema: {
        tags: ["Users"],
        summary: "Update user",
        params: idParamsSchema,
        body: updateUserBodySchema,
        response: {
          200: userResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const data = {
        ...(request.body.name !== undefined ? { name: request.body.name } : {}),
        ...(request.body.email !== undefined ? { email: request.body.email } : {}),
        ...(request.body.phone !== undefined ? { phone: request.body.phone } : {}),
        ...(request.body.planId !== undefined ? { planId: request.body.planId } : {}),
      };

      const user = await prisma.user.update({
        where: {
          id: request.params.id,
        },
        data,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          planId: true,
        },
      });

      return reply.code(200).send({
        user: toUserRecord(user),
      });
    },
  );

  typedApp.delete(
    "/:id",
    {
      schema: {
        tags: ["Users"],
        summary: "Delete user",
        params: idParamsSchema,
        response: {
          200: deleteResponseSchema,
        },
      },
    },
    async (request, reply) => {
      await prisma.user.delete({
        where: {
          id: request.params.id,
        },
      });

      return reply.code(200).send({ ok: true });
    },
  );
};
