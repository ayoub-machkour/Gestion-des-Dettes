import type { Contact } from './db/types';
import type { Dict } from './i18n/dicts';

/** Type affiché d'une personne : type personnalisé s'il existe, sinon le type de base. */
export function contactTypeLabel(t: Dict, contact: Pick<Contact, 'type' | 'type_label'>): string {
  return contact.type_label ? `🏷️ ${contact.type_label}` : t.contactTypes[contact.type];
}
