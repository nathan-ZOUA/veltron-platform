// Plan de sièges réaliste et spacieux pour autocar (réservation, guichet, embarquement)

export interface GridSeat {
  id: number;
  seat_no: number;
  row_no: number;
  col_no: number;
  className?: string;
  disabled?: boolean;
  title?: string;
}

interface Props {
  seats: GridSeat[];
  seatsPerRow: number[]; // ex. [2, 3] ou [2, 2]
  onSelect?: (seat: GridSeat) => void;
  showCockpit?: boolean;
}

export default function SeatGrid({ seats, seatsPerRow, onSelect, showCockpit = true }: Props) {
  const left = seatsPerRow[0] ?? 2;
  const right = seatsPerRow[1] ?? 2;

  const rows = new Map<number, GridSeat[]>();
  seats.forEach((s) => rows.set(s.row_no, [...(rows.get(s.row_no) ?? []), s]));

  const sortedRows = [...rows.entries()].sort((a, b) => a[0] - b[0]);

  return (
    <div
      className="seat-bus-container"
      style={{
        maxWidth: 420,
        margin: "0 auto",
        background: "var(--surface)",
        border: "2px solid var(--border)",
        borderRadius: "28px 28px 16px 16px",
        padding: "16px 12px",
        boxShadow: "0 8px 30px rgba(0, 0, 0, 0.08)",
      }}
    >
      {/* Avant de l'autocar / Cockpit Chauffeur */}
      {showCockpit && (
        <div
          style={{
            borderBottom: "2px dashed var(--border)",
            paddingBottom: 12,
            marginBottom: 14,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "rgba(140, 107, 184, 0.12)",
              padding: "6px 12px",
              borderRadius: 12,
              fontSize: "var(--text-xs)",
              fontWeight: 700,
              color: "var(--accent)",
            }}
          >
            <span style={{ fontSize: 16 }}>🧑‍✈️</span>
            <span>Conducteur</span>
          </div>

          <div
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--muted)",
              fontWeight: 700,
            }}
          >
            ▲ Avant
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontSize: "var(--text-xs)",
              color: "var(--muted)",
              background: "var(--bg)",
              padding: "4px 8px",
              borderRadius: 8,
              border: "1px solid var(--border)",
            }}
          >
            <span>🚪</span>
            <span>Porte</span>
          </div>
        </div>
      )}

      {/* Grille des rangées avec allée centrale */}
      <div className="seat-map" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {sortedRows.map(([rowNo, rowSeats]) => (
          <div
            className="seat-row"
            key={rowNo}
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${left}, 1fr) 28px repeat(${right}, 1fr)`,
              alignItems: "center",
              gap: 6,
            }}
          >
            {rowSeats.map((s) => (
              <button
                key={s.id}
                type="button"
                title={s.title || `Siège #${s.seat_no}`}
                className={`seat ${s.className ?? ""}`}
                style={{
                  gridColumn: s.col_no <= left ? s.col_no : s.col_no + 1,
                  minWidth: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 700,
                  fontSize: "var(--text-xs)",
                  transition: "all 0.15s ease",
                }}
                disabled={s.disabled}
                onClick={() => onSelect?.(s)}
              >
                <span className="mono">{s.seat_no}</span>
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* Arrière du bus */}
      <div
        style={{
          marginTop: 14,
          paddingTop: 8,
          borderTop: "1px dashed var(--border)",
          textAlign: "center",
          fontSize: 10,
          color: "var(--muted)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        ▼ Arrière du véhicule (Issue de secours)
      </div>
    </div>
  );
}
