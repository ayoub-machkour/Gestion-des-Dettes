import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { CropPicker } from '../../src/components/domain';
import { Btn, Card, Chips, DateField, Field, Label, Screen, styles } from '../../src/components/ui';
import { getContact, getPayroll, updatePayroll } from '../../src/db/repo';
import type { Crop, WorkType } from '../../src/db/types';
import { useI18n } from '../../src/i18n';
import { useAppState } from '../../src/state';
import { colors, font } from '../../src/theme';
import { today } from '../../src/utils/dates';
import { centsToInput, formatMoney, parseMoney, parseNumber } from '../../src/utils/money';

const WORK_TYPES: WorkType[] = ['DAILY_WAGE', 'GROUP_CONTRACT', 'MONTHLY'];

export default function PayrollEdit() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang } = useI18n();
  const { done } = useAppState();
  const [worker, setWorker] = useState('');
  const [workType, setWorkType] = useState<WorkType>('DAILY_WAGE');
  const [crop, setCrop] = useState<Crop | null>(null);
  const [days, setDays] = useState('');
  const [rate, setRate] = useState('');
  const [upfront, setUpfront] = useState('');
  const [date, setDate] = useState<string | null>(today());
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    getPayroll(db, id).then(async (p) => {
      if (!p) return;
      setWorkType(p.work_type);
      setCrop(p.crop);
      setDays(String(p.days_worked).replace('.', ','));
      setRate(centsToInput(p.daily_rate));
      setUpfront(p.upfront_paid ? centsToInput(p.upfront_paid) : '');
      setDate(p.work_date);
      setWorker((await getContact(db, p.contact_id))?.name ?? '');
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
    await updatePayroll(db, id, { workType, crop, days: daysNum, rate: rateCents, date: date ?? today(), upfrontPaid: upfrontCents });
    done();
    router.back();
  };

  return (
    <Screen>
      <Text style={styles.sectionTitle}>👷 {worker}</Text>
      <View style={styles.field}>
        <Label>{t.type}</Label>
        <Chips options={WORK_TYPES.map((v) => ({ value: v, label: t.workTypes[v] }))} value={workType} onChange={setWorkType} />
      </View>
      <CropPicker value={crop} onChange={setCrop} />
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Field label={monthly ? t.monthsWorked : t.daysWorked} value={days} onChangeText={setDays} keyboardType="decimal-pad" error={errors.days} />
        </View>
        <View style={{ flex: 1.3 }}>
          <Field label={monthly ? t.monthlyRate : t.dailyRate} value={rate} onChangeText={setRate} keyboardType="decimal-pad" error={errors.rate} />
        </View>
      </View>
      <Field label={t.upfront.PAYABLE} value={upfront} onChangeText={setUpfront} keyboardType="decimal-pad" placeholder="0" error={errors.upfront} />
      <DateField label={t.workDate} value={date} onChange={setDate} />
      <Card style={{ backgroundColor: colors.oliveLight }}>
        <View style={styles.row}>
          <Text style={[styles.body, { flex: 1, fontWeight: '800' }]}>{t.total}</Text>
          <Text style={{ fontSize: font.xl, fontWeight: '900', color: colors.oliveDark }}>{formatMoney(totalDue, lang)}</Text>
        </View>
      </Card>
      <Btn label={t.save} onPress={submit} />
    </Screen>
  );
}
