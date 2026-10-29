import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { DIRECTION_COLORS, LateBadge } from '../src/components/domain';
import { InstrumentCard } from '../src/components/InstrumentCard';
import { PhotoProofs } from '../src/components/PhotoProofs';
import { BigButton, Btn, Card, Empty, Screen, styles } from '../src/components/ui';
import { deleteEntity, getContact, getInstrument, getPayroll, getTransaction, setInstrumentStatus } from '../src/db/repo';
import type { Direction, EntityType, InstrumentWithContact, PayrollEntry, Transaction } from '../src/db/types';
import { useI18n } from '../src/i18n';
import { useAppState } from '../src/state';
import { colors, font } from '../src/theme';
import { formatDate } from '../src/utils/dates';
import { formatMoney } from '../src/utils/money';

type Loaded =
  | { kind: 'T'; tx: Transaction; contactName: string }
  | { kind: 'P'; entry: PayrollEntry; contactName: string }
  | { kind: 'I'; inst: InstrumentWithContact }
  | { kind: 'missing' };

/** Détail d'une opération : infos, compteur de retard, photos, payer, modifier, supprimer. */
export default function Operation() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { kind, id } = useLocalSearchParams<{ kind: EntityType; id: string }>();
  const { t, lang } = useI18n();
  const { version, done } = useAppState();
  const [data, setData] = useState<Loaded | null>(null);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        if (kind === 'T') {
          const tx = await getTransaction(db, id);
          if (!tx) return setData({ kind: 'missing' });
          setData({ kind: 'T', tx, contactName: (await getContact(db, tx.contact_id))?.name ?? '' });
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
        <Empty text={t.deleted} />
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
          done(t.deleted);
          router.back();
        },
      },
    ]);

  const editPath = { T: '/credit/new', P: '/payroll/edit', I: '/instruments/new' }[kind] as '/credit/new' | '/payroll/edit' | '/instruments/new';
  const actions = (
    <>
      <PhotoProofs entityType={kind} entityId={id} />
      <View style={styles.row}>
        <Btn label={t.edit} variant="outline" style={{ flex: 1 }} onPress={() => router.push({ pathname: editPath, params: { id } })} />
        <Btn label={t.delete} variant="danger" style={{ flex: 1 }} onPress={askDelete} />
      </View>
    </>
  );

  if (data.kind === 'I') {
    return (
      <Screen>
        <InstrumentCard
          inst={data.inst}
          onPress={() => router.push(`/contacts/${data.inst.contact_id}`)}
          onMarkPaid={(iid) => setInstrumentStatus(db, iid, 'DEBITED_PAID').then(() => done())}
          onCancel={(iid) => setInstrumentStatus(db, iid, 'CANCELLED').then(() => done())}
        />
        {actions}
      </Screen>
    );
  }

  const direction: Direction = data.kind === 'T' ? data.tx.direction : 'PAYABLE';
  const total = data.kind === 'T' ? data.tx.total_amount : data.entry.total_due;
  const paid = data.kind === 'T' ? data.tx.paid_amount : data.entry.paid_amount;
  const date = data.kind === 'T' ? data.tx.transaction_date : data.entry.work_date;
  const due = data.kind === 'T' ? data.tx.due_date : null;
  const crop = data.kind === 'T' ? data.tx.crop : data.entry.crop;
  const contactId = data.kind === 'T' ? data.tx.contact_id : data.entry.contact_id;
  const rest = total - paid;
  const c = DIRECTION_COLORS[direction];
  const title =
    data.kind === 'T'
      ? data.tx.description || t.txTypes[data.tx.transaction_type]
      : t.wageLabel(t.workTypes[data.entry.work_type], data.entry.days_worked, formatMoney(data.entry.daily_rate, lang));

  return (
    <Screen>
      <Card style={{ borderStartWidth: 8, borderStartColor: c.fg }}>
        <Text style={{ fontSize: font.sm + 1, fontWeight: '800', color: c.fg }}>
          {c.dot} {direction === 'PAYABLE' ? t.iOweHim : t.heOwesMe} · {data.kind === 'T' ? t.txTypes[data.tx.transaction_type] : t.payroll}
        </Text>
        <Text style={{ fontSize: font.lg, fontWeight: '900', color: colors.text }}>{title}</Text>
        <Text style={[styles.body, { color: colors.olive, fontWeight: '700' }]} onPress={() => router.push(`/contacts/${contactId}`)}>
          👤 {data.contactName}
        </Text>
        <Text style={styles.muted}>
          📅 {formatDate(date)}
          {due ? `  ·  ⏳ ${formatDate(due)}` : ''}
          {crop ? `  ·  ${t.cropsList[crop]}` : ''}
        </Text>
        <LateBadge due={due} date={date} rest={rest} />
        <View style={[styles.row, { marginTop: 8 }]}>
          <Amount label={t.colAmount} value={formatMoney(total, lang)} color={colors.text} />
          <Amount label={t.colPaid} value={formatMoney(paid, lang)} color={colors.success} />
          <Amount label={t.colRest} value={rest > 0 ? formatMoney(rest, lang) : '✓'} color={rest > 0 ? c.fg : colors.success} />
        </View>
      </Card>

      {rest > 0 ? (
        <BigButton
          label={t.payDirection[direction]}
          color={c.fg}
          onPress={() => router.push({ pathname: '/payment', params: { contactId, direction, kind: data.kind, itemId: id } })}
        />
      ) : null}
      {rest > 0 && data.kind === 'T' ? (
        <Btn
          label={t.actionInstrument}
          variant="outline"
          onPress={() => router.push({ pathname: '/instruments/new', params: { contactId, direction, transactionId: id } })}
        />
      ) : null}
      {actions}
    </Screen>
  );
}

function Amount({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.muted}>{label}</Text>
      <Text style={{ fontSize: font.md, fontWeight: '900', color }} adjustsFontSizeToFit numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}
