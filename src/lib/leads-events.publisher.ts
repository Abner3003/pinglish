/* eslint-disable @typescript-eslint/no-unused-vars */
import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { env } from "../config/env.js";
import { createLeadCreatedEvent } from "../modules/leads/leads.events.js";
import type { Lead } from "../modules/leads/leads.types.js";

export interface LeadsEventsPublisher {
  publishLeadCreated(lead: Lead): Promise<void>;
}

export class NoopLeadsEventsPublisher implements LeadsEventsPublisher {
  async publishLeadCreated(_lead: Lead): Promise<void> {
    return;
  }
}

export class SqsLeadsEventsPublisher implements LeadsEventsPublisher {
  private readonly client: SQSClient;

  constructor(
    private readonly queueUrl: string,
    region: string,
  ) {
    this.client = new SQSClient({ region });
  }

  async publishLeadCreated(lead: Lead): Promise<void> {
    const body = JSON.stringify(createLeadCreatedEvent(lead));

    const isFifoQueue = this.queueUrl.endsWith(".fifo");

    await this.client.send(
      new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: body,
        MessageAttributes: {
          eventType: {
            DataType: "String",
            StringValue: "lead.created",
          },
          aggregateId: {
            DataType: "String",
            StringValue: lead.id,
          },
        },
        ...(isFifoQueue
          ? {
              MessageGroupId: "leads",
              MessageDeduplicationId: lead.id,
            }
          : {}),
      }),
    );
  }
}

export function buildLeadsEventsPublisher(): LeadsEventsPublisher {
  if (!env.LEADS_EVENTS_QUEUE_URL || !env.AWS_REGION) {
    return new NoopLeadsEventsPublisher();
  }

  return new SqsLeadsEventsPublisher(
    env.LEADS_EVENTS_QUEUE_URL,
    env.AWS_REGION,
  );
}
