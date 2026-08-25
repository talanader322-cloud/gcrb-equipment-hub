import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { dictionary, type TranslationKey } from "./translations";

export type Locale = "ar" | "en";
export type Direction = "rtl" | "ltr";

const STORAGE_KEY = "gcrb.locale";

type I18nValue = {
  locale: Locale;
  dir: Direction;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  appName: string;
};

const I18nContext = createContext<I18nValue | null>(null);

function applyDocument(locale: Locale) {
  if (typeof document === "undefined") return;
  const dir: Direction = locale === "ar" ? "rtl" : "ltr";
  document.documentElement.lang = locale;
  document.documentElement.dir = dir;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("ar");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const initial: Locale = stored === "en" || stored === "ar" ? stored : "ar";
    setLocaleState(initial);
    applyDocument(initial);
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    applyDocument(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const value = useMemo<I18nValue>(() => {
    const table = dictionary[locale];
    return {
      locale,
      dir: locale === "ar" ? "rtl" : "ltr",
      setLocale,
      toggleLocale: () => setLocale(locale === "ar" ? "en" : "ar"),
      appName: table["app.name"],
      t: (key, vars) => {
        let text = table[key] ?? dictionary.en[key] ?? key;
        if (vars) {
          for (const [k, v] of Object.entries(vars)) {
            text = text.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
          }
        }
        return text;
      },
    };
  }, [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}
