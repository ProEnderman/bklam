import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { CryptoService } from '../../crypto/crypto.service';
import { BankBotUsernameResolver } from './bank-bot-username.resolver';
import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions';

// In-memory cache for pending auth flows (phone -> temp client)
// In production, consider Redis for multi-instance deployments
const pendingAuthClients = new Map<string, TelegramClient>();

@Injectable()
export class MtprotoService {
  private readonly logger = new Logger(MtprotoService.name);
  private readonly apiId: number;
  private readonly apiHash: string;
  private readonly keyId: string;

  constructor(
    private prisma: PrismaService,
    private cryptoService: CryptoService,
    private configService: ConfigService,
    private bankBotResolver: BankBotUsernameResolver,
  ) {
    // Explicitly convert to number (ConfigService returns string from .env)
    const apiIdStr = this.configService.getOrThrow<string>('TG_API_ID');
    this.apiId = parseInt(apiIdStr, 10);
    if (isNaN(this.apiId)) {
      throw new Error(`Invalid TG_API_ID: ${apiIdStr}`);
    }
    this.apiHash = this.configService.getOrThrow<string>('TG_API_HASH');
    this.keyId = this.configService.get<string>('ENCRYPTION_KEY_ID', 'v1');
    
    this.logger.log(`MTProto initialized with API ID: ${this.apiId}`);
  }

  /**
   * Step 1: Send verification code to phone
   */
  async sendCode(userId: string, phone: string) {
    const normalizedPhone = this.normalizePhone(phone);

    // Create a new client for this auth flow
    const client = new TelegramClient(
      new StringSession(''),
      this.apiId,
      this.apiHash,
      {
        connectionRetries: 3,
      },
    );

    await client.connect();

    try {
      const result = await client.sendCode(
        { apiId: this.apiId, apiHash: this.apiHash },
        normalizedPhone,
      );

      // Store client temporarily for next steps
      pendingAuthClients.set(`${userId}:${normalizedPhone}`, client);

      // Set timeout to cleanup
      setTimeout(() => {
        this.cleanupPendingClient(userId, normalizedPhone);
      }, 5 * 60 * 1000); // 5 minutes

      return {
        phoneCodeHash: result.phoneCodeHash,
        timeout: 60, // Default timeout in seconds
      };
    } catch (error: any) {
      await client.disconnect();

      if (error.message?.includes('FLOOD')) {
        throw new ServiceUnavailableException(
          'Too many requests. Please try again later.',
        );
      }

      this.logger.error(`sendCode failed: ${error.message}`);
      throw new BadRequestException(error.message || 'Failed to send code');
    }
  }

  /**
   * Step 2: Confirm verification code
   */
  async confirmCode(
    userId: string,
    email: string,
    restaurantId: string,
    phone: string,
    phoneCodeHash: string,
    code: string,
  ) {
    const normalizedPhone = this.normalizePhone(phone);
    const client = pendingAuthClients.get(`${userId}:${normalizedPhone}`);

    if (!client) {
      throw new BadRequestException(
        'Session expired. Please request a new code.',
      );
    }

    try {
      await client.invoke(
        new Api.auth.SignIn({
          phoneNumber: normalizedPhone,
          phoneCodeHash,
          phoneCode: code,
        }),
      );

      // Successfully signed in - save session
      const sessionString = client.session.save() as unknown as string;
      await this.saveSession(userId, email, restaurantId, normalizedPhone, sessionString);

      this.cleanupPendingClient(userId, normalizedPhone);

      return {
        success: true,
        requires2FA: false,
        sessionLinked: true,
      };
    } catch (error: any) {
      const errorMsg = error.message || error.errorMessage || String(error);
      
      // Check for 2FA requirement - handle various error formats
      if (
        errorMsg.includes('SESSION_PASSWORD_NEEDED') ||
        error.errorMessage === 'SESSION_PASSWORD_NEEDED'
      ) {
        // 2FA is enabled, keep client for password step
        this.logger.log(`2FA required for user ${userId}, phone ${this.maskPhone(normalizedPhone)}`);
        return {
          success: true,
          requires2FA: true,
          sessionLinked: false,
        };
      }

      if (errorMsg.includes('PHONE_CODE_INVALID')) {
        throw new BadRequestException('Invalid verification code');
      }

      if (errorMsg.includes('PHONE_CODE_EXPIRED')) {
        this.cleanupPendingClient(userId, normalizedPhone);
        throw new BadRequestException('Verification code expired');
      }

      this.logger.error(`confirmCode failed: ${errorMsg}`);
      throw new BadRequestException(errorMsg || 'Failed to confirm code');
    }
  }

