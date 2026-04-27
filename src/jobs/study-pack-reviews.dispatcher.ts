import { prisma } from "../lib/prisma.js";
import { logWhatsAppRuntimeConfig } from "../lib/runtime-diagnostics.js";
import { metaWhatsAppService } from "../modules/meta-whatsapp/meta-whatsapp.module.js";
import { studyOrchestratorService } from "../modules/study-orchestrator/study-orchestrator.module.js";
import { UserChannelStatus } from "../generated/prisma/index.js";

export async function runStudyPackReviewsDispatcher(): Promise<void> {
  logWhatsAppRuntimeConfig(console, "study-pack-reviews-dispatcher");

  const now = new Date();

  const duePacks = await prisma.dailyStudyPack.findMany({
    where: {
      completed: true,
      nextReviewAt: {
        lte: now,
      },
      user: {
        userChannel: {
          status: UserChannelStatus.OPT_IN,
          awaitingStudyReply: false,
        },
      },
    },
    select: {
      id: true,
      userId: true,
    },
    orderBy: {
      nextReviewAt: "asc",
    },
  });

  for (const pack of duePacks) {
    const user = await prisma.user.findUnique({
      where: {
        id: pack.userId,
      },
      select: {
        id: true,
        name: true,
        phone: true,
      },
    });

    if (!user) {
      continue;
    }

    const session = await studyOrchestratorService.startDailyStudySession(user.id);

    if (!session || !session.replyText) {
      console.warn(
        `[study-pack-reviews] session unavailable packId=${pack.id} userId=${user.id}`,
      );
      continue;
    }

    await metaWhatsAppService.sendWhatsAppMessage(user.phone, session.replyText);

    console.log(
      `[study-pack-reviews] dispatched packId=${pack.id} userId=${user.id}`,
    );
  }
}

async function main(): Promise<void> {
  await runStudyPackReviewsDispatcher();
}

main().catch((error) => {
  console.error("[study-pack-reviews] dispatch failed", error);
  process.exit(1);
});
