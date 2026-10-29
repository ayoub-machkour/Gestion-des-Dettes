import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { InstrumentCard } from '../../src/components/InstrumentCard';
import { BigButton, Btn, Card, Empty, Screen, SectionTitle, styles } from '../../src/components/ui';
import { cancelInstrument, deleteContact, deleteLedgerItem, getContact, getLedger, listInstruments, markInstrumentPaid } from '../../src/db/repo';
import type { ContactWithBalance, InstrumentWithContact, LedgerRow, TransactionType, WorkType } from '../../src/db/types';
import { useI18n } from '../../src/i18n';
import { colors, font } from '../../src/theme';
import { formatDate } from '../../src/utils/dates';
import { formatMoney } from '../../src/utils/money';

export default function ContactSheet() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang } = useI18n();
  const [contact, setContact] = useState<ContactWithBalance | null>(null);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [instruments, setInstruments] = useState<InstrumentWithContact[]>([]);

  const load = useCallback(() => {
    getContact(db, id).then(setContact);
    getLedger(db, id).then(setLedger);
    listInstruments(db, { contactId: id }).then(setInstruments);
  }, [db, id]);

  useFocusEffect(load);

  if (!contact) return null;

  const money = (c: number) => formatMoney(c, lang).replace(/ (DH|درهم)$/, '');
  const rowLabel = (r: LedgerRow) =>
    r.kind === 'T'
      ? r.label || t.txTypes[r.sub as TransactionType]
      : t.wageLabel(t.workTypes[r.sub as WorkType], r.days ?? 0, money(r.rate ?? 0));
  const totals = ledger.reduce((acc, r) => ({ total: acc.total + r.total, paid: acc.paid + r.paid }), { total: 0, paid: 0 });

  const askDeleteRow = (r: LedgerRow) =>
    Alert.alert(t.deleteConfirm, rowLabel(r), [
      { text: t.cancel, style: 'cancel' },
      { text: t.delete, style: 'destructive', onPress: () => deleteLedgerItem(db, r.kind, r.id).then(load) },
    ]);

  const askDeleteContact = () =>
    Alert.alert(t.deleteContactConfirm, contact.name, [
      { text: t.cancel, style: 'cancel' },
      { text: t.delete, style: 'destructive', onPress: () => deleteContact(db, contact.id).then(() => router.back()) },
    ]);

  return (
    <Screen>
      <Stack.Screen options={{ title: contact.name }} />

      <Card style={{ borderColor: contact.balance > 0 ? colors.danger : colors.success, borderWidth: 2 }}>
        <Text style={styles.muted}>
          {t.contactTypes[contact.type]}
          {contact.phone ? ` · ${contact.phone}` : ''}
        </Text>
        <Text style={{ fontSize: font.md, fontWeight: '700', color: colors.muted }}>{t.balance}</Text>
        <Text style={{ fontSize: font.xl + 6, fontWeight: '900', color: contact.balance > 0 ? colors.danger : colors.success }}>
          {formatMoney(contact.balance, lang)}
        </Text>
        {contact.notes ? <Text style={styles.body}>{contact.notes}</Text> : null}
      </Card>

      {contact.balance > 0 ? (
        <BigButton label={`💵 ${t.pay}`} color={colors.success} onPress={() => router.push({ pathname: '/payment', params: { contactId: contact.id } })} />
      ) : null}
      <View style={styles.row}>
        <Btn label={t.actionCredit} variant="earth" style={{ flex: 1 }} onPress={() => router.push({ pathname: '/credit/new', params: { contactId: contact.id } })} />
      </View>
      <View style={styles.row}>
        <Btn label={t.actionInstrument} variant="outline" style={{ flex: 1 }} onPress={() => router.push({ pathname: '/instruments/new', params: { contactId: contact.id } })} />
        {contact.phone ? <Btn label={t.call} variant="outline" onPress={() => Linking.openURL(`tel:${contact.phone}`)} /> : null}
      </View>

      <SectionTitle>{t.ledger}</SectionTitle>
      {ledger.length === 0 ? (
        <Empty text={t.emptyLedger} />
      ) : (
        <View style={table.wrap}>
          <View style={[table.row, table.head]}>
            <Text style={[table.cell, table.date, table.headText]}>{t.colDate}</Text>
            <Text style={[table.cell, table.desc, table.headText]}>{t.colDesc}</Text>
            <Text style={[table.cell, table.num, table.headText]}>{t.colAmount}</Text>
            <Text style={[table.cell, table.num, table.headText]}>{t.colPaid}</Text>
            <Text style={[table.cell, table.num, table.headText]}>{t.colRest}</Text>
          </View>
          {ledger.map((r) => {
            const rest = r.total - r.paid;
            return (
              <Pressable
                key={r.kind + r.id}
                onPress={() =>
                  rest > 0 && router.push({ pathname: '/payment', params: { contactId: contact.id, kind: r.kind, itemId: r.id } })
                }
                onLongPress={() => askDeleteRow(r)}
                style={({ pressed }) => [table.row, pressed && { backgroundColor: colors.oliveLight }]}
              >
                <Text style={[table.cell, table.date]}>{formatDate(r.d).slice(0, 5)}</Text>
                <Text style={[table.cell, table.desc]} numberOfLines={2}>
                  {rowLabel(r)}
                </Text>
                <Text style={[table.cell, table.num]}>{money(r.total)}</Text>
                <Text style={[table.cell, table.num, { color: colors.success }]}>{money(r.paid)}</Text>
                <Text style={[table.cell, table.num, { color: rest > 0 ? colors.danger : colors.success, fontWeight: '800' }]}>
                  {rest > 0 ? money(rest) : '✓'}
                </Text>
              </Pressable>
            );
          })}
          <View style={[table.row, table.head]}>
            <Text style={[table.cell, table.date, table.headText]} />
            <Text style={[table.cell, table.desc, table.headText]}>{t.total}</Text>
            <Text style={[table.cell, table.num, table.headText]}>{money(totals.total)}</Text>
            <Text style={[table.cell, table.num, table.headText]}>{money(totals.paid)}</Text>
            <Text style={[table.cell, table.num, table.headText]}>{money(totals.total - totals.paid)}</Text>
          </View>
        </View>
      )}
      {ledger.length ? <Text style={[styles.muted, { textAlign: 'center' }]}>{t.ledgerHint}</Text> : null}

      {instruments.length ? <SectionTitle>{t.paymentsAndInstruments}</SectionTitle> : null}
      {instruments.map((i) => (
        <InstrumentCard
          key={i.id}
          inst={i}
          showContact={false}
          onMarkPaid={(iid) => markInstrumentPaid(db, iid).then(load)}
          onCancel={(iid) => cancelInstrument(db, iid).then(load)}
        />
      ))}

      <View style={[styles.row, { marginTop: 16 }]}>
        <Btn label={t.edit} variant="outline" style={{ flex: 1 }} onPress={() => router.push({ pathname: '/contacts/new', params: { id: contact.id } })} />
        <Btn label={t.delete} variant="danger" style={{ flex: 1 }} onPress={askDeleteContact} />
      </View>
    </Screen>
  );
}

const table = StyleSheet.create({
  wrap: { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 48, borderBottomWidth: 1, borderBottomColor: colors.border, paddingHorizontal: 6 },
  head: { backgroundColor: colors.earthLight },
  headText: { fontWeight: '800', color: colors.earth },
  cell: { fontSize: font.sm - 1, color: colors.text, paddingHorizontal: 3 },
  date: { flex: 1 },
  desc: { flex: 2.2 },
  num: { flex: 1.3, textAlign: 'right' },
});
