import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import IORedis from 'ioredis';

@Injectable()
export class QueueRedisService implements OnModuleInit, OnModuleDestroy {
  private client: IORedis | null = null;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    this.client = new IORedis({
      host: this.configService.get('REDIS_HOST', 'localhost'),
      port: this.configService.get('REDIS_PORT', 6379),
      maxRetriesPerRequest: null,
      retryStrategy: (times) => (times > 3 ? null : Math.min(times * 50, 2000)),
    });
  }

  onModuleDestroy() {
    if (this.client) {
      this.client.disconnect();
      this.client = null;
    }
  }

  getClient(): IORedis {
    if (!this.client) throw new Error('QueueRedisService not initialized');
    return this.client;
  }
}
