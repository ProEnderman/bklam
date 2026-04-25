import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { CryptoService } from '../../crypto/crypto.service';
import * as QRCode from 'qrcode';
import { Redis } from 'ioredis';

@Injectable()
export class QrService {
  private readonly logger = new Logger(QrService.name);
  private readonly cacheTtl: number;
  private redisClient: Redis | null = null;

  constructor(
    private prisma: PrismaService,
    private cryptoService: CryptoService,
    private configService: ConfigService,
  ) {
    this.cacheTtl = this.configService.get<number>('QR_CACHE_TTL_SECONDS', 900);
    this.initRedis();
  }

  private async initRedis() {
    const redisUrl = this.configService.get<string>('REDIS_URL');
    if (redisUrl) {
      try {
        this.redisClient = new Redis(redisUrl, {
          retryStrategy: (times) => {
            if (times > 3) {
              this.logger.warn('Redis connection failed after 3 retries, disabling cache');
              this.redisClient = null;
              return null; // Stop retrying
            }
            return Math.min(times * 50, 2000);
          },
          maxRetriesPerRequest: null,
          enableReadyCheck: false,
        });

        this.redisClient.on('error', (error) => {
          this.logger.warn('Redis error (cache will be disabled):', error.message);
          this.redisClient = null;
        });

        this.redisClient.on('connect', () => {
          this.logger.log('Redis client connected for QR caching');
        });

        // Try to ping to verify connection
        try {
          await this.redisClient.ping();
          this.logger.log('Redis connection verified');
        } catch {
          this.logger.warn('Redis ping failed, cache disabled');
          this.redisClient = null;
        }
      } catch (error) {
        this.logger.warn('Failed to initialize Redis for QR caching:', error);
        this.redisClient = null;
      }
    } else {
      this.logger.warn('REDIS_URL not set, QR caching disabled');
    }
  }

  /**
   * Generate QR code for payment request
   * Uses Redis cache to avoid regenerating
   */
  async generateQr(paymentRequestId: string, urlHash: string): Promise<Buffer> {
    const cacheKey = `qr:${paymentRequestId}:${urlHash}`;

    // 1. Check cache
    if (this.redisClient) {
      try {
        const cached = await this.redisClient.get(cacheKey);
        if (cached) {
          this.logger.debug(`QR cache hit for ${paymentRequestId}`);
          return Buffer.from(cached, 'base64');
        }
      } catch (error) {
        this.logger.warn('Redis cache read error:', error);
      }
    }

    // 2. Get payment link from DB
    const paymentLink = await this.prisma.paymentLink.findUnique({
      where: { paymentRequestId },
    });

    if (!paymentLink) {
      throw new NotFoundException('Payment link not found');
    }

    // 3. Decrypt URL
    let url: string;
    if (paymentLink.encryptedUrl) {
      url = this.cryptoService.decrypt(paymentLink.encryptedUrl);
    } else {
      throw new NotFoundException('Payment URL not available');
    }

    // 4. Generate QR code
    const qrBuffer = await QRCode.toBuffer(url, {
      type: 'png',
      width: 400,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
      errorCorrectionLevel: 'M',
    });

    // 5. Cache the result
    if (this.redisClient) {
      try {
        await this.redisClient.setex(
          cacheKey,
          this.cacheTtl,
          qrBuffer.toString('base64'),
        );
        this.logger.debug(`QR cached for ${paymentRequestId}`);
      } catch (error) {
        this.logger.warn('Redis cache write error:', error);
      }
    }

    return qrBuffer;
  }

  /**
   * Generate QR code from URL directly (for testing/preview)
   */
  async generateQrFromUrl(url: string): Promise<Buffer> {
    return QRCode.toBuffer(url, {
      type: 'png',
      width: 400,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
      errorCorrectionLevel: 'M',
    });
  }

  /**
   * Invalidate QR cache for payment request
   */
  async invalidateCache(paymentRequestId: string): Promise<void> {
    if (!this.redisClient) return;

    try {
      const pattern = `qr:${paymentRequestId}:*`;
      const keys = await this.redisClient.keys(pattern);
      if (keys.length > 0) {
        await this.redisClient.del(...keys);
        this.logger.debug(`QR cache invalidated for ${paymentRequestId}`);
      }
    } catch (error) {
      this.logger.warn('Redis cache invalidation error:', error);
    }
  }
}
