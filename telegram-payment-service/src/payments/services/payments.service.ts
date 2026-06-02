import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { CryptoService } from '../../crypto/crypto.service';
import { ParserService } from './parser.service';
import { JOB_SEND_TO_BANK_BOT } from '../../queue/queue.constants';
import { PaymentsQueueService } from '../../queue/payments-queue.service';
import { BankBotUsernameResolver } from '../../telegram/services/bank-bot-username.resolver';
import { PaymentRequestStatus } from '@prisma/client';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly bankBotUsername: string;
  private readonly messageTemplate: string;

  constructor(
    private prisma: PrismaService,
    private cryptoService: CryptoService,
    private parserService: ParserService,
    private configService: ConfigService,
    private paymentsQueueService: PaymentsQueueService,
    private bankBotResolver: BankBotUsernameResolver,
  ) {
    this.bankBotUsername = this.configService.get<string>(
      'BANK_BOT_USERNAME',
      'TestBankBot',
    );
    this.messageTemplate = this.configService.get<string>(
      'BANK_BOT_MESSAGE_TEMPLATE',
      'Оплата счета {invoiceId} на сумму {amount} {currency}',
    );
  }

  /**
   * Ensure user exists in NestJS DB (create if not)
   */
  private async ensureUserExists(
    userId: string,
    email: string,
    restaurantId: string,
  ) {
    const existingUser = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (existingUser) {
      return existingUser;
    }

    // Ensure restaurant exists first
    let restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
    });

    if (!restaurant) {
      restaurant = await this.prisma.restaurant.create({
        data: {
          id: restaurantId,
          name: `Restaurant ${restaurantId}`,
        },
      });
    }

    this.logger.log(`Creating user stub for ${userId} (${email})`);
    return this.prisma.user.create({
      data: {
        id: userId,
        email: email,
        passwordHash: 'managed-by-java-backend',
        restaurantId: restaurantId,
        role: 'CASHIER',
      },
    });
  }

  /**
   * Create a new payment request and queue job to send to bank bot
   */
  async createPaymentRequest(
    userId: string,
    invoiceId: string,
    restaurantId: string,
    userEmail: string,
    amount?: number,
    currency?: string,
    orderNumber?: string,
  ) {
    // 1. Ensure user exists
    await this.ensureUserExists(userId, userEmail, restaurantId);

    // 2. Ensure restaurant exists (create if not)
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

    // 2. Check invoice exists, create if not
    let invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
    });

    if (!invoice) {
      this.logger.warn(`Invoice ${invoiceId} not found, creating invoice with provided data`);
      // Используем переданные данные или значения по умолчанию
      const invoiceNumber = orderNumber 
        ? `INV-${orderNumber}` 
        : invoiceId.replace(/^order[_-]?/i, 'INV-');
      const invoiceAmount = amount !== undefined && amount !== null ? amount : 0;
      const invoiceCurrency = currency || 'RUB';
      
      invoice = await this.prisma.invoice.create({
        data: {
          id: invoiceId,
          restaurantId: restaurantId,
          invoiceNumber,
          amount: invoiceAmount,
          currency: invoiceCurrency,
          description: `Invoice for order ${orderNumber || invoiceId}`,
        },
      });
      
      this.logger.log(
        `Created invoice ${invoiceId} with amount ${invoiceAmount} ${invoiceCurrency}`,
      );
    } else if (amount !== undefined && amount !== null && invoice.amount.toNumber() !== amount) {
      // Обновляем сумму, если она изменилась
      this.logger.log(
        `Updating invoice ${invoiceId} amount from ${invoice.amount.toNumber()} to ${amount}`,
      );
      invoice = await this.prisma.invoice.update({
        where: { id: invoiceId },
        data: { amount },
      });
    }

    // 2. Check user has active MTProto session
    const session = await this.prisma.telegramSession.findFirst({
      where: {
        userId,
        revokedAt: null,
      },
    });

    if (!session) {
      throw new BadRequestException(
        'No active Telegram session. Please link your Telegram account first.',
      );
    }

    // 3. Create idempotency key
    const idempotencyKey = this.cryptoService.sha256(`${invoiceId}:${userId}`);

    // 4. Check for existing request (idempotency)
    const existing = await this.prisma.paymentRequest.findUnique({
      where: { idempotencyKey },
      include: { paymentLink: true },
    });

    if (existing) {
      // Return existing request if still pending/processing or has link
      if (
        existing.status === PaymentRequestStatus.CREATED ||
        existing.status === PaymentRequestStatus.SENT ||
        existing.status === PaymentRequestStatus.LINK_RECEIVED
      ) {
        return existing;
      }
      // For failed statuses, we'll create a new attempt below
    }

    // 5. Create payment request
    const paymentRequest = await this.prisma.paymentRequest.upsert({
      where: { idempotencyKey },
      create: {
        invoiceId,
        userId,
        idempotencyKey,
        status: PaymentRequestStatus.CREATED,
        attemptNo: 1,
      },
      update: {
        status: PaymentRequestStatus.CREATED,
        attemptNo: { increment: 1 },
        errorCode: null,
        errorMessage: null,
      },
      include: { paymentLink: true },
    });

    const resolvedBot = await this.bankBotResolver.resolve(restaurantId, userId);

    // 6. Queue job (per-account queue for parallelism)
    const queue = this.paymentsQueueService.getQueue(restaurantId);
    await queue.add(
      JOB_SEND_TO_BANK_BOT,
      {
        paymentRequestId: paymentRequest.id,
        sessionId: session.id,
        invoiceId,
        invoiceNumber: invoice.invoiceNumber,
        amount: invoice.amount.toString(),
        currency: invoice.currency,
        bankBotUsername: resolvedBot || undefined,
      },
    );

    this.logger.log(
      `Payment request ${paymentRequest.id} created and queued for invoice ${invoiceId}`,
    );

    return paymentRequest;
  }

  /**
   * Find payment request by ID
   */
  async findById(id: string) {
    return this.prisma.paymentRequest.findUnique({
      where: { id },
      include: { paymentLink: true, invoice: true },
    });
  }

  /**
   * Cancel payment request
   */
  async cancel(id: string) {
    const pr = await this.prisma.paymentRequest.update({
      where: { id },
      data: { status: PaymentRequestStatus.CANCELLED },
      include: { paymentLink: true },
    });

    return pr;
  }

  /**
   * Refresh payment request (retry)
   */
  async refresh(id: string) {
    const pr = await this.prisma.paymentRequest.findUnique({
      where: { id },
      include: { invoice: true, user: true },
    });

    if (!pr) {
      throw new NotFoundException('Payment request not found');
    }

    // Get user's active session
    const session = await this.prisma.telegramSession.findFirst({
      where: {
        userId: pr.userId,
        revokedAt: null,
      },
    });

    if (!session) {
      throw new BadRequestException('No active Telegram session');
    }

    // Update status and requeue
    await this.prisma.paymentRequest.update({
      where: { id },
      data: {
        status: PaymentRequestStatus.CREATED,
        attemptNo: { increment: 1 },
        errorCode: null,
        errorMessage: null,
      },
    });

    const restaurantId = pr.user?.restaurantId ?? 'default';
    const queue = this.paymentsQueueService.getQueue(restaurantId);
    const resolvedBot = await this.bankBotResolver.resolve(
      pr.user?.restaurantId ?? restaurantId,
      pr.userId,
    );
    await queue.add(JOB_SEND_TO_BANK_BOT, {
      paymentRequestId: id,
      sessionId: session.id,
      invoiceId: pr.invoiceId,
      invoiceNumber: pr.invoice.invoiceNumber,
      amount: pr.invoice.amount.toString(),
      currency: pr.invoice.currency,
      bankBotUsername: resolvedBot || undefined,
    });

    return this.findById(id);
  }

  /**
   * Get fallback URL for manual Telegram interaction
   */
  async getFallbackUrl(pr: any) {
    const message = this.buildMessage(pr);
    const encodedMessage = encodeURIComponent(message);

    const restaurantId = pr.user?.restaurantId ?? 'unknown';
    const botUsername =
      (await this.bankBotResolver.resolve(restaurantId, pr.userId)) ||
      this.bankBotUsername;

    return {
      fallbackUrl: `tg://resolve?domain=${botUsername}&text=${encodedMessage}`,
      message,
      instructions:
        'Нажмите кнопку ниже, чтобы открыть Telegram. Отправьте сообщение боту, скопируйте ссылку из ответа и вставьте в поле ниже.',
    };
  }

  /**
   * Submit manually copied URL (fallback flow)
   */
  async submitManualUrl(paymentRequestId: string, url: string) {
    // Validate URL
    const parsedUrl = this.parserService.extractPaymentUrl(url);

    if (!parsedUrl) {
      throw new BadRequestException(
        'Invalid or untrusted payment URL. Please copy the exact URL from the bank bot.',
      );
    }

    const urlHash = this.cryptoService.sha256(parsedUrl);

    // Update payment request
    await this.prisma.$transaction([
      this.prisma.paymentLink.upsert({
        where: { paymentRequestId },
        create: {
          paymentRequestId,
          urlHash,
          encryptedUrl: this.cryptoService.encrypt(parsedUrl),
        },
        update: {
          urlHash,
          encryptedUrl: this.cryptoService.encrypt(parsedUrl),
        },
      }),
      this.prisma.paymentRequest.update({
        where: { id: paymentRequestId },
        data: { status: PaymentRequestStatus.LINK_RECEIVED },
      }),
    ]);

    return this.findById(paymentRequestId);
  }

  /**
   * Build message from template
   */
  buildMessage(pr: any): string {
    // TODO: Adjust template based on actual bank bot requirements
    return this.messageTemplate
      .replace('{invoiceId}', pr.invoice?.invoiceNumber || pr.invoiceId)
      .replace('{amount}', pr.invoice?.amount?.toString() || '0')
      .replace('{currency}', pr.invoice?.currency || 'RUB')
      .replace('{paymentRequestId}', pr.id);
  }
}
