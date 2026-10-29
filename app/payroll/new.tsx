import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Btn, Card, Chips, DateField, ErrorText, Field, Label, Screen, SectionTitle, styles, SwitchRow } from '../../src/components/ui';
import { createPayrollGroup, listContacts, saveContact } from '../../src/db/repo';
import type { ContactWithBalance, WorkType } from '../../src/db/types';
import { useI18n } from '../../src/i18n';
import { colors, font } from '../../src/theme';
import { today } from '../../src/utils/dates';
import { formatMoney, parseMoney, parseNumber } from '../../src/utils/money';

const WORK_TYPES: WorkType[] = ['DAILY_WAGE', 'GROUP_CONTRACT', 'MONTHLY'];

/** Saisie groupée : plusieurs ouvriers × tarif × jours → une dette par ouvrier. */
export default function PayrollGroup() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { t, lang } = useI18n();
  const [workers, setWorkers] = useState<ContactWithBalance[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [newName, setNewName] = useState('');
  const [workType, setWorkType] = useState<WorkType>('DAILY_WAGE');
  const [days, setDays] = useState('1');
  const [rate, setRate] = useState('');
  const [date, setDate] = useState<string | null>(today());
  const [paidNow, setPaidNow] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const loadWorkers = useCallback(() => {
    listContacts(db, 'EMPLOYEE').then(setWorkers);
  }, [db]);
  useFocusEffect(loadWorkers);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const addWorker = async () => {
    if (!newName.trim()) return;
    const id = await saveContact(db, { name: newName, type: 'EMPLOYEE' });
    setNewName('');
    setSelected((prev) => new Set(prev).add(id));
    loadWorkers();
  };

  const daysNum = parseNumber(days);
  const rateCents = parseMoney(rate);
  const perWorker = daysNum && rateCents ? Math.round(daysNum * rateCents) : 0;
  const monthly = workType === 'MONTHLY';

  const submit = async () => {
    const e: Record<string, string> = {};
    if (selected.size === 0) e.workers = t.selectWorkers;
    if (!daysNum) e.days = t.invalidNumber;
    if (!rateCents) e.rate = t.invalidAmount;
    setErrors(e);
    if (Object.keys(e).length || !daysNum || !rateCents) return;
    await createPayrollGroup(db, { contactIds: [...selected], workType, days: daysNum, rate: rateCents, date: date ?? today(), paidNow });
    router.back();
  };

  return (
    <Screen>
      <View style={styles.field}>
        <Label>{t.type}</Label>
        <Chips options={WORK_TYPES.map((v) => ({ value: v, label: t.workTypes[v] }))} value={workType} onChange={setWorkType} />
      </View>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Field label={monthly ? t.monthsWorked : t.daysWorked} value={days} onChangeText={setDays} keyboardType="decimal-pad" error={errors.days} />
        </View>
        <View style={{ flex: 1.3 }}>
          <Field label={monthly ? t.monthlyRate : t.dailyRate} value={rate} onChangeText={setRate} keyboardType="decimal-pad" placeholder="0" error={errors.rate} />
        </View>
      </View>
      <DateField label={t.workDate} value={date} onChange={setDate} />

      <SectionTitle
        right={
          workers.length ? (
            <Pressable onPress={() => setSelected(selected.size === workers.length ? new Set() : new Set(workers.map((w) => w.id)))} hitSlop={8}>
              <Text style={{ color: colors.olive, fontWeight: '800', fontSize: font.md - 1 }}>{t.selectAll}</Text>
            </Pressable>
          ) : null
        }
      >
        {`${t.workers} · ${t.selectedCount(selected.size)}`}
      </SectionTitle>
      <ErrorText>{errors.workers}</ErrorText>
      {workers.length === 0 ? <Text style={styles.muted}>{t.noWorkers}</Text> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {workers.map((w) => {
          const on = selected.has(w.id);
          return (
            <Pressable
              key={w.id}
              onPress={() => toggle(w.id)}
              style={[styles.chip, { minHeight: 54, flexBasis: '47%', flexGrow: 1 }, on && styles.chipActive]}
            >
              <Text style={[styles.chipText, on && styles.chipTextActive]} numberOfLines={1}>
                {on ? '☑ ' : '☐ '}
                {w.name}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.row}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          value={newName}
          onChangeText={setNewName}
          placeholder={t.workerName}
          placeholderTextColor={colors.muted}
          onSubmitEditing={addWorker}
          returnKeyType="done"
        />
        <Btn label={`+ ${t.addWorker}`} variant="earth" onPress={addWorker} style={{ minHeight: 56 }} />
      </View>

      <Card style={{ backgroundColor: colors.oliveLight, borderColor: colors.olive, borderWidth: 2 }}>
        <View style={styles.row}>
          <Text style={[styles.body, { flex: 1 }]}>{t.perWorker}</Text>
          <Text style={[styles.body, { fontWeight: '800' }]}>{formatMoney(perWorker, lang)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={[styles.body, { flex: 1, fontWeight: '800' }]}>
            {t.groupTotal} ({selected.size})
          </Text>
          <Text style={{ fontSize: font.xl, fontWeight: '900', color: colors.oliveDark }}>{formatMoney(perWorker * selected.size, lang)}</Text>
        </View>
      </Card>
      <SwitchRow label={t.paidImmediately} value={paidNow} onChange={setPaidNow} />
      <Btn label={t.save} onPress={submit} />
    </Screen>
  );
}
