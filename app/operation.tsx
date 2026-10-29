import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { DIRECTION_COLORS, InfoRow, LateBadge } from '../src/components/domain';
import { InstrumentCard } from '../src/components/InstrumentCard';
import { PhotoProofs } from '../src/components/PhotoProofs';
import { Button, Card, Empty, Pill, Screen, styles } from '../src/components/ui';
import { deleteEntity, getContact, getInstrument, getPayroll, getTransaction, getTransactionItems, itemTotal, setInstrumentStatus } from '../src/db/repo';
import type { EntityType, InstrumentWithContact, PayrollEntry, Transaction, TransactionItem } from '../src/db/types';
import { useI18n } from '../src/i18n';
import { useAppState } from '../src/state';
import { colors, font } from '../src/theme';
import { formatDate } from '../src/utils/dates';
import { formatMoney } from '../src/utils/money';

type Loaded =
  | { kind: 'T'; tx: Transaction; items: TransactionItem[]; contactName: string }
  | { kind: 'P'; entry: PayrollEntry; contactName: string }
  | { kind: 'I'; inst: InstrumentWithContact }
  | { kind: 'missing' };

/** Détail d'une opération : montants, articles, retard, paiement, justificatifs, modifier, supprimer. */
export default function Operation() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { kind, id } = useLocalSearchParams<{ kind: EntityType; id: string }>();
  const { t, lang } = useI18n();
  const { version, refresh } = useAppState();
  const [data, setData] = useState<Loaded | null>(null);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        if (kind === 'T') {
          const tx = await getTransaction(db, id);
          if (!tx) return setData({ kind: 'missing' });
          setData({ kind: 'T', tx, items: await getTransactionItems(db, tx), contactName: (await getContact(db, tx.contact_id))?.name ?? '' });
        } else if (kind === 'P') {
          const entry = await getPayroll(db, id);
          if (!entry) return setData({ kind: 'missing' });
          setData({ kind: 'P', entry, contactName: (await getContact(db, entry.contact_id))?.name ?? '' });
        } else {
          const inst = await getInstrument(db, id);
          setData(inst ? { kind: 'I', inst } : { kind: 'missing' });
        }
      })();
    }, [db, kind, id, version]),
  );

  if (!data) return null;
  if (data.kind === 'missing') {
    return (
      <Screen>
        <Empty icon="🗑" title={t.deleted} />
      </Screen>
    );
  }

  const askDelete = () =>
    Alert.alert(t.deleteConfirm, '', [
      { text: t.cancel, style: 'cancel' },
      {
        text: t.delete,
        style: 'destructive',
        onPress: async () => {
          await deleteEntity(db, kind, id);
          refresh();
          router.back();
        },
      },
    ]);

  const editTarget =
    data.kind === 'T'
      ? { pathname: '/credit/new' as const, params: { id, contactId: data.tx.contact_id } }
      : data.kind === 'P'
        ? { pathname: '/payroll/edit' as const, params: { id } }
        : data.inst.instrument_type === 'CASH'
          ? { pathname: '/payment' as const, params: { id, contactId: data.inst.contact_id } }
          : { pathname: '/instruments/new' as const, params: { id, contactId: data.inst.contact_id } };

  const bottom = (
    <>
      <PhotoProofs entityType={kind} entityId={id} />
      <View style={styles.row}>
        <Button label={t.edit} variant="secondary" size="md" style={{ flex: 1 }} onPress={() => router.push(editTarget)} />
        <Button label={t.delete} variant="danger" size="md" style={{ flex: 1 }} onPress={askDelete} />
      </View>
    </>
  );

  if (data.kind === 'I') {
    const inst = data.inst;
    if (inst.instrument_type === 'CASH') {
      const c = DIRECTION_COLORS[inst.direction];
      return (
        <Screen>
          <Card style={{ alignItems: 'center', paddingVertical: 24 }}>
            <Text style={{ fontSize: 40 }}>💵</Text>
            <Text style={{ fontSize: font.md, fontWeight: '600', color: c.fg }}>{t.paymentTitle[inst.direction]}</Text>
            <Text style={{ fontSize: font.xxl, fontWeight: '800', color: colors.text }}>{formatMoney(inst.amount, lang)}</Text>
            <Text style={styles.muted}>
              {inst.contact_name} · {formatDate(inst.issue_date)}
            </Text>
          </Card>
          {bottom}
        </Screen>
      );
    }
    return (
      <Screen>
        <InstrumentCard
          inst={inst}
          onMarkPaid={(iid) => setInstrumentStatus(db, iid, 'DEBITED_PAID').then(() => refresh())}
          onCancel={(iid) => setInstrumentStatus(db, iid, 'CANCELLED').then(() => refresh())}
        />
        {bottom}
      </Screen>
    );
  }

  const direction = data.kind === 'T' ? data.tx.direction : 'PAYABLE';
  const total = data.kind === 'T' ? data.tx.total_amount : data.entry.total_due;
  const paid = data.kind === 'T' ? data.tx.paid_amount : data.entry.paid_amount;
  const date = data.kind === 'T' ? data.tx.transaction_date : data.entry.work_date;
  const due = data.kind === 'T' ? data.tx.due_date : null;
  const contactId = data.kind === 'T' ? data.tx.contact_id : data.entry.contact_id;
  const rest = total - paid;
  const c = DIRECTION_COLORS[direction];

  return (
    <Screen>
      <Card style={{ gap: 12 }}>
        <View style={[styles.row, { gap: 6 }]}>
          <Pill text={data.kind === 'T' ? t.txTitle[direction] : t.payroll} tone={direction === 'PAYABLE' ? 'danger' : 'success'} />
          <LateBadge due={due} rest={rest} />
        </View>
        <Text style={{ fontSize: font.lg, fontWeight: '800', color: colors.text }}>{data.contactName}</Text>
        <Text style={styles.muted}>
          📅 {formatDate(date)}
          {due ? `   ·   ⏳ ${formatDate(due)}` : ''}
        </Text>

        {data.kind === 'T' ? (
          <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 }}>
            {data.items.map((item, index) => (
              <View key={index} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: font.md, fontWeight: '600', color: colors.text }}>{item.name}</Text>
                  <Text style={styles.muted}>
                    {item.quantity} × {formatMoney(item.unit_price, lang)}
                  </Text>
                </View>
                <Text style={{ fontSize: font.md, fontWeight: '700', color: colors.text }}>{formatMoney(itemTotal(item), lang)}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={[styles.body, { fontWeight: '600' }]}>
            {t.wageLabel(t.workTypes[data.entry.work_type], data.entry.days_worked, formatMoney(data.entry.daily_rate, lang))}
          </Text>
        )}

        <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 }}>
          <InfoRow label={t.totalLabel} value={formatMoney(total, lang)} />
          <InfoRow label={t.paidLabel} value={formatMoney(paid, lang)} color={colors.success} />
          <InfoRow label={t.restLabel} value={rest > 0 ? formatMoney(rest, lang) : '✓'} color={rest > 0 ? c.fg : colors.success} />
        </View>
      </Card>

      {rest > 0 ? (
        <Button
          label={t.recordPayment}
          variant="success"
          onPress={() => router.push({ pathname: '/payment', params: { contactId, direction, kind: data.kind, itemId: id } })}
        />
      ) : null}
      {bottom}
    </Screen>
  );
}
