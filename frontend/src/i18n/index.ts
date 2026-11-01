import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { fr } from "./locales/fr";
import { en } from "./locales/en";
import { ar } from "./locales/ar";
import { zh } from "./locales/zh";

// ----------------------------------------------------------------------------
// Langues disponibles. Pour en ajouter une (ex. espagnol) :
//   1. créer src/i18n/locales/es.ts (mêmes clés que fr.ts)
//   2. l'ajouter ici et dans "resources"
// ----------------------------------------------------------------------------
export type LanguageCode = "fr" | "en" | "ar" | "zh";

export interface LanguageInfo {
  code: LanguageCode;
  label: string;         // nom de la langue dans sa propre langue
  dir: "ltr" | "rtl";    // sens d'écriture
  numberLocale: string;  // pour formater nombres et montants
}

export const LANGUAGES: LanguageInfo[] = [
  { code: "fr", label: "Français", dir: "ltr", numberLocale: "fr-FR" },
  { code: "en", label: "English", dir: "ltr", numberLocale: "en-US" },
  { code: "ar", label: "العربية", dir: "rtl", numberLocale: "ar-u-nu-latn" },
  { code: "zh", label: "中文", dir: "ltr", numberLocale: "zh-CN" },
];

const STORAGE_KEY = "veltron-lang";

function readSavedLanguage(): LanguageCode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as LanguageCode | null;
    if (saved && LANGUAGES.some((l) => l.code === saved)) return saved;
  } catch {
    /* localStorage indisponible : on garde le français */
  }
  return "fr";
}

// Met à jour <html lang> et <html dir> (indispensable pour l'arabe).
function applyLanguageToDocument(code: string) {
  const info = LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];
  document.documentElement.lang = info.code;
  document.documentElement.dir = info.dir;
}

i18n.use(initReactI18next).init({
  resources: {
    fr: { translation: fr },
    en: { translation: en },
    ar: { translation: ar },
    zh: { translation: zh },
  },
  lng: readSavedLanguage(),
  fallbackLng: ["en", "fr"], // textes manquants : anglais puis français
  interpolation: { escapeValue: false }, // React protège déjà contre le XSS
});

applyLanguageToDocument(i18n.language);

i18n.on("languageChanged", (code) => {
  applyLanguageToDocument(code);
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    /* ignoré */
  }
});

export default i18n;
