import { LANGUAGES } from "../../i18n";

// Formate un nombre selon la langue active (séparateurs de milliers, etc.).
export function formatNumber(value: number, languageCode: string): string {
  const locale = LANGUAGES.find((l) => l.code === languageCode)?.numberLocale ?? "fr-FR";
  return new Intl.NumberFormat(locale).format(value);
}

// Formate une heure (ex. dernière mise à jour du bus).
export function formatTime(date: Date, languageCode: string): string {
  const locale = LANGUAGES.find((l) => l.code === languageCode)?.numberLocale ?? "fr-FR";
  return date.toLocaleTimeString(locale);
}
