export const TENANT_SEED_ITEMS = [
  {
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
  return TENANT_SEED_ITEMS.map((item) => ({
    tenantId,
    type: item.type,
    text: item.text,
    meaning: item.meaning,
    difficulty: item.difficulty,
    tags: item.tags,
    prerequisiteItemIds: item.prerequisiteItemIds,
    relatedItemIds: item.relatedItemIds,
    metadata: item.metadata,
  }));
}

export async function ensureTenantHasSeedItems(
  tenantId: string,
  prisma: {
    learningItem: {
      count: (args: { where: { tenantId: string } }) => Promise<number>;
      createMany: (args: { data: ReturnType<typeof buildTenantSeedItemData> }) => Promise<unknown>;
    };
  },
): Promise<void> {
  const existingItems = await prisma.learningItem.count({
    where: {
      tenantId,
    },
  });

  if (existingItems > 0) {
    return;
  }

  await prisma.learningItem.createMany({
    data: buildTenantSeedItemData(tenantId),
  });
}
