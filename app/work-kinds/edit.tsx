import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { Button, Chips, Field, Label, Screen, Segmented, styles } from '../../src/components/ui';
import { deleteWorkKind, getWorkKind, saveWorkKind } from '../../src/db/repo';
import type { PricingMode } from '../../src/db/types';
import { useI18n } from '../../src/i18n';
import { useAppState } from '../../src/state';
import { centsToInput, parseMoney } from '../../src/utils/money';

/** Type de travail : nom, mode de paiement (jour / unité / forfait), unité et prix. */
export default function WorkKindForm() {
  const db = useSQLiteContext();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; name?: string; mode?: PricingMode; unit?: string }>();
  const { t } = useI18n();
  const { refresh } = useAppState();
  const [name, setName] = useState(params.name ?? '');
  const [mode, setMode] = useState<PricingMode>(params.mode ?? 'DAY');
  const [unit, setUnit] = useState(params.unit ?? '');
  const [price, setPrice] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!params.id) return;
    getWorkKind(db, params.id).then((k) => {
      if (!k) return;
      setName(k.name);
      setMode(k.mode);
      setUnit(k.unit_label ?? '');
      setPrice(centsToInput(k.price));
    });
  }, [db, params.id]);

  const submit = async () => {
    const e: Record<string, string> = {};
    const cents = parseMoney(price);
    if (!name.trim()) e.name = t.required;
    if (mode === 'UNIT' && !unit.trim()) e.unit = t.required;
    if (cents === null) e.price = t.invalidAmount;
    setErrors(e);
    if (Object.keys(e).length || cents === null) return;
    await saveWorkKind(db, { name, mode, unit_label: unit, price: cents }, params.id);
    refresh();
    router.back();
  };

  const askDelete = () =>
    Alert.alert(t.deleteWorkKind, t.deleteWorkKindConfirm, [
      { text: t.cancel, style: 'cancel' },
      {
        text: t.delete,
        style: 'destructive',
        onPress: async () => {
          await deleteWorkKind(db, params.id!);
          refresh();
          router.back();
        },
      },
    ]);

  return (
    <Screen footer={<Button label={t.save} onPress={submit} />}>
      <Stack.Screen options={{ title: params.id ? t.editWorkKind : t.newWorkKindTitle }} />
      <Field label={t.workKindName} value={name} onChangeText={setName} placeholder={t.workKindNamePlaceholder} error={errors.name} style={{ fontSize: 20, minHeight: 62 }} />
      <View style={styles.field}>
        <Label>{t.pricingQuestion}</Label>
        <Segmented<PricingMode>
          options={(['DAY', 'UNIT', 'FLAT'] as const).map((m) => ({ value: m, label: t.pricingModes[m] }))}
          value={mode}
          onChange={setMode}
        />
      </View>
      {mode === 'UNIT' ? (
        <View style={styles.field}>
          <Field label={t.unitName} value={unit} onChangeText={setUnit} placeholder={t.unitPlaceholder} error={errors.unit} />
          <Chips options={t.unitSuggestions.map((u) => ({ value: u, label: u }))} value={unit} onChange={(u) => u && setUnit(u)} />
        </View>
      ) : null}
      <Field
        label={t.priceLabel[mode]}
        value={price}
        onChangeText={setPrice}
        keyboardType="decimal-pad"
        placeholder="0"
        error={errors.price}
        style={{ fontSize: 22, fontWeight: '800', textAlign: 'center' }}
      />
      {params.id ? <Button label={t.deleteWorkKind} variant="danger" size="md" onPress={askDelete} style={{ marginTop: 24 }} /> : null}
    </Screen>
  );
}
