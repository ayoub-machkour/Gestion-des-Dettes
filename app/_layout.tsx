import * as Notifications from 'expo-notifications';
import { Stack, useRouter } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { AnimatedSplash } from '../src/components/AnimatedSplash';
import { migrateDb } from '../src/db/migrations';
import { I18nProvider, useI18n } from '../src/i18n';
import { initNotifications } from '../src/notifications';
import { AppStateProvider } from '../src/state';
import { colors, font } from '../src/theme';

export default function RootLayout() {
  const [splashDone, setSplashDone] = useState(false);
  const hideSplash = useCallback(() => setSplashDone(true), []);
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SQLiteProvider databaseName="agricompte.db" onInit={migrateDb}>
        <I18nProvider>
          <AppStateProvider>
            <AppStack />
          </AppStateProvider>
        </I18nProvider>
      </SQLiteProvider>
      {splashDone ? null : <AnimatedSplash onDone={hideSplash} />}
    </View>
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
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerShadowVisible: false,
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: '700', fontSize: font.lg },
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="menu" options={{ title: t.menu }} />
        <Stack.Screen name="contacts/new" options={{ title: t.newPerson }} />
        <Stack.Screen name="contacts/[id]" options={{ title: '' }} />
        <Stack.Screen name="credit/new" options={{ title: t.newCreditTitle }} />
        <Stack.Screen name="payment" options={{ title: t.newPaymentTitle }} />
        <Stack.Screen name="instruments/index" options={{ title: t.calendar }} />
        <Stack.Screen name="instruments/new" options={{ title: t.newInstrument }} />
        <Stack.Screen name="payroll/new" options={{ title: t.newWorkTitle }} />
        <Stack.Screen name="work-kinds/index" options={{ title: t.workKinds }} />
        <Stack.Screen name="work-kinds/edit" options={{ title: t.newWorkKindTitle }} />
        <Stack.Screen name="operation" options={{ title: t.operation }} />
        <Stack.Screen name="history" options={{ title: t.history }} />
        <Stack.Screen name="settings" options={{ title: t.settings }} />
      </Stack>
    </>
  );
}
