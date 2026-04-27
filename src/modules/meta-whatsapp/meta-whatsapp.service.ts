import {
  LearningGoal,
  UserChannelStatus,
  Prisma,
} from "../../generated/prisma/index.js";
import { prisma } from "../../lib/prisma.js";
import { env } from "../../config/env.js";
import { resolveDefaultTenantId } from "../tenants/default-tenant.service.js";
import { studyOrchestratorService } from "../study-orchestrator/study-orchestrator.module.js";

type Logger = Pick<typeof console, "info" | "warn" | "error">;

type WebhookPayload = Record<string, unknown>;

type InboundMessage = {
  from: string;
  text: string;
};

type OnboardingAnswers = {
  likes: string[];
  themes: string[];
  goal: LearningGoal;
  languageLevel: string;
  targetLanguage: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}



function normalizePhoneNumber(phone: string): string {
  return phone.replace(/[^\d]/g, "");
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

type WhatsAppIntegrationRecord = {
  id: string;
  status: string;
  appId: string | null;
  verifyToken: string | null;
  accessToken: string | null;
  businessAccountId: string | null;
  wabaId: string | null;
  phoneNumberId: string | null;
  displayPhoneNumber: string | null;
  callbackCode: string | null;
  callbackState: string | null;
  metadata: unknown | null;
  connectedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function splitCommaList(value: string): string[] {
  return value
    .split(/[,;/\n]/g)
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseNumberedAnswers(text: string): Partial<Record<1 | 2 | 3 | 4 | 5, string>> {
  const lines = text
    .split(/\n+/g)
    .map((line) => line.trim())
    .filter(Boolean);

  const result: Partial<Record<1 | 2 | 3 | 4 | 5, string>> = {};

  for (const line of lines) {
    const match = line.match(/^(\d+)[.)\-:]\s*(.+)$/);

    if (!match) {
      continue;
    }

    const index = Number(match[1]);
    const value = match[2].trim();

    if (index >= 1 && index <= 5) {
      result[index as 1 | 2 | 3 | 4 | 5] = value;
    }
  }

  return result;
}

function resolveGoal(value: string): LearningGoal {
  const normalized = normalizeText(value);

  if (
    normalized.includes("travel") ||
    normalized.includes("viagem") ||
    normalized.includes("turismo")
  ) {
    return LearningGoal.TRAVEL;
  }

  if (
    normalized.includes("work") ||
    normalized.includes("trabalho") ||
    normalized.includes("profissao")
  ) {
    return LearningGoal.WORK;
  }

  if (
    normalized.includes("conversation") ||
    normalized.includes("conversa") ||
    normalized.includes("falar")
  ) {
    return LearningGoal.CONVERSATION;
  }

  if (
    normalized.includes("school") ||
    normalized.includes("estudo") ||
    normalized.includes("aula") ||
    normalized.includes("curso")
  ) {
    return LearningGoal.SCHOOL;
  }

  return LearningGoal.OTHER;
}

function resolveLevel(value: string): string {
  const normalized = normalizeText(value);

  if (normalized.includes("iniciante") || normalized.includes("beginner")) {
    return "INICIANTE";
  }

  if (
    normalized.includes("pre intermediario") ||
    normalized.includes("pre-intermediario") ||
    normalized.includes("pre intermed") ||
    normalized.includes("pre-intermed")
  ) {
    return "PRE_INTERMEDIARIO";
  }

  if (normalized.includes("intermediario") || normalized.includes("intermediate")) {
    return "INTERMEDIARIO";
  }

  if (normalized.includes("avancado") || normalized.includes("advanced")) {
    return "AVANCADO";
  }

  return "PROFICIENTE";
}

function resolveTargetLanguage(value: string): string {
  const normalized = normalizeText(value);

  if (normalized.includes("ingles") || normalized.includes("english")) {
    return "ENGLISH";
  }

  if (normalized.includes("espanhol") || normalized.includes("spanish")) {
    return "SPANISH";
  }

  if (normalized.includes("frances") || normalized.includes("french")) {
    return "FRENCH";
  }

  return value.trim().toUpperCase();
}

function parseOnboardingAnswers(text: string): OnboardingAnswers | null {
  const numbered = parseNumberedAnswers(text);
  const fallbackLines = text
    .split(/\n+/g)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^(\d+)[.)\-:]/.test(line));

  const answers = {
    1: numbered[1] ?? fallbackLines[0],
    2: numbered[2] ?? fallbackLines[1],
    3: numbered[3] ?? fallbackLines[2],
    4: numbered[4] ?? fallbackLines[3],
    5: numbered[5] ?? fallbackLines[4],
  };

  if (!answers[1] || !answers[2] || !answers[3] || !answers[4] || !answers[5]) {
    return null;
  }

  const likes = splitCommaList(answers[1]);
  const themes = splitCommaList(answers[2]);

  return {
    likes,
    themes,
    goal: resolveGoal(answers[3]),
    languageLevel: resolveLevel(answers[4]),
    targetLanguage: resolveTargetLanguage(answers[5]),
  };
}

