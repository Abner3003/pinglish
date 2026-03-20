import twilio, { type Twilio } from "twilio";
import { env } from "../../config/env.js";

type Logger = Pick<typeof console, "info" | "warn" | "error">;

type SendWelcomeMessageInput = {
  to: string;
  firstName?: string | null;
  interestAreas: string []
};

export interface WelcomeMessenger {
  sendWelcomeMessage(input: SendWelcomeMessageInput): Promise<{
    sid: string | null;
    status: string | null;
  }>;
}

export class NoopWelcomeMessenger implements WelcomeMessenger {
  constructor(private readonly logger: Logger) {}

  async sendWelcomeMessage(input: SendWelcomeMessageInput): Promise<{
    sid: string | null;
    status: string | null;
    interestAreas: string []

  }> {
    this.logger.warn(
      `[leads-worker] twilio is not configured, skipping welcome message to=${input.to}`,
    );

    return { sid: null, status: null, interestAreas:[] };
  }
}

export class TwilioWelcomeMessenger implements WelcomeMessenger {
  private readonly client: Twilio;

  constructor(
    private readonly logger: Logger,
    client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN),
  ) {
    this.client = client;
  }

  async sendWelcomeMessage(input: SendWelcomeMessageInput): Promise<{
    sid: string;
    status: string | null;
  }> {
    const to = this.normalizeWhatsappNumber(input.to);
    const firstName = input.firstName?.trim() || "there";

    const body = `Olá, ${firstName}! Seja muito bem-vindo ao Penglish 🎉
    Vi que você se interessa por temas como: ${input.interestAreas}.
    Vou ser seu parceiro nessa jornada de aprender inglês de um jeito mais leve, prático e divertido.`;

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
}

export function buildWelcomeMessenger(logger: Logger): WelcomeMessenger {
  if (
    !env.TWILIO_ACCOUNT_SID ||
    !env.TWILIO_AUTH_TOKEN ||
    !env.TWILIO_WHATSAPP_FROM
  ) {
    return new NoopWelcomeMessenger(logger);
  }

  return new TwilioWelcomeMessenger(logger);
}
