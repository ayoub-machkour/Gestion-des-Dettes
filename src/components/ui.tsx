import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { ReactNode, useState } from 'react';
import { Pressable, ScrollView, StyleProp, StyleSheet, Switch, Text, TextInput, TextInputProps, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { avatarPalette, colors, font, radius } from '../theme';
import { formatDate, parseISODate, toISODate } from '../utils/dates';

/** Page défilante ; `footer` reste collé en bas (bouton principal). */
export function Screen({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={[styles.screen, footer ? { paddingBottom: 120 } : null]} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
      {footer ? <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>{footer}</View> : null}
    </View>
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

type ButtonVariant = 'primary' | 'secondary' | 'soft' | 'success' | 'danger' | 'ghost';

const BUTTON_COLORS: Record<ButtonVariant, { bg: string; fg: string; border: string }> = {
  primary: { bg: colors.primary, fg: colors.white, border: colors.primary },
  secondary: { bg: colors.surface, fg: colors.text, border: colors.border },
  soft: { bg: colors.primarySoft, fg: colors.primary, border: colors.primarySoft },
  success: { bg: colors.success, fg: colors.white, border: colors.success },
  danger: { bg: colors.dangerSoft, fg: colors.danger, border: colors.dangerSoft },
  ghost: { bg: 'transparent', fg: colors.primary, border: 'transparent' },
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'lg',
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: 'lg' | 'md';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const c = BUTTON_COLORS[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: c.bg, borderColor: c.border, minHeight: size === 'lg' ? 58 : 48 },
        style,
        pressed && styles.pressed,
        disabled && { opacity: 0.45 },
      ]}
    >
      <Text style={[styles.buttonText, { color: c.fg, fontSize: size === 'lg' ? font.md : font.sm }]} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Bouton menu (trois traits), avec un compteur optionnel. */
export function MenuButton({ onPress, badge }: { onPress: () => void; badge?: number }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
      <View style={{ gap: 4 }}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={{ width: 20, height: 2, borderRadius: 1, backgroundColor: colors.text }} />
        ))}
      </View>
      {badge ? (
        <View style={styles.badgeDot}>
          <Text style={styles.badgeDotText}>{badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

export function SectionHeader({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <View style={[styles.row, { marginTop: 8 }]}>
      <Text style={[styles.sectionTitle, { flex: 1 }]}>{title}</Text>
      {right}
    </View>
  );
}

export function ErrorText({ children }: { children?: string | null }) {
  if (!children) return null;
  return <Text style={styles.error}>{children}</Text>;
}

export function Field({ label, error, style, onFocus, onBlur, ...input }: TextInputProps & { label?: string; error?: string | null }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      {label ? <Label>{label}</Label> : null}
      <TextInput
        placeholderTextColor={colors.muted}
        onFocus={(e) => (setFocused(true), onFocus?.(e))}
        onBlur={(e) => (setFocused(false), onBlur?.(e))}
        style={[
          styles.input,
          input.multiline && styles.inputMulti,
          focused && { borderColor: colors.primary },
          error ? { borderColor: colors.danger } : null,
          style,
        ]}
        {...input}
      />
      <ErrorText>{error}</ErrorText>
    </View>
  );
}

/** Choix exclusif en barre (2-3 options), chaque option peut avoir sa couleur. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; color?: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={[styles.segment, active && { backgroundColor: o.color ?? colors.primary }]}
          >
            <Text style={[styles.segmentText, active && { color: colors.white }]} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Puces de choix ; avec `deselectable`, toucher une puce active la désélectionne. */
export function Chips<T extends string | number>({
  options,
  value,
  onChange,
  deselectable,
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T | null) => void;
  deselectable?: boolean;
}) {
  return (
    <View style={styles.chips}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            onPress={() => onChange(active && deselectable ? null : o.value)}
            style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && styles.pressed]}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>
              {active && deselectable ? '✓ ' : ''}
              {o.label}
            </Text>
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
      onValueChange: (_event, date) => onChange(toISODate(date)),
    });
  return (
    <View style={styles.field}>
      <Label>{label}</Label>
      <View style={styles.row}>
        <Pressable onPress={open} style={({ pressed }) => [styles.input, styles.dateBox, pressed && styles.pressed]}>
          <Text style={[styles.dateText, !value && { color: colors.muted }]}>{value ? formatDate(value) : clearLabel}</Text>
        </Pressable>
        {clearLabel && value ? (
          <Pressable onPress={() => onChange(null)} style={({ pressed }) => [styles.input, styles.clearBtn, pressed && styles.pressed]}>
            <Text style={{ fontSize: font.md, color: colors.muted }}>✕</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function SwitchRow({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable onPress={() => onChange(!value)} style={[styles.card, styles.row]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[styles.body, { fontWeight: '600' }]}>{label}</Text>
        {hint ? <Text style={styles.muted}>{hint}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.primary, false: colors.border }} thumbColor={colors.white} />
    </Pressable>
  );
}

export function Avatar({ name, size = 48 }: { name: string; size?: number }) {
  const initials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase() || '?';
  const hash = [...name].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const [bg, fg] = avatarPalette[hash % avatarPalette.length];
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: fg, fontWeight: '800', fontSize: size * 0.38 }}>{initials}</Text>
    </View>
  );
}

