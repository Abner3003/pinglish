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
  messageId: string | null;
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

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
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

function buildOnboardingQuestion(step: 2 | 3 | 4 | 5 | 6): string {
  switch (step) {
    case 2:
      return "1. O que você gosta? (ex: viagens, música, séries)";
    case 3:
      return "2. Quais temas você prefere estudar? (ex: trabalho, rotina, tecnologia)";
    case 4:
      return "3. Qual é seu objetivo com o idioma?";
    case 5:
      return "4. Qual seu nível atual?";
    case 6:
      return "5. Qual idioma você quer aprender? (inglês, espanhol ou francês)";
  }
}

export function buildWelcomeMessage(): string {
  return [
    "Olá! Seja bem-vindo ao Penglish 🎉",
    "Vou te acompanhar nessa jornada para aprender inglês de forma prática.",
    "Agora vamos começar rapidinho.",
  ].join("\n\n");
}

function buildNameQuestion(): string {
  return "Para começarmos, me diga seu nome.";
}

function buildReaskMessage(step: 1 | 2 | 3 | 4 | 5 | 6): string {
  if (step === 1) {
    return buildNameQuestion();
  }

  return [
    "Não consegui entender sua resposta.",
    buildOnboardingQuestion(step as 2 | 3 | 4 | 5 | 6),
  ].join("\n\n");
}

function dedupeStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function mergeStrings(current: string[], next: string[]): string[] {
  return dedupeStrings([...current, ...next]);
}

export class MetaWhatsAppService {
  constructor(private readonly logger: Logger = console) {}

