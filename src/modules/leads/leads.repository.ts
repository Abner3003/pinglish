import { prisma } from "../../lib/prisma.js";
import type { CreateLeadInput, Lead, PatchLeadInput } from "./leads.types.js";

export class LeadsRepository {
  async create(data: CreateLeadInput): Promise<Lead> {
    return prisma.lead.create({
      data: {
        name: data.name,
        email: data.email,
        phone: data.phone,
        focus: data.focus,
        interests: data.interests,
        acceptedTermsAt: data.acceptedTermsAt,
      },
    });
  }

  async patch(data: PatchLeadInput): Promise<Lead> {
    if (!data.email) {
      throw new Error("Email is required to update a lead");
    }

    return prisma.lead.update({
      where: { email: data.email },
      data: {
        name: data.name,
        phone: data.phone,
        focus: data.focus,
        interests: data.interests,
        acceptedTermsAt: data.acceptedTermsAt,
      },
    });
  }

  async findByEmail(email: string): Promise<Lead | null> {
    return prisma.lead.findUnique({
      where: { email },
    });
  }
}
