import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Avatar, Button, DateField, ErrorText, Field, Label, Screen, SectionHeader, Segmented, styles, SwitchRow } from '../../src/components/ui';
import { createPayrollGroup, listContacts, saveContact } from '../../src/db/repo';
import type { ContactWithBalance, WorkType } from '../../src/db/types';
import { useI18n } from '../../src/i18n';
import { useAppState } from '../../src/state';
import { colors, font, radius } from '../../src/theme';
import { today } from '../../src/utils/dates';
import { formatMoney, parseMoney, parseNumber } from '../../src/utils/money';

/** Journées de travail : un ou plusieurs ouvriers × prix par jour × nombre de jours. */
export default function PayrollGroup() {
  const db = useSQLiteContext();
  const router = useRouter();
  const params = useLocalSearchParams<{ contactId?: string }>();
  const { t, lang } = useI18n();
  const { version, refresh } = useAppState();
  const [workers, setWorkers] = useState<ContactWithBalance[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set(params.contactId ? [params.contactId] : []));
  const [newName, setNewName] = useState('');
  const [workType, setWorkType] = useState<WorkType>('DAILY_WAGE');
  const [days, setDays] = useState('1');
  const [rate, setRate] = useState('');
  const [date, setDate] = useState<string | null>(today());
  const [paidNow, setPaidNow] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useFocusEffect(
    useCallback(() => {
      listContacts(db, { type: 'EMPLOYEE' }).then(setWorkers);
    }, [db, version]),
  );

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
    refresh();
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
    await createPayrollGroup(db, [...selected], { workType, days: daysNum, rate: rateCents, date: date ?? today(), paidNow });
    refresh();
    router.back();
  };

  return (
    <Screen
      footer={
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.muted}>
              {t.groupTotal} ({selected.size})
            </Text>
            <Text style={{ fontSize: font.xl, fontWeight: '800', color: colors.danger }}>{formatMoney(perWorker * selected.size, lang)}</Text>
          </View>
          <Button label={t.save} onPress={submit} style={{ flex: 1.3 }} />
        </View>
      }
    >
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
          <Field label={monthly ? t.monthlyRate : t.dailyRate} value={rate} onChangeText={setRate} keyboardType="decimal-pad" placeholder="0" error={errors.rate} style={{ textAlign: 'center' }} />
        </View>
      </View>
      {perWorker ? (
        <Text style={[styles.muted, { textAlign: 'center' }]}>
          {t.perWorker} : {formatMoney(perWorker, lang)}
        </Text>
      ) : null}
      <DateField label={t.workDate} value={date} onChange={setDate} />

      <SectionHeader
        title={`${t.workers} · ${t.selectedCount(selected.size)}`}
        right={
          workers.length > 1 ? (
            <Pressable onPress={() => setSelected(selected.size === workers.length ? new Set() : new Set(workers.map((w) => w.id)))} hitSlop={8}>
              <Text style={{ color: colors.primary, fontWeight: '700', fontSize: font.sm }}>{t.selectAll}</Text>
            </Pressable>
          ) : null
        }
      />
      <ErrorText>{errors.workers}</ErrorText>
      {workers.length === 0 ? <Text style={styles.muted}>{t.noWorkers}</Text> : null}
      <View style={{ gap: 8 }}>
        {workers.map((w) => {
          const on = selected.has(w.id);
          return (
            <Pressable
              key={w.id}
              onPress={() => toggle(w.id)}
              style={[styles.card, styles.row, { paddingVertical: 12 }, on && { borderWidth: 2, borderColor: colors.primary, backgroundColor: colors.primarySoft }]}
            >
              <Avatar name={w.name} size={40} />
              <Text style={[styles.body, { flex: 1, fontWeight: '600' }]}>{w.name}</Text>
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: radius.sm,
                  borderWidth: 2,
                  borderColor: on ? colors.primary : colors.border,
                  backgroundColor: on ? colors.primary : colors.surface,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {on ? <Text style={{ color: colors.white, fontWeight: '800' }}>✓</Text> : null}
              </View>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.field}>
        <Label>{t.workerName}</Label>
        <View style={styles.row}>
          <TextInput style={[styles.input, { flex: 1 }]} value={newName} onChangeText={setNewName} onSubmitEditing={addWorker} returnKeyType="done" placeholderTextColor={colors.muted} />
          <Button label={`+ ${t.addWorker}`} variant="soft" onPress={addWorker} style={{ minHeight: 56 }} />
        </View>
      </View>
      <SwitchRow label={t.paidImmediately} value={paidNow} onChange={setPaidNow} />
    </Screen>
  );
}
