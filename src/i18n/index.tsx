import { reloadAppAsync } from 'expo';
import { getLocales } from 'expo-localization';
import { useSQLiteContext } from 'expo-sqlite';
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { I18nManager } from 'react-native';
import { getSetting, setSetting } from '../db/repo';
import { dicts, type Dict, type Lang } from './dicts';

interface I18nValue {
  lang: Lang;
  t: Dict;
  setLang: (lang: Lang) => Promise<void>;
}

const I18nContext = createContext<I18nValue | null>(null);

/** Applique le sens RTL natif ; renvoie true si un redémarrage est nécessaire. */
function applyDirection(lang: Lang): boolean {
  const rtl = lang === 'ar';
  I18nManager.allowRTL(rtl);
  I18nManager.forceRTL(rtl);
  return I18nManager.isRTL !== rtl;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const [lang, setLangState] = useState<Lang | null>(null);

  useEffect(() => {
    (async () => {
      let stored = (await getSetting(db, 'lang')) as Lang | null;
      if (!stored) {
        stored = getLocales()[0]?.languageCode === 'ar' ? 'ar' : 'fr';
        await setSetting(db, 'lang', stored);
      }
      // Le sens s'applique au prochain lancement s'il diffère ; pas de reload ici pour éviter toute boucle.
      applyDirection(stored);
      setLangState(stored);
    })();
  }, [db]);

  const setLang = useCallback(
    async (next: Lang) => {
      await setSetting(db, 'lang', next);
      setLangState(next);
      if (applyDirection(next)) {
        await reloadAppAsync('direction');
      }
    },
    [db],
  );

  if (!lang) return null;
  return <I18nContext.Provider value={{ lang, t: dicts[lang], setLang }}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}
