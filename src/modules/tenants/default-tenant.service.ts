import { env } from "../../config/env.js";
import { prisma } from "../../lib/prisma.js";
import { ensureTenantHasSeedItems as ensureSeedItemsForTenant } from "./tenant-seed-items.js";

let cachedDefaultTenantId: string | null | undefined;

async function ensureTenantHasSeedItems(tenantId: string): Promise<void> {
  await ensureSeedItemsForTenant(tenantId, prisma);
}

async function createDefaultTenantIfPossible(): Promise<string | null> {
  const professional = await prisma.professional.findFirst({
    orderBy: {
      createdAt: "asc",
    },
    select: {
      id: true,
    },
  });

  if (!professional) {
    return null;
  }

  const tenant = await prisma.tenant.create({
    data: {
      professionalId: professional.id,
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
