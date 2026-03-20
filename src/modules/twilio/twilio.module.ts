import { buildTwilioEventsPublisher } from "../../lib/twilio-events.publisher.js";
import { TwilioRepository } from "./twilio.repository.js";
import { TwilioWebhookService } from "./twilio.webhook.service.js";

const twilioRepository = new TwilioRepository();
const twilioEventsPublisher = buildTwilioEventsPublisher();

export const twilioWebhookService = new TwilioWebhookService(
  twilioRepository,
  twilioEventsPublisher,
);
