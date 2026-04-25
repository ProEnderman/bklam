/**
 * Common type definitions for the application
 */

export interface PaginationParams {
  limit?: number;
  offset?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Audit log actions
 */
export enum AuditAction {
  // Telegram
  TELEGRAM_LINKED = 'TELEGRAM_LINKED',
  TELEGRAM_UNLINKED = 'TELEGRAM_UNLINKED',
  MTPROTO_CODE_SENT = 'MTPROTO_CODE_SENT',
  MTPROTO_CODE_CONFIRMED = 'MTPROTO_CODE_CONFIRMED',
  MTPROTO_2FA_REQUIRED = 'MTPROTO_2FA_REQUIRED',
  SESSION_CREATED = 'SESSION_CREATED',
  SESSION_USED = 'SESSION_USED',
  SESSION_REVOKED = 'SESSION_REVOKED',
  SESSION_FAILED = 'SESSION_FAILED',

  // Payments
  PAYMENT_REQUESTED = 'PAYMENT_REQUESTED',
  PAYMENT_SENT = 'PAYMENT_SENT',
  PAYMENT_LINK_RECEIVED = 'PAYMENT_LINK_RECEIVED',
  PAYMENT_FAILED = 'PAYMENT_FAILED',
  PAYMENT_CANCELLED = 'PAYMENT_CANCELLED',
  PAYMENT_REFRESHED = 'PAYMENT_REFRESHED',
  PAYMENT_MANUAL_URL = 'PAYMENT_MANUAL_URL',
}
