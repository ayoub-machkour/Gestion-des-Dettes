import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { DirectionSegment, PhotoPicker } from '../../src/components/domain';
import { PersonHeader } from '../../src/components/PersonHeader';
import { Button, Card, Chips, DateField, Field, Label, Screen, Stepper, styles } from '../../src/components/ui';
import { getInstrument, saveInstrument } from '../../src/db/repo';
import type { Direction, InstrumentType } from '../../src/db/types';
import { useI18n } from '../../src/i18n';
import { useAppState } from '../../src/state';
import { colors, font } from '../../src/theme';
import { addDays, addMonths, today } from '../../src/utils/dates';
import { centsToInput, formatMoney, parseMoney } from '../../src/utils/money';

const TYPES: InstrumentType[] = ['BANK_CHECK', 'BILL_OF_EXCHANGE'];
const REMINDERS = [1, 3, 7];
const MAX_TRAITES = 24;

interface Part {
  amount: string;
  date: string | null;
}

/**
 * Chèque (un montant, une date de débit) ou traites (plusieurs montants, chacun avec sa date de débit),
 * donnés ou reçus. Modification d'un seul effet si ?id= est fourni.
 */
export default function InstrumentForm() {
  const db = useSQLiteContext();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; contactId: string }>();
  const { t, lang } = useI18n();
  const { refresh } = useAppState();
  const [contactId, setContactId] = useState(params.contactId);
  const [direction, setDirection] = useState<Direction>('PAYABLE');
  const [type, setType] = useState<InstrumentType>('BANK_CHECK');
  const [parts, setParts] = useState<Part[]>([{ amount: '', date: addDays(today(), 30) }]);
  const [reference, setReference] = useState('');
  const [reminderDays, setReminderDays] = useState(3);
  const [issueDate, setIssueDate] = useState(today());
  const [photos, setPhotos] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Plusieurs traites uniquement à la création ; un effet existant se modifie seul.
  const series = !params.id && type === 'BILL_OF_EXCHANGE';
  const shown = series ? parts : parts.slice(0, 1);

  useEffect(() => {
    if (!params.id) return;
    getInstrument(db, params.id).then((i) => {
      if (!i) return;
      setContactId(i.contact_id);
      setDirection(i.direction);
      setType(i.instrument_type === 'BANK_CHECK' ? 'BANK_CHECK' : 'BILL_OF_EXCHANGE');
      setParts([{ amount: centsToInput(i.amount), date: i.maturity_due_date }]);
      setReference(i.reference_number ?? '');
      setReminderDays(i.reminder_days_before || 3);
      setIssueDate(i.issue_date);
    });
  }, [db, params.id]);

  const setPart = (index: number, patch: Partial<Part>) => setParts((p) => p.map((x, i) => (i === index ? { ...x, ...patch } : x)));

  // Une nouvelle traite reprend le montant de la précédente, un mois plus tard.
  const setCount = (n: number) =>
    setParts((p) => {
      const next = p.slice(0, n);
      while (next.length < n) {
        const last = next[next.length - 1];
        next.push({ amount: last.amount, date: last.date ? addMonths(last.date, 1) : null });
      }
      return next;
    });

  const total = shown.reduce((a, p) => a + (parseMoney(p.amount) ?? 0), 0);

  const submit = async () => {
    const e: Record<string, string> = {};
    shown.forEach((p, i) => {
      if (!parseMoney(p.amount)) e[`amount${i}`] = t.invalidAmount;
      if (!p.date) e[`date${i}`] = t.required;
    });
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    try {
      for (const p of shown) {
        await saveInstrument(
          db,
          {
            contactId,
            direction,
            transactionId: null,
            payrollEntryId: null,
            type,
            amount: parseMoney(p.amount)!,
            issueDate,
            maturityDate: p.date!,
            reference: series ? '' : reference,
            reminderDays,
            photos,
          },
          params.id,
        );
      }
      refresh(true);
      router.back();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen
      footer={
        <View style={{ gap: 8 }}>
          {series && shown.length > 1 ? <Text style={[styles.muted, { textAlign: 'center' }]}>{t.traitesTotal(shown.length, formatMoney(total, lang))}</Text> : null}
          <Button label={t.save} onPress={submit} disabled={saving} />
        </View>
      }
    >
      {params.id ? <Stack.Screen options={{ title: t.editInstrument }} /> : null}
      <PersonHeader contactId={contactId} onLoad={(c) => !params.id && c.type === 'CUSTOMER' && setDirection('RECEIVABLE')} />
      <DirectionSegment value={direction} onChange={setDirection} labels={t.instrDirection} />
      <View style={styles.field}>
        <Label>{t.type}</Label>
        <Chips options={TYPES.map((v) => ({ value: v, label: t.instrTypes[v] }))} value={type} onChange={(v) => v && setType(v)} />
      </View>

      {series ? (
        <View style={[styles.row, { justifyContent: 'space-between' }]}>
          <Label>{t.traiteCount}</Label>
          <Stepper value={parts.length} min={1} max={MAX_TRAITES} onChange={setCount} />
        </View>
      ) : null}

      {shown.map((p, i) =>
        series ? (
          <Card key={i} style={{ gap: 4 }}>
            <Text style={{ fontSize: font.md, fontWeight: '700', color: colors.primary }}>{t.traiteN(i + 1)}</Text>
            <Field label={t.amount} value={p.amount} onChangeText={(v) => setPart(i, { amount: v })} keyboardType="decimal-pad" placeholder="0" error={errors[`amount${i}`]} />
            <DateField label={t.debitDate} value={p.date} onChange={(v) => setPart(i, { date: v })} />
          </Card>
        ) : (
          <View key={i} style={{ gap: 16 }}>
            <Field
              label={t.amount}
              value={p.amount}
              onChangeText={(v) => setPart(i, { amount: v })}
              keyboardType="decimal-pad"
              placeholder="0"
              error={errors[`amount${i}`]}
              style={{ fontSize: 22, fontWeight: '800' }}
            />
            <DateField label={t.debitDate} value={p.date} onChange={(v) => setPart(i, { date: v })} />
          </View>
        ),
      )}
      <Text style={styles.muted}>{t.autoDebitNote}</Text>

      <View style={styles.field}>
        <Label>{t.reminder}</Label>
        <Chips options={REMINDERS.map((n) => ({ value: n, label: t.daysBefore(n) }))} value={reminderDays} onChange={(v) => v && setReminderDays(v)} />
      </View>
      {series ? null : <Field label={t.reference} value={reference} onChangeText={setReference} placeholder="0001234" />}
      <PhotoPicker value={photos} onChange={setPhotos} />
    </Screen>
  );
}
