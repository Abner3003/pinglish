import { z } from "zod";

export const leadResponsePayloadSchema = z.object({
  id: z.string().min(1),
  leadId: z.string().min(1),
  direction: z.string().min(1),
  channel: z.string().min(1),
  content: z.string(),
  externalFrom: z.string().min(1),
  createdAt: z.string().datetime(),
});

export const leadResponseCreatedEventSchema = z.object({
  eventId: z.string().min(1),
  type: z.literal("lead-response.created"),
  occurredAt: z.string().datetime(),
  leadResponse: leadResponsePayloadSchema,
});

export type LeadResponseCreatedEvent = z.infer<
  typeof leadResponseCreatedEventSchema
>;

export type LeadResponseEventPayload = {
  id: string;
  leadId: string;
  direction: string;
  channel: string;
  content: string;
  externalFrom: string;
  createdAt: Date;
};

export function getLeadResponseCreatedEventId(responseId: string): string {
  return `lead-response.created:${responseId}`;
}

export function createLeadResponseCreatedEvent(
  response: LeadResponseEventPayload,
): LeadResponseCreatedEvent {
  return {
    eventId: getLeadResponseCreatedEventId(response.id),
    type: "lead-response.created",
    occurredAt: new Date().toISOString(),
    leadResponse: {
      id: response.id,
      leadId: response.leadId,
      direction: response.direction,
      channel: response.channel,
      content: response.content,
      externalFrom: response.externalFrom,
      createdAt: response.createdAt.toISOString(),
    },
  };
}
