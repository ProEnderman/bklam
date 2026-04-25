import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
  createHash,
} from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const SALT_LENGTH = 32;

@Injectable()
export class CryptoService {
  private readonly masterKey: Buffer;

  constructor(private configService: ConfigService) {
    const masterKeyBase64 = this.configService.getOrThrow<string>('MASTER_KEY');
    this.masterKey = Buffer.from(masterKeyBase64, 'base64');

    if (this.masterKey.length < 32) {
      throw new Error('MASTER_KEY must be at least 32 bytes');
    }
  }

  /**
   * Encrypt plaintext using AES-256-GCM
   * Returns: base64(salt + iv + tag + encrypted)
   */
  encrypt(plaintext: string): string {
    const salt = randomBytes(SALT_LENGTH);
    const key = scryptSync(this.masterKey, salt, 32);
    const iv = randomBytes(IV_LENGTH);

    const cipher = createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    // Format: salt + iv + tag + encrypted
    return Buffer.concat([salt, iv, tag, encrypted]).toString('base64');
  }

  /**
   * Decrypt ciphertext encrypted with encrypt()
   */
  decrypt(ciphertext: string): string {
    const data = Buffer.from(ciphertext, 'base64');

    const salt = data.subarray(0, SALT_LENGTH);
    const iv = data.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const tag = data.subarray(
      SALT_LENGTH + IV_LENGTH,
      SALT_LENGTH + IV_LENGTH + TAG_LENGTH,
    );
    const encrypted = data.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);

    const key = scryptSync(this.masterKey, salt, 32);
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    return decipher.update(encrypted).toString('utf8') + decipher.final('utf8');
  }

  /**
   * Create SHA256 hash of input
   */
  sha256(input: string): string {
    return createHash('sha256').update(input).digest('hex');
  }

  /**
   * Verify Telegram Login Widget hash
   * https://core.telegram.org/widgets/login#checking-authorization
   */
  verifyTelegramHash(data: Record<string, string>, hash: string): boolean {
    const botToken = this.configService.getOrThrow<string>('TG_BOT_TOKEN');

    // Create data_check_string
    const checkString = Object.keys(data)
      .filter((key) => key !== 'hash')
      .sort()
      .map((key) => `${key}=${data[key]}`)
      .join('\n');

    // secret_key = SHA256(bot_token)
    const secretKey = createHash('sha256').update(botToken).digest();

    // hash = HMAC-SHA256(data_check_string, secret_key)
    const { createHmac } = require('crypto');
    const expectedHash = createHmac('sha256', secretKey)
      .update(checkString)
      .digest('hex');

    return expectedHash === hash;
  }

  /**
   * Mask phone number for logging: +7***1234
   */
  maskPhone(phone: string): string {
    if (phone.length < 4) return '***';
    return phone.slice(0, 2) + '***' + phone.slice(-4);
  }
}
