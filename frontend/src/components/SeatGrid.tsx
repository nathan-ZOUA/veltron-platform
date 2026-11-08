import { useMemo } from "react";

export interface GridSeat {
  id: number;
  seat_no: number;
  row_no: number;
  col_no: number;
  seat_class?: "standard" | "vip" | string;
  disabled?: boolean;
  taken?: boolean;
  selected?: boolean;
  title?: string;
  className?: string;
  passenger_name?: string;
  price?: number;
}

interface Props {
  seats: GridSeat[];
  seatsPerRow?: number[]; // ex: [2, 2] ou [2, 3] ou [1, 2]
  onSelect?: (seat: GridSeat) => void;
  showCockpit?: boolean;
  busLabel?: string;
  busPlate?: string;
  busType?: string;
  coDriverCount?: number; // 1 ou 2 co-chauffeurs (défaut 2)
  interactive?: boolean;
  selectedSeatIds?: number[];
  currencySymbol?: string;
}

export default function SeatGrid({
  seats,
  seatsPerRow = [2, 2],
  onSelect,
  showCockpit = true,
  busLabel,
  busPlate,
  busType = "Autocar Grand Tourisme",
  coDriverCount = 2,
  interactive = true,
  selectedSeatIds = [],
  currencySymbol = "FCFA",
}: Props) {
  const left = seatsPerRow[0] ?? 2;
  const right = seatsPerRow[1] ?? 2;

  // Regroupement des sièges par rangée
  const rowsMap = useMemo(() => {
    const map = new Map<number, GridSeat[]>();
    seats.forEach((s) => {
      const existing = map.get(s.row_no) ?? [];
      existing.push(s);
      map.set(s.row_no, existing);
    });
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [seats]);

  const totalSeatsCount = seats.length;
  const takenSeatsCount = seats.filter((s) => s.taken).length;
  const freeSeatsCount = totalSeatsCount - takenSeatsCount;

  return (
    <div className="realistic-bus-wrapper">
      {/* En-tête informatif du véhicule */}
      {(busLabel || busPlate) && (
        <div className="realistic-bus-info-header">
          <div className="realistic-bus-info-title">
            <span className="bus-badge-dot" />
            <strong>{busLabel || "Autocar Interurbain"}</strong>
            {busPlate && <span className="badge mono">{busPlate}</span>}
            <span className="badge">{busType}</span>
          </div>
          <div className="realistic-bus-info-stats">
            <span className="badge badge--ok">{freeSeatsCount} places libres</span>
            <span className="badge">{totalSeatsCount} places ({left}+{right})</span>
            {currencySymbol && <span className="badge mono">{currencySymbol}</span>}
          </div>
        </div>
      )}

      {/* Carrosserie extérieure de l'autocar */}
      <div className="realistic-bus-body">
        {/* Rétroviseurs extérieurs gauche et droite */}
        <div className="bus-mirror bus-mirror--left" title="Rétroviseur gauche" />
        <div className="bus-mirror bus-mirror--right" title="Rétroviseur droit" />

        {/* Pare-brise avant arrondi aérodynamique */}
        <div className="bus-front-cap">
          <div className="bus-headlights">
            <span className="headlight headlight--left" />
            <div className="bus-brand-plate">
              <span>VELTRON ROYAL BUS</span>
            </div>
            <span className="headlight headlight--right" />
          </div>

          <div className="bus-windshield">
            <div className="windshield-glare" />
            <div className="windshield-wipers">
              <span className="wiper wiper--left" />
              <span className="wiper wiper--right" />
            </div>
            <span className="windshield-label">▲ AVANT DU VÉHICULE · DIRECTION DU TRAJET ▲</span>
          </div>
        </div>

        {/* COCKPIT DE CONDUITE : Chauffeur Principal & Sièges Co-Chauffeurs */}
        {showCockpit && (
          <div className="bus-cockpit-zone">
            {/* Côté Gauche : Siège Chauffeur & Volant */}
            <div className="cockpit-driver-section" style={{ gridColumn: `span ${left}` }}>
              <div className="driver-cabin-box">
                <div className="steering-wheel-container" title="Volant de direction">
                  <svg className="steering-wheel-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                    <circle cx="12" cy="12" r="9" />
                    <circle cx="12" cy="12" r="3" />
                    <line x1="12" y1="3" x2="12" y2="9" />
                    <line x1="3.5" y1="14" x2="9.5" y2="13" />
                    <line x1="20.5" y1="14" x2="14.5" y2="13" />
                  </svg>
                  <span className="steering-label">Poste Chauffeur</span>
                </div>

                <div className="crew-seat crew-seat--driver" title="Siège Conducteur Principal (Réservé équipage)">
                  <div className="seat-headrest" />
                  <div className="seat-cushion">
                    <span className="crew-icon">🧑‍✈️</span>
                    <span className="crew-name">Conducteur</span>
                  </div>
                  <div className="seat-base" />
                </div>
              </div>
            </div>

            {/* Allée de passage centrale dans le cockpit */}
            <div className="bus-aisle-channel bus-aisle-channel--cockpit">
              <span className="aisle-arrow">▲</span>
            </div>

            {/* Côté Droit : Porte d'accès & Sièges Co-Chauffeur(s) */}
            <div className="cockpit-crew-section" style={{ gridColumn: `span ${right}` }}>
              {/* Porte avant des passagers */}
              <div className="bus-entry-door" title="Porte avant d'embarquement">
                <div className="door-steps">
                  <span className="step-bar" />
                  <span className="step-bar" />
                </div>
                <div className="door-label">
                  <span>🚪</span>
                  <span>Montée</span>
                </div>
              </div>

              {/* Siège(s) Co-Chauffeur / Convoyeur */}
              <div className="co-drivers-group">
                <div
                  className="crew-seat crew-seat--codriver"
                  title="Siège Co-Chauffeur Principal (Réservé équipage)"
                >
                  <div className="seat-headrest" />
                  <div className="seat-cushion">
                    <span className="crew-icon">👮</span>
                    <span className="crew-name">Co-Chauffeur</span>
                  </div>
                  <div className="seat-base" />
                </div>

                {coDriverCount >= 2 && (
                  <div
                    className="crew-seat crew-seat--codriver"
                    title="Siège Convoyeur / Hôte de bord (Réservé équipage)"
                  >
                    <div className="seat-headrest" />
                    <div className="seat-cushion">
                      <span className="crew-icon">🧳</span>
                      <span className="crew-name">Convoyeur</span>
                    </div>
                    <div className="seat-base" />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Démarcation sécurisée entre la cabine avant et l'espace passagers */}
        <div className="cabin-divider">
          <span className="divider-line" />
          <span className="divider-badge">SALON VOYAGEURS · ALLÉE DE PASSAGE 2+{right}</span>
          <span className="divider-line" />
        </div>

        {/* GRILLE DÉTAILLÉE DES RANGÉES AVEC ALLÉE CENTRALE RÉALISTE */}
        <div className="bus-passenger-cabin">
          {rowsMap.map(([rowNo, rowSeats]) => {
            const isVipRow = rowSeats.some((s) => s.seat_class === "vip");

            return (
              <div key={rowNo} className={`bus-row-container ${isVipRow ? "bus-row-container--vip" : ""}`}>
                {/* Numéro de rangée discret sur le côté gauche */}
                <span className="row-number-indicator" title={`Rangée ${rowNo}`}>
                  R{rowNo}
                </span>

                {/* Sièges Côté Gauche (1 à 3 sièges) */}
                <div
                  className="seats-block seats-block--left"
                  style={{ gridTemplateColumns: `repeat(${left}, 1fr)` }}
                >
                  {Array.from({ length: left }).map((_, colIdx) => {
                    const colNo = colIdx + 1;
                    const seat = rowSeats.find((s) => s.col_no === colNo);

                    if (!seat) {
                      return <div key={`empty-l-${rowNo}-${colNo}`} className="seat-placeholder" />;
                    }

                    const isTaken = Boolean(seat.taken);
                    const isSelected = Boolean(
                      seat.selected || selectedSeatIds.includes(seat.id) || seat.className?.includes("seat--selected")
                    );
                    const isVip = seat.seat_class === "vip";
                    const isWindow = colNo === 1;

                    return (
                      <button
                        key={seat.id}
                        type="button"
                        disabled={!interactive || isTaken || seat.disabled}
                        onClick={() => interactive && !isTaken && onSelect?.(seat)}
                        title={
                          seat.title ||
                          `Siège #${seat.seat_no} · Rangée ${rowNo} · ${isWindow ? "Fenêtre Gauche 🪟" : "Couloir Gauche 🚶"} · ${
                            isVip ? "Classe VIP" : "Standard"
                          } · ${isTaken ? "Occupé" : isSelected ? "Sélectionné" : "Libre"}`
                        }
                        className={`realistic-seat ${
                          isTaken
                            ? "is-taken"
                            : isSelected
                            ? "is-selected"
                            : isVip
                            ? "is-vip"
                            : "is-available"
                        }`}
                      >
                        {/* Dossier & Appuie-tête profilé */}
                        <div className="seat-armrest seat-armrest--left" />
                        <div className="seat-inner-structure">
                          <div className="seat-headrest-pad">
                            {isVip && <span className="vip-crown">★</span>}
                          </div>
                          <div className="seat-backrest">
                            <span className="seat-num mono">#{seat.seat_no}</span>
                            <span className="seat-pos-tag">{isWindow ? "FEN" : "COUL"}</span>
                          </div>
                          <div className="seat-cushion-pad" />
                        </div>
                        <div className="seat-armrest seat-armrest--right" />

                        {/* Badge statut */}
                        {isTaken && <span className="seat-lock-icon">🔒</span>}
                        {isSelected && <span className="seat-check-icon">✓</span>}
                      </button>
                    );
                  })}
                </div>

                {/* ALLÉE CENTRALE DE CIRCULATION (« LA ROUTE DE PASSAGE DANS LE BUS ») */}
                <div className="bus-central-aisle" title="Allée centrale de circulation">
                  <div className="aisle-track-pattern">
                    <span className="aisle-footstep" />
                    <span className="aisle-direction-arrow">▲</span>
                    <span className="aisle-footstep" />
                  </div>
                </div>

                {/* Sièges Côté Droit (1 à 3 sièges) */}
                <div
                  className="seats-block seats-block--right"
                  style={{ gridTemplateColumns: `repeat(${right}, 1fr)` }}
                >
                  {Array.from({ length: right }).map((_, colIdx) => {
                    const colNo = left + colIdx + 1;
                    const seat = rowSeats.find((s) => s.col_no === colNo);

                    if (!seat) {
                      return <div key={`empty-r-${rowNo}-${colNo}`} className="seat-placeholder" />;
                    }

                    const isTaken = Boolean(seat.taken);
                    const isSelected = Boolean(
                      seat.selected || selectedSeatIds.includes(seat.id) || seat.className?.includes("seat--selected")
                    );
                    const isVip = seat.seat_class === "vip";
                    const isWindow = colIdx === right - 1;

                    return (
                      <button
                        key={seat.id}
                        type="button"
                        disabled={!interactive || isTaken || seat.disabled}
                        onClick={() => interactive && !isTaken && onSelect?.(seat)}
                        title={
                          seat.title ||
                          `Siège #${seat.seat_no} · Rangée ${rowNo} · ${isWindow ? "Fenêtre Droite 🪟" : "Couloir Droit 🚶"} · ${
                            isVip ? "Classe VIP" : "Standard"
                          } · ${isTaken ? "Occupé" : isSelected ? "Sélectionné" : "Libre"}`
                        }
                        className={`realistic-seat ${
                          isTaken
                            ? "is-taken"
                            : isSelected
                            ? "is-selected"
                            : isVip
                            ? "is-vip"
                            : "is-available"
                        }`}
                      >
                        <div className="seat-armrest seat-armrest--left" />
                        <div className="seat-inner-structure">
                          <div className="seat-headrest-pad">
                            {isVip && <span className="vip-crown">★</span>}
                          </div>
                          <div className="seat-backrest">
                            <span className="seat-num mono">#{seat.seat_no}</span>
                            <span className="seat-pos-tag">{isWindow ? "FEN" : "COUL"}</span>
                          </div>
                          <div className="seat-cushion-pad" />
                        </div>
                        <div className="seat-armrest seat-armrest--right" />

                        {isTaken && <span className="seat-lock-icon">🔒</span>}
                        {isSelected && <span className="seat-check-icon">✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* ARRIÈRE DE L'AUTOCAR : Issue de secours & Banquette de fond */}
        <div className="bus-rear-cap">
          <div className="bus-rear-emergency">
            <span className="rear-door-icon">🚪</span>
            <span>ISSUE DE SECOURS ARRIÈRE</span>
          </div>

          <div className="bus-taillights">
            <span className="taillight taillight--left" />
            <div className="bus-rear-bumper">
              <span>{busPlate || "VELTRON INTERCITY"}</span>
            </div>
            <span className="taillight taillight--right" />
          </div>
        </div>
      </div>

      {/* LÉGENDE INTERACTIVE DES SIÈGES & CODES COULEURS */}
      <div className="realistic-bus-legend">
        <div className="legend-item">
          <span className="legend-chip legend-chip--available" />
          <span>Libre / Disponible</span>
        </div>
        <div className="legend-item">
          <span className="legend-chip legend-chip--selected" />
          <span>Votre sélection</span>
        </div>
        <div className="legend-item">
          <span className="legend-chip legend-chip--vip" />
          <span>Siège VIP</span>
        </div>
        <div className="legend-item">
          <span className="legend-chip legend-chip--taken" />
          <span>Réservé / Occupé</span>
        </div>
        <div className="legend-item">
          <span className="legend-chip legend-chip--driver" />
          <span>Chauffeur & Équipage</span>
        </div>
      </div>
    </div>
  );
}
