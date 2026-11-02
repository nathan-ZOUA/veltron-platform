import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { api, ApiError } from "../core/api";
import { agencyStyle, formatDay, formatTime } from "../core/format";
import type { TicketListItem } from "../core/types";

function ReviewForm({ ticketId, onDone }: { ticketId: number; onDone: () => void }) {
  const { t } = useTranslation();
  const [ratings, setRatings] = useState({ rating_agency: 5, rating_bus: 5, rating_trip: 5 });
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");

  async function submit() {
    try {
      await api(`/tickets/${ticketId}/review`, { body: { ...ratings, comment }, realm: "passenger" });
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("common.error"));
    }
  }

  const labels: [keyof typeof ratings, string][] = [
    ["rating_agency", t("agency.rAgency")],
    ["rating_bus", t("agency.rBus")],
    ["rating_trip", t("agency.rTrip")],
  ];

  return (
    <div className="review-form">
      {labels.map(([key, label]) => (
        <label key={key} className="field">
          <span className="field__label">{label}</span>
          <select
            className="select"
            value={ratings[key]}
            onChange={(e) => setRatings({ ...ratings, [key]: Number(e.target.value) })}>
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>
                {"★".repeat(n)}
              </option>
            ))}
          </select>
        </label>
      ))}
      <label className="field">
        <span className="field__label">{t("mine.comment")}</span>
        <textarea className="textarea" value={comment} onChange={(e) => setComment(e.target.value)} />
      </label>
      <button type="button" className="btn" onClick={submit}>
        {t("mine.send")}
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

