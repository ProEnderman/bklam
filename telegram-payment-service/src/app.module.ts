import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';

import { HealthController } from './health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { TelegramModule } from './telegram/telegram.module';
import { PaymentsModule } from './payments/payments.module';
import { QueueModule } from './queue/queue.module';
import { CryptoModule } from './crypto/crypto.module';

@Module({
  controllers: [HealthController],
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        retryStrategy: (times) => {
          if (times > 3) {
            return null; // Stop retrying
          }
          return Math.min(times * 50, 2000);
        },
        maxRetriesPerRequest: null,
      },
    }),
    PrismaModule,
    AuthModule,
    TelegramModule,
    PaymentsModule,
    QueueModule,
    CryptoModule,
  ],
})
export class AppModule {}
