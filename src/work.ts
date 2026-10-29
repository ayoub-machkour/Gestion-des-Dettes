import type { PricingMode, WorkFields } from './db/types';
import type { Dict, Lang } from './i18n/dicts';
import { formatDate } from './utils/dates';
import { formatMoney } from './utils/money';

type WorkRow = WorkFields & { days: number | null; rate: number | null };

/** Nom du travail (« Récolte des tomates »). */
export function workTitle(t: Dict, row: Pick<WorkFields, 'work_label'>): string {
  return row.work_label || t.work;
}

/** Détail du calcul : « 12 j × 100 DH », « 45 plateaux × 3 DH » ou « Forfait ». */
export function workDetail(t: Dict, row: WorkRow, lang: Lang): string {
  const mode: PricingMode = row.pricing_mode ?? 'DAY';
  const rate = formatMoney(row.rate ?? 0, lang);
  if (mode === 'FLAT') return t.flat;
  if (mode === 'UNIT') return `${row.days ?? 0} ${row.unit_label ?? ''} × ${rate}`;
  const period = row.period_start && row.period_end ? ` · ${t.periodText(formatDate(row.period_start), formatDate(row.period_end))}` : '';
  return `${t.daysCount(row.days ?? 0)} × ${rate}${period}`;
}

/** Prix d'un type de travail : « 100 DH / jour », « 3 DH / plateau », « Forfait 500 DH ». */
export function kindPrice(t: Dict, mode: PricingMode, price: number, unit: string | null, lang: Lang): string {
  const amount = formatMoney(price, lang);
  if (mode === 'FLAT') return `${t.flat} ${amount}`;
  return `${amount} / ${mode === 'DAY' ? t.dayUnit : unit ?? ''}`;
}
