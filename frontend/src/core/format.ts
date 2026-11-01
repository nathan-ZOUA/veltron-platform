import type { CSSProperties } from "react";
import { LANGUAGES } from "../i18n";

// ---------- Formatage selon la langue, la devise et le fuseau horaire ----------

function localeOf(lang: string): string {
  return LANGUAGES.find((l) => l.code === lang)?.numberLocale ?? "fr-FR";
}

// Les montants sont stockés en unités mineures (ex. 1250 = 12,50 EUR ; 5500 XAF = 5500)
export function formatMoney(amount: number, currency: string, minorUnits: number, lang: string): string {
  const value = amount / Math.pow(10, minorUnits);
  try {
    return new Intl.NumberFormat(localeOf(lang), {
      style: "currency", currency, minimumFractionDigits: minorUnits, maximumFractionDigits: minorUnits,
    }).format(value);
  } catch {
    return `${value} ${currency}`;
  }
}

// Heure LOCALE de la ville de départ (l'API renvoie des dates UTC)
export function formatTime(iso: string, timeZone: string, lang: string): string {
  return new Intl.DateTimeFormat(localeOf(lang), { hour: "2-digit", minute: "2-digit", timeZone }).format(new Date(iso));
}

export function formatDay(iso: string, timeZone: string, lang: string): string {
  return new Intl.DateTimeFormat(localeOf(lang), { weekday: "short", day: "numeric", month: "short", timeZone }).format(new Date(iso));
}

// ---------- Couleurs d'agence ----------
function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(hex: string, target: [number, number, number], ratio: number): string {
  const [r, g, b] = hexToRgb(hex);
  const c = (a: number, t: number) => Math.round(a + (t - a) * ratio);
  return `rgb(${c(r, target[0])}, ${c(g, target[1])}, ${c(b, target[2])})`;
}

// Texte blanc ou noir selon la luminosité de la couleur (contraste lisible)
export function readableText(hex: string): string {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5 ? "#15161d" : "#ffffff";
}

// Applique la couleur d'une agence : il suffit de poser ce style sur un conteneur
export function agencyStyle(hex: string): CSSProperties {
  const [r, g, b] = hexToRgb(hex);
  return {
    "--accent": hex,
    "--accent-hover": mix(hex, [0, 0, 0], 0.15),
    "--accent-soft": mix(hex, [255, 255, 255], 0.45),
    "--accent-glow": `rgba(${r}, ${g}, ${b}, 0.35)`,
    "--accent-contrast": readableText(hex),
  } as CSSProperties;
}

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
}
