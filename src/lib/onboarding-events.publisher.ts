/* eslint-disable @typescript-eslint/no-unused-vars */
import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { env } from "../config/env.js";
import {
  getUserCreatedEventId,
  type UserCreatedEvent,
} from "../modules/onboarding/onboarding.events.js";

export interface OnboardingEventsPublisher {
  publishUserCreated(event: UserCreatedEvent): Promise<void>;
}

export class NoopOnboardingEventsPublisher implements OnboardingEventsPublisher {
  async publishUserCreated(_event: UserCreatedEvent): Promise<void> {
    return;
  }
}

export class SqsOnboardingEventsPublisher implements OnboardingEventsPublisher {
  private readonly client: SQSClient;

  constructor(
    private readonly queueUrl: string,
    region: string,
  ) {
    this.client = new SQSClient({ region });
  }

  async publishUserCreated(event: UserCreatedEvent): Promise<void> {
    const body = JSON.stringify(event);
    const isFifoQueue = this.queueUrl.endsWith(".fifo");

    await this.client.send(
      new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: body,
        MessageAttributes: {
          eventType: {
            DataType: "String",
            StringValue: "user.created",
          },
          aggregateId: {
            DataType: "String",
            StringValue: event.user.id,
          },
        },
        ...(isFifoQueue
          ? {
              MessageGroupId: "users",
              MessageDeduplicationId: getUserCreatedEventId(event.user.id),
            }
          : {}),
      }),
    );
  }
}

export function buildOnboardingEventsPublisher(): OnboardingEventsPublisher {
  if (!env.LEADS_EVENTS_QUEUE_URL || !env.AWS_REGION) {
    return new NoopOnboardingEventsPublisher();
  }

  return new SqsOnboardingEventsPublisher(
    env.LEADS_EVENTS_QUEUE_URL,
    env.AWS_REGION,
  );
}