function buildOnboardingPrompt(): string {
  return [
    "Vou te fazer 5 perguntas rápidas. Responda em uma única mensagem usando a numeração abaixo:",
    "1. O que você gosta? (ex: viagens, música, séries)",
    "2. Quais temas você prefere estudar? (ex: trabalho, rotina, tecnologia)",
    "3. Qual é seu objetivo com o idioma?",
    "4. Qual seu nível atual?",
    "5. Qual idioma você quer aprender? (inglês, espanhol ou francês)",
  ].join("\n");
}

function buildGreetingMessage(name: string): string {
  return [
    `Olá, ${name}.`,
    buildOnboardingPrompt(),
  ].join("\n\n");
}

function buildReaskMessage(): string {
  return [
    "Não consegui entender suas respostas.",
    buildOnboardingPrompt(),
  ].join("\n\n");
}

export class MetaWhatsAppService {
  constructor(private readonly logger: Logger = console) {}

  async getActiveIntegration(): Promise<WhatsAppIntegrationRecord | null> {
    return prisma.whatsAppIntegration.findFirst({
      orderBy: {
        updatedAt: "desc",
      },
    });
  }

  async saveEmbeddedSignup(input: {
    code?: string | null;
    state?: string | null;
    appId?: string | null;
    accessToken?: string | null;
    businessAccountId?: string | null;
    wabaId?: string | null;
    phoneNumberId?: string | null;
    displayPhoneNumber?: string | null;
    verifyToken?: string | null;
    metadata?: unknown;
  }): Promise<WhatsAppIntegrationRecord> {
    const existing = await this.getActiveIntegration();
    const metadataValue =
      input.metadata !== undefined
        ? (input.metadata as Prisma.InputJsonValue)
        : existing?.metadata !== null && existing?.metadata !== undefined
          ? (existing.metadata as Prisma.InputJsonValue)
          : undefined;

    const data = {
      status: "ACTIVE" as const,
      appId: input.appId ?? env.META_WHATSAPP_APP_ID ?? existing?.appId ?? null,
      verifyToken:
        input.verifyToken ?? env.META_WHATSAPP_VERIFY_TOKEN ?? existing?.verifyToken ?? null,
      accessToken: input.accessToken ?? existing?.accessToken ?? null,
      businessAccountId: input.businessAccountId ?? existing?.businessAccountId ?? null,
      wabaId: input.wabaId ?? existing?.wabaId ?? null,
      phoneNumberId: input.phoneNumberId ?? existing?.phoneNumberId ?? null,
      displayPhoneNumber: input.displayPhoneNumber ?? existing?.displayPhoneNumber ?? null,
      callbackCode: input.code ?? existing?.callbackCode ?? null,
      callbackState: input.state ?? existing?.callbackState ?? null,
      ...(metadataValue !== undefined ? { metadata: metadataValue } : {}),
      connectedAt: existing?.connectedAt ?? new Date(),
    };

    if (existing) {
      return prisma.whatsAppIntegration.update({
        where: {
          id: existing.id,
        },
        data,
      });
    }

    return prisma.whatsAppIntegration.create({
      data,
    });
  }

  async exchangeEmbeddedSignupCode(input: {
    code: string;
  }): Promise<{ accessToken: string | null; raw: unknown }> {
    if (!env.META_WHATSAPP_APP_ID || !env.META_WHATSAPP_APP_SECRET) {
      throw new Error("META_WHATSAPP_APP_ID and META_WHATSAPP_APP_SECRET must be configured");
    }

    const url = new URL("https://graph.facebook.com/oauth/access_token");
    url.searchParams.set("client_id", env.META_WHATSAPP_APP_ID);
    url.searchParams.set("client_secret", env.META_WHATSAPP_APP_SECRET);
    url.searchParams.set("code", input.code);

    const response = await fetchJson(url.toString(), {
      method: "GET",
    });

    if (!response.ok) {
      throw new Error(
        `Meta embedded signup token exchange failed with status ${response.status}: ${response.rawBody}`,
      );
    }

    const accessToken = isRecord(response.body) ? getString(response.body.access_token) ?? null : null;

    return {
      accessToken,
      raw: response.body,
    };
  }

