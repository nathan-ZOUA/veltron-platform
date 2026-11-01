import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import { useTranslation } from "react-i18next";
import Avatar from "../components/Avatar";
import { api, ApiError } from "../core/api";
import { agencyStyle, formatDay, formatMoney, formatTime } from "../core/format";
import type { TicketDetail } from "../core/types";

export default function TicketPage() {
  const { id = "" } = useParams();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [postponeTripId, setPostponeTripId] = useState<number>(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = () =>
    api<TicketDetail>(`/tickets/${id}`, { realm: "passenger" })
      .then(setTicket)
      .catch((e) => setError(e instanceof ApiError ? e.message : t("common.error")));

  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ticket) return <div className="container page">{error ? <p className="error">{error}</p> : <div className="skeleton" style={{ height: 320 }} />}</div>;

  const money = (n: number) => formatMoney(n, ticket.currency_code, ticket.minor_units, i18n.language);
  const cutoffH = Math.round(ticket.refund.cutoff_minutes / 60);
  const statusLabel = t(`ticket.statuses.${ticket.status}`);

  async function refund() {
    setError("");
    try {
      await api(`/tickets/${id}/refund`, { method: "POST", body: {}, realm: "passenger" });
      setMessage(t("ticket.refundDone"));
      load();
    } catch (e) { setError(e instanceof ApiError ? e.message : t("common.error")); }
  }

  async function postpone() {
    if (!postponeTripId) return;
    setError("");
    try {
      const r = await api<{ new_ticket_id: number }>(`/tickets/${id}/postpone`, {
        body: { to_trip_id: postponeTripId },
        realm: "passenger",
      });
      navigate(`/passager/billet/${r.new_ticket_id}`);
    } catch (e) { setError(e instanceof ApiError ? e.message : t("common.error")); }
  }

  return (
    <div className="container page ticket-page" style={agencyStyle(ticket.primary_color)}>
      <motion.article className="ticket" initial={{ opacity: 0, y: 40, rotateX: -12 }} animate={{ opacity: 1, y: 0, rotateX: 0 }} transition={{ duration: 0.7 }}>
        <header className="ticket__head">
          <strong className="ticket__agency">{ticket.agency_name}</strong>
          <span className={`stamp stamp--${ticket.status}`}>{statusLabel}</span>
        </header>

        <div className="ticket__route">
          <div>
            <span className="muted">{formatDay(ticket.departs_at, ticket.timezone, i18n.language)}</span>
            <strong className="mono">{formatTime(ticket.departs_at, ticket.timezone, i18n.language)}</strong>
            <span>{ticket.origin}</span>
          </div>
          <span className="trip__arrow flip-rtl">→</span>
          <div>
            <span className="muted">{t("ticket.arrival")}</span>
            <strong className="mono">{ticket.arrives_at ? formatTime(ticket.arrives_at, ticket.timezone, i18n.language) : "–"}</strong>
            <span>{ticket.destination}</span>
          </div>
        </div>

        <div className="ticket__body">
          <dl className="stat-list">
            <div><dt className="muted">{t("ticket.reference")}</dt><dd className="mono">{ticket.reference}</dd></div>
            <div><dt className="muted">{t("ticket.passenger")}</dt><dd>{ticket.passenger_name}</dd></div>
            <div><dt className="muted">{t("ticket.seat")}</dt><dd className="mono">#{ticket.seat_no}</dd></div>
            <div><dt className="muted">{t("ticket.bus")}</dt><dd>{ticket.bus_label}</dd></div>
            <div>
              <dt className="muted">{t("ticket.driver")}</dt>
              <dd className="drivers">
                {ticket.drivers.length === 0
                  ? t("agency.driverTbc")
                  : ticket.drivers.map((d) => (
                      <span key={d.first_name} className="driver">
                        <Avatar name={d.first_name} photo={d.photo_path} size={30} /> {d.first_name}
                      </span>
                    ))}
              </dd>
            </div>
            {ticket.luggage.length > 0 && (
              <div><dt className="muted">{t("ticket.luggage")}</dt><dd className="mono">{ticket.luggage.map((l) => l.tag_code).join(", ")}</dd></div>
            )}
            <div><dt className="muted">{t("book.total")}</dt><dd className="mono">{money(ticket.price)}</dd></div>
          </dl>

          <div className="ticket__qr">
            <QRCodeSVG value={`VLT:${ticket.qr_token}`} size={170} bgColor="#ffffff" fgColor="#15161d" level="M" />
            <span className="muted">{t("ticket.qrHint")}</span>
          </div>
        </div>
      </motion.article>

      <div className="ticket-actions no-print">
        <button type="button" className="btn btn--lg" onClick={() => window.print()}>{t("ticket.print")}</button>
        <Link to={`/passager/suivi?trip=${ticket.trip_id}`} className="btn btn--ghost btn--lg">
          📍 Suivre l’évolution du trajet
        </Link>
        {ticket.status === "valid" && ticket.refund.allowed && (
          <button type="button" className="btn btn--ghost btn--lg" onClick={refund}>{t("ticket.refund")}</button>
        )}
        <Link to="/passager/mes-billets" className="btn btn--ghost btn--lg">{t("ticket.back")}</Link>
      </div>

      {ticket.status === "valid" && ticket.postpone_options && ticket.postpone_options.length > 0 && (
        <div className="card form-grid no-print">
          <h2 className="subheading">Reporter mon billet sur un autre départ</h2>
          <div className="search-grid">
            <select className="select" value={postponeTripId} onChange={(e) => setPostponeTripId(Number(e.target.value))}>
              <option value={0}>Choisir un autre départ sur {ticket.origin} → {ticket.destination}</option>
              {ticket.postpone_options.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {formatDay(opt.departs_at, ticket.timezone, i18n.language)} à {formatTime(opt.departs_at, ticket.timezone, i18n.language)} · {opt.bus_label} ({opt.free_seats} pl.)
                </option>
              ))}
            </select>
            <button type="button" className="btn" disabled={!postponeTripId} onClick={postpone}>
              Confirmer le report
            </button>
          </div>
        </div>
      )}

      {ticket.status === "valid" && (
        <p className="demo-note no-print">
          {ticket.refund.allowed
            ? t("ticket.refundInfo", { p: ticket.refund.percent, a: money(ticket.refund.amount), h: cutoffH })
            : t("ticket.refundClosed", { h: cutoffH })}
        </p>
      )}
      {message && <p className="demo-note" role="status">{message}</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
