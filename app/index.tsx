import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { InstrumentCard } from '../src/components/InstrumentCard';
import { BigButton, Btn, Card, Empty, Screen, SectionTitle, styles } from '../src/components/ui';
import { getDashboard } from '../src/db/repo';
import type { DashboardData } from '../src/db/types';
import { useI18n } from '../src/i18n';
import { colors, font } from '../src/theme';
import { formatMoney } from '../src/utils/money';

export default function Dashboard() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { t, lang } = useI18n();
  const [data, setData] = useState<DashboardData | null>(null);

  useFocusEffect(
    useCallback(() => {
      getDashboard(db).then(setData);
    }, [db]),
  );

  const alert = !!data && data.dueSoonCount + data.overdueCount > 0;

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable onPress={() => router.push('/settings')} hitSlop={12}>
              <Text style={{ fontSize: 26 }}>⚙️</Text>
            </Pressable>
          ),
        }}
      />
      <Screen>
        <SummaryCard title={t.totalDebt} value={formatMoney(data?.totalDebt ?? 0, lang)} color={colors.earth} bg={colors.earthLight} onPress={() => router.push('/contacts')} />
        <SummaryCard
          title={t.dueSoon}
          value={formatMoney(data?.dueSoonAmount ?? 0, lang)}
          subtitle={t.dueSoonSub(data?.dueSoonCount ?? 0, data?.overdueCount ?? 0)}
          color={alert ? colors.danger : colors.success}
          bg={alert ? colors.dangerLight : colors.successLight}
          onPress={() => router.push('/instruments')}
        />
        <SummaryCard
          title={t.pendingWages}
          value={formatMoney(data?.pendingWages ?? 0, lang)}
          color={colors.oliveDark}
          bg={colors.oliveLight}
          onPress={() => router.push({ pathname: '/contacts', params: { type: 'EMPLOYEE' } })}
        />

        <BigButton label={t.actionCredit} color={colors.earth} onPress={() => router.push('/credit/new')} />
        <BigButton label={t.actionInstrument} color={colors.oliveDark} onPress={() => router.push('/instruments/new')} />
        <BigButton label={t.actionPayroll} color={colors.olive} onPress={() => router.push('/payroll/new')} />
        <BigButton label={t.actionPayment} color={colors.success} onPress={() => router.push('/payment')} />

        <View style={styles.row}>
          <Btn label={`👥 ${t.contacts}`} variant="outline" style={{ flex: 1 }} onPress={() => router.push('/contacts')} />
          <Btn label={`📅 ${t.calendar}`} variant="outline" style={{ flex: 1 }} onPress={() => router.push('/instruments')} />
        </View>

        <SectionTitle>{t.upcoming}</SectionTitle>
        {data?.upcoming.length ? data.upcoming.map((i) => <InstrumentCard key={i.id} inst={i} />) : <Empty text={t.noInstruments} />}
      </Screen>
    </>
  );
}

function SummaryCard({
  title,
  value,
  subtitle,
  color,
  bg,
  onPress,
}: {
  title: string;
  value: string;
  subtitle?: string;
  color: string;
  bg: string;
  onPress: () => void;
}) {
  return (
    <Card onPress={onPress} style={{ backgroundColor: bg, borderColor: color, borderWidth: 2 }}>
      <Text style={{ fontSize: font.md, fontWeight: '700', color }}>{title}</Text>
      <Text style={{ fontSize: font.xl + 4, fontWeight: '900', color: colors.text }}>{value}</Text>
      {subtitle ? <Text style={{ fontSize: font.sm + 1, fontWeight: '700', color }}>{subtitle}</Text> : null}
    </Card>
  );
}
