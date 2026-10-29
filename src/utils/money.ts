import type { Lang } from '../i18n/dicts';

/** "1 250,5" -> 125050 centimes. Retourne null si invalide. */
export function parseMoney(input: string): number | null {
  const s = input.replace(/[\s  ]/g, '').replace(',', '.');
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return null;
  return Math.round(parseFloat(s) * 100);
}

/** "2,5" -> 2.5 (jours travaillés, demi-journées autorisées). */
export function parseNumber(input: string): number | null {
  const s = input.replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  return parseFloat(s);
}

export function centsToInput(cents: number): string {
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2).replace('.', ',');
}

export function formatMoney(cents: number, lang: Lang): string {
  const negative = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const int = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const dec = abs % 100;
  const num = dec ? `${int},${String(dec).padStart(2, '0')}` : int;
  return `${negative ? '-' : ''}${num} ${lang === 'ar' ? 'درهم' : 'DH'}`;
}
