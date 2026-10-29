import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { ReactNode } from 'react';
import { Pressable, ScrollView, StyleProp, StyleSheet, Switch, Text, TextInput, TextInputProps, View, ViewStyle } from 'react-native';
import { colors, font, radius } from '../theme';
import { formatDate, parseISODate, toISODate } from '../utils/dates';

export function Screen({ children }: { children: ReactNode }) {
  return (
    <ScrollView style={styles.screenRoot} contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  if (!onPress) return <View style={[styles.card, style]}>{children}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, style, pressed && styles.pressed]}>
      {children}
    </Pressable>
  );
}

export function BigButton({ label, onPress, color = colors.olive, disabled }: { label: string; onPress: () => void; color?: string; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.bigBtn, { backgroundColor: color }, (pressed || disabled) && styles.pressed]}
    >
      <Text style={styles.bigBtnText}>{label}</Text>
    </Pressable>
  );
}

type BtnVariant = 'primary' | 'outline' | 'danger' | 'earth';

export function Btn({
  label,
  onPress,
  variant = 'primary',
  style,
  disabled,
}: {
  label: string;
  onPress: () => void;
  variant?: BtnVariant;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}) {
  const bg = { primary: colors.olive, outline: colors.card, danger: colors.danger, earth: colors.earth }[variant];
  const fg = variant === 'outline' ? colors.olive : colors.white;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: bg, borderColor: variant === 'outline' ? colors.olive : bg },
        style,
        (pressed || disabled) && styles.pressed,
      ]}
    >
      <Text style={[styles.btnText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.sectionTitle, { flex: 1 }]}>{children}</Text>
      {right}
    </View>
  );
}

export function ErrorText({ children }: { children?: string | null }) {
  if (!children) return null;
  return <Text style={styles.error}>{children}</Text>;
}

export function Field({ label, error, style, ...input }: TextInputProps & { label: string; error?: string | null }) {
  return (
    <View style={styles.field}>
      <Label>{label}</Label>
      <TextInput
        placeholderTextColor={colors.muted}
        style={[styles.input, input.multiline && styles.inputMulti, error ? { borderColor: colors.danger } : null, style]}
        {...input}
      />
      <ErrorText>{error}</ErrorText>
    </View>
  );
}

export function Chips<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.chips}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable key={String(o.value)} onPress={() => onChange(o.value)} style={[styles.chip, active && styles.chipActive]}>
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function DateField({
  label,
  value,
  onChange,
  clearLabel,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
  /** Si fourni, la date est optionnelle et peut être effacée. */
  clearLabel?: string;
}) {
  const open = () =>
    DateTimePickerAndroid.open({
      value: value ? parseISODate(value) : new Date(),
      mode: 'date',
      onChange: (event, date) => {
        if (event.type === 'set' && date) onChange(toISODate(date));
      },
    });
  return (
    <View style={styles.field}>
      <Label>{label}</Label>
      <View style={styles.row}>
        <Pressable onPress={open} style={({ pressed }) => [styles.input, styles.dateBox, pressed && styles.pressed]}>
          <Text style={styles.dateText}>📅 {value ? formatDate(value) : clearLabel}</Text>
        </Pressable>
        {clearLabel && value ? <Btn label="✕" variant="outline" onPress={() => onChange(null)} style={styles.clearBtn} /> : null}
      </View>
    </View>
  );
}

export function SwitchRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable onPress={() => onChange(!value)} style={[styles.card, styles.row]}>
      <Text style={[styles.body, { flex: 1 }]}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.olive, false: colors.border }} thumbColor={colors.white} />
    </Pressable>
  );
}

export function Empty({ text }: { text: string }) {
  return <Text style={styles.empty}>{text}</Text>;
}

export function Badge({ text, color, bg }: { text: string; color: string; bg: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.badgeText, { color }]}>{text}</Text>
    </View>
  );
}

export const styles = StyleSheet.create({
  screenRoot: { flex: 1, backgroundColor: colors.cream },
  screen: { padding: 16, paddingBottom: 48, gap: 14 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 6,
  },
  pressed: { opacity: 0.7 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bigBtn: {
    minHeight: 68,
    borderRadius: radius,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    elevation: 2,
  },
  bigBtnText: { color: colors.white, fontSize: font.lg - 1, fontWeight: '800', textAlign: 'center' },
  btn: {
    minHeight: 52,
    borderRadius: radius,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  btnText: { fontSize: font.md, fontWeight: '700' },
  label: { fontSize: font.sm + 1, fontWeight: '700', color: colors.muted },
  sectionTitle: { fontSize: font.lg, fontWeight: '800', color: colors.text, marginTop: 6 },
  body: { fontSize: font.md, color: colors.text },
  muted: { fontSize: font.sm, color: colors.muted },
  error: { color: colors.danger, fontSize: font.sm, fontWeight: '600' },
  field: { gap: 6 },
  input: {
    minHeight: 56,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius,
    paddingHorizontal: 14,
    fontSize: font.md + 1,
    color: colors.text,
  },
  inputMulti: { minHeight: 90, textAlignVertical: 'top', paddingTop: 12 },
  dateBox: { flex: 1, justifyContent: 'center' },
  dateText: { fontSize: font.md + 1, color: colors.text, fontWeight: '600' },
  clearBtn: { minHeight: 56, width: 56, paddingHorizontal: 0 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 46,
    paddingHorizontal: 16,
    borderRadius: 23,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.card,
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: colors.olive, borderColor: colors.olive },
  chipText: { fontSize: font.md - 1, fontWeight: '700', color: colors.text },
  chipTextActive: { color: colors.white },
  empty: { textAlign: 'center', color: colors.muted, fontSize: font.md, paddingVertical: 24 },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  badgeText: { fontSize: font.sm - 1, fontWeight: '800' },
});
