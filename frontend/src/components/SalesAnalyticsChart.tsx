import { useState } from "react";
import { formatMoney } from "../core/format";

interface DataPoint {
  label: string;
  date?: string;
  gross: number;
  net: number;
  commission: number;
  tickets: number;
}

interface SalesAnalyticsData {
  period: string;
  currency_code: string;
  data: DataPoint[];
  summary: {
    total_gross: number;
    total_net: number;
    total_commission: number;
    total_tickets: number;
  };
}

interface Props {
  analytics: SalesAnalyticsData | null;
  period: "daily" | "weekly" | "monthly" | "yearly";
  onPeriodChange: (p: "daily" | "weekly" | "monthly" | "yearly") => void;
  currencyCode: string;
  minorUnits: number;
}

export default function SalesAnalyticsChart({
  analytics,
  period,
  onPeriodChange,
  currencyCode,
  minorUnits,
}: Props) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const money = (n: number) => formatMoney(n, currencyCode, minorUnits, "fr");
  const data = analytics?.data ?? [];
  const maxGross = Math.max(1, ...data.map((d) => d.gross));

  const hovered = hoverIndex !== null && data[hoverIndex] ? data[hoverIndex] : null;

  return (
    <div className="card form-grid" style={{ padding: "var(--space-4) var(--space-5)" }}>
      {/* En-tête avec sélecteur de période */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <span className="badge">📈 Comptabilité & Ventes en Temps Réel</span>
          <h2 className="subheading" style={{ margin: "4px 0 0" }}>
            Diagramme des Ventes & Recettes
          </h2>
          <p className="muted" style={{ margin: 0, fontSize: "var(--text-xs)" }}>
            Visualisez les encaissements, la part nette agence (99,5 %) et les billets émis sur la période choisie.
          </p>
        </div>

        <div className="chips">
          {[
            { id: "daily", label: "24 Heures" },
            { id: "weekly", label: "7 Jours" },
            { id: "monthly", label: "30 Jours" },
            { id: "yearly", label: "Année" },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              className={period === item.id ? "chip is-active" : "chip"}
              onClick={() => onPeriodChange(item.id as any)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Cartes KPI récapitulatives de la période */}
      {analytics && (
        <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          <div className="card kpi-card" style={{ padding: "var(--space-3)" }}>
            <span className="muted" style={{ fontSize: "var(--text-xs)" }}>Chiffre d’affaires brut</span>
            <strong className="mono" style={{ fontSize: "var(--text-xl)" }}>
              {money(analytics.summary.total_gross)}
            </strong>
          </div>
          <div className="card kpi-card kpi-card--accent" style={{ padding: "var(--space-3)" }}>
            <span className="muted" style={{ fontSize: "var(--text-xs)" }}>Recette nette agence (99,5 %)</span>
            <strong className="mono" style={{ fontSize: "var(--text-xl)" }}>
              {money(analytics.summary.total_net)}
            </strong>
          </div>
          <div className="card kpi-card" style={{ padding: "var(--space-3)" }}>
            <span className="muted" style={{ fontSize: "var(--text-xs)" }}>Billets vendus</span>
            <strong className="mono" style={{ fontSize: "var(--text-xl)" }}>
              {analytics.summary.total_tickets}
            </strong>
          </div>
          <div className="card kpi-card" style={{ padding: "var(--space-3)" }}>
            <span className="muted" style={{ fontSize: "var(--text-xs)" }}>Commission VELTRON (0,5 %)</span>
            <strong className="mono" style={{ fontSize: "var(--text-xl)" }}>
              {money(analytics.summary.total_commission)}
            </strong>
          </div>
        </div>
      )}

      {/* Graphique SVG interactif responsive */}
      <div
        style={{
          background: "rgba(0, 0, 0, 0.2)",
          borderRadius: "var(--radius-md)",
          padding: "var(--space-4)",
          border: "1px solid var(--border)",
          position: "relative",
          minHeight: 240,
        }}
      >
        {data.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 0" }} className="muted">
            Aucune vente enregistrée sur cette période.
          </div>
        ) : (
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "flex-end",
                height: 180,
                gap: 8,
                paddingBottom: 24,
                position: "relative",
              }}
            >
              {data.map((dp, idx) => {
                const heightPct = Math.max(6, Math.round((dp.gross / maxGross) * 100));
                const isHovered = hoverIndex === idx;
                return (
                  <div
                    key={idx}
                    style={{
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "flex-end",
                      height: "100%",
                      cursor: "pointer",
                      position: "relative",
                    }}
                    onMouseEnter={() => setHoverIndex(idx)}
                    onMouseLeave={() => setHoverIndex(null)}
                    onClick={() => setHoverIndex(idx)}
                  >
                    {/* Barre de vente */}
                    <div
                      style={{
                        width: "100%",
                        maxWidth: 42,
                        height: `${heightPct}%`,
                        background: isHovered
                          ? "linear-gradient(180deg, #34d399, #059669)"
                          : dp.gross > 0
                          ? "linear-gradient(180deg, #10b981, #047857)"
                          : "rgba(255, 255, 255, 0.08)",
                        borderRadius: "6px 6px 2px 2px",
                        transition: "all 0.2s ease",
                        boxShadow: isHovered ? "0 0 14px rgba(16, 185, 129, 0.6)" : "none",
                        transform: isHovered ? "scaleY(1.04)" : "none",
                        transformOrigin: "bottom",
                      }}
                    />

                    {/* Étiquette d'axe X */}
                    <span
                      className="mono"
                      style={{
                        position: "absolute",
                        bottom: 0,
                        fontSize: "0.68rem",
                        color: isHovered ? "var(--text)" : "var(--text-muted)",
                        fontWeight: isHovered ? 700 : 400,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {dp.label}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Info-bulle détaillée au survol / clic */}
            {hovered && (
              <div
                style={{
                  marginTop: 12,
                  padding: "10px 14px",
                  borderRadius: "var(--radius-sm)",
                  background: "rgba(255, 255, 255, 0.08)",
                  border: "1px solid var(--accent)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 12,
                }}
              >
                <div>
                  <strong style={{ color: "#10b981" }}>Période : {hovered.label}</strong>
                  <span className="muted" style={{ marginInlineStart: 8, fontSize: "var(--text-xs)" }}>
                    ({hovered.tickets} billet{hovered.tickets > 1 ? "s" : ""} émis)
                  </span>
                </div>
                <div style={{ display: "flex", gap: 16 }}>
                  <span>
                    Brut : <strong className="mono">{money(hovered.gross)}</strong>
                  </span>
                  <span>
                    Net Agence (99,5 %) : <strong className="mono" style={{ color: "#10b981" }}>{money(hovered.net)}</strong>
                  </span>
                  <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
                    VELTRON (0,5 %) : {money(hovered.commission)}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

