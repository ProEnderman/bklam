import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
  ForbiddenException,
  NotFoundException,
  Req,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, CurrentUserData } from '../auth/decorators/current-user.decorator';
import { PaymentsService } from './services/payments.service';
import { QrService } from './services/qr.service';
import { AuditService } from '../telegram/services/audit.service';
import { CreatePaymentRequestDto, ManualUrlDto } from './dto/payments.dto';

@Controller('payment_requests')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PaymentsController {
  constructor(
    private paymentsService: PaymentsService,
    private qrService: QrService,
    private auditService: AuditService,
  ) {}

  /**
   * Create a new payment request
   * POST /payment_requests
   */
  @Post()
  @Roles(Role.ADMIN, Role.OWNER, Role.MANAGER, Role.CASHIER)
  @HttpCode(HttpStatus.CREATED)
  async createPaymentRequest(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: CreatePaymentRequestDto,
    @Req() req: Request,
  ) {
    const result = await this.paymentsService.createPaymentRequest(
      user.id,
      dto.invoiceId,
      user.restaurantId,
      user.email,
      dto.amount,
      dto.currency,
      dto.orderNumber,
    );

    await this.auditService.log({
      userId: user.id,
      action: 'PAYMENT_REQUESTED',
      entity: 'payment_request',
      entityId: result.id,
      metadata: { invoiceId: dto.invoiceId },
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    return this.mapPaymentRequest(result);
  }

  /**
   * Get payment request by ID
   * GET /payment_requests/:id
   */
  @Get(':id')
  @Roles(Role.ADMIN, Role.OWNER, Role.MANAGER, Role.CASHIER)
  async getPaymentRequest(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
  ) {
    const pr = await this.paymentsService.findById(id);

    if (!pr) {
      throw new NotFoundException('Payment request not found');
    }

    // Cashiers can only view their own requests
    if (user.role === 'CASHIER' && pr.userId !== user.id) {
      throw new ForbiddenException('Access denied');
    }

    return this.mapPaymentRequest(pr);
  }

  /**
   * Get QR code for payment request
   * GET /payment_requests/:id/qr
   */
  @Get(':id/qr')
  @Roles(Role.ADMIN, Role.OWNER, Role.MANAGER, Role.CASHIER)
  async getQrCode(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const pr = await this.paymentsService.findById(id);

    if (!pr) {
      throw new NotFoundException('Payment request not found');
    }

    if (user.role === 'CASHIER' && pr.userId !== user.id) {
      throw new ForbiddenException('Access denied');
    }

    if (pr.status !== 'LINK_RECEIVED' || !pr.paymentLink) {
      throw new NotFoundException('Payment link not yet available');
    }

    const qrBuffer = await this.qrService.generateQr(
      id,
      pr.paymentLink.urlHash,
    );

    res.set({
      'Content-Type': 'image/png',
      'Cache-Control': 'private, max-age=300',
    });

    res.send(qrBuffer);
  }

  /**
   * Cancel payment request
   * POST /payment_requests/:id/cancel
   */
  @Post(':id/cancel')
  @Roles(Role.ADMIN, Role.OWNER, Role.MANAGER, Role.CASHIER)
  @HttpCode(HttpStatus.OK)
  async cancelPaymentRequest(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    const pr = await this.paymentsService.findById(id);

    if (!pr) {
      throw new NotFoundException('Payment request not found');
    }

    // Check permission
    if (
      user.role === 'CASHIER' && pr.userId !== user.id
    ) {
      throw new ForbiddenException('Access denied');
    }
    if (
      user.role === 'MANAGER' && pr.userId !== user.id
    ) {
      throw new ForbiddenException('Managers can only cancel their own requests');
    }

    const result = await this.paymentsService.cancel(id);

    await this.auditService.log({
      userId: user.id,
      action: 'PAYMENT_CANCELLED',
      entity: 'payment_request',
      entityId: id,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    return this.mapPaymentRequest(result);
  }

  /**
   * Refresh payment request (retry getting link)
   * POST /payment_requests/:id/refresh
   */
  @Post(':id/refresh')
  @Roles(Role.ADMIN, Role.OWNER, Role.MANAGER, Role.CASHIER)
  @HttpCode(HttpStatus.OK)
  async refreshPaymentRequest(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    const pr = await this.paymentsService.findById(id);

    if (!pr) {
      throw new NotFoundException('Payment request not found');
    }

    if (user.role === 'CASHIER' && pr.userId !== user.id) {
      throw new ForbiddenException('Access denied');
    }

    const result = await this.paymentsService.refresh(id);

    await this.auditService.log({
      userId: user.id,
      action: 'PAYMENT_REFRESHED',
      entity: 'payment_request',
      entityId: id,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    return this.mapPaymentRequest(result);
  }

  /**
   * Get fallback URL for manual Telegram interaction
   * GET /payment_requests/:id/fallback
   */
  @Get(':id/fallback')
  @Roles(Role.ADMIN, Role.OWNER, Role.MANAGER, Role.CASHIER)
  async getFallback(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
  ) {
    const pr = await this.paymentsService.findById(id);

    if (!pr) {
      throw new NotFoundException('Payment request not found');
    }

    if (user.role === 'CASHIER' && pr.userId !== user.id) {
      throw new ForbiddenException('Access denied');
    }

    return this.paymentsService.getFallbackUrl(pr);
  }

  /**
   * Submit manually copied URL (fallback flow)
   * POST /payment_requests/:id/manual-url
   */
  @Post(':id/manual-url')
  @Roles(Role.ADMIN, Role.OWNER, Role.MANAGER, Role.CASHIER)
  @HttpCode(HttpStatus.OK)
  async submitManualUrl(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Body() dto: ManualUrlDto,
    @Req() req: Request,
  ) {
    const pr = await this.paymentsService.findById(id);

    if (!pr) {
      throw new NotFoundException('Payment request not found');
    }

    if (user.role === 'CASHIER' && pr.userId !== user.id) {
      throw new ForbiddenException('Access denied');
    }

    const result = await this.paymentsService.submitManualUrl(id, dto.url);

    await this.auditService.log({
      userId: user.id,
      action: 'PAYMENT_MANUAL_URL',
      entity: 'payment_request',
      entityId: id,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    return this.mapPaymentRequest(result);
  }

  /**
   * Map payment request entity to response DTO
   */
  private mapPaymentRequest(pr: any) {
    return {
      id: pr.id,
      invoiceId: pr.invoiceId,
      status: pr.status,
      createdAt: pr.createdAt,
      errorCode: pr.errorCode,
      errorMessage: pr.errorMessage,
      paymentLink: pr.paymentLink
        ? {
            urlHash: pr.paymentLink.urlHash,
            expiresAt: pr.paymentLink.expiresAt,
            createdAt: pr.paymentLink.createdAt,
          }
        : null,
    };
  }
}
