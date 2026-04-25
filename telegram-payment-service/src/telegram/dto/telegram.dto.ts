import { IsString, IsNumber, IsOptional, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO for Telegram Login Widget callback
 */
export class TelegramLoginDto {
  @IsNumber()
  @Type(() => Number)
  id: number;

  @IsString()
  @IsOptional()
  first_name?: string;

  @IsString()
  @IsOptional()
  last_name?: string;

  @IsString()
  @IsOptional()
  username?: string;

  @IsString()
  @IsOptional()
  photo_url?: string;

  @IsNumber()
  @Type(() => Number)
  auth_date: number;

  @IsString()
  @IsNotEmpty()
  hash: string;
}

/**
 * DTO for MTProto sendCode
 */
export class SendCodeDto {
  @IsString()
  @IsNotEmpty()
  phone: string;
}

/**
 * DTO for MTProto confirmCode
 */
export class ConfirmCodeDto {
  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsString()
  @IsNotEmpty()
  phoneCodeHash: string;

  @IsString()
  @IsNotEmpty()
  code: string;
}

/**
 * DTO for MTProto confirmPassword (2FA)
 */
export class ConfirmPasswordDto {
  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}

/**
 * Response DTOs
 */
export class TelegramAccountResponse {
  telegramUserId: string;
  username: string | null;
  firstName: string | null;
  verifiedAt: Date;
}

export class SendCodeResponse {
  phoneCodeHash: string;
  timeout: number;
}

export class ConfirmCodeResponse {
  success: boolean;
  requires2FA: boolean;
  sessionLinked: boolean;
}

/**
 * DTO for updating Telegram settings (bank bot username)
 */
export class UpdateTelegramSettingsDto {
  @IsString()
  @IsNotEmpty()
  bankBotUsername: string;
}
