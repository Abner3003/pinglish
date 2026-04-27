import { z } from "zod";

export const onboardingUserPayloadSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  email: z.email(),
  phone: z.string().min(1),
  planId: z.string().nullable(),
});

export const onboardingUserChannelPayloadSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  status: z.enum(["OPT_IN", "OPT_OUT", "ONBOARDING", "OTHER"]),
  onboardingStep: z.number().int().min(1).max(5),
});

export const userCreatedEventSchema = z.object({
  eventId: z.string().min(1),
  type: z.literal("user.created"),
  occurredAt: z.string().datetime(),
  user: onboardingUserPayloadSchema,
  userChannel: onboardingUserChannelPayloadSchema,
});

export type UserCreatedEvent = z.infer<typeof userCreatedEventSchema>;

export function getUserCreatedEventId(userId: string): string {
  return `user.created:${userId}`;
}

