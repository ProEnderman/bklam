import { IsString, IsNotEmpty, IsOptional, IsUrl, IsNumber } from 'class-validator';

/**
 * DTO for creating a payment request
 */
export class CreatePaymentRequestDto {
  @IsString()
  @IsNotEmpty()
  invoiceId: string;

  @IsNumber()
  @IsOptional()
  amount?: number;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsString()
  @IsOptional()
  orderNumber?: string;
}

/**
 * DTO for manual URL input (fallback)
 */
export class ManualUrlDto {
  @IsUrl()
  @IsNotEmpty()
  url: string;
}

/**
 * Response DTOs
 */
export class PaymentRequestResponse {
  id: string;
  invoiceId: string;
  status: string;
  createdAt: Date;
  paymentLink?: PaymentLinkResponse | null;
  errorCode?: string | null;
  errorMessage?: string | null;
}

export class PaymentLinkResponse {
  urlHash: string;
  expiresAt?: Date | null;
  createdAt: Date;
}

export class FallbackResponse {
  fallbackUrl: string;
  message: string;
  instructions: string;
}
