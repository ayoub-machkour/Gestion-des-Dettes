import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { ContactPicker } from '../../src/components/ContactPicker';
import { DirectionToggle } from '../../src/components/domain';
import { Btn, Chips, DateField, Field, Label, Screen, styles } from '../../src/components/ui';
import { getInstrument, listOpenItems, saveInstrument } from '../../src/db/repo';
import type { Direction, InstrumentType, LedgerRow } from '../../src/db/types';
import { useI18n } from '../../src/i18n';
import { useAppState } from '../../src/state';
import { rowLabel } from '../../src/statement';
import { addDays, today } from '../../src/utils/dates';
import { centsToInput, formatMoney, parseMoney } from '../../src/utils/money';

const TYPES: InstrumentType[] = ['BILL_OF_EXCHANGE', 'BANK_CHECK', 'PROMISSORY_NOTE', 'CASH'];
const REMINDERS = [1, 3, 7, 15];

/** Nouvel effet (chèque, traite, billet) ou modification d'un effet / versement (?id=). */
export default function InstrumentForm() {
  const db = useSQLiteContext();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; contactId?: string; transactionId?: string; direction?: Direction }>();
  const { t, lang } = useI18n();
  const { done } = useAppState();
  const [direction, setDirection] = useState<Direction>(params.direction ?? 'PAYABLE');
  const [contactId, setContactId] = useState<string | null>(params.contactId ?? null);
  const [type, setType] = useState<InstrumentType>('BILL_OF_EXCHANGE');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [issueDate, setIssueDate] = useState<string | null>(today());
  const [maturity, setMaturity] = useState<string | null>(addDays(today(), 30));
  const [reminderDays, setReminderDays] = useState(3);
  const [target, setTarget] = useState<string | null>(params.transactionId ? `T${params.transactionId}` : null);
  const [openItems, setOpenItems] = useState<LedgerRow[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!params.id) return;
    getInstrument(db, params.id).then((i) => {
      if (!i) return;
      setDirection(i.direction);
      setContactId(i.contact_id);
      setType(i.instrument_type);
      setAmount(centsToInput(i.amount));
      setReference(i.reference_number ?? '');
      setIssueDate(i.issue_date);
      setMaturity(i.maturity_due_date);
      setReminderDays(i.reminder_days_before || 3);
      setTarget(i.transaction_id ? `T${i.transaction_id}` : i.payroll_entry_id ? `P${i.payroll_entry_id}` : null);
    });
  }, [db, params.id]);

  useEffect(() => {
    if (!contactId) return setOpenItems([]);
    listOpenItems(db, contactId, direction).then(setOpenItems);
  }, [db, contactId, direction]);

  const pickTarget = (key: string) => {
    const next = key === target ? null : key;
    setTarget(next);
    const item = openItems.find((r) => r.kind + r.id === next);
    if (item && !amount) setAmount(centsToInput(item.total - item.paid));
  };

  const submit = async () => {
    const e: Record<string, string> = {};
    const cents = parseMoney(amount);
    if (!contactId) e.contact = t.required;
    if (!cents) e.amount = t.invalidAmount;
    if (!maturity && type !== 'CASH') e.maturity = t.required;
    setErrors(e);
    if (Object.keys(e).length || !contactId || !cents) return;

    setSaving(true);
    try {
      await saveInstrument(
        db,
        {
          contactId,
          direction,
          transactionId: target?.startsWith('T') ? target.slice(1) : null,
          payrollEntryId: target?.startsWith('P') ? target.slice(1) : null,
          type,
          amount: cents,
          issueDate: issueDate ?? today(),
          maturityDate: maturity ?? today(),
          reference,
          reminderDays,
        },
        params.id,
      );
      done(undefined, type !== 'CASH');
      router.back();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      {params.id ? <Stack.Screen options={{ title: t.editInstrument }} /> : null}
      <DirectionToggle value={direction} onChange={(d) => (setDirection(d), setTarget(null))} labels={t.instrDirection} subtitles={null} />
      <ContactPicker value={contactId} onChange={(id) => (setContactId(id), setTarget(null))} error={errors.contact} />
      <View style={styles.field}>
        <Label>{t.type}</Label>
        <Chips options={TYPES.map((v) => ({ value: v, label: t.instrTypes[v] }))} value={type} onChange={setType} />
      </View>
      {openItems.length ? (
        <View style={styles.field}>
          <Label>{t.linkTransaction}</Label>
          <Chips
            options={openItems.map((r) => ({ value: r.kind + r.id, label: `${rowLabel(t, r, lang)} · ${formatMoney(r.total - r.paid, lang)}` }))}
            value={target}
            onChange={pickTarget}
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
      ) : (
        <DateField label={t.date} value={issueDate} onChange={setIssueDate} />
      )}
      <Btn label={t.save} onPress={submit} disabled={saving} />
    </Screen>
  );
}
