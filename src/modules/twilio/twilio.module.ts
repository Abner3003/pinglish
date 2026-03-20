import { buildTwilioEventsPublisher } from "../../lib/twilio-events.publisher.js";
import { TwilioRepository } from "./twilio.repository.js";
import { buildWelcomeMessenger } from "./twilio.service.js";
import { TwilioWebhookService } from "./twilio.webhook.service.js";

const twilioRepository = new TwilioRepository();
const twilioEventsPublisher = buildTwilioEventsPublisher();
const welcomeMessenger = buildWelcomeMessenger(console);

export const twilioWebhookService = new TwilioWebhookService(
  twilioRepository,
  twilioEventsPublisher,
  welcomeMessenger,
);
