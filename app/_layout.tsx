import * as Notifications from 'expo-notifications';
import { Stack, useRouter } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { migrateDb } from '../src/db/migrations';
import { I18nProvider, useI18n } from '../src/i18n';
import { initNotifications } from '../src/notifications';
import { colors } from '../src/theme';

export default function RootLayout() {
  return (
    <SQLiteProvider databaseName="agricompte.db" onInit={migrateDb}>
      <I18nProvider>
        <AppStack />
      </I18nProvider>
    </SQLiteProvider>
  );
}

function AppStack() {
  const { t } = useI18n();
  const router = useRouter();

  useEffect(() => {
    initNotifications();
    // Toucher une notification d'échéance ouvre l'échéancier.
    const sub = Notifications.addNotificationResponseReceivedListener(() => router.push('/instruments'));
    return () => sub.remove();
  }, [router]);

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.olive },
          headerTintColor: colors.white,
          headerTitleStyle: { fontWeight: '800' },
          contentStyle: { backgroundColor: colors.cream },
        }}
      >
        <Stack.Screen name="index" options={{ title: `${t.appName} · ${t.dashboard}` }} />
        <Stack.Screen name="contacts/index" options={{ title: t.contacts }} />
        <Stack.Screen name="contacts/new" options={{ title: t.newContactTitle }} />
        <Stack.Screen name="contacts/[id]" options={{ title: t.contact }} />
        <Stack.Screen name="credit/new" options={{ title: t.newCredit }} />
        <Stack.Screen name="instruments/index" options={{ title: t.calendar }} />
        <Stack.Screen name="instruments/new" options={{ title: t.newInstrument }} />
        <Stack.Screen name="payroll/new" options={{ title: t.payroll }} />
        <Stack.Screen name="payment" options={{ title: t.payment }} />
        <Stack.Screen name="settings" options={{ title: t.settings }} />
      </Stack>
    </>
  );
}
