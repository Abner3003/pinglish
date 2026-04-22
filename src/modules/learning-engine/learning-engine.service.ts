import { prisma } from "../../lib/prisma.js";
import { LeagueRank, UserJourneyLevel, UserLearningStateStatus, type Prisma } from "../../generated/prisma/index.js";
import { studyPackProviderService } from "../study-pack-provider/study-pack-provider.module.js";
import { resolveDefaultTenantId } from "../tenants/default-tenant.service.js";

type AnswerQuality = 0 | 1 | 2 | 3 | 4 | 5;
type StudyEventType = "ANSWERED" | "REVIEWED" | "SKIPPED" | "LESSON_COMPLETED";
type LearningItemType = "LEXICAL_CHUNK" | "PATTERN" | "EXAMPLE" | "MICRO_LESSON";
type LeagueRecord = {
  id: string;
  rank: "D" | "C" | "B" | "A" | "S" | "SS";
  xpTotalMin: number;
  xpTotalMax: number | null;
  xpInRank: number | null;
  equivalentActionsApprox: number | null;
};

type StudyEventInput = {
  userId: string;
  itemId: string;
  packId?: string | null;
  eventType: StudyEventType;
  answerQuality?: number | null;
  isCorrect?: boolean | null;
  xpEarned?: number | null;
  occurredAt?: Date;
};

type GeneratePackInput = {
  userId: string;
  tenantId?: string | null;
  date?: Date;
};

type StudyPackStudy = {
  itemId: string;
  text: string;
  meaning: string;
  source: "due_review" | "reinforcement" | "new_content" | "remote";
  order: number;
};

type LearningStateRecord = {
  userId: string;
  itemId: string;
  status: "NEW" | "LEARNING" | "REVIEW" | "MASTERED" | "SUSPENDED";
  easeFactor: number;
  intervalDays: number;
  repetitionCount: number;
  lastReviewedAt: Date | null;
  nextReviewAt: Date | null;
  lapses: number;
  consecutiveCorrect: number;
  consecutiveWrong: number;
  masteryScore: number;
};

type LearningProfileRecord = {
  timezone: string;
  targetLanguage: string;
  goal: "TRAVEL" | "WORK" | "CONVERSATION" | "SCHOOL" | "OTHER";
  interests: string[];
};

const rankOrder = ["D", "C", "B", "A", "S", "SS"] as const;
const levelOrder = [
  UserJourneyLevel.INICIANTE,
  UserJourneyLevel.PRE_INTERMEDIARIO,
  UserJourneyLevel.INTERMEDIARIO,
  UserJourneyLevel.AVANCADO,
  UserJourneyLevel.PROFICIENTE,
] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function dayKey(date: Date): string {
  return startOfUtcDay(date).toISOString().slice(0, 10);
}

function normalizeAnswerQuality(input: {
  answerQuality?: number | null;
  isCorrect?: boolean | null;
  eventType: StudyEventType;
}): AnswerQuality | undefined {
  if (
    input.answerQuality !== undefined &&
    input.answerQuality !== null &&
    Number.isInteger(input.answerQuality) &&
    input.answerQuality >= 0 &&
    input.answerQuality <= 5
  ) {
    return input.answerQuality as AnswerQuality;
  }

  if (input.isCorrect === true) {
    return 4;
  }

  if (input.isCorrect === false) {
    return 0;
  }

  if (input.eventType === "SKIPPED") {
    return 0;
  }

  return undefined;
}

function xpFromQuality(quality: AnswerQuality | undefined): number {
  switch (quality) {
    case 0:
      return 0;
    case 1:
      return 3;
    case 2:
      return 6;
    case 3:
      return 10;
    case 4:
      return 15;
    case 5:
      return 20;
    default:
      return 0;
  }
}

function qualityToSuccess(quality: AnswerQuality | undefined): boolean {
  return quality !== undefined && quality >= 3;
}

function resolveJourneyLevel(totalXp: number): (typeof levelOrder)[number] {
  if (totalXp < 200) {
    return UserJourneyLevel.INICIANTE;
  }

  if (totalXp < 600) {
    return UserJourneyLevel.PRE_INTERMEDIARIO;
  }

  if (totalXp < 1200) {
    return UserJourneyLevel.INTERMEDIARIO;
  }

  if (totalXp < 2200) {
    return UserJourneyLevel.AVANCADO;
  }

  return UserJourneyLevel.PROFICIENTE;
}

