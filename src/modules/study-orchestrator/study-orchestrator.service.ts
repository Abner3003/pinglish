import { Prisma, UserChannelStatus, type LearningItemType } from "../../generated/prisma/index.js";
import { prisma } from "../../lib/prisma.js";
import { learningEngineService } from "../learning-engine/learning-engine.module.js";
import {
  studyPackProviderService,
  type ReviewRequestPayload,
} from "../study-pack-provider/study-pack-provider.module.js";

type StudyPackStudy = {
  itemId: string;
  text: string;
  meaning: string;
  topicKey?: string;
  source?: string;
  order?: number;
  type?: LearningItemType;
};

type HandleInboundResult =
  | {
      kind: "onboarding";
      replyText: string;
    }
  | {
      kind: "study";
      replyText: string;
      answerQuality: number;
      confidence: number;
      reason: string;
      packId: string | null;
      itemId: string;
      awaitingStudyReply: boolean;
    }
  | {
      kind: "bot";
      replyText: string;
    }
  | {
      kind: "ignored";
      replyText?: string;
    };

type PackResult = {
  packId: string;
  remotePackId: string | null;
  studies: StudyPackStudy[];
  targetXp: number;
};

function extractRemotePackIdFromPackItems(items: Prisma.JsonValue): string | null {
  if (!items || typeof items !== "object" || Array.isArray(items)) {
    return null;
  }

  const record = items as Record<string, unknown>;

  return typeof record.remotePackId === "string" && record.remotePackId.trim().length > 0
    ? record.remotePackId
    : null;
}

type CurrentStudyContext = {
  userId: string;
  channel: {
    status: UserChannelStatus;
    awaitingStudyReply: boolean;
    currentPackId: string | null;
    currentStudyItemId: string | null;
    lastInboundAt: string | null;
    lastOutboundAt: string | null;
  } | null;
  pack: {
    id: string;
    date: string;
    generatedAt: string;
    nextReviewAt: string | null;
    reviewCount: number;
    targetXp: number;
    completed: boolean;
  } | null;
  currentStudyItem: StudyPackStudy | null;
  analysisRequest: ReviewRequestPayload | null;
};

