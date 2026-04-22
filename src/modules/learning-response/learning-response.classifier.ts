type AnswerQuality = 0 | 1 | 2 | 3 | 4 | 5;

type ClassifyInput = {
  userText: string;
  expectedText?: string | null;
  itemType?: "LEXICAL_CHUNK" | "PATTERN" | "EXAMPLE" | "MICRO_LESSON" | null;
};

type ClassifyOutput = {
  answerQuality: AnswerQuality;
  confidence: number;
  reason: string;
};

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string): string[] {
  const normalized = normalizeText(value);

  if (!normalized) {
    return [];
  }

  return normalized.split(" ").filter((token) => token.length > 1);
}

function overlapScore(left: string[], right: string[]): number {
  if (left.length === 0 || right.length === 0) {
    return 0;
  }

  const rightSet = new Set(right);
  const hits = left.filter((token) => rightSet.has(token)).length;

  return hits / Math.max(left.length, right.length);
}

export class LearningResponseClassifier {
  classify(input: ClassifyInput): ClassifyOutput {
    const userText = normalizeText(input.userText);
    const expectedText = input.expectedText ? normalizeText(input.expectedText) : "";

    if (!userText) {
      return {
        answerQuality: 0,
        confidence: 1,
        reason: "empty-response",
      };
    }

    const refusalPatterns = [
      /\bnao sei\b/,
      /\bi don't know\b/,
      /\bnao lembro\b/,
      /\bpass\b/,
      /\bskip\b/,
      /\bpula\b/,
      /\bnao entendi\b/,
    ];

    if (refusalPatterns.some((pattern) => pattern.test(userText))) {
      return {
        answerQuality: 0,
        confidence: 0.9,
        reason: "explicit-refusal",
      };
    }

    const userTokens = tokenize(userText);
    const expectedTokens = tokenize(expectedText);
    const score = expectedTokens.length > 0 ? overlapScore(userTokens, expectedTokens) : 0;

    if (expectedTokens.length === 0) {
      if (userTokens.length <= 2) {
        return {
          answerQuality: 2,
          confidence: 0.45,
          reason: "no-reference-short-answer",
        };
      }

      if (userTokens.length <= 6) {
        return {
          answerQuality: 3,
          confidence: 0.5,
          reason: "no-reference-medium-answer",
        };
      }

      return {
        answerQuality: 4,
        confidence: 0.55,
        reason: "no-reference-long-answer",
      };
    }

    if (score >= 0.9) {
      return {
        answerQuality: 5,
        confidence: 0.95,
        reason: "near-exact-match",
      };
    }

    if (score >= 0.7) {
      return {
        answerQuality: 4,
        confidence: 0.8,
        reason: "strong-match",
      };
    }

    if (score >= 0.45) {
      return {
        answerQuality: 3,
        confidence: 0.7,
        reason: "partial-match",
      };
    }

    if (score >= 0.2) {
      return {
        answerQuality: 2,
        confidence: 0.55,
        reason: "weak-match",
      };
    }

    const itemType = input.itemType ?? "EXAMPLE";

    if (itemType === "MICRO_LESSON" && userTokens.length >= 8) {
      return {
        answerQuality: 3,
        confidence: 0.45,
        reason: "lesson-style-response",
      };
    }

    if (userTokens.length <= 3) {
      return {
        answerQuality: 1,
        confidence: 0.35,
        reason: "very-short-response",
      };
    }

    return {
      answerQuality: 2,
      confidence: 0.4,
      reason: "low-overlap",
    };
  }
}

export const learningResponseClassifier = new LearningResponseClassifier();
