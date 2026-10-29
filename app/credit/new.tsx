import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { ContactPicker } from '../../src/components/ContactPicker';
import { CropPicker, DirectionToggle } from '../../src/components/domain';
import { Btn, Card, Chips, DateField, Field, Label, Screen, styles } from '../../src/components/ui';
import { getTransaction, saveTransaction } from '../../src/db/repo';
import type { Crop, Direction, TransactionType } from '../../src/db/types';
import { useI18n } from '../../src/i18n';
import { useAppState } from '../../src/state';
import { addDays, today } from '../../src/utils/dates';
import { centsToInput, formatMoney, parseMoney, parseNumber } from '../../src/utils/money';

const TYPES: Record<Direction, TransactionType[]> = {
  PAYABLE: ['DEBT_ITEM', 'CASH_LOAN'],
  RECEIVABLE: ['SALE_ON_CREDIT', 'LOAN_GIVEN'],
};

/** Nouvelle dette / créance, ou modification si ?id= est fourni. */
export default function CreditForm() {
  const db = useSQLiteContext();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; contactId?: string; direction?: Direction }>();
  const { t, lang } = useI18n();
  const { done } = useAppState();
  const [direction, setDirection] = useState<Direction>(params.direction ?? 'PAYABLE');
  const [contactId, setContactId] = useState<string | null>(params.contactId ?? null);
  const [type, setType] = useState<TransactionType>(TYPES[direction][0]);
  const [crop, setCrop] = useState<Crop | null>(null);
  const [description, setDescription] = useState('');
  const [total, setTotal] = useState('');
  const [upfront, setUpfront] = useState('');
  const [date, setDate] = useState<string | null>(today());
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [showCalc, setShowCalc] = useState(false);
  const [qty, setQty] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!params.id) return;
    getTransaction(db, params.id).then((tx) => {
      if (!tx) return;
      setDirection(tx.direction);
      setContactId(tx.contact_id);
      setType(tx.transaction_type);
      setCrop(tx.crop);
      setDescription(tx.description);
      setTotal(centsToInput(tx.total_amount));
      setUpfront(tx.upfront_paid ? centsToInput(tx.upfront_paid) : '');
      setDate(tx.transaction_date);
      setDueDate(tx.due_date);
    });
  }, [db, params.id]);

  const changeDirection = (d: Direction) => {
    setDirection(d);
    if (!TYPES[d].includes(type)) setType(TYPES[d][0]);
  };

  const qtyNum = parseNumber(qty);
  const unitCents = parseMoney(unitPrice);
  const calcTotal = qtyNum && unitCents ? Math.round(qtyNum * unitCents) : 0;
  const applyCalc = () => {
    if (!calcTotal || !qtyNum || !unitCents) return;
    setTotal(centsToInput(calcTotal));
    const detail = `${qtyNum} × ${formatMoney(unitCents, lang)}`;
    setDescription((d) => (d ? `${d} (${detail})` : detail));
    setShowCalc(false);
  };

  const submit = async () => {
    const e: Record<string, string> = {};
    const totalCents = parseMoney(total);
    const upfrontCents = upfront.trim() ? parseMoney(upfront) : 0;
    if (!contactId) e.contact = t.required;
    if (!totalCents) e.total = t.invalidAmount;
    if (upfrontCents === null) e.upfront = t.invalidAmount;
    else if (totalCents && upfrontCents > totalCents) e.upfront = t.paidExceedsTotal;
    setErrors(e);
    if (Object.keys(e).length || !contactId || !totalCents || upfrontCents === null) return;

    await saveTransaction(
      db,
      {
        contactId,
        direction,
        type,
        description: description || t.txTypes[type],
        crop,
        total: totalCents,
        upfrontPaid: upfrontCents,
        date: date ?? today(),
        dueDate,
      },
      params.id,
    );
    done();
    router.back();
  };

  return (
    <Screen>
      {params.id ? <Stack.Screen options={{ title: t.editCredit }} /> : null}
      <Label>{t.whoOwes}</Label>
      <DirectionToggle value={direction} onChange={changeDirection} />
      <ContactPicker value={contactId} onChange={setContactId} error={errors.contact} />
      <View style={styles.field}>
        <Label>{t.type}</Label>
        <Chips options={TYPES[direction].map((v) => ({ value: v, label: t.txTypes[v] }))} value={type} onChange={setType} />
      </View>
      <CropPicker value={crop} onChange={setCrop} />
      <Field label={t.description} value={description} onChangeText={setDescription} placeholder={t.descriptionPlaceholder} />
      <Chips options={t.suggestions[direction].map((s) => ({ value: s, label: s }))} value={description} onChange={setDescription} />

      {showCalc ? (
        <Card>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Field label={t.quantity} value={qty} onChangeText={setQty} keyboardType="decimal-pad" placeholder="20" />
            </View>
            <View style={{ flex: 1 }}>
              <Field label={t.unitPrice} value={unitPrice} onChangeText={setUnitPrice} keyboardType="decimal-pad" placeholder="80" />
            </View>
          </View>
          <Text style={[styles.body, { fontWeight: '800', textAlign: 'center' }]}>= {formatMoney(calcTotal, lang)}</Text>
          <Btn label={t.apply} onPress={applyCalc} disabled={!calcTotal} />
        </Card>
      ) : (
        <Btn label={t.calculator} variant="outline" onPress={() => setShowCalc(true)} />
      )}

      <Field label={t.totalAmount} value={total} onChangeText={setTotal} keyboardType="decimal-pad" placeholder="0" error={errors.total} />
      <Field label={t.upfront[direction]} value={upfront} onChangeText={setUpfront} keyboardType="decimal-pad" placeholder="0" error={errors.upfront} />
      {total ? <Chips options={[{ value: 'all', label: `✓ ${t.allNow[direction]}` }]} value={upfront && upfront === total ? 'all' : null} onChange={() => setUpfront(total)} /> : null}
      <DateField label={t.date} value={date} onChange={setDate} />
      <DateField label={t.dueDate} value={dueDate} onChange={setDueDate} clearLabel={t.none} />
      <Chips
        options={[7, 15, 30].map((n) => ({ value: n, label: t.plusDays(n) }))}
        value={null}
        onChange={(n) => setDueDate(addDays(date ?? today(), n))}
      />
      <Btn label={t.save} onPress={submit} />
    </Screen>
  );
}
