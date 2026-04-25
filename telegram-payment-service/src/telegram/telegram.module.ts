import { Module } from '@nestjs/common';
import { TelegramController } from './telegram.controller';
import { TelegramLoginService } from './services/telegram-login.service';
import { MtprotoService } from './services/mtproto.service';
import { AuditService } from './services/audit.service';
import { CryptoModule } from '../crypto/crypto.module';

@Module({
  imports: [CryptoModule],
  controllers: [TelegramController],
  providers: [TelegramLoginService, MtprotoService, AuditService],
  exports: [MtprotoService, AuditService],
})
export class TelegramModule {}
