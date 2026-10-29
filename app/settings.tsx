import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Text } from 'react-native';
import { Button, Card, Screen, SectionHeader, Segmented, styles } from '../src/components/ui';
import { useI18n } from '../src/i18n';
import type { Lang } from '../src/i18n/dicts';
import { ensureNotificationPermission, hasNotificationPermission, syncReminders } from '../src/notifications';
import { colors } from '../src/theme';

export default function Settings() {
  const db = useSQLiteContext();
  const { t, lang, setLang } = useI18n();
  const [notifOk, setNotifOk] = useState<boolean | null>(null);

  useEffect(() => {
    hasNotificationPermission().then(setNotifOk);
  }, []);

  const choose = (next: Lang) => {
    if (next === lang) return;
    Alert.alert(t.language, t.languageRestart, [
      { text: t.cancel, style: 'cancel' },
      { text: t.confirm, onPress: () => setLang(next) },
    ]);
  };

  return (
    <Screen>
      <SectionHeader title={t.language} />
      <Segmented<Lang>
        options={[
          { value: 'ar', label: 'العربية' },
          { value: 'fr', label: 'Français' },
        ]}
        value={lang}
        onChange={choose}
      />

      <SectionHeader title={t.notifications} />
      {notifOk ? (
        <Card>
          <Text style={[styles.body, { color: colors.success, fontWeight: '700' }]}>{t.notifEnabled}</Text>
        </Card>
      ) : (
        <>
          {notifOk === false ? <Text style={styles.muted}>{t.notifDenied}</Text> : null}
          <Button
            label={t.enableNotifications}
            variant="soft"
            onPress={async () => {
              const ok = await ensureNotificationPermission();
              setNotifOk(ok);
              if (ok) await syncReminders(db, lang);
            }}
          />
        </>
      )}

      <Card style={{ marginTop: 16 }}>
        <Text style={styles.body}>{t.offlineNote}</Text>
        <Text style={styles.muted}>AgriCompte / الفلاح · v1.1.0</Text>
      </Card>
    </Screen>
  );
}
