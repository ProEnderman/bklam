import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './services/payments.service';
import { BankBotService } from './services/bank-bot.service';
import { ParserService } from './services/parser.service';
import { QrService } from './services/qr.service';
import { TelegramModule } from '../telegram/telegram.module';
import { CryptoModule } from '../crypto/crypto.module';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [TelegramModule, CryptoModule, QueueModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, BankBotService, ParserService, QrService],
  exports: [PaymentsService, BankBotService, ParserService, QrService],
})
export class PaymentsModule {}
