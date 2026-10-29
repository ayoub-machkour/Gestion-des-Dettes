import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { ContactPicker } from '../src/components/ContactPicker';
import { DIRECTION_COLORS, DirectionToggle } from '../src/components/domain';
import { Btn, Card, Field, Screen, styles } from '../src/components/ui';
import { getContact, listOpenItems, recordCashPayment } from '../src/db/repo';
import type { ContactWithBalance, Direction, LedgerRow } from '../src/db/types';
import { useI18n } from '../src/i18n';
import { useAppState } from '../src/state';
import { rowLabel } from '../src/statement';
import { colors, font } from '../src/theme';
import { formatDate } from '../src/utils/dates';
import { centsToInput, formatMoney, parseMoney } from '../src/utils/money';

/** Versement espèces : je paie ou je reçois, éventuellement ciblé sur une ligne du grand livre. */
export default function Payment() {
  const db = useSQLiteContext();
  const router = useRouter();
  const params = useLocalSearchParams<{ contactId?: string; direction?: Direction; kind?: 'T' | 'P'; itemId?: string }>();
  const { t, lang } = useI18n();
  const { done } = useAppState();
  const [direction, setDirection] = useState<Direction>(params.direction ?? 'PAYABLE');
  const [contactId, setContactId] = useState<string | null>(params.contactId ?? null);
  const [contact, setContact] = useState<ContactWithBalance | null>(null);
  const [openItems, setOpenItems] = useState<LedgerRow[]>([]);
  const [target, setTarget] = useState<string | null>(params.kind && params.itemId ? params.kind + params.itemId : null);
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!contactId) return;
    getContact(db, contactId).then(setContact);
    listOpenItems(db, contactId, direction).then(setOpenItems);
  }, [db, contactId, direction]);

  const balance = Math.max(0, (direction === 'PAYABLE' ? contact?.payable : contact?.receivable) ?? 0);
  const item = openItems.find((r) => r.kind + r.id === target) ?? null;
  const itemRest = item ? item.total - item.paid : 0;
  const c = DIRECTION_COLORS[direction];

  const submit = async () => {
    const cents = parseMoney(amount);
    if (!contactId) return setError(t.chooseContact);
    if (!cents) return setError(t.invalidAmount);
    if (cents > balance) return setError(t.amountTooHigh);
    setSaving(true);
    try {
      await recordCashPayment(db, contactId, direction, cents, item ? { kind: item.kind, id: item.id } : null);
      done(`${t.paymentDone} · ${formatMoney(cents, lang)}`);
      router.back();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <DirectionToggle value={direction} onChange={(d) => (setDirection(d), setTarget(null))} labels={t.payDirection} subtitles={null} />
      <ContactPicker value={contactId} onChange={(id) => (setContactId(id), setTarget(null))} />
      {contact ? (
        <Card style={{ borderColor: c.fg, borderWidth: 2, backgroundColor: c.bg }}>
          <Text style={{ fontSize: font.md, fontWeight: '700', color: c.fg }}>
            {c.dot} {direction === 'PAYABLE' ? t.iOweHim : t.heOwesMe}
          </Text>
          <Text style={{ fontSize: font.xl + 2, fontWeight: '900', color: c.fg }}>{formatMoney(balance, lang)}</Text>
          {balance === 0 ? <Text style={styles.muted}>{t.nothingToPay}</Text> : null}
        </Card>
      ) : null}
      {item ? (
        <Card style={{ backgroundColor: colors.earthLight }}>
          <Text style={styles.muted}>{t.targetItem}</Text>
          <Text style={[styles.body, { fontWeight: '800' }]}>
            {formatDate(item.d)} · {rowLabel(t, item, lang)}
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
      <Btn label={`${t.payDirection[direction]} · ${t.save}`} onPress={submit} disabled={saving || balance === 0} />
    </Screen>
  );
}
