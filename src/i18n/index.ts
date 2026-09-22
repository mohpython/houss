import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import fr from "./locales/fr.json";
import en from "./locales/en.json";
import ar from "./locales/ar.json";

export const SUPPORTED_LANGS = ["fr", "en", "ar"] as const;
export type SupportedLang = (typeof SUPPORTED_LANGS)[number];

if (!i18n.isInitialized) {
  i18n
    .use(initReactI18next)
    .init({
      resources: {
        fr: { translation: fr },
        en: { translation: en },
        ar: { translation: ar },
      },
      lng: "fr",
      fallbackLng: "fr",
      supportedLngs: SUPPORTED_LANGS as unknown as string[],
      interpolation: { escapeValue: false },
    });
}


export function applyLanguage(lang: string) {
  const normalized = (SUPPORTED_LANGS as readonly string[]).includes(lang) ? lang : "fr";
  i18n.changeLanguage(normalized);
  if (typeof document !== "undefined") {
    document.documentElement.lang = normalized;
    document.documentElement.dir = normalized === "ar" ? "rtl" : "ltr";
  }
  try {
    localStorage.setItem("saha_lang", normalized);
  } catch {
    /* ignore */
  }
}

export function getDateLocale(): string {
  const lang = (i18n.resolvedLanguage ?? "fr") as SupportedLang;
  return lang === "en" ? "en-US" : lang === "ar" ? "ar" : "fr-FR";
}

export default i18n;
