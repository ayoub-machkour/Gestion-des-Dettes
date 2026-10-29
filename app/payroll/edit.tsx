import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { PersonHeader } from '../../src/components/PersonHeader';
import { Button, DateField, Field, Screen, Segmented, styles } from '../../src/components/ui';
import { getPayroll, updatePayroll } from '../../src/db/repo';
import type { WorkType } from '../../src/db/types';
import { useI18n } from '../../src/i18n';
import { useAppState } from '../../src/state';
import { colors, font } from '../../src/theme';
import { today } from '../../src/utils/dates';
import { centsToInput, formatMoney, parseMoney, parseNumber } from '../../src/utils/money';

export default function PayrollEdit() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang } = useI18n();
  const { refresh } = useAppState();
  const [contactId, setContactId] = useState<string | null>(null);
  const [workType, setWorkType] = useState<WorkType>('DAILY_WAGE');
  const [days, setDays] = useState('');
  const [rate, setRate] = useState('');
  const [upfront, setUpfront] = useState('');
  const [date, setDate] = useState<string | null>(today());
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    getPayroll(db, id).then((p) => {
      if (!p) return;
      setContactId(p.contact_id);
      setWorkType(p.work_type);
      setDays(String(p.days_worked).replace('.', ','));
      setRate(centsToInput(p.daily_rate));
      setUpfront(p.upfront_paid ? centsToInput(p.upfront_paid) : '');
      setDate(p.work_date);
    });
  }, [db, id]);

  const daysNum = parseNumber(days);
  const rateCents = parseMoney(rate);
  const totalDue = daysNum && rateCents ? Math.round(daysNum * rateCents) : 0;
  const monthly = workType === 'MONTHLY';

  const submit = async () => {
    const e: Record<string, string> = {};
    const upfrontCents = upfront.trim() ? parseMoney(upfront) : 0;
    if (!daysNum) e.days = t.invalidNumber;
    if (!rateCents) e.rate = t.invalidAmount;
    if (upfrontCents === null) e.upfront = t.invalidAmount;
    setErrors(e);
    if (Object.keys(e).length || !daysNum || !rateCents || upfrontCents === null) return;
    await updatePayroll(db, id, { workType, days: daysNum, rate: rateCents, date: date ?? today(), upfrontPaid: upfrontCents });
    refresh();
    router.back();
  };

  return (
    <Screen
      footer={
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.muted}>{t.total}</Text>
            <Text style={{ fontSize: font.xl, fontWeight: '800', color: colors.danger }}>{formatMoney(totalDue, lang)}</Text>
          </View>
          <Button label={t.save} onPress={submit} style={{ flex: 1.3 }} />
        </View>
      }
    >
      {contactId ? <PersonHeader contactId={contactId} /> : null}
      <Segmented<WorkType>
        options={(['DAILY_WAGE', 'GROUP_CONTRACT', 'MONTHLY'] as const).map((v) => ({ value: v, label: t.workTypes[v] }))}
        value={workType}
        onChange={setWorkType}
      />
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Field label={monthly ? t.monthsWorked : t.daysWorked} value={days} onChangeText={setDays} keyboardType="decimal-pad" error={errors.days} style={{ textAlign: 'center' }} />
        </View>
        <View style={{ flex: 1.3 }}>
          <Field label={monthly ? t.monthlyRate : t.dailyRate} value={rate} onChangeText={setRate} keyboardType="decimal-pad" error={errors.rate} style={{ textAlign: 'center' }} />
        </View>
      </View>
      <DateField label={t.workDate} value={date} onChange={setDate} />
      <Field label={t.paidAmount} value={upfront} onChangeText={setUpfront} keyboardType="decimal-pad" placeholder="0" error={errors.upfront} />
    </Screen>
  );
}
