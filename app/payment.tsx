import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { ContactPicker } from '../src/components/ContactPicker';
import { Btn, Card, Field, Screen, styles } from '../src/components/ui';
import { getContact, getLedger, recordCashPayment, type PaymentTarget } from '../src/db/repo';
import type { ContactWithBalance, LedgerRow, TransactionType, WorkType } from '../src/db/types';
import { useI18n } from '../src/i18n';
import { colors, font } from '../src/theme';
import { formatDate } from '../src/utils/dates';
import { centsToInput, formatMoney, parseMoney } from '../src/utils/money';

/** Versement en espèces, éventuellement ciblé sur une ligne du grand livre. */
export default function Payment() {
  const db = useSQLiteContext();
  const router = useRouter();
  const params = useLocalSearchParams<{ contactId?: string; kind?: 'T' | 'P'; itemId?: string }>();
  const { t, lang } = useI18n();
  const [contactId, setContactId] = useState<string | null>(params.contactId ?? null);
  const [contact, setContact] = useState<ContactWithBalance | null>(null);
  const [item, setItem] = useState<LedgerRow | null>(null);
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const target: PaymentTarget | null = params.kind && params.itemId && contactId === params.contactId ? { kind: params.kind, id: params.itemId } : null;

  useEffect(() => {
    if (!contactId) return;
    getContact(db, contactId).then(setContact);
    if (target) getLedger(db, contactId).then((rows) => setItem(rows.find((r) => r.kind === target.kind && r.id === target.id) ?? null));
    else setItem(null);
  }, [db, contactId, target?.kind, target?.id]);

  const balance = contact?.balance ?? 0;
  const itemRest = item ? item.total - item.paid : 0;

  const submit = async () => {
    const cents = parseMoney(amount);
    if (!contactId) return setError(t.chooseContact);
    if (!cents) return setError(t.invalidAmount);
    if (cents > balance) return setError(t.amountTooHigh);
    setSaving(true);
    try {
      await recordCashPayment(db, contactId, cents, target);
      Alert.alert(t.paymentDone, formatMoney(cents, lang));
      router.back();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <ContactPicker value={contactId} onChange={setContactId} />
      {contact ? (
        <Card style={{ borderColor: balance > 0 ? colors.danger : colors.success, borderWidth: 2 }}>
          <Text style={{ fontSize: font.md, fontWeight: '700', color: colors.muted }}>{t.balance}</Text>
          <Text style={{ fontSize: font.xl + 2, fontWeight: '900', color: balance > 0 ? colors.danger : colors.success }}>{formatMoney(balance, lang)}</Text>
        </Card>
      ) : null}
      {item ? (
        <Card style={{ backgroundColor: colors.earthLight }}>
          <Text style={styles.muted}>{t.targetItem}</Text>
          <Text style={[styles.body, { fontWeight: '800' }]}>
            {formatDate(item.d)} · {item.kind === 'T' ? item.label || t.txTypes[item.sub as TransactionType] : t.workTypes[item.sub as WorkType]}
          </Text>
          <Text style={styles.body}>
            {t.colRest} : {formatMoney(itemRest, lang)}
          </Text>
        </Card>
      ) : null}

      <Field
        label={t.paymentAmount}
        value={amount}
        onChangeText={(v) => (setAmount(v), setError(null))}
        keyboardType="decimal-pad"
        placeholder="0"
        error={error}
        style={{ fontSize: font.xl, fontWeight: '800', minHeight: 68 }}
      />
      <View style={styles.row}>
        {item && itemRest > 0 ? (
          <Btn label={`${t.colRest} : ${formatMoney(itemRest, lang)}`} variant="outline" style={{ flex: 1 }} onPress={() => setAmount(centsToInput(itemRest))} />
        ) : null}
        {balance > 0 ? <Btn label={t.payAll} variant="outline" style={{ flex: 1 }} onPress={() => setAmount(centsToInput(balance))} /> : null}
      </View>
      <Text style={styles.muted}>{t.paymentHint}</Text>
      <Text style={styles.muted}>{t.instrumentHint}</Text>
      <Btn label={`💵 ${t.save}`} onPress={submit} disabled={saving} />
    </Screen>
  );
}
