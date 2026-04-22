import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { phoneSchema } from "../shared/phone.js";

const onboardingBodySchema = z.object({
  phone: phoneSchema,
  name: z.string().min(1),
  email: z.email(),
  planId: z.string().min(1).optional(),
});

const kycUserBodySchema = z.object({
  userId: z.string().min(1),
  personalPreferences: z.array(z.string().min(1)).min(1),
  language: z.string().min(1),
  languageLevel: z.string().min(1),
  city: z.string().min(1),
  state: z.string().min(1),
  age: z.number().int().positive(),
});

const teacherOnboardingBodySchema = z.object({
  name: z.string().min(1),
  document: z.string().min(1),
  phone: phoneSchema,
  email: z.email(),
  businessName: z.string().min(1),
  planId: z.string().min(1),
  city: z.string().min(1),
  state: z.string().min(1),
  age: z.number().int().positive(),
});

const userRecordSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  email: z.email(),
  phone: z.string().min(1),
  planId: z.string().nullable(),
});

const userChannelRecordSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  status: z.enum(["OPT_IN", "OPT_OUT", "ONBOARDING", "OTHER"]),
  onboardingStep: z.number().int().min(1).max(5),
});

const kycUserRecordSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  personalPreferences: z.array(z.string().min(1)),
  language: z.string().min(1),
  languageLevel: z.string().min(1),
  city: z.string().min(1).nullable(),
  state: z.string().min(1).nullable(),
  age: z.number().int().positive().nullable(),
});

const professionalRecordSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  document: z.string().nullable(),
  phone: z.string().min(1),
  email: z.email(),
  businessName: z.string().nullable(),
  planId: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  age: z.number().int().nullable(),
});

const kycProfessionalRecordSchema = z.object({
  id: z.string().min(1),
  professionalId: z.string().min(1),
  document: z.string().min(1),
  city: z.string().min(1),
  state: z.string().min(1),
  age: z.number().int().positive(),
});

const onboardingResponseSchema = z.object({
  user: userRecordSchema,
  userChannel: userChannelRecordSchema,
});

const kycUserResponseSchema = z.object({
  kycUser: kycUserRecordSchema,
  userChannel: userChannelRecordSchema,
});

const teacherOnboardingResponseSchema = z.object({
  professional: professionalRecordSchema,
  kycProfessional: kycProfessionalRecordSchema,
});

function toUserRecord(user: {
  id: string;
  name: string;
  email: string;
  phone: string;
  planId: string | null;
}) {
  return user;
}

function toUserChannelRecord(userChannel: {
  id: string;
  userId: string;
  status: "OPT_IN" | "OPT_OUT" | "ONBOARDING" | "OTHER";
  onboardingStep: number;
}) {
  return userChannel;
}

function toKycUserRecord(kycUser: {
  id: string;
  userId: string;
  personalPreferences: string[];
  language: string;
  languageLevel: string;
  city: string | null;
  state: string | null;
  age: number | null;
}) {
  return kycUser;
}

function toProfessionalRecord(professional: {
  id: string;
  name: string;
  document: string | null;
  phone: string;
  email: string;
  businessName: string | null;
  planId: string | null;
  city: string | null;
  state: string | null;
  age: number | null;
}) {
  return professional;
}

function toKycProfessionalRecord(kycProfessional: {
  id: string;
  professionalId: string;
  document: string;
  city: string;
  state: string;
  age: number;
}) {
  return kycProfessional;
}

