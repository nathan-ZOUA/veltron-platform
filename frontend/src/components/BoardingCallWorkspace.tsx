import { useEffect, useState, useMemo } from "react";
import { api } from "../core/api";

interface BoardingTripSummary {
  id: number;
  status: string;
  departs_at: string;
  arrives_at: string | null;
  delay_minutes: number;
  price: number;
  vip_price: number | null;
  origin: string;
  destination: string;
  timezone: string;
  bus_id: number;
  bus_label: string;
  plate: string;
  seat_count: number;
  has_gps: boolean;
  booked_seats: number;
  boarded_seats: number;
  absent_seats: number;
  is_full: boolean;
  driver_name: string | null;
  driver_phone: string | null;
}

interface ManifestSeat {
  id: number;
  seat_no: number;
  row_no: number;
  col_no: number;
  seat_class: string;
  state: "boarded" | "absent" | "valid" | "unbooked";
  ticket: {
    ticket_id: number;
    passenger_name: string;
    phone: string | null;
    status: string;
    luggage_pieces: number;
    boarded_at: string | null;
  } | null;
}

interface ManifestData {
  trip: {
    id: number;
    status: string;
    origin: string;
    destination: string;
    departs_at: string;
    bus_label: string;
    plate: string;
    seat_count: number;
    currency_code: string;
    price: number;
    vip_price: number | null;
    layout: {
      cols_left: number;
      cols_right: number;
      rows: number;
      vip_rows: number;
    } | null;
  };
  seats: ManifestSeat[];
  summary: {
    total_seats: number;
    boarded_count: number;
    absent_count: number;
    valid_count: number;
    unbooked_count: number;
    is_full: boolean;
  };
}

interface CandidatePassenger {
  ticket_id: number;
  passenger_name: string;
  phone: string | null;
  price: number;
  trip_id: number;
  departs_at: string;
  bus_label: string;
  plate: string;
  seat_id: number;
  seat_no: number;
}

