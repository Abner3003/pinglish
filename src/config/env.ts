import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().optional(),
  AWS_REGION: z.string().optional(),
  LEADS_EVENTS_QUEUE_URL: z.string().optional(),
});

export const env = EnvSchema.parse(process.env);
