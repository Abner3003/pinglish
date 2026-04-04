import { z } from "zod";

function normalizeBrazilPhone(phone: string): string {
  const cleaned = phone.replace(/[^\d+]/g, "");
  const digits = cleaned.startsWith("+") ? cleaned.slice(1) : cleaned;

  if (digits.length === 10 || digits.length === 11) {
    return `+55${digits}`;
  }

  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    return `+${digits}`;
  }

  return cleaned.startsWith("+") ? cleaned : `+${digits}`;
}

function isSupportedBrazilPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, "");

  return (
    digits.length === 10 ||
    digits.length === 11 ||
    (digits.startsWith("55") && (digits.length === 12 || digits.length === 13))
  );
}

const phoneSchema = z
  .string()
  .trim()
  .refine(isSupportedBrazilPhone, {
    message: "phone must be a valid Brazilian phone number",
  })
  .transform(normalizeBrazilPhone);

const professionalSchema = z.object({
  name: z.string().min(1),
  email: z.email(),
  phone: phoneSchema,
});

export const portalAccessBodySchema = z.object({
  name: z.string().min(1),
  email: z.email(),
  phone: phoneSchema,
  couponCode: z.string().trim().min(1).optional(),
  professional: professionalSchema.optional(),
});

export const portalAccessResponseSchema = z.object({
  ok: z.boolean(),
});

export const signupBodySchema = z.object({
  name: z.string().min(1),
  email: z.email(),
  focus: z.string().min(1),
  consent: z.boolean(),
  phone: phoneSchema,
  goals: z.string().min(2).array().min(1),
  professional: professionalSchema.optional(),
});

export const signupResponseSchema = z.object({
  ok: z.boolean(),
});

export const patchSignupBodySchema = z.object({
  name: z.string().min(1),
  email: z.email(),
  focus: z.string().min(1),
  consent: z.boolean(),
  phone: phoneSchema,
  goals: z.string().min(2).array().min(1),
  professional: professionalSchema.optional(),
});

export const patchSignupResponseSchema = z.object({
  ok: z.boolean(),
});

export type SignupBody = z.infer<typeof signupBodySchema>;
export type SignupResponse = z.infer<typeof signupResponseSchema>;
export type PatchSignupBody = z.infer<typeof patchSignupBodySchema>;
export type PatchSignupResponse = z.infer<typeof patchSignupResponseSchema>;
export type PortalAccessBody = z.infer<typeof portalAccessBodySchema>;
export type PortalAccessResponse = z.infer<typeof portalAccessResponseSchema>;
