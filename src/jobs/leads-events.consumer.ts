import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SQSClient,
  type Message,
} from "@aws-sdk/client-sqs";
import {
  EventProcessingStatus,
  Prisma,
} from "../generated/prisma/index.js";
import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import {
  leadCreatedEventSchema,
  type LeadCreatedEvent,
} from "../modules/leads/leads.events.js";
import {
  buildWelcomeMessenger,
  type WelcomeMessenger,
} from "../modules/twilio/twilio.service.js";

type Logger = Pick<typeof console, "info" | "warn" | "error">;

type ConsumerOptions = {
  maxNumberOfMessages: number;
  waitTimeSeconds: number;
  visibilityTimeoutSeconds?: number;
  idleDelayMs: number;
  lockTimeoutSeconds: number;
};

const LEADS_EVENTS_CONSUMER_NAME = "leads-events-worker";

class LeadCreatedHandler {
  constructor(
    private readonly logger: Logger,
    private readonly welcomeMessenger: WelcomeMessenger,
  ) {}

  async handle(event: LeadCreatedEvent): Promise<void> {
    await this.welcomeMessenger.sendWelcomeMessage({
      to: event.lead.phone,
      firstName: event.lead.name,
      interestAreas: event.lead.interests
    });

    this.logger.info(
      `[leads-worker] processed lead.created for ${event.lead.email} (${event.lead.id})`,
    );
  }
}

type ClaimResult =
  | { kind: "claimed" }
  | { kind: "duplicate-completed" }
  | { kind: "already-processing" };

class EventProcessingSemaphore {
  constructor(
    private readonly consumer: string,
    private readonly lockTimeoutSeconds: number,
  ) {}

  async claim(event: LeadCreatedEvent): Promise<ClaimResult> {
    try {
      await prisma.eventProcessing.create({
        data: {
          consumer: this.consumer,
          eventId: event.eventId,
          eventType: event.type,
          aggregateId: event.lead.id,
          status: EventProcessingStatus.PROCESSING,
          attempts: 1,
          error: null,
        },
      });

      return { kind: "claimed" };
    } catch (error) {
      if (!this.isUniqueConstraintError(error)) {
        throw error;
      }
    }

    const record = await prisma.eventProcessing.findUnique({
      where: {
        consumer_eventId: {
          consumer: this.consumer,
          eventId: event.eventId,
        },
      },
    });

    if (!record) {
      return this.claim(event);
    }

    if (record.status === EventProcessingStatus.COMPLETED) {
      return { kind: "duplicate-completed" };
    }

    const staleThreshold = new Date(
      Date.now() - this.lockTimeoutSeconds * 1000,
    );

    if (
      record.status === EventProcessingStatus.PROCESSING &&
      record.updatedAt > staleThreshold
    ) {
      return { kind: "already-processing" };
    }

    const recovered = await prisma.eventProcessing.updateMany({
      where: {
        consumer: this.consumer,
        eventId: event.eventId,
        OR: [
          { status: EventProcessingStatus.FAILED },
          {
            status: EventProcessingStatus.PROCESSING,
            updatedAt: { lte: staleThreshold },
          },
        ],
      },
      data: {
        status: EventProcessingStatus.PROCESSING,
        error: null,
        attempts: {
          increment: 1,
        },
      },
    });

    return recovered.count === 1
      ? { kind: "claimed" }
      : { kind: "already-processing" };
  }

  async complete(event: LeadCreatedEvent): Promise<void> {
    await prisma.eventProcessing.updateMany({
      where: {
        consumer: this.consumer,
        eventId: event.eventId,
        status: EventProcessingStatus.PROCESSING,
      },
      data: {
        status: EventProcessingStatus.COMPLETED,
        error: null,
      },
    });
  }

  async fail(event: LeadCreatedEvent, error: unknown): Promise<void> {
    await prisma.eventProcessing.updateMany({
      where: {
        consumer: this.consumer,
        eventId: event.eventId,
        status: EventProcessingStatus.PROCESSING,
      },
      data: {
        status: EventProcessingStatus.FAILED,
        error: this.serializeError(error),
      },
    });
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    );
  }

  private serializeError(error: unknown): string {
    if (error instanceof Error) {
      return `${error.name}: ${error.message}`.slice(0, 2000);
    }

    return String(error).slice(0, 2000);
  }
}

class SqsLeadsEventsConsumer {
  private readonly client: SQSClient;
  private shouldStop = false;

  constructor(
    private readonly queueUrl: string,
    region: string,
    private readonly handler: LeadCreatedHandler,
    private readonly semaphore: EventProcessingSemaphore,
    private readonly logger: Logger,
    private readonly options: ConsumerOptions,
  ) {
    this.client = new SQSClient({ region });
  }