  async connectNumber(input: {
    wabaId?: string | null;
    phoneNumberId?: string | null;
    accessToken?: string | null;
    pin?: string | null;
  }): Promise<{ ok: boolean; raw: unknown }> {
    const integration = await this.getActiveIntegration();
    const wabaId = input.wabaId ?? integration?.wabaId ?? null;
    const phoneNumberId = input.phoneNumberId ?? integration?.phoneNumberId ?? null;
    const accessToken = input.accessToken ?? integration?.accessToken ?? env.WHATSAPP_TOKEN ?? null;

    if (!wabaId || !accessToken) {
      throw new Error("wabaId and accessToken are required to connect the WhatsApp number");
    }

    const subscribeResponse = await fetchJson(
      `https://graph.facebook.com/${env.GRAPH_API_VERSION}/${encodeURIComponent(wabaId)}/subscribed_apps`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    if (!subscribeResponse.ok) {
      throw new Error(
        `Meta subscribed_apps call failed with status ${subscribeResponse.status}: ${subscribeResponse.rawBody}`,
      );
    }

    let registerResponse: { ok: boolean; status: number; body: unknown; rawBody: string } | null = null;

    if (phoneNumberId && input.pin) {
      registerResponse = await fetchJson(
        `https://graph.facebook.com/${env.GRAPH_API_VERSION}/${encodeURIComponent(phoneNumberId)}/register`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            pin: input.pin,
          }),
        },
      );

