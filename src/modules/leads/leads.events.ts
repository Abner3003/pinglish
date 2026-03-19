import { z } from "zod";
import type { Lead } from "./leads.types.js";

export const leadPayloadSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  email: z.email(),
  phone: z.string().min(1),
  focus: z.string().min(1),
  interests: z.array(z.string()),
  acceptedTermsAt: z.string().datetime(),
  createdAt: z.string().datetime(),
});

export const leadCreatedEventSchema = z.object({
  eventId: z.string().min(1),
  type: z.literal("lead.created"),
  occurredAt: z.string().datetime(),
  lead: leadPayloadSchema,
});

export type LeadCreatedEvent = z.infer<typeof leadCreatedEventSchema>;

export function getLeadCreatedEventId(leadId: string): string {
  return `lead.created:${leadId}`;
}

export function createLeadCreatedEvent(lead: Lead): LeadCreatedEvent {
  return {
    eventId: getLeadCreatedEventId(lead.id),
    type: "lead.created",
    occurredAt: new Date().toISOString(),
    lead: {
      id: lead.id,
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      focus: lead.focus,
      interests: lead.interests,
      acceptedTermsAt: lead.acceptedTermsAt.toISOString(),
      createdAt: lead.createdAt.toISOString(),
    },
  };
}
