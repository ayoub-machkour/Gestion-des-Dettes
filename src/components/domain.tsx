import { Pressable, Text, View } from 'react-native';
import type { Crop, Direction } from '../db/types';
import { useI18n } from '../i18n';
import { colors, font, radius } from '../theme';
import { daysUntil } from '../utils/dates';
import { Badge, Chips, Label, styles } from './ui';

export const DIRECTION_COLORS: Record<Direction, { fg: string; bg: string; dot: string }> = {
  PAYABLE: { fg: colors.danger, bg: colors.dangerLight, dot: '🔴' },
  RECEIVABLE: { fg: colors.success, bg: colors.successLight, dot: '🟢' },
};

/** Deux grands boutons rouge / vert : « Je dois » ou « On me doit ». */
export function DirectionToggle({
  value,
  onChange,
  labels,
  subtitles,
}: {
  value: Direction;
  onChange: (d: Direction) => void;
  labels?: Record<Direction, string>;
  subtitles?: Record<Direction, string> | null;
}) {
  const { t } = useI18n();
  const l = labels ?? { PAYABLE: `🔴 ${t.iOwe}`, RECEIVABLE: `🟢 ${t.owedToMe}` };
  const sub = subtitles === undefined ? { PAYABLE: t.iOweSub, RECEIVABLE: t.owedToMeSub } : subtitles;
  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      {(['PAYABLE', 'RECEIVABLE'] as const).map((d) => {
        const active = value === d;
        const c = DIRECTION_COLORS[d];
        return (
          <Pressable
            key={d}
            onPress={() => onChange(d)}
            style={({ pressed }) => [
              {
                flex: 1,
                minHeight: 76,
                borderRadius: radius,
                borderWidth: 3,
                borderColor: active ? c.fg : colors.border,
                backgroundColor: active ? c.fg : colors.card,
                padding: 10,
                justifyContent: 'center',
                gap: 2,
              },
              pressed && styles.pressed,
            ]}
          >
            <Text style={{ fontSize: font.md + 1, fontWeight: '900', color: active ? colors.white : c.fg, textAlign: 'center' }}>{l[d]}</Text>
            {sub ? (
              <Text style={{ fontSize: font.sm - 1, color: active ? colors.white : colors.muted, textAlign: 'center' }}>{sub[d]}</Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const CROPS: Crop[] = ['TOMATO', 'GREEN_BEANS', 'CUCUMBER', 'SWEET_PEPPER', 'OTHER'];

export function CropPicker({ value, onChange }: { value: Crop | null; onChange: (c: Crop | null) => void }) {
  const { t } = useI18n();
  return (
    <View style={styles.field}>
      <Label>{t.crop}</Label>
      <Chips<Crop | 'NONE'>
        options={[{ value: 'NONE', label: t.cropNone }, ...CROPS.map((c) => ({ value: c, label: t.cropsList[c] }))]}
        value={value ?? 'NONE'}
        onChange={(v) => onChange(v === 'NONE' ? null : v)}
      />
    </View>
  );
}

/** Compteur de jours : en retard depuis N jours / à payer dans N jours / ouvert depuis N jours. */
export function LateBadge({ due, date, rest, compact }: { due: string | null; date: string; rest: number; compact?: boolean }) {
  const { t } = useI18n();
  if (rest <= 0) return null;
  if (due) {
    const d = daysUntil(due);
    if (d < 0) return <Badge text={`⏱ ${t.lateBy(-d)}`} color={colors.white} bg={colors.danger} />;
    if (compact && d > 7) return null;
    return <Badge text={`⏳ ${t.dueIn(d)}`} color={d <= 3 ? colors.warning : colors.muted} bg={d <= 3 ? colors.warningLight : colors.earthLight} />;
  }
  if (compact) return null;
  return <Badge text={`🕐 ${t.since(-daysUntil(date))}`} color={colors.muted} bg={colors.earthLight} />;
}