export default function MyTickets() {
  const { t, i18n } = useTranslation();
  const [tickets, setTickets] = useState<TicketListItem[] | null>(null);
  const [activeTab, setActiveTab] = useState<"active" | "history">("active");
  const [reviewing, setReviewing] = useState<number | null>(null);
  const [notice, setNotice] = useState<string>("");
  const [retentionDays, setRetentionDays] = useState<number>(0);
  const [savingSettings, setSavingSettings] = useState(false);

  const load = () => {
    api<TicketListItem[]>("/me/tickets", { realm: "passenger" })
      .then(setTickets)
      .catch(() => setTickets([]));
  };

  const loadRetention = () => {
    api<{ retention_days: number }>("/me/history-settings", { realm: "passenger" })
      .then((res) => setRetentionDays(res.retention_days))
      .catch(() => setRetentionDays(0));
  };

  useEffect(() => {
    load();
    loadRetention();
  }, []);

  // Séparation entre billets actifs/en cours et historique passé
  const activeTickets = useMemo(() => {
    if (!tickets) return [];
    return tickets.filter(
      (k) =>
        k.status === "boarded" ||
        k.status === "valid" ||
        (k.trip_status && ["scheduled", "boarding", "departed"].includes(k.trip_status))
    );
  }, [tickets]);

  const historyTickets = useMemo(() => {
    if (!tickets) return [];
    return tickets.filter(
      (k) =>
        k.status === "completed" ||
        k.status === "cancelled" ||
        k.status === "refunded" ||
        k.status === "no_show" ||
        (k.trip_status === "completed" && k.status !== "boarded")
    );
  }, [tickets]);

  // Supprimer manuellement un billet de son historique
  async function handleDeleteTicket(ticketId: number) {
    if (!confirm("Voulez-vous retirer ce voyage de votre historique ?")) return;
    try {
      await api(`/me/tickets/${ticketId}/hide`, { body: {}, realm: "passenger" });
      setTickets((prev) => (prev ? prev.filter((t) => t.id !== ticketId) : []));
      setNotice("✓ Voyage retiré de votre historique.");
    } catch {
      alert("Erreur lors de la suppression du voyage.");
    }
  }

  // Mettre à jour la fréquence de purge automatique
  async function handleUpdateRetention(days: number) {
    setSavingSettings(true);
    setNotice("");
    try {
      await api("/me/history-settings", { body: { retention_days: days }, realm: "passenger" });
      setRetentionDays(days);
      setNotice(
        days === 0
          ? "✓ Conservation manuelle configurée (aucun effacement automatique)."
          : `✓ Purge automatique configurée : vos voyages terminés de plus de ${days} jours seront automatiquement effacés de votre historique.`
      );
      load();
    } catch {
      alert("Erreur lors de l'enregistrement de vos préférences d'historique.");
    } finally {
      setSavingSettings(false);
    }
  }

  return (
    <div className="container page">
      <header className="page__header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 className="display display-xl" style={{ margin: "0 0 4px" }}>
            {t("mine.title")}
          </h1>
          <p className="muted" style={{ margin: 0, fontSize: "var(--text-sm)" }}>
            Retrouvez tous vos billets, suivez vos bus en temps réel et gérez la conservation de votre historique.
          </p>
        </div>

        {/* Onglets de bascule Billets actifs vs Historique */}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            className={`btn ${activeTab === "active" ? "btn--primary" : "btn--ghost"}`}
            onClick={() => setActiveTab("active")}
            style={{ fontWeight: 700 }}
          >
            🎫 Voyages en Cours ({activeTickets.length})
          </button>
          <button
            type="button"
            className={`btn ${activeTab === "history" ? "btn--primary" : "btn--ghost"}`}
            onClick={() => setActiveTab("history")}
            style={{ fontWeight: 700 }}
          >
            📜 Historique ({historyTickets.length})
          </button>
        </div>
      </header>

      {notice && (
        <div className="card" style={{ background: "rgba(16, 185, 129, 0.12)", borderColor: "#10b981", color: "#059669", padding: "var(--space-3)", marginBottom: "var(--space-3)" }}>
          <strong>{notice}</strong>
        </div>
      )}

      {/* PARAMÈTRES DE PURGE DANS L'ONGLET HISTORIQUE */}
      {activeTab === "history" && (
        <div
          className="card"
          style={{
            background: "var(--surface-hover)",
            border: "1px solid var(--border)",
            padding: "var(--space-3)",
            marginBottom: "var(--space-4)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div>
            <strong style={{ fontSize: "var(--text-sm)", display: "block" }}>
              ⏱️ Fréquence de suppression automatique de l'historique :
            </strong>
            <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
              Vos voyages terminés peuvent s'effacer automatiquement selon la fréquence de votre choix (vos billets restent certifiés pour la comptabilité de l'agence).
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <select
              className="select"
              value={retentionDays}
              disabled={savingSettings}
              onChange={(e) => handleUpdateRetention(Number(e.target.value))}
              style={{ fontSize: "var(--text-xs)", minWidth: 180 }}
            >
              <option value={0}>Manuel (Ne jamais supprimer)</option>
              <option value={7}>Supprimer après 7 jours</option>
              <option value={30}>Supprimer après 30 jours</option>
              <option value={90}>Supprimer après 90 jours (3 mois)</option>
              <option value={180}>Supprimer après 180 jours (6 mois)</option>
              <option value={365}>Supprimer après 1 an</option>
            </select>
          </div>
        </div>
      )}

      {tickets === null && <div className="skeleton" style={{ height: 140 }} />}

      {/* VUE 1 : VOYAGES EN COURS */}
      {activeTab === "active" && (
        <div>
          {activeTickets.length === 0 && (
            <div className="card" style={{ padding: "var(--space-4)", textAlign: "center" }}>
              <p className="muted" style={{ margin: "0 0 12px" }}>
                Vous n'avez aucun voyage en cours ou à venir.
              </p>
              <Link to="/passager/agences" className="btn btn--primary">
                Explorer les départs disponibles →
              </Link>
            </div>
          )}

          <ul className="trip-list">
            <AnimatePresence>
              {activeTickets.map((k, index) => {
                const isBoarded = k.status === "boarded";
                return (
                  <motion.li
                    key={k.id}
                    style={agencyStyle(k.primary_color)}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <article
                      className="card trip card--hover"
                      style={{
                        border: isBoarded ? "2px solid #10b981" : "1px solid var(--border)",
                        background: isBoarded ? "linear-gradient(135deg, rgba(16, 185, 129, 0.08), var(--surface))" : "var(--surface)",
                      }}
                    >
                      <div className="trip__times">
                        <div>
                          <span className="muted">{formatDay(k.departs_at, k.timezone, i18n.language)}</span>
                          <strong className="mono">{formatTime(k.departs_at, k.timezone, i18n.language)}</strong>
                        </div>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <strong style={{ fontSize: "var(--text-base)" }}>
                              {k.origin} <span className="flip-rtl">→</span> {k.destination}
                            </strong>
                            {isBoarded ? (
                              <span
                                className="badge"
                                style={{
                                  background: "#10b981",
                                  color: "#ffffff",
                                  fontWeight: 800,
                                  fontSize: 11,
                                  boxShadow: "0 0 10px rgba(16, 185, 129, 0.5)",
                                }}
                              >
                                🟢 À BORD DU BUS
                              </span>
                            ) : (
                              <span className="badge" style={{ fontSize: 11 }}>
                                ⚪ {t(`ticket.statuses.${k.status}`)}
                              </span>
                            )}
                          </div>
                          <span className="muted">
                            {k.agency_name} · Siège #{k.seat_no} · <span className="mono">{k.reference}</span>
                            {k.delay_minutes ? ` · ⚠ Retard +${k.delay_minutes} min` : ""}
                          </span>
                        </div>
                      </div>

                      <div className="trip__buy">
                        <div className="chips">
                          <Link to={`/passager/billet/${k.id}`} className="btn btn--ghost">
                            {t("mine.open")}
                          </Link>
                          <Link to={`/passager/suivi?trip=${k.trip_id}`} className="btn">
                            🗺️ Suivi live GPS
                          </Link>
                        </div>
                      </div>
                    </article>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        </div>
      )}

      {/* VUE 2 : HISTORIQUE DE MES VOYAGES */}
      {activeTab === "history" && (
        <div>
          {historyTickets.length === 0 && (
            <div className="card" style={{ padding: "var(--space-4)", textAlign: "center" }}>
              <p className="muted" style={{ margin: 0 }}>
                Votre historique de voyage est vide.
              </p>
            </div>
          )}

          <ul className="trip-list">
            <AnimatePresence>
              {historyTickets.map((k, index) => (
                <motion.li
                  key={k.id}
                  style={agencyStyle(k.primary_color)}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ delay: index * 0.04 }}
                >
                  <article className="card trip card--hover" style={{ opacity: 0.95 }}>
                    <div className="trip__times">
                      <div>
                        <span className="muted">{formatDay(k.departs_at, k.timezone, i18n.language)}</span>
                        <strong className="mono">{formatTime(k.departs_at, k.timezone, i18n.language)}</strong>
                      </div>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <strong>
                            {k.origin} <span className="flip-rtl">→</span> {k.destination}
                          </strong>
                          <span className="badge" style={{ fontSize: 11 }}>
                            {k.status === "completed"
                              ? "🏁 Voyage terminé"
                              : k.status === "no_show"
                              ? "🔴 Non présenté (Absent)"
                              : t(`ticket.statuses.${k.status}`)}
                          </span>
                        </div>
                        <span className="muted">
                          {k.agency_name} · Siège #{k.seat_no} · <span className="mono">{k.reference}</span>
                        </span>
                      </div>
                    </div>

                    <div className="trip__buy">
                      <div className="chips">
                        <Link to={`/passager/billet/${k.id}`} className="btn btn--ghost">
                          {t("mine.open")}
                        </Link>
                        {!k.reviewed && (
                          <button
                            type="button"
                            className="btn btn--ghost"
                            onClick={() => setReviewing(k.id)}
                          >
                            ⭐ Donner mon avis
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn--ghost"
                          onClick={() => handleDeleteTicket(k.id)}
                          style={{ color: "#ef4444", fontSize: "var(--text-xs)" }}
                          title="Supprimer définitivement ce trajet de mon historique"
                        >
                          🗑️ Supprimer
                        </button>
                      </div>
                    </div>

                    {reviewing === k.id && (
                      <ReviewForm
                        ticketId={k.id}
                        onDone={() => {
                          setReviewing(null);
                          load();
                        }}
                      />
                    )}
                  </article>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </div>
      )}
    </div>
  );
}