export default function BoardingCallWorkspace() {
  const [trips, setTrips] = useState<BoardingTripSummary[]>([]);
  const [selectedTripId, setSelectedTripId] = useState<number | null>(null);
  const [manifest, setManifest] = useState<ManifestData | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string>("");
  const [error, setError] = useState<string>("");

  // Mode d'action avant de cliquer sur les sièges : 'boarded' (À bord) ou 'absent' (Absent)
  const [callMode, setCallMode] = useState<"boarded" | "absent">("boarded");

  // Siège absent sélectionné pour remplacement immédiat
  const [absentSeatModal, setAbsentSeatModal] = useState<ManifestSeat | null>(null);
  const [replacementTab, setReplacementTab] = useState<"transfer" | "cash">("transfer");

  // Liste des passagers sans bagages d'autres bus
  const [candidates, setCandidates] = useState<CandidatePassenger[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<number | 0>(0);

  // Formulaire passager sur place (espèce)
  const [cashForm, setCashForm] = useState({ passenger_name: "", phone: "" });
  const [submitting, setSubmitting] = useState(false);

  // Charger la liste des voyages du jour
  async function loadTrips() {
    try {
      setLoading(true);
      const data = await api<BoardingTripSummary[]>("/boarding/trips", { realm: "agency" });
      setTrips(data);
      if (data.length > 0 && !selectedTripId) {
        setSelectedTripId(data[0].id);
      }
    } catch (err: any) {
      setError(err?.message || "Impossible de charger les départs.");
    } finally {
      setLoading(false);
    }
  }

  // Charger le manifeste et les sièges du départ sélectionné
  async function loadManifest(tripId: number) {
    try {
      setLoading(true);
      const data = await api<ManifestData>(`/boarding/trips/${tripId}/manifest`, { realm: "agency" });
      setManifest(data);
    } catch (err: any) {
      setError(err?.message || "Erreur lors du chargement des sièges.");
    } finally {
      setLoading(false);
    }
  }

  // Charger les passagers sans bagages d'autres bus
  async function loadCandidates(tripId: number) {
    try {
      const data = await api<CandidatePassenger[]>(`/boarding/trips/${tripId}/candidates-no-luggage`, { realm: "agency" });
      setCandidates(data);
      if (data.length > 0) {
        setSelectedCandidateId(data[0].ticket_id);
      } else {
        setSelectedCandidateId(0);
      }
    } catch {
      setCandidates([]);
    }
  }

  useEffect(() => {
    loadTrips();
  }, []);

  useEffect(() => {
    if (selectedTripId) {
      loadManifest(selectedTripId);
      loadCandidates(selectedTripId);
    }
  }, [selectedTripId]);

  // Clic sur un siège sur le plan de bus
  async function handleSeatClick(seat: ManifestSeat) {
    if (!selectedTripId) return;
    setNotice("");
    setError("");

    // Si le siège est déjà absent (rouge) et qu'on clique dessus, on ouvre directement le volet de remplacement
    if (seat.state === "absent") {
      setAbsentSeatModal(seat);
      loadCandidates(selectedTripId);
      return;
    }

    try {
      const res = await api<{ ok: boolean; action: string; seat_id: number; passenger_name?: string }>(
        `/boarding/trips/${selectedTripId}/seat-click`,
        {
          body: {
            seat_id: seat.id,
            target_status: callMode,
          },
          realm: "agency",
        }
      );

      if (callMode === "boarded") {
        setNotice(`✓ Siège #${seat.seat_no} (${res.passenger_name || "Passager"}) marqué À BORD.`);
      } else if (callMode === "absent") {
        setNotice(`⚠️ Siège #${seat.seat_no} (${res.passenger_name || "Passager"}) marqué ABSENT. La place est libérée pour un remplacement.`);
        // Ouvrir automatiquement le modal de remplacement pour affecter quelqu'un
        setAbsentSeatModal(seat);
        loadCandidates(selectedTripId);
      }

      await loadManifest(selectedTripId);
      await loadTrips();
    } catch (err: any) {
      setError(err?.message || "Action impossible sur ce siège.");
    }
  }

  // Marquer tous les passagers actuellement valides à bord d'un clic
  async function handleBoardAll() {
    if (!selectedTripId) return;
    setNotice("");
    setError("");
    try {
      const res = await api<{ ok: boolean; count_boarded: number }>(`/boarding/trips/${selectedTripId}/board-all`, {
        body: {},
        realm: "agency",
      });
      setNotice(`✓ ${res.count_boarded} passagers marqués À BORD avec succès ! Vous pouvez maintenant basculer en mode « Absent » pour signaler les éventuels absents.`);
      await loadManifest(selectedTripId);
      await loadTrips();
    } catch (err: any) {
      setError(err?.message || "Erreur lors de la validation groupée.");
    }
  }

  // Confirmer le remplacement d'un passager absent
  async function handleAssignAbsentSeat() {
    if (!selectedTripId || !absentSeatModal) return;
    setSubmitting(true);
    setNotice("");
    setError("");

    try {
      if (replacementTab === "transfer") {
        if (!selectedCandidateId) {
          setError("Veuillez sélectionner un passager sans bagage disponible.");
          setSubmitting(false);
          return;
        }

        const res = await api<{ ok: boolean; message: string }>(`/boarding/trips/${selectedTripId}/assign-absent-seat`, {
          body: {
            seat_id: absentSeatModal.id,
            type: "candidate_transfer",
            candidate_ticket_id: selectedCandidateId,
          },
          realm: "agency",
        });

        setNotice(res.message);
      } else {
        if (!cashForm.passenger_name.trim()) {
          setError("Veuillez renseigner le nom complet du passager.");
          setSubmitting(false);
          return;
        }

        const res = await api<{ ok: boolean; message: string }>(`/boarding/trips/${selectedTripId}/assign-absent-seat`, {
          body: {
            seat_id: absentSeatModal.id,
            type: "cash_passenger",
            passenger_name: cashForm.passenger_name.trim(),
            phone: cashForm.phone.trim(),
          },
          realm: "agency",
        });

        setNotice(res.message);
        setCashForm({ passenger_name: "", phone: "" });
      }

      setAbsentSeatModal(null);
      await loadManifest(selectedTripId);
      await loadCandidates(selectedTripId);
      await loadTrips();
    } catch (err: any) {
      setError(err?.message || "Erreur lors de la réassignation du siège.");
    } finally {
      setSubmitting(false);
    }
  }

  // Valider l'embarquement et marquer le départ du bus
  async function handleDepartBus() {
    if (!selectedTripId) return;
    if (!confirm("Confirmer le départ immédiat de ce bus ? Le chauffeur et le suivi GPS seront activés.")) return;
    try {
      await api(`/boarding/trips/${selectedTripId}/depart`, {
        body: {},
        realm: "agency",
      });
      setNotice("🚀 Départ du bus enregistré avec succès ! Le suivi en temps réel est actif.");
      await loadManifest(selectedTripId);
      await loadTrips();
    } catch (err: any) {
      setError(err?.message || "Impossible de marquer le départ.");
    }
  }

  const selectedTrip = useMemo(() => trips.find((t) => t.id === selectedTripId), [trips, selectedTripId]);
  const isBusCompletelyFull = manifest?.summary?.is_full ?? false;

  return (
    <div className="boarding-workspace" style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      {/* En-tête du module */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <span className="badge" style={{ background: "rgba(16, 185, 129, 0.15)", color: "#10b981", border: "1px solid rgba(16, 185, 129, 0.3)" }}>
            📋 Module Appel & Contrôle d'Embarquement
          </span>
          <h2 className="heading display-md" style={{ margin: "6px 0 2px" }}>
            Appel des Passagers & Remplissage du Bus
          </h2>
          <p className="muted" style={{ margin: 0, fontSize: "var(--text-sm)" }}>
            Effectuez l'appel des passagers avant le départ : choisissez le mode <strong>« À bord »</strong> ou <strong>« Absent »</strong> avant de cliquer sur les sièges. Remplacez les absents en libérant instantanément leur ancienne place.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {loading && <span className="muted" style={{ fontSize: "var(--text-xs)" }}>⏳ Chargement...</span>}
          <button type="button" className="btn btn--ghost" onClick={() => selectedTripId && loadManifest(selectedTripId)}>
            🔄 Actualiser
          </button>
        </div>
      </div>

      {notice && (
        <div className="card" style={{ background: "rgba(16, 185, 129, 0.12)", borderColor: "#10b981", color: "#059669", padding: "var(--space-3)" }}>
          <strong>{notice}</strong>
        </div>
      )}
      {error && (
        <div className="card" style={{ background: "rgba(239, 68, 68, 0.12)", borderColor: "#ef4444", color: "#dc2626", padding: "var(--space-3)" }}>
          <strong>{error}</strong>
        </div>
      )}

      {/* Sélecteur de départ (Bandes carrousels des voyages) */}
      <div className="desk__trips" style={{ display: "flex", gap: "var(--space-3)", overflowX: "auto", paddingBottom: "var(--space-2)" }}>
        {trips.map((tr) => {
          const isSelected = tr.id === selectedTripId;
          const isFull = tr.boarded_seats >= tr.seat_count;
          return (
            <button
              key={tr.id}
              type="button"
              onClick={() => setSelectedTripId(tr.id)}
              className="card card--interactive"
              style={{
                minWidth: 260,
                textAlign: "start",
                padding: "var(--space-3)",
                border: isSelected ? "2px solid var(--accent)" : isFull ? "1.5px solid #10b981" : "1px solid var(--border)",
                background: isSelected ? "var(--surface-hover)" : isFull ? "rgba(16, 185, 129, 0.05)" : "var(--surface)",
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong style={{ fontSize: "var(--text-base)" }}>
                  {tr.origin} → {tr.destination}
                </strong>
                {isFull ? (
                  <span className="badge" style={{ background: "#10b981", color: "#fff", fontSize: 10 }}>COMPLET</span>
                ) : (
                  <span className="badge" style={{ fontSize: 10 }}>{tr.status}</span>
                )}
              </div>
              <div className="muted" style={{ fontSize: "var(--text-xs)", margin: "4px 0" }}>
                Départ : {new Date(tr.departs_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · Bus {tr.plate}
              </div>
              <div style={{ display: "flex", gap: 10, fontSize: "var(--text-xs)", fontWeight: 600 }}>
                <span style={{ color: "#10b981" }}>🟢 {tr.boarded_seats} à bord</span>
                <span style={{ color: tr.absent_seats > 0 ? "#ef4444" : "var(--muted)" }}>🔴 {tr.absent_seats} absents</span>
                <span className="muted">/ {tr.seat_count} pl.</span>
              </div>
            </button>
          );
        })}
      </div>

      {manifest && selectedTrip && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          {/* Bannière d'état du bus */}
          {isBusCompletelyFull ? (
            <div
              className="card"
              style={{
                background: "linear-gradient(135deg, rgba(16, 185, 129, 0.22), rgba(5, 150, 105, 0.35))",
                borderColor: "#10b981",
                padding: "var(--space-4)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 16,
              }}
            >
              <div>
                <span className="badge" style={{ background: "#10b981", color: "#fff", fontWeight: "bold" }}>
                  🟢 LE BUS EST PLEIN (70/70)
                </span>
                <h3 style={{ margin: "6px 0 2px", color: "#065f46" }}>
                  Tous les passagers sont à bord ! Le bus est prêt à partir.
                </h3>
                <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "#047857" }}>
                  L'appel est terminé. Vous pouvez valider le départ pour lancer le GPS et la transmission en temps réel.
                </p>
              </div>

              {selectedTrip.status !== "departed" && (
                <button
                  type="button"
                  className="btn"
                  onClick={handleDepartBus}
                  style={{ background: "#059669", color: "#fff", border: 0, padding: "12px 24px", fontSize: "var(--text-base)", fontWeight: 700 }}
                >
                  🚀 Valider l'embarquement & Lancer le départ du bus
                </button>
              )}
            </div>
          ) : (
            <div
              className="card"
              style={{
                padding: "var(--space-3)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 12,
                background: "var(--surface)",
              }}
            >
              <div>
                <strong>Appel en cours : {selectedTrip.origin} → {selectedTrip.destination}</strong> ({manifest.summary.boarded_count} / {manifest.summary.total_seats} à bord)
                <div className="muted" style={{ fontSize: "var(--text-xs)" }}>
                  Bus : {manifest.trip.bus_label} ({manifest.trip.plate}) · Tarif : {manifest.trip.price} {manifest.trip.currency_code}
                </div>
              </div>

              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <span style={{ fontSize: "var(--text-sm)" }}>
                  🟢 <strong style={{ color: "#10b981" }}>{manifest.summary.boarded_count}</strong> à bord ·{" "}
                  🔴 <strong style={{ color: "#ef4444" }}>{manifest.summary.absent_count}</strong> absents ·{" "}
                  ⚪ <strong>{manifest.summary.valid_count}</strong> en attente
                </span>
                {selectedTrip.status !== "departed" && (
                  <button type="button" className="btn btn--outline" onClick={handleDepartBus} style={{ fontSize: "var(--text-xs)" }}>
                    Marquer départ
                  </button>
                )}
              </div>
            </div>
          )}

          {/* BARRE DE CHOIX DU MODE D'APPEL AVANT DE CLIQUER */}
          <div
            className="card"
            style={{
              padding: "var(--space-3)",
              background: "var(--surface-hover)",
              border: "1px solid var(--border)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 16,
            }}
          >
            <div>
              <span style={{ fontWeight: 700, fontSize: "var(--text-sm)", display: "block" }}>
                1. Choisissez le mode d'action, puis cliquez sur les sièges :
              </span>
              <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
                {callMode === "boarded"
                  ? "👉 Mode « À BORD » ACTIF : Chaque siège cliqué devient VERT (Passager présent dans le bus)."
                  : "👉 Mode « ABSENT » ACTIF : Chaque siège cliqué devient ROUGE (Passager manquant). Un volet de réassignation s'ouvre pour le remplacer."}
              </span>
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button
                type="button"
                onClick={() => setCallMode("boarded")}
                className="btn"
                style={{
                  background: callMode === "boarded" ? "#10b981" : "var(--surface)",
                  color: callMode === "boarded" ? "#fff" : "var(--text)",
                  border: callMode === "boarded" ? "2px solid #059669" : "1px solid var(--border)",
                  fontWeight: 700,
                  boxShadow: callMode === "boarded" ? "0 0 12px rgba(16, 185, 129, 0.4)" : "none",
                }}
              >
                🟢 Mode « À bord »
              </button>

              <button
                type="button"
                onClick={() => setCallMode("absent")}
                className="btn"
                style={{
                  background: callMode === "absent" ? "#ef4444" : "var(--surface)",
                  color: callMode === "absent" ? "#fff" : "var(--text)",
                  border: callMode === "absent" ? "2px solid #b91c1c" : "1px solid var(--border)",
                  fontWeight: 700,
                  boxShadow: callMode === "absent" ? "0 0 12px rgba(239, 68, 68, 0.4)" : "none",
                }}
              >
                🔴 Mode « Absent »
              </button>

              <button
                type="button"
                onClick={handleBoardAll}
                className="btn btn--ghost"
                title="Marquer tous les passagers actuellement enregistrés comme montés à bord"
                style={{ fontSize: "var(--text-xs)", border: "1px dashed var(--border)" }}
              >
                ⚡ Tout marquer à bord
              </button>
            </div>
          </div>

          {/* PLAN VISUEL DES SIÈGES DU BUS */}
          <div className="card" style={{ padding: "var(--space-4)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-3)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 22 }}>🚌</span>
                <strong>Disposition des sièges du bus ({manifest.trip.plate})</strong>
              </div>
              <div style={{ display: "flex", gap: 16, fontSize: "var(--text-xs)" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 12, height: 12, borderRadius: 3, background: "#10b981", display: "inline-block" }} />
                  À bord (Vert)
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 12, height: 12, borderRadius: 3, background: "#ef4444", display: "inline-block" }} />
                  Absent (Rouge - Clic pour remplacer)
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 12, height: 12, borderRadius: 3, background: "var(--surface-hover)", border: "1px solid var(--border)", display: "inline-block" }} />
                  En attente
                </span>
              </div>
            </div>

            {/* Grille des sièges */}
            <div
              className="boarding-seat-grid"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
                gap: 10,
              }}
            >
              {manifest.seats.map((st) => {
                const isBoarded = st.state === "boarded";
                const isAbsent = st.state === "absent";
                const isUnbooked = st.state === "unbooked";

                let bg = "var(--surface)";
                let borderColor = "var(--border)";
                let textColor = "var(--text)";
                let statusIcon = "⚪";

                if (isBoarded) {
                  bg = "rgba(16, 185, 129, 0.15)";
                  borderColor = "#10b981";
                  textColor = "#059669";
                  statusIcon = "🟢 ✓";
                } else if (isAbsent) {
                  bg = "rgba(239, 68, 68, 0.18)";
                  borderColor = "#ef4444";
                  textColor = "#dc2626";
                  statusIcon = "🔴 ✕";
                } else if (isUnbooked) {
                  bg = "transparent";
                  borderColor = "var(--border-dashed, #94a3b8)";
                  textColor = "var(--muted)";
                  statusIcon = "➕";
                }

                return (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => handleSeatClick(st)}
                    className="card card--interactive"
                    style={{
                      padding: "8px 10px",
                      background: bg,
                      borderColor: borderColor,
                      borderWidth: isBoarded || isAbsent ? 2 : 1,
                      borderStyle: isUnbooked ? "dashed" : "solid",
                      textAlign: "start",
                      cursor: "pointer",
                      position: "relative",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                      <strong style={{ fontSize: "var(--text-sm)", color: textColor }}>
                        Siège #{st.seat_no}
                      </strong>
                      <span style={{ fontSize: 11 }}>{statusIcon}</span>
                    </div>

                    <div
                      style={{
                        fontSize: "var(--text-xs)",
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        color: textColor,
                      }}
                    >
                      {st.ticket?.passenger_name || (isUnbooked ? "Place libre" : "Passager")}
                    </div>

                    <div style={{ fontSize: 10, marginTop: 4, display: "flex", justifyContent: "space-between" }} className="muted">
                      <span>{isBoarded ? "À BORD" : isAbsent ? "ABSENT (Remplacer)" : isUnbooked ? "Libre" : "En attente"}</span>
                      {st.ticket && (
                        <span>{st.ticket.luggage_pieces === 0 ? "🎒 Sans sac" : `🧳 ${st.ticket.luggage_pieces}`}</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE REMPLACEMENT D'UN PASSAGER ABSENT (2 OPTIONS) */}
      {absentSeatModal && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            backdropFilter: "blur(4px)",
            zIndex: 10000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            className="card"
            style={{
              width: "100%",
              maxWidth: 580,
              background: "var(--surface)",
              border: "2px solid #ef4444",
              boxShadow: "0 20px 40px rgba(0,0,0,0.3)",
              padding: "var(--space-4)",
              maxHeight: "90vh",
              overflowY: "auto",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div>
                <span className="badge" style={{ background: "#ef4444", color: "#fff" }}>
                  🔴 Place libérée (Siège #{absentSeatModal.seat_no})
                </span>
                <h3 className="heading" style={{ margin: "6px 0 2px" }}>
                  Remplacer le passager absent
                </h3>
                <p className="muted" style={{ margin: 0, fontSize: "var(--text-xs)" }}>
                  Passager initial : <strong>{absentSeatModal.ticket?.passenger_name || "Client absent"}</strong>. Choisissez comment réassigner immédiatement cette place :
                </p>
              </div>

              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setAbsentSeatModal(null)}
                style={{ fontSize: 18, lineHeight: 1 }}
              >
                ✕
              </button>
            </div>

            {/* Onglets de choix des 2 options */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16, borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
              <button
                type="button"
                className={`btn ${replacementTab === "transfer" ? "btn--primary" : "btn--ghost"}`}
                onClick={() => setReplacementTab("transfer")}
                style={{ flex: 1, fontSize: "var(--text-xs)", fontWeight: 700 }}
              >
                🎒 Option 1 : Passager sans bagage d'un autre bus
              </button>
              <button
                type="button"
                className={`btn ${replacementTab === "cash" ? "btn--primary" : "btn--ghost"}`}
                onClick={() => setReplacementTab("cash")}
                style={{ flex: 1, fontSize: "var(--text-xs)", fontWeight: 700 }}
              >
                💵 Option 2 : Passager payant en espèce
              </button>
            </div>

            {/* OPTION 1 : PASSAGER DÉJÀ ENREGISTRÉ SANS BAGAGE D'UN AUTRE BUS */}
            {replacementTab === "transfer" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div
                  className="card"
                  style={{
                    background: "rgba(59, 130, 246, 0.08)",
                    border: "1px solid rgba(59, 130, 246, 0.3)",
                    padding: "var(--space-3)",
                    fontSize: "var(--text-xs)",
                    lineHeight: 1.5,
                  }}
                >
                  ⚡ <strong>Règle de libération immédiate :</strong>
                  <br />
                  Lorsque vous faites monter ce passager sans bagage dans ce bus, <strong>la place qu'il occupait dans son bus d'origine se LIBÈRE DIRECTEMENT</strong> pour que d'autres voyageurs puissent la réserver lors de l'appel !
                </div>

                <label className="field">
                  <span className="field__label">Sélectionner le passager sans bagage :</span>
                  {candidates.length > 0 ? (
                    <select
                      className="select"
                      value={selectedCandidateId}
                      onChange={(e) => setSelectedCandidateId(Number(e.target.value))}
                    >
                      {candidates.map((cand) => (
                        <option key={cand.ticket_id} value={cand.ticket_id}>
                          {cand.passenger_name} ({cand.phone || "Sans tél"}) — Prévu Bus {cand.plate} (Siège #{cand.seat_no} à {new Date(cand.departs_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="card" style={{ padding: "var(--space-3)", fontSize: "var(--text-xs)", color: "var(--muted)" }}>
                      Aucun passager sans bagage en attente sur d'autres départs de l'agence pour l'instant. Vous pouvez utiliser l'Option 2 (Passager payant en espèce sur place).
                    </div>
                  )}
                </label>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
                  <button type="button" className="btn btn--ghost" onClick={() => setAbsentSeatModal(null)}>
                    Annuler
                  </button>
                  <button
                    type="button"
                    className="btn btn--primary"
                    disabled={submitting || candidates.length === 0 || !selectedCandidateId}
                    onClick={handleAssignAbsentSeat}
                    style={{ background: "#10b981", borderColor: "#059669" }}
                  >
                    {submitting ? "Transfert en cours..." : "🎒 Faire monter à bord (Libérer sa place initiale)"}
                  </button>
                </div>
              </div>
            )}

            {/* OPTION 2 : PASSAGER PAYANT EN ESPÈCE SUR PLACE */}
            {replacementTab === "cash" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div
                  className="card"
                  style={{
                    background: "rgba(16, 185, 129, 0.08)",
                    border: "1px solid rgba(16, 185, 129, 0.3)",
                    padding: "var(--space-3)",
                    fontSize: "var(--text-xs)",
                    lineHeight: 1.5,
                  }}
                >
                  💵 <strong>Paiement en liquide sur place au quai :</strong>
                  <br />
                  Le passager paie en espèce directement. Un nouveau billet est émis et immédiatement marqué <strong>« À bord »</strong>, et la recette en espèce est créditée dans la caisse de l'agence.
                </div>

                <label className="field">
                  <span className="field__label">Nom & Prénom du passager *</span>
                  <input
                    className="input"
                    type="text"
                    required
                    placeholder="Ex: Paul Mbarga"
                    value={cashForm.passenger_name}
                    onChange={(e) => setCashForm({ ...cashForm, passenger_name: e.target.value })}
                  />
                </label>

                <div className="search-grid">
                  <label className="field">
                    <span className="field__label">Numéro de téléphone (optionnel)</span>
                    <input
                      className="input"
                      type="tel"
                      placeholder="Ex: 699 00 00 00"
                      value={cashForm.phone}
                      onChange={(e) => setCashForm({ ...cashForm, phone: e.target.value })}
                    />
                  </label>

                  <label className="field">
                    <span className="field__label">Montant perçu en espèce</span>
                    <input
                      className="input"
                      type="text"
                      disabled
                      value={`${manifest?.trip.price ?? 5000} ${manifest?.trip.currency_code ?? "FCFA"}`}
                    />
                  </label>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
                  <button type="button" className="btn btn--ghost" onClick={() => setAbsentSeatModal(null)}>
                    Annuler
                  </button>
                  <button
                    type="button"
                    className="btn btn--primary"
                    disabled={submitting || !cashForm.passenger_name.trim()}
                    onClick={handleAssignAbsentSeat}
                    style={{ background: "#059669" }}
                  >
                    {submitting ? "Enregistrement..." : "💵 Encaisser l'espèce & Embarquer à bord"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
