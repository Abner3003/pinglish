/* eslint-disable @typescript-eslint/no-unused-vars */
import { env } from "../../config/env.js";
import { learningResponseClassifier } from "../learning-response/learning-response.classifier.js";
import { prisma } from "../../lib/prisma.js";

export type StudyPackLevel = "INICIANTE" | "PRE_INTERMEDIARIO" | "INTERMEDIARIO" | "AVANCADO" | "PROFICIENTE";

export type RemoteStudyPackInput = {
  userId: string;
  tenantId: string | null;
  level: StudyPackLevel;
  interests: string[];
  mode: "teach" | "drill" | "remediate";
  session_id: string;
  lesson_goal: string;
  difficulty: string;
  topic: string;
  language: string;
  context?: Record<string, unknown>;
};

export type RemoteStudyItem = {
  itemId: string;
  text: string;
  meaning: string;
  topicKey?: string;
  source?: string;
  order?: number;
  type?: string;
  difficulty?: number;
  tags?: string[];
  metadata?: unknown;
};

export type RemoteStudyPackResult = {
  remotePackId: string;
  targetXp?: number;
  studies: RemoteStudyItem[];
  raw: unknown;
};

export type ReviewResultPayload = {
  ok: true;
  mode: "review_result";
  data: {
    schema_version: "v1";
    response_type: "review_result";
    mode: "teach" | "drill" | "remediate";
    userId: string;
    packageId: string;
    packItemId: string;
    correct: boolean;
    score: number;
    feedback: string;
    corrections: string[];
    expected_answer: string;
    alternative_answers: string[];
    xp: number;
    source: "openai" | "fallback";
  };
};

export type ReviewRequestInput = {
  userId: string;
  packageId: string;
  packItemId: string;
  mode: "teach" | "drill" | "remediate";
  session_id: string;
  lesson_goal: string;
  difficulty: string;
  topic: string;
  language: string;
  user_answer: string;
  context?: Record<string, unknown>;
};

export type ReviewRequestPayload = {
  userId: string;
  packageId: string;
  packItemId: string;
  userResponse: string;
  mode?: "teach" | "drill" | "remediate";
};

type JsonRecord = Record<string, unknown>;

const REMOTE_REQUEST_RETRIES = 3;
const REMOTE_REQUEST_RETRY_DELAY_MS = 500;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function getNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function buildUrl(baseUrl: string, path: string): string {
  return new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isRetryableRemoteFailure(error: unknown): boolean {
  if (error instanceof TypeError) {
    return true;
  }

  if (error instanceof Error && /fetch|network|timeout/i.test(error.message)) {
    return true;
  }

  return false;
}

async function retryRemoteCall<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= REMOTE_REQUEST_RETRIES; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt < REMOTE_REQUEST_RETRIES && isRetryableRemoteFailure(error)) {
        await sleep(REMOTE_REQUEST_RETRY_DELAY_MS * attempt);
        continue;
      }

      throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Remote request failed");
}

function extractPackId(payload: unknown): string | null {
  if (!isRecord(payload)) {
    return null;
  }

  const candidates = [
    payload.packId,
    payload.id,
    payload.remotePackId,
    payload.sessionId,
    payload.session_id,
    isRecord(payload.data) ? payload.data.packId : undefined,
    isRecord(payload.data) ? payload.data.id : undefined,
    isRecord(payload.pack) ? payload.pack.id : undefined,
    isRecord(payload.lesson) ? payload.lesson.sessionId : undefined,
    isRecord(payload.lesson) ? payload.lesson.session_id : undefined,
  ];

  for (const candidate of candidates) {
    const value = getString(candidate);

    if (value) {
      return value;
    }
  }

  return null;
}

