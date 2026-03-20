import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { env } from "../config/env.js";
import {
  createLeadResponseCreatedEvent,
  type LeadResponseEventPayload,
} from "../modules/twilio/twilio.events.js";

export interface TwilioEventsPublisher {
  publishLeadResponseCreated(response: LeadResponseEventPayload): Promise<void>;
}

export class NoopTwilioEventsPublisher implements TwilioEventsPublisher {
  async publishLeadResponseCreated(
    _response: LeadResponseEventPayload,
  ): Promise<void> {
    return;
  }
}

export class SqsTwilioEventsPublisher implements TwilioEventsPublisher {
  private readonly client: SQSClient;

  constructor(
    private readonly queueUrl: string,
    region: string,
  ) {
    this.client = new SQSClient({ region });
  }

  async publishLeadResponseCreated(
    response: LeadResponseEventPayload,
  ): Promise<void> {
    const body = JSON.stringify(createLeadResponseCreatedEvent(response));
    const isFifoQueue = this.queueUrl.endsWith(".fifo");

    await this.client.send(
      new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: body,
        MessageAttributes: {
          eventType: {
            DataType: "String",
            StringValue: "lead-response.created",
          },
          aggregateId: {
            DataType: "String",
            StringValue: response.leadId,
          },
        },
        ...(isFifoQueue
          ? {
              MessageGroupId: "lead-responses",
              MessageDeduplicationId: response.id,
            }
          : {}),
      }),
    );
  }
}

export function buildTwilioEventsPublisher(): TwilioEventsPublisher {
  if (!env.INTERACTIONS_EVENTS_QUEUE_URL || !env.AWS_REGION) {
    return new NoopTwilioEventsPublisher();
  }

  return new SqsTwilioEventsPublisher(
    env.INTERACTIONS_EVENTS_QUEUE_URL,
    env.AWS_REGION,
  );
}
