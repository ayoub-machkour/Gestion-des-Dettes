import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { View } from 'react-native';
import { ContactPicker } from '../../src/components/ContactPicker';
import { Btn, Chips, DateField, Field, Label, Screen, styles } from '../../src/components/ui';
import { createTransaction } from '../../src/db/repo';
import type { TransactionType } from '../../src/db/types';
import { useI18n } from '../../src/i18n';
import { today } from '../../src/utils/dates';
import { parseMoney } from '../../src/utils/money';

export default function NewCredit() {
  const db = useSQLiteContext();
  const router = useRouter();
  const params = useLocalSearchParams<{ contactId?: string }>();
  const { t } = useI18n();
  const [contactId, setContactId] = useState<string | null>(params.contactId ?? null);
  const [type, setType] = useState<TransactionType>('DEBT_ITEM');
  const [description, setDescription] = useState('');
  const [total, setTotal] = useState('');
  const [paid, setPaid] = useState('');
  const [date, setDate] = useState<string | null>(today());
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = async () => {
    const e: Record<string, string> = {};
    const totalCents = parseMoney(total);
    const paidCents = paid.trim() ? parseMoney(paid) : 0;
    if (!contactId) e.contact = t.required;
    if (!totalCents) e.total = t.invalidAmount;
    if (paidCents === null) e.paid = t.invalidAmount;
    else if (totalCents && paidCents > totalCents) e.paid = t.paidExceedsTotal;
    setErrors(e);
    if (Object.keys(e).length || !contactId || !totalCents || paidCents === null) return;

    await createTransaction(db, {
      contactId,
      type,
      description: description || t.txTypes[type],
      total: totalCents,
      paid: paidCents,
      date: date ?? today(),
      dueDate,
    });
    router.back();
  };

  return (
    <Screen>
      <ContactPicker value={contactId} onChange={setContactId} error={errors.contact} />
      <View style={styles.field}>
        <Label>{t.type}</Label>
        <Chips options={(['DEBT_ITEM', 'CASH_LOAN'] as const).map((v) => ({ value: v, label: t.txTypes[v] }))} value={type} onChange={setType} />
      </View>
      <Field label={t.description} value={description} onChangeText={setDescription} placeholder={t.descriptionPlaceholder} />
      {type === 'DEBT_ITEM' ? <Chips options={t.suggestions.map((s) => ({ value: s, label: s }))} value={description} onChange={setDescription} /> : null}
      <Field label={t.totalAmount} value={total} onChangeText={setTotal} keyboardType="decimal-pad" placeholder="0" error={errors.total} />
      <Field label={t.paidNow} value={paid} onChangeText={setPaid} keyboardType="decimal-pad" placeholder="0" error={errors.paid} />
      <DateField label={t.date} value={date} onChange={setDate} />
      <DateField label={t.dueDate} value={dueDate} onChange={setDueDate} clearLabel={t.none} />
      <Btn label={t.save} onPress={submit} />
    </Screen>
  );
}
