import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { actionLabel } from '../src/activity';
import { DIRECTION_COLORS } from '../src/components/domain';
import { Card, Chips, Empty, Screen, SectionHeader, styles } from '../src/components/ui';
import { listActivity, type HistoryFilter } from '../src/db/repo';
import type { ActivityRow, EntityType } from '../src/db/types';
import { useI18n } from '../src/i18n';
import { useAppState } from '../src/state';
import { colors, font } from '../src/theme';
import { formatDate, toISODate } from '../src/utils/dates';
import { formatMoney } from '../src/utils/money';

const FILTERS: HistoryFilter[] = ['ALL', 'CREDITS', 'PAYMENTS', 'INSTRUMENTS', 'PAYROLL', 'CHANGES'];
const pad = (n: number) => String(n).padStart(2, '0');

/** Historique de toutes les opérations, avec recherche par nom. */
export default function History() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { t, lang } = useI18n();
  const { version } = useAppState();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<HistoryFilter>('ALL');
  const [rows, setRows] = useState<ActivityRow[]>([]);

  useFocusEffect(
    useCallback(() => {
      listActivity(db, { search, filter }).then(setRows);
    }, [db, search, filter, version]),
  );

  const days = new Map<string, ActivityRow[]>();
  for (const r of rows) {
    const day = toISODate(new Date(r.created_at));
    days.set(day, [...(days.get(day) ?? []), r]);
  }

  return (
    <Screen>
      <TextInput style={styles.input} value={search} onChangeText={setSearch} placeholder={t.search} placeholderTextColor={colors.muted} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 2 }}>
        <Chips options={FILTERS.map((f) => ({ value: f, label: t.historyFilters[f] }))} value={filter} onChange={(v) => v && setFilter(v)} />
      </ScrollView>

      {rows.length === 0 ? <Empty title={t.emptyHistory} /> : null}
      {[...days.entries()].map(([day, list]) => [
        <SectionHeader key={day} title={formatDate(day)} />,
        ...list.map((r) => {
          const created = new Date(r.created_at);
          const open = r.entity_exists && r.entity_type;
          return (
            <Card
              key={r.id}
              onPress={
                open
                  ? () => router.push({ pathname: '/operation', params: { kind: r.entity_type as EntityType, id: r.entity_id! } })
                  : r.contact_id
                    ? () => router.push(`/contacts/${r.contact_id}`)
                    : undefined
              }
            >
              <View style={styles.row}>
                <Text style={{ flex: 1, fontSize: font.md, fontWeight: '700', color: colors.text }}>{actionLabel(t, r)}</Text>
                {r.amount != null ? (
                  <Text style={{ fontSize: font.md, fontWeight: '800', color: r.direction ? DIRECTION_COLORS[r.direction].fg : colors.text }}>
                    {formatMoney(r.amount, lang)}
                  </Text>
                ) : null}
              </View>
              <Text style={styles.muted} numberOfLines={2}>
                {pad(created.getHours())}:{pad(created.getMinutes())}
                {r.contact_name ? `  ·  ${r.contact_name}` : ''}
                {r.details && !/^[A-Z_\d]+$/.test(r.details) ? `  ·  ${r.details}` : ''}
                {r.photos ? `  ·  ${t.photoCount(r.photos)}` : ''}
              </Text>
            </Card>
          );
        }),
      ])}
    </Screen>
  );
}
