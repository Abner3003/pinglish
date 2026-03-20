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
  leadResponseCreatedEventSchema,
  type LeadResponseCreatedEvent,
} from "../modules/twilio/twilio.events.js";

type Logger = Pick<typeof console, "info" | "warn" | "error">;

type ConsumerOptions = {
  maxNumberOfMessages: number;
  waitTimeSeconds: number;
  visibilityTimeoutSeconds?: number;
  idleDelayMs: number;
  lockTimeoutSeconds: number;
};

const INTERACTIONS_EVENTS_CONSUMER_NAME = "interactions-events-worker";

class LeadResponseCreatedHandler {
  constructor(private readonly logger: Logger) {}

  async handle(event: LeadResponseCreatedEvent): Promise<void> {
    this.logger.info(
      `[interactions-worker] processed lead-response.created id=${event.leadResponse.id} leadId=${event.leadResponse.leadId}`,
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

  async claim(event: LeadResponseCreatedEvent): Promise<ClaimResult> {
    try {
      await prisma.eventProcessing.create({
        data: {
          consumer: this.consumer,
          eventId: event.eventId,
          eventType: event.type,
          aggregateId: event.leadResponse.leadId,
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

  async complete(event: LeadResponseCreatedEvent): Promise<void> {
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

  async fail(event: LeadResponseCreatedEvent, error: unknown): Promise<void> {
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

class SqsInteractionsEventsConsumer {
  private readonly client: SQSClient;
  private shouldStop = false;

  constructor(
    private readonly queueUrl: string,
    region: string,
    private readonly handler: LeadResponseCreatedHandler,
    private readonly semaphore: EventProcessingSemaphore,
    private readonly logger: Logger,
    private readonly options: ConsumerOptions,
  ) {
    this.client = new SQSClient({ region });
  }

  async start(): Promise<void> {
    this.logger.info(`[interactions-worker] polling ${this.queueUrl}`);

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

    this.logger.info("[interactions-worker] stopped");
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
      this.logger.warn(
        "[interactions-worker] skipping message without receipt handle",
      );
      return;
    }

    let event: LeadResponseCreatedEvent | null = null;

    try {
      const parsedBody = JSON.parse(message.Body ?? "");
      event = leadResponseCreatedEventSchema.parse(parsedBody);

      const claim = await this.semaphore.claim(event);

      if (claim.kind === "duplicate-completed") {
        this.logger.info(
          `[interactions-worker] duplicate event ${event.eventId} already completed, deleting message`,
        );
        await this.deleteMessage(receiptHandle);
        return;
      }

      if (claim.kind === "already-processing") {
        this.logger.info(
          `[interactions-worker] event ${event.eventId} is already being processed, keeping message in queue`,
        );
        return;
      }

      await this.handler.handle(event);
      await this.semaphore.complete(event);
      await this.deleteMessage(receiptHandle);
    } catch (error) {
      if (error instanceof SyntaxError) {
        this.logger.error(
          "[interactions-worker] invalid JSON payload, deleting message",
        );
        await this.deleteMessage(receiptHandle);
        return;
      }

      if (error instanceof Error && error.name === "ZodError") {
        this.logger.error(
          "[interactions-worker] invalid event contract, deleting message",
        );
        await this.deleteMessage(receiptHandle);
        return;
      }

      if (event) {
        await this.semaphore.fail(event, error);
      }

      this.logger.error(
        "[interactions-worker] handler failed, message will return to queue",
      );
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
}

async function main(): Promise<void> {
  if (!env.INTERACTIONS_EVENTS_QUEUE_URL || !env.AWS_REGION) {
    throw new Error(
      "INTERACTIONS_EVENTS_QUEUE_URL and AWS_REGION must be configured to run the worker",
    );
  }

  const logger: Logger = console;
  const handler = new LeadResponseCreatedHandler(logger);
  const semaphore = new EventProcessingSemaphore(
    INTERACTIONS_EVENTS_CONSUMER_NAME,
    env.EVENT_PROCESSING_LOCK_TIMEOUT_SECONDS,
  );

  const consumer = new SqsInteractionsEventsConsumer(
    env.INTERACTIONS_EVENTS_QUEUE_URL,
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
    logger.info(`[interactions-worker] received ${signal}, shutting down`);
    consumer.stop();
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  await consumer.start();
}

main().catch((error) => {
  console.error("[interactions-worker] fatal error");
  console.error(error);
  process.exit(1);
});
