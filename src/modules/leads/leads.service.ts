import type { LeadsEventsPublisher } from "../../lib/leads-events.publisher.js";
import type { LeadsRepository } from "./leads.repository.js";
import type { CreateLeadInput, PatchLeadInput } from "./leads.types.js";

export class LeadsService {
    constructor(
      private readonly repository: LeadsRepository,
      private readonly eventsPublisher: LeadsEventsPublisher,
    ) {}

    async create(data: CreateLeadInput) {
        const existing = await this.repository.findByEmail(data.email);

        if (existing) {
        throw new Error("Lead already exists");
        }

        const lead = await this.repository.create(data);

        await this.eventsPublisher.publishLeadCreated(lead);

        return lead;
    }

    async patch(data: PatchLeadInput) {
        return this.repository.patch(data);
    }
}