function scoreFromQuality(quality: AnswerQuality | undefined): number {
  switch (quality) {
    case 0:
    case 1:
      return -12;
    case 2:
      return 4;
    case 3:
      return 8;
    case 4:
      return 12;
    case 5:
      return 15;
    default:
      return 0;
  }
}

function resolveStateUpdate(input: {
  currentState: LearningStateRecord;
  quality: AnswerQuality | undefined;
  occurredAt: Date;
}): LearningStateRecord {
  const quality = input.quality;
  const failure = quality === undefined || quality <= 1;
  const effort = quality === 2;
  const correct = quality !== undefined && quality >= 3;

  let intervalDays = input.currentState.intervalDays;
  let easeFactor = input.currentState.easeFactor;
  let masteryScore = input.currentState.masteryScore;
  let status = input.currentState.status;
  let repetitionCount = input.currentState.repetitionCount + 1;
  let consecutiveCorrect = input.currentState.consecutiveCorrect;
  let consecutiveWrong = input.currentState.consecutiveWrong;
  let lapses = input.currentState.lapses;

  if (failure) {
    intervalDays = 1;
    easeFactor = clamp(easeFactor - 0.2, 1.3, 3.0);
    status = UserLearningStateStatus.LEARNING;
    consecutiveWrong += 1;
    consecutiveCorrect = 0;
    lapses += 1;
    masteryScore = clamp(masteryScore + scoreFromQuality(quality), 0, 100);
  } else if (effort) {
    intervalDays = Math.max(1, Math.round(Math.max(1, intervalDays) * 1.5));
    easeFactor = clamp(easeFactor - 0.05, 1.3, 3.0);
    status = UserLearningStateStatus.LEARNING;
    consecutiveCorrect += 1;
    consecutiveWrong = 0;
    masteryScore = clamp(masteryScore + scoreFromQuality(quality), 0, 100);
  } else if (quality === 3) {
    intervalDays = Math.max(1, Math.round(Math.max(1, intervalDays) * 1.5));
    easeFactor = clamp(easeFactor, 1.3, 3.0);
    status = UserLearningStateStatus.REVIEW;
    consecutiveCorrect += 1;
    consecutiveWrong = 0;
    masteryScore = clamp(masteryScore + scoreFromQuality(quality), 0, 100);
  } else if (quality === 4) {
    intervalDays = Math.max(1, Math.round(Math.max(1, intervalDays) * easeFactor));
    easeFactor = clamp(easeFactor + 0.05, 1.3, 3.0);
    status = UserLearningStateStatus.REVIEW;
    consecutiveCorrect += 1;
    consecutiveWrong = 0;
    masteryScore = clamp(masteryScore + scoreFromQuality(quality), 0, 100);
  } else {
    intervalDays = Math.max(
      1,
      Math.round(Math.max(1, intervalDays) * (easeFactor + 0.15)),
    );
    easeFactor = clamp(easeFactor + 0.1, 1.3, 3.0);
    status = UserLearningStateStatus.REVIEW;
    consecutiveCorrect += 1;
    consecutiveWrong = 0;
    masteryScore = clamp(masteryScore + scoreFromQuality(quality), 0, 100);
  }

  if (correct && masteryScore >= 80 && consecutiveCorrect >= 3) {
    status = UserLearningStateStatus.MASTERED;
    intervalDays = Math.max(intervalDays, 30);
  }

  return {
    ...input.currentState,
    status,
    easeFactor,
    intervalDays,
    repetitionCount,
    lastReviewedAt: input.occurredAt,
    nextReviewAt: addDays(startOfUtcDay(input.occurredAt), intervalDays),
    lapses,
    consecutiveCorrect,
    consecutiveWrong,
    masteryScore,
  };
}

function resolveStreakDays(events: Array<{ occurredAt: Date }>, now: Date): number {
  const daySet = new Set(events.map((event) => dayKey(event.occurredAt)));
  let streak = 0;
  let cursor = startOfUtcDay(now);

  while (daySet.has(dayKey(cursor))) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }

  return streak;
}

