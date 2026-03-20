import type { TwilioEventsPublisher } from "../../lib/twilio-events.publisher.js";
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
  ) {}

  async receiveInboundMessage(input: CreateInboundLeadResponseInput) {
    const result = await this.repository.createInboundLeadResponse(input);

    if (result.kind !== "saved") {
      return result;
    }

    await this.eventsPublisher.publishLeadResponseCreated(result.response);

    return result;
  }
}
