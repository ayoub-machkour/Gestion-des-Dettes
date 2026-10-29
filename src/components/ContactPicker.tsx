import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { FlatList, Modal, Pressable, Text, TextInput, View } from 'react-native';
import { getContact, listContacts } from '../db/repo';
import type { ContactType, ContactWithBalance } from '../db/types';
import { useI18n } from '../i18n';
import { colors, font } from '../theme';
import { formatMoney } from '../utils/money';
import { Btn, ErrorText, Label, styles } from './ui';

export function ContactPicker({
  value,
  onChange,
  types,
  error,
}: {
  value: string | null;
  onChange: (id: string) => void;
  types?: ContactType[];
  error?: string | null;
}) {
  const db = useSQLiteContext();
  const router = useRouter();
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<ContactWithBalance[]>([]);
  const [selected, setSelected] = useState<ContactWithBalance | null>(null);

  useEffect(() => {
    if (value) getContact(db, value).then(setSelected);
    else setSelected(null);
  }, [db, value]);

  useEffect(() => {
    if (!open) return;
    listContacts(db, null, search).then((all) => setItems(types ? all.filter((c) => types.includes(c.type)) : all));
  }, [db, open, search, types]);

  return (
    <View style={styles.field}>
      <Label>{t.contact}</Label>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.input, { justifyContent: 'center' }, error ? { borderColor: colors.danger } : null, pressed && styles.pressed]}
      >
        <Text style={[styles.dateText, !selected && { color: colors.muted }]}>
          👤 {selected ? `${selected.name} · ${t.contactTypes[selected.type]}` : t.chooseContact}
        </Text>
      </Pressable>
      <ErrorText>{error}</ErrorText>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, backgroundColor: colors.cream, padding: 16, gap: 12 }}>
          <Text style={styles.sectionTitle}>{t.chooseContact}</Text>
          <TextInput style={styles.input} value={search} onChangeText={setSearch} placeholder={t.search} placeholderTextColor={colors.muted} />
          <FlatList
            data={items}
            keyExtractor={(c) => c.id}
            contentContainerStyle={{ gap: 8 }}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  onChange(item.id);
                  setOpen(false);
                }}
                style={({ pressed }) => [styles.card, styles.row, pressed && styles.pressed]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.body, { fontWeight: '700' }]}>{item.name}</Text>
                  <Text style={styles.muted}>{t.contactTypes[item.type]}</Text>
                </View>
                {item.balance > 0 ? (
                  <Text style={{ color: colors.danger, fontWeight: '800', fontSize: font.md }}>{formatMoney(item.balance, lang)}</Text>
                ) : null}
              </Pressable>
            )}
          />
          <Btn
            label={t.newContact}
            variant="earth"
            onPress={() => {
              setOpen(false);
              router.push({ pathname: '/contacts/new', params: types?.length === 1 ? { type: types[0] } : {} });
            }}
          />
          <Btn label={t.close} variant="outline" onPress={() => setOpen(false)} />
        </View>
      </Modal>
    </View>
  );
}
