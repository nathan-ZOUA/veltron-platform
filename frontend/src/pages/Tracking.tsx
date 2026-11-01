import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import Avatar from "../components/Avatar";
import { api, ApiError } from "../core/api";
import { agencyStyle, formatDay, formatTime } from "../core/format";
import type { LiveTrackingData, MapsConfig } from "../core/types";
import { ROUTE_POINTS } from "../features/demo/useBusSimulation";

const ROUTE_PATH = ROUTE_POINTS.map((p, idx) => `${idx === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
const START = ROUTE_POINTS[0];
const END = ROUTE_POINTS[ROUTE_POINTS.length - 1];

const CAUSE_LABELS: Record<string, { icon: string; label: string }> = {
  traffic: { icon: "🚦", label: "Bouchon / Embouteillage" },
  prolonged_stop: { icon: "⏸️", label: "Arrêt prolongé" },
  deviation: { icon: "↪️", label: "Déviation d’itinéraire" },
  breakdown: { icon: "🔧", label: "Panne ou vérification mécanique" },
  accident: { icon: "⚠️", label: "Incident / Accident sur la voie" },
  weather: { icon: "🌧️", label: "Intempéries / Pluie forte" },
  police: { icon: "🛂", label: "Contrôle routier" },
  fuel: { icon: "⛽", label: "Arrêt ravitaillement" },
  passenger: { icon: "🧳", label: "Pause passagers" },
  other: { icon: "ℹ️", label: "Aléa opérationnel" },
};

const KIND_LABELS: Record<string, string> = {
  departed: "Départ effectué",
  position: "Point vitesse & progression",
  delay: "Retard déclaré",
  prolonged_stop: "Arrêt prolongé signalé",
  deviation: "Déviation d’itinéraire",
  breakdown: "Incident technique",
  resumed: "Reprise normale de la route",
  arrived: "Arrivée à destination",
  info: "Information chauffeur",
};

function pointAlongRoute(pct: number): { x: number; y: number; angle: number } {
  const clamped = Math.max(0, Math.min(1, pct / 100));
  const totalSegs = ROUTE_POINTS.length - 1;
  const scaled = clamped * totalSegs;
  const idx = Math.min(totalSegs - 1, Math.floor(scaled));
  const t = scaled - idx;
  const a = ROUTE_POINTS[idx];
  const b = ROUTE_POINTS[idx + 1];
  const x = a.x + (b.x - a.x) * t;
  const y = a.y + (b.y - a.y) * t;
  const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  return { x, y, angle };
}

export default function Tracking() {
  const { i18n } = useTranslation();
  const [params, setParams] = useSearchParams();
  const paramTrip = Number(params.get("trip") ?? 0);

  const [list, setList] = useState<LiveTrackingData[]>([]);
  const [historyTrips, setHistoryTrips] = useState<LiveTrackingData[]>([]);
  const [mapsConfig, setMapsConfig] = useState<MapsConfig | null>(null);
  const [active, setActive] = useState<LiveTrackingData | null>(null);
  const [refQuery, setRefQuery] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const loadList = useCallback(async () => {
    try {
      const res = await api<{
        trips: LiveTrackingData[];
        history_trips?: LiveTrackingData[];
        maps_config?: MapsConfig;
      }>("/tracking/live", { realm: null });
      setList(res.trips);
      setHistoryTrips(res.history_trips ?? []);
      setMapsConfig(res.maps_config ?? null);
      if (!paramTrip && res.trips.length > 0) {
        setActive((prev) => {
          if (!prev) return res.trips[0];
          const refreshed =
            res.trips.find((x) => x.trip_id === prev.trip_id) ??
            (res.history_trips ?? []).find((x) => x.trip_id === prev.trip_id);
          return refreshed ?? prev;
        });
      }
    } catch {
      /* silencieux */
    } finally {
      setLoading(false);
    }
  }, [paramTrip]);

  const loadSingle = useCallback(async (tripId: number) => {
    try {
      const data = await api<LiveTrackingData>(`/tracking/trip/${tripId}`, { realm: null });
      setActive(data);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Trajet introuvable.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadList();
    if (paramTrip > 0) loadSingle(paramTrip);
  }, [loadList, loadSingle, paramTrip]);

  // Rafraîchissement automatique toutes les 6 secondes pour refléter les signalements chauffeur en direct
  useEffect(() => {
    const id = window.setInterval(() => {
      if (active) {
        api<LiveTrackingData>(`/tracking/trip/${active.trip_id}`, { realm: null })
          .then(setActive)
          .catch(() => {});
      }
    }, 6000);
    return () => window.clearInterval(id);
  }, [active]);

  async function searchByReference(e: FormEvent) {
    e.preventDefault();
    const cleaned = refQuery.trim().toUpperCase();
    if (!cleaned) return;
    setError("");
    try {
      const res = await api<{ match: LiveTrackingData }>(
        `/tracking/live?reference=${encodeURIComponent(cleaned)}`,
        { realm: null },
      );
      setActive(res.match);
      setParams({ trip: String(res.match.trip_id) });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Référence introuvable.");
    }
  }

  function pickTrip(t: LiveTrackingData) {
    setError("");
    setActive(t);
    setParams({ trip: String(t.trip_id) });
  }

  const pos = useMemo(() => pointAlongRoute(active?.progress_pct ?? 0), [active?.progress_pct]);
  const causeInfo = active?.active_cause ? CAUSE_LABELS[active.active_cause] ?? CAUSE_LABELS.other : null;

  return (
    <div style={active ? agencyStyle(active.primary_color) : undefined}>
      {/* Bannière photo Suivi Live */}
      <section
        className="service-hero photo-bg"
        style={{ "--photo-custom": 'url("/media/tracking.jpg")' } as React.CSSProperties}
      >
        <div className="photo-bg__image photo-bg__image--custom" />
        <div className="container service-hero__inner">
          <span className="badge">
            <span className="live-dot" aria-hidden="true" /> Télémétrie & Signalements Chauffeur en Direct
          </span>
          <h1 className="display display-xl">Suivi de votre trajet en temps réel</h1>
          <p className="lead">
            Visualisez l’évolution de votre bus, sa vitesse en km/h, les ralentissements (bouchons, pannes, contrôles)
            déclarés par le chauffeur et l’heure d’arrivée recalculée dynamiquement.
          </p>

          <form className="tracking-search" onSubmit={searchByReference}>
            <input
              className="input"
              value={refQuery}
              onChange={(e) => setRefQuery(e.target.value)}
              placeholder="Entrer votre N° de réservation (ex. VLT-9TRK42)"
              aria-label="Numéro de réservation"
            />
            <button type="submit" className="btn">
              Rechercher mon billet
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                setRefQuery("VLT-9TRK42");
                api<{ match: LiveTrackingData }>("/tracking/live?reference=VLT-9TRK42", { realm: null })
                  .then((r) => {
                    setActive(r.match);
                    setParams({ trip: String(r.match.trip_id) });
                  })
                  .catch(() => {});
              }}
            >
              Essayer démo VLT-9TRK42
            </button>
          </form>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </div>
      </section>

      <div className="container page">
        {/* Sélecteur rapide des trajets en circulation ou imminents */}
        {list.length > 0 && (
          <div className="chips" role="tablist" aria-label="Trajets en direct">
            {list.map((item) => (
              <button
                key={item.trip_id}
                type="button"
                className={active?.trip_id === item.trip_id ? "chip is-active" : "chip"}
                onClick={() => pickTrip(item)}
              >
                {item.status === "departed" ? "🟢 EN ROUTE · " : "🕒 "}
                {item.origin} → {item.destination} ({item.agency_name})
              </button>
            ))}
          </div>
        )}

        {loading && <div className="skeleton" style={{ height: 320 }} />}

        {active && (
          <>
            {/* Alerte bouchon / panne / retard en cours */}
            {(causeInfo || active.delay_minutes > 0) && (
              <motion.div
                className="incident-banner"
                initial={{ opacity: 0, y: -12 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <span className="incident-banner__icon">{causeInfo?.icon ?? "⏱️"}</span>
                <div>
                  <strong>
                    {causeInfo ? causeInfo.label : "Retard signalé"}
                    {active.delay_minutes > 0 ? ` · +${active.delay_minutes} min` : ""}
                  </strong>
                  <p className="muted" style={{ margin: 0 }}>
                    L’heure d’arrivée estimée ci-dessous intègre automatiquement la vitesse actuelle ({active.speed_kmh} km/h)
                    et l’aléa déclaré par le chauffeur.
                  </p>
                </div>
              </motion.div>
            )}

            {/* Indicateurs clés (Vitesse, Distance restante, Arrivée prévue vs recalculée) */}
            <div className="kpi-grid">
              <div className="card kpi-card">
                <span className="muted">Vitesse actuelle</span>
                <strong className="display kpi-card__value mono">{active.speed_kmh} km/h</strong>
                <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
                  Moyenne bus : {active.avg_speed_kmh} km/h
                </span>
              </div>

              <div className="card kpi-card">
                <span className="muted">Distance restante</span>
                <strong className="display kpi-card__value mono">{active.remaining_km} km</strong>
                <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
                  sur {active.distance_km} km ({active.progress_pct} %)
                </span>
              </div>

              <div className="card kpi-card">
                <span className="muted">Arrivée initiale prévue</span>
                <strong className="display kpi-card__value mono">
                  {active.scheduled_arrives_at
                    ? formatTime(active.scheduled_arrives_at, active.timezone, i18n.language)
                    : "–"}
                </strong>
                <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
                  Départ {formatDay(active.departs_at, active.timezone, i18n.language)} à{" "}
                  {formatTime(active.departs_at, active.timezone, i18n.language)}
                </span>
              </div>

              <div className="card kpi-card kpi-card--accent">
                <span className="muted">Arrivée estimée (ETA Live)</span>
                <strong className="display kpi-card__value mono">
                  {active.estimated_arrives_at
                    ? formatTime(active.estimated_arrives_at, active.timezone, i18n.language)
                    : "–"}
                </strong>
                <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
                  {active.delay_minutes > 0 ? `Inclut +${active.delay_minutes} min d’aléas` : "À l’heure estimée"}
                </span>
              </div>
            </div>

            <div className="tracking-layout">
              {/* Carte vectorielle interactive */}
              <div className="card map-card">
                <div className="map-card__header">
                  <div className="chips">
                    <span className="badge">{active.agency_name}</span>
                    <span className="mono muted">
                      {active.bus_label} · {active.plate}
                    </span>
                    <span className="badge">
                      {active.tracking_mode === "gps"
                        ? `📡 GPS Temps Réel${active.gps_device_id ? ` (${active.gps_device_id})` : ""}`
                        : "✋ Suivi Manuel Chauffeur"}
                    </span>
                    <span className="badge">
                      {active.status === "completed"
                        ? "🏁 Arrivé"
                        : active.status === "departed"
                          ? "🚌 En cours"
                          : "⏳ En attente"}
                    </span>
                  </div>
                  <div className="chips">
                    {active.current_lat !== undefined && active.current_lng !== undefined && (
                      <span className="badge mono">
                        📍 {Number(active.current_lat).toFixed(4)}, {Number(active.current_lng).toFixed(4)}
                      </span>
                    )}
                    {mapsConfig && (
                      <span className="badge mono">
                        🗺️ {mapsConfig.provider !== "none" ? `Carte ${mapsConfig.provider.toUpperCase()}` : " Google Maps / Mapbox prêt"}
                      </span>
                    )}
                    {active.reference && <span className="badge mono">Réf. {active.reference}</span>}
                  </div>
                </div>

                <svg className="route-map" viewBox="0 0 800 420" role="img" aria-label={`${active.origin} vers ${active.destination}`}>
                  <defs>
                    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                      <path d="M 40 0 L 0 0 0 40" fill="none" className="map-grid-line" strokeWidth="1" />
                    </pattern>
                  </defs>
                  <rect width="800" height="420" fill="url(#grid)" />

                  <path d={ROUTE_PATH} className="route-base" fill="none" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
                  <path d={ROUTE_PATH} className="route-flow" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

                  <path
                    d={ROUTE_PATH}
                    className="route-done"
                    fill="none"
                    strokeWidth="7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    pathLength={1}
                    strokeDasharray={`${Math.max(0.02, active.progress_pct / 100)} 1`}
                  />

                  <circle cx={START.x} cy={START.y} r="9" className="city-dot" />
                  <text x={START.x} y={START.y + 32} textAnchor="middle" className="city-label">
                    {active.origin}
                  </text>

                  <circle cx={END.x} cy={END.y} r="9" className="city-dot" />
                  <text x={END.x} y={END.y - 20} textAnchor="middle" className="city-label">
                    {active.destination}
                  </text>

                  <g transform={`translate(${pos.x} ${pos.y})`}>
                    <circle r="18" className="bus-pulse" />
                    <circle r="12" className="bus-dot" />
                    <path d="M -4 -3 L 5 0 L -4 3 Z" fill="#fff" transform={`rotate(${pos.angle})`} />
                  </g>
                </svg>

                <div className="progress" aria-hidden="true" style={{ marginTop: 12 }}>
                  <div className="progress__bar" style={{ width: `${active.progress_pct}%` }} />
                </div>
              </div>

              {/* Panneau latéral : Chauffeur + Journal temps réel */}
              <aside className="card tracking-panel">
                <h2 className="subheading">Équipage & Journal de route</h2>
                <div className="drivers">
                  {active.drivers.length === 0 ? (
                    <span className="muted">Chauffeur en cours d’affectation</span>
                  ) : (
                    active.drivers.map((d) => (
                      <span key={d.first_name} className="driver">
                        <Avatar name={d.first_name} photo={d.photo_path} size={38} />
                        <strong>{d.first_name}</strong>
                      </span>
                    ))
                  )}
                </div>

                {active.updates.length === 0 ? (
                  <p className="muted">Aucun signalement particulier pour le moment. Départ programmé normalement.</p>
                ) : (
                  <ol className="timeline-list">
                    {active.updates.map((u) => {
                      const c = u.cause ? CAUSE_LABELS[u.cause] : null;
                      return (
                        <li key={u.id} className="timeline-item">
                          <div className="timeline-item__top">
                            <strong>{KIND_LABELS[u.kind] ?? u.kind}</strong>
                            <span className="mono muted">
                              {formatTime(u.created_at, active.timezone, i18n.language)}
                            </span>
                          </div>
                          <div className="chips">
                            {c && (
                              <span className="badge">
                                {c.icon} {c.label}
                              </span>
                            )}
                            {u.speed_kmh !== null && <span className="badge mono">{u.speed_kmh} km/h</span>}
                            {u.lat !== null && u.lat !== undefined && u.lng !== null && u.lng !== undefined && (
                              <span className="badge mono">
                                📍 {Number(u.lat).toFixed(4)}, {Number(u.lng).toFixed(4)}
                              </span>
                            )}
                            {u.delay_minutes ? <span className="badge badge--sim">+{u.delay_minutes} min</span> : null}
                          </div>
                          {u.note && <p className="muted" style={{ margin: "4px 0 0" }}>{u.note}</p>}
                        </li>
                      );
                    })}
                  </ol>
                )}
              </aside>
            </div>
          </>
        )}

        {/* Historique GPS & Anciens trajets terminés */}
        {historyTrips.length > 0 && (
          <section className="card form-grid" style={{ marginTop: 28 }}>
            <div>
              <span className="badge">Archives & Télémétrie</span>
              <h2 className="subheading" style={{ margin: "6px 0 0" }}>
                🗺️ Historique GPS (Consulter les anciens trajets terminés)
              </h2>
              <p className="muted" style={{ margin: "4px 0 0", fontSize: "var(--text-sm)" }}>
                Sélectionnez un trajet terminé pour réafficher sur la carte son tracé GPS, ses vitesses et ses alertes (retard, arrêt prolongé, déviation).
              </p>
            </div>
            <ul className="call-list">
              {historyTrips.map((ht) => (
                <li
                  key={ht.trip_id}
                  className="call-row"
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}
                >
                  <div>
                    <span className="badge">🏁 Terminé</span>{" "}
                    <strong>
                      {ht.origin} → {ht.destination}
                    </strong>{" "}
                    <span className="muted">
                      ({ht.agency_name} · {ht.bus_label} {ht.plate})
                    </span>
                    <div className="muted" style={{ fontSize: "var(--text-xs)", marginTop: 4 }}>
                      Départ : {formatDay(ht.departs_at, ht.timezone, i18n.language)} · {ht.updates.length} relevés GPS/statuts enregistrés
                    </div>
                  </div>
                  <button type="button" className="btn btn--ghost" onClick={() => pickTrip(ht)}>
                    Revoir ce trajet sur la carte →
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
