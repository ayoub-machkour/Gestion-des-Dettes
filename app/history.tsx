import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, Text, TextInput, View } from 'react-native';
import { actionLabel } from '../src/activity';
import { DIRECTION_COLORS } from '../src/components/domain';
import { Badge, Btn, Card, Chips, Empty, Screen, SectionTitle, styles } from '../src/components/ui';
import { getContact, listActivity, type HistoryFilter, type LogInput } from '../src/db/repo';
import type { ActivityRow, EntityType } from '../src/db/types';
import { getLastUndo, type UndoGroup } from '../src/db/undo';
import { useI18n } from '../src/i18n';
import { useAppState } from '../src/state';
import { colors, font } from '../src/theme';
import { formatDate, toISODate } from '../src/utils/dates';
import { formatMoney } from '../src/utils/money';

type Period = 'TODAY' | 'WEEK' | 'MONTH' | 'ALL';
const FILTERS: HistoryFilter[] = ['ALL', 'PAYABLE', 'RECEIVABLE', 'PAYMENTS', 'INSTRUMENTS', 'PAYROLL', 'CHANGES'];

function sinceFor(period: Period): string | null {
  const now = new Date();
  if (period === 'TODAY') return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  if (period === 'WEEK') return new Date(now.getTime() - 7 * 86_400_000).toISOString();
  if (period === 'MONTH') return new Date(now.getTime() - 30 * 86_400_000).toISOString();
  return null;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Journal de toutes les opérations : recherche par nom, filtres, photos, annulation. */
export default function History() {
  const db = useSQLiteContext();
  const router = useRouter();
  const params = useLocalSearchParams<{ contactId?: string }>();
  const { t, lang } = useI18n();
  const { version, undo } = useAppState();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<HistoryFilter>('ALL');
  const [period, setPeriod] = useState<Period>('ALL');
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [lastUndo, setLastUndo] = useState<UndoGroup | null>(null);
  const [contactName, setContactName] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      listActivity(db, { search, contactId: params.contactId, filter, since: sinceFor(period) }).then(setRows);
      getLastUndo(db).then(setLastUndo);
      if (params.contactId) getContact(db, params.contactId).then((c) => setContactName(c?.name ?? null));
    }, [db, search, filter, period, params.contactId, version]),
  );

  const undoLabel = (() => {
    if (!lastUndo) return null;
    try {
      return actionLabel(t, JSON.parse(lastUndo.label) as LogInput);
    } catch {
      return null;
    }
  })();

  const askUndo = () =>
    Alert.alert(t.undoLast, undoLabel ?? '', [
      { text: t.cancel, style: 'cancel' },
      { text: t.confirm, onPress: undo },
    ]);

  const days = new Map<string, ActivityRow[]>();
  for (const r of rows) {
    const day = toISODate(new Date(r.created_at));
    days.set(day, [...(days.get(day) ?? []), r]);
  }

  return (
    <Screen>
      {contactName ? <Stack.Screen options={{ title: `${t.history} · ${contactName}` }} /> : null}
      {lastUndo ? <Btn label={`${t.undoLast}${undoLabel ? `\n${undoLabel}` : ''}`} variant="earth" onPress={askUndo} /> : null}
      {!params.contactId ? (
        <TextInput style={styles.input} value={search} onChangeText={setSearch} placeholder={`🔍 ${t.search}`} placeholderTextColor={colors.muted} />
      ) : null}
      <Chips options={FILTERS.map((f) => ({ value: f, label: t.historyFilters[f] }))} value={filter} onChange={setFilter} />
      <Chips<Period> options={(['TODAY', 'WEEK', 'MONTH', 'ALL'] as const).map((p) => ({ value: p, label: t.periods[p] }))} value={period} onChange={setPeriod} />

      {rows.length === 0 ? <Empty text={t.emptyHistory} /> : null}
      {[...days.entries()].map(([day, list]) => [
        <SectionTitle key={day}>📅 {formatDate(day)}</SectionTitle>,
        ...list.map((r) => {
          const created = new Date(r.created_at);
          const dir = r.direction ? DIRECTION_COLORS[r.direction] : null;
          const open = r.entity_exists && r.entity_type;
          return (
            <Card
              key={r.id}
              onPress={
                open
                  ? () => router.push({ pathname: '/operation', params: { kind: r.entity_type as EntityType, id: r.entity_id! } })
                  : r.contact_id && !params.contactId
                    ? () => router.push(`/contacts/${r.contact_id}`)
                    : undefined
              }
              style={dir ? { borderStartWidth: 6, borderStartColor: dir.fg } : undefined}
            >
              <View style={styles.row}>
                <Text style={[styles.body, { flex: 1, fontWeight: '800' }]}>{actionLabel(t, r)}</Text>
                {r.amount != null ? (
                  <Text style={{ fontSize: font.md + 1, fontWeight: '900', color: dir?.fg ?? colors.text }}>{formatMoney(r.amount, lang)}</Text>
                ) : null}
              </View>
              <View style={styles.row}>
                <Text style={[styles.muted, { flex: 1 }]} numberOfLines={2}>
                  🕐 {pad(created.getHours())}:{pad(created.getMinutes())}
                  {r.contact_name ? `  ·  👤 ${r.contact_name}` : ''}
                  {r.details && r.action !== 'PAYROLL_ADDED' && !r.details.match(/^[A-Z_]+$/) ? `  ·  ${r.details}` : ''}
                </Text>
                {r.photos ? <Badge text={t.photoCount(r.photos)} color={colors.oliveDark} bg={colors.oliveLight} /> : null}
                {r.entity_type && !r.entity_exists && r.action !== 'DELETED' ? <Badge text={t.deleted} color={colors.muted} bg={colors.earthLight} /> : null}
              </View>
            </Card>
          );
        }),
      ])}
    </Screen>
  );
}
