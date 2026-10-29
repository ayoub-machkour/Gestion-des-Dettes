import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { ContactPicker } from '../../src/components/ContactPicker';
import { Btn, Chips, DateField, Field, Label, Screen, styles } from '../../src/components/ui';
import { createInstrument, listUnpaidTransactions } from '../../src/db/repo';
import type { InstrumentType, Transaction } from '../../src/db/types';
import { useI18n } from '../../src/i18n';
import { addDays, today } from '../../src/utils/dates';
import { centsToInput, formatMoney, parseMoney } from '../../src/utils/money';

const TYPES: InstrumentType[] = ['BILL_OF_EXCHANGE', 'BANK_CHECK', 'PROMISSORY_NOTE', 'CASH'];
const REMINDERS = [1, 3, 7, 15];

export default function NewInstrument() {
  const db = useSQLiteContext();
  const router = useRouter();
  const params = useLocalSearchParams<{ contactId?: string; transactionId?: string }>();
  const { t, lang } = useI18n();
  const [contactId, setContactId] = useState<string | null>(params.contactId ?? null);
  const [type, setType] = useState<InstrumentType>('BILL_OF_EXCHANGE');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [issueDate, setIssueDate] = useState<string | null>(today());
  const [maturity, setMaturity] = useState<string | null>(addDays(today(), 30));
  const [reminderDays, setReminderDays] = useState(3);
  const [transactionId, setTransactionId] = useState<string | null>(params.transactionId ?? null);
  const [unpaid, setUnpaid] = useState<Transaction[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!contactId) return setUnpaid([]);
    listUnpaidTransactions(db, contactId).then(setUnpaid);
  }, [db, contactId]);

  const pickTransaction = (id: string) => {
    const next = id === transactionId ? null : id;
    setTransactionId(next);
    const tx = unpaid.find((u) => u.id === next);
    if (tx && !amount) setAmount(centsToInput(tx.total_amount - tx.paid_amount));
  };

  const submit = async () => {
    const e: Record<string, string> = {};
    const cents = parseMoney(amount);
    if (!contactId) e.contact = t.required;
    if (!cents) e.amount = t.invalidAmount;
    if (!maturity) e.maturity = t.required;
    setErrors(e);
    if (Object.keys(e).length || !contactId || !cents || !maturity) return;

    setSaving(true);
    try {
      await createInstrument(
        db,
        {
          contactId,
          transactionId,
          type,
          amount: cents,
          issueDate: issueDate ?? today(),
          maturityDate: type === 'CASH' ? today() : maturity,
          reference,
          reminderDays,
        },
        lang,
      );
      router.back();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <ContactPicker value={contactId} onChange={(id) => (setContactId(id), setTransactionId(null))} error={errors.contact} />
      <View style={styles.field}>
        <Label>{t.type}</Label>
        <Chips options={TYPES.map((v) => ({ value: v, label: t.instrTypes[v] }))} value={type} onChange={setType} />
      </View>
      {unpaid.length ? (
        <View style={styles.field}>
          <Label>{t.linkTransaction}</Label>
          <Chips
            options={unpaid.map((u) => ({ value: u.id, label: `${u.description} · ${formatMoney(u.total_amount - u.paid_amount, lang)}` }))}
            value={transactionId}
            onChange={pickTransaction}
          />
        </View>
      ) : null}
      <Field label={t.amount} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0" error={errors.amount} />
      {type !== 'CASH' ? (
        <>
          <Field label={t.reference} value={reference} onChangeText={setReference} placeholder="0001234" />
          <DateField label={t.issueDate} value={issueDate} onChange={setIssueDate} />
          <DateField label={t.maturityDate} value={maturity} onChange={setMaturity} />
          <View style={styles.field}>
            <Label>🔔 {t.reminder}</Label>
            <Chips options={REMINDERS.map((n) => ({ value: n, label: t.daysBefore(n) }))} value={reminderDays} onChange={setReminderDays} />
          </View>
        </>
      ) : null}
      <Btn label={t.save} onPress={submit} disabled={saving} />
    </Screen>
  );
}
