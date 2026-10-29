import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { DIRECTION_COLORS, DirectionSegment, PhotoPicker } from '../src/components/domain';
import { PersonHeader } from '../src/components/PersonHeader';
import { Button, Chips, DateField, Field, Screen } from '../src/components/ui';
import { getInstrument, savePayment } from '../src/db/repo';
import type { ContactWithBalance, Direction } from '../src/db/types';
import { useI18n } from '../src/i18n';
import { useAppState } from '../src/state';
import { font, radius } from '../src/theme';
import { today } from '../src/utils/dates';
import { centsToInput, formatMoney, parseMoney } from '../src/utils/money';

/** Paiement simple : montant, date, photo du reçu. Modification si ?id= est fourni. */
export default function Payment() {
  const db = useSQLiteContext();
  const router = useRouter();
  const params = useLocalSearchParams<{ contactId: string; direction?: Direction; kind?: 'T' | 'P'; itemId?: string; id?: string }>();
  const { t, lang } = useI18n();
  const { refresh } = useAppState();
  const [contactId, setContactId] = useState(params.contactId);
  const [person, setPerson] = useState<ContactWithBalance | null>(null);
  const [direction, setDirection] = useState<Direction>(params.direction ?? 'PAYABLE');
  const [amount, setAmount] = useState('');
  const [original, setOriginal] = useState(0);
  const [target, setTarget] = useState<{ kind: 'T' | 'P'; id: string } | null>(params.kind && params.itemId ? { kind: params.kind, id: params.itemId } : null);
  const [date, setDate] = useState<string | null>(today());
  const [photos, setPhotos] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!params.id) return;
    getInstrument(db, params.id).then((i) => {
      if (!i) return;
      setContactId(i.contact_id);
      setDirection(i.direction);
      setAmount(centsToInput(i.amount));
      setOriginal(i.amount);
      setDate(i.issue_date);
      setTarget(i.transaction_id ? { kind: 'T', id: i.transaction_id } : i.payroll_entry_id ? { kind: 'P', id: i.payroll_entry_id } : null);
    });
  }, [db, params.id]);

  const onPersonLoad = (c: ContactWithBalance) => {
    setPerson(c);
    if (!params.direction && !params.id) setDirection(c.payable > 0 || c.receivable <= 0 ? 'PAYABLE' : 'RECEIVABLE');
  };

  // En modification, le paiement actuel compte déjà dans le solde : on le rajoute.
  const balance = Math.max(0, (direction === 'PAYABLE' ? person?.payable : person?.receivable) ?? 0) + original;
  const c = DIRECTION_COLORS[direction];
  const bothDirections = !!person && person.payable > 0 && person.receivable > 0;

  const submit = async () => {
    const cents = parseMoney(amount);
    if (!cents) return setError(t.invalidAmount);
    if (cents > balance) return setError(t.amountTooHigh);
    setSaving(true);
    try {
      await savePayment(db, { contactId, direction, amount: cents, date: date ?? today(), target, photos }, params.id);
      refresh();
      router.back();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen footer={<Button label={`${t.payDirection[direction]} · ${t.save}`} variant="success" onPress={submit} disabled={saving || balance === 0} />}>
      {params.id ? <Stack.Screen options={{ title: t.editPaymentTitle }} /> : null}
      <PersonHeader contactId={contactId} onLoad={onPersonLoad} />
      {bothDirections ? <DirectionSegment value={direction} onChange={(d) => (setDirection(d), setTarget(null))} labels={t.payDirection} /> : null}

      <View style={{ backgroundColor: c.bg, borderRadius: radius.lg, padding: 18, alignItems: 'center', gap: 2 }}>
        <Text style={{ fontSize: font.sm, fontWeight: '600', color: c.fg }}>{t.remaining}</Text>
        <Text style={{ fontSize: font.xxl, fontWeight: '800', color: c.fg }}>{formatMoney(balance, lang)}</Text>
        {balance === 0 ? <Text style={{ fontSize: font.sm, color: c.fg }}>{t.nothingToPay}</Text> : null}
      </View>

      <Field
        label={t.amount}
        value={amount}
        onChangeText={(v) => (setAmount(v), setError(null))}
        keyboardType="decimal-pad"
        placeholder="0"
        error={error}
        style={{ fontSize: font.xl, fontWeight: '800', minHeight: 70, textAlign: 'center' }}
      />
      {balance > 0 ? (
        <Chips
          deselectable
          options={[{ value: 'all', label: t.payAllAmount(formatMoney(balance, lang)) }]}
          value={parseMoney(amount) === balance ? 'all' : null}
          onChange={(v) => (setAmount(v ? centsToInput(balance) : ''), setError(null))}
        />
      ) : null}
      <DateField label={t.paymentDate} value={date} onChange={setDate} />
      <PhotoPicker value={photos} onChange={setPhotos} label={t.receiptPhoto} />
    </Screen>
  );
}
