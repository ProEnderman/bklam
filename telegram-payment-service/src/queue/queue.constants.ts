export const QUEUE_BANK_BOT = 'bank-bot';
export const JOB_SEND_TO_BANK_BOT = 'sendToBankBot';

/** Per-account queue name for parallel workers (concurrency=1 per account). BullMQ forbids ':' in queue names. */
export const PAYMENTS_QUEUE_PREFIX = 'telegram_payments';
export function getPaymentsQueueName(telegramAccountId: string): string {
  const safe = String(telegramAccountId).replace(/:/g, '_');
  return `${PAYMENTS_QUEUE_PREFIX}_${safe}`;
}
