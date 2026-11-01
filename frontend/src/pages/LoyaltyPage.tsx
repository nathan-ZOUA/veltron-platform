import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
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
    <>
      <section
        className="service-hero photo-bg"
        style={{ "--photo-custom": 'url("/media/loyalty.jpg")' } as React.CSSProperties}
      >
        <div className="photo-bg__image photo-bg__image--custom" />
        <div className="container service-hero__inner">
          <span className="badge">Programme Fidélité Annuel</span>
          <h1 className="display display-xl">Gagnez des points à chaque voyage</h1>
          <p className="lead">
            Chaque billet payé avec votre compte vous rapporte automatiquement des points dans l’agence choisie.
            Votre compteur est actualisé chaque année civile et débloque des récompenses propres à chaque compagnie.
          </p>
        </div>
      </section>

      <div className="container page">
        {!user ? (
          <div className="card form-grid">
            <h2 className="subheading">Connectez-vous pour consulter vos points & récompenses</h2>
            <p className="muted">
              Créez un compte passager ou connectez-vous (astuce : essayez le compte démo <strong>Amina</strong> qui
              possède déjà <strong>40 points</strong> chez Équateur Voyages).
            </p>
            <div className="chips">
              <Link to="/passager/connexion?next=/passager/fidelite" className="btn btn--lg">
                Se connecter / S’inscrire
              </Link>
              <Link to="/passager/agences" className="btn btn--ghost btn--lg">
                Découvrir les agences
              </Link>
            </div>
          </div>
        ) : !data ? (
          <div className="skeleton" style={{ height: 260 }} />
        ) : (
          <>
            <div className="kpi-grid">
              <div className="card kpi-card kpi-card--accent">
                <span className="muted">Solde cumulé ({data.year})</span>
                <strong className="display kpi-card__value mono">{totalPoints} pts</strong>
                <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
                  Répartis par agence partenaire
                </span>
              </div>
              <div className="card kpi-card">
                <span className="muted">Actualisation annuelle</span>
                <strong className="display kpi-card__value mono">31 déc. {data.year}</strong>
                <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
                  Remise à zéro chaque 1er janvier
                </span>
              </div>
              <div className="card kpi-card">
                <span className="muted">Bons cadeaux obtenus</span>
                <strong className="display kpi-card__value mono">{data.vouchers.length}</strong>
                <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
                  Présentez le code au guichet
                </span>
              </div>
            </div>

            {message && (
              <div className="demo-note" role="status">
                <strong>{message}</strong>
              </div>
            )}
            {error && <p className="error">{error}</p>}

            <section>
              <h2 className="subheading" style={{ marginBottom: 16 }}>
                Vos points et récompenses par agence ({data.year})
              </h2>
              <div className="agency-grid">
                {data.agencies.map((ag, idx) => {
                  const nextReward = ag.rewards.find((r) => r.points_required > ag.balance) ?? ag.rewards[ag.rewards.length - 1];
                  const target = nextReward ? nextReward.points_required : 100;
                  const pct = Math.min(100, Math.round((ag.balance / Math.max(1, target)) * 100));

                  return (
                    <motion.div
                      key={ag.id}
                      style={agencyStyle(ag.primary_color)}
                      className="card form-grid"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.06 }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <h3 style={{ margin: 0 }}>{ag.name}</h3>
                          <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
                            +{ag.points_per_trip} pts par trajet · {ag.trips_this_year} voyage(s) en {data.year}
                          </span>
                        </div>
                        <span className="badge mono" style={{ fontSize: "var(--text-base)", fontWeight: 800 }}>
                          {ag.balance} pts
                        </span>
                      </div>

                      <div>
                        <div className="progress">
                          <div className="progress__bar" style={{ width: `${pct}%` }} />
                        </div>
                        {nextReward && (
                          <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
                            {ag.balance >= nextReward.points_required
                              ? "Palier atteint — échangez vos points !"
                              : `Prochain palier : ${nextReward.points_required} pts (${nextReward.title})`}
                          </span>
                        )}
                      </div>

                      <ul className="call-list">
                        {ag.rewards.map((rw) => {
                          const canRedeem = ag.balance >= rw.points_required;
                          return (
                            <li key={rw.id} className="call-row">
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                                <div>
                                  <strong>{rw.title}</strong>
                                  {rw.description && (
                                    <div className="muted" style={{ fontSize: "var(--text-xs)" }}>
                                      {rw.description}
                                    </div>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  className={canRedeem ? "btn" : "chip"}
                                  disabled={!canRedeem || busyId === rw.id}
                                  onClick={() => redeem(rw.id)}
                                >
                                  {canRedeem ? `Échanger (${rw.points_required} pts)` : `${rw.points_required} pts`}
                                </button>
                              </div>
                            </li>
                          );
                        })}
                      </ul>

                      <Link to={`/passager/a/${ag.slug}`} className="link">
                        Réserver chez {ag.name} pour gagner +{ag.points_per_trip} pts →
                      </Link>
                    </motion.div>
                  );
                })}
              </div>
            </section>

            {data.vouchers.length > 0 && (
              <section className="card">
                <h2 className="subheading">Mes bons de récompense actifs</h2>
                <ul className="call-list">
                  {data.vouchers.map((v) => (
                    <li key={v.id} className="call-row" style={agencyStyle(v.primary_color)}>
                      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                        <strong>
                          {v.agency_name} — {v.title}
                        </strong>
                        <span className="badge mono" style={{ fontWeight: 800 }}>
                          {v.code}
                        </span>
                      </div>
                      <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
                        Statut : {v.status === "issued" ? "Valide — à présenter au guichet" : v.status}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </>
  );
}