function extractStudies(payload: unknown): RemoteStudyItem[] {
  if (Array.isArray(payload)) {
    return payload.flatMap((entry, index) => normalizeStudyItem(entry, index));
  }

  if (!isRecord(payload)) {
    return [];
  }

  const directCandidates = [
    payload.studies,
    payload.items,
    payload.content,
    isRecord(payload.lesson) && typeof payload.lesson.message === "string"
      ? [
          {
            itemId:
              getString(payload.sessionId) ??
              getString(payload.session_id) ??
              getString(payload.topic) ??
              getString(payload.topicKey) ??
              "lesson",
            text: payload.lesson.message,
            meaning:
              typeof payload.lesson.explanation === "string"
                ? payload.lesson.explanation
                : "",
            topicKey: getString(payload.topic) ?? getString(payload.topicKey) ?? undefined,
            source: "lesson_result",
            order: 1,
            metadata: isRecord(payload.lesson.metadata) ? payload.lesson.metadata : undefined,
          },
        ]
      : undefined,
    isRecord(payload.data) ? payload.data.studies : undefined,
    isRecord(payload.data) ? payload.data.items : undefined,
    isRecord(payload.pack) ? payload.pack.studies : undefined,
    isRecord(payload.pack) ? payload.pack.items : undefined,
  ];

  for (const candidate of directCandidates) {
    if (Array.isArray(candidate)) {
      return candidate.flatMap((entry, index) => normalizeStudyItem(entry, index));
    }
  }

  return [];
}

