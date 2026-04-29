import { UserChannelStatus } from "../generated/prisma/index.js";
import { prisma } from "../lib/prisma.js";
import { logWhatsAppRuntimeConfig } from "../lib/runtime-diagnostics.js";
import { metaWhatsAppService } from "../modules/meta-whatsapp/meta-whatsapp.module.js";
import { studyPackProviderService } from "../modules/study-pack-provider/study-pack-provider.module.js";
import { resolveDefaultTenantId } from "../modules/tenants/default-tenant.service.js";

type Logger = Pick<typeof console, "info" | "warn" | "error">;

type GapReinforcementRecipient = {
  userId: string;
  phone: string;
  tenantId: string | null;
  targetLanguage: string;
  nativeLanguage: string;
};

function trimOrNull(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();

  return trimmed ? trimmed : null;
}

function formatGapItem(item: {
  title?: string;
  text: string;
  audioScript?: string;
  examples?: string[];
}, index: number): string {
  const title = trimOrNull(item.title);
  const text = trimOrNull(item.text) ?? "";
  const lines: string[] = [];

  if (title) {
    lines.push(`${index + 1}. ${title}`);

    if (text && text !== title) {
      lines.push(text);
    }
  } else {
    lines.push(`• ${text}`);
  }

  const examples = Array.isArray(item.examples)
    ? item.examples.map((example) => example.trim()).filter(Boolean)
    : [];

  if (examples.length > 0) {
    lines.push(`Exemplos:\n${examples.map((example) => `• ${example}`).join("\n")}`);
  }

  if (item.audioScript) {
    const audioScript = item.audioScript.trim();

    if (audioScript) {
      lines.push(`🎧 ${audioScript}`);
    }
  }

  return lines.join("\n");
}

function buildGapReinforcementMessage(input: {
  items: Array<{
    title?: string;
    text: string;
    audioScript?: string;
    encouragementMessage?: string;
    examples?: string[];
  }>;
  audioScript?: string;
  encouragementMessage?: string;
}): string {
  const sections: string[] = [];

  if (input.items.length > 0) {
    sections.push(input.items.map((item, index) => formatGapItem(item, index)).join("\n\n"));
  }

  const topLevelAudioScript = trimOrNull(input.audioScript);

  if (topLevelAudioScript) {
    sections.push(`🎙️ Texto para voz/TTS:\n${topLevelAudioScript}`);
  }

  const closingMessage =
    trimOrNull(input.encouragementMessage) ??
    trimOrNull([...input.items].reverse().find((item) => trimOrNull(item.encouragementMessage))?.encouragementMessage ?? null);

  if (closingMessage) {
    sections.push(closingMessage);
  }

  return sections.join("\n\n").trim();
}

export async function runGapReinforcementDispatcher(): Promise<void> {
  logWhatsAppRuntimeConfig(console, "gap-reinforcement-dispatcher");

  const defaultTenantId = await resolveDefaultTenantId();
  const limit = 3;

  const profiles = await prisma.learningProfile.findMany({
    select: {
      userId: true,
      tenantId: true,
      targetLanguage: true,
      nativeLanguage: true,
      user: {
        select: {
          id: true,
          phone: true,
          userChannel: {
            select: {
              status: true,
              awaitingStudyReply: true,
            },
          },
        },
      },
    },
  });

  const recipients: GapReinforcementRecipient[] = profiles
    .filter((profile) => profile.user.userChannel?.status === UserChannelStatus.OPT_IN)
    .filter((profile) => profile.user.userChannel?.awaitingStudyReply === false)
    .map((profile) => ({
      userId: profile.userId,
      phone: profile.user.phone,
      tenantId: profile.tenantId ?? defaultTenantId,
      targetLanguage: profile.targetLanguage,
      nativeLanguage: profile.nativeLanguage,
    }));

  for (const recipient of recipients) {
    try {
      const reinforcement = await studyPackProviderService.generateGapReinforcement({
        userId: recipient.userId,
        tenantId: recipient.tenantId,
        targetLanguage: recipient.targetLanguage,
        nativeLanguage: recipient.nativeLanguage,
        limit,
      });

      if (!reinforcement) {
        console.warn(
          `[gap-reinforcement] provider returned empty payload userId=${recipient.userId}`,
        );
        continue;
      }

      const message = buildGapReinforcementMessage({
        items: reinforcement.data.items,
        audioScript: reinforcement.data.audioScript,
        encouragementMessage: reinforcement.data.encouragementMessage,
      });

      if (!message) {
        console.warn(
          `[gap-reinforcement] nothing to send userId=${recipient.userId} items=${reinforcement.data.items.length}`,
        );
        continue;
      }

      await metaWhatsAppService.sendWhatsAppMessage(recipient.phone, message);

      await prisma.userChannel.updateMany({
        where: {
          userId: recipient.userId,
          status: UserChannelStatus.OPT_IN,
        },
        data: {
          lastOutboundAt: new Date(),
        },
      });

      console.info(
        `[gap-reinforcement] dispatched userId=${recipient.userId} items=${reinforcement.data.items.length}`,
      );
    } catch (error) {
      console.warn(
        `[gap-reinforcement] failed userId=${recipient.userId}`,
        error,
      );
    }
  }
}

async function main(): Promise<void> {
  await runGapReinforcementDispatcher();
}

main().catch((error) => {
  console.error("[gap-reinforcement] dispatch failed", error);
  process.exit(1);
});
