import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { DirectionSegment, PhotoPicker } from '../../src/components/domain';
import { PersonHeader } from '../../src/components/PersonHeader';
import { Button, Chips, DateField, Field, Label, Screen, styles } from '../../src/components/ui';
import { getInstrument, saveInstrument } from '../../src/db/repo';
import type { Direction, InstrumentType } from '../../src/db/types';
import { useI18n } from '../../src/i18n';
import { useAppState } from '../../src/state';
import { addDays, today } from '../../src/utils/dates';
import { centsToInput, parseMoney } from '../../src/utils/money';

const TYPES: InstrumentType[] = ['BANK_CHECK', 'BILL_OF_EXCHANGE', 'PROMISSORY_NOTE'];
const REMINDERS = [1, 3, 7];

/** Chèque, traite ou billet à ordre (donné ou reçu) ; modification si ?id= est fourni. */
export default function InstrumentForm() {
  const db = useSQLiteContext();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; contactId: string }>();
  const { t } = useI18n();
  const { refresh } = useAppState();
  const [contactId, setContactId] = useState(params.contactId);
  const [direction, setDirection] = useState<Direction>('PAYABLE');
  const [type, setType] = useState<InstrumentType>('BANK_CHECK');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [maturity, setMaturity] = useState<string | null>(addDays(today(), 30));
  const [reminderDays, setReminderDays] = useState(3);
  const [issueDate, setIssueDate] = useState(today());
  const [photos, setPhotos] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!params.id) return;
    getInstrument(db, params.id).then((i) => {
      if (!i) return;
      setContactId(i.contact_id);
      setDirection(i.direction);
      setType(i.instrument_type === 'CASH' ? 'BANK_CHECK' : i.instrument_type);
      setAmount(centsToInput(i.amount));
      setReference(i.reference_number ?? '');
      setMaturity(i.maturity_due_date);
      setReminderDays(i.reminder_days_before || 3);
      setIssueDate(i.issue_date);
    });
  }, [db, params.id]);

  const submit = async () => {
    const e: Record<string, string> = {};
    const cents = parseMoney(amount);
    if (!cents) e.amount = t.invalidAmount;
    if (!maturity) e.maturity = t.required;
    setErrors(e);
    if (Object.keys(e).length || !cents || !maturity) return;
    setSaving(true);
    try {
      await saveInstrument(
        db,
        {
          contactId,
          direction,
          transactionId: null,
          payrollEntryId: null,
          type,
          amount: cents,
          issueDate,
          maturityDate: maturity,
          reference,
          reminderDays,
          photos,
        },
        params.id,
      );
      refresh(true);
      router.back();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen footer={<Button label={t.save} onPress={submit} disabled={saving} />}>
      {params.id ? <Stack.Screen options={{ title: t.editInstrument }} /> : null}
      <PersonHeader contactId={contactId} onLoad={(c) => !params.id && c.type === 'CUSTOMER' && setDirection('RECEIVABLE')} />
      <DirectionSegment value={direction} onChange={setDirection} labels={t.instrDirection} />
      <View style={styles.field}>
        <Label>{t.type}</Label>
        <Chips options={TYPES.map((v) => ({ value: v, label: t.instrTypes[v] }))} value={type} onChange={(v) => v && setType(v)} />
      </View>
      <Field label={t.amount} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0" error={errors.amount} style={{ fontSize: 22, fontWeight: '800' }} />
      <DateField label={t.maturityDate} value={maturity} onChange={setMaturity} />
      <View style={styles.field}>
        <Label>🔔 {t.reminder}</Label>
        <Chips options={REMINDERS.map((n) => ({ value: n, label: t.daysBefore(n) }))} value={reminderDays} onChange={(v) => v && setReminderDays(v)} />
      </View>
      <Field label={t.reference} value={reference} onChangeText={setReference} placeholder="0001234" />
      <PhotoPicker value={photos} onChange={setPhotos} />
    </Screen>
  );
}
