import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { LateBadge } from '../../src/components/domain';
import { Avatar, Button, Empty, Pill, Screen, SectionHeader, styles } from '../../src/components/ui';
import { getContact, getLedger, getTimeline, listInstruments } from '../../src/db/repo';
import type { ContactWithBalance, Direction, InstrumentType, TimelineRow, TransactionType } from '../../src/db/types';
import { useI18n } from '../../src/i18n';
import { contactTypeLabel } from '../../src/labels';
import { workDetail, workTitle } from '../../src/work';
import { useAppState } from '../../src/state';
import { sendStatementWhatsApp, shareStatementPdf } from '../../src/statement';
import { colors, font, radius } from '../../src/theme';
import { daysUntil, formatDate } from '../../src/utils/dates';
import { formatMoney } from '../../src/utils/money';

/** Fiche d'une personne : ce qui est dû, deux actions principales, et toutes les opérations. */
export default function PersonPage() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang } = useI18n();
  const { version } = useAppState();
  const [person, setPerson] = useState<ContactWithBalance | null>(null);
  const [timeline, setTimeline] = useState<TimelineRow[]>([]);

  useFocusEffect(
    useCallback(() => {
      getContact(db, id).then(setPerson);
      getTimeline(db, id).then(setTimeline);
    }, [db, id, version]),
  );

  if (!person) return null;
  // Action principale selon le type : travail pour un ouvrier, prêt pour la famille, achat sinon.
  const main =
    person.type === 'EMPLOYEE'
      ? { label: t.addWork, go: () => router.push({ pathname: '/payroll/new', params: { contactId: id } }) }
      : person.type === 'FAMILY_LENDER'
        ? { label: t.newLoan, go: () => router.push({ pathname: '/credit/new', params: { contactId: id, mode: 'loan' } }) }
        : { label: t.newPurchase, go: () => router.push({ pathname: '/credit/new', params: { contactId: id } }) };

  const askStatement = () =>
    Alert.alert(t.statementTitle, person.name, [
      { text: t.cancel, style: 'cancel' },
      {
        text: t.statementText,
        onPress: async () => sendStatementWhatsApp({ contact: person, ledger: await getLedger(db, id), payments: await listInstruments(db, { contactId: id }) }, t, lang),
      },
      {
        text: t.statementPdf,
        onPress: async () => shareStatementPdf({ contact: person, ledger: await getLedger(db, id), payments: await listInstruments(db, { contactId: id }) }, t, lang),
      },
    ]);

  const balanceRows: { label: string; amount: number; color: string; bg: string }[] = [];
  if (person.payable !== 0)
    balanceRows.push({ label: person.payable > 0 ? t.youOwe : t.advanceGiven, amount: Math.abs(person.payable), color: colors.danger, bg: colors.dangerSoft });
  if (person.receivable !== 0)
    balanceRows.push({ label: person.receivable > 0 ? t.heOwesYou : t.advanceReceived, amount: Math.abs(person.receivable), color: colors.success, bg: colors.successSoft });

  return (
    <Screen>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable onPress={() => router.push({ pathname: '/contacts/new', params: { id } })} hitSlop={10}>
              <Text style={{ fontSize: font.md, fontWeight: '700', color: colors.primary }}>{t.edit}</Text>
            </Pressable>
          ),
        }}
      />

      <View style={[styles.card, { alignItems: 'center', paddingVertical: 24, gap: 10 }]}>
        <Avatar name={person.name} size={72} />
        <Text style={{ fontSize: font.xl, fontWeight: '800', color: colors.text, textAlign: 'center' }}>{person.name}</Text>
        <Text style={styles.muted}>{contactTypeLabel(t, person)}</Text>
        <View style={{ alignSelf: 'stretch', gap: 8, marginTop: 6 }}>
          {balanceRows.length ? (
            balanceRows.map((b) => (
              <View key={b.label} style={{ backgroundColor: b.bg, borderRadius: radius.md, padding: 14, alignItems: 'center' }}>
                <Text style={{ fontSize: font.sm, fontWeight: '600', color: b.color }}>{b.label}</Text>
                <Text style={{ fontSize: font.xxl, fontWeight: '800', color: b.color }}>{formatMoney(b.amount, lang)}</Text>
              </View>
            ))
          ) : (
            <View style={{ backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: 14, alignItems: 'center' }}>
              <Text style={{ fontSize: font.lg, fontWeight: '700', color: colors.success }}>{t.allSettled}</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.row}>
        <Button label={main.label} style={{ flex: 1 }} onPress={main.go} />
        <Button label={t.payment} variant="success" style={{ flex: 1 }} onPress={() => router.push({ pathname: '/payment', params: { contactId: id } })} />
      </View>
      <View style={styles.row}>
        <Button label={t.check} variant="soft" style={{ flex: 1 }} onPress={() => router.push({ pathname: '/instruments/new', params: { contactId: id } })} />
        <Button label={t.statement} variant="secondary" style={{ flex: 1 }} onPress={askStatement} />
      </View>

      <SectionHeader title={t.operations} />
      {timeline.length === 0 ? <Empty title={t.emptyOpsTitle} text={t.emptyOpsText} /> : null}
      {timeline.map((row) => (
        <TimelineItem key={row.kind + row.id} row={row} onPress={() => router.push({ pathname: '/operation', params: { kind: row.kind, id: row.id } })} />
      ))}
    </Screen>
  );
}

