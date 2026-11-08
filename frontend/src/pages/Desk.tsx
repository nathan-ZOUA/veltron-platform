import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import { useTranslation } from "react-i18next";
import { api, ApiError } from "../core/api";
import { useAuth } from "../core/auth";
import { formatDay, formatMoney, formatTime } from "../core/format";
import type { DeskTrip, Manifest } from "../core/types";
import SeatGrid, { GridSeat } from "../components/SeatGrid";

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
  agency_name?: string;
  veltron_account?: string;
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
  const [viewMode, setViewMode] = useState<"cards" | "bus">("bus");

  // Vente directe au guichet (paiement en espèces & rattachement compte passager)
  const [walkIn, setWalkIn] = useState({
    passenger_name: "",
    passenger_account: "",
    email: "",
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

  // Journal de Caisse par départ & Historique / Archives consultables des mois après
  const [tripJournal, setTripJournal] = useState<any>(null);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [countedCash, setCountedCash] = useState("");
  const [closeNotes, setCloseNotes] = useState("");
  const [journalArchives, setJournalArchives] = useState<any[]>([]);
  const [activeJournalTab, setActiveJournalTab] = useState<"trip" | "archives" | "daily">("trip");

  // Journal de Caisse quotidien général
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

  const loadTripCashJournal = useCallback(async (tid: number) => {
    try {
      const res = await api<any>(`/desk/trips/${tid}/cash-journal`, { realm: "agency" });
      setTripJournal(res);
    } catch {
      setTripJournal(null);
    }
  }, []);

  useEffect(() => {
    setMessage("");
    setError("");
    setWalkIn((prev) => ({ ...prev, seat_id: 0 }));
    setCashTendered("");
    if (tripId) {
      loadManifest(tripId);
      loadTripCashJournal(tripId);
    }
  }, [tripId, loadManifest, loadTripCashJournal]);

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

  // Modélisation réaliste pour le composant SeatGrid
  const seatGridSeats: GridSeat[] = useMemo(() => {
    if (!manifest) return [];
    const occupiedSeatIds = new Set(manifest.tickets.filter((t) => t.status !== "no_show").map((t) => t.seat_id));
    return manifest.seats.map((s) => ({
      id: s.id,
      seat_no: s.seat_no,
      row_no: s.row_no,
      col_no: s.col_no,
      seat_class: s.seat_class,
      taken: occupiedSeatIds.has(s.id),
      disabled: occupiedSeatIds.has(s.id),
      selected: walkIn.seat_id === s.id,
      passenger_name: manifest.tickets.find((t) => t.seat_id === s.id)?.passenger_name,
    }));
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

  // Clôture certifiée de la caisse d'un départ
  async function handleCloseTripJournal() {
    if (!tripId) return;
    try {
      const res = await api<any>(`/desk/trips/${tripId}/cash-journal/close`, {
        body: {
          cash_counted: countedCash ? Number(countedCash) : undefined,
          notes: closeNotes,
        },
        realm: "agency",
      });
      setMessage(res.message || "✓ Caisse de ce départ clôturée avec succès !");
      setShowCloseModal(false);
      loadTripCashJournal(tripId);
    } catch (err: any) {
      fail(err);
    }
  }

  // Consultation de l'historique et des archives des caisses
  async function loadArchives() {
    try {
      const rows = await api<any[]>("/desk/cash-journals", { realm: "agency" });
      setJournalArchives(rows);
      setActiveJournalTab("archives");
    } catch (err: any) {
      fail(err);
    }
  }

  async function handleDeleteArchive(id: number) {
    if (!confirm("Voulez-vous supprimer définitivement cet enregistrement de caisse ?")) return;
    try {
      await api(`/desk/cash-journals/${id}`, { method: "DELETE", realm: "agency" });
      setMessage("✓ Enregistrement de caisse supprimé.");
      loadArchives();
    } catch (err: any) {
      fail(err);
    }
  }

  // Encaissement en espèces & vente directe
  async function handleSellWalkIn(e: FormEvent) {
    e.preventDefault();
    if (!tripId || !walkIn.seat_id || !walkIn.passenger_name.trim()) return;
    setError("");
    setMessage("");

    try {
      const res = await api<{ reference: string; seat_no: number; payment_method: string; linked_user_id?: number | null }>(
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
          agency_name: agencySession?.agency.name,
          veltron_account: walkIn.passenger_account || undefined,
        });
      }

      setMessage(`✓ Billet émis avec succès pour ${walkIn.passenger_name} sur le siège #${res.seat_no} !${res.linked_user_id ? " Billet partagé sur son compte Veltron." : ""}`);
      
      // Réinitialiser le formulaire
      setWalkIn({
        passenger_name: "",
        passenger_account: "",
        email: "",
        seat_id: 0,
        id_type: "CNI",
        id_number: "",
        phone: "",
        payment_method: "cash",
        luggage_weight_kg: "",
      });
      setCashTendered("");

      // Rafraîchir les places en temps réel et le journal du départ
      await loadManifest(tripId);
      loadTripCashJournal(tripId);
      loadTrips();
    } catch (err: any) {
      if (err instanceof ApiError && err.code === "conflict") {
        setError("⚠️ Ce numéro de téléphone ou cette adresse e-mail a déjà été utilisé(e) sur un autre compte.");
      } else {
        fail(err);
      }
    }
  }

  async function loadCashJournal() {
    setError("");
    try {
      const res = await api<any>("/desk/cash-journal", { realm: "agency" });
      setCashJournal(res);
      setActiveJournalTab("daily");
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

            {/* ==================== VUE 2 : PLAN D'AUTOCAR RÉALISTE AVEC COCKPIT & SIÈGES DÉTAILLÉS ==================== */}
            {viewMode === "bus" && (
              <div
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "20px",
                  padding: "16px",
                  maxWidth: 720,
                  margin: "10px auto",
                  boxShadow: "0 10px 30px rgba(0, 0, 0, 0.1)",
                }}
              >
                <div style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span className="badge" style={{ background: "rgba(16, 185, 129, 0.15)", color: "#10b981", border: "1px solid rgba(16, 185, 129, 0.3)" }}>
                    🚌 Vue Réaliste de l'Autocar & Cockpit
                  </span>
                  <span className="muted" style={{ fontSize: "0.82rem" }}>
                    Cliquez sur une place libre pour demander la préférence au voyageur
                  </span>
                </div>

                <SeatGrid
                  seats={seatGridSeats}
                  seatsPerRow={[2, 2]}
                  showCockpit={true}
                  busPlate={current.plate}
                  busLabel={current.plate}
                  interactive={true}
                  selectedSeatIds={walkIn.seat_id ? [walkIn.seat_id] : []}
                  onSelect={(seat: GridSeat) => {
                    if (!seat.taken && !seat.disabled) {
                      setWalkIn((prev) => ({ ...prev, seat_id: seat.id }));
                      document.getElementById("desk-cash-panel")?.scrollIntoView({ behavior: "smooth" });
                    }
                  }}
                />
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
                  <label htmlFor="walkin-email">Adresse Email</label>
                  <input
                    id="walkin-email"
                    type="email"
                    className="desk-form-input"
                    placeholder="client@domaine.com"
                    value={walkIn.email}
                    onChange={(e) => setWalkIn({ ...walkIn, email: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 10 }}>
                <div className="desk-form-field">
                  <label htmlFor="walkin-account">
                    🔗 Compte Veltron du passager <span className="muted" style={{ fontWeight: 400 }}>(partage direct du billet)</span>
                  </label>
                  <input
                    id="walkin-account"
                    className="desk-form-input"
                    placeholder="Ex: @nathan ou email du compte"
                    value={walkIn.passenger_account}
                    onChange={(e) => setWalkIn({ ...walkIn, passenger_account: e.target.value })}
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
                id="desk-printable-ticket"
                style={{
                  background: "#ffffff",
                  color: "#0f172a",
                  border: "2px solid #cbd5e1",
                  borderRadius: 16,
                  padding: 20,
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
                }}
              >
                {/* En-tête officiel agence */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "2px dashed #e2e8f0", paddingBottom: 12 }}>
                  <div>
                    <span style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "#64748b", fontWeight: 700 }}>
                      Billet de Transport Officiel
                    </span>
                    <h4 style={{ margin: "2px 0 0", fontSize: "1.25rem", color: "#0f172a", fontWeight: 800 }}>
                      {issuedReceipt.agency_name || "COMPAGNIE DE TRANSPORT"}
                    </h4>
                    <span className="mono" style={{ fontSize: "0.85rem", color: "#64748b" }}>
                      Immatriculation bus : <strong>{issuedReceipt.plate || "Standard"}</strong>
                    </span>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span className="mono" style={{ fontSize: "1.1rem", fontWeight: 800, color: "#2563eb", display: "block" }}>
                      {issuedReceipt.reference}
                    </span>
                    <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                      {formatTime(issuedReceipt.departs_at, tz, i18n.language)} · {formatDay(issuedReceipt.departs_at, tz, i18n.language)}
                    </span>
                  </div>
                </div>

                {/* Corps avec QR Code et détails */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 16, alignItems: "center" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: "0.95rem" }}>
                    <div>
                      <span style={{ fontSize: "0.78rem", color: "#64748b", display: "block" }}>Passager</span>
                      <strong style={{ fontSize: "1.15rem", color: "#0f172a" }}>{issuedReceipt.passenger_name}</strong>
                      {issuedReceipt.veltron_account && (
                        <span style={{ display: "block", fontSize: "0.8rem", color: "#2563eb" }}>
                          Compte Veltron : @{issuedReceipt.veltron_account}
                        </span>
                      )}
                    </div>

                    <div>
                      <span style={{ fontSize: "0.78rem", color: "#64748b", display: "block" }}>Trajet Direct</span>
                      <strong style={{ fontSize: "1.05rem", color: "#0f172a" }}>
                        {issuedReceipt.origin} ➔ {issuedReceipt.destination}
                      </strong>
                    </div>

                    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                      <div>
                        <span style={{ fontSize: "0.78rem", color: "#64748b", display: "block" }}>Place réservée</span>
                        <span style={{ background: "#059669", color: "#ffffff", padding: "4px 10px", borderRadius: 8, fontWeight: 800, fontSize: "1rem" }}>
                          Siège #{issuedReceipt.seat_no}
                        </span>
                      </div>
                      <div>
                        <span style={{ fontSize: "0.78rem", color: "#64748b", display: "block" }}>Tarif payé</span>
                        <strong className="mono" style={{ fontSize: "1.1rem", color: "#059669" }}>
                          {formatMoney(issuedReceipt.amount, issuedReceipt.currency_code, minor, i18n.language)}
                        </strong>
                      </div>
                    </div>
                  </div>

                  {/* QR Code de validation bord */}
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, background: "#f8fafc", padding: 10, borderRadius: 12, border: "1px solid #e2e8f0" }}>
                    <QRCodeSVG
                      value={`VLT:${issuedReceipt.reference}:${issuedReceipt.seat_no}`}
                      size={110}
                      bgColor="#ffffff"
                      fgColor="#0f172a"
                      level="H"
                    />
                    <span className="mono" style={{ fontSize: "0.7rem", color: "#64748b" }}>
                      SCAN EMBARQUEMENT
                    </span>
                  </div>
                </div>

                {/* Sceau d'approbation officiel de l'agence */}
                <div
                  style={{
                    border: "2px solid #059669",
                    borderRadius: 10,
                    padding: "8px 14px",
                    background: "rgba(5, 150, 105, 0.06)",
                    color: "#065f46",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginTop: 4,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: "1.3rem" }}>🛡️</span>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: "0.85rem", letterSpacing: "0.04em" }}>
                        APPROUVÉ PAR L'AGENCE · VISA GUICHET OFFICIEL
                      </div>
                      <div style={{ fontSize: "0.74rem", color: "#047857" }}>
                        Paiement certifié ({issuedReceipt.payment_method.toUpperCase()}) · Système Veltron Sécurisé
                      </div>
                    </div>
                  </div>
                  <div className="mono" style={{ fontSize: "0.78rem", fontWeight: 700, color: "#065f46" }}>
                    AUTHENTIFIÉ
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                <button
                  type="button"
                  className="btn btn--outline"
                  style={{ flex: 1, fontSize: "1rem" }}
                  onClick={() => window.print()}
                >
                  🖨️ Imprimer Reçu Nette
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

      {/* ==================== 4. JOURNAL DE CAISSE DU GUICHET & CONTRÔLE ANTI-FRAUDE ==================== */}
      <section className="card" style={{ marginTop: 14, padding: "20px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 14, borderBottom: "1px solid var(--border)", paddingBottom: 14 }}>
          <div>
            <h4 style={{ margin: 0, fontSize: "1.2rem", display: "flex", alignItems: "center", gap: 8 }}>
              <span>💼</span> Journal de Caisse & Traçabilité Financière Anti-Fraude
            </h4>
            <span className="muted" style={{ fontSize: "0.88rem" }}>
              Suivi et clôture hermétique de chaque départ, archivage DB mémorisé et auditable.
            </span>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className={`btn btn--sm ${activeJournalTab === "trip" ? "" : "btn--outline"}`}
              onClick={() => setActiveJournalTab("trip")}
              style={{ fontWeight: 700 }}
            >
              📦 Départ Sélectionné
            </button>
            <button
              type="button"
              className={`btn btn--sm ${activeJournalTab === "archives" ? "" : "btn--outline"}`}
              onClick={() => {
                setActiveJournalTab("archives");
                loadArchives();
              }}
              style={{ fontWeight: 700 }}
            >
              🗄️ Archives & Historique Départs
            </button>
            <button
              type="button"
              className={`btn btn--sm ${activeJournalTab === "daily" ? "" : "btn--outline"}`}
              onClick={() => {
                setActiveJournalTab("daily");
                loadCashJournal();
              }}
              style={{ fontWeight: 700 }}
            >
              📊 Caisse Quotidienne
            </button>
          </div>
        </div>

        {/* ONGLET 1 : DÉPART SÉLECTIONNÉ */}
        {activeJournalTab === "trip" && current && (
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
              <div>
                <strong style={{ fontSize: "1.05rem" }}>
                  Trajet : {current.origin} ➔ {current.destination} ({formatTime(current.departs_at, tz, i18n.language)})
                </strong>
                <span className="muted" style={{ display: "block", fontSize: "0.85rem" }}>
                  Bus : {current.plate} · Départ #{current.id}
                </span>
              </div>

              {tripJournal?.is_closed ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="badge" style={{ background: "rgba(16, 185, 129, 0.15)", color: "#10b981", border: "1px solid #10b981", fontSize: "0.9rem", padding: "6px 12px" }}>
                    🔒 Caisse Clôturée & Scellée
                  </span>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="badge" style={{ background: "rgba(245, 158, 11, 0.15)", color: "#f59e0b", border: "1px solid #f59e0b", fontSize: "0.9rem", padding: "6px 12px" }}>
                    🟢 Caisse Ouverte (Ventes en cours)
                  </span>
                  <button
                    type="button"
                    className="btn btn--sm"
                    style={{ background: "#dc2626", color: "#ffffff", fontWeight: 700 }}
                    onClick={() => {
                      setCountedCash(String(tripJournal?.sales?.cash_amount ?? ""));
                      setShowCloseModal(true);
                    }}
                  >
                    🔒 Clôturer la Caisse de ce Départ
                  </button>
                </div>
              )}
            </div>

            {/* Chiffres clés du départ */}
            {tripJournal?.sales && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
                <div className="card" style={{ padding: 14, background: "rgba(16, 185, 129, 0.1)", borderColor: "#10b981" }}>
                  <span className="muted" style={{ fontSize: "0.82rem", display: "block" }}>💵 Espèces Théoriques Guichet</span>
                  <strong style={{ fontSize: "1.3rem", color: "#059669" }}>
                    {formatMoney(tripJournal.sales.cash_amount, manifest?.currency_code || "XAF", minor, i18n.language)}
                  </strong>
                </div>

                <div className="card" style={{ padding: 14, background: "rgba(245, 158, 11, 0.1)", borderColor: "#f59e0b" }}>
                  <span className="muted" style={{ fontSize: "0.82rem", display: "block" }}>📱 Mobile Money</span>
                  <strong style={{ fontSize: "1.3rem", color: "#d97706" }}>
                    {formatMoney(tripJournal.sales.momo_amount, manifest?.currency_code || "XAF", minor, i18n.language)}
                  </strong>
                </div>

                <div className="card" style={{ padding: 14, background: "rgba(59, 130, 246, 0.1)", borderColor: "#3b82f6" }}>
                  <span className="muted" style={{ fontSize: "0.82rem", display: "block" }}>💳 Carte Bancaire</span>
                  <strong style={{ fontSize: "1.3rem", color: "#2563eb" }}>
                    {formatMoney(tripJournal.sales.card_amount, manifest?.currency_code || "XAF", minor, i18n.language)}
                  </strong>
                </div>

                <div className="card" style={{ padding: 14, background: "rgba(140, 107, 184, 0.15)", borderColor: "var(--accent)" }}>
                  <span className="muted" style={{ fontSize: "0.82rem", display: "block" }}>
                    🏷️ Recette Totale Départ ({tripJournal.sales.total_tickets} billets)
                  </span>
                  <strong style={{ fontSize: "1.3rem", color: "var(--accent)" }}>
                    {formatMoney(tripJournal.sales.total_amount, manifest?.currency_code || "XAF", minor, i18n.language)}
                  </strong>
                </div>
              </div>
            )}

            {/* Détails de clôture certifiée */}
            {tripJournal?.is_closed && tripJournal.journal && (
              <div
                style={{
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: 16,
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                  <div>
                    <span className="muted" style={{ fontSize: "0.85rem" }}>Clôturé par : </span>
                    <strong>{tripJournal.journal.closed_by_name || "Secrétaire guichet"}</strong>
                    <span className="muted" style={{ fontSize: "0.85rem", marginLeft: 10 }}>
                      le {new Date(tripJournal.journal.closed_at).toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="muted" style={{ fontSize: "0.85rem" }}>Écart physique de caisse : </span>
                    <strong
                      className="mono"
                      style={{
                        color: Number(tripJournal.journal.cash_difference) === 0 ? "#10b981" : "#ef4444",
                        fontSize: "1.05rem",
                      }}
                    >
                      {Number(tripJournal.journal.cash_difference) >= 0 ? "+" : ""}
                      {formatMoney(Number(tripJournal.journal.cash_difference), manifest?.currency_code || "XAF", minor, i18n.language)}
                    </strong>
                  </div>
                </div>

                {tripJournal.journal.notes && (
                  <div style={{ fontSize: "0.88rem", background: "rgba(0,0,0,0.03)", padding: 8, borderRadius: 6 }}>
                    <strong>Note de clôture :</strong> {tripJournal.journal.notes}
                  </div>
                )}

                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.78rem" }}>
                  <span className="muted">Sceau Anti-Fraude SHA-256 :</span>
                  <span className="badge mono" style={{ fontSize: "0.74rem", background: "var(--surface)", color: "var(--text)" }}>
                    {tripJournal.journal.audit_hash}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ONGLET 2 : ARCHIVES & HISTORIQUE DES CAISSES (CONSULTABLE DES MOIS APRÈS) */}
        {activeJournalTab === "archives" && (
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="muted" style={{ fontSize: "0.92rem" }}>
                Historique permanent des caisses de départ clôturées et certifiées dans la base de données.
              </span>
              <button type="button" className="btn btn--outline btn--sm" onClick={loadArchives}>
                🔄 Rafraîchir
              </button>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table className="table" style={{ width: "100%", fontSize: "0.9rem" }}>
                <thead>
                  <tr>
                    <th>Date & Heure</th>
                    <th>Départ</th>
                    <th>Billets</th>
                    <th>Espèces</th>
                    <th>MoMo</th>
                    <th>Total Départ</th>
                    <th>Écart Caisse</th>
                    <th>Clôturé par</th>
                    <th>Audit Sceau</th>
                    {["owner", "manager"].includes(agencySession?.role || "") && <th>Action</th>}
                  </tr>
                </thead>
                <tbody>
                  {journalArchives.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="muted" style={{ textAlign: "center", padding: 24 }}>
                        Aucun journal de caisse archivé pour le moment. Clôturez un départ pour le voir apparaître ici.
                      </td>
                    </tr>
                  ) : (
                    journalArchives.map((j) => (
                      <tr key={j.id}>
                        <td className="muted" style={{ whiteSpace: "nowrap" }}>
                          {new Date(j.closed_at).toLocaleDateString()} {new Date(j.closed_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </td>
                        <td>
                          <strong>{j.origin} ➔ {j.destination}</strong>
                          <div className="muted" style={{ fontSize: "0.78rem" }}>Départ #{j.trip_id}</div>
                        </td>
                        <td className="mono">{j.total_tickets}</td>
                        <td className="mono" style={{ color: "#059669", fontWeight: 700 }}>
                          {formatMoney(j.cash_amount, manifest?.currency_code || "XAF", minor, i18n.language)}
                        </td>
                        <td className="mono" style={{ color: "#d97706" }}>
                          {formatMoney(j.momo_amount, manifest?.currency_code || "XAF", minor, i18n.language)}
                        </td>
                        <td className="mono" style={{ fontWeight: 800 }}>
                          {formatMoney(j.total_amount, manifest?.currency_code || "XAF", minor, i18n.language)}
                        </td>
                        <td>
                          <span
                            className="badge mono"
                            style={{
                              background: Number(j.cash_difference) === 0 ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
                              color: Number(j.cash_difference) === 0 ? "#10b981" : "#ef4444",
                            }}
                          >
                            {Number(j.cash_difference) >= 0 ? "+" : ""}{j.cash_difference}
                          </span>
                        </td>
                        <td>{j.closed_by_name || "Secrétaire"}</td>
                        <td>
                          <span className="badge mono" style={{ fontSize: "0.7rem", maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis" }} title={j.audit_hash}>
                            {j.audit_hash ? j.audit_hash.slice(0, 10) + "..." : "—"}
                          </span>
                        </td>
                        {["owner", "manager"].includes(agencySession?.role || "") && (
                          <td>
                            <button
                              type="button"
                              className="btn btn--danger btn--sm"
                              style={{ padding: "3px 8px", fontSize: "0.8rem" }}
                              onClick={() => handleDeleteArchive(j.id)}
                            >
                              🗑️ Supprimer
                            </button>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ONGLET 3 : CAISSE QUOTIDIENNE GÉNÉRALE */}
        {activeJournalTab === "daily" && (
          <div style={{ marginTop: 16 }}>
            {cashJournal ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
                  <div className="card" style={{ padding: 14, background: "rgba(16, 185, 129, 0.1)", borderColor: "#10b981" }}>
                    <span className="muted" style={{ fontSize: "0.85rem", display: "block" }}>💵 Espèces Guichet 24h</span>
                    <strong style={{ fontSize: "1.25rem", color: "#059669" }}>
                      {formatMoney(cashJournal.summary.total_cash, cashJournal.currency_code, minor, i18n.language)}
                    </strong>
                  </div>
                  <div className="card" style={{ padding: 14, background: "rgba(245, 158, 11, 0.1)", borderColor: "#f59e0b" }}>
                    <span className="muted" style={{ fontSize: "0.85rem", display: "block" }}>📱 Mobile Money</span>
                    <strong style={{ fontSize: "1.25rem", color: "#d97706" }}>
                      {formatMoney(cashJournal.summary.total_momo, cashJournal.currency_code, minor, i18n.language)}
                    </strong>
                  </div>
                  <div className="card" style={{ padding: 14, background: "rgba(59, 130, 246, 0.1)", borderColor: "#3b82f6" }}>
                    <span className="muted" style={{ fontSize: "0.85rem", display: "block" }}>💳 Carte Bancaire</span>
                    <strong style={{ fontSize: "1.25rem", color: "#2563eb" }}>
                      {formatMoney(cashJournal.summary.total_card, cashJournal.currency_code, minor, i18n.language)}
                    </strong>
                  </div>
                  <div className="card" style={{ padding: 14, background: "rgba(140, 107, 184, 0.15)", borderColor: "var(--accent)" }}>
                    <span className="muted" style={{ fontSize: "0.85rem", display: "block" }}>
                      🏷️ Total Ventes ({cashJournal.summary.total_sales_count})
                    </span>
                    <strong style={{ fontSize: "1.25rem", color: "var(--accent)" }}>
                      {formatMoney(cashJournal.summary.total_amount, cashJournal.currency_code, minor, i18n.language)}
                    </strong>
                  </div>
                </div>

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
                            <td><strong>{sl.passenger_name || "Client guichet"}</strong></td>
                            <td><span className="badge mono">#{sl.seat_no ?? "—"}</span></td>
                            <td>{sl.origin && sl.destination ? `${sl.origin} ➔ ${sl.destination}` : "—"}</td>
                            <td>
                              <span className="badge" style={{ fontSize: "0.8rem" }}>
                                {sl.provider === "cash" ? "💵 Espèces" : sl.provider === "card" ? "💳 Carte" : `📱 ${sl.provider}`}
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
            ) : (
              <div style={{ textAlign: "center", padding: 20 }}>
                <button type="button" className="btn btn--outline" onClick={loadCashJournal}>
                  Charger le rapport général de la journée
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* MODAL DE CLÔTURE DE CAISSE DE DÉPART */}
      <AnimatePresence>
        {showCloseModal && tripJournal && (
          <div className="desk-receipt-overlay" onClick={() => setShowCloseModal(false)}>
            <motion.div
              className="card"
              style={{ maxWidth: 520, width: "90%", padding: 24, background: "var(--surface)" }}
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 style={{ margin: "0 0 10px", fontSize: "1.3rem", display: "flex", alignItems: "center", gap: 8 }}>
                <span>🔒</span> Clôture Certifiée de la Caisse Départ
              </h3>
              <p className="muted" style={{ fontSize: "0.92rem", margin: "0 0 16px" }}>
                Cette opération scelle les comptes de ce départ dans la base de données avec un hash cryptographique SHA-256 de traçabilité anti-fraude.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ background: "rgba(16, 185, 129, 0.1)", border: "1px solid #10b981", borderRadius: 10, padding: 14 }}>
                  <span className="muted" style={{ fontSize: "0.85rem" }}>Recette Théorique en Espèces :</span>
                  <div className="mono" style={{ fontSize: "1.5rem", fontWeight: 800, color: "#059669" }}>
                    {formatMoney(tripJournal.sales.cash_amount, manifest?.currency_code || "XAF", minor, i18n.language)}
                  </div>
                </div>

                <div className="desk-form-field">
                  <label htmlFor="modal-cash-counted" style={{ fontWeight: 700 }}>
                    💵 Montant physique compté dans la caisse *
                  </label>
                  <input
                    id="modal-cash-counted"
                    type="number"
                    min={0}
                    step={100}
                    className="desk-form-input"
                    value={countedCash}
                    onChange={(e) => setCountedCash(e.target.value)}
                    placeholder="Montant physique en espèces..."
                    required
                  />
                </div>

                {countedCash !== "" && (
                  <div
                    style={{
                      background: Number(countedCash) === Number(tripJournal.sales.cash_amount) ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)",
                      border: `1px solid ${Number(countedCash) === Number(tripJournal.sales.cash_amount) ? "#10b981" : "#ef4444"}`,
                      borderRadius: 8,
                      padding: "10px 14px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span>Écart de caisse :</span>
                    <strong
                      className="mono"
                      style={{
                        fontSize: "1.1rem",
                        color: Number(countedCash) === Number(tripJournal.sales.cash_amount) ? "#10b981" : "#ef4444",
                      }}
                    >
                      {Number(countedCash) - Number(tripJournal.sales.cash_amount) >= 0 ? "+" : ""}
                      {formatMoney(Number(countedCash) - Number(tripJournal.sales.cash_amount), manifest?.currency_code || "XAF", minor, i18n.language)}
                      {Number(countedCash) === Number(tripJournal.sales.cash_amount) ? " (Caisse Juste ✓)" : " (Écart détecté)"}
                    </strong>
                  </div>
                )}

                <div className="desk-form-field">
                  <label htmlFor="modal-close-notes">Observations / Justifications éventuelles</label>
                  <textarea
                    id="modal-close-notes"
                    className="desk-form-input"
                    rows={2}
                    value={closeNotes}
                    onChange={(e) => setCloseNotes(e.target.value)}
                    placeholder="Ex: RAS ou 1 billet déchiré refusé..."
                  />
                </div>

                <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                  <button
                    type="button"
                    className="btn btn--outline"
                    style={{ flex: 1 }}
                    onClick={() => setShowCloseModal(false)}
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    className="btn"
                    style={{ flex: 1.5, background: "#dc2626", color: "#ffffff", fontWeight: 700 }}
                    onClick={handleCloseTripJournal}
                  >
                    🛡️ Sceller et Clôturer
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