  async start(): Promise<void> {
    this.logger.info(`[leads-worker] polling ${this.queueUrl}`);

    while (!this.shouldStop) {
      const messages = await this.receiveMessages();

      if (messages.length === 0) {
        await this.sleep(this.options.idleDelayMs);
        continue;
      }

      for (const message of messages) {
        if (this.shouldStop) {
          break;
        }

        await this.processMessage(message);
      }
    }

    this.logger.info("[leads-worker] stopped");
  }

  stop(): void {
    this.shouldStop = true;
  }

  private async receiveMessages(): Promise<Message[]> {
    const response = await this.client.send(
      new ReceiveMessageCommand({
        QueueUrl: this.queueUrl,
        MaxNumberOfMessages: this.options.maxNumberOfMessages,
        WaitTimeSeconds: this.options.waitTimeSeconds,
        VisibilityTimeout: this.options.visibilityTimeoutSeconds,
        MessageAttributeNames: ["All"],
        AttributeNames: ["All"],
      }),
    );

    return response.Messages ?? [];
  }

  private async processMessage(message: Message): Promise<void> {
    const receiptHandle = message.ReceiptHandle;

    if (!receiptHandle) {
      this.logger.warn("[leads-worker] skipping message without receipt handle");
      return;
    }

    let event: LeadCreatedEvent | null = null;

    try {
      const parsedBody = JSON.parse(message.Body ?? "");
      event = leadCreatedEventSchema.parse(parsedBody);

      const claim = await this.semaphore.claim(event);

      if (claim.kind === "duplicate-completed") {
        this.logger.info(
          `[leads-worker] duplicate event ${event.eventId} already completed, deleting message`,
        );
        await this.deleteMessage(receiptHandle);
        return;
      }

      if (claim.kind === "already-processing") {
        this.logger.info(
          `[leads-worker] event ${event.eventId} is already being processed, keeping message in queue`,
        );
        return;
      }

      await this.handler.handle(event);
      await this.semaphore.complete(event);
      await this.deleteMessage(receiptHandle);
    } catch (error) {
      if (error instanceof SyntaxError) {
        this.logger.error("[leads-worker] invalid JSON payload, deleting message");
        await this.deleteMessage(receiptHandle);
        return;
      }

      if (error instanceof Error && error.name === "ZodError") {
        this.logger.error("[leads-worker] invalid event contract, deleting message");
        await this.deleteMessage(receiptHandle);
        return;
      }

      if (event) {
        await this.semaphore.fail(event, error);
      }

      this.logger.error("[leads-worker] handler failed, message will return to queue");
      this.logger.error(error);
    }
  }

  private async deleteMessage(receiptHandle: string): Promise<void> {
    await this.client.send(
      new DeleteMessageCommand({
        QueueUrl: this.queueUrl,
        ReceiptHandle: receiptHandle,
      }),
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private tryParseEvent(body?: string): LeadCreatedEvent | null {
    if (!body) {
      return null;
    }

    try {
      const json = JSON.parse(body);
      const parsed = leadCreatedEventSchema.safeParse(json);
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }
}

async function main(): Promise<void> {
  if (!env.LEADS_EVENTS_QUEUE_URL || !env.AWS_REGION) {
    throw new Error(
      "LEADS_EVENTS_QUEUE_URL and AWS_REGION must be configured to run the worker",
    );
  }

  const logger: Logger = console;
  const handler = new LeadCreatedHandler(
    logger,
    buildWelcomeMessenger(logger),
  );
  const semaphore = new EventProcessingSemaphore(
    LEADS_EVENTS_CONSUMER_NAME,
    env.EVENT_PROCESSING_LOCK_TIMEOUT_SECONDS,
  );

  const consumer = new SqsLeadsEventsConsumer(
    env.LEADS_EVENTS_QUEUE_URL,
    env.AWS_REGION,
    handler,
    semaphore,
    logger,
    {
      maxNumberOfMessages: env.SQS_MAX_NUMBER_OF_MESSAGES,
      waitTimeSeconds: env.SQS_WAIT_TIME_SECONDS,
      visibilityTimeoutSeconds: env.SQS_VISIBILITY_TIMEOUT_SECONDS,
      idleDelayMs: env.SQS_POLLING_IDLE_DELAY_MS,
      lockTimeoutSeconds: env.EVENT_PROCESSING_LOCK_TIMEOUT_SECONDS,
    },
  );

  const shutdown = (signal: string) => {
    logger.info(`[leads-worker] received ${signal}, shutting down`);
    consumer.stop();
  };

  process.on("SIGINT", () => {
    shutdown("SIGINT");
  });

  process.on("SIGTERM", () => {
    shutdown("SIGTERM");
  });

  await consumer.start();
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error("[leads-worker] fatal error");
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
