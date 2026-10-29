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

export function addMonths(s: string, n: number): string {
  const d = parseISODate(s);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  // 31 janvier + 1 mois -> 28/29 février, pas 3 mars.
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return toISODate(d);
}

/** Jours de travail entre deux dates incluses, en comptant ou non le samedi et le dimanche. */
export function countWorkDays(start: string, end: string, countSaturday: boolean, countSunday: boolean): number {
  if (end < start) return 0;
  let n = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const weekday = parseISODate(d).getDay();
    if (weekday === 6 && !countSaturday) continue;
    if (weekday === 0 && !countSunday) continue;
    n++;
  }
  return n;
}

export function atHour(s: string, hour: number): Date {
  const d = parseISODate(s);
  d.setHours(hour, 0, 0, 0);
  return d;
}
