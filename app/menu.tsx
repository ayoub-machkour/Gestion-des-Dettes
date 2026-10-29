import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { I18nManager, Pressable, Text, View } from 'react-native';
import { Pill, Screen, styles } from '../src/components/ui';
import { countDueInstruments } from '../src/db/repo';
import { useI18n } from '../src/i18n';
import { colors, font, radius } from '../src/theme';

type MenuTarget = '/instruments' | '/payroll/new' | '/work-kinds' | '/history' | '/settings';

export default function Menu() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { t } = useI18n();
  const [dueCount, setDueCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      countDueInstruments(db).then(setDueCount);
    }, [db]),
  );

  const items: { title: string; sub: string; to: MenuTarget; badge?: number }[] = [
    { title: t.calendar, sub: t.calendarSub, to: '/instruments', badge: dueCount },
    { title: t.groupPayroll, sub: t.groupPayrollSub, to: '/payroll/new' },
    { title: t.workKinds, sub: t.workKindsSub, to: '/work-kinds' },
    { title: t.history, sub: t.historySub, to: '/history' },
    { title: t.settings, sub: t.settingsSub, to: '/settings' },
  ];

  return (
    <Screen>
      <View style={[styles.card, { padding: 6 }]}>
        {items.map((item, index) => (
          <Pressable
            key={item.to}
            onPress={() => router.push(item.to)}
            style={({ pressed }) => [
              styles.row,
              { padding: 14, borderRadius: radius.md },
              index > 0 && { borderTopWidth: 1, borderTopColor: colors.border },
              pressed && { backgroundColor: colors.surfaceAlt },
            ]}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontSize: font.md, fontWeight: '700', color: colors.text }}>{item.title}</Text>
              <Text style={styles.muted}>{item.sub}</Text>
            </View>
            {item.badge ? <Pill text={String(item.badge)} tone="danger" /> : null}
            <Text style={{ fontSize: font.xl, color: colors.muted }}>{I18nManager.isRTL ? '‹' : '›'}</Text>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}
