import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import ThemeToggle from "../components/ThemeToggle";
import { api, ApiError } from "../core/api";
import { useAuth } from "../core/auth";
import { formatMoney } from "../core/format";
import type { VerificationReport } from "../core/types";

interface AdminAgency {
  id: number;
  public_code: string;
  slug: string;
  name: string;
  status: string;
  verification_status: string;
  verification_score: number | null;
  verification_report: VerificationReport | null;
  email: string;
  phone: string | null;
  address: string;
  legal_id: string | null;
  currency_code: string;
  country_name: string;
  whatsapp_url: string | null;
  mailto_url: string;
}

interface PlatformAlert {
  id: number;
  agency_id: number | null;
  kind: string;
  title: string;
  body: string;
  channels: {
    owner_email?: string;
    agency_whatsapp_url?: string | null;
    agency_mailto_url?: string | null;
  } | null;
  resolved_at: string | null;
  created_at: string;
}

interface PlatformCommission {
  id: number;
  trip_id: number;
  agency_id: number;
  agency_name: string;
  public_code: string;
  origin: string;
  destination: string;
  departs_at: string;
  seats_filled: number;
  seat_capacity: number;
  is_full_bus: number;
  gross_amount: number;
  rate_bps: number;
  commission_amount: number;
  currency_code: string;
  trigger_event: "departed" | "full_bus" | "completed";
  settled_at: string;
}

interface CommissionTotal {
  currency_code: string;
  total_commission: number;
  total_gross: number;
  trips_count: number;
}

