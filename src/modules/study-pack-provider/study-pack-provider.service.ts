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
};

export type RemoteStudyItem = {
  itemId: string;
  text: string;
  meaning: string;
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

export type PackItemAnalysisResult = {
  ok: true;
  mode: "item_analysis";
  data: {
    mode: "item_analysis";
    userId: string;
    packageId: string;
    packItemId: string;
    status: "correct" | "partial" | "incorrect" | "unclear";
    score: number;
    accuracyPercent: number;
    proximity: "high" | "medium" | "low" | "very_low";
    xp: number;
    feedback: string;
    expectedAnswer: string;
    userResponse: string;
    nextStep: string;
    tips: string[];
    source: "openai" | "fallback";
  };
};

export type AnalyzePackItemInput = {
  userId: string;
  packageId: string;
  packItemId: string;
  userResponse: string;
};

export type AnalyzePackItemRequestPayload = AnalyzePackItemInput;

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
    isRecord(payload.data) ? payload.data.packId : undefined,
    isRecord(payload.data) ? payload.data.id : undefined,
    isRecord(payload.pack) ? payload.pack.id : undefined,
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

function extractAnalysisData(payload: unknown): PackItemAnalysisResult["data"] | null {
  if (!isRecord(payload)) {
    return null;
  }

  const data = isRecord(payload.data) ? payload.data : payload;
  const status = getString(data.status);
  const source = getString(data.source) === "openai" ? "openai" : "fallback";

  if (!status) {
    return null;
  }

  const score = getNumber(data.score) ?? 0;
  const accuracyPercent = getNumber(data.accuracyPercent) ?? score;
  const tips = Array.isArray(data.tips)
    ? data.tips.filter((tip): tip is string => typeof tip === "string")
    : [];

  return {
    mode: "item_analysis",
    userId: getString(data.userId) ?? "",
    packageId: getString(data.packageId) ?? "",
    packItemId: getString(data.packItemId) ?? "",
    status: status as PackItemAnalysisResult["data"]["status"],
    score,
    accuracyPercent,
    proximity: (getString(data.proximity) ?? "low") as PackItemAnalysisResult["data"]["proximity"],
    xp: getNumber(data.xp) ?? 0,
    feedback: getString(data.feedback) ?? "",
    expectedAnswer: getString(data.expectedAnswer) ?? "",
    userResponse: getString(data.userResponse) ?? "",
    nextStep: getString(data.nextStep) ?? "",
    tips,
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

async function buildFallbackAnalysis(input: AnalyzePackItemInput): Promise<PackItemAnalysisResult["data"]> {
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
    mode: "item_analysis",
    userId: input.userId,
    packageId: input.packageId,
    packItemId: input.packItemId,
    status,
    score,
    accuracyPercent: score,
    proximity:
      score >= 85 ? "high" : score >= 60 ? "medium" : score >= 30 ? "low" : "very_low",
    xp: classifierResult.answerQuality >= 4 ? 15 : classifierResult.answerQuality === 3 ? 9 : classifierResult.answerQuality === 2 ? 6 : classifierResult.answerQuality === 1 ? 3 : 0,
    feedback:
      classifierResult.answerQuality >= 4
        ? "Boa resposta."
        : classifierResult.answerQuality === 3
          ? "Sua resposta tocou parte do conteúdo esperado."
          : classifierResult.answerQuality === 2
            ? "Você está perto. Revise o item e tente de novo."
            : "Ainda precisa de revisão.",
    expectedAnswer,
    userResponse: input.userResponse,
    nextStep:
      classifierResult.answerQuality >= 4
        ? "Passe para o próximo item do pack."
        : "Revise o item e tente responder em uma frase curta usando o vocabulário do pack.",
    tips:
      classifierResult.answerQuality >= 4
        ? ["Siga para o próximo item."]
        : [
            "Releia o título do item.",
            "Tente responder com uma frase curta usando o vocabulário do pack.",
            "Use um dos padrões dos exemplos.",
          ],
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
  const tags = Array.isArray(value.tags)
    ? value.tags.filter((tag): tag is string => typeof tag === "string")
    : undefined;

  return [
    {
      itemId,
      text,
      meaning,
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

export class StudyPackProviderService {
  buildAnalyzePackItemRequestPayload(
    input: AnalyzePackItemInput,
  ): AnalyzePackItemRequestPayload {
    return {
      userId: input.userId,
      packageId: input.packageId,
      packItemId: input.packItemId,
      userResponse: input.userResponse,
    };
  }

  async mountPack(input: RemoteStudyPackInput): Promise<RemoteStudyPackResult | null> {
    if (!env.STUDY_PACK_SERVICE_BASE_URL) {
      return null;
    }

    try {
      const candidatePaths = [
        env.STUDY_PACK_SERVICE_MOUNT_PATH,
        "/packs/mountPack",
        "/mountPack",
        "/moutPack",
      ].filter((path): path is string => Boolean(path));

      for (const path of candidatePaths) {
        if (!path) {
          continue;
        }

        const url = buildUrl(env.STUDY_PACK_SERVICE_BASE_URL, path);

        const response = await retryRemoteCall(async () => {
          const result = await fetchJson(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(env.STUDY_PACK_SERVICE_TOKEN
                ? { Authorization: `Bearer ${env.STUDY_PACK_SERVICE_TOKEN}` }
                : {}),
            },
            body: JSON.stringify(input),
          });

          if (!result.ok && shouldRetryStatus(result.status)) {
            throw new Error(`Remote pack generation failed with status ${result.status}`);
          }

          return result;
        });

        if (response.ok) {
          const remotePackId = extractPackId(response.body);

          if (remotePackId) {
            return {
              remotePackId,
              targetXp: extractTargetXp(response.body),
              studies: extractStudies(response.body),
              raw: response.body,
            };
          }
        }

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
        "/packs/getPackById",
        "/getPackbyId",
        "/getPackById",
        "/packs/getPackbyId",
        `/getPackById/${encodeURIComponent(packId)}`,
        `/getPackbyId/${encodeURIComponent(packId)}`,
        `/packs/getPackById/${encodeURIComponent(packId)}`,
        `/packs/getPackbyId/${encodeURIComponent(packId)}`,
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

  async analyzePackItemResponse(input: AnalyzePackItemInput): Promise<PackItemAnalysisResult | null> {
    if (!env.STUDY_PACK_SERVICE_BASE_URL) {
      return null;
    }

    try {
      const url = buildUrl(
        env.STUDY_PACK_SERVICE_BASE_URL,
        env.STUDY_PACK_SERVICE_ANALYZE_PATH,
      );
      const payload = this.buildAnalyzePackItemRequestPayload(input);

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
        return {
          ok: true,
          mode: "item_analysis",
          data: analysisData,
        };
      }
    } catch (error) {
      console.warn("[study-pack-provider] analyzePackItemResponse failed", error);
    }

    return null;
  }
}

export const studyPackProviderService = new StudyPackProviderService();
