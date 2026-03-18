import type { LeadsRepository } from "./leads.repository.js";
import type { CreateLeadInput, PatchLeadInput } from "./leads.types.js";

export class LeadsService {
    constructor(private readonly repository: LeadsRepository) {}

    async create(data: CreateLeadInput) {
        const existing = await this.repository.findByEmail(data.email);

        if (existing) {
        throw new Error("Lead already exists");
        }

        return this.repository.create(data);
    }

    async patch(data: PatchLeadInput) {
        return this.repository.patch(data);
    }
}