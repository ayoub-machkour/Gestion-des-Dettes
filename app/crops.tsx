import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { Card, Chips, Empty, Screen, styles } from '../src/components/ui';
import { getCropSummary } from '../src/db/repo';
import type { CropSummary } from '../src/db/types';
import { useI18n } from '../src/i18n';
import { useAppState } from '../src/state';
import { colors, font } from '../src/theme';
import { addDays, today } from '../src/utils/dates';
import { formatMoney } from '../src/utils/money';

type Period = 'SEASON' | 'YEAR' | 'ALL';

/** Bilan par culture : achats + main-d'œuvre vs ventes. */
export default function Crops() {
  const db = useSQLiteContext();
  const { t, lang } = useI18n();
  const { version } = useAppState();
  const [period, setPeriod] = useState<Period>('SEASON');
  const [rows, setRows] = useState<CropSummary[]>([]);

  useFocusEffect(
    useCallback(() => {
      const since = period === 'SEASON' ? addDays(today(), -180) : period === 'YEAR' ? addDays(today(), -365) : null;
      getCropSummary(db, since).then(setRows);
    }, [db, period, version]),
  );

  const periodLabels: Record<Period, string> = { SEASON: `6 ${lang === 'ar' ? 'أشهر' : 'mois'}`, YEAR: `12 ${lang === 'ar' ? 'شهراً' : 'mois'}`, ALL: t.filterAll };

  return (
    <Screen>
      <Text style={styles.muted}>{t.cropHint}</Text>
      <Chips<Period> options={(['SEASON', 'YEAR', 'ALL'] as const).map((p) => ({ value: p, label: periodLabels[p] }))} value={period} onChange={setPeriod} />
      {rows.length === 0 ? <Empty text={t.noCropData} /> : null}
      {rows.map((r) => {
        const cost = r.expenses + r.wages;
        const result = r.sales - cost;
        return (
          <Card key={r.crop}>
            <Text style={{ fontSize: font.lg, fontWeight: '900', color: colors.text }}>{r.crop === 'NONE' ? t.cropNone : t.cropsList[r.crop]}</Text>
            <Line label={t.expenses} value={formatMoney(r.expenses, lang)} color={colors.danger} />
            <Line label={t.wages} value={formatMoney(r.wages, lang)} color={colors.danger} />
            <Line label={t.sales} value={formatMoney(r.sales, lang)} color={colors.success} />
            <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 4 }} />
            <View style={styles.row}>
              <Text style={[styles.body, { flex: 1, fontWeight: '900' }]}>{t.result}</Text>
              <Text style={{ fontSize: font.xl, fontWeight: '900', color: result >= 0 ? colors.success : colors.danger }}>{formatMoney(result, lang)}</Text>
            </View>
          </Card>
        );
      })}
    </Screen>
  );
}

function Line({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.body, { flex: 1 }]}>{label}</Text>
      <Text style={{ fontSize: font.md, fontWeight: '800', color }}>{value}</Text>
    </View>
  );
}