  /**
   * Step 3: Confirm 2FA password
   */
  async confirmPassword(
    userId: string,
    email: string,
    restaurantId: string,
    phone: string,
    password: string,
  ) {
    const normalizedPhone = this.normalizePhone(phone);
    const client = pendingAuthClients.get(`${userId}:${normalizedPhone}`);

    if (!client) {
      throw new BadRequestException(
        'Session expired. Please start over.',
      );
    }

    try {
      // Get password settings
      const passwordInfo = await client.invoke(new Api.account.GetPassword());

      // Compute password check using gramjs Password helper
      const { computeCheck } = require('telegram/Password');
      const passwordCheck = await computeCheck(passwordInfo, password);

      // Check password
      await client.invoke(
        new Api.auth.CheckPassword({
          password: passwordCheck,
        }),
      );

      // Successfully authenticated - save session
      const sessionString = client.session.save() as unknown as string;
      const session = await this.saveSession(userId, email, restaurantId, normalizedPhone, sessionString);

      this.cleanupPendingClient(userId, normalizedPhone);

      return {
        success: true,
        sessionId: session.id,
      };
    } catch (error: any) {
      if (error.message?.includes('PASSWORD_HASH_INVALID')) {
        throw new BadRequestException('Invalid 2FA password');
      }

      this.logger.error(`confirmPassword failed: ${error.message}`);
      throw new BadRequestException(error.message || 'Failed to confirm password');
    }
  }

