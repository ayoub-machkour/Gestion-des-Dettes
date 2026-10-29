import { useSQLiteContext } from 'expo-sqlite';
import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { referencedFileNames } from './db/repo';
import { undoLast } from './db/undo';
import { useI18n } from './i18n';
import { syncReminders } from './notifications';
import { cleanupOrphanPhotos } from './photos';
import { colors, font, radius } from './theme';

interface AppState {
  /** Incrémenté à chaque changement : les écrans le mettent dans leurs dépendances de chargement. */
  version: number;
  /** À appeler après chaque enregistrement : rafraîchit, resynchronise les rappels, propose « Annuler ». */
  done: (message?: string, askNotifPermission?: boolean) => void;
  undo: () => Promise<void>;
}

const AppStateContext = createContext<AppState | null>(null);
const TOAST_MS = 7000;

export function AppStateProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const { t, lang } = useI18n();
  const insets = useSafeAreaInsets();
  const [version, setVersion] = useState(0);
  const [toast, setToast] = useState<{ text: string; canUndo: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    syncReminders(db, lang).catch(() => {});
    referencedFileNames(db).then(cleanupOrphanPhotos).catch(() => {});
  }, [db, lang]);

  const showToast = useCallback((text: string, canUndo: boolean) => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ text, canUndo });
    timer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  const done = useCallback(
    (message?: string, askNotifPermission = false) => {
      setVersion((v) => v + 1);
      syncReminders(db, lang, askNotifPermission).catch(() => {});
      showToast(message ?? t.saved, true);
    },
    [db, lang, showToast, t],
  );

  const undo = useCallback(async () => {
    const label = await undoLast(db);
    setVersion((v) => v + 1);
    syncReminders(db, lang).catch(() => {});
    showToast(label ? t.undone : t.emptyHistory, false);
  }, [db, lang, showToast, t]);

  return (
    <AppStateContext.Provider value={{ version, done, undo }}>
      <View style={{ flex: 1 }}>
        {children}
        {toast ? (
          <View style={[s.toast, { bottom: insets.bottom + 16 }]}>
            <Text style={s.toastText}>{toast.text}</Text>
            {toast.canUndo ? (
              <Pressable onPress={undo} hitSlop={10} style={({ pressed }) => [s.undoBtn, pressed && { opacity: 0.6 }]}>
                <Text style={s.undoText}>{t.undo}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
    </AppStateContext.Provider>
  );
}

export function useAppState(): AppState {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used inside AppStateProvider');
  return ctx;
}

const s = StyleSheet.create({
  toast: {
    position: 'absolute',
    start: 16,
    end: 16,
    minHeight: 60,
    backgroundColor: colors.text,
    borderRadius: radius,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 12,
    elevation: 8,
  },
  toastText: { flex: 1, color: colors.white, fontSize: font.md, fontWeight: '700' },
  undoBtn: { backgroundColor: colors.warningLight, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  undoText: { color: colors.earth, fontSize: font.md, fontWeight: '900' },
});
