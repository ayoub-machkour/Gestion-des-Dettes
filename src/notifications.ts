import * as Notifications from 'expo-notifications';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getSetting, listInstruments, setSetting } from './db/repo';
import { dicts, type Lang } from './i18n/dicts';
import { addDays, atHour, formatDate } from './utils/dates';
import { formatMoney } from './utils/money';

export const CHANNEL_ID = 'echeances';

export async function initNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  try {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Échéances / الاستحقاقات',
      importance: Notifications.AndroidImportance.HIGH,
    });
  } catch {
    // Expo Go ne permet pas toujours de créer le canal : les rappels utilisent alors le canal par défaut.
  }
}

export async function hasNotificationPermission(): Promise<boolean> {
  return (await Notifications.getPermissionsAsync()).granted;
}

export async function ensureNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

/** Notification immédiate « Bonjour, merci d'avoir installé… » : prouve que les notifications arrivent. */
export async function sendWelcomeNotification(lang: Lang) {
  const t = dicts[lang];
  await Notifications.scheduleNotificationAsync({
    content: { title: t.welcomeTitle, body: t.welcomeBody },
    trigger: null,
  });
}

/** Au premier lancement : demande la permission tout de suite, puis envoie la notification de bienvenue (une seule fois). */
export async function setupNotificationsOnStart(db: SQLiteDatabase, lang: Lang) {
  await initNotifications();
  if (!(await ensureNotificationPermission())) return;
  if (await getSetting(db, 'welcome_sent')) return;
  await sendWelcomeNotification(lang);
  await setSetting(db, 'welcome_sent', '1');
}

/**
 * Reconstruit tous les rappels à partir de la base : N jours avant l'échéance (9h) et le jour même (8h).
 * Appelé après chaque modification et au démarrage : toujours cohérent.
 */
export async function syncReminders(db: SQLiteDatabase, lang: Lang, askPermission = false) {
  const granted = askPermission ? await ensureNotificationPermission() : await hasNotificationPermission();
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (!granted) return;

  const t = dicts[lang];
  const pending = await listInstruments(db, { status: 'PENDING', excludeCash: true });
  for (const inst of pending) {
    const body = t.notifBody(
      inst.direction,
      t.instrTypes[inst.instrument_type],
      inst.reference_number,
      inst.contact_name,
      formatMoney(inst.amount, lang),
      formatDate(inst.maturity_due_date),
    );
    const targets: { date: Date; title: string }[] = [{ date: atHour(inst.maturity_due_date, 8), title: t.notifTodayTitle }];
    if (inst.reminder_days_before > 0) {
      targets.push({
        date: atHour(addDays(inst.maturity_due_date, -inst.reminder_days_before), 9),
        title: t.notifSoonTitle(inst.reminder_days_before),
      });
    }
    for (const target of targets) {
      if (target.date.getTime() <= Date.now()) continue;
      await Notifications.scheduleNotificationAsync({
        content: { title: target.title, body, data: { instrumentId: inst.id } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: target.date, channelId: CHANNEL_ID },
      });
    }
  }
}
