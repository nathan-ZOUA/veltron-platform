import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { api } from "../core/api";
import { agencyStyle, initials } from "../core/format";
import type { AgencySummary, Country } from "../core/types";

const COUNTRY_KEY = "veltron-country";
const FEATURED_ISOS = ["CM", "SN", "CI", "FR"];

// Annuaire des agences côté passager : filtre rapide + liste alphabétique mondiale.
export default function Agencies() {
  const { t, i18n } = useTranslation();
  const [countries, setCountries] = useState<Country[]>([]);
  const [iso, setIso] = useState<string>(() => localStorage.getItem(COUNTRY_KEY) ?? "");
  const [agencies, setAgencies] = useState<AgencySummary[] | null>(null);

  useEffect(() => {
    api<Country[]>(`/countries?lang=${i18n.language}`).then(setCountries).catch(() => setCountries([]));
  }, [i18n.language]);

  useEffect(() => {
    setAgencies(null);
    localStorage.setItem(COUNTRY_KEY, iso);
    api<AgencySummary[]>(`/agencies${iso ? `?country=${iso}` : ""}`).then(setAgencies).catch(() => setAgencies([]));
  }, [iso]);

  const featured = useMemo(() => countries.filter((c) => FEATURED_ISOS.includes(c.iso2)), [countries]);

  return (
    <div className="container page">
      <header className="page__header">
        <h1 className="display display-xl">{t("agencies.title")}</h1>
        <p className="lead">{t("agencies.subtitle")}</p>

        <div className="country-filter-bar">
          <div className="chips" role="group">
            <button type="button" className={iso === "" ? "chip is-active" : "chip"} onClick={() => setIso("")}>
              Tous les pays
            </button>
            {featured.map((c) => (
              <button
                key={c.iso2}
                type="button"
                className={c.iso2 === iso ? "chip is-active" : "chip"}
                onClick={() => setIso(c.iso2)}
              >
                {i18n.language === "en" ? c.name_en : c.name_fr} ({c.default_currency})
              </button>
            ))}
          </div>

          <select
            className="select country-select"
            aria-label="Choisir parmi tous les pays du monde"
            value={iso}
            onChange={(e) => setIso(e.target.value)}
          >
            <option value="">🌍 Tous les pays du monde ({countries.length})</option>
            {countries.map((c) => (
              <option key={c.iso2} value={c.iso2}>
                {i18n.language === "en" ? c.name_en : c.name_fr} — {c.default_currency} ({c.currency_symbol ?? c.default_currency})
              </option>
            ))}
          </select>
        </div>
      </header>

      {agencies === null && (
        <div className="agency-grid">
          {[1, 2, 3].map((n) => (
            <div key={n} className="skeleton" style={{ height: 230 }} />
          ))}
        </div>
      )}
      {agencies?.length === 0 && <p className="muted">{t("agencies.empty")}</p>}

      <div className="agency-grid">
        {agencies?.map((a, index) => (
          <motion.div
            key={a.slug}
            style={agencyStyle(a.primary_color)}
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: index * 0.06 }}
          >
            <Link to={`/passager/a/${a.slug}`} className="agency-card">
              <div className="agency-card__top">
                <span className="agency-card__logo">
                  {a.logo_path ? <img src={a.logo_path.startsWith("/") ? a.logo_path : `/uploads/${a.logo_path}`} alt="" /> : initials(a.name)}
                </span>
                <div className="chips">
                  <span className="badge">{a.currency_code}</span>
                  {a.points_per_trip ? <span className="badge">+{a.points_per_trip} pts</span> : null}
                </div>
              </div>
              <h2 className="agency-card__name">{a.name}</h2>
              <p className="muted">
                {a.city_name ? `${a.city_name}, ` : ""}
                {a.country_name ?? a.country} ·{" "}
                {a.rating ? (
                  <>
                    <span className="star">★</span> <strong className="mono">{a.rating}</strong> ({a.reviews_count})
                  </>
                ) : (
                  t("agencies.newAgency")
                )}
              </p>
              <span className="agency-card__cta">
                {t("agencies.view")} ({a.upcoming_trips ?? 0}) <span className="flip-rtl">→</span>
              </span>
            </Link>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
