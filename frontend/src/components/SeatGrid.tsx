// Plan de sièges générique (réservation, guichet). La disposition (2+2, 2+3…) vient du bus.

export interface GridSeat {
  id: number; seat_no: number; row_no: number; col_no: number;
  className?: string; disabled?: boolean; title?: string;
}

interface Props {
  seats: GridSeat[];
  seatsPerRow: number[];       // ex. [2, 3]
  onSelect?: (seat: GridSeat) => void;
}

export default function SeatGrid({ seats, seatsPerRow, onSelect }: Props) {
  const left = seatsPerRow[0] ?? 2;
  const right = seatsPerRow[1] ?? 2;

  const rows = new Map<number, GridSeat[]>();
  seats.forEach((s) => rows.set(s.row_no, [...(rows.get(s.row_no) ?? []), s]));

  return (
    <div className="seat-map">
      {[...rows.entries()].sort((a, b) => a[0] - b[0]).map(([rowNo, rowSeats]) => (
        <div className="seat-row" key={rowNo}
             style={{ gridTemplateColumns: `repeat(${left}, 1fr) 26px repeat(${right}, 1fr)` }}>
          {rowSeats.map((s) => (
            <button
              key={s.id} type="button" title={s.title}
              className={`seat ${s.className ?? ""}`}
              style={{ gridColumn: s.col_no <= left ? s.col_no : s.col_no + 1 }}
              disabled={s.disabled} onClick={() => onSelect?.(s)}
            >
              <span className="mono">{s.seat_no}</span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
