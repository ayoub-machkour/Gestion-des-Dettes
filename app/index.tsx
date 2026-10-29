import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { DIRECTION_COLORS, LateBadge } from '../src/components/domain';
import { InstrumentCard } from '../src/components/InstrumentCard';
import { BigButton, Btn, Card, Empty, Screen, SectionTitle, styles } from '../src/components/ui';
import { getDashboard } from '../src/db/repo';
import type { DashboardData } from '../src/db/types';
import { useI18n } from '../src/i18n';
import { useAppState } from '../src/state';
import { colors, font } from '../src/theme';
import { formatMoney } from '../src/utils/money';

export default function Dashboard() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { t, lang } = useI18n();
  const { version } = useAppState();
  const [data, setData] = useState<DashboardData | null>(null);

  useFocusEffect(
    useCallback(() => {
      getDashboard(db).then(setData);
    }, [db, version]),
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
        <View style={styles.row}>
          <SummaryCard
            title={`🔴 ${t.iOwe}`}
            value={formatMoney(data?.payableTotal ?? 0, lang)}
            subtitle={t.lateCount(data?.payableLate ?? 0)}
            color={colors.danger}
            bg={colors.dangerLight}
            onPress={() => router.push({ pathname: '/contacts', params: { direction: 'PAYABLE' } })}
          />
          <SummaryCard
            title={`🟢 ${t.owedToMe}`}
            value={formatMoney(data?.receivableTotal ?? 0, lang)}
            subtitle={t.lateCount(data?.receivableLate ?? 0)}
            color={colors.success}
            bg={colors.successLight}
            onPress={() => router.push({ pathname: '/contacts', params: { direction: 'RECEIVABLE' } })}
          />
        </View>
        <View style={styles.row}>
          <SummaryCard
            title={t.dueSoon}
            value={formatMoney(data?.dueSoonAmount ?? 0, lang)}
            subtitle={t.dueSoonSub(data?.dueSoonCount ?? 0, data?.overdueCount ?? 0)}
            color={alert ? colors.danger : colors.oliveDark}
            bg={alert ? colors.dangerLight : colors.oliveLight}
            onPress={() => router.push('/instruments')}
          />
          <SummaryCard
            title={t.pendingWages}
            value={formatMoney(data?.pendingWages ?? 0, lang)}
            color={colors.earth}
            bg={colors.earthLight}
            onPress={() => router.push({ pathname: '/contacts', params: { type: 'EMPLOYEE' } })}
          />
        </View>

        <BigButton label={t.actionCredit} color={colors.earth} onPress={() => router.push('/credit/new')} />
        <BigButton label={t.actionInstrument} color={colors.oliveDark} onPress={() => router.push('/instruments/new')} />
        <BigButton label={t.actionPayroll} color={colors.olive} onPress={() => router.push('/payroll/new')} />
        <BigButton label={t.actionPayment} color={colors.success} onPress={() => router.push('/payment')} />

        <View style={styles.row}>
          <Btn label={`👥 ${t.contacts}`} variant="outline" style={{ flex: 1 }} onPress={() => router.push('/contacts')} />
          <Btn label={`📅 ${t.calendar}`} variant="outline" style={{ flex: 1 }} onPress={() => router.push('/instruments')} />
        </View>
        <View style={styles.row}>
          <Btn label={`🕘 ${t.history}`} variant="outline" style={{ flex: 1 }} onPress={() => router.push('/history')} />
          <Btn label={`🍅 ${t.crops}`} variant="outline" style={{ flex: 1 }} onPress={() => router.push('/crops')} />
        </View>

        {data?.late.length ? (
          <>
            <SectionTitle>{t.lateTitle}</SectionTitle>
            {data.late.map((l) => (
              <Card
                key={l.id}
                onPress={() => router.push({ pathname: '/operation', params: { kind: 'T', id: l.id } })}
                style={{ borderStartWidth: 8, borderStartColor: DIRECTION_COLORS[l.direction].fg }}
              >
                <View style={styles.row}>
                  <Text style={[styles.body, { flex: 1, fontWeight: '800' }]} numberOfLines={1}>
                    {DIRECTION_COLORS[l.direction].dot} {l.contact_name}
                  </Text>
                  <Text style={{ fontWeight: '900', fontSize: font.md + 1, color: DIRECTION_COLORS[l.direction].fg }}>{formatMoney(l.rest, lang)}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={[styles.muted, { flex: 1 }]} numberOfLines={1}>
                    {l.description}
                  </Text>
                  <LateBadge due={l.due_date} date={l.due_date} rest={l.rest} />
                </View>
              </Card>
            ))}
          </>
        ) : null}

        <SectionTitle>{t.upcoming}</SectionTitle>
        {data?.upcoming.length ? (
          data.upcoming.map((i) => <InstrumentCard key={i.id} inst={i} onPress={() => router.push({ pathname: '/operation', params: { kind: 'I', id: i.id } })} />)
        ) : (
          <Empty text={t.noInstruments} />
        )}
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
    <Card onPress={onPress} style={{ flex: 1, backgroundColor: bg, borderColor: color, borderWidth: 2, padding: 12, minHeight: 120 }}>
      <Text style={{ fontSize: font.sm + 1, fontWeight: '800', color }}>{title}</Text>
      <Text style={{ fontSize: font.lg + 1, fontWeight: '900', color: colors.text }} adjustsFontSizeToFit numberOfLines={1}>
        {value}
      </Text>
      {subtitle ? <Text style={{ fontSize: font.sm - 1, fontWeight: '700', color }}>{subtitle}</Text> : null}
    </Card>
  );
}
