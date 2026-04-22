import { Prisma, UserChannelStatus, type LearningItemType } from "../../generated/prisma/index.js";
import { prisma } from "../../lib/prisma.js";
import { learningEngineService } from "../learning-engine/learning-engine.module.js";
import { learningResponseClassifier } from "../learning-response/learning-response.classifier.js";
import { resolveDefaultTenantId } from "../tenants/default-tenant.service.js";

type StudyPackStudy = {
  itemId: string;
  text: string;
  meaning: string;
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
  studies: StudyPackStudy[];
  targetXp: number;
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

export class StudyOrchestratorService {
  async getTodayPackForUser(userId: string): Promise<PackResult> {
    const result = await learningEngineService.generateDailyStudyPack({ userId });
    const packItems = normalizeStudies(result.pack.items);
    const studies = result.studies.length > 0 ? result.studies : packItems;

    return {
      packId: result.pack.id,
      studies,
      targetXp: result.pack.targetXp,
    };
  }

  async startDailyStudySession(userId: string): Promise<{ replyText: string; packId: string | null; itemId: string | null }> {
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

    const pack = await this.getTodayPackForUser(userId);
    const firstItem = pack.studies[0] ?? null;

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
        `1. ${firstItem.text} - ${firstItem.meaning}`,
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

    const classification = learningResponseClassifier.classify({
      userText: input.text,
      expectedText: currentItem.text,
      itemType: currentItem.type ?? "EXAMPLE",
    });

    await learningEngineService.recordStudyEvent({
      userId: input.userId,
      itemId: currentItem.itemId,
      packId: channel.currentPackId ?? pack.packId,
      eventType: "ANSWERED",
      answerQuality: classification.answerQuality,
      isCorrect: classification.answerQuality >= 3,
    });

    const currentIndex = pack.studies.findIndex((study) => study.itemId === currentItem.itemId);
    const nextItem = pack.studies[currentIndex + 1] ?? null;

    if (classification.answerQuality >= 3 && nextItem) {
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
          `Boa. Vamos para o próximo:`,
          "",
          `${currentIndex + 2}. ${nextItem.text} - ${nextItem.meaning}`,
        ].join("\n"),
        answerQuality: classification.answerQuality,
        confidence: classification.confidence,
        reason: classification.reason,
        packId: pack.packId,
        itemId: nextItem.itemId,
        awaitingStudyReply: true,
      };
    }

    const retryMessage =
      classification.answerQuality >= 3
        ? "Boa resposta. Seu bloco de estudo terminou por agora."
        : "Quase. Vou manter esse item e você pode tentar de novo.";

    await prisma.userChannel.update({
      where: { userId: input.userId },
      data: {
        awaitingStudyReply: classification.answerQuality < 3,
        currentPackId: pack.packId,
        currentStudyItemId: classification.answerQuality < 3 ? currentItem.itemId : null,
        lastOutboundAt: new Date(),
      },
    });

    return {
      kind: "study",
      replyText: retryMessage,
      answerQuality: classification.answerQuality,
      confidence: classification.confidence,
      reason: classification.reason,
      packId: pack.packId,
      itemId: currentItem.itemId,
      awaitingStudyReply: classification.answerQuality < 3,
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
