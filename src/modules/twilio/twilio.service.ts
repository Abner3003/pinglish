import twilio, { type Twilio } from "twilio";
import { env } from "../../config/env.js";

type Logger = Pick<typeof console, "info" | "warn" | "error">;

type SendWelcomeMessageInput = {
  to: string;
  firstName?: string | null;
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
  }> {
    this.logger.warn(
      `[leads-worker] twilio is not configured, skipping welcome message to=${input.to}`,
    );

    return { sid: null, status: null };
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

    const body =
      `Olá ${firstName}! Bem vindo ao Penglish 🎉 ` +
      "Serei seu parceiro nessa caminhada ardua e divertida de aprender um novo idioma.";

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

    return `whatsapp:${cleaned}`;
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
