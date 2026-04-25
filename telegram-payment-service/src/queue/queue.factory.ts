import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { getPaymentsQueueName } from './queue.constants';

const queues = new Map<string, Queue>();

/**
 * Returns the payments queue for the given telegram account (restaurant) ID.
 * Each account has its own queue so workers can run with concurrency=1 per account
 * and parallelize across accounts.
 */
export function getPaymentsQueue(
  telegramAccountId: string,
  connection: IORedis,
  defaultJobOptions?: { attempts?: number; backoff?: { type: string; delay: number } },
): Queue {
  const name = getPaymentsQueueName(telegramAccountId);
  if (!queues.has(name)) {
    queues.set(
      name,
      new Queue(name, {
        connection,
        defaultJobOptions: {
          attempts: defaultJobOptions?.attempts ?? 3,
          backoff: defaultJobOptions?.backoff ?? { type: 'exponential', delay: 5000 },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
      }),
    );
  }
  return queues.get(name)!;
}

