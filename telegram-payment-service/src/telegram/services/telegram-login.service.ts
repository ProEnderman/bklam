import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { CryptoService } from '../../crypto/crypto.service';
import { TelegramLoginDto } from '../dto/telegram.dto';

@Injectable()
export class TelegramLoginService {
  private readonly authTimeout: number;

  constructor(
    private prisma: PrismaService,
    private cryptoService: CryptoService,
    private configService: ConfigService,
  ) {
    // Max allowed time since auth_date (default: 1 day)
    this.authTimeout = 86400;
  }

  /**
   * Link Telegram account via Login Widget data
   * Verifies the hash and stores account info
   */
  async linkAccount(userId: string, dto: TelegramLoginDto) {
    // 1. Verify auth_date is not too old
    const now = Math.floor(Date.now() / 1000);
    if (now - dto.auth_date > this.authTimeout) {
      throw new BadRequestException('Telegram authorization expired');
    }

    // 2. Verify hash
    const dataToCheck: Record<string, string> = {
      id: dto.id.toString(),
      auth_date: dto.auth_date.toString(),
    };
    if (dto.first_name) dataToCheck.first_name = dto.first_name;
    if (dto.last_name) dataToCheck.last_name = dto.last_name;
    if (dto.username) dataToCheck.username = dto.username;
    if (dto.photo_url) dataToCheck.photo_url = dto.photo_url;

    const isValid = this.cryptoService.verifyTelegramHash(dataToCheck, dto.hash);

    if (!isValid) {
      throw new UnauthorizedException('Invalid Telegram authorization hash');
    }

    // 3. Check if this Telegram account is already linked to another user
    const existingAccount = await this.prisma.telegramAccount.findUnique({
      where: { telegramUserId: BigInt(dto.id) },
    });

    if (existingAccount && existingAccount.userId !== userId) {
      throw new BadRequestException(
        'This Telegram account is already linked to another user',
      );
    }

    // 4. Upsert telegram_account
    const account = await this.prisma.telegramAccount.upsert({
      where: { userId },
      create: {
        userId,
        telegramUserId: BigInt(dto.id),
        username: dto.username || null,
        firstName: dto.first_name || null,
        lastName: dto.last_name || null,
        photoUrl: dto.photo_url || null,
        authDate: new Date(dto.auth_date * 1000),
        hash: dto.hash,
        verifiedAt: new Date(),
      },
      update: {
        telegramUserId: BigInt(dto.id),
        username: dto.username || null,
        firstName: dto.first_name || null,
        lastName: dto.last_name || null,
        photoUrl: dto.photo_url || null,
        authDate: new Date(dto.auth_date * 1000),
        hash: dto.hash,
        verifiedAt: new Date(),
      },
    });

    return account;
  }

  /**
   * Unlink Telegram account
   */
  async unlinkAccount(userId: string) {
    // Also revoke all MTProto sessions
    await this.prisma.$transaction([
      this.prisma.telegramSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.telegramAccount.delete({
        where: { userId },
      }),
    ]);
  }

  /**
   * Get linked Telegram account for user
   */
  async getAccount(userId: string) {
    return this.prisma.telegramAccount.findUnique({
      where: { userId },
    });
  }
}
