import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { api } from "../core/api";
import { agencyStyle, formatMoney } from "../core/format";
import type { City, SearchTripResult, AgencySummary } from "../core/types";

export default function PassengerSearchBar({
  onAskAnge,
  compact = false,
}: {
  onAskAnge?: (origin: string, dest: string) => void;
  compact?: boolean;
}) {
  const { t, i18n } = useTranslation();

  const [mode, setMode] = useState<"trip" | "agency">("trip");
  const [cities, setCities] = useState<City[]>([]);

  // Formulaire Trajet
  const [origin, setOrigin] = useState("Douala");
  const [destination, setDestination] = useState("Yaoundé");
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);

  // Formulaire Agence
  const [agencyQuery, setAgencyQuery] = useState("");

  // Résultats & États
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);
  const [tripResults, setTripResults] = useState<SearchTripResult[]>([]);
  const [agencyResults, setAgencyResults] = useState<AgencySummary[]>([]);

  // Charge les villes d'Afrique pour la saisie semi-automatique
  useEffect(() => {
    api<City[]>("/cities")
      .then((data) => setCities(data || []))
      .catch(() => setCities([]));
  }, []);

  function handleSwap() {
    setOrigin(destination);
    setDestination(origin);
  }

  function setQuickDate(offsetDays: number) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    setDate(d.toISOString().split("T")[0]);
  }

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setSearched(true);

    if (mode === "trip") {
      try {
        const queryParams = new URLSearchParams();
        if (origin.trim()) queryParams.set("origin", origin.trim());
        if (destination.trim()) queryParams.set("destination", destination.trim());
        if (date.trim()) queryParams.set("date", date.trim());

        const res = await api<SearchTripResult[]>(`/trips/search?${queryParams.toString()}`);
        setTripResults(res || []);
      } catch {
        setTripResults([]);
      } finally {
        setBusy(false);
      }
    } else {
      try {
        const res = await api<AgencySummary[]>(`/agencies?q=${encodeURIComponent(agencyQuery.trim())}`);
        setAgencyResults(res || []);
      } catch {
        setAgencyResults([]);
      } finally {
        setBusy(false);
      }
    }
  }

  return (
    <div className={`passenger-search-widget ${compact ? "passenger-search-widget--compact" : ""}`}>
      {/* Datalist pour autocomplétion intelligente */}
      <datalist id="african-cities-list">
        {cities.map((c) => (
          <option key={c.id} value={c.name} />
        ))}
      </datalist>

      {/* Onglets de commutation Trajet / Agence */}
      <div className="search-tabs" role="tablist">
        <button
          type="button"
          className={`search-tab ${mode === "trip" ? "is-active" : ""}`}
          onClick={() => {
            setMode("trip");
            setSearched(false);
          }}
        >
          <span className="search-tab__icon">🚌</span>
          <span>{t("search.tabTrips")}</span>
        </button>
        <button
          type="button"
          className={`search-tab ${mode === "agency" ? "is-active" : ""}`}
          onClick={() => {
            setMode("agency");
            setSearched(false);
          }}
        >
          <span className="search-tab__icon">🏢</span>
          <span>{t("search.tabAgencies")}</span>
        </button>
      </div>

      {/* Formulaire principal */}
      <form className="search-card" onSubmit={handleSearch}>
        {mode === "trip" ? (
          <div className="search-row search-row--trip">
            {/* Ville de départ */}
            <div className="search-field search-field--origin">
              <label className="search-field__label">
                <span className="dot dot--origin" aria-hidden="true" />
                {t("search.origin")}
              </label>
              <div className="search-field__control">
                <input
                  type="text"
                  list="african-cities-list"
                  className="search-input"
                  placeholder={t("search.originPlaceholder")}
                  value={origin}
                  onChange={(e) => setOrigin(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Bouton Inversion */}
            <button
              type="button"
              className="search-swap-btn"
              title={t("search.swap")}
              aria-label={t("search.swap")}
              onClick={handleSwap}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 16V4m0 0L3 8m4-4l4 4m6 4v12m0 0l4-4m-4 4l-4-4" />
              </svg>
            </button>

            {/* Ville d'arrivée */}
            <div className="search-field search-field--dest">
              <label className="search-field__label">
                <span className="dot dot--dest" aria-hidden="true" />
                {t("search.destination")}
              </label>
              <div className="search-field__control">
                <input
                  type="text"
                  list="african-cities-list"
                  className="search-input"
                  placeholder={t("search.destinationPlaceholder")}
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Date du voyage */}
            <div className="search-field search-field--date">
              <div className="search-field__label-row">
                <label className="search-field__label">
                  <span className="search-icon-cal" aria-hidden="true">📅</span>
                  {t("search.date")}
                </label>
                <div className="search-date-chips">
                  <button type="button" className="date-chip" onClick={() => setQuickDate(0)}>
                    {t("search.today")}
                  </button>
                  <button type="button" className="date-chip" onClick={() => setQuickDate(1)}>
                    {t("search.tomorrow")}
                  </button>
                </div>
              </div>
              <div className="search-field__control">
                <input
                  type="date"
                  className="search-input search-input--date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Bouton de soumission */}
            <button type="submit" className="search-submit-btn" disabled={busy}>
              {busy ? (
                <span className="search-spinner" />
              ) : (
                <>
                  <span>{t("search.btnSearchTrips")}</span>
                  <span className="flip-rtl" aria-hidden="true">→</span>
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="search-row search-row--agency">
            {/* Recherche d'agence */}
            <div className="search-field search-field--agency-query">
              <label className="search-field__label">
                <span className="dot dot--agency" aria-hidden="true" />
                {t("search.tabAgencies")}
              </label>
              <div className="search-field__control">
                <input
                  type="search"
                  className="search-input"
                  placeholder={t("search.agencyPlaceholder")}
                  value={agencyQuery}
                  onChange={(e) => setAgencyQuery(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Bouton de soumission agence */}
            <button type="submit" className="search-submit-btn search-submit-btn--agency" disabled={busy}>
              {busy ? (
                <span className="search-spinner" />
              ) : (
                <>
                  <span>{t("search.btnSearchAgencies")}</span>
                  <span className="flip-rtl" aria-hidden="true">→</span>
                </>
              )}
            </button>
          </div>
        )}
      </form>

      {/* RÉSULTATS DE RECHERCHE EN DIRECT */}
      <AnimatePresence>
        {searched && (
          <motion.div
            className="search-results-panel"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.35 }}
          >
            {busy ? (
              <div className="search-loading">
                <span className="search-spinner search-spinner--lg" />
                <p className="muted">{t("common.loading")}</p>
              </div>
            ) : mode === "trip" ? (
              tripResults.length > 0 ? (
                <div className="search-trips-list">
                  <div className="search-results-header">
                    <h3 className="search-results-title">
                      🎟️ {tripResults.length} {t("search.resultsTitle")} : <strong>{origin}</strong> ➔ <strong>{destination}</strong>
                    </h3>
                    <span className="badge badge--ok">Disponible immédiatement</span>
                  </div>

                  <div className="search-cards-grid">
                    {tripResults.map((trip) => {
                      const depTime = new Date(trip.departs_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                      const arrTime = trip.arrives_at
                        ? new Date(trip.arrives_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                        : null;

                      return (
                        <div
                          key={trip.id}
                          className="search-trip-card"
                          style={agencyStyle(trip.primary_color)}
                        >
                          <div className="search-trip-card__head">
                            <div className="search-trip-agency">
                              <span className="search-trip-agency__dot" />
                              <strong className="search-trip-agency__name">{trip.agency_name}</strong>
                              {trip.rating && (
                                <span className="search-trip-agency__rating">★ {trip.rating}</span>
                              )}
                            </div>
                            <span className="badge badge--bus-type">{trip.bus_type}</span>
                          </div>

                          <div className="search-trip-card__timeline">
                            <div className="search-timeline-point">
                              <span className="search-time">{depTime}</span>
                              <span className="search-city">{trip.origin}</span>
                            </div>

                            <div className="search-timeline-track">
                              <span className="search-track-line" />
                              {trip.duration_min && (
                                <span className="search-track-duration">
                                  {Math.floor(trip.duration_min / 60)}h{trip.duration_min % 60 ? `${trip.duration_min % 60}m` : ""}
                                </span>
                              )}
                            </div>

                            <div className="search-timeline-point search-timeline-point--end">
                              <span className="search-time">{arrTime || "—"}</span>
                              <span className="search-city">{trip.destination}</span>
                            </div>
                          </div>

                          <div className="search-trip-card__meta">
                            <span className="search-seats-chip">
                              🟢 <strong>{trip.free_seats}</strong> {t("search.freeSeats")}
                            </span>
                            <div className="search-price-block">
                              <span className="search-price-label">À partir de</span>
                              <strong className="search-price-val">
                                {formatMoney(trip.price, trip.currency_code, trip.minor_units, i18n.language)}
                              </strong>
                            </div>
                          </div>

                          <div className="search-trip-card__actions">
                            <Link to={`/passager/reserver/${trip.id}`} className="btn search-book-btn">
                              {t("search.bookSeat")} <span className="flip-rtl" aria-hidden="true">→</span>
                            </Link>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="search-empty-box">
                  <div className="search-empty-box__icon">🚍</div>
                  <h4>{t("search.noResults")}</h4>
                  <p className="muted">
                    Aucun départ direct n'est répertorié entre <strong>{origin}</strong> et <strong>{destination}</strong> pour la date choisie ({date}).
                  </p>
                  <div className="search-empty-box__actions">
                    <button
                      type="button"
                      className="btn btn--ghost"
                      onClick={() => {
                        if (onAskAnge) {
                          onAskAnge(origin, destination);
                        } else {
                          // Ouvre le FAB Ange Assistant
                          const fab = document.querySelector(".ange-fab") as HTMLButtonElement | null;
                          if (fab) fab.click();
                        }
                      }}
                    >
                      {t("search.askAnge")}
                    </button>
                    <Link to="/passager/agences" className="btn">
                      {t("search.allAgencies")} →
                    </Link>
                  </div>
                </div>
              )
            ) : (
              /* Résultats Agences */
              agencyResults.length > 0 ? (
                <div className="search-agencies-list">
                  <div className="search-results-header">
                    <h3 className="search-results-title">
                      🏢 {agencyResults.length} agence(s) trouvée(s) pour « {agencyQuery} » :
                    </h3>
                  </div>
                  <div className="search-cards-grid search-cards-grid--agencies">
                    {agencyResults.map((ag) => (
                      <Link
                        key={ag.slug}
                        to={`/passager/a/${ag.slug}`}
                        className="search-agency-card card card--hover"
                        style={agencyStyle(ag.primary_color)}
                      >
                        <div className="search-agency-card__header">
                          <span className="search-agency-badge-dot" />
                          <h4 className="search-agency-card__name">{ag.name}</h4>
                        </div>
                        <p className="muted" style={{ fontSize: "0.88rem" }}>
                          {ag.city_name ? `${ag.city_name}, ` : ""}
                          {ag.country_name || ag.country}
                        </p>
                        <div className="search-agency-card__footer">
                          <span className="badge">{ag.currency_code}</span>
                          <span className="search-agency-link-text">Voir les départs →</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="search-empty-box">
                  <div className="search-empty-box__icon">🔍</div>
                  <h4>Aucune agence trouvée pour « {agencyQuery} »</h4>
                  <p className="muted">Essayez un autre mot-clé ou parcourez notre annuaire complet des agences.</p>
                  <Link to="/passager/agences" className="btn">
                    {t("search.allAgencies")} →
                  </Link>
                </div>
              )
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
