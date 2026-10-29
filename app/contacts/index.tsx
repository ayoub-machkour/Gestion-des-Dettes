import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { Badge, Btn, Card, Chips, Empty, Screen, styles } from '../../src/components/ui';
import { listContacts } from '../../src/db/repo';
import type { ContactType, ContactWithBalance, Direction } from '../../src/db/types';
import { useI18n } from '../../src/i18n';
import { useAppState } from '../../src/state';
import { colors, font } from '../../src/theme';
import { formatMoney } from '../../src/utils/money';

const TYPES: ContactType[] = ['SUPPLIER', 'CUSTOMER', 'FAMILY_LENDER', 'EMPLOYEE', 'OTHER'];
type DirFilter = 'ALL' | Direction;

export default function ContactsList() {
  const db = useSQLiteContext();
  const router = useRouter();
  const params = useLocalSearchParams<{ type?: ContactType; direction?: Direction }>();
  const { t, lang } = useI18n();
  const { version } = useAppState();
  const [type, setType] = useState<ContactType | 'ALL'>(params.type ?? 'ALL');
  const [direction, setDirection] = useState<DirFilter>(params.direction ?? 'ALL');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<ContactWithBalance[]>([]);

  useFocusEffect(
    useCallback(() => {
      listContacts(db, { type: type === 'ALL' ? null : type, search, direction: direction === 'ALL' ? null : direction }).then(setItems);
    }, [db, type, search, direction, version]),
  );

  return (
    <Screen>
      <Btn label={t.newContact} variant="earth" onPress={() => router.push({ pathname: '/contacts/new', params: type === 'ALL' ? {} : { type } })} />
      <TextInput style={styles.input} value={search} onChangeText={setSearch} placeholder={`🔍 ${t.search}`} placeholderTextColor={colors.muted} />
      <Chips<DirFilter>
        options={[
          { value: 'ALL', label: t.all },
          { value: 'PAYABLE', label: `🔴 ${t.iOwe}` },
          { value: 'RECEIVABLE', label: `🟢 ${t.owedToMe}` },
        ]}
        value={direction}
        onChange={setDirection}
      />
      <Chips
        options={[{ value: 'ALL' as const, label: t.all }, ...TYPES.map((v) => ({ value: v, label: t.contactTypes[v] }))]}
        value={type}
        onChange={setType}
      />
      {items.length === 0 ? <Empty text={t.emptyContacts} /> : null}
      {items.map((c) => {
        const late = Math.max(c.late_payable ?? 0, c.late_receivable ?? 0);
        return (
          <Card key={c.id} onPress={() => router.push(`/contacts/${c.id}`)}>
            <View style={styles.row}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={[styles.body, { fontWeight: '800', fontSize: font.md + 1 }]}>{c.name}</Text>
                <Text style={styles.muted}>
                  {t.contactTypes[c.type]}
                  {c.phone ? ` · ${c.phone}` : ''}
                </Text>
                {late > 0 ? <Badge text={`⏱ ${t.lateBy(late)}`} color={colors.white} bg={colors.danger} /> : null}
              </View>
              <View style={{ alignItems: 'flex-end', gap: 2 }}>
                {c.payable > 0 ? <Text style={{ fontSize: font.md, fontWeight: '800', color: colors.danger }}>🔴 {formatMoney(c.payable, lang)}</Text> : null}
                {c.receivable > 0 ? (
                  <Text style={{ fontSize: font.md, fontWeight: '800', color: colors.success }}>🟢 {formatMoney(c.receivable, lang)}</Text>
                ) : null}
                {c.payable <= 0 && c.receivable <= 0 ? <Text style={{ fontSize: font.md, fontWeight: '800', color: colors.success }}>✓</Text> : null}
              </View>
            </View>
          </Card>
        );
      })}
    </Screen>
  );
}
