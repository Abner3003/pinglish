import twilio, { type Twilio } from "twilio";
import { env } from "../../config/env.js";
import { OnboardingStep } from "../../generated/prisma/index.js";
import type { Logger, SendWelcomeMessageInput, WelcomeMessenger } from "./twilio.interfaces.js";
import { TwilioRepository } from "./twilio.repository.js";

export class NoopWelcomeMessenger implements WelcomeMessenger {
  constructor(private readonly logger: Logger) {}

  async sendOnboardingMessage(input: SendWelcomeMessageInput): Promise<{
    sid: string | null;
    status: string | null;
  }> {
    this.logger.warn(
      `[leads-worker] twilio is not configured, skipping welcome message to=${input.to}`,
    );

    return { sid: null, status: null };
  }

  async sendJourneyStartMessage(input: SendWelcomeMessageInput): Promise<{
    sid: string | null;
    status: string | null;
  }> {
    this.logger.warn(
      `[leads-worker] twilio is not configured, skipping journey start message to=${input.to}`,
    );

    return { sid: null, status: null };
  }
}

export class TwilioOnboardingMessenger implements WelcomeMessenger {
  private readonly client: Twilio;

  constructor(
    private readonly logger: Logger,
    client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN),
    private readonly twilioRepository: TwilioRepository,
  ) {
    this.client = client;
  }

  async sendOnboardingMessage(input: SendWelcomeMessageInput): Promise<{
    sid: string | null;
    status: string | null;
  }> {
    const to = this.normalizeWhatsappNumber(input.to);
    const firstName = input.firstName?.trim() || "aluno";
    const onboardingStatus =
      await this.twilioRepository.getOnboardingStatusById(input.id);

    if (onboardingStatus.kind === "lead-not-found") {
      this.logger.warn(
        `[leads-worker] lead not found for onboarding message userId=${input.id} to=${to}`,
      );

      return { sid: null, status: null };
    }

    const body = this.buildOnboardingMessage({
      firstName,
      interestAreas: input.interestAreas,
      onboardingStep: onboardingStatus.lead.onboardingStep,
    });

    if (!body) {
      this.logger.info(
        `[leads-worker] onboarding already completed for userId=${input.id} to=${to}`,
      );

      return { sid: null, status: null };
    }

    const message = await this.client.messages.create({
      from: this.normalizeWhatsappNumber(env.TWILIO_WHATSAPP_FROM!),
      to,
      body,
      statusCallback: env.TWILIO_STATUS_CALLBACK_URL,
    });

    this.logger.info(
      `[leads-worker] twilio message accepted sid=${message.sid} to=${to} status=${message.status}`,
    );

    return {
      sid: message.sid,
      status: message.status ?? null,
    };
  }

  async sendJourneyStartMessage(input: SendWelcomeMessageInput): Promise<{
    sid: string | null;
    status: string | null;
  }> {
    const to = this.normalizeWhatsappNumber(input.to);
    const firstName = input.firstName?.trim() || "aluno";

    if (env.TWILIO_WHATSAPP_DONE_CONTENT_SID) {
      return this.sendContentTemplateMessage({
        to,
        contentSid: env.TWILIO_WHATSAPP_DONE_CONTENT_SID,
        contentVariables: JSON.stringify({
          "1": firstName,
          ...(env.TWILIO_WHATSAPP_JOURNEY_URL
            ? { "2": env.TWILIO_WHATSAPP_JOURNEY_URL }
            : {}),
        }),
      });
    }

    const journeyUrl = env.TWILIO_WHATSAPP_JOURNEY_URL;
    const body = journeyUrl
      ? `Perfeito, ${firstName}! Seu onboarding foi concluído.\n\nClique aqui para iniciar nossa jornada no WhatsApp: ${journeyUrl}`
      : `Perfeito, ${firstName}! Seu onboarding foi concluído.\n\nSua mensagem com botão de iniciar a jornada depende do template aprovado no Twilio.`;

    return this.sendTextMessage({ to, body });
  }

  private buildOnboardingMessage(input: {
    firstName: string;
    interestAreas: string[];
    onboardingStep: OnboardingStep;
  }): string | null {
    const formattedInterestAreas =
      input.interestAreas.length > 0 ? input.interestAreas.join(", ") : "inglês no dia a dia";

    switch (input.onboardingStep) {
      case OnboardingStep.WAITING_OPT_IN:
        return `Olá, ${input.firstName}! Seja muito bem-vindo ao Penglish 🎉

Vi que você se interessa por temas como: ${formattedInterestAreas}.
Vou ser seu parceiro nessa jornada de aprender inglês de um jeito mais leve, prático e divertido.

Posso começar seu onboarding por aqui no WhatsApp? Responda com SIM para continuar.`;

      case OnboardingStep.ASK_PROFESSION:
        return `Perfeito, ${input.firstName}! Para eu te conhecer melhor: qual é a sua profissão hoje?`;

      case OnboardingStep.ASK_GOAL:
        return `Boa. Agora me conta: qual é o seu principal objetivo com o inglês hoje?`;

      case OnboardingStep.ASK_INTERESTS:
        return "Quais assuntos mais prendem sua atenção e você gostaria de usar para praticar inglês por aqui?";

      case OnboardingStep.DONE:
        return null;
    }
  }

  private normalizeWhatsappNumber(phone: string): string {
    if (phone.startsWith("whatsapp:")) {
      return phone;
    }

    const cleaned = phone.replace(/[^\d+]/g, "");
    const digits = cleaned.startsWith("+") ? cleaned.slice(1) : cleaned;

    if (cleaned.startsWith("+")) {
      return `whatsapp:${cleaned}`;
    }

    // Accept Brazilian local numbers and normalize them to E.164.
    if (digits.length === 10 || digits.length === 11) {
      return `whatsapp:+55${digits}`;
    }

    if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
      return `whatsapp:+${digits}`;
    }

    return `whatsapp:+${digits}`;
  }

  private async sendTextMessage(input: {
    to: string;
    body: string;
  }): Promise<{ sid: string; status: string | null }> {
    const message = await this.client.messages.create({
      from: this.normalizeWhatsappNumber(env.TWILIO_WHATSAPP_FROM!),
      to: input.to,
      body: input.body,
      statusCallback: env.TWILIO_STATUS_CALLBACK_URL,
    });

    this.logger.info(
      `[leads-worker] twilio message accepted sid=${message.sid} to=${input.to} status=${message.status}`,
    );

    return {
      sid: message.sid,
      status: message.status ?? null,
    };
  }

  private async sendContentTemplateMessage(input: {
    to: string;
    contentSid: string;
    contentVariables?: string;
  }): Promise<{ sid: string; status: string | null }> {
    const message = await this.client.messages.create({
      from: this.normalizeWhatsappNumber(env.TWILIO_WHATSAPP_FROM!),
      to: input.to,
      contentSid: input.contentSid,
      contentVariables: input.contentVariables,
      statusCallback: env.TWILIO_STATUS_CALLBACK_URL,
    });

    this.logger.info(
      `[leads-worker] twilio content message accepted sid=${message.sid} to=${input.to} status=${message.status}`,
    );

    return {
      sid: message.sid,
      status: message.status ?? null,
    };
  }
}

export function buildWelcomeMessenger(logger: Logger): WelcomeMessenger {
  if (
    !env.TWILIO_ACCOUNT_SID ||
    !env.TWILIO_AUTH_TOKEN ||
    !env.TWILIO_WHATSAPP_FROM
  ) {
    return new NoopWelcomeMessenger(logger);
  }

  return new TwilioOnboardingMessenger(logger, undefined, new TwilioRepository());
}