export const onboardingRoutes: FastifyPluginAsync = async (app) => {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.post(
    "/onboarding",
    {
      schema: {
        tags: ["Onboarding"],
        summary: "Create or update user onboarding",
        body: onboardingBodySchema,
        response: {
          201: onboardingResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await prisma.$transaction(async (tx) => {
        const user = await tx.user.upsert({
          where: {
            email: request.body.email,
          },
          update: {
            name: request.body.name,
            phone: request.body.phone,
            ...(request.body.planId !== undefined ? { planId: request.body.planId } : {}),
          },
          create: {
            name: request.body.name,
            email: request.body.email,
            phone: request.body.phone,
            ...(request.body.planId !== undefined ? { planId: request.body.planId } : {}),
          },
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            planId: true,
          },
        });

        const userChannel = await tx.userChannel.upsert({
          where: {
            userId: user.id,
          },
          update: {
            status: "ONBOARDING",
            onboardingStep: 1,
          },
          create: {
            userId: user.id,
            status: "ONBOARDING",
            onboardingStep: 1,
          },
          select: {
            id: true,
            userId: true,
            status: true,
            onboardingStep: true,
          },
        });

        return { user, userChannel };
      });

      return reply.code(201).send({
        user: toUserRecord(result.user),
        userChannel: toUserChannelRecord(result.userChannel),
      });
    },
  );

  typedApp.post(
    "/kyc-user",
    {
      schema: {
        tags: ["Onboarding"],
        summary: "Create or update user kyc",
        body: kycUserBodySchema,
        response: {
          201: kycUserResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await prisma.$transaction(async (tx) => {
        await tx.user.findUniqueOrThrow({
          where: {
            id: request.body.userId,
          },
          select: {
            id: true,
          },
        });

        const kycUser = await tx.kycUser.upsert({
          where: {
            userId: request.body.userId,
          },
          update: {
            personalPreferences: request.body.personalPreferences,
            language: request.body.language,
            languageLevel: request.body.languageLevel,
            city: request.body.city,
            state: request.body.state,
            age: request.body.age,
          },
          create: {
            userId: request.body.userId,
            personalPreferences: request.body.personalPreferences,
            language: request.body.language,
            languageLevel: request.body.languageLevel,
            city: request.body.city,
            state: request.body.state,
            age: request.body.age,
          },
          select: {
            id: true,
            userId: true,
            personalPreferences: true,
            language: true,
            languageLevel: true,
            city: true,
            state: true,
            age: true,
          },
        });

        const userChannel = await tx.userChannel.upsert({
          where: {
            userId: request.body.userId,
          },
          update: {
            status: "ONBOARDING",
            onboardingStep: 2,
          },
          create: {
            userId: request.body.userId,
            status: "ONBOARDING",
            onboardingStep: 2,
          },
          select: {
            id: true,
            userId: true,
            status: true,
            onboardingStep: true,
          },
        });

        return { kycUser, userChannel };
      });

      return reply.code(201).send({
        kycUser: toKycUserRecord(result.kycUser),
        userChannel: toUserChannelRecord(result.userChannel),
      });
    },
  );

  typedApp.post(
    "/teacher-onboarding",
    {
      schema: {
        tags: ["Onboarding"],
        summary: "Create or update teacher onboarding",
        body: teacherOnboardingBodySchema,
        response: {
          201: teacherOnboardingResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await prisma.$transaction(async (tx) => {
        const professional = await tx.professional.upsert({
          where: {
            email: request.body.email,
          },
          update: {
            name: request.body.name,
            phone: request.body.phone,
            document: request.body.document,
            businessName: request.body.businessName,
            planId: request.body.planId,
            city: request.body.city,
            state: request.body.state,
            age: request.body.age,
          },
          create: {
            name: request.body.name,
            email: request.body.email,
            phone: request.body.phone,
            document: request.body.document,
            businessName: request.body.businessName,
            planId: request.body.planId,
            city: request.body.city,
            state: request.body.state,
            age: request.body.age,
          },
          select: {
            id: true,
            name: true,
            document: true,
            phone: true,
            email: true,
            businessName: true,
            planId: true,
            city: true,
            state: true,
            age: true,
          },
        });

        const kycProfessional = await tx.kycProfessional.upsert({
          where: {
            professionalId: professional.id,
          },
          update: {
            document: request.body.document,
            city: request.body.city,
            state: request.body.state,
            age: request.body.age,
          },
          create: {
            professionalId: professional.id,
            document: request.body.document,
            city: request.body.city,
            state: request.body.state,
            age: request.body.age,
          },
          select: {
            id: true,
            professionalId: true,
            document: true,
            city: true,
            state: true,
            age: true,
          },
        });

        return { professional, kycProfessional };
      });

      return reply.code(201).send({
        professional: toProfessionalRecord(result.professional),
        kycProfessional: toKycProfessionalRecord(result.kycProfessional),
      });
    },
  );
};
