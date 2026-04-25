import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { SendToBankBotProcessor } from './processors/send-to-bank-bot.processor';
import { PaymentsQueueService } from './payments-queue.service';
import { QueueRedisService } from './redis.service';
import { QueueMetricsService } from './queue-metrics.service';
import { QueueMetricsController } from './metrics.controller';
import { BankBotService } from '../payments/services/bank-bot.service';
import { ParserService } from '../payments/services/parser.service';
import { QrService } from '../payments/services/qr.service';
import { TelegramModule } from '../telegram/telegram.module';
import { CryptoModule } from '../crypto/crypto.module';
import { QUEUE_BANK_BOT } from './queue.constants';

@Module({
  imports: [
    BullModule.registerQueue({
      name: QUEUE_BANK_BOT,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    }),
    TelegramModule,
    CryptoModule,
  ],
  controllers: [QueueMetricsController],
  providers: [
    QueueRedisService,
    QueueMetricsService,
    SendToBankBotProcessor,
    PaymentsQueueService,
    BankBotService,
    ParserService,
    QrService,
  ],
  exports: [PaymentsQueueService, QueueRedisService],
})
export class QueueModule {}
