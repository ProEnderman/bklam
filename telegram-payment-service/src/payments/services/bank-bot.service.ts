import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { CryptoService } from '../../crypto/crypto.service';
import { MtprotoService } from '../../telegram/services/mtproto.service';
import { ParserService } from './parser.service';
import { PaymentRequestStatus } from '@prisma/client';
import { TelegramClient, Api } from 'telegram';
import { NewMessage } from 'telegram/events';

export interface SendToBankBotJobData {
  paymentRequestId: string;
  sessionId: string;
  invoiceId: string;
  invoiceNumber: string;
  amount: string;
  currency: string;
  bankBotUsername?: string; // Per-user override
}

export interface BankBotResult {
  success: boolean;
  paymentUrl?: string;
  urlHash?: string;
  botMessageId?: bigint;
  errorCode?: string;
  errorMessage?: string;
}

@Injectable()
export class BankBotService {
  private readonly logger = new Logger(BankBotService.name);
  private readonly bankBotUsername: string;
  private readonly messageTemplate: string;
  private readonly replyTimeout: number;
  private readonly mockMode: boolean;

  constructor(
    private prisma: PrismaService,
    private cryptoService: CryptoService,
    private mtprotoService: MtprotoService,
    private parserService: ParserService,
    private configService: ConfigService,
  ) {
    this.bankBotUsername = this.configService.get<string>('BANK_BOT_USERNAME', 'TestBankBot');
    this.messageTemplate = this.configService.get<string>(
      'BANK_BOT_MESSAGE_TEMPLATE',
      'Оплата счета {invoiceId} на сумму {amount} {currency}',
    );
    // Explicitly convert to number (ConfigService returns string from .env)
    const timeoutStr = this.configService.get<string>('BANK_BOT_REPLY_TIMEOUT_MS', '60000');
    this.replyTimeout = parseInt(timeoutStr, 10) || 60000;
    this.mockMode = this.configService.get<string>('MOCK_BANK_BOT', 'false') === 'true';
    
    this.logger.log(`Bank bot: @${this.bankBotUsername}, timeout: ${this.replyTimeout}ms`);
    
    if (this.mockMode) {
      this.logger.warn('⚠️ MOCK_BANK_BOT is enabled - using simulated responses');
    }
  }

  /**
   * Send message to bank bot and wait for reply
   */
  async sendAndWaitForReply(data: SendToBankBotJobData): Promise<BankBotResult> {
    // Mock mode for testing without real Telegram
    if (this.mockMode) {
      return this.mockResponse(data);
    }

    let client: TelegramClient | null = null;

    try {
      // 1. Create client from session
      client = await this.mtprotoService.createClientFromSession(data.sessionId);

      // 2. Resolve bank bot entity (per-user override or global default)
      const targetBot = data.bankBotUsername || this.bankBotUsername;
      this.logger.log(`Using bank bot: @${targetBot}`);
      const bankBot = await client.getEntity(targetBot);

      // 3. Build message
      const message = this.buildMessage(data);

      // 4. Send message
      const sentMessage = await client.sendMessage(bankBot, { message });

      this.logger.log(
        `Message sent to @${targetBot}, id: ${sentMessage.id}`,
      );

      // 5. Update payment request with sent message id
      await this.prisma.paymentRequest.update({
        where: { id: data.paymentRequestId },
        data: {
          status: PaymentRequestStatus.SENT,
          sentMessageId: BigInt(sentMessage.id),
        },
      });

      // 6. Wait for reply
      const reply = await this.waitForReply(
        client,
        bankBot,
        sentMessage.id,
        data.paymentRequestId,
      );

      if (!reply) {
        return {
          success: false,
          errorCode: 'TIMEOUT',
          errorMessage: 'Bank bot did not reply within timeout',
        };
      }

      // 7. Parse URL from reply
      const replyText = reply.message || '';
      const paymentUrl = this.parserService.extractPaymentUrl(replyText);

      if (!paymentUrl) {
        return {
          success: false,
          botMessageId: BigInt(reply.id),
          errorCode: 'UNPARSABLE',
          errorMessage: 'Could not extract payment URL from bank bot reply',
        };
      }

      const urlHash = this.cryptoService.sha256(paymentUrl);

      return {
        success: true,
        paymentUrl,
        urlHash,
        botMessageId: BigInt(reply.id),
      };
    } catch (error: any) {
      this.logger.error(`sendAndWaitForReply failed: ${error.message}`);

      // Handle specific errors
      if (error.message?.includes('AUTH_KEY_UNREGISTERED') ||
          error.message?.includes('SESSION_REVOKED')) {
        await this.mtprotoService.incrementFailureCount(data.sessionId);
        return {
          success: false,
          errorCode: 'SESSION_INVALID',
          errorMessage: 'Telegram session is no longer valid',
        };
      }

      if (error.message?.includes('FLOOD')) {
        const waitMatch = error.message.match(/(\d+)/);
        const waitSeconds = waitMatch ? parseInt(waitMatch[1], 10) : 60;
        return {
          success: false,
          errorCode: 'RATE_LIMITED',
          errorMessage: `Rate limited. Please wait ${waitSeconds} seconds.`,
        };
      }

      return {
        success: false,
        errorCode: 'ERROR',
        errorMessage: error.message || 'Unknown error',
      };
    } finally {
      if (client) {
        try {
          await client.disconnect();
        } catch {
          // Ignore disconnect errors
        }
      }
    }
  }

