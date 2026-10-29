import { useEffect, useState } from 'react';
import { Alert, Text } from 'react-native';
import { BigButton, Btn, Card, Screen, SectionTitle, styles } from '../src/components/ui';
import { useI18n } from '../src/i18n';
import type { Lang } from '../src/i18n/dicts';
import { ensureNotificationPermission, hasNotificationPermission } from '../src/notifications';
import { colors } from '../src/theme';

export default function Settings() {
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
      <SectionTitle>{t.language}</SectionTitle>
      <BigButton label={`${lang === 'fr' ? '✓ ' : ''}Français`} color={lang === 'fr' ? colors.olive : colors.muted} onPress={() => choose('fr')} />
      <BigButton label={`${lang === 'ar' ? '✓ ' : ''}العربية`} color={lang === 'ar' ? colors.olive : colors.muted} onPress={() => choose('ar')} />

      <SectionTitle>{t.notifications}</SectionTitle>
      {notifOk ? (
        <Text style={[styles.body, { color: colors.success, fontWeight: '700' }]}>{t.notifEnabled}</Text>
      ) : (
        <>
          {notifOk === false ? <Text style={styles.muted}>{t.notifDenied}</Text> : null}
          <Btn label={t.enableNotifications} onPress={() => ensureNotificationPermission().then(setNotifOk)} />
        </>
      )}

      <Card style={{ marginTop: 12 }}>
        <Text style={styles.body}>🌾 {t.offlineNote}</Text>
        <Text style={styles.muted}>AgriCompte / الفلاح · v1.0.0</Text>
      </Card>
    </Screen>
  );
}