  private async sendTypingIndicator(replyToMessageId: string): Promise<void> {
    const integration = await this.getActiveIntegration();
    const token = env.WHATSAPP_TOKEN ?? integration?.accessToken ?? null;
    const phoneNumberId =
      env.WHATSAPP_PHONE_NUMBER_ID ?? env.PHONE_NUMBER_ID ?? integration?.phoneNumberId ?? null;

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
          status: "read",
          message_id: replyToMessageId,
          typing_indicator: {
            type: "text",
          },
        }),
      },
    );

    const rawBody = await response.text();

    if (!response.ok) {
      throw new Error(
        `Meta WhatsApp typing indicator failed with status ${response.status}: ${rawBody}`,
      );
    }
  }

  private async upsertPartialKycUser(input: {
    userId: string;
    personalPreferences?: string[];
    language?: string;
    languageLevel?: string;
    goal?: LearningGoal | null;
  }): Promise<{
    personalPreferences: string[];
    language: string;
    languageLevel: string;
    goal: LearningGoal | null;
  }> {
    const existing = await prisma.kycUser.findUnique({
      where: {
        userId: input.userId,
      },
      select: {
        personalPreferences: true,
        language: true,
        languageLevel: true,
        goal: true,
      },
    });

    const personalPreferences = input.personalPreferences
      ? mergeStrings(existing?.personalPreferences ?? [], input.personalPreferences)
      : existing?.personalPreferences ?? [];

    const language = input.language ?? existing?.language ?? "";
    const languageLevel = input.languageLevel ?? existing?.languageLevel ?? "";
    const goal = input.goal ?? existing?.goal ?? null;

    const kycUser = await prisma.kycUser.upsert({
      where: {
        userId: input.userId,
      },
      update: {
        personalPreferences,
        language,
        languageLevel,
        goal,
      },
      create: {
        userId: input.userId,
        personalPreferences,
        language,
        languageLevel,
        goal,
      },
      select: {
        personalPreferences: true,
        language: true,
        languageLevel: true,
        goal: true,
      },
    });

    return kycUser;
  }

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
    const phoneNumberId =
      env.WHATSAPP_PHONE_NUMBER_ID ?? env.PHONE_NUMBER_ID ?? integration?.phoneNumberId ?? null;

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

  private async sendReply(
    to: string,
    text: string,
    replyToMessageId?: string | null,
  ): Promise<string | null> {
    if (replyToMessageId) {
      try {
        await this.sendTypingIndicator(replyToMessageId);
      } catch (error) {
        this.logger.warn(
          { error, replyToMessageId },
          "[meta-whatsapp] failed to send typing indicator",
        );
      }
    }

    return this.sendWhatsAppMessage(to, text);
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
          await this.sendReply(user.phone, result.replyText, message.messageId);
        }

        return;
      }

      this.logger.info(`[meta-whatsapp] user not in onboarding phone=${phone} userId=${user.id}`);
      return;
    }

    if (channel.onboardingStep === 1) {
      const name = normalizeName(text);

      if (!name) {
        await this.sendReply(user.phone, buildReaskMessage(1), message.messageId);
        return;
      }

      await prisma.user.update({
        where: {
          id: user.id,
        },
        data: {
          name,
        },
      });

      await this.sendReply(user.phone, buildOnboardingQuestion(2), message.messageId);

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

    switch (channel.onboardingStep) {
      case 2: {
        const likes = splitCommaList(text);

        if (likes.length === 0) {
          await this.sendReply(user.phone, buildReaskMessage(2), message.messageId);
          return;
        }

        await this.upsertPartialKycUser({
          userId: user.id,
          personalPreferences: likes,
        });

        await this.sendReply(user.phone, buildOnboardingQuestion(3), message.messageId);

        await prisma.userChannel.update({
          where: {
            userId: user.id,
          },
          data: {
            onboardingStep: 3,
          },
        });

        break;
      }
      case 3: {
        const themes = splitCommaList(text);

        if (themes.length === 0) {
          await this.sendReply(user.phone, buildReaskMessage(3), message.messageId);
          return;
        }

        await this.upsertPartialKycUser({
          userId: user.id,
          personalPreferences: themes,
        });

        await this.sendReply(user.phone, buildOnboardingQuestion(4), message.messageId);

        await prisma.userChannel.update({
          where: {
            userId: user.id,
          },
          data: {
            onboardingStep: 4,
          },
        });

        break;
      }
      case 4: {
        await this.upsertPartialKycUser({
          userId: user.id,
          goal: resolveGoal(text),
        });

        await this.sendReply(user.phone, buildOnboardingQuestion(5), message.messageId);

        await prisma.userChannel.update({
          where: {
            userId: user.id,
          },
          data: {
            onboardingStep: 5,
          },
        });

        break;
      }
      case 5: {
        await this.upsertPartialKycUser({
          userId: user.id,
          languageLevel: resolveLevel(text),
        });

        await this.sendReply(user.phone, buildOnboardingQuestion(6), message.messageId);

        await prisma.userChannel.update({
          where: {
            userId: user.id,
          },
          data: {
            onboardingStep: 6,
          },
        });

        break;
      }
      case 6: {
        const kycUser = await this.upsertPartialKycUser({
          userId: user.id,
          language: resolveTargetLanguage(text),
        });

        const tenantId = await resolveDefaultTenantId();

        await prisma.learningProfile.upsert({
          where: {
            userId: user.id,
          },
          update: {
            timezone: "America/Sao_Paulo",
            nativeLanguage: "PT-BR",
            targetLanguage: kycUser.language,
            goal: kycUser.goal ?? LearningGoal.OTHER,
            interests: kycUser.personalPreferences,
            ...(tenantId !== null ? { tenantId } : {}),
          },
          create: {
            userId: user.id,
            ...(tenantId !== null ? { tenantId } : {}),
            timezone: "America/Sao_Paulo",
            nativeLanguage: "PT-BR",
            targetLanguage: kycUser.language,
            goal: kycUser.goal ?? LearningGoal.OTHER,
            interests: kycUser.personalPreferences,
          },
        });

        const studySession = await studyOrchestratorService.startDailyStudySession(user.id, {
          forceRegenerate: true,
        });

        if (!studySession) {
          this.logger.warn(
            `[meta-whatsapp] study session unavailable phone=${phone} userId=${user.id}`,
          );
          await this.sendReply(
            user.phone,
            "Seu cadastro foi concluído, mas ainda não tenho um estudo pronto para você. Assim que ficar disponível, eu sigo daqui.",
            message.messageId,
          );
          return;
        }

        if (!studySession.replyText) {
          await this.sendReply(
            user.phone,
            "Seu cadastro foi concluído, mas ainda estou preparando sua próxima atividade.",
            message.messageId,
          );
          return;
        }

        await this.sendReply(user.phone, studySession.replyText, message.messageId);

        this.logger.info(
          `[meta-whatsapp] onboarding completed phone=${phone} userId=${user.id} packId=${studySession.packId ?? "n/a"}`,
        );

        return;
      }
      default: {
        this.logger.warn(
          `[meta-whatsapp] unexpected onboarding step=${channel.onboardingStep} phone=${phone} userId=${user.id}`,
        );
        return;
      }
    }

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
          const messageId = getString(message.id) ?? null;
          const text = this.extractMessageText(message);

          if (from && text) {
            messages.push({
              from,
              text,
              messageId,
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
