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

  const seatClass: Record<string, string> = {
    valid: "seat--paid",
    boarded: "seat--boarded",
    no_show: "seat--noshow",
  };

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

            <div className="desk-grid">
              {/* Plan temps réel des sièges + Actions de remplissage */}
              <div className="card form-grid">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h3 className="subheading" style={{ margin: 0 }}>Plan des places ({freeSeatsList.length} libres)</h3>
                </div>

                {manifest.layout && (
                  <SeatGrid
                    seatsPerRow={manifest.layout.seats_per_row}
                    seats={manifest.seats.map((s) => {
                      const k = manifest.tickets.find((x) => x.seat_no === s.seat_no && x.status !== "no_show");
                      return {
                        ...s,
                        disabled: Boolean(k),
                        className: k
                          ? seatClass[k.status]
                          : walkIn.seat_id === s.id
                            ? "seat--selected"
                            : "",
                        title: k ? `${k.reference} · ${k.passenger_name}` : "Cliquez pour choisir ce siège libre au guichet",
                      };
                    })}
                    onSelect={(s) => setWalkIn((cur) => ({ ...cur, seat_id: s.id }))}
                  />
                )}

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
          </>
        )}
      </section>
    </div>
  );
}
