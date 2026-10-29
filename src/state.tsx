import { useSQLiteContext } from 'expo-sqlite';
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { referencedFileNames } from './db/repo';
import { useI18n } from './i18n';
import { syncReminders } from './notifications';
import { cleanupOrphanPhotos } from './photos';

interface AppState {
  /** Incrémenté à chaque changement : les écrans le mettent dans leurs dépendances de chargement. */
  version: number;
  /** À appeler après chaque enregistrement : rafraîchit les écrans et resynchronise les rappels. */
  refresh: (askNotifPermission?: boolean) => void;
}

const AppStateContext = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const { lang } = useI18n();
  const [version, setVersion] = useState(0);

  useEffect(() => {
    syncReminders(db, lang).catch(() => {});
    referencedFileNames(db).then(cleanupOrphanPhotos).catch(() => {});
  }, [db, lang]);

  const refresh = useCallback(
    (askNotifPermission = false) => {
      setVersion((v) => v + 1);
      syncReminders(db, lang, askNotifPermission).catch(() => {});
    },
    [db, lang],
  );

  return <AppStateContext.Provider value={{ version, refresh }}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppState {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used inside AppStateProvider');
  return ctx;
}