// Portail de Supervision Propriétaire VELTRON (/supervision) :
// C'est VOUS (le propriétaire de VELTRON) qui voyez ici les dossiers que le Système IA
// n'a pas pu valider automatiquement, ainsi que vos reversements automatiques de 0,5 % par voyage.
export default function Admin() {
  const { platformAdmin, loginPlatform, logoutPlatform } = useAuth();
  const [creds, setCreds] = useState({ email: "admin@veltron.test", password: "" });
  const [agencies, setAgencies] = useState<AdminAgency[]>([]);
  const [alerts, setAlerts] = useState<PlatformAlert[]>([]);
  const [commissions, setCommissions] = useState<PlatformCommission[]>([]);
  const [commissionTotals, setCommissionTotals] = useState<CommissionTotal[]>([]);
  const [ownerAccount, setOwnerAccount] = useState("VELTRON OWNER - Nathan Zoua");
  const [commissionRateBps, setCommissionRateBps] = useState(50);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(() => {
    if (!platformAdmin) return;
    api<{
      agencies: AdminAgency[];
      alerts: PlatformAlert[];
      commissions?: PlatformCommission[];
      commission_totals?: CommissionTotal[];
      owner_account?: string;
      commission_rate_bps?: number;
    }>(`/platform/overview${filter ? `?status=${filter}` : ""}`, { realm: "platform" })
      .then((res) => {
        setAgencies(res.agencies);
        setAlerts(res.alerts);
        setCommissions(res.commissions ?? []);
        setCommissionTotals(res.commission_totals ?? []);
        if (res.owner_account) setOwnerAccount(res.owner_account);
        if (res.commission_rate_bps) setCommissionRateBps(res.commission_rate_bps);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Erreur de chargement."));
  }, [platformAdmin, filter]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await loginPlatform(creds.email, creds.password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Connexion refusée.");
    }
  }

  async function decide(id: number, decision: "approve" | "reject" | "suspend") {
    setError("");
    setNotice("");
    try {
      await api(`/platform/agencies/${id}/decision`, {
        body: { decision },
        realm: "platform",
      });
      setNotice("✓ Décision appliquée avec succès.");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Action refusée.");
    }
  }

  return (
    <div className="portal-shell">
      <header className="site-header">
        <div className="container site-header__inner">
          <div className="brand-group">
            <Link to="/" className="brand">
              <span className="brand__mark">V</span>
              <span>VELTRON SUPERVISION</span>
            </Link>
            <Link to="/" className="portal-pill">
              Accueil ⇄
            </Link>
          </div>
          <div className="header-tools">
            {platformAdmin && (
              <button type="button" className="btn btn--ghost header-auth" onClick={logoutPlatform}>
                Déconnexion Propriétaire
              </button>
            )}
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="container page">
        {!platformAdmin ? (
          <form className="card form-grid" style={{ maxWidth: 480, marginInline: "auto" }} onSubmit={handleLogin}>
            <span className="badge">Accès Propriétaire VELTRON</span>
            <h1 className="display display-xl" style={{ margin: 0 }}>
              Supervision IA & Escalades
            </h1>
            <p className="muted" style={{ margin: 0, fontSize: "var(--text-sm)" }}>
              Cet espace vous appartient : l’IA vérifie et active automatiquement les agences authentiques, et vous
              transmet ici (ainsi que par E-mail / WhatsApp) uniquement les dossiers nécessitant votre arbitrage.
            </p>
            <label className="field">
              <span className="field__label">E-mail propriétaire</span>
              <input
                className="input"
                type="email"
                required
                value={creds.email}
                onChange={(e) => setCreds({ ...creds, email: e.target.value })}
              />
            </label>
            <label className="field">
              <span className="field__label">Mot de passe</span>
              <input
                className="input"
                type="password"
                required
                value={creds.password}
                onChange={(e) => setCreds({ ...creds, password: e.target.value })}
              />
            </label>
            {error && <p className="error">{error}</p>}
            <button type="submit" className="btn btn--lg">
              Ouvrir la console propriétaire
            </button>
            <div className="demo-note">
              Démo locale : <code>admin@veltron.test</code> / mot de passe{" "}
              <button
                type="button"
                className="chip"
                onClick={() => setCreds({ email: "admin@veltron.test", password: "Veltron#2026" })}
              >
                Remplir Veltron#2026
              </button>
            </div>
          </form>
        ) : (
          <>
            <header className="page__header">
              <span className="badge">Propriétaire VELTRON · {platformAdmin.first_name}</span>
              <h1 className="display display-xl">Supervision des agences & Alertes IA</h1>
              <p className="lead">
                Lorsqu’une agence obtient un score IA ≥ 75/100 sans anomalie, elle est activée automatiquement. En
                dessous de ce seuil, une alerte vous est envoyée avec liens directs WhatsApp et E-mail pour discuter
                avec le créateur et débloquer son dossier.
              </p>
            </header>

            {notice && <div className="demo-note">{notice}</div>}
            {error && <p className="error">{error}</p>}

            {/* Compte Propriétaire VELTRON : Commissions automatiques 0,5 % par voyage */}
            <section className="card form-grid">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                <div>
                  <span className="badge">Contrat Commercial {(commissionRateBps / 100).toFixed(1)} % Automatique</span>
                  <h2 className="subheading" style={{ margin: "6px 0 0" }}>
                    💰 Mon Compte Propriétaire ({ownerAccount})
                  </h2>
                  <p className="muted" style={{ margin: "4px 0 0", fontSize: "var(--text-sm)" }}>
                    À chaque fois qu’un bus est plein ou qu’un départ est effectué,{" "}
                    <strong>{(commissionRateBps / 100).toFixed(1)} % du montant totalisé du voyage</strong> est crédité automatiquement sur votre compte propriétaire.
                  </p>
                </div>
              </div>

              {commissionTotals.length > 0 && (
                <div className="kpi-grid">
                  {commissionTotals.map((ct) => {
                    const minor = ct.currency_code === "XAF" || ct.currency_code === "XOF" ? 0 : 2;
                    return (
                      <div key={ct.currency_code} className="card kpi-card kpi-card--accent">
                        <span className="muted">Vos gains propriétaires ({ct.currency_code})</span>
                        <strong className="display kpi-card__value mono">
                          {formatMoney(Number(ct.total_commission), ct.currency_code, minor, "fr")}
                        </strong>
                        <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
                          Sur {formatMoney(Number(ct.total_gross), ct.currency_code, minor, "fr")} de volume ({ct.trips_count} voyage(s) prélevés)
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {commissions.length === 0 ? (
                <p className="muted" style={{ margin: 0 }}>
                  Aucun reversement enregistré pour le moment. Dès qu’un départ est effectué ou qu’un bus est complet, la commission de 0,5 % apparaît ici.
                </p>
              ) : (
                <ul className="call-list">
                  {commissions.map((c) => {
                    const minor = c.currency_code === "XAF" || c.currency_code === "XOF" ? 0 : 2;
                    return (
                      <li
                        key={c.id}
                        className="call-row"
                        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}
                      >
                        <div>
                          <span className="badge mono">{c.public_code}</span>{" "}
                          <strong>{c.agency_name}</strong> · {c.origin} → {c.destination}
                          <div className="muted" style={{ fontSize: "var(--text-xs)", marginTop: 4 }}>
                            {c.is_full_bus ? "🟢 Bus Plein" : "🚌 Départ effectué"} ({c.seats_filled}/{c.seat_capacity} places) · Total voyage :{" "}
                            {formatMoney(Number(c.gross_amount), c.currency_code, minor, "fr")} · Versé le {c.settled_at}
                          </div>
                        </div>
                        <span className="badge mono" style={{ fontSize: "var(--text-sm)" }}>
                          +{formatMoney(Number(c.commission_amount), c.currency_code, minor, "fr")} ({(c.rate_bps / 100).toFixed(1)} %)
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {/* Alertes escaladées par le système IA */}
            {alerts.length > 0 && (
              <section className="card form-grid">
                <h2 className="subheading" style={{ margin: 0 }}>
                  🚨 Alertes transmises par le Système de Vérification IA ({alerts.filter((a) => !a.resolved_at).length} ouvertes)
                </h2>
                <ul className="call-list">
                  {alerts.map((al) => (
                    <li key={al.id} className="call-row">
                      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                        <strong>{al.title}</strong>
                        <span className="badge">{al.resolved_at ? "✓ Résolue" : "À traiter"}</span>
                      </div>
                      <pre
                        className="muted"
                        style={{
                          margin: 0,
                          whiteSpace: "pre-wrap",
                          fontFamily: "var(--font-body)",
                          fontSize: "var(--text-xs)",
                        }}
                      >
                        {al.body}
                      </pre>
                      <div className="chips">
                        {al.channels?.agency_whatsapp_url && (
                          <a
                            href={al.channels.agency_whatsapp_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn"
                          >
                            💬 Contacter l’agence sur WhatsApp
                          </a>
                        )}
                        {al.channels?.agency_mailto_url && (
                          <a href={al.channels.agency_mailto_url} className="btn btn--ghost">
                            ✉️ Envoyer un e-mail à l’agence
                          </a>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Filtres & liste de toutes les agences */}
            <div className="chips">
              {[
                { v: "", label: "Toutes les agences" },
                { v: "pending", label: "En revue IA (pending)" },
                { v: "active", label: "Actives" },
                { v: "suspended", label: "Suspendues" },
              ].map((f) => (
                <button
                  key={f.v}
                  type="button"
                  className={filter === f.v ? "chip is-active" : "chip"}
                  onClick={() => setFilter(f.v)}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="form-grid">
              {agencies.map((ag) => (
                <article key={ag.id} className="card form-grid">
                  <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                    <div>
                      <span className="badge mono">{ag.public_code}</span>{" "}
                      <strong style={{ fontSize: "var(--text-lg)" }}>{ag.name}</strong>{" "}
                      <span className="muted">
                        ({ag.country_name} · {ag.currency_code})
                      </span>
                    </div>
                    <div className="chips">
                      {ag.verification_score !== null && (
                        <span className="badge mono">Score IA : {ag.verification_score}/100</span>
                      )}
                      <span className="badge">{ag.status}</span>
                    </div>
                  </div>

                  <div className="muted" style={{ fontSize: "var(--text-sm)" }}>
                    📍 {ag.address} · ✉️ {ag.email} {ag.phone ? `· 📞 ${ag.phone}` : ""}{" "}
                    {ag.legal_id ? `· Immat. ${ag.legal_id}` : ""}
                  </div>

                  {ag.verification_report && (
                    <div className="demo-note">
                      <strong>Rapport IA :</strong> {ag.verification_report.summary}
                      {ag.verification_report.flags?.length > 0 && (
                        <ul className="plain-list" style={{ marginTop: 6 }}>
                          {ag.verification_report.flags.map((fl) => (
                            <li key={fl}>{fl}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  <div className="chips">
                    {ag.whatsapp_url && (
                      <a href={ag.whatsapp_url} target="_blank" rel="noopener noreferrer" className="chip">
                        💬 WhatsApp Agence
                      </a>
                    )}
                    <a href={ag.mailto_url} className="chip">
                      ✉️ E-mail Agence
                    </a>

                    {ag.status !== "active" && (
                      <button type="button" className="btn" onClick={() => decide(ag.id, "approve")}>
                        ✓ Valider & Activer
                      </button>
                    )}
                    {ag.status === "pending" && (
                      <button type="button" className="btn btn--ghost" onClick={() => decide(ag.id, "reject")}>
                        Refuser
                      </button>
                    )}
                    {ag.status === "active" && (
                      <button type="button" className="btn btn--ghost" onClick={() => decide(ag.id, "suspend")}>
                        Suspendre
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
