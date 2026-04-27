import { prisma } from "../lib/prisma.js";
import { studyOrchestratorService } from "../modules/study-orchestrator/study-orchestrator.module.js";

async function main(): Promise<void> {
  const users = await prisma.user.findMany({
    select: {
      id: true,
    },
  });

  for (const user of users) {
    const result = await studyOrchestratorService.getTodayPackForUser(user.id);

    if (!result) {
      console.warn(`[daily-study-packs] pack unavailable userId=${user.id}`);
      continue;
    }

    console.log(
      `[daily-study-packs] ensured pack id=${result.packId} userId=${user.id}`,
    );
  }
}

main().catch((error) => {
  console.error("[daily-study-packs] generation failed", error);
  process.exit(1);
});
