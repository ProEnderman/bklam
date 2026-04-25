import { Injectable, OnModuleInit } from '@nestjs/common';
import { Registry, Counter, Histogram, collectDefaultMetrics } from 'prom-client';

export const QUEUE_METRICS_PREFIX = 'telegram_payments_queue_';

@Injectable()
export class QueueMetricsService implements OnModuleInit {
  public readonly register: Registry;
  public readonly floodWaitTotal: Counter;
  public readonly jobDurationSeconds: Histogram;
  public readonly globalLimitRejectTotal: Counter;

  constructor() {
    this.register = new Registry();
    this.floodWaitTotal = new Counter({
      name: `${QUEUE_METRICS_PREFIX}floodwait_total`,
      help: 'Total number of FloodWait events',
      registers: [this.register],
    });
    this.jobDurationSeconds = new Histogram({
      name: `${QUEUE_METRICS_PREFIX}job_duration_seconds`,
      help: 'Job processing duration in seconds',
      labelNames: ['queue'],
      buckets: [0.5, 1, 2, 5, 10, 30, 60, 120],
      registers: [this.register],
    });
    this.globalLimitRejectTotal = new Counter({
      name: `${QUEUE_METRICS_PREFIX}global_limit_reject_total`,
      help: 'Jobs delayed due to global rate limit',
      registers: [this.register],
    });
  }

  onModuleInit() {
    collectDefaultMetrics({ register: this.register, prefix: QUEUE_METRICS_PREFIX });
  }

  recordFloodWait(): void {
    this.floodWaitTotal.inc();
  }

  recordJobDuration(queueName: string, durationSeconds: number): void {
    this.jobDurationSeconds.observe({ queue: queueName }, durationSeconds);
  }

  recordGlobalLimitReject(): void {
    this.globalLimitRejectTotal.inc();
  }

  async getMetrics(): Promise<string> {
    return this.register.metrics();
  }
}