function resolveAccuracy(
  events: Array<{
    occurredAt: Date;
    answerQuality: number | null;
    isCorrect: boolean | null;
    eventType: StudyEventType;
  }>,
  windowDays: number,
  now: Date,
): number {
  const lowerBound = now.getTime() - windowDays * 24 * 60 * 60 * 1000;
  const windowEvents = events.filter((event) => event.occurredAt.getTime() >= lowerBound);
  const answerable = windowEvents.filter((event) => event.eventType !== "SKIPPED");

  if (answerable.length === 0) {
    return 0;
  }

  const successCount = answerable.filter((event) =>
    qualityToSuccess(normalizeAnswerQuality(event)),
  ).length;

  return successCount / answerable.length;
}

function resolveLeagueEligibility(rank: LeagueRecord["rank"], signals: {
  totalXp: number;
  accuracy7d: number;
  accuracy14d: number;
  accuracy30d: number;
  streakDays: number;
  masteredItems: number;
}): boolean {
  switch (rank) {
    case "D":
      return true;
    case "C":
      return signals.totalXp >= 200 && signals.accuracy7d >= 0.6;
    case "B":
      return signals.totalXp >= 600 && signals.accuracy7d >= 0.7 && signals.streakDays >= 5;
    case "A":
      return (
        signals.totalXp >= 1200 &&
        signals.accuracy14d >= 0.75 &&
        signals.masteredItems >= 40
      );
    case "S":
      return (
        signals.totalXp >= 2200 &&
        signals.accuracy14d >= 0.8 &&
        signals.masteredItems >= 100
      );
    case "SS":
      return (
        signals.totalXp >= 4000 &&
        signals.accuracy30d >= 0.85 &&
        signals.masteredItems >= 180
      );
  }
}

function resolveDailyPackSize(level: (typeof levelOrder)[number]): number {
  switch (level) {
    case UserJourneyLevel.INICIANTE:
      return 8;
    case UserJourneyLevel.PRE_INTERMEDIARIO:
      return 10;
    case UserJourneyLevel.INTERMEDIARIO:
      return 12;
    case UserJourneyLevel.AVANCADO:
      return 14;
    case UserJourneyLevel.PROFICIENTE:
      return 16;
  }
}

function resolveLearningItemTypeWeight(type: LearningItemType): number {
  switch (type) {
    case "LEXICAL_CHUNK":
      return 1;
    case "PATTERN":
      return 2;
    case "EXAMPLE":
      return 3;
    case "MICRO_LESSON":
      return 4;
  }
}

export class LearningEngineService {
  async recordStudyEvent(input: StudyEventInput) {
    const occurredAt = input.occurredAt ?? new Date();
    const quality = normalizeAnswerQuality({
      answerQuality: input.answerQuality,
      isCorrect: input.isCorrect,
      eventType: input.eventType,
    });

    const event = await prisma.$transaction(async (tx) => {
      const createdEvent = await tx.studyEvent.create({
        data: {
          userId: input.userId,
          itemId: input.itemId,
          packId: input.packId ?? null,
          eventType: input.eventType,
          answerQuality: input.answerQuality ?? null,
          isCorrect: input.isCorrect ?? null,
          xpEarned: input.xpEarned ?? xpFromQuality(quality),
          occurredAt,
        },
      });

      if (quality !== undefined) {
        const currentState = await tx.userLearningState.upsert({
          where: {
            userId_itemId: {
              userId: input.userId,
              itemId: input.itemId,
            },
          },
          create: {
            userId: input.userId,
            itemId: input.itemId,
            status: UserLearningStateStatus.NEW,
            easeFactor: 2.5,
            intervalDays: 0,
            repetitionCount: 0,
            lastReviewedAt: null,
            nextReviewAt: null,
            lapses: 0,
            consecutiveCorrect: 0,
            consecutiveWrong: 0,
            masteryScore: 0,
          },
          update: {},
        });

        const nextState = resolveStateUpdate({
          currentState: {
            userId: currentState.userId,
            itemId: currentState.itemId,
            status: currentState.status,
            easeFactor: currentState.easeFactor,
            intervalDays: currentState.intervalDays,
            repetitionCount: currentState.repetitionCount,
            lastReviewedAt: currentState.lastReviewedAt,
            nextReviewAt: currentState.nextReviewAt,
            lapses: currentState.lapses,
            consecutiveCorrect: currentState.consecutiveCorrect,
            consecutiveWrong: currentState.consecutiveWrong,
            masteryScore: currentState.masteryScore,
          },
          quality,
          occurredAt,
        });

        await tx.userLearningState.update({
          where: {
            userId_itemId: {
              userId: input.userId,
              itemId: input.itemId,
            },
          },
          data: {
            status: nextState.status,
            easeFactor: nextState.easeFactor,
            intervalDays: nextState.intervalDays,
            repetitionCount: nextState.repetitionCount,
            lastReviewedAt: nextState.lastReviewedAt,
            nextReviewAt: nextState.nextReviewAt,
            lapses: nextState.lapses,
            consecutiveCorrect: nextState.consecutiveCorrect,
            consecutiveWrong: nextState.consecutiveWrong,
            masteryScore: nextState.masteryScore,
          },
        });
      }

      await this.recalculateProgression(tx, input.userId, occurredAt);

      return createdEvent;
    });

    return event;
  }

