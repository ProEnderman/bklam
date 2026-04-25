import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';

const MAX_WORKERS = parseInt(process.env.PAYMENTS_QUEUE_MAX_WORKERS || '100', 10);
const IDLE_CLOSE_SEC = parseInt(process.env.PAYMENTS_QUEUE_IDLE_CLOSE_SEC || '900', 10); // 15 min
const CLEANUP_INTERVAL_MS = 60_000; // 1 min

interface WorkerEntry {
  worker: Worker;
  lastUsed: number;
  /** Incremented when a job starts, decremented when it ends; do not evict/close if > 0. */
  activeJobs: number;
}

const workers = new Map<string, WorkerEntry>();
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

export interface SendToBankBotJobData {
  paymentRequestId: string;
  sessionId: string;
  invoiceId?: string;
  invoiceNumber?: string;
  amount?: string;
  currency?: string;
  bankBotUsername?: string;
}

export type BankBotProcessorFn = (job: Job<SendToBankBotJobData, any, string>) => Promise<any>;

export type OnWorkerTouch = (queueName: string) => void;

function startCleanupTimer() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    const idleThreshold = now - IDLE_CLOSE_SEC * 1000;
    for (const [name, entry] of workers.entries()) {
      if (entry.activeJobs > 0) continue;
      if (entry.lastUsed < idleThreshold) {
        try {
          entry.worker.close();
        } catch (_) {}
        workers.delete(name);
      }
    }
  }, CLEANUP_INTERVAL_MS);
}

function evictLruIfNeeded(connection: IORedis): void {
  if (workers.size < MAX_WORKERS) return;
  let oldestKey: string | null = null;
  let oldestTime = Infinity;
  for (const [name, entry] of workers.entries()) {
    if (entry.activeJobs > 0) continue;
    if (entry.lastUsed < oldestTime) {
      oldestTime = entry.lastUsed;
      oldestKey = name;
    }
  }
  if (oldestKey) {
    const entry = workers.get(oldestKey)!;
    try {
      entry.worker.close();
    } catch (_) {}
    workers.delete(oldestKey);
  }
}

export function touchWorker(queueName: string): void {
  const entry = workers.get(queueName);
  if (entry) entry.lastUsed = Date.now();
}

/**
 * Ensures a worker exists for the given queue name. Bounded by MAX_WORKERS (LRU eviction)
 * and idle timeout. Each worker has concurrency=1 and a per-worker limiter.
 */
export function ensureWorker(
  queueName: string,
  processor: BankBotProcessorFn,
  connection: IORedis,
  options?: { limiterMax?: number; limiterDurationMs?: number; onTouch?: OnWorkerTouch },
): Worker {
  const existing = workers.get(queueName);
  if (existing) {
    return existing.worker;
  }
  evictLruIfNeeded(connection);
  startCleanupTimer();

  const limiterMax = options?.limiterMax ?? 10;
  const limiterDuration = options?.limiterDurationMs ?? 1000;
  const onTouch = options?.onTouch;

  const wrappedProcessor = async (job: Job<SendToBankBotJobData, any, string>) => {
    const entry = workers.get(queueName);
    if (entry) {
      entry.activeJobs++;
      entry.lastUsed = Date.now();
    }
    onTouch?.(queueName);
    try {
      return await processor(job);
    } finally {
      const e = workers.get(queueName);
      if (e) e.activeJobs = Math.max(0, e.activeJobs - 1);
    }
  };

  const worker = new Worker(
    queueName,
    wrappedProcessor as any,
    {
      connection,
      concurrency: 1,
      limiter: { max: limiterMax, duration: limiterDuration },
      lockDuration: 120000,
      stalledInterval: 60000,
      maxStalledCount: 2,
    },
  );
  workers.set(queueName, { worker, lastUsed: Date.now(), activeJobs: 0 });
  return worker;
}