type Tone = 'danger' | 'success' | 'warning' | 'neutral' | 'primary';
const TONES: Record<Tone, [string, string]> = {
  danger: [colors.danger, colors.dangerSoft],
  success: [colors.success, colors.successSoft],
  warning: [colors.warning, colors.warningSoft],
  neutral: [colors.textSoft, colors.surfaceAlt],
  primary: [colors.primary, colors.primarySoft],
};

export function Pill({ text, tone = 'neutral' }: { text: string; tone?: Tone }) {
  const [fg, bg] = TONES[tone];
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[styles.pillText, { color: fg }]}>{text}</Text>
    </View>
  );
}

export function Empty({ title, text }: { title: string; text?: string }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 40, paddingHorizontal: 16, gap: 6 }}>
      <Text style={[styles.body, { fontWeight: '700', textAlign: 'center' }]}>{title}</Text>
      {text ? <Text style={[styles.muted, { textAlign: 'center' }]}>{text}</Text> : null}
    </View>
  );
}

export const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  screen: { padding: 20, paddingBottom: 48, gap: 16 },
  footer: {
    position: 'absolute',
    start: 0,
    end: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 14,
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 10,
  },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 8 },
  pressed: { opacity: 0.75, transform: [{ scale: 0.99 }] },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  button: { borderRadius: radius.md, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 18 },
  buttonText: { fontWeight: '700', textAlign: 'center' },
  iconButton: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeDot: {
    position: 'absolute',
    top: -2,
    end: -2,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeDotText: { color: colors.white, fontSize: 11, fontWeight: '800' },
  label: { fontSize: font.sm, fontWeight: '600', color: colors.textSoft },
  sectionTitle: { fontSize: font.lg, fontWeight: '800', color: colors.text },
  title: { fontSize: font.xxl, fontWeight: '800', color: colors.text },
  body: { fontSize: font.md, color: colors.text },
  muted: { fontSize: font.sm, color: colors.muted },
  error: { color: colors.danger, fontSize: font.sm, fontWeight: '600' },
  field: { gap: 8 },
  input: {
    minHeight: 56,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    fontSize: font.md,
    color: colors.text,
  },
  inputMulti: { minHeight: 90, textAlignVertical: 'top', paddingTop: 14 },
  dateBox: { flex: 1, justifyContent: 'center' },
  dateText: { fontSize: font.md, color: colors.text, fontWeight: '500' },
  clearBtn: { width: 56, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 0 },
  segmented: { flexDirection: 'row', backgroundColor: colors.border, borderRadius: radius.md, padding: 4, gap: 4 },
  segment: { flex: 1, minHeight: 50, borderRadius: radius.sm + 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  segmentText: { fontSize: font.md - 1, fontWeight: '700', color: colors.textSoft },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: radius.round,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: font.sm, fontWeight: '600', color: colors.text },
  chipTextActive: { color: colors.white },
  pill: { borderRadius: radius.round, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  pillText: { fontSize: font.xs, fontWeight: '700' },
});
