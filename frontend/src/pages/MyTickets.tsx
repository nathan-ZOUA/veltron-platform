import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
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
    } catch (e) { setError(e instanceof ApiError ? e.message : t("common.error")); }
  }
  const labels: [keyof typeof ratings, string][] = [["rating_agency", t("agency.rAgency")], ["rating_bus", t("agency.rBus")], ["rating_trip", t("agency.rTrip")]];

  return (
    <div className="review-form">
      {labels.map(([key, label]) => (
        <label key={key} className="field">
          <span className="field__label">{label}</span>
          <select className="select" value={ratings[key]} onChange={(e) => setRatings({ ...ratings, [key]: Number(e.target.value) })}>
            {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{"★".repeat(n)}</option>)}
          </select>
        </label>
      ))}
      <label className="field">
        <span className="field__label">{t("mine.comment")}</span>
        <textarea className="textarea" value={comment} onChange={(e) => setComment(e.target.value)} />
      </label>
      <button type="button" className="btn" onClick={submit}>{t("mine.send")}</button>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

export default function MyTickets() {
  const { t, i18n } = useTranslation();
  const [tickets, setTickets] = useState<TicketListItem[] | null>(null);
  const [reviewing, setReviewing] = useState<number | null>(null);

  const load = () => api<TicketListItem[]>("/me/tickets", { realm: "passenger" }).then(setTickets).catch(() => setTickets([]));
  useEffect(() => { load(); }, []);

  return (
    <div className="container page">
      <header className="page__header">
        <h1 className="display display-xl">{t("mine.title")}</h1>
      </header>
      {tickets === null && <div className="skeleton" style={{ height: 140 }} />}
      {tickets?.length === 0 && (
        <p className="muted">
          {t("mine.empty")} <Link to="/passager/agences" className="link">{t("nav.agencies")}</Link>
        </p>
      )}

      <ul className="trip-list">
        {tickets?.map((k, index) => (
          <motion.li key={k.id} style={agencyStyle(k.primary_color)} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}>
            <article className="card trip card--hover">
              <div className="trip__times">
                <div>
                  <span className="muted">{formatDay(k.departs_at, k.timezone, i18n.language)}</span>
                  <strong className="mono">{formatTime(k.departs_at, k.timezone, i18n.language)}</strong>
                </div>
                <div>
                  <strong>{k.origin} <span className="flip-rtl">→</span> {k.destination}</strong>
                  <span className="muted">
                    {k.agency_name} · #{k.seat_no} · <span className="mono">{k.reference}</span>
                    {k.delay_minutes ? ` · ⚠ Retard +${k.delay_minutes} min` : ""}
                  </span>
                </div>
              </div>
              <span className={`stamp stamp--${k.status}`}>{t(`ticket.statuses.${k.status}`)}</span>
              <div className="trip__buy">
                <div className="chips">
                  <Link to={`/passager/billet/${k.id}`} className="btn btn--ghost">{t("mine.open")}</Link>
                  <Link to={`/passager/suivi?trip=${k.trip_id}`} className="btn">Suivi live</Link>
                </div>
                {k.status === "boarded" && !k.reviewed && (
                  <button type="button" className="btn btn--ghost" onClick={() => setReviewing(k.id)}>{t("mine.review")}</button>
                )}
                {k.reviewed && <span className="muted">{t("mine.sent")}</span>}
              </div>
              {reviewing === k.id && <ReviewForm ticketId={k.id} onDone={() => { setReviewing(null); load(); }} />}
            </article>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}
