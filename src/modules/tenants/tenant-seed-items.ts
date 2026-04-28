import { Prisma, PrismaClient } from "../../generated/prisma/index.js";

type SeedLearningItem = {
  id: string;
  tenantId: string;
  type: "LEXICAL_CHUNK" | "PATTERN" | "EXAMPLE" | "MICRO_LESSON";
  text: string;
  meaning: string;
  difficulty: number;
  tags: string[];
  prerequisiteItemIds: string[];
  relatedItemIds: string[];
  metadata: Prisma.InputJsonValue;
};

export const TENANT_SEED_ITEMS = [
  {
    seedKey: "greetings-how-are-you",
    type: "LEXICAL_CHUNK" as const,
    text: "How are you?",
    meaning: "Como você está?",
    difficulty: 1,
    tags: ["greetings", "daily-conversation"],
    prerequisiteItemIds: [],
    relatedItemIds: [],
    metadata: {
      topic: "greetings",
      context: "daily",
      grammarFocus: "question-form",
    },
  },
  {
    seedKey: "politeness-i-would-like",
    type: "PATTERN" as const,
    text: "I would like to...",
    meaning: "Eu gostaria de...",
    difficulty: 2,
    tags: ["politeness", "requests"],
    prerequisiteItemIds: [],
    relatedItemIds: [],
    metadata: {
      topic: "requests",
      context: "polite-interaction",
      grammarFocus: "would-like",
    },
  },
  {
    seedKey: "education-book-class",
    type: "EXAMPLE" as const,
    text: "I would like to book a class.",
    meaning: "Eu gostaria de reservar uma aula.",
    difficulty: 2,
    tags: ["education", "booking"],
    prerequisiteItemIds: [],
    relatedItemIds: [],
    metadata: {
      topic: "education",
      context: "booking",
      grammarFocus: "would-like",
    },
  },
  {
    seedKey: "grammar-simple-present-routines",
    type: "MICRO_LESSON" as const,
    text: "Simple present for routines",
    meaning: "Presente simples para rotinas",
    difficulty: 3,
    tags: ["grammar", "routine"],
    prerequisiteItemIds: [],
    relatedItemIds: [],
    metadata: {
      topic: "grammar",
      context: "daily-routine",
      grammarFocus: "simple-present",
    },
  },
];

export function buildTenantSeedItemData(tenantId: string) {
  return TENANT_SEED_ITEMS.map((item): SeedLearningItem => ({
    id: `seed:${tenantId}:${item.seedKey}`,
    tenantId,
    type: item.type,
    text: item.text,
    meaning: item.meaning,
    difficulty: item.difficulty,
    tags: item.tags,
    prerequisiteItemIds: item.prerequisiteItemIds,
    relatedItemIds: item.relatedItemIds,
    metadata: item.metadata as Prisma.InputJsonValue,
  }));
}

export type TenantSeedPrisma = {
  learningItem: {
    count: (args: { where: { tenantId: string } }) => Promise<number>;
    upsert: PrismaClient["learningItem"]["upsert"];
  };
};

export async function ensureTenantHasSeedItems(
  tenantId: string,
  prisma: TenantSeedPrisma,
): Promise<number> {
  const items = buildTenantSeedItemData(tenantId);

  for (const item of items) {
    await prisma.learningItem.upsert({
      where: {
        id: item.id,
      },
      create: item,
      update: {} as Record<string, never>,
    });
  }

  return items.length;
}

type TenantSeedBackfillPrisma = {
  tenant: {
    findMany: (args: { select: { id: true } }) => Promise<Array<{ id: string }>>;
  };
  learningItem: TenantSeedPrisma["learningItem"];
};

export async function backfillSeedItemsForAllTenants(
  prisma: TenantSeedBackfillPrisma,
): Promise<{ checked: number; seeded: number }> {
  const tenants = await prisma.tenant.findMany({
    select: {
      id: true,
    },
  });

  let seeded = 0;

  for (const tenant of tenants) {
    const existingItems = await prisma.learningItem.count({
      where: {
        tenantId: tenant.id,
      },
    });

    if (existingItems > 0) {
      continue;
    }

    for (const item of buildTenantSeedItemData(tenant.id)) {
      await prisma.learningItem.upsert({
        where: {
          id: item.id,
        },
        create: item,
        update: {} as Record<string, never>,
      });
    }

    seeded += 1;
  }

  return {
    checked: tenants.length,
    seeded,
  };
}
