import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().optional(),
  AWS_REGION: z.string().optional(),
  LEADS_EVENTS_QUEUE_URL: z.string().optional(),
  INTERACTIONS_EVENTS_QUEUE_URL: z.string().optional(),
  SQS_MAX_NUMBER_OF_MESSAGES: z.coerce.number().int().min(1).max(10).default(10),
  SQS_WAIT_TIME_SECONDS: z.coerce.number().int().min(0).max(20).default(20),
  SQS_VISIBILITY_TIMEOUT_SECONDS: z.coerce.number().int().min(0).optional(),
  SQS_POLLING_IDLE_DELAY_MS: z.coerce.number().int().min(0).default(1000),
  EVENT_PROCESSING_LOCK_TIMEOUT_SECONDS: z.coerce
    .number()
    .int()
    .min(1)
    .default(300),
  TWILIO_ACCOUNT_SID: z.string().min(1).optional(),
  TWILIO_AUTH_TOKEN: z.string().min(1).optional(),
  TWILIO_WHATSAPP_FROM: z.string().min(1).optional(),
  TWILIO_STATUS_CALLBACK_URL: z.string().url().optional(),
});

export const env = EnvSchema.parse(process.env);
