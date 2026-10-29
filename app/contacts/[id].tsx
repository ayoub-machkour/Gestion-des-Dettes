import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { DIRECTION_COLORS, LateBadge } from '../../src/components/domain';
import { InstrumentCard } from '../../src/components/InstrumentCard';
import { BigButton, Btn, Card, Empty, Screen, SectionTitle, styles } from '../../src/components/ui';
import { deleteContact, getContact, getLedger, listInstruments, setInstrumentStatus } from '../../src/db/repo';
import type { ContactWithBalance, Direction, InstrumentWithContact, LedgerRow } from '../../src/db/types';
import { useI18n } from '../../src/i18n';
import { useAppState } from '../../src/state';
import { rowLabel, sendStatementWhatsApp, shareStatementPdf } from '../../src/statement';
import { colors, font } from '../../src/theme';
import { formatDate } from '../../src/utils/dates';
import { formatMoney } from '../../src/utils/money';

export default function ContactSheet() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang } = useI18n();
  const { version, done } = useAppState();
  const [contact, setContact] = useState<ContactWithBalance | null>(null);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [instruments, setInstruments] = useState<InstrumentWithContact[]>([]);

  useFocusEffect(
    useCallback(() => {
      getContact(db, id).then(setContact);
      getLedger(db, id).then(setLedger);
      listInstruments(db, { contactId: id }).then((list) => setInstruments(list.reverse()));
    }, [db, id, version]),
  );

  if (!contact) return null;

  const money = (c: number) => formatMoney(c, lang).replace(/ (DH|درهم)$/, '');
  const statement = { contact, ledger, payments: instruments };

  const askStatement = () =>
    Alert.alert(t.statementTitle, contact.name, [
      { text: t.cancel, style: 'cancel' },
      { text: t.statementText, onPress: () => sendStatementWhatsApp(statement, t, lang) },
      { text: t.statementPdf, onPress: () => shareStatementPdf(statement, t, lang) },
    ]);

  const askDeleteContact = () =>
    Alert.alert(t.deleteContactConfirm, contact.name, [
      { text: t.cancel, style: 'cancel' },
      {
        text: t.delete,
        style: 'destructive',
        onPress: async () => {
          await deleteContact(db, contact.id);
          done(t.deleted);
          router.back();
        },
      },
    ]);

  const balanceLine = (direction: Direction, amount: number) => {
    const c = DIRECTION_COLORS[direction];
    const label = direction === 'PAYABLE' ? t.iOweHim : t.heOwesMe;
    return (
      <View style={[styles.row, { backgroundColor: c.bg, borderRadius: 10, padding: 10 }]}>
        <Text style={{ flex: 1, fontSize: font.md, fontWeight: '800', color: c.fg }}>
          {c.dot} {amount < 0 ? t.advance : label}
        </Text>
        <Text style={{ fontSize: font.xl, fontWeight: '900', color: c.fg }}>{formatMoney(Math.abs(amount), lang)}</Text>
      </View>
    );
  };

  const table = (direction: Direction) => {
    const rows = ledger.filter((r) => r.direction === direction);
    if (!rows.length) return null;
    const totals = rows.reduce((acc, r) => ({ total: acc.total + r.total, paid: acc.paid + r.paid }), { total: 0, paid: 0 });
    const c = DIRECTION_COLORS[direction];
    return (
      <>
        <SectionTitle>
          {c.dot} {direction === 'PAYABLE' ? t.iOweHim : t.heOwesMe}
        </SectionTitle>
        <View style={tbl.wrap}>
          <View style={[tbl.row, tbl.head]}>
            <Text style={[tbl.cell, tbl.date, tbl.headText]}>{t.colDate}</Text>
            <Text style={[tbl.cell, tbl.desc, tbl.headText]}>{t.colDesc}</Text>
            <Text style={[tbl.cell, tbl.num, tbl.headText]}>{t.colAmount}</Text>
            <Text style={[tbl.cell, tbl.num, tbl.headText]}>{t.colPaid}</Text>
            <Text style={[tbl.cell, tbl.num, tbl.headText]}>{t.colRest}</Text>
          </View>
          {rows.map((r) => {
            const rest = r.total - r.paid;
            return (
              <Pressable
                key={r.kind + r.id}
                onPress={() => router.push({ pathname: '/operation', params: { kind: r.kind, id: r.id } })}
                style={({ pressed }) => [tbl.row, pressed && { backgroundColor: colors.oliveLight }]}
              >
                <Text style={[tbl.cell, tbl.date]}>{formatDate(r.d).slice(0, 5)}</Text>
                <View style={[tbl.desc, { paddingVertical: 6, gap: 3 }]}>
                  <Text style={tbl.cell} numberOfLines={2}>
                    {rowLabel(t, r, lang)}
                    {r.photos ? ' 📷' : ''}
                  </Text>
                  <LateBadge due={r.due} date={r.d} rest={rest} compact />
                </View>
                <Text style={[tbl.cell, tbl.num]}>{money(r.total)}</Text>
                <Text style={[tbl.cell, tbl.num, { color: colors.success }]}>{money(r.paid)}</Text>
                <Text style={[tbl.cell, tbl.num, { color: rest > 0 ? c.fg : colors.success, fontWeight: '800' }]}>{rest > 0 ? money(rest) : '✓'}</Text>
              </Pressable>
            );
          })}
          <View style={[tbl.row, tbl.head]}>
            <Text style={[tbl.cell, tbl.date]} />
            <Text style={[tbl.cell, tbl.desc, tbl.headText]}>{t.total}</Text>
            <Text style={[tbl.cell, tbl.num, tbl.headText]}>{money(totals.total)}</Text>
            <Text style={[tbl.cell, tbl.num, tbl.headText]}>{money(totals.paid)}</Text>
            <Text style={[tbl.cell, tbl.num, tbl.headText]}>{money(totals.total - totals.paid)}</Text>
          </View>
        </View>
      </>
    );
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: contact.name }} />

      <Card>
        <Text style={styles.muted}>
          {t.contactTypes[contact.type]}
          {contact.phone ? ` · ${contact.phone}` : ''}
        </Text>
        {contact.payable !== 0 ? balanceLine('PAYABLE', contact.payable) : null}
        {contact.receivable !== 0 ? balanceLine('RECEIVABLE', contact.receivable) : null}
        {contact.payable === 0 && contact.receivable === 0 ? (
          <Text style={{ fontSize: font.lg, fontWeight: '900', color: colors.success }}>✓ 0</Text>
        ) : null}
        {contact.notes ? <Text style={styles.body}>{contact.notes}</Text> : null}
      </Card>

      {contact.payable > 0 ? (
        <BigButton
          label={t.payDirection.PAYABLE}
          color={colors.danger}
          onPress={() => router.push({ pathname: '/payment', params: { contactId: contact.id, direction: 'PAYABLE' } })}
        />
      ) : null}
      {contact.receivable > 0 ? (
        <BigButton
          label={t.payDirection.RECEIVABLE}
          color={colors.success}
          onPress={() => router.push({ pathname: '/payment', params: { contactId: contact.id, direction: 'RECEIVABLE' } })}
        />
      ) : null}
      <View style={styles.row}>
        <Btn label={t.actionCredit} variant="earth" style={{ flex: 1 }} onPress={() => router.push({ pathname: '/credit/new', params: { contactId: contact.id } })} />
      </View>
      <View style={styles.row}>
        <Btn label={t.actionInstrument} variant="outline" style={{ flex: 1 }} onPress={() => router.push({ pathname: '/instruments/new', params: { contactId: contact.id } })} />
      </View>
      <View style={styles.row}>
        <Btn label={t.sendStatement} variant="outline" style={{ flex: 1 }} onPress={askStatement} />
        {contact.phone ? <Btn label={t.call} variant="outline" onPress={() => Linking.openURL(`tel:${contact.phone}`)} /> : null}
      </View>
      <Btn label={t.fullHistory} variant="outline" onPress={() => router.push({ pathname: '/history', params: { contactId: contact.id } })} />

      {ledger.length === 0 ? <Empty text={t.emptyLedger} /> : null}
      {table('PAYABLE')}
      {table('RECEIVABLE')}
      {ledger.length ? <Text style={[styles.muted, { textAlign: 'center' }]}>{t.ledgerHint}</Text> : null}

      {instruments.length ? <SectionTitle>{t.paymentsAndInstruments}</SectionTitle> : null}
      {instruments.map((i) => (
        <InstrumentCard
          key={i.id}
          inst={i}
          showContact={false}
          onPress={() => router.push({ pathname: '/operation', params: { kind: 'I', id: i.id } })}
          onMarkPaid={(iid) => setInstrumentStatus(db, iid, 'DEBITED_PAID').then(() => done())}
          onCancel={(iid) => setInstrumentStatus(db, iid, 'CANCELLED').then(() => done())}
        />
      ))}

      <View style={[styles.row, { marginTop: 16 }]}>
        <Btn label={t.edit} variant="outline" style={{ flex: 1 }} onPress={() => router.push({ pathname: '/contacts/new', params: { id: contact.id } })} />
        <Btn label={t.delete} variant="danger" style={{ flex: 1 }} onPress={askDeleteContact} />
      </View>
    </Screen>
  );
}

const tbl = StyleSheet.create({
  wrap: { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 52, borderBottomWidth: 1, borderBottomColor: colors.border, paddingHorizontal: 6 },
  head: { backgroundColor: colors.earthLight },
  headText: { fontWeight: '800', color: colors.earth },
  cell: { fontSize: font.sm - 1, color: colors.text, paddingHorizontal: 3 },
  date: { flex: 1 },
  desc: { flex: 2.4 },
  num: { flex: 1.3, textAlign: 'right' },
});
