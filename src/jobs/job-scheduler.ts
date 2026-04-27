import cron from "node-cron";
import { JobRunStatus } from "../generated/prisma/index.js";
import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import { runDailyStudyPacksGenerator } from "./daily-study-packs.generator.js";
import { runStudyPackReviewsDispatcher } from "./study-pack-reviews.dispatcher.js";

type SchedulerHandle = {
  stop: () => void;
};

let schedulerHandle: SchedulerHandle | null = null;

type ZonedDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

function getZonedDateParts(date: Date, timeZone: string): ZonedDateParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const getPart = (type: Intl.DateTimeFormatPartTypes): string => {
    const part = parts.find((entry) => entry.type === type)?.value;

    if (!part) {
      throw new Error(`Missing timezone part: ${type}`);
    }

    return part;
  };

  return {
    year: Number(getPart("year")),
    month: Number(getPart("month")),
    day: Number(getPart("day")),
    hour: Number(getPart("hour")),
    minute: Number(getPart("minute")),
  };
}

function formatDateKey(parts: Pick<ZonedDateParts, "year" | "month" | "day">): string {
  return [
    String(parts.year).padStart(4, "0"),
    String(parts.month).padStart(2, "0"),
    String(parts.day).padStart(2, "0"),
  ].join("-");
}

function parseDailyCronTime(expression: string): { hour: number; minute: number } | null {
  const parts = expression.trim().split(/\s+/);

  if (parts.length < 2) {
    return null;
  }

  const minute = Number(parts[0]);
  const hour = Number(parts[1]);

  if (!Number.isInteger(minute) || !Number.isInteger(hour)) {
    return null;
  }

  if (minute < 0 || minute > 59 || hour < 0 || hour > 23) {
    return null;
  }

  return { hour, minute };
}

async function runJob(name: string, job: () => Promise<void>): Promise<void> {
  console.info(`[job-scheduler] starting ${name}`);
  await job();
  console.info(`[job-scheduler] completed ${name}`);
}

async function claimScheduledJobRun(jobName: string, scheduledFor: string) {
  try {
    const record = await prisma.scheduledJobRun.create({
      data: {
        jobName,
        scheduledFor,
        status: JobRunStatus.PROCESSING,
        attempts: 1,
      },
    });

    return { kind: "claimed" as const, record };
  } catch (error) {
    const existing = await prisma.scheduledJobRun.findUnique({
      where: {
        jobName_scheduledFor: {
          jobName,
          scheduledFor,
        },
      },
    });

    if (!existing) {
      throw error;
    }

    if (existing.status === JobRunStatus.COMPLETED) {
      return { kind: "completed" as const, record: existing };
    }

    if (existing.status === JobRunStatus.PROCESSING) {
      return { kind: "processing" as const, record: existing };
    }

    const recovered = await prisma.scheduledJobRun.update({
      where: {
        jobName_scheduledFor: {
          jobName,
          scheduledFor,
        },
      },
      data: {
        status: JobRunStatus.PROCESSING,
        attempts: {
          increment: 1,
        },
        lastError: null,
        completedAt: null,
      },
    });

    return { kind: "claimed" as const, record: recovered };
  }
}

async function completeScheduledJobRun(jobName: string, scheduledFor: string): Promise<void> {
  await prisma.scheduledJobRun.updateMany({
    where: {
      jobName,
      scheduledFor,
      status: JobRunStatus.PROCESSING,
    },
    data: {
      status: JobRunStatus.COMPLETED,
      completedAt: new Date(),
      lastError: null,
    },
  });
}

async function failScheduledJobRun(jobName: string, scheduledFor: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);

  await prisma.scheduledJobRun.updateMany({
    where: {
      jobName,
      scheduledFor,
      status: JobRunStatus.PROCESSING,
    },
    data: {
      status: JobRunStatus.FAILED,
      lastError: message.slice(0, 2000),
    },
  });
}

async function runTrackedDailyStudyPackJob(scheduledFor: string): Promise<void> {
  const claim = await claimScheduledJobRun("daily-study-packs", scheduledFor);

  if (claim.kind === "completed" || claim.kind === "processing") {
    console.info(
      `[job-scheduler] skipped daily-study-packs scheduledFor=${scheduledFor} reason=${claim.kind}`,
    );
    return;
  }

  try {
    await runJob("daily-study-packs", runDailyStudyPacksGenerator);
    await completeScheduledJobRun("daily-study-packs", scheduledFor);
  } catch (error) {
    console.error(
      `[job-scheduler] failed daily-study-packs scheduledFor=${scheduledFor}`,
      error,
    );
    await failScheduledJobRun("daily-study-packs", scheduledFor, error);
    throw error;
  }
}

async function runDailyStudyPackCatchUpIfNeeded(): Promise<void> {
  const cronTime = parseDailyCronTime(env.DAILY_STUDY_PACKS_CRON);

  if (!cronTime) {
    return;
  }

  const now = getZonedDateParts(new Date(), env.JOB_SCHEDULER_TIMEZONE);
  const todayKey = formatDateKey(now);

  if (now.hour < cronTime.hour || (now.hour === cronTime.hour && now.minute < cronTime.minute)) {
    return;
  }

  await runTrackedDailyStudyPackJob(todayKey);
}

export function startJobScheduler(): SchedulerHandle {
  if (schedulerHandle) {
    return schedulerHandle;
  }

  if (!env.ENABLE_JOB_SCHEDULER) {
    schedulerHandle = {
      stop: () => undefined,
    };

    return schedulerHandle;
  }

  const tasks = [
    cron.schedule(
      env.DAILY_STUDY_PACKS_CRON,
      () => {
        const scheduledFor = formatDateKey(getZonedDateParts(new Date(), env.JOB_SCHEDULER_TIMEZONE));
        void runTrackedDailyStudyPackJob(scheduledFor).catch((error) => {
          console.error("[job-scheduler] daily-study-packs cron failed", error);
        });
      },
      {
        timezone: env.JOB_SCHEDULER_TIMEZONE,
      },
    ),
    cron.schedule(
      env.STUDY_PACK_REVIEWS_CRON,
      () => {
        void runJob("study-pack-reviews", runStudyPackReviewsDispatcher).catch((error) => {
          console.error("[job-scheduler] study-pack-reviews cron failed", error);
        });
      },
      {
        timezone: env.JOB_SCHEDULER_TIMEZONE,
      },
    ),
  ];

  schedulerHandle = {
    stop: () => {
      for (const task of tasks) {
        task.stop();
      }
    },
  };

  console.info(
    `[job-scheduler] enabled daily=${env.DAILY_STUDY_PACKS_CRON} reviews=${env.STUDY_PACK_REVIEWS_CRON} timezone=${env.JOB_SCHEDULER_TIMEZONE}`,
  );

  void runDailyStudyPackCatchUpIfNeeded().catch((error) => {
    console.error("[job-scheduler] daily-study-packs startup catch-up failed", error);
  });

  return schedulerHandle;
}
