import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { api, ApiError } from "../core/api";
import { useAuth } from "../core/auth";
import { agencyStyle } from "../core/format";

interface Reward {
  id: number;
  title: string;
  description: string | null;
  points_required: number;
}

interface LoyaltyAgency {
  id: number;
  slug: string;
  name: string;
  primary_color: string;
  points_per_trip: number;
  balance: number;
  trips_this_year: number;
  rewards: Reward[];
}

interface Voucher {
  id: number;
  code: string;
  status: string;
  created_at: string;
  title: string;
  points_required: number;
  agency_name: string;
  primary_color: string;
}

interface LoyaltyPayload {
  year: number;
  reset_date: string;
  agencies: LoyaltyAgency[];
  vouchers: Voucher[];
}

export default function LoyaltyPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [data, setData] = useState<LoyaltyPayload | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(() => {
    if (!user) return;
    api<LoyaltyPayload>("/me/loyalty", { realm: "passenger" })
      .then(setData)
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  async function redeem(rewardId: number) {
    setBusyId(rewardId);
    setError("");
    setMessage("");
    try {
      const v = await api<{ code: string; title: string; agency_name: string }>("/me/loyalty/redeem", {
        body: { reward_id: rewardId },
        realm: "passenger",
      });
      setMessage(`🎁 Récompense débloquée chez ${v.agency_name} : « ${v.title} » — Code guichet : ${v.code}`);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Échange impossible.");
    } finally {
      setBusyId(null);
    }
  }

  const totalPoints = data?.agencies.reduce((s, a) => s + a.balance, 0) ?? 0;

  return (
    <div className="loyalty-page-wrapper">
      <section
        className="service-hero photo-bg"
        style={{ "--photo-custom": 'url("/media/loyalty.jpg")' } as React.CSSProperties}
      >
        <div className="photo-bg__image photo-bg__image--custom" />
        <div className="container service-hero__inner">
          <span className="badge">⭐ {t("loyalty.badge")}</span>
          <h1 className="display display-xl">{t("loyalty.title")}</h1>
          <p className="lead">
            {t("loyalty.subtitle")}
          </p>
        </div>
      </section>

      <div className="container page">
        {!user ? (
          <div className="card loyalty-login-prompt">
            <h2 className="subheading">{t("loyalty.signInPrompt")}</h2>
            <p className="muted">
              {t("cards.loyalty.text")}
            </p>
            <div className="chips">
              <Link to="/passager/connexion?next=/passager/fidelite" className="btn btn--lg">
                {t("nav.login")}
              </Link>
              <Link to="/passager/agences" className="btn btn--ghost btn--lg">
                {t("nav.agencies")}
              </Link>
            </div>
          </div>
        ) : !data ? (
          <div className="skeleton" style={{ height: 280, borderRadius: 16 }} />
        ) : (
          <>
            {/* KPI METRICS CARDS */}
            <div className="kpi-grid loyalty-kpi-grid">
              <div className="card kpi-card kpi-card--accent">
                <span className="muted">{t("loyalty.totalBalance")} ({data.year})</span>
                <strong className="display kpi-card__value mono">{totalPoints} pts</strong>
                <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
                  {t("loyalty.badge")}
                </span>
              </div>
              <div className="card kpi-card">
                <span className="muted">{t("loyalty.annualTrips")}</span>
                <strong className="display kpi-card__value mono">31 déc. {data.year}</strong>
                <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
                  {t("loyalty.expiryNotice")}
                </span>
              </div>
              <div className="card kpi-card">
                <span className="muted">{t("loyalty.myVouchers")}</span>
                <strong className="display kpi-card__value mono">{data.vouchers.length}</strong>
                <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
                  {t("loyalty.availableRewards")}
                </span>
              </div>
            </div>

            {message && (
              <motion.div
                className="demo-note"
                role="status"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                style={{ background: "rgba(16, 185, 129, 0.12)", border: "1.5px solid #10b981", color: "#10b981", borderRadius: 12, padding: "14px 18px" }}
              >
                <strong>{message}</strong>
              </motion.div>
            )}
            {error && <p className="error" role="alert">{error}</p>}

            {/* GRILLE PAR AGENCE PARTENAIRE */}
            <section className="loyalty-agencies-section">
              <div className="loyalty-section-header">
                <h2 className="subheading" style={{ margin: 0 }}>
                  Vos points et récompenses par agence ({data.year})
                </h2>
                <span className="muted" style={{ fontSize: "var(--text-sm)" }}>
                  {data.agencies.length} agence(s) dans votre réseau fidélité
                </span>
              </div>

              <div className="loyalty-agencies-grid">
                {data.agencies.map((ag, idx) => {
                  const nextReward = ag.rewards.find((r) => r.points_required > ag.balance) ?? ag.rewards[ag.rewards.length - 1];
                  const target = nextReward ? nextReward.points_required : 100;
                  const pct = Math.min(100, Math.round((ag.balance / Math.max(1, target)) * 100));

                  return (
                    <motion.div
                      key={ag.id}
                      style={agencyStyle(ag.primary_color)}
                      className="card loyalty-agency-card"
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                    >
                      <div className="loyalty-agency-card__header">
                        <div className="loyalty-agency-info">
                          <h3 className="loyalty-agency-name">{ag.name}</h3>
                          <span className="loyalty-agency-meta">
                            +{ag.points_per_trip} pts / trajet · {ag.trips_this_year} voyage(s) cette année
                          </span>
                        </div>
                        <div className="loyalty-points-badge mono">
                          {ag.balance} <span style={{ fontSize: "0.75rem", fontWeight: 600 }}>pts</span>
                        </div>
                      </div>

                      {/* Barre de progression palier */}
                      <div className="loyalty-progress-container">
                        <div className="progress loyalty-progress-bar">
                          <div className="progress__bar" style={{ width: `${pct}%`, background: ag.primary_color || "var(--accent)" }} />
                        </div>
                        <div className="loyalty-tier-hint">
                          {nextReward ? (
                            ag.balance >= nextReward.points_required ? (
                              <span className="badge badge--ok" style={{ fontSize: "0.72rem" }}>Palier atteint — débloquez votre bon ci-dessous !</span>
                            ) : (
                              <span>Prochain palier : <strong>{nextReward.points_required} pts</strong> ({nextReward.title})</span>
                            )
                          ) : (
                            <span>Points cumulables sans limite</span>
                          )}
                        </div>
                      </div>

                      {/* Liste des récompenses disponibles */}
                      <div className="loyalty-rewards-box">
                        <span className="loyalty-rewards-title">Catalogue des Récompenses</span>
                        <div className="loyalty-rewards-list">
                          {ag.rewards.map((rw) => {
                            const canRedeem = ag.balance >= rw.points_required;
                            return (
                              <div key={rw.id} className={`loyalty-reward-row ${canRedeem ? "can-redeem" : ""}`}>
                                <div className="loyalty-reward-details">
                                  <strong className="loyalty-reward-name">{rw.title}</strong>
                                  {rw.description && (
                                    <span className="loyalty-reward-desc">{rw.description}</span>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  className={`btn loyalty-redeem-btn ${canRedeem ? "btn--primary" : "btn--ghost"}`}
                                  disabled={!canRedeem || busyId === rw.id}
                                  onClick={() => redeem(rw.id)}
                                >
                                  {canRedeem ? `🎁 Échanger (${rw.points_required} pts)` : `${rw.points_required} pts`}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="loyalty-agency-card__footer">
                        <Link to={`/passager/a/${ag.slug}`} className="loyalty-book-link">
                          Réserver chez {ag.name} pour gagner +{ag.points_per_trip} pts →
                        </Link>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </section>

            {/* BONS CADEAUX & VOUCHERS DÉJÀ OBTENUS */}
            {data.vouchers.length > 0 && (
              <section className="card loyalty-vouchers-card" style={{ marginTop: 24 }}>
                <div className="loyalty-section-header">
                  <h2 className="subheading" style={{ margin: 0 }}>
                    🎟️ Mes bons de récompense débloqués ({data.vouchers.length})
                  </h2>
                  <p className="muted" style={{ margin: "4px 0 0", fontSize: "var(--text-xs)" }}>
                    Présentez ce code au guichet de l'agence ou appliquez-le lors de votre réservation pour bénéficier de votre avantage.
                  </p>
                </div>

                <div className="loyalty-vouchers-grid">
                  {data.vouchers.map((v) => (
                    <div key={v.id} className="loyalty-voucher-item" style={agencyStyle(v.primary_color)}>
                      <div className="voucher-item__left">
                        <span className="voucher-agency-name">{v.agency_name}</span>
                        <strong className="voucher-title">{v.title}</strong>
                        <span className="voucher-meta">
                          Statut : {v.status === "issued" ? "🟢 Valide — Actif en gare" : v.status}
                        </span>
                      </div>
                      <div className="voucher-item__right">
                        <span className="voucher-code-chip mono">{v.code}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
