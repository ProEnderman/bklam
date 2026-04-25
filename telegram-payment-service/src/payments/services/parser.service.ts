import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ParserService {
  private readonly logger = new Logger(ParserService.name);
  private readonly allowedDomains: string[];
  private readonly acceptAnyUrl: boolean;

  // Regex to extract URLs from text
  private readonly urlRegex = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;

  constructor(private configService: ConfigService) {
    const domainsStr = this.configService.get<string>('BANK_ALLOWED_DOMAINS', '*');
    
    // Если указано '*' или пустая строка, принимаем любые URL
    this.acceptAnyUrl = !domainsStr || domainsStr.trim() === '*';
    this.allowedDomains = this.acceptAnyUrl 
      ? [] 
      : domainsStr.split(',').map((d) => d.trim().toLowerCase()).filter(d => d.length > 0);

    if (this.acceptAnyUrl) {
      this.logger.warn('⚠️ BANK_ALLOWED_DOMAINS=* — accepting ANY URL (for testing only!)');
    } else {
      this.logger.log(`Allowed payment domains: ${this.allowedDomains.join(', ')}`);
    }
  }

  /**
   * Extract payment URL from bank bot message
   * Returns the first URL that matches allowed domains, or null if not found
   */
  extractPaymentUrl(messageText: string): string | null {
    if (!messageText) {
      return null;
    }

    const urls = messageText.match(this.urlRegex) || [];

    for (const url of urls) {
      try {
        new URL(url); // Validate URL format
        
        // In test mode, accept any valid URL
        if (this.acceptAnyUrl) {
          this.logger.debug(`Extracted payment URL (any mode): ${url}`);
          return url;
        }

        const parsed = new URL(url);
        const hostname = parsed.hostname.toLowerCase();

        // Check if hostname matches or is a subdomain of allowed domains
        const isAllowed = this.allowedDomains.some((domain) => {
          return hostname === domain || hostname.endsWith(`.${domain}`);
        });

        if (isAllowed) {
          this.logger.debug(`Extracted payment URL: ${url}`);
          return url;
        }
      } catch {
        // Invalid URL, skip
        continue;
      }
    }

    // Fallback: если домены настроены, но ни один URL не подошёл,
    // принять первый найденный URL с предупреждением (для тестирования)
    if (urls.length > 0) {
      const firstUrl = urls[0]!;
      this.logger.warn(`⚠️ No URL matched allowed domains. Accepting first URL as fallback: ${firstUrl}`);
      this.logger.warn(`   Allowed domains: ${this.allowedDomains.join(', ')}`);
      this.logger.warn(`   Set BANK_ALLOWED_DOMAINS=* in .env to accept any URL`);
      return firstUrl;
    }

    this.logger.warn(`No URLs found in message at all`);
    return null;
  }

  /**
   * Validate a single URL against allowed domains
   */
  isValidPaymentUrl(url: string): boolean {
    try {
      new URL(url); // Validate URL format
      
      // In test mode, accept any valid URL
      if (this.acceptAnyUrl) {
        return true;
      }

      const parsed = new URL(url);
      const hostname = parsed.hostname.toLowerCase();

      return this.allowedDomains.some((domain) => {
        return hostname === domain || hostname.endsWith(`.${domain}`);
      });
    } catch {
      return false;
    }
  }

  /**
   * Extract all URLs from text (for debugging/logging)
   */
  extractAllUrls(messageText: string): string[] {
    if (!messageText) {
      return [];
    }
    return messageText.match(this.urlRegex) || [];
  }
}
