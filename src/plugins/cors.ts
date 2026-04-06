import type { FastifyPluginAsync } from "fastify";
import cors from "@fastify/cors";

const allowedOrigins = [
  "https://smartzap.mentebella.com.br",
  "https://pinglish-api.mentebella.com.br",
];

export const corsPlugin: FastifyPluginAsync = async (app) => {
  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes(origin)) {
        cb(null, true);
        return;
      }

      cb(new Error("Origin not allowed"), false);
    },
    methods: ["GET", "POST", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });
};
