import { ar } from './ar';
import { fr, type Dict } from './fr';

export type Lang = 'fr' | 'ar';
export type { Dict };

export const dicts: Record<Lang, Dict> = { fr, ar };
