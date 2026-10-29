import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { DirectionSegment, PhotoPicker } from '../../src/components/domain';
import { PersonHeader } from '../../src/components/PersonHeader';
import { Button, Card, Chips, DateField, ErrorText, Field, Label, Screen, styles, SwitchRow } from '../../src/components/ui';
import { getTransaction, getTransactionItems, saveTransaction } from '../../src/db/repo';
import type { Direction } from '../../src/db/types';
import { useI18n } from '../../src/i18n';
import { useAppState } from '../../src/state';
import { colors, font, radius } from '../../src/theme';
import { addDays, today } from '../../src/utils/dates';
import { centsToInput, formatMoney, parseMoney, parseNumber } from '../../src/utils/money';

interface ItemRow {
  key: number;
  name: string;
  qty: string;
  price: string;
}

let nextKey = 1;
const emptyItem = (): ItemRow => ({ key: nextKey++, name: '', qty: '1', price: '' });
const rowTotal = (r: ItemRow) => {
  const qty = r.qty.trim() ? parseNumber(r.qty) : 1;
  const price = parseMoney(r.price);
  return qty && price ? Math.round(qty * price) : 0;
};

/** Achat / vente à crédit avec plusieurs articles ; modification si ?id= est fourni. */
export default function CreditForm() {
  const db = useSQLiteContext();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; contactId: string }>();
  const { t, lang } = useI18n();
  const { refresh } = useAppState();
  const [contactId, setContactId] = useState(params.contactId);
  const [direction, setDirection] = useState<Direction>('PAYABLE');
  const [items, setItems] = useState<ItemRow[]>([emptyItem()]);
  const [date, setDate] = useState<string | null>(today());
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [hasUpfront, setHasUpfront] = useState(false);
  const [upfront, setUpfront] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!params.id) return;
    getTransaction(db, params.id).then(async (tx) => {
      if (!tx) return;
      setContactId(tx.contact_id);
      setDirection(tx.direction);
      setItems(
        (await getTransactionItems(db, tx)).map((i) => ({
          key: nextKey++,
          name: i.name,
          qty: String(i.quantity).replace('.', ','),
          price: centsToInput(i.unit_price),
        })),
      );
      setDate(tx.transaction_date);
      setDueDate(tx.due_date);
      setHasUpfront(tx.upfront_paid > 0);
      setUpfront(tx.upfront_paid ? centsToInput(tx.upfront_paid) : '');
    });
  }, [db, params.id]);

  const total = items.reduce((sum, r) => sum + rowTotal(r), 0);
  const updateItem = (key: number, patch: Partial<ItemRow>) => setItems((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const removeItem = (key: number) => setItems((list) => (list.length > 1 ? list.filter((r) => r.key !== key) : list));

  const submit = async () => {
    const e: Record<string, string> = {};
    const filled = items.filter((r) => r.name.trim() || r.price.trim());
    const valid = filled.every((r) => rowTotal(r) > 0);
    if (!filled.length || !valid) e.items = t.articleRequired;
    const upfrontCents = hasUpfront && upfront.trim() ? parseMoney(upfront) : 0;
    if (upfrontCents === null) e.upfront = t.invalidAmount;
    else if (upfrontCents > total) e.upfront = t.paidExceedsTotal;
    setErrors(e);
    if (Object.keys(e).length || upfrontCents === null) return;

    setSaving(true);
    try {
      await saveTransaction(
        db,
        {
          contactId,
          direction,
          items: filled.map((r) => ({
            name: r.name.trim() || t.txTitle[direction],
            quantity: r.qty.trim() ? parseNumber(r.qty)! : 1,
            unit_price: parseMoney(r.price)!,
          })),
          upfrontPaid: upfrontCents,
          date: date ?? today(),
          dueDate,
          photos,
        },
        params.id,
      );
      refresh();
      router.back();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen
      footer={
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.muted}>{t.total}</Text>
            <Text style={{ fontSize: font.xl, fontWeight: '800', color: direction === 'PAYABLE' ? colors.danger : colors.success }}>{formatMoney(total, lang)}</Text>
          </View>
          <Button label={t.save} onPress={submit} disabled={saving} style={{ flex: 1.3 }} />
        </View>
      }
    >
      {params.id ? <Stack.Screen options={{ title: t.editCreditTitle }} /> : null}
      <PersonHeader contactId={contactId} onLoad={(c) => !params.id && c.type === 'CUSTOMER' && setDirection('RECEIVABLE')} />
      <DirectionSegment value={direction} onChange={setDirection} />

      <View style={styles.field}>
        <Label>{t.articles}</Label>
        {items.map((r, index) => (
          <Card key={r.key} style={{ gap: 12 }}>
            <View style={styles.row}>
              <Text style={{ fontSize: font.sm, fontWeight: '800', color: colors.primary }}>#{index + 1}</Text>
              <TextInput
                style={[styles.input, { flex: 1, minHeight: 50 }]}
                value={r.name}
                onChangeText={(v) => updateItem(r.key, { name: v })}
                placeholder={t.articlePlaceholder}
                placeholderTextColor={colors.muted}
              />
              {items.length > 1 ? (
                <Pressable onPress={() => removeItem(r.key)} hitSlop={8} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.dangerSoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: colors.danger, fontWeight: '800' }}>✕</Text>
                </Pressable>
              ) : null}
            </View>
            <View style={styles.row}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.muted}>{t.quantity}</Text>
                <TextInput
                  style={[styles.input, { minHeight: 50, textAlign: 'center' }]}
                  value={r.qty}
                  onChangeText={(v) => updateItem(r.key, { qty: v })}
                  keyboardType="decimal-pad"
                  placeholderTextColor={colors.muted}
                />
              </View>
              <Text style={{ fontSize: font.lg, color: colors.muted, marginTop: 20 }}>×</Text>
              <View style={{ flex: 1.4, gap: 4 }}>
                <Text style={styles.muted}>{t.unitPrice}</Text>
                <TextInput
                  style={[styles.input, { minHeight: 50, textAlign: 'center' }]}
                  value={r.price}
                  onChangeText={(v) => updateItem(r.key, { price: v })}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={colors.muted}
                />
              </View>
            </View>
            <View style={{ backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, paddingVertical: 8, paddingHorizontal: 12, alignItems: 'flex-end' }}>
              <Text style={{ fontSize: font.md, fontWeight: '700', color: colors.text }}>= {formatMoney(rowTotal(r), lang)}</Text>
            </View>
          </Card>
        ))}
        <ErrorText>{errors.items}</ErrorText>
        <Button label={t.addArticle} variant="soft" size="md" onPress={() => setItems((list) => [...list, emptyItem()])} />
      </View>

      <DateField label={t.date} value={date} onChange={setDate} />
      <DateField label={t.dueDate} value={dueDate} onChange={setDueDate} clearLabel={t.none} />
      <Chips
        options={[7, 15, 30].map((n) => ({ value: n, label: t.plusDays(n) }))}
        value={null}
        onChange={(n) => n && setDueDate(addDays(date ?? today(), n))}
      />

      <SwitchRow
        label={t.alreadyPaid[direction]}
        value={hasUpfront}
        onChange={(on) => {
          setHasUpfront(on);
          if (!on) setUpfront('');
        }}
      />
      {hasUpfront ? (
        <>
          <Field label={t.paidAmount} value={upfront} onChangeText={setUpfront} keyboardType="decimal-pad" placeholder="0" error={errors.upfront} />
          <Chips
            deselectable
            options={[{ value: 'all', label: t.paidAll }]}
            value={total > 0 && parseMoney(upfront) === total ? 'all' : null}
            onChange={(v) => setUpfront(v ? centsToInput(total) : '')}
          />
        </>
      ) : null}

      <PhotoPicker value={photos} onChange={setPhotos} label={t.invoicePhoto} />
    </Screen>
  );
}