function extractTargetXp(payload: unknown): number | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }

  const candidates = [
    payload.targetXp,
    payload.xp,
    isRecord(payload.lesson) ? payload.lesson.xp : undefined,
    isRecord(payload.data) ? payload.data.targetXp : undefined,
    isRecord(payload.pack) ? payload.pack.targetXp : undefined,
  ];

  for (const candidate of candidates) {
    const value = getNumber(candidate);

    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

function extractTopicKey(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const candidates = [
    value.topicKey,
    value.topic,
    value.concept,
    value.subject,
    isRecord(value.metadata) ? value.metadata.topicKey : undefined,
    isRecord(value.metadata) ? value.metadata.topic : undefined,
    isRecord(value.metadata) ? value.metadata.concept : undefined,
  ];

  for (const candidate of candidates) {
    const topicKey = getString(candidate);

    if (topicKey) {
      return topicKey;
    }
  }

  return undefined;
}

function extractAnalysisData(payload: unknown): ReviewResultPayload["data"] | null {
  if (!isRecord(payload)) {
    return null;
  }

  const data = isRecord(payload.review)
    ? payload.review
    : isRecord(payload.data) && isRecord(payload.data.review)
      ? payload.data.review
      : isRecord(payload.data)
        ? payload.data
        : payload;
  const scoreValue =
    getNumber(data.score) ??
    getNumber(payload.score) ??
    (data.correct === true ? 1 : 0);
  const normalizedScore = scoreValue <= 1 ? Math.round(scoreValue * 100) : Math.round(scoreValue);
  const correct =
    data.correct === true || normalizedScore >= 80;
  const source = getString(data.source) === "openai" || getString(payload.source) === "openai" ? "openai" : "fallback";
  const accuracyPercent = getNumber(data.accuracyPercent) ?? normalizedScore;
  const corrections = Array.isArray(data.corrections)
    ? data.corrections.filter((tip): tip is string => typeof tip === "string")
    : Array.isArray(data.tips)
      ? data.tips.filter((tip): tip is string => typeof tip === "string")
      : [];
  const expectedAnswer =
    getString(data.expectedAnswer) ??
    getString(data.expected_answer) ??
    (Array.isArray(data.alternative_answers) && data.alternative_answers.length > 0
      ? data.alternative_answers[0]
      : "");

  return {
    schema_version: "v1",
    response_type: "review_result",
    mode: (getString(data.mode) as ReviewResultPayload["data"]["mode"]) ?? "drill",
    userId: getString(data.userId) ?? getString(payload.user_id) ?? "",
    packageId: getString(data.packageId) ?? getString(payload.session_id) ?? getString(payload.sessionId) ?? "",
    packItemId: getString(data.packItemId) ?? getString(payload.packItemId) ?? getString(payload.topic) ?? "",
    correct,
    score: normalizedScore,
    feedback: getString(data.feedback) ?? getString(data.feedback_message) ?? "",
    corrections,
    expected_answer: expectedAnswer,
    alternative_answers: Array.isArray(data.alternative_answers)
      ? data.alternative_answers.filter((answer): answer is string => typeof answer === "string")
      : expectedAnswer
        ? [expectedAnswer]
        : [],
    xp: getNumber(data.xp) ?? getNumber(payload.xp) ?? 0,
    source,
  };
}

function scoreToQuality(score: number): 0 | 1 | 2 | 3 | 4 | 5 {
  if (score >= 90) return 5;
  if (score >= 75) return 4;
  if (score >= 55) return 3;
  if (score >= 35) return 2;
  if (score >= 15) return 1;
  return 0;
}

async function buildFallbackAnalysis(input: ReviewRequestPayload): Promise<ReviewResultPayload["data"]> {
  const pack = await prisma.dailyStudyPack.findUnique({
    where: {
      id: input.packageId,
    },
    select: {
      id: true,
      items: true,
    },
  });

  const studies = extractStudies(pack?.items);
  const study = studies.find((entry) => entry.itemId === input.packItemId);

  const item = await prisma.learningItem.findUnique({
    where: {
      id: input.packItemId,
    },
    select: {
      id: true,
      text: true,
      meaning: true,
      type: true,
    },
  });

  const expectedAnswer = study?.text ?? item?.text ?? item?.meaning ?? "";
  const classifierResult = learningResponseClassifier.classify({
    userText: input.userResponse,
    expectedText: expectedAnswer,
    itemType: (item?.type as "LEXICAL_CHUNK" | "PATTERN" | "EXAMPLE" | "MICRO_LESSON" | undefined) ?? "EXAMPLE",
  });

  const score = Math.max(
    0,
    Math.min(
      100,
      classifierResult.answerQuality >= 4
        ? 90
        : classifierResult.answerQuality === 3
          ? 70
          : classifierResult.answerQuality === 2
            ? 50
            : classifierResult.answerQuality === 1
              ? 25
              : 5,
    ),
  );

  const status =
    classifierResult.answerQuality >= 4
      ? "correct"
      : classifierResult.answerQuality === 3
        ? "partial"
        : classifierResult.answerQuality === 2
          ? "partial"
          : classifierResult.answerQuality === 1
            ? "incorrect"
            : "unclear";

  return {
    schema_version: "v1",
    response_type: "review_result",
    mode: input.mode ?? "teach",
    userId: input.userId,
    packageId: input.packageId,
    packItemId: input.packItemId,
    correct: classifierResult.answerQuality >= 4,
    score,
    xp: classifierResult.answerQuality >= 4 ? 15 : classifierResult.answerQuality === 3 ? 9 : classifierResult.answerQuality === 2 ? 6 : classifierResult.answerQuality === 1 ? 3 : 0,
    feedback:
      classifierResult.answerQuality >= 4
        ? "Boa resposta."
        : classifierResult.answerQuality === 3
          ? "Sua resposta tocou parte do conteúdo esperado."
          : classifierResult.answerQuality === 2
            ? "Você está perto. Revise o item e tente de novo."
            : "Ainda precisa de revisão.",
    corrections:
      classifierResult.answerQuality >= 4
        ? []
        : [
            "Releia o título do item.",
            "Tente responder com uma frase curta usando o vocabulário do pack.",
            "Use um dos padrões dos exemplos.",
          ],
    expected_answer: expectedAnswer,
    alternative_answers: expectedAnswer ? [expectedAnswer] : [],
    source: "fallback",
  };
}

function normalizeStudyItem(value: unknown, index: number): RemoteStudyItem[] {
  if (!isRecord(value)) {
    return [];
  }

  const itemId =
    getString(value.itemId) ??
    getString(value.id) ??
    getString(value.learningItemId) ??
    getString(value.studyId);
  const text =
    getString(value.text) ??
    getString(value.title) ??
    getString(value.prompt) ??
    getString(value.content);
  const meaning =
    getString(value.meaning) ??
    getString(value.translation) ??
    getString(value.explanation) ??
    getString(value.answer) ??
    "";

  if (!itemId || !text) {
    return [];
  }

  const source = getString(value.source) ?? getString(value.kind);
  const order = getNumber(value.order) ?? getNumber(value.position) ?? index + 1;
  const type = getString(value.type);
  const difficulty = getNumber(value.difficulty);
  const topicKey = extractTopicKey(value);
  const tags = Array.isArray(value.tags)
    ? value.tags.filter((tag): tag is string => typeof tag === "string")
    : undefined;

  return [
    {
      itemId,
      text: text,
      meaning,
      topicKey,
      source,
      order,
      type,
      difficulty,
      tags,
      metadata: isRecord(value.metadata) ? value.metadata : value.metadata,
    },
  ];
}

async function fetchJson(
  url: string,
  init: RequestInit,
): Promise<{ ok: boolean; status: number; body: unknown; rawBody: string }> {
  const response = await fetch(url, init);
  const rawBody = await response.text();

  try {
    return {
      ok: response.ok,
      status: response.status,
      body: rawBody ? JSON.parse(rawBody) : null,
      rawBody,
    };
  } catch {
    return {
      ok: response.ok,
      status: response.status,
      body: rawBody,
      rawBody,
    };
  }
}

function shouldRetryStatus(status: number): boolean {
  return status >= 500 || status === 429;
}

function getPayloadSizeBytes(payload: unknown): number | null {
  try {
    return Buffer.byteLength(JSON.stringify(payload), "utf8");
  } catch {
    return null;
  }
}

function logRemoteStudyCall(
  step: "mountPack" | "getPackById" | "analyzeReviewResponse",
  details: Record<string, unknown>,
): void {
  console.info({ scope: "study-pack-provider", step, ...details }, "[penglish-ai] request");
}

function logRemoteStudyResponse(
  step: "mountPack" | "getPackById" | "analyzeReviewResponse",
  details: Record<string, unknown>,
): void {
  console.info({ scope: "study-pack-provider", step, ...details }, "[penglish-ai] response");
}

function summarizeResponseBody(body: unknown): Record<string, unknown> {
  if (typeof body === "string") {
    return {
      bodyType: "string",
      bodyPreview: body.slice(0, 500),
    };
  }

  if (Array.isArray(body)) {
    return {
      bodyType: "array",
      bodyLength: body.length,
    };
  }

  if (isRecord(body)) {
    return {
      bodyType: "object",
      bodyKeys: Object.keys(body),
      ok: typeof body.ok === "boolean" ? body.ok : undefined,
      error: getString(body.error),
      message: getString(body.message),
    };
  }

  return {
    bodyType: typeof body,
  };
}

export class StudyPackProviderService {
  buildLessonGenerationPayload(input: RemoteStudyPackInput): Record<string, unknown> {
    return {
      userId: input.userId,
      tenantId: input.tenantId ?? null,
      level: input.level,
      interests: input.interests,
    };
  }

  buildReviewRequestPayload(
    input: ReviewRequestInput,
  ): ReviewRequestPayload {
    return {
      userId: input.userId,
      packageId: input.packageId,
      packItemId: input.packItemId,
      userResponse: input.user_answer,
    };
  }

  async mountPack(input: RemoteStudyPackInput): Promise<RemoteStudyPackResult | null> {
    if (!env.STUDY_PACK_SERVICE_BASE_URL) {
      return null;
    }

    try {
      const candidatePaths = [
        env.STUDY_PACK_SERVICE_MOUNT_PATH,
        "/mountPack",
      ].filter((path): path is string => Boolean(path));

      for (const path of candidatePaths) {
        if (!path) {
          continue;
        }

        const url = buildUrl(env.STUDY_PACK_SERVICE_BASE_URL, path);
        const payload = this.buildLessonGenerationPayload(input);
        const startedAt = Date.now();

        logRemoteStudyCall("mountPack", {
          url,
          path,
          userId: input.userId,
          session_id: input.session_id,
          mode: input.mode,
          topic: input.topic,
          level: input.level,
          payloadSizeBytes: getPayloadSizeBytes(payload),
        });

        const response = await retryRemoteCall(async () => {
          const result = await fetchJson(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(env.STUDY_PACK_SERVICE_TOKEN
                ? { Authorization: `Bearer ${env.STUDY_PACK_SERVICE_TOKEN}` }
                : {}),
            },
            body: JSON.stringify(payload),
          });

          if (!result.ok && shouldRetryStatus(result.status)) {
            throw new Error(`Remote pack generation failed with status ${result.status}`);
          }

          return result;
        });

        if (response.ok) {
          const remotePackId = extractPackId(response.body);
          const studies = extractStudies(response.body);

          logRemoteStudyResponse("mountPack", {
            ok: true,
            status: response.status,
            durationMs: Date.now() - startedAt,
            remotePackId: remotePackId ?? null,
            studiesCount: studies.length,
            userId: input.userId,
            session_id: input.session_id,
            ...(remotePackId && studies.length > 0 ? {} : summarizeResponseBody(response.body)),
          });

          if (remotePackId) {
            return {
              remotePackId,
              targetXp: extractTargetXp(response.body),
              studies,
              raw: response.body,
            };
          }
        }

        logRemoteStudyResponse("mountPack", {
          ok: false,
          status: response.status,
          durationMs: Date.now() - startedAt,
          userId: input.userId,
          session_id: input.session_id,
        });

        if (response.status !== 404) {
          continue;
        }
      }
    } catch (error) {
      console.warn("[study-pack-provider] mountPack failed", error);
    }

    return null;
  }

  async getPackById(packId: string): Promise<RemoteStudyPackResult | null> {
    const baseUrl = env.STUDY_PACK_SERVICE_BASE_URL;

    if (!baseUrl) {
      return null;
    }

    try {
      const candidatePaths = [
        env.STUDY_PACK_SERVICE_GET_PACK_PATH,
        "/getPackById",
        `/getPackById/${encodeURIComponent(packId)}`,
      ].filter((path): path is string => Boolean(path));

      for (const path of candidatePaths) {
        if (!path) {
          continue;
        }

        const resolvedUrl = path.includes(packId)
          ? buildUrl(baseUrl, path)
          : buildUrl(
              baseUrl,
              `${path.replace(/\/$/, "")}/${encodeURIComponent(packId)}`,
            );
        const startedAt = Date.now();

        logRemoteStudyCall("getPackById", {
          url: resolvedUrl,
          path,
          packId,
        });

        const response = await retryRemoteCall(async () => {
          const getResult = await fetchJson(resolvedUrl, {
            method: "GET",
            headers: {
              ...(env.STUDY_PACK_SERVICE_TOKEN
                ? { Authorization: `Bearer ${env.STUDY_PACK_SERVICE_TOKEN}` }
                : {}),
            },
          });

          if (getResult.ok) {
            return getResult;
          }

          const postResult = await fetchJson(buildUrl(baseUrl, path.replace(/\/$/, "")), {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(env.STUDY_PACK_SERVICE_TOKEN
                ? { Authorization: `Bearer ${env.STUDY_PACK_SERVICE_TOKEN}` }
                : {}),
            },
            body: JSON.stringify({ packId }),
          });

          if (!postResult.ok && shouldRetryStatus(postResult.status)) {
            throw new Error(`Remote pack fetch failed with status ${postResult.status}`);
          }

          return postResult.ok ? postResult : getResult;
        });

        if (response.ok) {
          const studies = extractStudies(response.body);

          logRemoteStudyResponse("getPackById", {
            ok: true,
            status: response.status,
            durationMs: Date.now() - startedAt,
            packId,
            studiesCount: studies.length,
          });

          return {
            remotePackId: packId,
            targetXp: extractTargetXp(response.body),
            studies,
            raw: response.body,
          };
        }
      }
    } catch (error) {
      console.warn("[study-pack-provider] getPackById failed", error);
    }

    return null;
  }

  async analyzeReviewResponse(input: ReviewRequestPayload): Promise<ReviewResultPayload | null> {
    if (!env.STUDY_PACK_SERVICE_BASE_URL) {
      return null;
    }

    try {
      const url = buildUrl(
        env.STUDY_PACK_SERVICE_BASE_URL,
        env.STUDY_PACK_SERVICE_ANALYZE_PATH,
      );
      const payload = input;
      const startedAt = Date.now();

      logRemoteStudyCall("analyzeReviewResponse", {
        url,
        userId: input.userId,
        packageId: input.packageId,
        packItemId: input.packItemId,
        mode: input.mode ?? "teach",
        payloadSizeBytes: getPayloadSizeBytes(payload),
      });

      const response = await retryRemoteCall(async () => {
        const result = await fetchJson(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(env.STUDY_PACK_SERVICE_TOKEN
              ? { Authorization: `Bearer ${env.STUDY_PACK_SERVICE_TOKEN}` }
              : {}),
          },
          body: JSON.stringify(payload),
        });

        if (!result.ok && shouldRetryStatus(result.status)) {
          throw new Error(`Remote analysis failed with status ${result.status}`);
        }

        return result;
      });

      const analysisData = extractAnalysisData(response.body);

      if (response.ok && analysisData) {
        logRemoteStudyResponse("analyzeReviewResponse", {
          ok: true,
          status: response.status,
          durationMs: Date.now() - startedAt,
          userId: input.userId,
          packageId: input.packageId,
          packItemId: input.packItemId,
        });

        return {
          ok: true,
          mode: "review_result",
          data: analysisData,
        };
      }

      logRemoteStudyResponse("analyzeReviewResponse", {
        ok: false,
        status: response.status,
        durationMs: Date.now() - startedAt,
        userId: input.userId,
        packageId: input.packageId,
        packItemId: input.packItemId,
      });
    } catch (error) {
      console.warn("[study-pack-provider] analyzeReviewResponse failed", error);
    }

    return null;
  }

}

export const studyPackProviderService = new StudyPackProviderService();
