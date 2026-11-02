import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import SeatGrid from "../components/SeatGrid";
import { api, ApiError } from "../core/api";
import { useAuth } from "../core/auth";
import { formatDay, formatMoney, formatTime } from "../core/format";
import type { DeskTrip, FillCandidate, Manifest } from "../core/types";

interface FillData {
  fill_window_minutes: number;
  free_seats: { id: number; seat_no: number; seat_class: string }[];
  candidates: FillCandidate[];
}

const STATUS_BADGES: Record<string, string> = {
  scheduled: "Programmé",
  boarding: "Embarquement en cours",
  departed: "En route",
  completed: "Arrivé",
};

// Module Guichet / Secrétaire (intégré à l'Espace Agence) :
// - Départs & arrivées, scan QR, appel passagers, retardataires, absents (no_show), bagages
// - Vente directe guichet (ajout d'un client de dernière minute sur siège libre)
// - Remplissage des places libérées par des passagers SANS bagage d'un départ proche
//   (uniquement si écart <= fill_window_minutes, ex. 40 min max, et après accord physique)
export default function Desk({ embedded = false }: { embedded?: boolean }) {
  const { t, i18n } = useTranslation();
  const { agencySession } = useAuth();

  const [trips, setTrips] = useState<DeskTrip[]>([]);
  const [tripId, setTripId] = useState<number | null>(null);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [fill, setFill] = useState<FillData | null>(null);

  const [scan, setScan] = useState("");
  const [inspectSeat, setInspectSeat] = useState<number | null>(null);
  const [weights, setWeights] = useState<Record<number, string>>({});
  const [lateNotes, setLateNotes] = useState<Record<number, string>>({});
  const [consent, setConsent] = useState<Record<number, boolean>>({});
  const [seatChoice, setSeatChoice] = useState<Record<number, number>>({});

  // Vente rapide au guichet par la secrétaire (paiement en espèces ou Mobile Money + ajout direct du passager sur un départ choisi)
  const [walkIn, setWalkIn] = useState({
    passenger_name: "",
    seat_id: 0,
    id_type: "CNI",
    id_number: "",
    phone: "",
    payment_method: "cash",
    luggage_weight_kg: "",
  });

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // Journal de Caisse quotidien du guichet
  const [cashJournal, setCashJournal] = useState<{
    currency_code: string;
    generated_at: string;
    agent_name: string;
    summary: {
      total_sales_count: number;
      total_amount: number;
      total_cash: number;
      total_momo: number;
      total_card: number;
    };
    sales: any[];
  } | null>(null);
  const [showJournal, setShowJournal] = useState(false);

  const canManage =
    agencySession && ["owner", "manager", "secretary"].includes(agencySession.role);

  const fail = useCallback(
    (e: unknown) => setError(e instanceof ApiError ? e.message : t("common.error")),
    [t],
  );

  const loadTrips = useCallback(() => {
    api<DeskTrip[]>("/desk/trips", { realm: "agency" })
      .then((rows) => {
        setTrips(rows);
        if (rows.length > 0) {
          setTripId((prev) => prev ?? rows[0].id);
        }
      })
      .catch(fail);
  }, [fail]);

  const loadManifest = useCallback(
    (id: number) => {
      api<Manifest>(`/desk/trips/${id}/manifest`, { realm: "agency" })
        .then(setManifest)
        .catch(fail);
    },
    [fail],
  );

  useEffect(() => {
    if (agencySession) loadTrips();
  }, [agencySession, loadTrips]);

  useEffect(() => {
    setFill(null);
    setMessage("");
    setError("");
    if (tripId) loadManifest(tripId);
  }, [tripId, loadManifest]);

  if (!agencySession) {
    return (
      <div className="container page">
        <p className="muted">Veuillez vous connecter à votre espace agence.</p>
      </div>
    );
  }

  const current = trips.find((x) => x.id === tripId);
  const tz = current?.timezone ?? "UTC";
  const minor = agencySession.agency.minor_units;
  const nextToCall = manifest?.tickets.find((k) => k.status === "valid" && !k.late_notice);

  const freeSeatsList =
    manifest?.seats.filter(
      (s) => !manifest.tickets.some((k) => k.seat_no === s.seat_no && k.status !== "no_show"),
    ) ?? [];

  async function act(ticketId: number, action: string, note?: string) {
    setError("");
    setMessage("");
    try {
      await api(`/desk/tickets/${ticketId}/action`, {
        body: { action, ...(note ? { note } : {}) },
        realm: "agency",
      });
      await loadManifest(tripId!);
      loadTrips();
    } catch (e) {
      fail(e);
    }
  }

  async function setTripStatus(status: "boarding" | "departed" | "completed") {
    if (!tripId) return;
    setError("");
    try {
      await api(`/agency/trips/${tripId}/status`, { body: { status }, realm: "agency" });
      setMessage(`Statut du voyage mis à jour : ${STATUS_BADGES[status]}`);
      await loadManifest(tripId);
      loadTrips();
    } catch (e) {
      fail(e);
    }
  }

  async function doScan() {
    setError("");
    setMessage("");
    try {
      const r = await api<{ passenger_name: string; seat_no: number; reference: string }>("/desk/scan", {
        body: { qr_token: scan.trim() },
        realm: "agency",
      });
      setMessage(`✓ Billet validé : ${r.passenger_name} · Siège #${r.seat_no} (${r.reference})`);
      setScan("");
      if (tripId) await loadManifest(tripId);
      loadTrips();
    } catch (e) {
      fail(e);
    }
  }

  async function addLuggage(ticketId: number) {
    setError("");
    try {
      const r = await api<{ tag_code: string; fee: number }>(`/desk/tickets/${ticketId}/luggage`, {
        body: { weight_kg: Number(weights[ticketId]), pieces: 1 },
        realm: "agency",
      });
      const feeStr =
        r.fee > 0
          ? ` (Supplément : ${formatMoney(r.fee, agencySession!.agency.currency_code, minor, i18n.language)})`
          : " (Franchise gratuite)";
      setMessage(`🧳 Bagage enregistré : étiquette ${r.tag_code}${feeStr}`);
      setWeights({ ...weights, [ticketId]: "" });
      loadManifest(tripId!);
    } catch (e) {
      fail(e);
    }
  }

  async function openFill() {
    if (!tripId) return;
    setError("");
    api<FillData>(`/desk/trips/${tripId}/fill-candidates`, { realm: "agency" })
      .then(setFill)
      .catch(fail);
  }

  async function transfer(c: FillCandidate) {
    setError("");
    setMessage("");
    try {
      await api(`/desk/tickets/${c.ticket_id}/transfer`, {
        body: {
          to_trip_id: tripId,
          seat_id: seatChoice[c.ticket_id],
          consent: Boolean(consent[c.ticket_id]),
        },
        realm: "agency",
      });
      setMessage(`✓ ${c.passenger_name} avancé avec succès sur ce départ imminent !`);
      await loadManifest(tripId!);
      openFill();
      loadTrips();
    } catch (e) {
      fail(e);
    }
  }

  async function sellWalkIn(e: FormEvent) {
    e.preventDefault();
    if (!tripId) return;
    setError("");
    setMessage("");
    try {
      const res = await api<{ reference: string; seat_no: number; payment_method: string }>(`/desk/trips/${tripId}/sell`, {
        body: {
          ...walkIn,
          luggage_weight_kg: walkIn.luggage_weight_kg ? Number(walkIn.luggage_weight_kg) : 0,
        },
        realm: "agency",
      });
      const modeLabel = res.payment_method === "cash" ? "Espèces (Cash)" : res.payment_method.toUpperCase();
      setMessage(`✓ Passager ajouté sur le siège #${res.seat_no} (${modeLabel}) — Réf. ${res.reference}`);
      setWalkIn({
        passenger_name: "",
        seat_id: 0,
        id_type: "CNI",
        id_number: "",
        phone: "",
        payment_method: "cash",
        luggage_weight_kg: "",
      });
      await loadManifest(tripId);
      loadTrips();
    } catch (err) {
      fail(err);
    }
  }

  async function loadCashJournal() {
    setError("");
    try {
      const res = await api<any>("/desk/cash-journal", { realm: "agency" });
      setCashJournal(res);
      setShowJournal(true);
    } catch (err) {
      fail(err);
    }
  }

  return (
    <div className={embedded ? "desk page-embedded" : "container page desk"}>
      <aside className="desk__trips">
        <h2 className="subheading">Départs Choisis & Embarquement</h2>
        {trips.length === 0 && <p className="muted">Aucun départ programmé pour le moment.</p>}
        {trips.map((x) => (
          <button
            key={x.id}
            type="button"
            className={x.id === tripId ? "desk-trip is-active" : "desk-trip"}
            onClick={() => setTripId(x.id)}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong className="mono">{formatTime(x.departs_at, x.timezone, i18n.language)}</strong>
              <span className="badge" style={{ fontSize: "0.7rem" }}>
                {STATUS_BADGES[x.status] ?? x.status}
              </span>
            </div>
            <span>
              {x.origin} <span className="flip-rtl">→</span> {x.destination}
            </span>
            <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
              {formatDay(x.departs_at, x.timezone, i18n.language)} · <span className="mono">{x.booked}/{x.seat_count}</span> rés. ·{" "}
              <span className="mono">{x.boarded}</span> emb.
            </span>
          </button>
        ))}
      </aside>

      <section className="desk__main">
        {!manifest || !current ? (
          <div className="card">
            <p className="muted">Sélectionnez un départ à gauche pour gérer l’embarquement et les billets.</p>
          </div>
        ) : (
          <>
            {/* Barre de pilotage Départ / Arrivée + Scan QR */}
            <div className="card form-grid">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                <div>
                  <span className="badge">{STATUS_BADGES[manifest.status] ?? manifest.status}</span>{" "}
                  <strong>
                    {current.origin} → {current.destination}
                  </strong>{" "}
                  <span className="muted mono">
                    ({current.bus_label} · {current.plate})
                  </span>
                </div>

                {canManage && (
                  <div className="chips">
                    <button
                      type="button"
                      className={manifest.status === "boarding" ? "chip is-active" : "chip"}
                      onClick={() => setTripStatus("boarding")}
                    >
                      1. Ouvrir embarquement
                    </button>
                    <button
                      type="button"
                      className={manifest.status === "departed" ? "chip is-active" : "chip"}
                      onClick={() => setTripStatus("departed")}
                    >
                      2. Confirmer départ
                    </button>
                    <button
                      type="button"
                      className={manifest.status === "completed" ? "chip is-active" : "chip"}
                      onClick={() => setTripStatus("completed")}
                    >
                      3. Confirmer arrivée
                    </button>
                  </div>
                )}
              </div>

              <div className="desk-scan">
                <input
                  className="input"
                  value={scan}
                  placeholder="Scanner ou coller un code QR billet (VLT:...)"
                  onChange={(e) => setScan(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && doScan()}
                />
                <button type="button" className="btn" onClick={doScan} disabled={!scan.trim()}>
                  Scanner QR
                </button>
              </div>
            </div>

            {message && (
              <div className="demo-note" role="status">
                <strong>{message}</strong>
              </div>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}

            {/* Carte d'appel prioritaire */}
            <motion.div
              className="card call-card"
              key={nextToCall?.id ?? "done"}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              <span className="muted">Appel au micro / Porte d’embarquement</span>
              {nextToCall ? (
                <>
                  <strong className="call-card__ref mono">{nextToCall.reference}</strong>
                  <span className="call-card__name">
                    {nextToCall.passenger_name} · Siège #{nextToCall.seat_no}
                  </span>
                  <div className="call-card__actions">
                    <button type="button" className="btn" onClick={() => act(nextToCall.id, "board")}>
                      ✓ Présent & Embarqué
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost"
                      onClick={() => act(nextToCall.id, "late", "Signalé en retard — arrive sous peu")}
                    >
                      ⏱ Client en retard
                    </button>
                    {canManage && (
                      <button type="button" className="btn btn--ghost" onClick={() => act(nextToCall.id, "absent")}>
                        ✕ Déclarer absent (libère le siège)
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <strong>Tous les passagers attendus ont été traités ({freeSeatsList.length} siège(s) libre(s)).</strong>
              )}
            </motion.div>

            {/* Indicateur Bus Plein (100% complet) */}
            {manifest.seats.length > 0 && freeSeatsList.length === 0 && !manifest.tickets.some((k) => k.status === "no_show") && (
              <div
                className="bus-full-banner"
                style={{
                  background: "linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(5, 150, 105, 0.35))",
                  border: "2px solid #10b981",
                  borderRadius: "var(--radius-md)",
                  padding: "var(--space-4)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 12,
                  boxShadow: "0 0 20px rgba(16, 185, 129, 0.3)",
                }}
              >
                <div>
                  <span className="badge" style={{ background: "#10b981", color: "#ffffff", fontWeight: 700 }}>
                    🟢 BUS PLEIN (100 % COMPLET)
                  </span>
                  <h3 style={{ margin: "6px 0 0", color: "#10b981" }}>
                    Toutes les places sont occupées ! Le bus est prêt pour le départ.
                  </h3>
                </div>
                {canManage && manifest.status !== "departed" && manifest.status !== "completed" && (
                  <button
                    type="button"
                    className="btn btn--lg"
                    style={{ background: "#10b981", color: "#ffffff", fontWeight: 700 }}
                    onClick={() => setTripStatus("departed")}
                  >
                    🚀 Valider & Marquer Départ du Bus
                  </button>
                )}
              </div>
            )}

            <div className="desk-grid">
              {/* Plan temps réel des sièges + Contrôle tactile passagers */}
              <div className="card form-grid">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                  <h3 className="subheading" style={{ margin: 0 }}>
                    Plan des places ({freeSeatsList.length} libres · {manifest.tickets.filter((k) => k.status === "boarded").length} à bord)
                  </h3>
                  <div className="chips">
                    <span className="badge" style={{ background: "#10b981", color: "#fff" }}>🟢 Vert = À bord</span>
                    <span className="badge" style={{ background: "#ef4444", color: "#fff" }}>🔴 Rouge = Absent</span>
                    <span className="badge" style={{ background: "#3b82f6", color: "#fff" }}>🔵 Bleu = Réservé</span>
                  </div>
                </div>

                {manifest.layout && (
                  <SeatGrid
                    seatsPerRow={manifest.layout.seats_per_row}
                    seats={manifest.seats.map((s) => {
                      const k = manifest.tickets.find((x) => x.seat_no === s.seat_no);
                      let cls = "";
                      if (k) {
                        if (k.status === "boarded") cls = "seat--boarded";
                        else if (k.status === "no_show") cls = "seat--noshow";
                        else cls = "seat--paid";
                      } else if (walkIn.seat_id === s.id) {
                        cls = "seat--selected";
                      }
                      if (inspectSeat === s.id) {
                        cls += " is-active";
                      }
                      return {
                        ...s,
                        disabled: false,
                        className: cls,
                        title: k
                          ? `Siège #${s.seat_no} · ${k.passenger_name} (${k.status === "boarded" ? "À bord" : k.status === "no_show" ? "Absent" : "Réservé"})`
                          : `Siège #${s.seat_no} · Libre`,
                      };
                    })}
                    onSelect={(s) => {
                      setInspectSeat(s.id);
                      const k = manifest.tickets.find((x) => x.seat_no === s.seat_no);
                      if (!k || k.status === "no_show") {
                        setWalkIn((cur) => ({ ...cur, seat_id: s.id }));
                      }
                    }}
                  />
                )}

                {/* Panneau de contrôle interactif du siège sélectionné */}
                {inspectSeat && (() => {
                  const sObj = manifest.seats.find((s) => s.id === inspectSeat);
                  const tObj = sObj ? manifest.tickets.find((k) => k.seat_no === sObj.seat_no) : null;
                  return (
                    <div
                      className="card form-grid"
                      style={{
                        background: "rgba(255, 255, 255, 0.05)",
                        border: "2px solid var(--accent)",
                        padding: "var(--space-3) var(--space-4)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                        <strong>
                          Siège #{sObj?.seat_no} ({sObj?.seat_class}) — {tObj ? tObj.passenger_name : "Siège Libre"}
                        </strong>
                        <button type="button" className="btn btn--sm btn--ghost" onClick={() => setInspectSeat(null)}>
                          ✕ Fermer
                        </button>
                      </div>

                      {tObj ? (
                        <>
                          <div className="muted" style={{ fontSize: "var(--text-xs)" }}>
                            Réf : <strong className="mono">{tObj.reference}</strong> · Statut actuel :{" "}
                            <span className="badge">
                              {tObj.status === "boarded" ? "🟢 À bord" : tObj.status === "no_show" ? "🔴 Absent (No-show)" : "🔵 Payé / Réservé"}
                            </span>
                            {tObj.phone && ` · Tél : ${tObj.phone}`}
                            {tObj.late_notice && ` · ⏱ ${tObj.late_notice}`}
                          </div>

                          <div className="chips" style={{ marginTop: 4 }}>
                            {tObj.status === "valid" && (
                              <>
                                <button
                                  type="button"
                                  className="btn btn--sm"
                                  style={{ background: "#10b981", color: "#ffffff", fontWeight: 700 }}
                                  onClick={() => act(tObj.id, "board")}
                                >
                                  🟢 Faire monter à bord (Siège devient Vert)
                                </button>
                                <button
                                  type="button"
                                  className="btn btn--sm"
                                  style={{ background: "#ef4444", color: "#ffffff", fontWeight: 700 }}
                                  onClick={() => act(tObj.id, "absent")}
                                >
                                  🔴 Déclarer Absent (Siège devient Rouge)
                                </button>
                                <button
                                  type="button"
                                  className="btn btn--sm btn--ghost"
                                  onClick={() => act(tObj.id, "late", "Arrive sous peu")}
                                >
                                  ⏱ En retard
                                </button>
                              </>
                            )}

                            {tObj.status === "boarded" && (
                              <button type="button" className="btn btn--sm btn--ghost" onClick={() => act(tObj.id, "undo")}>
                                ↩ Annuler statut à bord
                              </button>
                            )}

                            {tObj.status === "no_show" && (
                              <>
                                <button type="button" className="btn btn--sm" onClick={openFill}>
                                  🔄 Remplacer par un client sans bagage d’un autre bus
                                </button>
                                <button
                                  type="button"
                                  className="btn btn--sm btn--ghost"
                                  onClick={() => setWalkIn((cur) => ({ ...cur, seat_id: sObj!.id }))}
                                >
                                  💵 Vente directe guichet sur ce siège
                                </button>
                                <button type="button" className="btn btn--sm btn--ghost" onClick={() => act(tObj.id, "undo")}>
                                  ↩ Réintégrer passager initial
                                </button>
                              </>
                            )}
                          </div>
                        </>
                      ) : (
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                          <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
                            Ce siège est actuellement libre.
                          </span>
                          <button
                            type="button"
                            className="btn btn--sm"
                            onClick={() => setWalkIn((cur) => ({ ...cur, seat_id: sObj!.id }))}
                          >
                            💵 Choisir pour vente guichet
                          </button>
                          <button type="button" className="btn btn--sm btn--ghost" onClick={openFill}>
                            🔄 Remplacer par un passager sans bagage
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {canManage && (
                  <button type="button" className="btn" onClick={openFill}>
                    🔄 Avancer des passagers sans bagage (écart ≤ {manifest.fill_window_minutes} min)
                  </button>
                )}
              </div>

              {/* Liste complète des passagers (présents, retardataires, absents, bagages) */}
              <div className="card">
                <h3 className="subheading">Manifeste passagers & Gestion retards / absents</h3>
                <ul className="call-list">
                  {manifest.tickets.map((k) => (
                    <li key={k.id} className={`call-row call-row--${k.status}`}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <strong className="mono">
                          {k.reference} · Siège #{k.seat_no}
                        </strong>
                        <span className="badge">{k.status}</span>
                      </div>
                      <span>
                        <strong>{k.passenger_name}</strong>{" "}
                        <span className="muted mono">
                          ({k.id_type ?? "ID"} {k.id_number ?? "—"} {k.phone ? `· ${k.phone}` : ""})
                        </span>
                      </span>
                      <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
                        Bagages enregistrés : <strong className="mono">{k.luggage_pieces}</strong>
                        {k.checked_in_at ? " · ✓ Enregistré guichet" : ""}
                        {k.late_notice ? ` · ⏱ En retard : ${k.late_notice}` : ""}
                      </span>

                      <div className="call-row__actions">
                        {k.status === "valid" && (
                          <>
                            <button type="button" className="chip" onClick={() => act(k.id, "checkin")}>
                              Pointé
                            </button>
                            <button type="button" className="chip is-active" onClick={() => act(k.id, "board")}>
                              Embarquer
                            </button>
                            {canManage && (
                              <button type="button" className="chip" onClick={() => act(k.id, "absent")}>
                                Absent
                              </button>
                            )}
                            <input
                              className="input input--sm"
                              placeholder="Note retard"
                              value={lateNotes[k.id] ?? ""}
                              onChange={(e) => setLateNotes({ ...lateNotes, [k.id]: e.target.value })}
                            />
                            <button
                              type="button"
                              className="chip"
                              onClick={() => act(k.id, "late", lateNotes[k.id] || "En route (signalé au guichet)")}
                            >
                              ⏱ Retard
                            </button>
                            <input
                              className="input input--sm"
                              inputMode="decimal"
                              placeholder="Bagage kg"
                              value={weights[k.id] ?? ""}
                              onChange={(e) => setWeights({ ...weights, [k.id]: e.target.value })}
                            />
                            <button type="button" className="chip" disabled={!weights[k.id]} onClick={() => addLuggage(k.id)}>
                              + Bagage
                            </button>
                          </>
                        )}
                        {(k.status === "boarded" || k.status === "no_show") && canManage && (
                          <button type="button" className="chip" onClick={() => act(k.id, "undo")}>
                            Annuler statut
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Remplissage réglementé : passagers SANS bagage d'un départ proche (<= fill_window_minutes, ex. 40 min) */}
            {fill && canManage && (
              <div className="card form-grid">
                <div>
                  <span className="badge">Règle stricte de proximité & accord physique</span>
                  <h3 className="subheading" style={{ marginTop: 6 }}>
                    Remplacement des absents par des passagers sans bagage (départ dans ≤ {fill.fill_window_minutes} min)
                  </h3>
                  <p className="muted" style={{ margin: 0, fontSize: "var(--text-sm)" }}>
                    Seuls les voyageurs <strong>sans aucun bagage enregistré</strong> sur la même ligne dont le bus part
                    dans <strong>{fill.fill_window_minutes} minutes maximum</strong> apparaissent ici. Demandez-leur
                    physiquement leur accord en salle d’embarquement avant validation.
                  </p>
                </div>

                {fill.candidates.length === 0 ? (
                  <p className="muted">
                    Aucun passager sans bagage trouvé dans la fenêtre de {fill.fill_window_minutes} minutes après ce départ.
                  </p>
                ) : (
                  <ul className="call-list">
                    {fill.candidates.map((c) => (
                      <li key={c.ticket_id} className="call-row">
                        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                          <div>
                            <strong className="mono">{c.reference}</strong> · <strong>{c.passenger_name}</strong>
                          </div>
                          <span className="badge badge--sim">
                            Départ initial à {formatTime(c.from_departs_at, tz, i18n.language)} (écart +{c.gap_minutes} min ≤{" "}
                            {fill.fill_window_minutes} min) · 0 bagage
                          </span>
                        </div>

                        <div className="search-grid" style={{ alignItems: "center", marginTop: 6 }}>
                          <select
                            className="select"
                            value={seatChoice[c.ticket_id] ?? ""}
                            onChange={(e) => setSeatChoice({ ...seatChoice, [c.ticket_id]: Number(e.target.value) })}
                          >
                            <option value="">Attribuer un siège libre…</option>
                            {fill.free_seats.map((s) => (
                              <option key={s.id} value={s.id}>
                                Siège #{s.seat_no} ({s.seat_class})
                              </option>
                            ))}
                          </select>

                          <label className="checkbox-row">
                            <input
                              type="checkbox"
                              checked={Boolean(consent[c.ticket_id])}
                              onChange={(e) => setConsent({ ...consent, [c.ticket_id]: e.target.checked })}
                            />
                            <span>Accord demandé physiquement au passager</span>
                          </label>

                          <button
                            type="button"
                            className="btn"
                            disabled={!seatChoice[c.ticket_id] || !consent[c.ticket_id]}
                            onClick={() => transfer(c)}
                          >
                            Avancer sur ce départ
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Ajout direct d'un passager par la secrétaire sur le départ choisi + encaissement Espèces ou Mobile Money */}
            {canManage && freeSeatsList.length > 0 && (
              <form className="card form-grid" onSubmit={sellWalkIn} style={{ border: "1px solid var(--accent)" }}>
                <div>
                  <span className="badge">💵 Guichet Secrétaire — Paiement en Espèces ou Mobile Money</span>
                  <h3 className="subheading" style={{ marginTop: 6, marginBottom: 4 }}>
                    Ajouter un passager sur ce départ choisi ({current.origin} → {current.destination})
                  </h3>
                  <p className="muted" style={{ margin: 0, fontSize: "var(--text-xs)" }}>
                    La secrétaire reçoit le paiement en <strong>espèces (cash)</strong> (ou Mobile Money), note cela dans l’application et inscrit immédiatement le passager grâce à ses coordonnées sur un siège libre.
                  </p>
                </div>

                <div className="search-grid">
                  <label className="field">
                    <span className="field__label">Mode de paiement reçu par la secrétaire</span>
                    <select
                      className="select"
                      value={walkIn.payment_method}
                      onChange={(e) => setWalkIn({ ...walkIn, payment_method: e.target.value })}
                    >
                      <option value="cash">💵 Paiement en Espèces (Cash reçu au guichet)</option>
                      <option value="orange_money">🍊 Orange Money</option>
                      <option value="mtn_momo">💛 MTN Mobile Money</option>
                      <option value="wave">🌊 Wave</option>
                      <option value="card">💳 Carte Bancaire / TPE</option>
                    </select>
                  </label>

                  <label className="field">
                    <span className="field__label">Siège libre sur ce départ (ou cliquez sur le plan)</span>
                    <select
                      className="select"
                      required
                      value={walkIn.seat_id}
                      onChange={(e) => setWalkIn({ ...walkIn, seat_id: Number(e.target.value) })}
                    >
                      <option value={0}>Choisir un siège libre…</option>
                      {freeSeatsList.map((s) => (
                        <option key={s.id} value={s.id}>
                          Siège #{s.seat_no} ({s.seat_class})
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="search-grid">
                  <label className="field">
                    <span className="field__label">Nom complet du passager</span>
                    <input
                      className="input"
                      required
                      placeholder="Nom & prénom"
                      value={walkIn.passenger_name}
                      onChange={(e) => setWalkIn({ ...walkIn, passenger_name: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span className="field__label">Téléphone du passager</span>
                    <input
                      className="input"
                      placeholder="+237 6..."
                      value={walkIn.phone}
                      onChange={(e) => setWalkIn({ ...walkIn, phone: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span className="field__label">Pièce d’identité (CNI / Passeport)</span>
                    <input
                      className="input"
                      placeholder="N° CNI / Passeport"
                      value={walkIn.id_number}
                      onChange={(e) => setWalkIn({ ...walkIn, id_number: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span className="field__label">Bagages (kg, optionnel)</span>
                    <input
                      className="input"
                      type="number"
                      min={0}
                      step="0.5"
                      placeholder="0 kg"
                      value={walkIn.luggage_weight_kg}
                      onChange={(e) => setWalkIn({ ...walkIn, luggage_weight_kg: e.target.value })}
                    />
                  </label>
                </div>
                <div>
                  <button type="submit" className="btn" disabled={!walkIn.passenger_name.trim() || !walkIn.seat_id}>
                    ✓ Encaisser ({walkIn.payment_method === "cash" ? "Espèces" : walkIn.payment_method.toUpperCase()}) & Ajouter le passager ({formatMoney(manifest.price, manifest.currency_code, minor, i18n.language)})
                  </button>
                </div>
              </form>
            )}

            {/* JOURNAL DE CAISSE QUOTIDIEN DU GUICHET */}
            <div className="card form-grid" style={{ marginTop: "var(--space-4)", border: "1px solid var(--accent)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                <div>
                  <span className="badge" style={{ background: "rgba(140, 107, 184, 0.15)", color: "var(--accent)" }}>
                    💼 Journal de Caisse & Recettes Guichet
                  </span>
                  <h3 className="subheading" style={{ margin: "4px 0 2px" }}>
                    Bilan Quotidien des Encaissements
                  </h3>
                  <p className="muted" style={{ margin: 0, fontSize: "var(--text-xs)" }}>
                    Suivez le cumul des ventes au guichet en direct : Espèces, Orange Money, MTN MoMo et Carte Bancaire.
                  </p>
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn--outline"
                    onClick={loadCashJournal}
                    style={{ fontSize: "var(--text-xs)", fontWeight: 700 }}
                  >
                    {showJournal ? "🔄 Actualiser la caisse" : "📊 Consulter mon journal de caisse"}
                  </button>
                  {showJournal && (
                    <button
                      type="button"
                      className="btn btn--ghost"
                      onClick={() => window.print()}
                      style={{ fontSize: "var(--text-xs)" }}
                    >
                      🖨️ Imprimer
                    </button>
                  )}
                </div>
              </div>

              {showJournal && cashJournal && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
                  {/* KPI Cards */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                      gap: 10,
                    }}
                  >
                    <div className="card" style={{ padding: "10px", background: "rgba(16, 185, 129, 0.1)", borderColor: "#10b981" }}>
                      <span className="muted" style={{ fontSize: 11, display: "block" }}>💵 Espèces (Cash)</span>
                      <strong style={{ fontSize: "var(--text-base)", color: "#059669" }}>
                        {formatMoney(cashJournal.summary.total_cash, cashJournal.currency_code, minor, i18n.language)}
                      </strong>
                    </div>

                    <div className="card" style={{ padding: "10px", background: "rgba(245, 158, 11, 0.1)", borderColor: "#f59e0b" }}>
                      <span className="muted" style={{ fontSize: 11, display: "block" }}>📱 Mobile Money</span>
                      <strong style={{ fontSize: "var(--text-base)", color: "#d97706" }}>
                        {formatMoney(cashJournal.summary.total_momo, cashJournal.currency_code, minor, i18n.language)}
                      </strong>
                    </div>

                    <div className="card" style={{ padding: "10px", background: "rgba(59, 130, 246, 0.1)", borderColor: "#3b82f6" }}>
                      <span className="muted" style={{ fontSize: 11, display: "block" }}>💳 Carte / TPE</span>
                      <strong style={{ fontSize: "var(--text-base)", color: "#2563eb" }}>
                        {formatMoney(cashJournal.summary.total_card, cashJournal.currency_code, minor, i18n.language)}
                      </strong>
                    </div>

                    <div className="card" style={{ padding: "10px", background: "rgba(140, 107, 184, 0.15)", borderColor: "var(--accent)" }}>
                      <span className="muted" style={{ fontSize: 11, display: "block" }}>🏷️ Total Ventes ({cashJournal.summary.total_sales_count})</span>
                      <strong style={{ fontSize: "var(--text-base)", color: "var(--accent)" }}>
                        {formatMoney(cashJournal.summary.total_amount, cashJournal.currency_code, minor, i18n.language)}
                      </strong>
                    </div>
                  </div>

                  {/* Tableau des ventes du guichet */}
                  <div style={{ overflowX: "auto" }}>
                    <table className="table" style={{ width: "100%", fontSize: "var(--text-xs)" }}>
                      <thead>
                        <tr>
                          <th>Réf</th>
                          <th>Passager</th>
                          <th>Siège</th>
                          <th>Trajet</th>
                          <th>Mode Paiement</th>
                          <th>Montant</th>
                          <th>Heure</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cashJournal.sales.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="muted" style={{ textAlign: "center", padding: 16 }}>
                              Aucune vente guichet enregistrée sur les dernières 24h.
                            </td>
                          </tr>
                        ) : (
                          cashJournal.sales.map((sl: any) => (
                            <tr key={sl.id}>
                              <td className="mono">{sl.reference}</td>
                              <td><strong>{sl.passenger_name || "Client guichet"}</strong></td>
                              <td>#{sl.seat_no ?? "—"}</td>
                              <td>{sl.origin && sl.destination ? `${sl.origin} → ${sl.destination}` : "—"}</td>
                              <td>
                                <span className="badge" style={{ fontSize: 10 }}>
                                  {sl.provider === "cash" ? "💵 Espèces" : sl.provider === "card" ? "💳 Carte" : `📱 ${sl.provider}`}
                                </span>
                              </td>
                              <td><strong>{formatMoney(sl.amount, sl.currency_code, minor, i18n.language)}</strong></td>
                              <td className="muted">{new Date(sl.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
