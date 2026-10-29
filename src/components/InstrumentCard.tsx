import { Alert, Text, View } from 'react-native';
import type { InstrumentWithContact } from '../db/types';
import { useI18n } from '../i18n';
import { colors, font } from '../theme';
import { daysUntil, formatDate } from '../utils/dates';
import { formatMoney } from '../utils/money';
import { DIRECTION_COLORS } from './domain';
import { Button, Card, Pill, styles } from './ui';

/** Carte d'un chèque / d'une traite, avec les actions « payé » et « annuler » tant qu'il est en attente. */
export function InstrumentCard({
  inst,
  showContact = true,
  onPress,
  onMarkPaid,
  onCancel,
}: {
  inst: InstrumentWithContact;
  showContact?: boolean;
  onPress?: () => void;
  onMarkPaid?: (id: string) => void;
  onCancel?: (id: string) => void;
}) {
  const { t, lang } = useI18n();
  const pending = inst.status === 'PENDING';
  const days = daysUntil(inst.maturity_due_date);
  const urgent = pending && days <= Math.max(inst.reminder_days_before, 1);

  const confirm = (message: string, action: () => void) =>
    Alert.alert(message, '', [
      { text: t.cancel, style: 'cancel' },
      { text: t.confirm, onPress: action },
    ]);

  return (
    <Card onPress={onPress} style={urgent ? { borderWidth: 1.5, borderColor: colors.danger } : undefined}>
      <View style={styles.row}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontSize: font.md, fontWeight: '700', color: colors.text }}>
            {t.instrTypes[inst.instrument_type]}
            {inst.reference_number ? ` n° ${inst.reference_number}` : ''}
          </Text>
          {showContact ? <Text style={styles.muted}>{inst.contact_name}</Text> : null}
        </View>
        <Text style={{ fontSize: font.lg, fontWeight: '800', color: DIRECTION_COLORS[inst.direction].fg }}>{formatMoney(inst.amount, lang)}</Text>
      </View>
      <View style={[styles.row, { gap: 6, flexWrap: 'wrap' }]}>
        <Pill text={t.instrDirection[inst.direction]} tone={inst.direction === 'PAYABLE' ? 'danger' : 'success'} />
        <Pill text={`${t.dueShort} : ${formatDate(inst.maturity_due_date)}`} />
        {pending ? <Pill text={t.inDays(days)} tone={urgent ? 'danger' : 'warning'} /> : <Pill text={t.instrStatus[inst.status]} tone={inst.status === 'DEBITED_PAID' ? 'success' : 'neutral'} />}
      </View>
      {pending && (onMarkPaid || onCancel) ? (
        <View style={[styles.row, { marginTop: 4 }]}>
          {onMarkPaid ? <Button label={t.markPaid} size="md" variant="success" style={{ flex: 2 }} onPress={() => confirm(t.confirmMarkPaid, () => onMarkPaid(inst.id))} /> : null}
          {onCancel ? <Button label={t.cancelInstrument} size="md" variant="secondary" style={{ flex: 1 }} onPress={() => confirm(t.confirmCancel, () => onCancel(inst.id))} /> : null}
        </View>
      ) : null}
    </Card>
  );
}
