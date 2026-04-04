import { prisma } from "../../lib/prisma.js";
import type {
  CreateLeadInput,
  CreatePortalAccessRequestInput,
  Lead,
  PatchLeadInput,
  PortalAccessRequest,
} from "./leads.types.js";

export class LeadsRepository {
  async createPortalAccessRequest(
    data: CreatePortalAccessRequestInput
  ): Promise<PortalAccessRequest> {
    return prisma.$transaction(async (tx) => {
      const professional = data.professional
        ? await tx.professional.upsert({
            where: { email: data.professional.email },
            update: {
              name: data.professional.name,
              phone: data.professional.phone,
            },
            create: {
              name: data.professional.name,
              email: data.professional.email,
              phone: data.professional.phone,
            },
          })
        : null;

      return tx.portalAccessRequest.create({
        data: {
          name: data.name,
          email: data.email,
          phone: data.phone,
          couponCode: data.couponCode,
          professionalId: professional?.id,
        },
      });
    });
  }

  async create(data: CreateLeadInput): Promise<Lead> {
    return prisma.$transaction(async (tx) => {
      const professional = data.professional
        ? await tx.professional.upsert({
            where: { email: data.professional.email },
            update: {
              name: data.professional.name,
              phone: data.professional.phone,
            },
            create: {
              name: data.professional.name,
              email: data.professional.email,
              phone: data.professional.phone,
            },
          })
        : null;

      return tx.lead.create({
        data: {
          name: data.name,
          email: data.email,
          phone: data.phone,
          focus: data.focus,
          interests: data.interests,
          acceptedTermsAt: data.acceptedTermsAt,
          professionalId: professional?.id,
        },
      });
    });
  }

  async patch(data: PatchLeadInput): Promise<Lead> {
    if (!data.email) {
      throw new Error("Email is required to update a lead");
    }

    return prisma.$transaction(async (tx) => {
      const professional = data.professional
        ? await tx.professional.upsert({
            where: { email: data.professional.email },
            update: {
              name: data.professional.name,
              phone: data.professional.phone,
            },
            create: {
              name: data.professional.name,
              email: data.professional.email,
              phone: data.professional.phone,
            },
          })
        : null;

      return tx.lead.update({
        where: { email: data.email },
        data: {
          name: data.name,
          phone: data.phone,
          focus: data.focus,
          interests: data.interests,
          acceptedTermsAt: data.acceptedTermsAt,
          professionalId: professional?.id,
        },
      });
    });
  }

  async findByEmail(email: string): Promise<Lead | null> {
    return prisma.lead.findUnique({
      where: { email },
    });
  }
}
