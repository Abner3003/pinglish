import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";

const idParamsSchema = z.object({
  id: z.string().min(1),
});

const couponRecordSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  discount: z.number().nonnegative(),
  validUntil: z.string().datetime(),
  quantity: z.number().int().nonnegative(),
});

const couponListResponseSchema = z.object({
  items: z.array(couponRecordSchema),
});

const couponResponseSchema = z.object({
  coupon: couponRecordSchema,
});

const notFoundResponseSchema = z.object({
  message: z.string(),
});

const deleteResponseSchema = z.object({
  ok: z.boolean(),
});

const couponBodySchema = z.object({
  name: z.string().min(1),
  discount: z.number().nonnegative(),
  validUntil: z.coerce.date(),
  quantity: z.number().int().nonnegative(),
});

const updateCouponBodySchema = couponBodySchema.partial();

type CouponRecord = z.infer<typeof couponRecordSchema>;

function toCouponRecord(coupon: {
  id: string;
  name: string;
  discount: number;
  validUntil: Date;
  quantity: number;
}): CouponRecord {
  return {
    id: coupon.id,
    name: coupon.name,
    discount: coupon.discount,
    validUntil: coupon.validUntil.toISOString(),
    quantity: coupon.quantity,
  };
}

export const couponRoutes: FastifyPluginAsync = async (app) => {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.get(
    "/",
    {
      schema: {
        tags: ["Coupons"],
        summary: "List coupons",
        response: {
          200: couponListResponseSchema,
        },
      },
    },
    async () => {
      const coupons = await prisma.coupon.findMany({
        orderBy: {
          createdAt: "desc",
        },
        select: {
          id: true,
          name: true,
          discount: true,
          validUntil: true,
          quantity: true,
        },
      });

      return {
        items: coupons.map(toCouponRecord),
      };
    },
  );

  typedApp.get(
    "/:id",
    {
      schema: {
        tags: ["Coupons"],
        summary: "Get coupon by id",
        params: idParamsSchema,
        response: {
          200: couponResponseSchema,
          404: notFoundResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const coupon = await prisma.coupon.findUnique({
        where: {
          id: request.params.id,
        },
        select: {
          id: true,
          name: true,
          discount: true,
          validUntil: true,
          quantity: true,
        },
      });

      if (!coupon) {
        return reply.code(404).send({ message: "Coupon not found" });
      }

      return {
        coupon: toCouponRecord(coupon),
      };
    },
  );

  typedApp.post(
    "/",
    {
      schema: {
        tags: ["Coupons"],
        summary: "Create coupon",
        body: couponBodySchema,
        response: {
          201: couponResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const coupon = await prisma.coupon.create({
        data: {
          name: request.body.name,
          discount: request.body.discount,
          validUntil: request.body.validUntil,
          quantity: request.body.quantity,
        },
        select: {
          id: true,
          name: true,
          discount: true,
          validUntil: true,
          quantity: true,
        },
      });

      return reply.code(201).send({
        coupon: toCouponRecord(coupon),
      });
    },
  );

  typedApp.patch(
    "/:id",
    {
      schema: {
        tags: ["Coupons"],
        summary: "Update coupon",
        params: idParamsSchema,
        body: updateCouponBodySchema,
        response: {
          200: couponResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const coupon = await prisma.coupon.update({
        where: {
          id: request.params.id,
        },
        data: {
          ...(request.body.name !== undefined ? { name: request.body.name } : {}),
          ...(request.body.discount !== undefined
            ? { discount: request.body.discount }
            : {}),
          ...(request.body.validUntil !== undefined
            ? { validUntil: request.body.validUntil }
            : {}),
          ...(request.body.quantity !== undefined
            ? { quantity: request.body.quantity }
            : {}),
        },
        select: {
          id: true,
          name: true,
          discount: true,
          validUntil: true,
          quantity: true,
        },
      });

      return reply.code(200).send({
        coupon: toCouponRecord(coupon),
      });
    },
  );

  typedApp.delete(
    "/:id",
    {
      schema: {
        tags: ["Coupons"],
        summary: "Delete coupon",
        params: idParamsSchema,
        response: {
          200: deleteResponseSchema,
        },
      },
    },
    async (request, reply) => {
      await prisma.coupon.delete({
        where: {
          id: request.params.id,
        },
      });

      return reply.code(200).send({ ok: true });
    },
  );
};
