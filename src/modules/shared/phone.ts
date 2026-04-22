import { z } from "zod";

export function normalizeBrazilPhone(phone: string): string {
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

export const phoneSchema = z
  .string()
  .trim()
  .refine(isSupportedBrazilPhone, {
    message: "phone must be a valid Brazilian phone number",
  })
  .transform(normalizeBrazilPhone);
