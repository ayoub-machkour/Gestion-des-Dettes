import type { ActivityAction, Direction, InstrumentType } from './db/types';
import type { Dict } from './i18n/dicts';

const INSTRUMENT_TYPES = ['CASH', 'BANK_CHECK', 'BILL_OF_EXCHANGE', 'PROMISSORY_NOTE'];

/** Libellé lisible d'une entrée de journal. */
export function actionLabel(t: Dict, entry: { action: ActivityAction; direction?: Direction | null; details?: string | null }): string {
  let label = t.actions[entry.action];
  if (entry.action === 'CREDIT_ADDED' && entry.direction) label = t.creditAdded[entry.direction];
  if (entry.action === 'PAYMENT' && entry.direction) label = t.paymentDir[entry.direction];
  if (entry.details && INSTRUMENT_TYPES.includes(entry.details)) label += ` · ${t.instrTypes[entry.details as InstrumentType]}`;
  return label;
}
