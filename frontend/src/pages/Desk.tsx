import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { api, ApiError } from "../core/api";
import { useAuth } from "../core/auth";
import { formatDay, formatMoney, formatTime } from "../core/format";
import type { DeskTrip, Manifest } from "../core/types";

const STATUS_BADGES: Record<string, string> = {
  scheduled: "Programmé",
  boarding: "Embarquement",
  departed: "En route",
  completed: "Arrivé",
  cancelled: "❌ Déprogrammé",
};

interface IssuedTicketReceipt {
  reference: string;
  seat_no: number;
  passenger_name: string;
  amount: number;
  currency_code: string;
  payment_method: string;
  origin: string;
  destination: string;
  departs_at: string;
  plate: string;
}

export default function Desk({ embedded = false }: { embedded?: boolean }) {
  const { t, i18n } = useTranslation();
  const { agencySession } = useAuth();

  const [trips, setTrips] = useState<DeskTrip[]>([]);
  const [tripId, setTripId] = useState<number | null>(null);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [loadingTrips, setLoadingTrips] = useState(false);
  const [loadingManifest, setLoadingManifest] = useState(false);

  // Filtres et Recherche dans le plan de places
  const [searchQuery, setSearchQuery] = useState("");
  const [filterSeatType, setFilterSeatType] = useState<"all" | "free" | "occupied">("all");
  const [viewMode, setViewMode] = useState<"cards" | "bus">("cards");

  // Vente directe au guichet (paiement en espèces)
  const [walkIn, setWalkIn] = useState({
    passenger_name: "",
    seat_id: 0,
    id_type: "CNI",
    id_number: "",
    phone: "",
    payment_method: "cash",
    luggage_weight_kg: "",
  });

  // Calculateur de monnaie en espèces (rendu de caisse)
  const [cashTendered, setCashTendered] = useState("");

  // Reçu de billet émis en direct
  const [issuedReceipt, setIssuedReceipt] = useState<IssuedTicketReceipt | null>(null);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // Journal de Caisse du Guichet
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

  const fail = useCallback(
    (e: unknown) => setError(e instanceof ApiError ? e.message : t("common.error")),
    [t],
  );

  const loadTrips = useCallback(() => {
    setLoadingTrips(true);
    api<DeskTrip[]>("/desk/trips", { realm: "agency" })
      .then((rows) => {
        setTrips(rows);
        if (rows.length > 0) {
          setTripId((prev) => (prev !== null && rows.some((r) => r.id === prev) ? prev : rows[0].id));
        }
      })
      .catch(fail)
      .finally(() => setLoadingTrips(false));
  }, [fail]);

  const loadManifest = useCallback(
    (id: number) => {
      setLoadingManifest(true);
      api<Manifest>(`/desk/trips/${id}/manifest`, { realm: "agency" })
        .then(setManifest)
        .catch(fail)
        .finally(() => setLoadingManifest(false));
    },
    [fail],
  );

  useEffect(() => {
    if (agencySession) loadTrips();
  }, [agencySession, loadTrips]);

  useEffect(() => {
    setMessage("");
    setError("");
    setWalkIn((prev) => ({ ...prev, seat_id: 0 }));
    setCashTendered("");
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

  // Calcul des places libres et occupées avec les billets
  const seatDetailsList = useMemo(() => {
    if (!manifest) return [];
    return manifest.seats.map((s) => {
      const ticket = manifest.tickets.find((k) => k.seat_no === s.seat_no && k.status !== "no_show");
      const isOccupied = Boolean(ticket);
      const isFree = !ticket;
      const isSelected = walkIn.seat_id === s.id;
      return {
        ...s,
        ticket: ticket || null,
        isOccupied,
        isFree,
        isSelected,
      };
    });
  }, [manifest, walkIn.seat_id]);

  const freeSeats = useMemo(() => seatDetailsList.filter((s) => s.isFree), [seatDetailsList]);
  const occupiedSeats = useMemo(() => seatDetailsList.filter((s) => s.isOccupied), [seatDetailsList]);

  // Siège actuellement sélectionné pour l'encaissement en espèces
  const selectedSeatObj = useMemo(
    () => seatDetailsList.find((s) => s.id === walkIn.seat_id) ?? null,
    [seatDetailsList, walkIn.seat_id],
  );

  // Filtrage selon recherche & onglets
  const filteredSeats = useMemo(() => {
    return seatDetailsList.filter((s) => {
      if (filterSeatType === "free" && !s.isFree) return false;
      if (filterSeatType === "occupied" && !s.isOccupied) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchSeatNo = String(s.seat_no).includes(q);
        const matchName = s.ticket?.passenger_name?.toLowerCase().includes(q) ?? false;
        const matchRef = s.ticket?.reference?.toLowerCase().includes(q) ?? false;
        const matchPhone = s.ticket?.phone?.toLowerCase().includes(q) ?? false;
        return matchSeatNo || matchName || matchRef || matchPhone;
      }
      return true;
    });
  }, [seatDetailsList, filterSeatType, searchQuery]);

  // Rendu de monnaie calculé
  const tripPrice = manifest?.price ?? 0;
  const tenderedAmount = Number(cashTendered) || 0;
  const changeDue = tenderedAmount > 0 ? tenderedAmount - tripPrice : 0;

  // Encaissement en espèces & vente directe
  async function handleSellWalkIn(e: FormEvent) {
    e.preventDefault();
    if (!tripId || !walkIn.seat_id || !walkIn.passenger_name.trim()) return;
    setError("");
    setMessage("");

    try {
      const res = await api<{ reference: string; seat_no: number; payment_method: string }>(
        `/desk/trips/${tripId}/sell`,
        {
          body: {
            ...walkIn,
            luggage_weight_kg: walkIn.luggage_weight_kg ? Number(walkIn.luggage_weight_kg) : 0,
          },
          realm: "agency",
        },
      );

      // Ouvrir le reçu imprimable
      if (current && manifest) {
        setIssuedReceipt({
          reference: res.reference,
          seat_no: res.seat_no,
          passenger_name: walkIn.passenger_name.trim(),
          amount: manifest.price,
          currency_code: manifest.currency_code,
          payment_method: walkIn.payment_method,
          origin: current.origin,
          destination: current.destination,
          departs_at: current.departs_at,
          plate: current.plate,
        });
      }

      setMessage(`✓ Billet émis avec succès pour ${walkIn.passenger_name} sur le siège #${res.seat_no} !`);
      
      // Réinitialiser le formulaire
      setWalkIn({
        passenger_name: "",
        seat_id: 0,
        id_type: "CNI",
        id_number: "",
        phone: "",
        payment_method: "cash",
        luggage_weight_kg: "",
      });
      setCashTendered("");

      // Rafraîchir les places en temps réel
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
    <div className={`desk-v2 ${embedded ? "desk-v2--embedded" : ""}`}>
      {/* ==================== 1. BANDEAU DES HORAIRES DE DÉPARTS (PLEINE LARGEUR) ==================== */}
      <section className="desk-timetable-container">
        <div className="desk-timetable-header">
          <div>
            <h2 className="desk-timetable-title">
              <span>🕒</span> Horaires des Départs Programmés
            </h2>
            <span className="muted" style={{ fontSize: "0.92rem" }}>
              Cliquez sur un horaire pour afficher immédiatement le plan des places et les passagers
            </span>
          </div>
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            onClick={loadTrips}
            title="Rafraîchir les horaires"
            disabled={loadingTrips}
            style={{ fontSize: "0.9rem" }}
          >
            🔄 {loadingTrips ? "Actualisation…" : "Actualiser les départs"}
          </button>
        </div>

        {trips.length === 0 ? (
          <div className="card" style={{ padding: "20px", textAlign: "center" }}>
            <p className="muted" style={{ margin: 0, fontSize: "1rem" }}>
              Aucun départ programmé pour le moment.
            </p>
          </div>
        ) : (
          <div className="desk-timetable-strip">
            {trips.map((tItem) => {
              const isActive = tItem.id === tripId;
              const isFull = tItem.booked >= tItem.seat_count;
              const freeCount = Math.max(0, tItem.seat_count - tItem.booked);

              return (
                <button
                  key={tItem.id}
                  type="button"
                  className={`desk-timetable-card ${isActive ? "is-active" : ""}`}
                  onClick={() => setTripId(tItem.id)}
                >
                  <div className="desk-timetable-card__time">
                    <span className="mono">{formatTime(tItem.departs_at, tItem.timezone, i18n.language)}</span>
                    <span
                      className="badge"
                      style={{
                        fontSize: "0.76rem",
                        padding: "3px 8px",
                        background: isActive ? "var(--accent)" : "rgba(255, 255, 255, 0.08)",
                        color: "#ffffff",
                      }}
                    >
                      {STATUS_BADGES[tItem.status] ?? tItem.status}
                    </span>
                  </div>

                  <div className="desk-timetable-card__route">
                    {tItem.origin} <span className="flip-rtl">➔</span> {tItem.destination}
                  </div>

                  <div className="desk-timetable-card__meta">
                    <span>
                      🚌 {tItem.bus_label} ({tItem.plate})
                    </span>
                    <strong className="mono" style={{ color: "var(--accent)", fontSize: "0.95rem" }}>
                      {formatMoney(tItem.price, agencySession.agency.currency_code, minor, i18n.language)}
                    </strong>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 2 }}>
                    <span className="muted" style={{ fontSize: "0.82rem" }}>
                      {formatDay(tItem.departs_at, tItem.timezone, i18n.language)}
                    </span>
                    <span
                      className="badge"
                      style={{
                        fontSize: "0.8rem",
                        fontWeight: 700,
                        background: isFull ? "rgba(239, 68, 68, 0.15)" : "rgba(16, 185, 129, 0.15)",
                        color: isFull ? "#ef4444" : "#10b981",
                        border: `1px solid ${isFull ? "rgba(239, 68, 68, 0.3)" : "rgba(16, 185, 129, 0.3)"}`,
                      }}
                    >
                      {isFull ? "🔴 Bus Plein" : `🟢 ${freeCount} libre${freeCount > 1 ? "s" : ""}`}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Messages de succès ou d'erreur */}
      {message && (
        <motion.div
          className="demo-note"
          role="status"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ fontSize: "1.05rem", padding: "14px 18px" }}
        >
          <strong>{message}</strong>
        </motion.div>
      )}
      {error && (
        <motion.div
          className="error"
          role="alert"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ fontSize: "1.02rem", padding: "12px 16px" }}
        >
          {error}
        </motion.div>
      )}

      {/* ==================== 2. ZONE PRINCIPALE : PLAN DE SIÈGES + GUICHET VENTE EN ESPÈCES ==================== */}
      {!manifest || !current ? (
        <div className="card" style={{ padding: "40px 20px", textAlign: "center" }}>
          <p className="muted" style={{ fontSize: "1.1rem" }}>
            {loadingManifest ? "Chargement des places du départ…" : "Veuillez sélectionner un départ ci-dessus."}
          </p>
        </div>
      ) : (
        <div className="desk-main-grid">
          {/* ==================== COLONNE GAUCHE : PLAN & ÉTAT DES PLACES ==================== */}
          <section className="desk-seats-board">
            <div className="desk-seats-toolbar">
              <div>
                <h3 className="desk-seats-title">
                  💺 Plan des Places — Départ de{" "}
                  <span className="mono" style={{ color: "var(--accent)" }}>
                    {formatTime(current.departs_at, tz, i18n.language)}
                  </span>
                </h3>
                <span className="muted" style={{ fontSize: "0.92rem" }}>
                  {current.origin} ➔ {current.destination} · Autocar : <strong>{current.bus_label}</strong> ({current.plate})
                </span>
              </div>

              {/* Badges d'état des places */}
              <div className="desk-seats-stats">
                <span className="desk-stat-badge desk-stat-badge--free">
                  🟢 <strong>{freeSeats.length}</strong> Places Libres
                </span>
                <span className="desk-stat-badge desk-stat-badge--occupied">
                  🔵 <strong>{occupiedSeats.length}</strong> Réservées & Payées
                </span>
                <span
                  className="desk-stat-badge"
                  style={{ background: "rgba(255, 255, 255, 0.06)", color: "var(--text)" }}
                >
                  🏷️ Total : <strong>{manifest.seats.length}</strong>
                </span>
              </div>
            </div>

            {/* Barre de recherche et filtres de places */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 12,
              }}
            >
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <button
                  type="button"
                  className={`chip ${filterSeatType === "all" ? "is-active" : ""}`}
                  onClick={() => setFilterSeatType("all")}
                  style={{ fontSize: "0.92rem", padding: "6px 14px" }}
                >
                  Toutes les places ({manifest.seats.length})
                </button>
                <button
                  type="button"
                  className={`chip ${filterSeatType === "free" ? "is-active" : ""}`}
                  onClick={() => setFilterSeatType("free")}
                  style={{
                    fontSize: "0.92rem",
                    padding: "6px 14px",
                    color: filterSeatType === "free" ? "#ffffff" : "#10b981",
                  }}
                >
                  🟢 Libres uniquement ({freeSeats.length})
                </button>
                <button
                  type="button"
                  className={`chip ${filterSeatType === "occupied" ? "is-active" : ""}`}
                  onClick={() => setFilterSeatType("occupied")}
                  style={{
                    fontSize: "0.92rem",
                    padding: "6px 14px",
                    color: filterSeatType === "occupied" ? "#ffffff" : "#60a5fa",
                  }}
                >
                  🔵 Réservées avec Noms ({occupiedSeats.length})
                </button>
              </div>

              {/* Champ de recherche direct passager / siège */}
              <div style={{ minWidth: 240, flex: "1 1 240px", maxWidth: 360 }}>
                <input
                  type="search"
                  className="input"
                  style={{ fontSize: "0.95rem", padding: "8px 14px", width: "100%", borderRadius: 10 }}
                  placeholder="🔍 Rechercher passager, réf ou N° siège…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              {/* Bascule mode Grille Détaillée / Mode Plan Bus */}
              <div className="chips">
                <button
                  type="button"
                  className={`chip ${viewMode === "cards" ? "is-active" : ""}`}
                  onClick={() => setViewMode("cards")}
                  style={{ fontSize: "0.88rem" }}
                >
                  📋 Grille avec Noms
                </button>
                <button
                  type="button"
                  className={`chip ${viewMode === "bus" ? "is-active" : ""}`}
                  onClick={() => setViewMode("bus")}
                  style={{ fontSize: "0.88rem" }}
                >
                  🚌 Plan Autocar
                </button>
              </div>
            </div>

            {/* Alerte si aucun résultat selon la recherche */}
            {filteredSeats.length === 0 && (
              <div className="card" style={{ padding: "30px", textAlign: "center", margin: "10px 0" }}>
                <p className="muted" style={{ margin: 0, fontSize: "1rem" }}>
                  Aucune place ne correspond à votre filtre "{searchQuery}".
                </p>
              </div>
            )}

            {/* ==================== VUE 1 : GRILLE DÉTAILLÉE DES SIÈGES AVEC NOMS DES PASSAGERS ==================== */}
            {viewMode === "cards" && (
              <div className="desk-seat-cards-grid">
                {filteredSeats.map((item) => {
                  const { ticket, isOccupied, isSelected } = item;

                  // SIÈGE DÉJÀ RÉSERVÉ / OCCUPÉ
                  if (isOccupied && ticket) {
                    return (
                      <div key={item.id} className="desk-seat-card desk-seat-card--occupied">
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span className="desk-seat-badge mono">#{item.seat_no}</span>
                          <span
                            className="badge"
                            style={{
                              fontSize: "0.78rem",
                              fontWeight: 700,
                              background:
                                ticket.status === "boarded"
                                  ? "rgba(16, 185, 129, 0.2)"
                                  : "rgba(59, 130, 246, 0.2)",
                              color: ticket.status === "boarded" ? "#10b981" : "#60a5fa",
                              border: `1px solid ${ticket.status === "boarded" ? "rgba(16, 185, 129, 0.4)" : "rgba(59, 130, 246, 0.4)"}`,
                            }}
                          >
                            {ticket.status === "boarded" ? "🟢 À bord" : "🔵 Réservé & Payé"}
                          </span>
                        </div>

                        {/* Nom du passager affiché directement en grand */}
                        <div className="desk-seat-card__passenger-name" title={ticket.passenger_name}>
                          👤 {ticket.passenger_name}
                        </div>

                        <div className="desk-seat-card__meta mono">
                          <span>Réf : {ticket.reference}</span>
                          {ticket.phone && <span>📞 {ticket.phone}</span>}
                          {ticket.id_number && (
                            <span>
                              {ticket.id_type ?? "ID"} : {ticket.id_number}
                            </span>
                          )}
                          <span className="muted" style={{ fontSize: "0.75rem" }}>
                            Classe : {item.seat_class}
                          </span>
                        </div>
                      </div>
                    );
                  }

                  // SIÈGE LIBRE (DISPONIBLE POUR VENTE EN ESPÈCES)
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`desk-seat-card desk-seat-card--free ${isSelected ? "is-selected" : ""}`}
                      onClick={() => {
                        setWalkIn((prev) => ({ ...prev, seat_id: item.id }));
                        // Défiler vers le formulaire d'encaissement sur mobile
                        document.getElementById("desk-cash-panel")?.scrollIntoView({ behavior: "smooth" });
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span className="desk-seat-badge mono">#{item.seat_no}</span>
                        <span
                          className="badge"
                          style={{
                            fontSize: "0.78rem",
                            fontWeight: 700,
                            background: isSelected ? "var(--accent)" : "rgba(16, 185, 129, 0.2)",
                            color: isSelected ? "#ffffff" : "#10b981",
                            border: `1px solid ${isSelected ? "var(--accent)" : "rgba(16, 185, 129, 0.4)"}`,
                          }}
                        >
                          {isSelected ? "✨ Choisi pour vente" : "🟢 Place Libre"}
                        </span>
                      </div>

                      <div
                        style={{
                          fontSize: "1.02rem",
                          fontWeight: 700,
                          color: isSelected ? "var(--accent)" : "#10b981",
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          margin: "4px 0",
                        }}
                      >
                        <span>💵</span>
                        <span>{isSelected ? "Prêt à encaisser" : "Cliquer pour vendre"}</span>
                      </div>

                      <div className="desk-seat-card__meta">
                        <strong className="mono" style={{ color: "var(--text)", fontSize: "0.95rem" }}>
                          Tarif : {formatMoney(manifest.price, manifest.currency_code, minor, i18n.language)}
                        </strong>
                        <span className="muted" style={{ fontSize: "0.78rem" }}>
                          Classe : {item.seat_class}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* ==================== VUE 2 : PLAN D'AUTOCAR RÉALISTE AVEC COCKPIT & NOMS ==================== */}
            {viewMode === "bus" && manifest.layout && (
              <div
                style={{
                  background: "var(--surface)",
                  border: "2px solid var(--border)",
                  borderRadius: "28px",
                  padding: "24px 18px",
                  maxWidth: 720,
                  margin: "10px auto",
                  boxShadow: "0 10px 30px rgba(0, 0, 0, 0.1)",
                }}
              >
                {/* Cockpit Conducteur */}
                <div
                  style={{
                    borderBottom: "2px dashed var(--border)",
                    paddingBottom: 16,
                    marginBottom: 18,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      background: "rgba(140, 107, 184, 0.15)",
                      padding: "8px 16px",
                      borderRadius: 14,
                      fontWeight: 700,
                      color: "var(--accent)",
                      fontSize: "0.95rem",
                    }}
                  >
                    <span style={{ fontSize: 20 }}>🧑‍✈️</span>
                    <span>Poste Conducteur</span>
                  </div>

                  <div
                    style={{
                      fontSize: 12,
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                      color: "var(--muted)",
                      fontWeight: 800,
                    }}
                  >
                    ▲ Avant de l'autocar
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      background: "var(--bg)",
                      padding: "6px 12px",
                      borderRadius: 10,
                      border: "1px solid var(--border)",
                      fontSize: "0.9rem",
                    }}
                  >
                    <span>🚪</span>
                    <span>Porte d'accès</span>
                  </div>
                </div>

                {/* Sièges organisés par rangées avec allée centrale */}
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {(() => {
                    const left = manifest.layout.seats_per_row[0] ?? 2;
                    const right = manifest.layout.seats_per_row[1] ?? 2;
                    const rowsMap = new Map<number, typeof filteredSeats>();
                    filteredSeats.forEach((s) => {
                      rowsMap.set(s.row_no, [...(rowsMap.get(s.row_no) ?? []), s]);
                    });
                    const sorted = [...rowsMap.entries()].sort((a, b) => a[0] - b[0]);

                    return sorted.map(([rowNo, rowSeats]) => (
                      <div
                        key={rowNo}
                        style={{
                          display: "grid",
                          gridTemplateColumns: `repeat(${left}, 1fr) 36px repeat(${right}, 1fr)`,
                          gap: 8,
                          alignItems: "stretch",
                        }}
                      >
                        {rowSeats.map((s) => {
                          const col = s.col_no <= left ? s.col_no : s.col_no + 1;
                          const { ticket, isOccupied, isSelected } = s;

                          if (isOccupied && ticket) {
                            return (
                              <div
                                key={s.id}
                                style={{
                                  gridColumn: col,
                                  background: "rgba(30, 41, 59, 0.6)",
                                  border: "1px solid rgba(59, 130, 246, 0.4)",
                                  borderRadius: 12,
                                  padding: "8px 6px",
                                  display: "flex",
                                  flexDirection: "column",
                                  justifyContent: "center",
                                  alignItems: "center",
                                  textAlign: "center",
                                  minHeight: 70,
                                }}
                                title={`${ticket.passenger_name} · Siège #${s.seat_no}`}
                              >
                                <span className="mono" style={{ fontWeight: 800, fontSize: "1.1rem", color: "#60a5fa" }}>
                                  #{s.seat_no}
                                </span>
                                <span
                                  style={{
                                    fontSize: "0.82rem",
                                    fontWeight: 700,
                                    color: "#f1f5f9",
                                    lineHeight: 1.2,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                    maxWidth: "100%",
                                  }}
                                >
                                  {ticket.passenger_name.split(" ")[0]}
                                </span>
                                <span className="badge" style={{ fontSize: "0.68rem", padding: "1px 4px", marginTop: 2 }}>
                                  {ticket.status === "boarded" ? "À bord" : "Payé"}
                                </span>
                              </div>
                            );
                          }

                          return (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => {
                                setWalkIn((prev) => ({ ...prev, seat_id: s.id }));
                                document.getElementById("desk-cash-panel")?.scrollIntoView({ behavior: "smooth" });
                              }}
                              style={{
                                gridColumn: col,
                                background: isSelected
                                  ? "linear-gradient(135deg, rgba(140, 107, 184, 0.4), rgba(16, 185, 129, 0.3))"
                                  : "rgba(16, 185, 129, 0.08)",
                                border: isSelected ? "2px solid var(--accent)" : "1.5px dashed #10b981",
                                borderRadius: 12,
                                padding: "8px 6px",
                                display: "flex",
                                flexDirection: "column",
                                justifyContent: "center",
                                alignItems: "center",
                                cursor: "pointer",
                                minHeight: 70,
                                boxShadow: isSelected ? "0 0 20px rgba(140, 107, 184, 0.6)" : "none",
                                transition: "all 0.2s ease",
                              }}
                            >
                              <span className="mono" style={{ fontWeight: 800, fontSize: "1.1rem", color: "#10b981" }}>
                                #{s.seat_no}
                              </span>
                              <span
                                style={{
                                  fontSize: "0.82rem",
                                  fontWeight: 700,
                                  color: isSelected ? "var(--accent)" : "#10b981",
                                }}
                              >
                                {isSelected ? "✓ Choisi" : "Libre"}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    ));
                  })()}
                </div>

                <div
                  style={{
                    marginTop: 18,
                    paddingTop: 10,
                    borderTop: "1px dashed var(--border)",
                    textAlign: "center",
                    fontSize: 11,
                    color: "var(--muted)",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                  }}
                >
                  ▼ Arrière du véhicule (Issue de secours)
                </div>
              </div>
            )}
          </section>

          {/* ==================== COLONNE DROITE : GUICHET ENCAISSEMENT ESPÈCES (ZONE RÉSERVÉE) ==================== */}
          <section id="desk-cash-panel" className="desk-cash-panel">
            <div className="desk-cash-header">
              <span className="badge" style={{ background: "rgba(16, 185, 129, 0.15)", color: "#10b981", border: "1px solid rgba(16, 185, 129, 0.4)" }}>
                💵 Guichet Secrétaire — Zone Vente & Encaissement
              </span>
              <h3 className="desk-cash-title">
                <span>🎫</span> Vente Directe en Espèces
              </h3>
              <p className="muted" style={{ margin: "4px 0 0", fontSize: "0.92rem" }}>
                Enregistrez le client qui se présente au guichet, encaissez les espèces et éditez son billet immédiatement.
              </p>
            </div>

            {/* Bannière du siège sélectionné */}
            {selectedSeatObj ? (
              <div className="desk-selected-seat-banner desk-selected-seat-banner--active">
                <div>
                  <strong style={{ fontSize: "1.12rem", display: "block" }}>
                    Siège Sélectionné : <span className="mono" style={{ color: "var(--accent)" }}>#{selectedSeatObj.seat_no}</span> ({selectedSeatObj.seat_class})
                  </strong>
                  <span className="muted" style={{ fontSize: "0.85rem" }}>
                    Trajet : {current.origin} ➔ {current.destination} ({formatTime(current.departs_at, tz, i18n.language)})
                  </span>
                </div>
                <div style={{ textAlign: "right" }}>
                  <span className="muted" style={{ fontSize: "0.8rem", display: "block" }}>Tarif à encaisser</span>
                  <strong className="mono" style={{ fontSize: "1.3rem", color: "#10b981" }}>
                    {formatMoney(manifest.price, manifest.currency_code, minor, i18n.language)}
                  </strong>
                </div>
              </div>
            ) : (
              <div className="desk-selected-seat-banner desk-selected-seat-banner--empty">
                <span>👈 Cliquez sur une place libre (verte) à gauche pour commencer l'enregistrement.</span>
              </div>
            )}

            {/* Formulaire d'enregistrement */}
            <form onSubmit={handleSellWalkIn} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div className="desk-form-field">
                <label htmlFor="walkin-name">Nom complet du passager *</label>
                <input
                  id="walkin-name"
                  className="desk-form-input"
                  required
                  placeholder="Ex : Paul-Alain Mbida"
                  value={walkIn.passenger_name}
                  onChange={(e) => setWalkIn({ ...walkIn, passenger_name: e.target.value })}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div className="desk-form-field">
                  <label htmlFor="walkin-phone">Téléphone</label>
                  <input
                    id="walkin-phone"
                    className="desk-form-input"
                    type="tel"
                    placeholder="+237 6..."
                    value={walkIn.phone}
                    onChange={(e) => setWalkIn({ ...walkIn, phone: e.target.value })}
                  />
                </div>

                <div className="desk-form-field">
                  <label htmlFor="walkin-id">N° CNI / Pièce</label>
                  <input
                    id="walkin-id"
                    className="desk-form-input"
                    placeholder="10928374..."
                    value={walkIn.id_number}
                    onChange={(e) => setWalkIn({ ...walkIn, id_number: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 10 }}>
                <div className="desk-form-field">
                  <label htmlFor="walkin-luggage">Bagages (kg)</label>
                  <input
                    id="walkin-luggage"
                    className="desk-form-input"
                    type="number"
                    min={0}
                    step="0.5"
                    placeholder="0 kg"
                    value={walkIn.luggage_weight_kg}
                    onChange={(e) => setWalkIn({ ...walkIn, luggage_weight_kg: e.target.value })}
                  />
                </div>

                <div className="desk-form-field">
                  <label htmlFor="walkin-mode">Mode de paiement</label>
                  <select
                    id="walkin-mode"
                    className="desk-form-input"
                    value={walkIn.payment_method}
                    onChange={(e) => setWalkIn({ ...walkIn, payment_method: e.target.value })}
                  >
                    <option value="cash">💵 Espèces (Cash guichet)</option>
                    <option value="orange_money">🍊 Orange Money</option>
                    <option value="mtn_momo">💛 MTN Mobile Money</option>
                    <option value="wave">🌊 Wave</option>
                    <option value="card">💳 Carte Bancaire</option>
                  </select>
                </div>
              </div>

              {/* CALCULATEUR DE MONNAIE POUR ESPÈCES (ASSISTANT RENDU DE CAISSE) */}
              {walkIn.payment_method === "cash" && selectedSeatObj && (
                <div className="desk-change-calc">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <label htmlFor="walkin-tendered" style={{ fontSize: "0.92rem", fontWeight: 700 }}>
                      💵 Montant remis par le client (espèces) :
                    </label>
                    <input
                      id="walkin-tendered"
                      type="number"
                      min={0}
                      step={500}
                      placeholder={`${manifest.price}`}
                      value={cashTendered}
                      onChange={(e) => setCashTendered(e.target.value)}
                      style={{
                        width: 140,
                        padding: "6px 10px",
                        fontSize: "1.05rem",
                        borderRadius: 8,
                        border: "1px solid #10b981",
                        background: "var(--bg)",
                        color: "var(--text)",
                        textAlign: "right",
                        fontWeight: 700,
                      }}
                    />
                  </div>

                  {tenderedAmount > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                      <span style={{ fontSize: "0.9rem", color: "var(--muted)" }}>Rendu de monnaie :</span>
                      {changeDue >= 0 ? (
                        <strong className="mono" style={{ fontSize: "1.2rem", color: "#10b981" }}>
                          🟢 Rendre {formatMoney(changeDue, manifest.currency_code, minor, i18n.language)}
                        </strong>
                      ) : (
                        <strong className="mono" style={{ fontSize: "1.1rem", color: "#ef4444" }}>
                          ⚠️ Manque {formatMoney(Math.abs(changeDue), manifest.currency_code, minor, i18n.language)}
                        </strong>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* BOUTON D'ENCAISSEMENT GÉANT & VIBRANT */}
              <button
                type="submit"
                className="desk-btn-cash-submit"
                disabled={!walkIn.seat_id || !walkIn.passenger_name.trim()}
              >
                <span>✓</span>
                <span>
                  Encaisser en Espèces ({formatMoney(manifest.price, manifest.currency_code, minor, i18n.language)}) & Émettre le Billet
                </span>
              </button>
            </form>
          </section>
        </div>
      )}

      {/* ==================== 3. MODAL DE REÇU & BILLET ÉMIS AVEC SUCCÈS ==================== */}
      <AnimatePresence>
        {issuedReceipt && (
          <div className="desk-receipt-overlay" onClick={() => setIssuedReceipt(null)}>
            <motion.div
              className="desk-receipt-card"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ textAlign: "center" }}>
                <span style={{ fontSize: 48 }}>🎉</span>
                <h3 style={{ margin: "6px 0 2px", fontSize: "1.45rem", color: "#10b981" }}>
                  Billet Émis avec Succès !
                </h3>
                <span className="muted" style={{ fontSize: "0.95rem" }}>
                  Encaissement validé · Siège attribué
                </span>
              </div>

              <div
                style={{
                  background: "var(--bg)",
                  border: "1px dashed var(--border)",
                  borderRadius: 14,
                  padding: 16,
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span className="muted">Numéro de Billet :</span>
                  <strong className="mono" style={{ fontSize: "1.2rem", color: "var(--accent)" }}>
                    {issuedReceipt.reference}
                  </strong>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span className="muted">Passager :</span>
                  <strong style={{ fontSize: "1.08rem" }}>{issuedReceipt.passenger_name}</strong>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span className="muted">Siège Attribué :</span>
                  <span className="badge mono" style={{ fontSize: "1.1rem", background: "#10b981", color: "#ffffff", padding: "4px 10px" }}>
                    Siège #{issuedReceipt.seat_no}
                  </span>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span className="muted">Ligne & Trajet :</span>
                  <strong>{issuedReceipt.origin} ➔ {issuedReceipt.destination}</strong>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span className="muted">Montant Encaissé :</span>
                  <strong className="mono" style={{ fontSize: "1.25rem", color: "#10b981" }}>
                    {formatMoney(issuedReceipt.amount, issuedReceipt.currency_code, minor, i18n.language)} ({issuedReceipt.payment_method.toUpperCase()})
                  </strong>
                </div>
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <button
                  type="button"
                  className="btn btn--outline"
                  style={{ flex: 1, fontSize: "1rem" }}
                  onClick={() => window.print()}
                >
                  🖨️ Imprimer Reçu
                </button>
                <button
                  type="button"
                  className="btn"
                  style={{ flex: 1, background: "#10b981", color: "#ffffff", fontSize: "1rem", fontWeight: 700 }}
                  onClick={() => setIssuedReceipt(null)}
                >
                  ✓ Passager Suivant
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ==================== 4. JOURNAL DE CAISSE DU GUICHER (RÉSUMÉ QUOTIDIEN) ==================== */}
      <section className="card" style={{ marginTop: 12, padding: "18px 22px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h4 style={{ margin: 0, fontSize: "1.15rem", display: "flex", alignItems: "center", gap: 8 }}>
              <span>💼</span> Journal de Caisse & Recettes Guichet
            </h4>
            <span className="muted" style={{ fontSize: "0.88rem" }}>
              Suivez le cumul des encaissements en espèces et paiements au comptoir en direct.
            </span>
          </div>

          <button
            type="button"
            className="btn btn--outline"
            onClick={loadCashJournal}
            style={{ fontSize: "0.92rem", fontWeight: 700 }}
          >
            {showJournal ? "🔄 Actualiser la caisse" : "📊 Consulter mon journal de caisse"}
          </button>
        </div>

        {showJournal && cashJournal && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 16 }}>
            {/* KPI Cards */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 12,
              }}
            >
              <div className="card" style={{ padding: "14px", background: "rgba(16, 185, 129, 0.1)", borderColor: "#10b981" }}>
                <span className="muted" style={{ fontSize: "0.85rem", display: "block" }}>💵 Espèces (Cash)</span>
                <strong style={{ fontSize: "1.25rem", color: "#059669" }}>
                  {formatMoney(cashJournal.summary.total_cash, cashJournal.currency_code, minor, i18n.language)}
                </strong>
              </div>

              <div className="card" style={{ padding: "14px", background: "rgba(245, 158, 11, 0.1)", borderColor: "#f59e0b" }}>
                <span className="muted" style={{ fontSize: "0.85rem", display: "block" }}>📱 Mobile Money</span>
                <strong style={{ fontSize: "1.25rem", color: "#d97706" }}>
                  {formatMoney(cashJournal.summary.total_momo, cashJournal.currency_code, minor, i18n.language)}
                </strong>
              </div>

              <div className="card" style={{ padding: "14px", background: "rgba(59, 130, 246, 0.1)", borderColor: "#3b82f6" }}>
                <span className="muted" style={{ fontSize: "0.85rem", display: "block" }}>💳 Carte / TPE</span>
                <strong style={{ fontSize: "1.25rem", color: "#2563eb" }}>
                  {formatMoney(cashJournal.summary.total_card, cashJournal.currency_code, minor, i18n.language)}
                </strong>
              </div>

              <div className="card" style={{ padding: "14px", background: "rgba(140, 107, 184, 0.15)", borderColor: "var(--accent)" }}>
                <span className="muted" style={{ fontSize: "0.85rem", display: "block" }}>
                  🏷️ Total Ventes ({cashJournal.summary.total_sales_count})
                </span>
                <strong style={{ fontSize: "1.25rem", color: "var(--accent)" }}>
                  {formatMoney(cashJournal.summary.total_amount, cashJournal.currency_code, minor, i18n.language)}
                </strong>
              </div>
            </div>

            {/* Tableau des ventes du guichet */}
            <div style={{ overflowX: "auto" }}>
              <table className="table" style={{ width: "100%", fontSize: "0.92rem" }}>
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
                      <td colSpan={7} className="muted" style={{ textAlign: "center", padding: 20 }}>
                        Aucune vente guichet enregistrée sur les dernières 24h.
                      </td>
                    </tr>
                  ) : (
                    cashJournal.sales.map((sl: any) => (
                      <tr key={sl.id}>
                        <td className="mono">{sl.reference}</td>
                        <td>
                          <strong>{sl.passenger_name || "Client guichet"}</strong>
                        </td>
                        <td>
                          <span className="badge mono">#{sl.seat_no ?? "—"}</span>
                        </td>
                        <td>{sl.origin && sl.destination ? `${sl.origin} ➔ ${sl.destination}` : "—"}</td>
                        <td>
                          <span className="badge" style={{ fontSize: "0.8rem" }}>
                            {sl.provider === "cash"
                              ? "💵 Espèces"
                              : sl.provider === "card"
                                ? "💳 Carte"
                                : `📱 ${sl.provider}`}
                          </span>
                        </td>
                        <td>
                          <strong className="mono" style={{ color: "#10b981" }}>
                            {formatMoney(sl.amount, sl.currency_code, minor, i18n.language)}
                          </strong>
                        </td>
                        <td className="muted">
                          {new Date(sl.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
