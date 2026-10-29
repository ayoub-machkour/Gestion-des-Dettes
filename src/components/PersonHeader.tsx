import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { getContact } from '../db/repo';
import type { ContactWithBalance } from '../db/types';
import { useI18n } from '../i18n';
import { contactTypeLabel } from '../labels';
import { colors, font } from '../theme';
import { Avatar, styles } from './ui';

/** Rappelle en haut d'un formulaire pour qui on enregistre l'opération. */
export function PersonHeader({ contactId, onLoad }: { contactId: string; onLoad?: (c: ContactWithBalance) => void }) {
  const db = useSQLiteContext();
  const { t } = useI18n();
  const [person, setPerson] = useState<ContactWithBalance | null>(null);

  useEffect(() => {
    getContact(db, contactId).then((c) => {
      setPerson(c);
      if (c) onLoad?.(c);
    });
    // onLoad volontairement hors dépendances : appelé une fois par contact.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, contactId]);

  if (!person) return null;
  return (
    <View style={[styles.row, { paddingVertical: 4 }]}>
      <Avatar name={person.name} size={44} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: font.lg, fontWeight: '800', color: colors.text }} numberOfLines={1}>
          {person.name}
        </Text>
        <Text style={styles.muted}>{contactTypeLabel(t, person)}</Text>
      </View>
    </View>
  );
}
