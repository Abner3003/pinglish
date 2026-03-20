import type { TwilioEventsPublisher } from "../../lib/twilio-events.publisher.js";
import { OnboardingStep } from "../../generated/prisma/index.js";
import type { WelcomeMessenger } from "./twilio.interfaces.js";
import type { TwilioRepository } from "./twilio.repository.js";

type CreateInboundLeadResponseInput = {
  phone: string;
  content: string;
  externalFrom: string;
  channel: string;
  direction: string;
};

export class TwilioWebhookService {
  constructor(
    private readonly repository: TwilioRepository,
    private readonly eventsPublisher: TwilioEventsPublisher,
    private readonly welcomeMessenger: WelcomeMessenger,
  ) {}

  async receiveInboundMessage(input: CreateInboundLeadResponseInput) {
    const result = await this.repository.createInboundLeadResponse(input);

    if (result.kind !== "saved") {
      return result;
    }

    const lead = await this.repository.getLeadById(result.response.leadId);

    if (lead.kind === "found" && input.content.trim().length > 0) {
      const nextStep = this.getNextOnboardingStep(lead.lead.onboardingStep);

      await this.repository.updateOnboardingStepById(lead.lead.id, nextStep);

      const messageInput = {
        id: lead.lead.id,
        to: lead.lead.phone,
        firstName: lead.lead.name,
        interestAreas: lead.lead.interests,
      };

      if (nextStep === OnboardingStep.DONE) {
        await this.welcomeMessenger.sendJourneyStartMessage(messageInput);
      } else {
        await this.welcomeMessenger.sendOnboardingMessage(messageInput);
      }
    }

    await this.eventsPublisher.publishLeadResponseCreated(result.response);

    return result;
  }

  private getNextOnboardingStep(currentStep: OnboardingStep): OnboardingStep {
    switch (currentStep) {
      case OnboardingStep.WAITING_OPT_IN:
        return OnboardingStep.ASK_PROFESSION;
      case OnboardingStep.ASK_PROFESSION:
        return OnboardingStep.ASK_GOAL;
      case OnboardingStep.ASK_GOAL:
        return OnboardingStep.ASK_INTERESTS;
      case OnboardingStep.ASK_INTERESTS:
        return OnboardingStep.DONE;
      case OnboardingStep.DONE:
        return OnboardingStep.DONE;
    }
  }
}
