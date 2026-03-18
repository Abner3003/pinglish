import { z } from "zod";

export const signupBodySchema = z.object({
  name: z.string().min(1),
  email: z.email(),
  focus: z.string().min(1),
  consent: z.boolean(),
  phone: z.string().min(9),
  goals: z.string().min(2).array().min(1),
});

export const signupResponseSchema = z.object({
  ok: z.boolean(),
});

export const patchSignupBodySchema = z.object({
  name: z.string().min(1),
  email: z.email(),
  focus: z.string().min(1),
  consent: z.boolean(),
  phone: z.string().min(9),
  goals: z.string().min(2).array().min(1),
});

export const patchSignupResponseSchema = z.object({
  ok: z.boolean(),
});

export type SignupBody = z.infer<typeof signupBodySchema>;
export type SignupResponse = z.infer<typeof signupResponseSchema>;
export type PatchSignupBody = z.infer<typeof patchSignupBodySchema>;
export type PatchSignupResponse = z.infer<typeof patchSignupResponseSchema>;