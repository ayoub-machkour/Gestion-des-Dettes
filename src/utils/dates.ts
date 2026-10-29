const pad = (n: number) => String(n).padStart(2, '0');

export const toISODate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const today = () => toISODate(new Date());

export function parseISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s: string, n: number): string {
  const d = parseISODate(s);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** Nombre de jours entre aujourd'hui et la date (négatif = en retard). */
export function daysUntil(s: string): number {
  return Math.round((parseISODate(s).getTime() - parseISODate(today()).getTime()) / 86_400_000);
}

export function formatDate(s: string | null | undefined): string {
  if (!s) return '—';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

export function atHour(s: string, hour: number): Date {
  const d = parseISODate(s);
  d.setHours(hour, 0, 0, 0);
  return d;
}
