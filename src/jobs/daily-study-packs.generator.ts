import { prisma } from "../lib/prisma.js";
import { learningEngineService } from "../modules/learning-engine/learning-engine.module.js";

async function main(): Promise<void> {
  const users = await prisma.user.findMany({
    select: {
      id: true,
    },
  });

  for (const user of users) {
    const result = await learningEngineService.generateDailyStudyPack({
      userId: user.id,
    });

    console.log(
      `[daily-study-packs] generated pack id=${result.pack.id} userId=${user.id}`,
    );
  }
}

main().catch((error) => {
  console.error("[daily-study-packs] generation failed", error);
  process.exit(1);
});
