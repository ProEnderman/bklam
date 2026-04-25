import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { getPaymentsQueue } from './queue.factory';
import { getPaymentsQueueName } from './queue.constants';
import { ensureWorker, touchWorker } from './worker.manager';
import { QueueRedisService } from './redis.service';
import { SendToBankBotProcessor } from './processors/send-to-bank-bot.processor';

/**
 * Provides per-account queues and ensures a worker exists for each.
 * Workers are bounded (LRU + idle timeout); global limiter and FloodWait backoff in processor.
 */
@Injectable()
export class PaymentsQueueService {
  constructor(
    private redisService: QueueRedisService,
    private sendToBankBotProcessor: SendToBankBotProcessor,
  ) {}

  getQueue(telegramAccountId: string): Queue {
    const connection = this.redisService.getClient();
    const queueName = getPaymentsQueueName(telegramAccountId);
    ensureWorker(
      queueName,
      (job: any) => this.sendToBankBotProcessor.process(job),
      connection,
      {
        limiterMax: 10,
        limiterDurationMs: 1000,
        onTouch: (name) => touchWorker(name),
      },
    );
    return getPaymentsQueue(telegramAccountId, connection, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    });
  }
}
