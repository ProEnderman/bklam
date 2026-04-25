import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { CryptoService } from '../../crypto/crypto.service';
import { BankBotService, SendToBankBotJobData } from '../../payments/services/bank-bot.service';
import { QrService } from '../../payments/services/qr.service';
import { AuditService } from '../../telegram/services/audit.service';
import { QUEUE_BANK_BOT, JOB_SEND_TO_BANK_BOT } from '../queue.constants';
import { PaymentRequestStatus } from '@prisma/client';
import { QueueRedisService } from '../redis.service';
import { QueueMetricsService } from '../queue-metrics.service';

const GLOBAL_LIMIT_KEY_PREFIX = 'payments:global:limiter:';
const FLOODWAIT_KEY_PREFIX = 'payments:floodwait:';
const GLOBAL_LIMIT_MAX = 25;
const GLOBAL_LIMIT_WINDOW_SEC = 1;

@Processor(QUEUE_BANK_BOT, {
  lockDuration: 120000,
  stalledInterval: 60000,
  maxStalledCount: 2,
  concurrency: 1,
})
export class SendToBankBotProcessor extends WorkerHost {
  private readonly logger = new Logger(SendToBankBotProcessor.name);

  constructor(
    private prisma: PrismaService,
    private cryptoService: CryptoService,
    private bankBotService: BankBotService,
    private qrService: QrService,
    private auditService: AuditService,
    private redisService: QueueRedisService,
    private metricsService: QueueMetricsService,
  ) {
    super();
  }

  private getQueueName(job: Job): string {
    return (job as any).queueName ?? (job as any).queue?.name ?? 'unknown';
  }

  private async checkFloodWaitBackoff(job: Job, queueName: string): Promise<boolean> {
    const redis = this.redisService.getClient();
    const key = FLOODWAIT_KEY_PREFIX + queueName;
    const ttl = await redis.ttl(key);
    if (ttl > 0) {
      const delayMs = Math.min(2000 + Math.random() * 1000, ttl * 1000);
      this.logger.debug(`Queue ${queueName} in FloodWait backoff, delaying job ${delayMs}ms`);
      await job.moveToDelayed(Date.now() + delayMs);
      return true;
    }
    return false;
  }

