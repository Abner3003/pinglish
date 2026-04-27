import { env } from "../config/env.js";

type Logger = Pick<typeof console, "info" | "warn" | "error">;

function isPresent(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function logWhatsAppRuntimeConfig(logger: Logger, scope: string): void {
  logger.info(
    {
      scope,
      whatsappToken: isPresent(env.WHATSAPP_TOKEN) ? "present" : "missing",
      whatsappPhoneNumberId: isPresent(env.WHATSAPP_PHONE_NUMBER_ID)
        ? "present"
        : isPresent(env.PHONE_NUMBER_ID)
          ? "present-via-PHONE_NUMBER_ID"
          : "missing",
      metaWhatsAppIntegration: {
        appId: isPresent(env.META_WHATSAPP_APP_ID) ? "present" : "missing",
        appSecret: isPresent(env.META_WHATSAPP_APP_SECRET) ? "present" : "missing",
      },
    },
    "[runtime] whatsapp config",
  );
}
