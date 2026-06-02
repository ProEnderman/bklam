import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  ForbiddenException,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, CurrentUserData } from '../auth/decorators/current-user.decorator';
import { TelegramLoginService } from './services/telegram-login.service';
import { MtprotoService } from './services/mtproto.service';
import { AuditService } from './services/audit.service';
import {
  TelegramLoginDto,
  SendCodeDto,
  ConfirmCodeDto,
  ConfirmPasswordDto,
  UpdateTelegramSettingsDto,
} from './dto/telegram.dto';

@Controller('telegram')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TelegramController {
  constructor(
    private telegramLoginService: TelegramLoginService,
    private mtprotoService: MtprotoService,
    private auditService: AuditService,
  ) {}

  /**
   * Link Telegram account via Login Widget
   * POST /telegram/link
   */
  @Post('link')
  @Roles(Role.ADMIN, Role.OWNER, Role.MANAGER, Role.CASHIER)
  @HttpCode(HttpStatus.OK)
  async linkTelegramAccount(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: TelegramLoginDto,
    @Req() req: Request,
  ) {
    const account = await this.telegramLoginService.linkAccount(user.id, dto);

    await this.auditService.log({
      userId: user.id,
      action: 'TELEGRAM_LINKED',
      entity: 'telegram_account',
      entityId: account.id,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    return {
      telegramUserId: account.telegramUserId.toString(),
      username: account.username,
      firstName: account.firstName,
      verifiedAt: account.verifiedAt,
    };
  }

  /**
   * Unlink Telegram account
   * DELETE /telegram/link
   */
  @Delete('link')
  @Roles(Role.ADMIN, Role.OWNER, Role.MANAGER, Role.CASHIER)
  @HttpCode(HttpStatus.NO_CONTENT)
  async unlinkTelegramAccount(
    @CurrentUser() user: CurrentUserData,
    @Req() req: Request,
  ) {
    await this.telegramLoginService.unlinkAccount(user.id);

    await this.auditService.log({
      userId: user.id,
      action: 'TELEGRAM_UNLINKED',
      entity: 'telegram_account',
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
  }

  // ============================================
  // MTProto Onboarding Wizard
  // ============================================

  /**
   * Step 1: Send verification code to phone
   * POST /telegram/mtproto/sendCode
   */
  @Post('mtproto/sendCode')
  @Roles(Role.ADMIN, Role.OWNER, Role.MANAGER, Role.CASHIER)
  async sendCode(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: SendCodeDto,
    @Req() req: Request,
  ) {
    const result = await this.mtprotoService.sendCode(user.id, dto.phone);

    await this.auditService.log({
      userId: user.id,
      action: 'MTPROTO_CODE_SENT',
      entity: 'telegram_session',
      metadata: { phoneMasked: this.mtprotoService.maskPhone(dto.phone) },
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    return result;
  }

  /**
   * Step 2: Confirm code
   * POST /telegram/mtproto/confirmCode
   */
  @Post('mtproto/confirmCode')
  @Roles(Role.ADMIN, Role.OWNER, Role.MANAGER, Role.CASHIER)
  async confirmCode(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: ConfirmCodeDto,
    @Req() req: Request,
  ) {
    const result = await this.mtprotoService.confirmCode(
      user.id,
      user.email,
      user.restaurantId,
      dto.phone,
      dto.phoneCodeHash,
      dto.code,
    );

    await this.auditService.log({
      userId: user.id,
      action: result.requires2FA ? 'MTPROTO_2FA_REQUIRED' : 'MTPROTO_CODE_CONFIRMED',
      entity: 'telegram_session',
      metadata: { phoneMasked: this.mtprotoService.maskPhone(dto.phone) },
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    return result;
  }

  /**
   * Step 3: Confirm 2FA password (if required)
   * POST /telegram/mtproto/confirmPassword
   */
  @Post('mtproto/confirmPassword')
  @Roles(Role.ADMIN, Role.OWNER, Role.MANAGER, Role.CASHIER)
  async confirmPassword(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: ConfirmPasswordDto,
    @Req() req: Request,
  ) {
    const result = await this.mtprotoService.confirmPassword(
      user.id,
      user.email,
      user.restaurantId,
      dto.phone,
      dto.password,
    );

    await this.auditService.log({
      userId: user.id,
      action: 'SESSION_CREATED',
      entity: 'telegram_session',
      entityId: result.sessionId,
      metadata: { phoneMasked: this.mtprotoService.maskPhone(dto.phone) },
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    return { success: true, sessionLinked: true };
  }

  /**
   * Revoke own session
   * DELETE /telegram/mtproto/sessions/:sessionId
   */
  @Delete('mtproto/sessions/:sessionId')
  @Roles(Role.ADMIN, Role.OWNER, Role.MANAGER, Role.CASHIER)
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeSession(
    @CurrentUser() user: CurrentUserData,
    @Param('sessionId') sessionId: string,
    @Req() req: Request,
  ) {
    // Check ownership or admin rights
    const session = await this.mtprotoService.getSession(sessionId);

    if (
      session.userId !== user.id &&
      !['ADMIN', 'OWNER'].includes(user.role)
    ) {
      throw new ForbiddenException('Cannot revoke sessions of other users');
    }

    await this.mtprotoService.revokeSession(sessionId);

    await this.auditService.log({
      userId: user.id,
      action: 'SESSION_REVOKED',
      entity: 'telegram_session',
      entityId: sessionId,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
  }

  /**
   * Get Telegram link status
   * GET /telegram/status
   */
  @Get('status')
  @Roles(Role.ADMIN, Role.OWNER, Role.MANAGER, Role.CASHIER)
  async getStatus(@CurrentUser() user: CurrentUserData) {
    return this.mtprotoService.getStatus(user.id, user.restaurantId);
  }

  /**
   * Update Telegram settings (bank bot username)
   * PUT /telegram/settings
   */
  @Post('settings')
  @Roles(Role.ADMIN, Role.OWNER, Role.MANAGER, Role.CASHIER)
  @HttpCode(HttpStatus.OK)
  async updateSettings(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: UpdateTelegramSettingsDto,
    @Req() req: Request,
  ) {
    const result = await this.mtprotoService.updateRestaurantBankBotUsername(
      user.restaurantId,
      user.id,
      dto.bankBotUsername,
    );

    await this.auditService.log({
      userId: user.id,
      action: 'TELEGRAM_SETTINGS_UPDATED',
      entity: 'telegram_session',
      metadata: { bankBotUsername: dto.bankBotUsername },
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    return result;
  }

  /**
   * Get Telegram settings
   * GET /telegram/settings
   */
  @Get('settings')
  @Roles(Role.ADMIN, Role.OWNER, Role.MANAGER, Role.CASHIER)
  async getSettings(@CurrentUser() user: CurrentUserData) {
    return this.mtprotoService.getRestaurantSettings(user.restaurantId, user.id);
  }
}
