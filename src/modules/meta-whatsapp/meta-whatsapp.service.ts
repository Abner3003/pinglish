import { env } from "../../config/env.js";

type Logger = Pick<typeof console, "info" | "warn" | "error">;

type WebhookPayload = Record<string, unknown>;

type InboundMessage = {
  from: string;
  text: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export class MetaWhatsAppService {
  constructor(private readonly logger: Logger = console) {}

  async handleWebhook(payload: unknown): Promise<void> {
    const inboundMessages = this.extractInboundMessages(payload);

    if (inboundMessages.length === 0) {
      return;
    }

    for (const message of inboundMessages) {
      const reply = this.buildAutoReply(message.text);

      try {
        await this.sendWhatsAppMessage(message.from, reply);
      } catch (error) {
        this.logger.error(
          { error, from: message.from },
          "[meta-whatsapp] failed to send auto reply",
        );
      }
    }
  }

  async sendWhatsAppMessage(to: string, text: string): Promise<string | null> {
    if (!env.WHATSAPP_TOKEN || !env.PHONE_NUMBER_ID) {
      throw new Error("Meta WhatsApp is not configured");
    }

    const response = await fetch(
      `https://graph.facebook.com/${env.GRAPH_API_VERSION}/${env.PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: this.normalizePhoneNumber(to),
          type: "text",
          text: {
            preview_url: false,
            body: text,
          },
        }),
      },
    );

    const rawBody = await response.text();

    if (!response.ok) {
      throw new Error(
        `Meta WhatsApp send failed with status ${response.status}: ${rawBody}`,
      );
    }

    try {
      const parsed = JSON.parse(rawBody) as {
        messages?: Array<{ id?: string }>;
      };

      return parsed.messages?.[0]?.id ?? null;
    } catch {
      return null;
    }
  }

  private buildAutoReply(text: string): string {
    return `Recebi sua mensagem: ${text}`;
  }

  private extractInboundMessages(payload: unknown): InboundMessage[] {
    if (!isRecord(payload)) {
      return [];
    }

    const entries = Array.isArray(payload.entry) ? payload.entry : [];
    const messages: InboundMessage[] = [];

    for (const entry of entries) {
      if (!isRecord(entry) || !Array.isArray(entry.changes)) {
        continue;
      }

      for (const change of entry.changes) {
        if (!isRecord(change) || !isRecord(change.value)) {
          continue;
        }

        const value = change.value as WebhookPayload;
        const incomingMessages = Array.isArray(value.messages)
          ? value.messages
          : [];

        for (const message of incomingMessages) {
          if (!isRecord(message)) {
            continue;
          }

          const from = getString(message.from);
          const text = this.extractMessageText(message);

          if (from && text) {
            messages.push({
              from,
              text,
            });
          }
        }
      }
    }

    return messages;
  }

  private extractMessageText(message: Record<string, unknown>): string | undefined {
    const messageType = getString(message.type);

    if (messageType === "text" && isRecord(message.text)) {
      return getString(message.text.body);
    }

    if (isRecord(message.interactive)) {
      const buttonReply = message.interactive.button_reply;
      if (isRecord(buttonReply)) {
        return getString(buttonReply.title) ?? getString(buttonReply.id);
      }

      const listReply = message.interactive.list_reply;
      if (isRecord(listReply)) {
        return getString(listReply.title) ?? getString(listReply.id);
      }
    }

    if (isRecord(message.button)) {
      return getString(message.button.text);
    }

    return undefined;
  }

  private normalizePhoneNumber(phone: string): string {
    return phone.replace(/[^\d]/g, "");
  }
}