type BotReplyInput = {
  userName: string;
  message: string;
  targetLanguage?: string | null;
  interests?: string[] | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeStudies(items: Prisma.JsonValue): StudyPackStudy[] {
  if (Array.isArray(items)) {
    return items.flatMap((entry, index) => normalizeStudyEntry(entry, index));
  }

  if (isRecord(items) && Array.isArray(items.studies)) {
    return items.studies.flatMap((entry, index) => normalizeStudyEntry(entry, index));
  }

  return [];
}

function normalizeStudyEntry(value: unknown, index: number): StudyPackStudy[] {
  if (!isRecord(value)) {
    return [];
  }

  const itemId =
    (typeof value.itemId === "string" && value.itemId) ||
    (typeof value.id === "string" && value.id) ||
    (typeof value.learningItemId === "string" && value.learningItemId) ||
    (typeof value.studyId === "string" && value.studyId);

  const text =
    (typeof value.text === "string" && value.text) ||
    (typeof value.title === "string" && value.title) ||
    (typeof value.prompt === "string" && value.prompt) ||
    (typeof value.content === "string" && value.content);

  const meaning =
    (typeof value.meaning === "string" && value.meaning) ||
    (typeof value.translation === "string" && value.translation) ||
    (typeof value.explanation === "string" && value.explanation) ||
    (typeof value.answer === "string" && value.answer) ||
    "";
  const topicKey =
    (typeof value.topicKey === "string" && value.topicKey) ||
    (typeof value.topic === "string" && value.topic) ||
    (typeof value.concept === "string" && value.concept) ||
    (isRecord(value.metadata) && typeof value.metadata.topic === "string" ? value.metadata.topic : undefined);

  if (!itemId || !text) {
    return [];
  }

  const type = typeof value.type === "string" ? (value.type as LearningItemType) : undefined;
  const order =
    typeof value.order === "number"
      ? value.order
      : typeof value.position === "number"
        ? value.position
        : index + 1;

  return [
    {
      itemId,
      text,
      meaning,
      topicKey,
      source: typeof value.source === "string" ? value.source : undefined,
      order,
      type,
    },
  ];
}

function buildBotReply(input: BotReplyInput): string {
  const normalized = input.message.trim().toLowerCase();
  const languageHint =
    input.targetLanguage === "ENGLISH"
      ? "English"
      : input.targetLanguage === "SPANISH"
        ? "Spanish"
        : input.targetLanguage === "FRENCH"
          ? "French"
          : "idioma";

  if (!normalized) {
    return "Me manda uma frase ou dúvida e eu continuo por aqui.";
  }

  if (normalized.includes("oi") || normalized.includes("olá") || normalized.includes("ola")) {
    return `Oi, ${input.userName}. Posso continuar seu estudo em ${languageHint} ou tirar uma dúvida rápida.`;
  }

  if (normalized.includes("?") || normalized.includes("como") || normalized.includes("what")) {
    return "Entendi sua pergunta. Posso responder com foco no seu estudo ou transformar isso em prática guiada.";
  }

  if (normalized.includes("estudo") || normalized.includes("study") || normalized.includes("lição")) {
    return "Certo. Vou te puxar pelo estudo do dia e seguir a trilha.";
  }

  return `Beleza, ${input.userName}. Se quiser seguir estudando em ${languageHint}, eu continuo daqui.`;
}

function formatStudyPrompt(study: { text: string; meaning?: string | null }): string {
  if (!study.meaning) {
    return study.text;
  }

  return `${study.text} - ${study.meaning}`;
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function scoreToQuality(score: number): 0 | 1 | 2 | 3 | 4 | 5 {
  if (score >= 90) return 5;
  if (score >= 75) return 4;
  if (score >= 55) return 3;
  if (score >= 35) return 2;
  if (score >= 15) return 1;
  return 0;
}

export class StudyOrchestratorService {
  async getTodayPackForUser(
    userId: string,
    options?: { forceRegenerate?: boolean },
  ): Promise<PackResult | null> {
    const today = new Date();
    const startOfDay = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

    if (!options?.forceRegenerate) {
      const existingPack = await prisma.dailyStudyPack.findUnique({
        where: {
          userId_date: {
            userId,
            date: startOfDay,
          },
        },
        select: {
          id: true,
          items: true,
          targetXp: true,
        },
      });

      if (existingPack) {
        const packItems = normalizeStudies(existingPack.items);
        return {
          packId: existingPack.id,
          remotePackId: extractRemotePackIdFromPackItems(existingPack.items),
          studies: packItems,
          targetXp: existingPack.targetXp,
        };
      }
    }

    const result = await learningEngineService.generateDailyStudyPack({ userId });
    if (!result) {
      return null;
    }

    const packItems = normalizeStudies(result.pack.items);
    const studies = result.studies.length > 0 ? result.studies : packItems;

    return {
      packId: result.pack.id,
      remotePackId: result.remotePackId ?? null,
      studies,
      targetXp: result.pack.targetXp,
    };
  }

  async getCurrentStudyContext(userId: string): Promise<CurrentStudyContext> {
    const channel = await prisma.userChannel.findUnique({
      where: { userId },
      select: {
        status: true,
        awaitingStudyReply: true,
        currentPackId: true,
        currentStudyItemId: true,
        lastInboundAt: true,
        lastOutboundAt: true,
      },
    });

    const pack = channel?.currentPackId
      ? await prisma.dailyStudyPack.findUnique({
          where: {
            id: channel.currentPackId,
          },
          select: {
            id: true,
            date: true,
            generatedAt: true,
            nextReviewAt: true,
            reviewCount: true,
            targetXp: true,
            completed: true,
            items: true,
          },
        })
      : null;

    const studies = pack ? normalizeStudies(pack.items) : [];
    const currentStudyItem = channel?.currentStudyItemId
      ? studies.find((study) => study.itemId === channel.currentStudyItemId) ?? null
      : null;

    return {
      userId,
      channel: channel
        ? {
            status: channel.status,
            awaitingStudyReply: channel.awaitingStudyReply,
            currentPackId: channel.currentPackId,
            currentStudyItemId: channel.currentStudyItemId,
            lastInboundAt: channel.lastInboundAt?.toISOString() ?? null,
            lastOutboundAt: channel.lastOutboundAt?.toISOString() ?? null,
          }
        : null,
      pack: pack
        ? {
            id: pack.id,
            date: pack.date.toISOString(),
            generatedAt: pack.generatedAt.toISOString(),
            nextReviewAt: pack.nextReviewAt?.toISOString() ?? null,
            reviewCount: pack.reviewCount,
            targetXp: pack.targetXp,
            completed: pack.completed,
          }
        : null,
      currentStudyItem,
      analysisRequest: currentStudyItem && pack
        ? {
            userId,
            packageId: pack.id,
            packItemId: currentStudyItem.itemId,
            userResponse: "",
            mode: "teach",
          }
        : null,
    };
  }

  async startDailyStudySession(
    userId: string,
    options?: { forceRegenerate?: boolean },
  ): Promise<{ replyText: string; packId: string | null; itemId: string | null } | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
      },
    });

    if (!user) {
      return {
        replyText: "Usuário não encontrado para iniciar a sessão de estudo.",
        packId: null,
        itemId: null,
      };
    }

    const pack = await this.getTodayPackForUser(userId, options);
    if (!pack) {
      return null;
    }
    const firstItem = pack.studies[0] ?? null;

    await prisma.dailyStudyPack.update({
      where: {
        id: pack.packId,
      },
      data: {
        nextReviewAt: null,
        completed: false,
      },
    });

    await prisma.userChannel.upsert({
      where: {
        userId,
      },
      update: {
        status: UserChannelStatus.OPT_IN,
        awaitingStudyReply: Boolean(firstItem),
        currentPackId: pack.packId,
        currentStudyItemId: firstItem?.itemId ?? null,
        lastOutboundAt: new Date(),
      },
      create: {
        userId,
        status: UserChannelStatus.OPT_IN,
        onboardingStep: 1,
        awaitingStudyReply: Boolean(firstItem),
        currentPackId: pack.packId,
        currentStudyItemId: firstItem?.itemId ?? null,
        lastOutboundAt: new Date(),
      },
    });

    if (!firstItem) {
      return {
        replyText: "Seu pack do dia está pronto, mas ainda não encontrei estudos para enviar.",
        packId: pack.packId,
        itemId: null,
      };
    }

    return {
      replyText: [
        "Seu primeiro estudo está pronto:",
        "",
        `1. ${formatStudyPrompt(firstItem)}`,
        "",
        "Responda com o que você entendeu.",
      ].join("\n"),
      packId: pack.packId,
      itemId: firstItem.itemId,
    };
  }

  async handleOptInMessage(input: {
    userId: string;
    userName: string;
    text: string;
  }): Promise<HandleInboundResult> {
    const channel = await prisma.userChannel.findUnique({
      where: { userId: input.userId },
      select: {
        status: true,
        awaitingStudyReply: true,
        currentPackId: true,
        currentStudyItemId: true,
      },
    });

    if (!channel || channel.status !== UserChannelStatus.OPT_IN) {
      return {
        kind: "ignored",
      };
    }

    await prisma.userChannel.update({
      where: { userId: input.userId },
      data: {
        lastInboundAt: new Date(),
        lastOutboundAt: new Date(),
      },
    });

    if (!channel.awaitingStudyReply || !channel.currentStudyItemId) {
      return {
        kind: "bot",
        replyText: buildBotReply({
          userName: input.userName,
          message: input.text,
        }),
      };
    }

    const pack = await this.getTodayPackForUser(input.userId);
    if (!pack) {
      return {
        kind: "ignored",
      };
    }
    const currentItem = pack.studies.find((study) => study.itemId === channel.currentStudyItemId);

    if (!currentItem) {
      await prisma.userChannel.update({
        where: { userId: input.userId },
        data: {
          awaitingStudyReply: false,
          currentStudyItemId: null,
        },
      });

      return {
        kind: "bot",
        replyText: buildBotReply({
          userName: input.userName,
          message: input.text,
        }),
      };
    }

    const conceptState = await prisma.userConceptState.findUnique({
      where: {
        userId_topicKey: {
          userId: input.userId,
          topicKey: currentItem.topicKey ?? currentItem.itemId,
        },
      },
    });

    const reviewMode =
      conceptState?.lastResult === "correct" || (conceptState?.lastAnswerQuality ?? 0) >= 4
        ? "drill"
        : "remediate";

    const analysisRequest = studyPackProviderService.buildReviewRequestPayload({
      userId: input.userId,
      packageId: pack.remotePackId ?? pack.packId,
      packItemId: currentItem.itemId,
      mode: reviewMode,
      session_id: pack.packId,
      lesson_goal: "translation",
      difficulty: "easy",
      topic: currentItem.topicKey ?? currentItem.itemId,
      language: "pt-BR",
      user_answer: input.text,
      context: {
        history_summary:
          conceptState?.conceptSeenAt && conceptState.lastResult === "correct"
            ? "usuário já respondeu corretamente esse conceito antes"
            : "usuário está respondendo a um conceito em estudo",
        last_error:
          conceptState?.lastResult && conceptState.lastResult !== "correct"
            ? "resposta anterior não consolidou o conceito"
            : undefined,
      },
    });

    const analysis = await studyPackProviderService.analyzeReviewResponse(analysisRequest);

    if (!analysis) {
      return {
        kind: "ignored",
      };
    }

    const now = new Date();
    const earnedXp = analysis.data.xp ?? 0;

    await learningEngineService.recordStudyEvent({
      userId: input.userId,
      itemId: currentItem.itemId,
      packId: channel.currentPackId ?? pack.packId,
      eventType: "ANSWERED",
      answerQuality: scoreToQuality(analysis.data.score ?? 0),
      isCorrect: analysis.data.correct,
      xpEarned: analysis.data.xp ?? 0,
    });

    const currentIndex = pack.studies.findIndex((study) => study.itemId === currentItem.itemId);
    const nextItem = pack.studies[currentIndex + 1] ?? null;

    console.info(
      {
        scope: "study-orchestrator",
        step: "handleOptInMessage",
        userId: input.userId,
        packId: pack.remotePackId ?? pack.packId,
        itemId: currentItem.itemId,
        xpEarned: earnedXp,
        nextReviewAt: nextItem ? null : addHours(now, 2).toISOString(),
        awaitingStudyReply: Boolean(nextItem),
      },
      "[study-response] processed",
    );

    if (nextItem) {
      await prisma.userChannel.update({
        where: { userId: input.userId },
        data: {
          awaitingStudyReply: true,
          currentPackId: pack.packId,
          currentStudyItemId: nextItem.itemId,
          lastOutboundAt: new Date(),
        },
      });

      return {
        kind: "study",
        replyText: [
          analysis.data.feedback || "Resposta registrada.",
          "",
          analysis.data.corrections.length > 0
            ? analysis.data.corrections.join("\n")
            : "Vamos para o próximo item.",
          "",
          `Próximo:`,
          "",
          `${currentIndex + 2}. ${formatStudyPrompt(nextItem)}`,
        ].join("\n"),
        answerQuality: scoreToQuality(analysis.data.score ?? 0),
        confidence: analysis.data.score ? Math.min(1, Math.max(0.3, analysis.data.score / 100)) : 0.4,
        reason: analysis.data.source,
        packId: pack.packId,
        itemId: nextItem.itemId,
        awaitingStudyReply: true,
      };
    }

    const retryMessage = [
      analysis.data.feedback || "Resposta registrada.",
      "",
      "Seu pack terminou por agora.",
      "Vou reagendar esse mesmo pack para daqui a 2 horas.",
    ].join("\n");

    await prisma.userChannel.update({
      where: { userId: input.userId },
      data: {
        awaitingStudyReply: false,
        currentPackId: pack.packId,
        currentStudyItemId: null,
        lastOutboundAt: now,
      },
    });

    await prisma.dailyStudyPack.update({
      where: { id: pack.packId },
      data: {
        completed: true,
        nextReviewAt: addHours(now, 2),
        reviewCount: {
          increment: 1,
        },
      },
    });

    console.info(
      {
        scope: "study-orchestrator",
        step: "handleOptInMessage",
        userId: input.userId,
        packId: pack.remotePackId ?? pack.packId,
        itemId: currentItem.itemId,
        xpEarned: earnedXp,
        nextReviewAt: addHours(now, 2).toISOString(),
        awaitingStudyReply: false,
      },
      "[study-response] scheduled review",
    );

      return {
        kind: "study",
        replyText: retryMessage,
        answerQuality: scoreToQuality(analysis.data.score ?? 0),
        confidence: analysis.data.score ? Math.min(1, Math.max(0.3, analysis.data.score / 100)) : 0.4,
        reason: analysis.data.source,
        packId: pack.packId,
        itemId: currentItem.itemId,
        awaitingStudyReply: false,
      };
  }

  async handleOptInConversation(input: {
    userId: string;
    userName: string;
    text: string;
    targetLanguage?: string | null;
    interests?: string[] | null;
  }): Promise<HandleInboundResult> {
    const channel = await prisma.userChannel.findUnique({
      where: { userId: input.userId },
      select: {
        status: true,
        awaitingStudyReply: true,
      },
    });

    if (!channel || channel.status !== UserChannelStatus.OPT_IN) {
      return {
        kind: "ignored",
      };
    }

    if (channel.awaitingStudyReply) {
      return this.handleOptInMessage({
        userId: input.userId,
        userName: input.userName,
        text: input.text,
      });
    }

    await prisma.userChannel.update({
      where: { userId: input.userId },
      data: {
        lastInboundAt: new Date(),
        lastOutboundAt: new Date(),
      },
    });

    return {
      kind: "bot",
      replyText: buildBotReply({
        userName: input.userName,
        message: input.text,
        targetLanguage: input.targetLanguage,
        interests: input.interests,
      }),
    };
  }

  async resolveUserChannelState(userId: string) {
    return prisma.userChannel.findUnique({
      where: { userId },
      select: {
        status: true,
        awaitingStudyReply: true,
        currentPackId: true,
        currentStudyItemId: true,
        lastInboundAt: true,
        lastOutboundAt: true,
      },
    });
  }
}

export const studyOrchestratorService = new StudyOrchestratorService();
