import * as Notifications from 'expo-notifications';
import { dicts, type Lang } from './i18n/dicts';
import type { Instrument } from './db/types';
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
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Échéances / الاستحقاقات',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 300, 200, 300],
    lightColor: '#556B2F',
  });
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

/** Programme un rappel N jours avant l'échéance (9h) et un le jour même (8h). */
export async function scheduleInstrumentReminders(
  inst: Pick<Instrument, 'id' | 'instrument_type' | 'amount' | 'maturity_due_date' | 'reference_number' | 'reminder_days_before'>,
  contactName: string,
  lang: Lang,
): Promise<string[]> {
  if (!(await ensureNotificationPermission())) return [];
  const t = dicts[lang];
  const body = t.notifBody(
    t.instrTypes[inst.instrument_type],
    inst.reference_number,
    contactName,
    formatMoney(inst.amount, lang),
    formatDate(inst.maturity_due_date),
  );
  const targets: { date: Date; title: string }[] = [];
  if (inst.reminder_days_before > 0) {
    targets.push({
      date: atHour(addDays(inst.maturity_due_date, -inst.reminder_days_before), 9),
      title: t.notifSoonTitle(inst.reminder_days_before),
    });
  }
  targets.push({ date: atHour(inst.maturity_due_date, 8), title: t.notifTodayTitle });

  const ids: string[] = [];
  for (const target of targets) {
    if (target.date.getTime() <= Date.now()) continue;
    ids.push(
      await Notifications.scheduleNotificationAsync({
        content: { title: target.title, body, data: { instrumentId: inst.id } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: target.date, channelId: CHANNEL_ID },
      }),
    );
  }
  return ids;
}

export async function cancelReminders(idsJson: string | null) {
  if (!idsJson) return;
  try {
    for (const id of JSON.parse(idsJson) as string[]) {
      await Notifications.cancelScheduledNotificationAsync(id);
    }
  } catch {
    // Notification déjà passée ou supprimée : rien à faire.
  }
}
