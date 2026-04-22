import { env } from "../../config/env.js";

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

type JsonRecord = Record<string, unknown>;

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

export class StudyPackProviderService {
  async mountPack(input: RemoteStudyPackInput): Promise<RemoteStudyPackResult | null> {
    if (!env.STUDY_PACK_SERVICE_BASE_URL) {
      return null;
    }

    const candidatePaths = [env.STUDY_PACK_SERVICE_MOUNT_PATH, "/moutPack"];

    for (const path of candidatePaths) {
      const url = buildUrl(env.STUDY_PACK_SERVICE_BASE_URL, path);
      const response = await fetchJson(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(env.STUDY_PACK_SERVICE_TOKEN
            ? { Authorization: `Bearer ${env.STUDY_PACK_SERVICE_TOKEN}` }
            : {}),
        },
        body: JSON.stringify(input),
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

    return null;
  }

  async getPackById(packId: string): Promise<RemoteStudyPackResult | null> {
    if (!env.STUDY_PACK_SERVICE_BASE_URL) {
      return null;
    }

    const candidatePaths = [
      env.STUDY_PACK_SERVICE_GET_PACK_PATH,
      "/getPackbyId",
      `/getPackById/${encodeURIComponent(packId)}`,
      `/getPackbyId/${encodeURIComponent(packId)}`,
    ];

    for (const path of candidatePaths) {
      const resolvedUrl = path.includes(packId)
        ? buildUrl(env.STUDY_PACK_SERVICE_BASE_URL, path)
        : buildUrl(
            env.STUDY_PACK_SERVICE_BASE_URL,
            `${path.replace(/\/$/, "")}/${encodeURIComponent(packId)}`,
          );

      const candidates = [
        fetchJson(resolvedUrl, {
          method: "GET",
          headers: {
            ...(env.STUDY_PACK_SERVICE_TOKEN
              ? { Authorization: `Bearer ${env.STUDY_PACK_SERVICE_TOKEN}` }
              : {}),
          },
        }),
        fetchJson(buildUrl(env.STUDY_PACK_SERVICE_BASE_URL, path.replace(/\/$/, "")), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(env.STUDY_PACK_SERVICE_TOKEN
              ? { Authorization: `Bearer ${env.STUDY_PACK_SERVICE_TOKEN}` }
              : {}),
          },
          body: JSON.stringify({ packId }),
        }),
      ];

      for (const responsePromise of candidates) {
        const response = await responsePromise;

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
    }

    return null;
  }
}

export const studyPackProviderService = new StudyPackProviderService();