  /**
   * Ensure user exists in NestJS DB (create if not)
   * This is needed because users are managed in Java backend
   */
  private async ensureUserExists(
    userId: string,
    email: string,
    restaurantId: string,
  ) {
    // Check if user exists
    const existingUser = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (existingUser) {
      return existingUser;
    }

    // Ensure restaurant exists
    let restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
    });

    if (!restaurant) {
      this.logger.warn(`Restaurant ${restaurantId} not found, creating stub`);
      restaurant = await this.prisma.restaurant.create({
        data: {
          id: restaurantId,
          name: `Restaurant ${restaurantId}`,
        },
      });
    }

    // Create user stub
    this.logger.log(`Creating user stub for ${userId} (${email})`);
    return this.prisma.user.create({
      data: {
        id: userId,
        email: email,
        passwordHash: 'managed-by-java-backend', // Not used, auth is via JWT
        restaurantId: restaurantId,
        role: 'CASHIER', // Default role, actual role comes from JWT
      },
    });
  }

  /**
   * Save encrypted session to database
   */
  private async saveSession(
    userId: string,
    email: string,
    restaurantId: string,
    phone: string,
    sessionString: string,
  ) {
    // Ensure user exists in NestJS DB
    await this.ensureUserExists(userId, email, restaurantId);

    // Encrypt session string
    const encryptedSession = this.cryptoService.encrypt(sessionString);

    // Revoke any existing sessions for this user
    await this.prisma.telegramSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    // Create new session
    return this.prisma.telegramSession.create({
      data: {
        userId,
        phone,
        encryptedSession,
        keyId: this.keyId,
      },
    });
  }

  /**
   * Get active session for user
   */
  async getActiveSession(userId: string) {
    const session = await this.prisma.telegramSession.findFirst({
      where: {
        userId,
        revokedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    return session;
  }

  /**
   * Get session by ID
   */
  async getSession(sessionId: string) {
    const session = await this.prisma.telegramSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    return session;
  }

  /**
   * Revoke session
   */
  async revokeSession(sessionId: string) {
    await this.prisma.telegramSession.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Create a connected TelegramClient from stored session
   */
  async createClientFromSession(sessionId: string): Promise<TelegramClient> {
    const session = await this.prisma.telegramSession.findUnique({
      where: { id: sessionId },
    });

    if (!session || session.revokedAt) {
      throw new BadRequestException('Session is invalid or revoked');
    }

    // Decrypt session string
    const sessionString = this.cryptoService.decrypt(session.encryptedSession);

    const client = new TelegramClient(
      new StringSession(sessionString),
      this.apiId,
      this.apiHash,
      {
        /** Docker / нестабильная сеть: не обрывать MTProto после 3 попыток (было 3 → частые «disconnected»). */
        connectionRetries: 25,
        reconnectRetries: 40,
        timeout: 30,
        autoReconnect: true,
        requestRetries: 6,
      },
    );

    try {
      await client.connect();
    } catch (error: any) {
      this.logger.error(`Failed to connect client: ${error.message}`);
      
      // Handle FloodWait
      if (error.message?.includes('FLOOD') || error.seconds) {
        const waitSeconds = error.seconds || 60;
        this.logger.warn(`FloodWait: need to wait ${waitSeconds} seconds`);
        throw new Error(`FLOOD_WAIT:${waitSeconds}:Telegram rate limit. Please wait ${waitSeconds} seconds and try again.`);
      }
      
      // Handle session issues
      if (error.message?.includes('AUTH_KEY') || error.message?.includes('SESSION')) {
        await this.prisma.telegramSession.update({
          where: { id: sessionId },
          data: { revokedAt: new Date() },
        });
        throw new BadRequestException('Telegram session expired. Please re-link your account.');
      }
      
      throw error;
    }

    // Update last used
    await this.prisma.telegramSession.update({
      where: { id: sessionId },
      data: { lastUsedAt: new Date() },
    });

    return client;
  }

  /**
   * Increment failure count for session
   */
  async incrementFailureCount(sessionId: string) {
    await this.prisma.telegramSession.update({
      where: { id: sessionId },
      data: { failureCount: { increment: 1 } },
    });
  }

  /**
   * Cleanup pending auth client
   */
  private async cleanupPendingClient(userId: string, phone: string) {
    const key = `${userId}:${phone}`;
    const client = pendingAuthClients.get(key);

    if (client) {
      try {
        await client.disconnect();
      } catch {
        // Ignore disconnect errors
      }
      pendingAuthClients.delete(key);
    }
  }

  /**
   * Normalize phone number
   */
  private normalizePhone(phone: string): string {
    // Remove all non-digits except leading +
    return phone.replace(/[^\d+]/g, '');
  }

  /**
   * Mask phone number for logging
   */
  maskPhone(phone: string): string {
    return this.cryptoService.maskPhone(phone);
  }

  /**
   * Get Telegram link status for user
   */
  async getStatus(userId: string, restaurantId: string) {
    this.logger.debug(`Checking Telegram status for user: ${userId}`);
    
    // Check for linked Telegram account
    const account = await this.prisma.telegramAccount.findUnique({
      where: { userId },
    });

    // Check for active MTProto session
    const session = await this.prisma.telegramSession.findFirst({
      where: {
        userId,
        revokedAt: null,
      },
    });

    const bankBotUsername = await this.bankBotResolver.resolve(restaurantId, userId);

    const result = {
      linked: !!account,
      hasActiveSession: !!session,
      telegramUsername: account?.username || null,
      bankBotUsername,
    };
    
    this.logger.log(`Telegram status for user ${userId}: hasActiveSession=${result.hasActiveSession}, linked=${result.linked}`);
    
    return result;
  }

  /**
   * Update bank bot username for the restaurant (shared by all staff).
   */
  async updateRestaurantBankBotUsername(
    restaurantId: string,
    userId: string,
    bankBotUsername: string,
  ) {
    const cleanUsername = BankBotUsernameResolver.clean(bankBotUsername);
    if (!cleanUsername) {
      throw new BadRequestException('bankBotUsername is required');
    }

    await this.ensureRestaurantExists(restaurantId);

    await this.prisma.restaurant.update({
      where: { id: restaurantId },
      data: { bankBotUsername: cleanUsername },
    });

    // Keep session field in sync for older clients / fallback resolution
    const session = await this.prisma.telegramSession.findFirst({
      where: { userId, revokedAt: null },
    });
    if (session) {
      await this.prisma.telegramSession.update({
        where: { id: session.id },
        data: { bankBotUsername: cleanUsername },
      });
    }

    this.logger.log(
      `Updated bank bot username for restaurant ${restaurantId}: @${cleanUsername}`,
    );

    return { bankBotUsername: cleanUsername };
  }

  private async ensureRestaurantExists(restaurantId: string) {
    const existing = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
    });
    if (!existing) {
      await this.prisma.restaurant.create({
        data: {
          id: restaurantId,
          name: `Restaurant ${restaurantId}`,
        },
      });
    }
  }

  /**
   * Get Telegram settings for restaurant
   */
  async getRestaurantSettings(restaurantId: string, userId: string) {
    const bankBotUsername = await this.bankBotResolver.resolve(restaurantId, userId);
    return { bankBotUsername };
  }
}