      if (!registerResponse.ok) {
        throw new Error(
          `Meta phone register call failed with status ${registerResponse.status}: ${registerResponse.rawBody}`,
        );
      }
    }

    if (integration) {
      await prisma.whatsAppIntegration.update({
        where: {
          id: integration.id,
        },
        data: {
          status: "ACTIVE",
          wabaId,
          phoneNumberId: phoneNumberId ?? integration.phoneNumberId,
          accessToken,
          connectedAt: new Date(),
        },
      });
    }

    return {
      ok: true,
      raw: {
        subscribed_apps: subscribeResponse.body,
        register: registerResponse?.body ?? null,
      },
    };
  }

  async handleWebhook(payload: unknown): Promise<void> {
    const inboundMessages = this.extractInboundMessages(payload);

    if (inboundMessages.length === 0) {
      return;
    }

    for (const message of inboundMessages) {
      try {
        await this.handleInboundMessage(message);
      } catch (error) {
        this.logger.error(
          { error, from: message.from },
          "[meta-whatsapp] failed to process inbound message",
        );
      }
    }
  }

  async sendWhatsAppMessage(to: string, text: string): Promise<string | null> {
    const integration = await this.getActiveIntegration();
    const token = env.WHATSAPP_TOKEN ?? integration?.accessToken ?? null;
    const phoneNumberId = env.PHONE_NUMBER_ID ?? integration?.phoneNumberId ?? null;

    if (!token || !phoneNumberId) {
      throw new Error("Meta WhatsApp is not configured");
    }

    const response = await fetch(
      `https://graph.facebook.com/${env.GRAPH_API_VERSION}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: normalizePhoneNumber(to),
          type: "text",
          text: {
            preview_url: false,
            body: text,
          },
        }),
      },
    );

    const rawBody = await response.text();

    if (!response.ok) {
      throw new Error(
        `Meta WhatsApp send failed with status ${response.status}: ${rawBody}`,
      );
    }

    try {
      const parsed = JSON.parse(rawBody) as {
        messages?: Array<{ id?: string }>;
      };

      return parsed.messages?.[0]?.id ?? null;
    } catch {
      return null;
    }
  }

  private async handleInboundMessage(message: InboundMessage): Promise<void> {
    const phone = normalizePhoneNumber(message.from);
    const text = message.text.trim();

    const currentUser = await prisma.user.findUnique({
      where: {
        phone,
      },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
      },
    });

    const user =
      currentUser ??
      (await prisma.user.create({
        data: {
          name: `Usuário ${phone.slice(-4) || phone}`,
          email: `wa-${phone}@example.com`,
          phone,
        },
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
        },
      }));

    const channel = await prisma.userChannel.upsert({
      where: {
        userId: user.id,
      },
      update: {},
      create: {
        userId: user.id,
        status: UserChannelStatus.ONBOARDING,
        onboardingStep: 1,
      },
      select: {
        id: true,
        userId: true,
        status: true,
        onboardingStep: true,
      },
    });

    if (channel.status !== UserChannelStatus.ONBOARDING) {
      if (channel.status === UserChannelStatus.OPT_IN) {
        const result = await studyOrchestratorService.handleOptInConversation({
          userId: user.id,
          userName: user.name,
          text,
        });

        if (result.kind !== "ignored") {
          await this.sendWhatsAppMessage(user.phone, result.replyText);
        }

        return;
      }

      this.logger.info(`[meta-whatsapp] user not in onboarding phone=${phone} userId=${user.id}`);
      return;
    }

    if (channel.onboardingStep === 1) {
      await this.sendWhatsAppMessage(user.phone, buildGreetingMessage(user.name));

      await prisma.userChannel.update({
        where: {
          userId: user.id,
        },
        data: {
          onboardingStep: 2,
        },
      });

      return;
    }

    const answers = parseOnboardingAnswers(text);

    if (!answers) {
      await this.sendWhatsAppMessage(user.phone, buildReaskMessage());
      return;
    }

    await prisma.$transaction(async (tx) => {
      const tenantId = await resolveDefaultTenantId();

      await tx.kycUser.upsert({
        where: {
          userId: user.id,
        },
        update: {
          personalPreferences: [...answers.likes, ...answers.themes],
          language: answers.targetLanguage,
          languageLevel: answers.languageLevel,
          goal: answers.goal,
        },
        create: {
          userId: user.id,
          personalPreferences: [...answers.likes, ...answers.themes],
          language: answers.targetLanguage,
          languageLevel: answers.languageLevel,
          goal: answers.goal,
        },
      });

      await tx.learningProfile.upsert({
        where: {
          userId: user.id,
        },
        update: {
          timezone: "America/Sao_Paulo",
          nativeLanguage: "PT-BR",
          targetLanguage: answers.targetLanguage,
          goal: answers.goal,
          interests: [...answers.likes, ...answers.themes],
          ...(tenantId !== null ? { tenantId } : {}),
        },
        create: {
          userId: user.id,
          ...(tenantId !== null ? { tenantId } : {}),
          timezone: "America/Sao_Paulo",
          nativeLanguage: "PT-BR",
          targetLanguage: answers.targetLanguage,
          goal: answers.goal,
          interests: [...answers.likes, ...answers.themes],
        },
      });
    });

    const studySession = await studyOrchestratorService.startDailyStudySession(user.id);

    await this.sendWhatsAppMessage(user.phone, studySession.replyText);

    this.logger.info(
      `[meta-whatsapp] onboarding completed phone=${phone} userId=${user.id} packId=${studySession.packId ?? "n/a"}`,
    );
  }

  private extractInboundMessages(payload: unknown): InboundMessage[] {
    if (!isRecord(payload)) {
      return [];
    }

    const entries = Array.isArray(payload.entry) ? payload.entry : [];
    const messages: InboundMessage[] = [];

    for (const entry of entries) {
      if (!isRecord(entry) || !Array.isArray(entry.changes)) {
        continue;
      }

      for (const change of entry.changes) {
        if (!isRecord(change) || !isRecord(change.value)) {
          continue;
        }

        const value = change.value as WebhookPayload;
        const incomingMessages = Array.isArray(value.messages)
          ? value.messages
          : [];

        for (const message of incomingMessages) {
          if (!isRecord(message)) {
            continue;
          }

          const from = getString(message.from);
          const text = this.extractMessageText(message);

          if (from && text) {
            messages.push({
              from,
              text,
            });
          }
        }
      }
    }

    return messages;
  }

  private extractMessageText(message: Record<string, unknown>): string | undefined {
    const messageType = getString(message.type);

    if (messageType === "text" && isRecord(message.text)) {
      return getString(message.text.body);
    }

    if (isRecord(message.interactive)) {
      const buttonReply = message.interactive.button_reply;
      if (isRecord(buttonReply)) {
        return getString(buttonReply.title) ?? getString(buttonReply.id);
      }

      const listReply = message.interactive.list_reply;
      if (isRecord(listReply)) {
        return getString(listReply.title) ?? getString(listReply.id);
      }
    }

    if (isRecord(message.button)) {
      return getString(message.button.text);
    }

    return undefined;
  }
}
