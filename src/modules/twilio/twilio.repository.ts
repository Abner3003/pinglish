import { prisma } from "../../lib/prisma.js";
import { LeadContextSource, type OnboardingStep } from "../../generated/prisma/index.js";
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

type GetOnboardingStatusByIdResult =
  | { kind: "found"; lead: { id: string; onboardingStep: OnboardingStep } }
  | { kind: "lead-not-found" };

type GetLeadByIdResult =
  | {
      kind: "found";
      lead: {
        id: string;
        name: string;
        phone: string;
        interests: string[];
        onboardingStep: OnboardingStep;
      };
    }
  | { kind: "lead-not-found" };

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
  async getOnboardingStatusById(
    userId: string,
  ): Promise<GetOnboardingStatusByIdResult> {
    const lead = await prisma.lead.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
        onboardingStep: true,
      },
    });

    if (!lead) {
      return { kind: "lead-not-found" };
    }

    return { kind: "found", lead };
  }

  async getLeadById(userId: string): Promise<GetLeadByIdResult> {
    const lead = await prisma.lead.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
        name: true,
        phone: true,
        interests: true,
        onboardingStep: true,
      },
    });

    if (!lead) {
      return { kind: "lead-not-found" };
    }

    return { kind: "found", lead };
  }

  async updateOnboardingStepById(
    userId: string,
    onboardingStep: OnboardingStep,
  ): Promise<GetOnboardingStatusByIdResult> {
    const lead = await prisma.lead.update({
      where: {
        id: userId,
      },
      data: {
        onboardingStep,
      },
      select: {
        id: true,
        onboardingStep: true,
      },
    });

    return { kind: "found", lead };
  }

  async createContextEntry(input: {
    leadId: string;
    leadResponseId: string;
    content: string;
    onboardingStep: OnboardingStep;
  }): Promise<void> {
    await prisma.leadContextEntry.create({
      data: {
        leadId: input.leadId,
        leadResponseId: input.leadResponseId,
        source: LeadContextSource.WHATSAPP_INBOUND,
        content: input.content,
        onboardingStep: input.onboardingStep,
      },
    });
  }
}