  /**
   * Wait for reply from bank bot — uses both event handler and polling
   */
  private async waitForReply(
    client: TelegramClient,
    bankBot: Api.TypeUser | Api.TypeChat | Api.TypeInputPeer,
    sentMessageId: number,
    _paymentRequestId: string,
  ): Promise<Api.Message | null> {
    const peerId = 'id' in bankBot ? bankBot.id : undefined;
    this.logger.log(`⏳ Waiting for reply from @${peerId} after msg #${sentMessageId} (timeout: ${this.replyTimeout}ms)`);

    return new Promise((resolve) => {
      let resolved = false;
      const eventBuilder = new NewMessage({});

      const finish = (msg: Api.Message | null) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        try { client.removeEventHandler(handler, eventBuilder); } catch {}
        resolve(msg);
      };

      const timer = setTimeout(() => finish(null), this.replyTimeout);

      const handler = async (event: { message: Api.Message }) => {
        if (resolved) return;
        const message = event.message;
        if (!message || message.out) return; // Skip outgoing

        // Filter by peer if available
        const msgPeerId = message.peerId && 'userId' in message.peerId
          ? (message.peerId as any).userId?.value || (message.peerId as any).userId
          : null;
        if (peerId && msgPeerId && String(msgPeerId) !== String(peerId)) return;

        const ageMs = Date.now() - message.date * 1000;
        if (ageMs > 120000) return; // Skip messages older than 2 min

        this.logger.log(`✅ Event: Incoming msg #${message.id} (age: ${Math.round(ageMs / 1000)}s): "${(message.message || '').substring(0, 80)}"`);
        finish(message);
      };

      client.addEventHandler(handler, eventBuilder);

      // Backup: poll every 2s
      this.pollForReply(client, bankBot, sentMessageId, this.replyTimeout)
        .then((msg) => { if (msg) finish(msg); })
        .catch(() => {});
    });
  }

  /**
   * GramJS помечает sender как userDisconnected при сбоях ping/сети; без connect() getMessages падает с
   * «Cannot send requests while disconnected. Please reconnect.»
   */
  private async ensureTelegramTransport(client: TelegramClient): Promise<void> {
    type Sender = { userDisconnected?: boolean; _disconnected?: boolean } | undefined;
    const sender = (client as unknown as { _sender?: Sender })._sender;
    if (sender?.userDisconnected || sender?._disconnected) {
      this.logger.warn('Telegram transport was disconnected; calling connect() to resume');
      await client.connect();
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  /**
   * Poll for reply (backup method) — optimized: only checks the latest incoming message
   */
  private async pollForReply(
    client: TelegramClient,
    bankBot: any,
    sentMessageId: number,
    timeout: number,
  ): Promise<Api.Message | null> {
    const startTime = Date.now();
    const pollInterval = 2000; // 2 seconds

    this.logger.log(`🔄 Polling for reply (timeout: ${timeout}ms, after msg #${sentMessageId})`);

    while (Date.now() - startTime < timeout) {
      try {
        await this.ensureTelegramTransport(client);

        // Only fetch the 3 latest messages (enough to find the reply)
        const messages = await client.getMessages(bankBot, {
          limit: 3,
        });

        // Find the first incoming message newer than our sent message
        for (const msg of messages) {
          // Skip outgoing messages
          if (msg.out) continue;

          const msgAge = Math.floor(Date.now() / 1000) - msg.date;
          const msgText = (msg.message || '').substring(0, 80);

          // Must be newer than our sent message and recent
          if (msg.id > sentMessageId && msgAge < 120) {
            this.logger.log(`✅ Poll: Found incoming msg #${msg.id} (age: ${msgAge}s): "${msgText}"`);
            return msg;
          }
        }

        await new Promise((r) => setTimeout(r, pollInterval));
      } catch (error: any) {
        const msg = error?.message || String(error);
        if (/disconnected|reconnect/i.test(msg)) {
          this.logger.warn(`Polling transport error: ${msg} — trying connect()`);
          try {
            await client.connect();
            await new Promise((r) => setTimeout(r, 600));
          } catch (re: any) {
            this.logger.warn(`Reconnect failed: ${re?.message || re}`);
          }
        } else {
          this.logger.warn(`Polling error: ${msg}`);
        }
        await new Promise((r) => setTimeout(r, pollInterval));
      }
    }

    this.logger.warn('⏱️ Polling timeout - no reply found');
    return null;
  }

  /**
   * Build message from template
   */
  private buildMessage(data: SendToBankBotJobData): string {
    // TODO: Adjust template based on actual bank bot requirements
    return this.messageTemplate
      .replace('{invoiceId}', data.invoiceNumber)
      .replace('{amount}', data.amount)
      .replace('{currency}', data.currency)
      .replace('{paymentRequestId}', data.paymentRequestId);
  }

  /**
   * Mock response for testing without real bank bot
   */
  private async mockResponse(data: SendToBankBotJobData): Promise<BankBotResult> {
    this.logger.log(`🎭 MOCK: Simulating bank bot response for ${data.paymentRequestId}`);
    
    // Simulate processing delay
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Generate mock payment URL
    const mockPaymentUrl = `https://pay.example-bank.ru/invoice/${data.invoiceNumber}?amount=${data.amount}`;
    const urlHash = this.cryptoService.sha256(mockPaymentUrl);

    this.logger.log(`🎭 MOCK: Generated payment URL: ${mockPaymentUrl}`);

    return {
      success: true,
      paymentUrl: mockPaymentUrl,
      urlHash,
      botMessageId: BigInt(Date.now()),
    };
  }
}