function TimelineItem({ row, onPress }: { row: TimelineRow; onPress: () => void }) {
  const { t, lang } = useI18n();
  const dirColor = (d: Direction) => (d === 'PAYABLE' ? colors.danger : colors.success);
  /** Petite étiquette de catégorie au-dessus du titre (remplace les icônes). */
  let kindLabel: string;
  let title: string;
  let amountColor = colors.text;
  let subtitle: string | null = null;
  let footer: React.ReactNode = null;

  if (row.kind === 'I') {
    const type = row.sub as InstrumentType;
    if (type === 'CASH') {
      kindLabel = t.payment;
      title = t.paymentTitle[row.direction];
      amountColor = colors.success;
    } else {
      kindLabel = t.instrTypes[type];
      title = `${t.instrTypes[type]}${row.title ? ` n° ${row.title}` : ''}`;
      const pending = row.status === 'PENDING';
      footer = (
        <View style={[styles.row, { gap: 6 }]}>
          <Pill text={t.instrStatus[row.status as 'PENDING']} tone={pending ? 'warning' : row.status === 'CANCELLED' ? 'neutral' : 'success'} />
          {pending && row.due ? <Pill text={t.inDays(daysUntil(row.due))} tone={daysUntil(row.due) < 0 ? 'danger' : 'neutral'} /> : null}
        </View>
      );
    }
  } else {
    kindLabel = row.kind === 'P' ? t.work : t.txTypes[row.sub as TransactionType];
    title = row.kind === 'P' ? workTitle(t, row) : row.title || t.txTypes[row.sub as TransactionType];
    if (row.kind === 'P') subtitle = workDetail(t, row, lang);
    amountColor = dirColor(row.direction);
    const rest = row.amount - (row.paid ?? 0);
    footer = (
      <View style={[styles.row, { gap: 6, flexWrap: 'wrap' }]}>
        {rest > 0 ? <Pill text={t.restAmount(formatMoney(rest, lang))} tone={row.direction === 'PAYABLE' ? 'danger' : 'success'} /> : <Pill text={t.paid} tone="neutral" />}
        <LateBadge due={row.due} rest={rest} />
      </View>
    );
  }

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, { gap: 10 }, pressed && styles.pressed]}>
      <View style={styles.row}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontSize: font.xs, fontWeight: '600', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.4 }}>{kindLabel}</Text>
          <Text style={{ fontSize: font.md, fontWeight: '700', color: colors.text }} numberOfLines={2}>
            {title}
          </Text>
          {subtitle ? <Text style={[styles.muted, { color: colors.textSoft }]}>{subtitle}</Text> : null}
          <Text style={styles.muted}>
            {formatDate(row.d)}
            {row.photos ? `  ·  ${t.photoCount(row.photos)}` : ''}
          </Text>
        </View>
        <Text style={{ fontSize: font.md + 1, fontWeight: '800', color: amountColor }}>{formatMoney(row.amount, lang)}</Text>
      </View>
      {footer}
    </Pressable>
  );
}
