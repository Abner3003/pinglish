import { prisma } from "../../lib/prisma.js";
import type { LeadResponseEventPayload } from "./twilio.events.js";

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

type CreateLeadResponseInput = {
  phone: string;
  content: string;
  externalFrom: string;
  channel: string;
  direction: string;
};

export class TwilioRepository {
  async createInboundLeadResponse(
    input: CreateLeadResponseInput,
  ): Promise<
    | { kind: "saved"; response: LeadResponseEventPayload }
    | { kind: "lead-not-found" }
  > {
    const lead = await prisma.lead.findFirst({
      where: {
        phone: normalizeBrazilPhone(input.phone),
      },
      select: {
        id: true,
      },
    });

    if (!lead) {
      return { kind: "lead-not-found" };
    }

    const response = await prisma.leadResponse.create({
      data: {
        leadId: lead.id,
        direction: input.direction,
        channel: input.channel,
        content: input.content,
        externalFrom: normalizeBrazilPhone(input.externalFrom),
      },
    });

    return { kind: "saved", response };
  }
}
