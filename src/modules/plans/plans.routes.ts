import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";

const idParamsSchema = z.object({
  id: z.string().min(1),
});

const planRecordSchema = z.object({
  id: z.string().min(1),
  professionalId: z.string().nullable(),
  name: z.string().min(1),
  description: z.string().min(1),
  price: z.number().nonnegative(),
  features: z.array(z.string().min(1)),
  stripePlanId: z.string().nullable(),
});

const planListResponseSchema = z.object({
  items: z.array(planRecordSchema),
});

const planResponseSchema = z.object({
  plan: planRecordSchema,
});

const notFoundResponseSchema = z.object({
  message: z.string(),
});

const deleteResponseSchema = z.object({
  ok: z.boolean(),
});

const planBodySchema = z.object({
  professionalId: z.string().min(1).optional(),
  name: z.string().min(1),
  description: z.string().min(1),
  price: z.number().nonnegative(),
  features: z.array(z.string().min(1)).min(1),
  stripePlanId: z.string().min(1).optional(),
});

const updatePlanBodySchema = planBodySchema.partial().extend({
  professionalId: z.string().min(1).optional(),
  stripePlanId: z.string().min(1).optional(),
});

type PlanRecord = z.infer<typeof planRecordSchema>;

function toPlanRecord(plan: {
  id: string;
  professionalId: string | null;
  name: string;
  description: string;
  price: number;
  features: string[];
  stripePlanId: string | null;
}): PlanRecord {
  return plan;
}

export const planRoutes: FastifyPluginAsync = async (app) => {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.get(
    "/",
    {
      schema: {
        tags: ["Plans"],
        summary: "List plans",
        response: {
          200: planListResponseSchema,
        },
      },
    },
    async () => {
      const plans = await prisma.plan.findMany({
        orderBy: {
          createdAt: "desc",
        },
        select: {
          id: true,
          professionalId: true,
          name: true,
          description: true,
          price: true,
          features: true,
          stripePlanId: true,
        },
      });

      return {
        items: plans.map(toPlanRecord),
      };
    },
  );

  typedApp.get(
    "/:id",
    {
      schema: {
        tags: ["Plans"],
        summary: "Get plan by id",
        params: idParamsSchema,
        response: {
          200: planResponseSchema,
          404: notFoundResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const plan = await prisma.plan.findUnique({
        where: {
          id: request.params.id,
        },
        select: {
          id: true,
          professionalId: true,
          name: true,
          description: true,
          price: true,
          features: true,
          stripePlanId: true,
        },
      });

      if (!plan) {
        return reply.code(404).send({ message: "Plan not found" });
      }

      return {
        plan: toPlanRecord(plan),
      };
    },
  );

  typedApp.post(
    "/",
    {
      schema: {
        tags: ["Plans"],
        summary: "Create plan",
        body: planBodySchema,
        response: {
          201: planResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const plan = await prisma.plan.create({
        data: {
          ...(request.body.professionalId !== undefined
            ? { professionalId: request.body.professionalId }
            : {}),
          name: request.body.name,
          description: request.body.description,
          price: request.body.price,
          features: request.body.features,
          ...(request.body.stripePlanId !== undefined
            ? { stripePlanId: request.body.stripePlanId }
            : {}),
        },
        select: {
          id: true,
          professionalId: true,
          name: true,
          description: true,
          price: true,
          features: true,
          stripePlanId: true,
        },
      });

      return reply.code(201).send({
        plan: toPlanRecord(plan),
      });
    },
  );

  typedApp.patch(
    "/:id",
    {
      schema: {
        tags: ["Plans"],
        summary: "Update plan",
        params: idParamsSchema,
        body: updatePlanBodySchema,
        response: {
          200: planResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const plan = await prisma.plan.update({
        where: {
          id: request.params.id,
        },
        data: {
          ...(request.body.professionalId !== undefined
            ? { professionalId: request.body.professionalId }
            : {}),
          ...(request.body.name !== undefined ? { name: request.body.name } : {}),
          ...(request.body.description !== undefined
            ? { description: request.body.description }
            : {}),
          ...(request.body.price !== undefined ? { price: request.body.price } : {}),
          ...(request.body.features !== undefined
            ? { features: request.body.features }
            : {}),
          ...(request.body.stripePlanId !== undefined
            ? { stripePlanId: request.body.stripePlanId }
            : {}),
        },
        select: {
          id: true,
          professionalId: true,
          name: true,
          description: true,
          price: true,
          features: true,
          stripePlanId: true,
        },
      });

      return reply.code(200).send({
        plan: toPlanRecord(plan),
      });
    },
  );

  typedApp.delete(
    "/:id",
    {
      schema: {
        tags: ["Plans"],
        summary: "Delete plan",
        params: idParamsSchema,
        response: {
          200: deleteResponseSchema,
        },
      },
    },
    async (request, reply) => {
      await prisma.plan.delete({
        where: {
          id: request.params.id,
        },
      });

      return reply.code(200).send({ ok: true });
    },
  );
};
