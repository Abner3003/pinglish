import { env } from "../../config/env.js";
import { prisma } from "../../lib/prisma.js";
import { ensureTenantHasSeedItems as ensureSeedItemsForTenant } from "./tenant-seed-items.js";

let cachedDefaultTenantId: string | null | undefined;

const DEFAULT_SYSTEM_PROFESSIONAL = {
  name: "Penglish System",
  email: "system@penglish.local",
  phone: "+00000000000",
};

async function ensureTenantHasSeedItems(tenantId: string): Promise<void> {
  await ensureSeedItemsForTenant(tenantId, prisma);
}

async function resolveSystemProfessionalId(): Promise<string> {
  const professional = await prisma.professional.upsert({
    where: {
      email: DEFAULT_SYSTEM_PROFESSIONAL.email,
    },
    update: {
      name: DEFAULT_SYSTEM_PROFESSIONAL.name,
      phone: DEFAULT_SYSTEM_PROFESSIONAL.phone,
    },
    create: {
      name: DEFAULT_SYSTEM_PROFESSIONAL.name,
      email: DEFAULT_SYSTEM_PROFESSIONAL.email,
      phone: DEFAULT_SYSTEM_PROFESSIONAL.phone,
    },
    select: {
      id: true,
    },
  });

  return professional.id;
}

async function createDefaultTenantIfPossible(): Promise<string | null> {
  const professionalId = await resolveSystemProfessionalId();

  const tenant = await prisma.tenant.create({
    data: {
      professionalId,
      name: env.DEFAULT_TENANT_NAME,
      description: "Tenant padrão da PEnglish",
      segment: env.DEFAULT_TENANT_SEGMENT,
      educationalApproach: {
        provider: "default",
        name: env.DEFAULT_TENANT_NAME,
        segment: env.DEFAULT_TENANT_SEGMENT,
        autoCreated: true,
      },
    },
    select: {
      id: true,
    },
  });

  return tenant.id;
}

export async function resolveDefaultTenantId(): Promise<string | null> {
  if (cachedDefaultTenantId !== undefined) {
    return cachedDefaultTenantId;
  }

  const existingTenant = await prisma.tenant.findFirst({
    where: {
      name: env.DEFAULT_TENANT_NAME,
    },
    orderBy: {
      createdAt: "asc",
    },
    select: {
      id: true,
    },
  });

  if (existingTenant) {
    cachedDefaultTenantId = existingTenant.id;
    await ensureTenantHasSeedItems(cachedDefaultTenantId);
    return cachedDefaultTenantId;
  }

  cachedDefaultTenantId = await createDefaultTenantIfPossible();
  if (cachedDefaultTenantId) {
    await ensureTenantHasSeedItems(cachedDefaultTenantId);
  }
  return cachedDefaultTenantId ?? null;
}