  private async tryGlobalLimit(): Promise<boolean> {
    const redis = this.redisService.getClient();
    const window = Math.floor(Date.now() / 1000);
    const key = GLOBAL_LIMIT_KEY_PREFIX + window;
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, GLOBAL_LIMIT_WINDOW_SEC + 1);
    return count > GLOBAL_LIMIT_MAX;
  }

  async process(job: Job<SendToBankBotJobData, any, string>) {
    if (job.name !== JOB_SEND_TO_BANK_BOT) {
      this.logger.warn(`Unknown job name: ${job.name}`);
      return;
    }

    const queueName = this.getQueueName(job);
    const startTime = Date.now();

    if (await this.checkFloodWaitBackoff(job, queueName)) {
      return { delayed: true, reason: 'floodwait_backoff' };
    }
    if (await this.tryGlobalLimit()) {
      this.metricsService.recordGlobalLimitReject();
      const jitterMs = Math.floor(Math.random() * 201); // 0–200 ms
      await job.moveToDelayed(Date.now() + 1000 + jitterMs);
      return { delayed: true, reason: 'global_limit' };
    }

    const { paymentRequestId, sessionId } = job.data;

    this.logger.log(
      `Processing sendToBankBot job for payment request ${paymentRequestId}`,
    );

    try {
      // 1. Check if payment request is still valid
      const pr = await this.prisma.paymentRequest.findUnique({
        where: { id: paymentRequestId },
      });

      if (!pr || pr.status === PaymentRequestStatus.CANCELLED) {
        this.logger.log(`Payment request ${paymentRequestId} cancelled, skipping`);
        this.metricsService.recordJobDuration(queueName, (Date.now() - startTime) / 1000);
        return { skipped: true };
      }

      // Update job progress to prevent stalling
      await job.updateProgress(10);

      // 2. Send to bank bot and wait for reply
      this.logger.log(`📤 Sending message to bank bot and waiting for reply...`);
      const result = await this.bankBotService.sendAndWaitForReply(job.data);
      
      // Update progress after getting result
      await job.updateProgress(90);

      // 3. Update payment request based on result
      if (result.success && result.paymentUrl) {
        // Success - create payment link
        await this.prisma.$transaction([
          this.prisma.paymentLink.upsert({
            where: { paymentRequestId },
            create: {
              paymentRequestId,
              urlHash: result.urlHash!,
              encryptedUrl: this.cryptoService.encrypt(result.paymentUrl),
              botMessageId: result.botMessageId,
            },
            update: {
              urlHash: result.urlHash!,
              encryptedUrl: this.cryptoService.encrypt(result.paymentUrl),
              botMessageId: result.botMessageId,
            },
          }),
          this.prisma.paymentRequest.update({
            where: { id: paymentRequestId },
            data: {
              status: PaymentRequestStatus.LINK_RECEIVED,
              errorCode: null,
              errorMessage: null,
            },
          }),
        ]);

        // Pre-generate QR code so it's cached and ready instantly
        try {
          await this.qrService.generateQr(paymentRequestId, result.urlHash!);
          this.logger.log(`QR pre-generated for ${paymentRequestId}`);
        } catch (e) {
          this.logger.warn(`QR pre-generation failed (will generate on demand): ${e}`);
        }

        await this.auditService.log({
          userId: pr.userId,
          action: 'PAYMENT_LINK_RECEIVED',
          entity: 'payment_request',
          entityId: paymentRequestId,
          metadata: { urlHash: result.urlHash },
        });

        this.logger.log(
          `Payment request ${paymentRequestId} completed successfully`,
        );

        this.metricsService.recordJobDuration(queueName, (Date.now() - startTime) / 1000);
        return { success: true };
      } else {
        // Failure - update status
        const status = this.mapErrorToStatus(result.errorCode);

        await this.prisma.paymentRequest.update({
          where: { id: paymentRequestId },
          data: {
            status,
            errorCode: result.errorCode,
            errorMessage: result.errorMessage,
          },
        });

        await this.auditService.log({
          userId: pr.userId,
          action: 'PAYMENT_FAILED',
          entity: 'payment_request',
          entityId: paymentRequestId,
          metadata: {
            errorCode: result.errorCode,
            errorMessage: result.errorMessage,
          },
        });

        this.logger.warn(
          `Payment request ${paymentRequestId} failed: ${result.errorCode} - ${result.errorMessage}`,
        );

        // Throw error for retryable errors
        if (this.isRetryable(result.errorCode)) {
          throw new Error(`${result.errorCode}: ${result.errorMessage}`);
        }

        this.metricsService.recordJobDuration(queueName, (Date.now() - startTime) / 1000);
        return { success: false, errorCode: result.errorCode };
      }
    } catch (error: any) {
      const msg = error?.message ?? '';
      const floodMatch = msg.match(/FLOOD_WAIT:(\d+)/);
      if (floodMatch) {
        const waitSeconds = parseInt(floodMatch[1], 10) || 60;
        const delayMs = waitSeconds * 1000 + Math.random() * 500;
        this.metricsService.recordFloodWait();
        const redis = this.redisService.getClient();
        await redis.set(FLOODWAIT_KEY_PREFIX + queueName, '1', 'EX', waitSeconds);
        this.logger.warn(
          `FloodWait ${waitSeconds}s for ${paymentRequestId}, moving job to delayed ${delayMs}ms`,
        );
        await job.moveToDelayed(Date.now() + delayMs);
        this.metricsService.recordJobDuration(queueName, (Date.now() - startTime) / 1000);
        return { floodWait: true, waitSeconds };
      }
      this.metricsService.recordJobDuration(queueName, (Date.now() - startTime) / 1000);
      this.logger.error(
        `Job failed for payment request ${paymentRequestId}: ${error.message}`,
      );
      throw error;
    }
  }

  private mapErrorToStatus(errorCode?: string): PaymentRequestStatus {
    switch (errorCode) {
      case 'TIMEOUT':
        return PaymentRequestStatus.TIMEOUT;
      case 'UNPARSABLE':
        return PaymentRequestStatus.UNPARSABLE;
      case 'SESSION_INVALID':
        return PaymentRequestStatus.SESSION_INVALID;
      case 'RATE_LIMITED':
        return PaymentRequestStatus.RATE_LIMITED;
      default:
        return PaymentRequestStatus.TIMEOUT;
    }
  }

  private isRetryable(errorCode?: string): boolean {
    // Only retry on timeout and rate limit (after backoff)
    return errorCode === 'TIMEOUT' || errorCode === 'RATE_LIMITED';
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.log(`Job ${job.id} completed`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(`Job ${job.id} failed: ${error.message}`);
  }
}
