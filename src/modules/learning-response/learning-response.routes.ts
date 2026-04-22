import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { learningResponseClassifier } from "./learning-response.classifier.js";

const classifyBodySchema = z.object({
  userText: z.string().min(1),
  expectedText: z.string().min(1).optional().nullable(),
  itemType: z
    .enum(["LEXICAL_CHUNK", "PATTERN", "EXAMPLE", "MICRO_LESSON"])
    .optional()
    .nullable(),
});

const classifyResponseSchema = z.object({
  answerQuality: z.number().int().min(0).max(5),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
});

export const learningResponseRoutes: FastifyPluginAsync = async (app) => {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.post(
    "/classify",
    {
      schema: {
        tags: ["LearningResponse"],
        summary: "Classify a learner response into answer quality",
        body: classifyBodySchema,
        response: {
          200: classifyResponseSchema,
        },
      },
    },
    async (request) => {
      const result = learningResponseClassifier.classify({
        userText: request.body.userText,
        expectedText: request.body.expectedText ?? null,
        itemType: request.body.itemType ?? null,
      });

      return result;
    },
  );
};
