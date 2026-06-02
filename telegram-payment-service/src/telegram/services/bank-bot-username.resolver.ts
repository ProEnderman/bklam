import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Resolves bank bot username: restaurant setting → user's session → env default.
 */
@Injectable()
export class BankBotUsernameResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async resolve(restaurantId: string, userId?: string): Promise<string | null> {
    if (restaurantId && restaurantId !== 'unknown') {
      const restaurant = await this.prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { bankBotUsername: true },
      });
      if (restaurant?.bankBotUsername) {
        return restaurant.bankBotUsername;
      }
    }

    if (userId) {
      const session = await this.prisma.telegramSession.findFirst({
        where: { userId, revokedAt: null },
        select: { bankBotUsername: true },
      });
      if (session?.bankBotUsername) {
        return session.bankBotUsername;
      }
    }

    const envDefault = this.configService.get<string>('BANK_BOT_USERNAME', '');
    const trimmed = envDefault?.replace(/^@/, '').trim();
    return trimmed || null;
  }

  static clean(username: string): string {
    return username.replace(/^@/, '').trim();
  }
}
