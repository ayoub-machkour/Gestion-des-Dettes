import type { ActivityAction, Direction, InstrumentType } from './db/types';
import type { Dict } from './i18n/dicts';

const ICONS: Record<ActivityAction, string> = {
  CONTACT_ADDED: '👤',
  CONTACT_EDITED: '👤',
  CONTACT_DELETED: '🗑',
  CREDIT_ADDED: '📝',
  PAYROLL_ADDED: '👷',
  PAYMENT: '💵',
  INSTRUMENT_ADDED: '📄',
  INSTRUMENT_PAID: '✅',
  INSTRUMENT_CANCELLED: '✖️',
  EDITED: '✏️',
  DELETED: '🗑',
  PHOTO_ADDED: '📷',
  PHOTO_DELETED: '📷',
};

const INSTRUMENT_TYPES = ['CASH', 'BANK_CHECK', 'BILL_OF_EXCHANGE', 'PROMISSORY_NOTE'];

/** Libellé lisible d'une entrée de journal (ou d'un groupe d'annulation). */
export function actionLabel(t: Dict, entry: { action: ActivityAction; direction?: Direction | null; details?: string | null }): string {
  let label = t.actions[entry.action];
  if (entry.action === 'CREDIT_ADDED' && entry.direction) label = t.creditAdded[entry.direction];
  if (entry.action === 'PAYMENT' && entry.direction) label = t.paymentDir[entry.direction];
  if (entry.details && INSTRUMENT_TYPES.includes(entry.details)) label += ` · ${t.instrTypes[entry.details as InstrumentType]}`;
  return `${ICONS[entry.action]} ${label}`;
}