  async generateDailyStudyPack(input: GeneratePackInput) {
    const remotePack = await this.generateRemoteDailyStudyPack(input);

    if (remotePack) {
      return remotePack;
    }

    return this.generateLocalDailyStudyPack(input);
  }

  private async generateRemoteDailyStudyPack(input: GeneratePackInput) {
    const date = startOfUtcDay(input.date ?? new Date());

    const profile = await prisma.learningProfile.findUnique({
      where: { userId: input.userId },
    });

    const journey = await prisma.userJourney.findUnique({
      where: { userId: input.userId },
    });

    const learningProfile: LearningProfileRecord | null = profile
      ? {
          timezone: profile.timezone,
          targetLanguage: profile.targetLanguage,
          goal: profile.goal,
          interests: profile.interests,
        }
      : null;

    const level = journey?.level ?? UserJourneyLevel.INICIANTE;
    const tenantId =
      input.tenantId ?? profile?.tenantId ?? (await resolveDefaultTenantId());

    const mountResult = await studyPackProviderService.mountPack({
      userId: input.userId,
      tenantId,
      level,
      interests: learningProfile?.interests ?? [],
    });

    if (!mountResult) {
      return null;
    }

    const fetchedPack = (await studyPackProviderService.getPackById(mountResult.remotePackId)) ?? mountResult;
    const studies = this.normalizeRemoteStudies(fetchedPack.studies);
    const targetXp = fetchedPack.targetXp ?? Math.max(studies.length * 10, 0);
    const snapshot = {
      provider: "external-study-service",
      remotePackId: mountResult.remotePackId,
      userId: input.userId,
      tenantId,
      level,
      interests: learningProfile?.interests ?? [],
      studies,
      targetXp,
      generatedAt: new Date().toISOString(),
      raw: fetchedPack.raw,
    } as Prisma.InputJsonValue;

    const pack = await prisma.dailyStudyPack.upsert({
      where: {
        userId_date: {
          userId: input.userId,
          date,
        },
      },
      create: {
        userId: input.userId,
        date,
        generatedAt: new Date(),
        items: snapshot,
        targetXp,
        completed: false,
      },
      update: {
        generatedAt: new Date(),
        items: snapshot,
        targetXp,
        completed: false,
      },
    });

    return {
      pack,
      profile: learningProfile,
      studies,
    };
  }

