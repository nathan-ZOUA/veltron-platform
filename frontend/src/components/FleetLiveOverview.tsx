import { formatDay, formatTime } from "../core/format";

interface FleetTrip {
  id: number;
  status: string;
  departs_at: string;
  arrives_at: string | null;
  delay_minutes: number;
  current_lat: number | null;
  current_lng: number | null;
  current_speed_kmh: number | null;
  current_progress_pct: number | null;
  last_gps_at: string | null;
  origin: string;
  destination: string;
  distance_km: number;
  bus_label: string;
  plate: string;
  seat_count: number;
  booked_seats: number;
  boarded_seats: number;
  is_full: boolean;
  driver_name: string | null;
  driver_phone: string | null;
}

interface Props {
  fleet: FleetTrip[];
  onRefresh: () => void;
  timezone: string;
  language: string;
}

export default function FleetLiveOverview({ fleet, onRefresh, timezone, language }: Props) {
  const activeCount = fleet.filter((t) => t.status === "departed").length;
  const withGpsCount = fleet.filter((t) => t.current_lat !== null).length;

  return (
    <div className="card form-grid">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <span className="badge">📡 Télémétrie Flotte & GPS Temps Réel</span>
          <h2 className="subheading" style={{ margin: "4px 0 0" }}>
            Vision d’Ensemble de la Flotte & Géolocalisation
          </h2>
          <p className="muted" style={{ margin: 0, fontSize: "var(--text-xs)" }}>
            Suivi des autocars en rotation, vitesses km/h, positions GPS des chauffeurs et taux d’occupation.
          </p>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span className="badge" style={{ background: "#10b981", color: "#fff" }}>
            🟢 {activeCount} bus en route ({withGpsCount} avec signal GPS)
          </span>
          <button type="button" className="btn btn--sm" onClick={onRefresh}>
            🔄 Actualiser positions
          </button>
        </div>
      </div>

      {fleet.length === 0 ? (
        <p className="muted" style={{ padding: "20px 0" }}>
          Aucun départ actif en ce moment. Les bus programmés apparaîtront ici dès leur ouverture.
        </p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
          {fleet.map((tr) => {
            const hasGps = tr.current_lat !== null && tr.current_lng !== null;
            const pct = tr.current_progress_pct ?? Math.round((tr.boarded_seats / Math.max(1, tr.seat_count)) * 100);
            return (
              <div
                key={tr.id}
                className="card form-grid"
                style={{
                  padding: "var(--space-4)",
                  border: tr.status === "departed" ? "2px solid #10b981" : "1px solid var(--border)",
                  background: tr.status === "departed" ? "rgba(16, 185, 129, 0.04)" : "var(--surface)",
                  position: "relative",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: "var(--text-lg)" }}>
                      {tr.origin} → {tr.destination}
                    </h3>
                    <span className="muted mono" style={{ fontSize: "var(--text-xs)" }}>
                      Départ : {formatDay(tr.departs_at, timezone, language)} à {formatTime(tr.departs_at, timezone, language)}
                    </span>
                    <div className="muted" style={{ fontSize: "var(--text-xs)", marginTop: 2 }}>
                      Bus : <strong>{tr.bus_label}</strong> (<span className="mono">{tr.plate}</span>)
                    </div>
                  </div>
                  <span
                    className="badge"
                    style={{
                      background: tr.status === "departed" ? "#10b981" : undefined,
                      color: tr.status === "departed" ? "#fff" : undefined,
                      fontWeight: 700,
                    }}
                  >
                    {tr.status === "departed" ? "🚌 En route" : tr.status === "boarding" ? "🚪 Embarquement" : "⏳ Programmé"}
                  </span>
                </div>

                {/* Évolution GPS & Vitesse */}
                <div
                  style={{
                    background: "rgba(0,0,0,0.25)",
                    borderRadius: "var(--radius-sm)",
                    padding: "10px 12px",
                    display: "grid",
                    gap: 6,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "var(--text-xs)" }}>
                      Chauffeur : <strong>{tr.driver_name ?? "Chauffeur assigné"}</strong>
                      {tr.driver_phone && <span className="mono muted"> ({tr.driver_phone})</span>}
                    </span>
                    {tr.current_speed_kmh !== null && (
                      <span className="badge mono" style={{ background: "#3b82f6", color: "#fff", fontWeight: 700 }}>
                        ⚡ {tr.current_speed_kmh} km/h
                      </span>
                    )}
                  </div>

                  {hasGps ? (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "var(--text-xs)" }}>
                      <span className="mono" style={{ color: "#34d399" }}>
                        📍 ({Number(tr.current_lat).toFixed(4)}, {Number(tr.current_lng).toFixed(4)})
                      </span>
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${tr.current_lat},${tr.current_lng}`}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn--sm btn--ghost"
                        style={{ padding: "2px 8px", fontSize: "0.72rem" }}
                      >
                        🗺️ Google Maps ↗
                      </a>
                    </div>
                  ) : (
                    <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
                      📡 En attente du signal GPS du smartphone chauffeur...
                    </span>
                  )}

                  {/* Barre d'avancement du trajet */}
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem", marginBottom: 3 }}>
                      <span>Progression du trajet</span>
                      <span className="mono">{pct} %</span>
                    </div>
                    <div className="progress" style={{ height: 6 }}>
                      <div className="progress__bar" style={{ width: `${pct}%`, background: "#10b981" }} />
                    </div>
                  </div>
                </div>

                {/* Places & Remplissage */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "var(--text-xs)" }}>
                  <span>
                    Occupation : <strong className="mono">{tr.booked_seats} / {tr.seat_count}</strong> ({tr.boarded_seats} à bord)
                  </span>
                  {tr.is_full && (
                    <span className="badge" style={{ background: "#10b981", color: "#fff", fontWeight: 700 }}>
                      🟢 Bus Plein
                    </span>
                  )}
                </div>

                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                  <a
                    href={`/passager/suivi?trip=${tr.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn--sm btn--ghost"
                    style={{ flex: 1, textAlign: "center" }}
                  >
                    Suivi Passager Public ↗
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
