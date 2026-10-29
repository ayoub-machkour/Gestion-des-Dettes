import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Avatar, Button, Card, Chips, DateField, ErrorText, Field, Label, Screen, SectionHeader, styles, SwitchRow } from '../../src/components/ui';
import { createWorkEntries, getPayroll, listContacts, listWorkKinds, saveContact, updateWorkEntry, type WorkInput } from '../../src/db/repo';
import type { ContactWithBalance, PricingMode, WorkKind } from '../../src/db/types';
import { useI18n } from '../../src/i18n';
import { useAppState } from '../../src/state';
import { colors, font, radius } from '../../src/theme';
import { addDays, countWorkDays, today } from '../../src/utils/dates';
import { centsToInput, formatMoney, parseMoney, parseNumber } from '../../src/utils/money';
import { kindPrice } from '../../src/work';

/** Saisie de travail pour un ou plusieurs ouvriers ; modification d'une ligne si ?id= est fourni. */
export default function WorkEntryForm() {
  const db = useSQLiteContext();
  const router = useRouter();
  const params = useLocalSearchParams<{ contactId?: string; id?: string }>();
  const { t, lang } = useI18n();
  const { version, refresh } = useAppState();
  const editing = !!params.id;

  const [workers, setWorkers] = useState<ContactWithBalance[]>([]);
  const [selected, setSelected] = useState<string[]>(params.contactId ? [params.contactId] : []);
  const [newName, setNewName] = useState('');
  const [kinds, setKinds] = useState<WorkKind[]>([]);
  const [kindId, setKindId] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [mode, setMode] = useState<PricingMode>('DAY');
  const [unit, setUnit] = useState<string | null>(null);
  const [price, setPrice] = useState('');
  const [from, setFrom] = useState<string | null>(addDays(today(), -6));
  const [to, setTo] = useState<string | null>(today());
  const [countSaturday, setCountSaturday] = useState(true);
  const [countSunday, setCountSunday] = useState(false);
  const [date, setDate] = useState<string | null>(today());
  /** Absences (mode jour) ou quantité (mode unité), par ouvrier. */
  const [perWorker, setPerWorker] = useState<Record<string, string>>({});
  const [paidNow, setPaidNow] = useState(false);
  const [upfront, setUpfront] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useFocusEffect(
    useCallback(() => {
      listContacts(db, { type: 'EMPLOYEE' }).then(setWorkers);
      listWorkKinds(db).then(setKinds);
    }, [db, version]),
  );

  useEffect(() => {
    if (!params.id) return;
    getPayroll(db, params.id).then((p) => {
      if (!p) return;
      const m = p.pricing_mode ?? 'DAY';
      setSelected([p.contact_id]);
      setKindId(p.work_kind_id);
      setLabel(p.work_label ?? '');
      setMode(m);
      setUnit(p.unit_label);
      setPrice(centsToInput(p.daily_rate));
      setFrom(p.period_start ?? p.work_date);
      setTo(p.period_end ?? p.work_date);
      setCountSaturday(p.count_saturday !== 0);
      setCountSunday(p.count_sunday === 1);
      setDate(p.work_date);
      setPerWorker({ [p.contact_id]: m === 'DAY' ? String(p.absences ?? 0) : String(p.days_worked) });
      setUpfront(p.upfront_paid ? centsToInput(p.upfront_paid) : '');
    });
  }, [db, params.id]);

  const pickKind = (id: string | null) => {
    const k = kinds.find((x) => x.id === id);
    if (!k) return;
    setKindId(k.id);
    setLabel(k.name);
    setMode(k.mode);
    setUnit(k.unit_label);
    setPrice(centsToInput(k.price));
    setPerWorker({});
  };

  const addWorker = async () => {
    if (!newName.trim()) return;
    const id = await saveContact(db, { name: newName, type: 'EMPLOYEE' });
    setNewName('');
    setSelected((s) => [...s, id]);
    refresh();
  };
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const priceCents = parseMoney(price) ?? 0;
  const periodDays = from && to ? countWorkDays(from, to, countSaturday, countSunday) : 0;
  const quantityFor = (id: string): number => {
    const raw = perWorker[id]?.trim() ?? '';
    if (mode === 'FLAT') return 1;
    if (mode === 'UNIT') return parseNumber(raw) ?? 0;
    return Math.max(0, periodDays - (raw ? parseNumber(raw) ?? 0 : 0));
  };
  const totalFor = (id: string) => Math.round(quantityFor(id) * priceCents);
  const grandTotal = selected.reduce((sum, id) => sum + totalFor(id), 0);
  const nameOf = (id: string) => workers.find((w) => w.id === id)?.name ?? '';

  const submit = async () => {
    const e: Record<string, string> = {};
    if (!selected.length) e.workers = t.selectWorkers;
    if (!label.trim()) e.kind = t.required;
    if (!parseMoney(price)) e.price = t.invalidAmount;
    if (mode === 'DAY' && (!from || !to || to < from)) e.period = t.required;
    if (selected.some((id) => quantityFor(id) <= 0)) e.quantities = t.invalidNumber;
    const upfrontCents = upfront.trim() ? parseMoney(upfront) : 0;
    if (upfrontCents === null) e.upfront = t.invalidAmount;
    setErrors(e);
    if (Object.keys(e).length || upfrontCents === null) return;

    const work: WorkInput = {
      kindId,
      label,
      mode,
      unitLabel: unit,
      price: priceCents,
      date: (mode === 'DAY' ? to : date) ?? today(),
      periodStart: from,
      periodEnd: to,
      countSaturday,
      countSunday,
    };
    const shares = selected.map((id) => ({
      contactId: id,
      quantity: quantityFor(id),
      absences: mode === 'DAY' ? parseNumber(perWorker[id] ?? '') ?? 0 : 0,
    }));
    if (editing) await updateWorkEntry(db, params.id!, shares[0], work, upfrontCents);
    else await createWorkEntries(db, shares, work, paidNow);
    refresh();
    router.back();
  };

  return (
    <Screen
      footer={
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.muted}>
              {t.total} ({selected.length})
            </Text>
            <Text style={{ fontSize: font.xl, fontWeight: '800', color: colors.danger }}>{formatMoney(grandTotal, lang)}</Text>
          </View>
          <Button label={t.save} onPress={submit} style={{ flex: 1.3 }} />
        </View>
      }
    >
      <Stack.Screen options={{ title: editing ? t.editWorkTitle : t.newWorkTitle }} />

      {/* 1. Ouvriers */}
      {!editing ? (
        <>
          <SectionHeader
            title={`${t.workers} · ${t.selectedCount(selected.length)}`}
            right={
              workers.length > 1 ? (
                <Pressable onPress={() => setSelected(selected.length === workers.length ? [] : workers.map((w) => w.id))} hitSlop={8}>
                  <Text style={{ color: colors.primary, fontWeight: '700', fontSize: font.sm }}>{t.selectAll}</Text>
                </Pressable>
              ) : null
            }
          />
          <ErrorText>{errors.workers}</ErrorText>
          {workers.length === 0 ? <Text style={styles.muted}>{t.noWorkers}</Text> : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {workers.map((w) => {
              const on = selected.includes(w.id);
              return (
                <Pressable
                  key={w.id}
                  onPress={() => toggle(w.id)}
                  style={[styles.chip, { flexDirection: 'row', alignItems: 'center', gap: 8, paddingStart: 6 }, on && styles.chipActive]}
                >
                  <Avatar name={w.name} size={30} />
                  <Text style={[styles.chipText, on && styles.chipTextActive]}>{w.name}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.row}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={newName}
              onChangeText={setNewName}
              onSubmitEditing={addWorker}
              placeholder={t.workerName}
              returnKeyType="done"
              placeholderTextColor={colors.muted}
            />
            <Button label={`+ ${t.addWorker}`} variant="soft" onPress={addWorker} style={{ minHeight: 56 }} />
          </View>
        </>
      ) : null}

      {/* 2. Type de travail */}
      <SectionHeader
        title={t.chooseWork}
        right={
          <Pressable onPress={() => router.push('/work-kinds')} hitSlop={8}>
            <Text style={{ color: colors.primary, fontWeight: '700', fontSize: font.sm }}>{t.manage}</Text>
          </Pressable>
        }
      />
      {kinds.length === 0 && !label ? (
        <Card style={{ alignItems: 'center' }}>
          <Text style={[styles.muted, { textAlign: 'center' }]}>{t.noWorkKindsText}</Text>
          <Button label={t.defineWorkKinds} variant="soft" size="md" onPress={() => router.push('/work-kinds')} />
        </Card>
      ) : (
        <Chips
          options={kinds.map((k) => ({ value: k.id, label: `${k.name} · ${kindPrice(t, k.mode, k.price, k.unit_label, lang)}` }))}
          value={kindId}
          onChange={pickKind}
        />
      )}
      <ErrorText>{errors.kind}</ErrorText>

      {label ? (
        <>
          <Field
            label={t.priceLabel[mode] + (mode === 'UNIT' && unit ? ` (${unit})` : '')}
            value={price}
            onChangeText={setPrice}
            keyboardType="decimal-pad"
            error={errors.price}
            style={{ textAlign: 'center', fontWeight: '700' }}
          />

          {/* 3. Période (par jour) ou date */}
          {mode === 'DAY' ? (
            <View style={styles.field}>
              <Label>{t.period}</Label>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <DateField label={t.periodFrom} value={from} onChange={setFrom} />
                </View>
                <View style={{ flex: 1 }}>
                  <DateField label={t.periodTo} value={to} onChange={setTo} />
                </View>
              </View>
              <ErrorText>{errors.period}</ErrorText>
              <SwitchRow label={t.countSaturday} value={countSaturday} onChange={setCountSaturday} />
              <SwitchRow label={t.countSunday} value={countSunday} onChange={setCountSunday} />
              <View style={{ backgroundColor: colors.primarySoft, borderRadius: radius.md, padding: 12, alignItems: 'center' }}>
                <Text style={{ fontSize: font.md, fontWeight: '800', color: colors.primary }}>{t.workDays(periodDays)}</Text>
              </View>
            </View>
          ) : (
            <DateField label={t.workDate} value={date} onChange={setDate} />
          )}

          {/* 4. Détail par ouvrier : absences ou quantité */}
          {selected.length ? (
            <View style={{ gap: 8 }}>
              <ErrorText>{errors.quantities}</ErrorText>
              {selected.map((id) => (
                <Card key={id} style={{ gap: 10 }}>
                  <View style={styles.row}>
                    <Avatar name={nameOf(id)} size={36} />
                    <Text style={[styles.body, { flex: 1, fontWeight: '700' }]}>{nameOf(id)}</Text>
                    <Text style={{ fontSize: font.md, fontWeight: '800', color: colors.danger }}>{formatMoney(totalFor(id), lang)}</Text>
                  </View>
                  {mode === 'DAY' ? (
                    <View style={styles.row}>
                      <Text style={[styles.muted, { flex: 1 }]}>
                        {t.absences} → {t.daysCount(quantityFor(id))}
                      </Text>
                      <Stepper value={parseNumber(perWorker[id] ?? '') ?? 0} max={periodDays} onChange={(n) => setPerWorker((p) => ({ ...p, [id]: String(n) }))} />
                    </View>
                  ) : mode === 'UNIT' ? (
                    <View style={styles.row}>
                      <Text style={[styles.muted, { flex: 1 }]}>{t.quantityOf(unit)}</Text>
                      <TextInput
                        style={[styles.input, { width: 110, minHeight: 48, textAlign: 'center', fontWeight: '700' }]}
                        value={perWorker[id] ?? ''}
                        onChangeText={(v) => setPerWorker((p) => ({ ...p, [id]: v }))}
                        keyboardType="decimal-pad"
                        placeholder="0"
                        placeholderTextColor={colors.muted}
                      />
                    </View>
                  ) : null}
                </Card>
              ))}
            </View>
          ) : null}

          {editing ? (
            <Field label={t.paidAmount} value={upfront} onChangeText={setUpfront} keyboardType="decimal-pad" placeholder="0" error={errors.upfront} />
          ) : (
            <SwitchRow label={t.paidImmediately} value={paidNow} onChange={setPaidNow} />
          )}
        </>
      ) : null}
    </Screen>
  );
}

/** Compteur − / + par demi-journée. */
function Stepper({ value, max, onChange }: { value: number; max: number; onChange: (n: number) => void }) {
  const button = (label: string, next: number, disabled: boolean) => (
    <Pressable
      onPress={() => !disabled && onChange(next)}
      style={{
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: disabled ? colors.surfaceAlt : colors.primarySoft,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontSize: 22, fontWeight: '800', color: disabled ? colors.muted : colors.primary }}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={[styles.row, { gap: 10 }]}>
      {button('−', Math.max(0, value - 0.5), value <= 0)}
      <Text style={{ fontSize: font.lg, fontWeight: '800', color: colors.text, minWidth: 36, textAlign: 'center' }}>{value}</Text>
      {button('+', Math.min(max, value + 0.5), value >= max)}
    </View>
  );
}