  private async generateLocalDailyStudyPack(input: GeneratePackInput) {
    const date = startOfUtcDay(input.date ?? new Date());

    return prisma.$transaction(async (tx) => {
      const profile = await tx.learningProfile.findUnique({
        where: { userId: input.userId },
      });

      const journey = await tx.userJourney.findUnique({
        where: { userId: input.userId },
      });

      const learningProfile: LearningProfileRecord | null = profile
        ? {
            timezone: profile.timezone,
            targetLanguage: profile.targetLanguage,
            goal: profile.goal,
            interests: profile.interests,
          }
        : null;

      const level = journey?.level ?? UserJourneyLevel.INICIANTE;
      const tenantId =
        input.tenantId ?? profile?.tenantId ?? (await resolveDefaultTenantId());
      const totalSlots = resolveDailyPackSize(level);
      const reviewTarget = Math.max(2, Math.round(totalSlots * 0.6));
      const reinforcementTarget = Math.max(1, Math.round(totalSlots * 0.2));
      const newTarget = Math.max(1, totalSlots - reviewTarget - reinforcementTarget);

      const dueStates = await tx.userLearningState.findMany({
        where: {
          userId: input.userId,
          nextReviewAt: {
            lte: new Date(),
          },
          ...(tenantId
            ? {
                item: {
                  tenantId,
                },
              }
            : {}),
        },
        include: {
          item: true,
        },
        orderBy: {
          nextReviewAt: "asc",
        },
      });

      const allItems = await tx.learningItem.findMany({
        where: {
          ...(tenantId ? { tenantId } : {}),
        },
        orderBy: [{ difficulty: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          tenantId: true,
          type: true,
          text: true,
          meaning: true,
          difficulty: true,
          tags: true,
          prerequisiteItemIds: true,
          relatedItemIds: true,
          metadata: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      const stateByItemId = new Map(
        (
          await tx.userLearningState.findMany({
            where: {
              userId: input.userId,
            },
            select: {
              itemId: true,
              status: true,
              masteryScore: true,
            },
          })
        ).map((state) => [state.itemId, state]),
      );

      const dueItemIds = new Set(dueStates.map((state) => state.itemId));
      const dueItems = dueStates.slice(0, reviewTarget).map((state, index) => ({
        itemId: state.itemId,
        text: state.item.text,
        meaning: state.item.meaning,
        source: "due_review" as const,
        order: index + 1,
      }));

      const reinforcementCandidates = allItems
        .filter((item) => {
          if (dueItemIds.has(item.id)) {
            return false;
          }

          const state = stateByItemId.get(item.id);
          if (!state) {
            return false;
          }

          return (
            state.status === UserLearningStateStatus.LEARNING ||
            (state.status === UserLearningStateStatus.REVIEW && state.masteryScore < 80)
          );
        })
        .slice(0, reinforcementTarget)
        .map((item, index) => ({
          itemId: item.id,
          text: item.text,
          meaning: item.meaning,
          source: "reinforcement" as const,
          order: dueItems.length + index + 1,
        }));

      const newCandidates = allItems
        .filter((item) => !stateByItemId.has(item.id) && this.isNewContentEligible(item, level))
        .slice(0, newTarget)
        .map((item, index) => ({
          itemId: item.id,
          text: item.text,
          meaning: item.meaning,
          source: "new_content" as const,
          order: dueItems.length + reinforcementCandidates.length + index + 1,
        }));

      const studies = [...dueItems, ...reinforcementCandidates, ...newCandidates];
      const items = studies.map(({ itemId, source, order }) => ({
        itemId,
        source,
        order,
      }));
      const targetXp =
        dueItems.length * 10 + reinforcementCandidates.length * 6 + newCandidates.length * 12;

      const pack = await tx.dailyStudyPack.upsert({
        where: {
          userId_date: {
            userId: input.userId,
            date,
          },
        },
        create: {
          userId: input.userId,
          date,
          generatedAt: new Date(),
          items: items as Prisma.InputJsonValue,
          targetXp,
          completed: false,
        },
        update: {
          generatedAt: new Date(),
          items: items as Prisma.InputJsonValue,
          targetXp,
          completed: false,
        },
      });

      return {
        pack,
        profile: learningProfile,
        studies,
      };
    });
  }

  private async recalculateProgression(
    tx: Prisma.TransactionClient,
    userId: string,
    now: Date,
  ) {
    const events = await tx.studyEvent.findMany({
      where: {
        userId,
        occurredAt: {
          lte: now,
        },
      },
      select: {
        occurredAt: true,
        xpEarned: true,
        answerQuality: true,
        isCorrect: true,
        eventType: true,
      },
    });

    const totalXp = events.reduce((sum, event) => {
      if (event.xpEarned !== null) {
        return sum + event.xpEarned;
      }

      const quality = normalizeAnswerQuality({
        answerQuality: event.answerQuality as AnswerQuality | null,
        isCorrect: event.isCorrect,
        eventType: event.eventType as StudyEventType,
      });

      return sum + xpFromQuality(quality);
    }, 0);

    const accuracy7d = resolveAccuracy(
      events.map((event) => ({
        occurredAt: event.occurredAt,
        answerQuality: event.answerQuality as number | null,
        isCorrect: event.isCorrect,
        eventType: event.eventType as StudyEventType,
      })),
      7,
      now,
    );

    const accuracy14d = resolveAccuracy(
      events.map((event) => ({
        occurredAt: event.occurredAt,
        answerQuality: event.answerQuality as number | null,
        isCorrect: event.isCorrect,
        eventType: event.eventType as StudyEventType,
      })),
      14,
      now,
    );

    const accuracy30d = resolveAccuracy(
      events.map((event) => ({
        occurredAt: event.occurredAt,
        answerQuality: event.answerQuality as number | null,
        isCorrect: event.isCorrect,
        eventType: event.eventType as StudyEventType,
      })),
      30,
      now,
    );

    const streakDays = resolveStreakDays(
      events.map((event) => ({ occurredAt: event.occurredAt })),
      now,
    );

    const masteredItems = await tx.userLearningState.count({
      where: {
        userId,
        status: UserLearningStateStatus.MASTERED,
      },
    });

    const leagues = await tx.league.findMany({
      orderBy: {
        xpTotalMin: "asc",
      },
      select: {
        id: true,
        rank: true,
        xpTotalMin: true,
        xpTotalMax: true,
        xpInRank: true,
        equivalentActionsApprox: true,
      },
    });

    const eligibleLeagues = leagues.filter((league) =>
      resolveLeagueEligibility(league.rank, {
        totalXp,
        accuracy7d,
        accuracy14d,
        accuracy30d,
        streakDays,
        masteredItems,
      }),
    );

    const selectedLeague =
      eligibleLeagues
        .sort((left, right) => rankOrder.indexOf(left.rank) - rankOrder.indexOf(right.rank))
        .at(-1) ?? leagues[0] ?? null;

    const selectedLevel = resolveJourneyLevel(totalXp);

    if (selectedLeague) {
      await tx.userJourney.upsert({
        where: {
          userId,
        },
        create: {
          userId,
          level: selectedLevel,
          leagueId: selectedLeague.id,
          score: totalXp,
        },
        update: {
          level: selectedLevel,
          leagueId: selectedLeague.id,
          score: totalXp,
        },
      });

      await tx.user.update({
        where: {
          id: userId,
        },
        data: {
          leagueId: selectedLeague.id,
        },
      });
    }
  }

  private isNewContentEligible(
    item: {
      difficulty: number;
      type: LearningItemType;
      prerequisiteItemIds: string[];
      relatedItemIds: string[];
    },
    level: (typeof levelOrder)[number],
  ) {
    const levelIndex = levelOrder.indexOf(level) + 1;
    const difficultyTarget = Math.max(1, levelIndex * 2);
    const difficultyDistance = Math.abs(item.difficulty - difficultyTarget);

    return (
      difficultyDistance <= 3 &&
      item.prerequisiteItemIds.length < 4 &&
      item.relatedItemIds.length < 10 &&
      resolveLearningItemTypeWeight(item.type) >= 1
    );
  }

  private normalizeRemoteStudies(studies: Array<{
    itemId?: string;
    id?: string;
    learningItemId?: string;
    studyId?: string;
    text?: string;
    title?: string;
    prompt?: string;
    content?: string;
    meaning?: string;
    translation?: string;
    explanation?: string;
    answer?: string;
    source?: string;
    kind?: string;
    order?: number;
    position?: number;
  }>): StudyPackStudy[] {
    return studies.flatMap((study, index) => {
      const itemId =
        study.itemId ?? study.id ?? study.learningItemId ?? study.studyId;
      const text = study.text ?? study.title ?? study.prompt ?? study.content;
      const meaning =
        study.meaning ?? study.translation ?? study.explanation ?? study.answer ?? "";

      if (!itemId || !text) {
        return [];
      }

      return [
        {
          itemId,
          text,
          meaning,
          source: "remote",
          order: study.order ?? study.position ?? index + 1,
        },
      ];
    });
  }
}

export const learningEngineService = new LearningEngineService();
