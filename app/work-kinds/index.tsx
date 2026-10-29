import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Button, Chips, Empty, Label, Screen, styles } from '../../src/components/ui';
import { listWorkKinds } from '../../src/db/repo';
import type { WorkKind } from '../../src/db/types';
import { useI18n } from '../../src/i18n';
import { useAppState } from '../../src/state';
import { colors, font } from '../../src/theme';
import { kindPrice } from '../../src/work';

/** Catalogue des travaux et de leurs prix, défini une fois et réutilisé dans la paie. */
export default function WorkKinds() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { t, lang } = useI18n();
  const { version } = useAppState();
  const [kinds, setKinds] = useState<WorkKind[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      listWorkKinds(db).then(setKinds);
    }, [db, version]),
  );

  const existing = new Set((kinds ?? []).map((k) => k.name.toLowerCase()));
  const presets = t.workPresets.filter((p) => !existing.has(p.name.toLowerCase()));

  return (
    <Screen footer={<Button label={t.newWorkKind} onPress={() => router.push('/work-kinds/edit')} />}>
      {kinds && kinds.length === 0 ? <Empty icon="🧰" title={t.emptyWorkKindsTitle} text={t.emptyWorkKindsText} /> : null}
      {kinds?.map((k) => (
        <Pressable
          key={k.id}
          onPress={() => router.push({ pathname: '/work-kinds/edit', params: { id: k.id } })}
          style={({ pressed }) => [styles.card, styles.row, pressed && styles.pressed]}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontSize: font.md, fontWeight: '700', color: colors.text }}>{k.name}</Text>
            <Text style={styles.muted}>{t.pricingModes[k.mode]}</Text>
          </View>
          <Text style={{ fontSize: font.md, fontWeight: '800', color: colors.primary }}>{kindPrice(t, k.mode, k.price, k.unit_label, lang)}</Text>
        </Pressable>
      ))}
      {presets.length ? (
        <View style={[styles.field, { marginTop: 8 }]}>
          <Label>{t.suggestionsTitle}</Label>
          <Chips
            options={presets.map((p) => ({ value: p.name, label: `+ ${p.name}` }))}
            value={null}
            onChange={(name) => {
              const p = presets.find((x) => x.name === name);
              if (p) router.push({ pathname: '/work-kinds/edit', params: { name: p.name, mode: p.mode, unit: p.unit ?? '' } });
            }}
          />
        </View>
      ) : null}
    </Screen>
  );
}
