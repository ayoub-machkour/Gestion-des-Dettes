import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { Btn, Card, Chips, Empty, Screen, styles } from '../../src/components/ui';
import { listContacts } from '../../src/db/repo';
import type { ContactType, ContactWithBalance } from '../../src/db/types';
import { useI18n } from '../../src/i18n';
import { colors, font } from '../../src/theme';
import { formatMoney } from '../../src/utils/money';

const TYPES: ContactType[] = ['SUPPLIER', 'FAMILY_LENDER', 'EMPLOYEE', 'OTHER'];

export default function ContactsList() {
  const db = useSQLiteContext();
  const router = useRouter();
  const params = useLocalSearchParams<{ type?: ContactType }>();
  const { t, lang } = useI18n();
  const [type, setType] = useState<ContactType | 'ALL'>(params.type ?? 'ALL');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<ContactWithBalance[]>([]);

  useFocusEffect(
    useCallback(() => {
      listContacts(db, type === 'ALL' ? null : type, search).then(setItems);
    }, [db, type, search]),
  );

  return (
    <Screen>
      <Btn label={t.newContact} variant="earth" onPress={() => router.push({ pathname: '/contacts/new', params: type === 'ALL' ? {} : { type } })} />
      <TextInput style={styles.input} value={search} onChangeText={setSearch} placeholder={`🔍 ${t.search}`} placeholderTextColor={colors.muted} />
      <Chips
        options={[{ value: 'ALL' as const, label: t.all }, ...TYPES.map((v) => ({ value: v, label: t.contactTypes[v] }))]}
        value={type}
        onChange={setType}
      />
      {items.length === 0 ? <Empty text={t.emptyContacts} /> : null}
      {items.map((c) => (
        <Card key={c.id} onPress={() => router.push(`/contacts/${c.id}`)}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.body, { fontWeight: '800', fontSize: font.md + 1 }]}>{c.name}</Text>
              <Text style={styles.muted}>
                {t.contactTypes[c.type]}
                {c.phone ? ` · ${c.phone}` : ''}
              </Text>
            </View>
            <Text style={{ fontSize: font.md + 1, fontWeight: '800', color: c.balance > 0 ? colors.danger : colors.success }}>
              {formatMoney(c.balance, lang)}
            </Text>
          </View>
        </Card>
      ))}
    </Screen>
  );
}
