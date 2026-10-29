import { Alert, Text, View } from 'react-native';
import type { InstrumentWithContact } from '../db/types';
import { useI18n } from '../i18n';
import { colors, font } from '../theme';
import { daysUntil, formatDate } from '../utils/dates';
import { formatMoney } from '../utils/money';
import { Badge, Btn, Card, styles } from './ui';

/** Couleur d'urgence : rouge si en retard ou dans la fenêtre de rappel, orange sous 7 jours. */
export function urgencyColor(inst: InstrumentWithContact): string {
  if (inst.status !== 'PENDING') return colors.border;
  const d = daysUntil(inst.maturity_due_date);
  if (d < 0 || d <= Math.max(inst.reminder_days_before, 1)) return colors.danger;
  if (d <= 7) return colors.warning;
  return colors.success;
}

export function InstrumentCard({
  inst,
  showContact = true,
  onMarkPaid,
  onCancel,
}: {
  inst: InstrumentWithContact;
  showContact?: boolean;
  onMarkPaid?: (id: string) => void;
  onCancel?: (id: string) => void;
}) {
  const { t, lang } = useI18n();
  const pending = inst.status === 'PENDING';
  const urgency = urgencyColor(inst);
  const days = daysUntil(inst.maturity_due_date);
  const statusColors = {
    PENDING: [colors.warning, colors.warningLight],
    DEBITED_PAID: [colors.success, colors.successLight],
    CANCELLED: [colors.muted, colors.earthLight],
  }[inst.status];

  const confirm = (message: string, action: () => void) =>
    Alert.alert(message, '', [
      { text: t.cancel, style: 'cancel' },
      { text: t.confirm, onPress: action },
    ]);

  return (
    <Card style={{ borderStartWidth: 8, borderStartColor: urgency }}>
      <View style={styles.row}>
        <Text style={[styles.body, { flex: 1, fontWeight: '800' }]}>
          {t.instrTypes[inst.instrument_type]}
          {inst.reference_number ? ` · n° ${inst.reference_number}` : ''}
        </Text>
        <Text style={{ fontSize: font.lg, fontWeight: '800', color: colors.text }}>{formatMoney(inst.amount, lang)}</Text>
      </View>
      {showContact ? <Text style={styles.body}>👤 {inst.contact_name}</Text> : null}
      <View style={styles.row}>
        <Text style={[styles.muted, { flex: 1 }]}>
          📅 {formatDate(inst.maturity_due_date)}
          {pending && inst.instrument_type !== 'CASH' ? `  ·  ${t.inDays(days)}` : ''}
        </Text>
        <Badge text={t.instrStatus[inst.status]} color={statusColors[0]} bg={statusColors[1]} />
      </View>
      {pending && (onMarkPaid || onCancel) ? (
        <View style={[styles.row, { marginTop: 6 }]}>
          {onMarkPaid ? <Btn label={t.markPaid} style={{ flex: 2 }} onPress={() => confirm(t.confirmMarkPaid, () => onMarkPaid(inst.id))} /> : null}
          {onCancel ? <Btn label={t.cancelInstrument} variant="outline" style={{ flex: 1 }} onPress={() => confirm(t.confirmCancel, () => onCancel(inst.id))} /> : null}
        </View>
      ) : null}
    </Card>
  );
}
