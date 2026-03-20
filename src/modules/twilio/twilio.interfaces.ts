export type Logger = Pick<typeof console, "info" | "warn" | "error">;

export type SendWelcomeMessageInput = {
  to: string;
  firstName?: string | null;
  interestAreas: string [];
  id: string;
};

export interface WelcomeMessenger {
  sendOnboardingMessage(input: SendWelcomeMessageInput): Promise<{
    sid: string | null;
    status: string | null;
  }>;
  sendJourneyStartMessage(input: SendWelcomeMessageInput): Promise<{
    sid: string | null;
    status: string | null;
  }>;
}
