import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import Avatar from "../components/Avatar";
import { api } from "../core/api";
import { agencyStyle, formatDay, formatMoney, formatTime, initials } from "../core/format";
import type { AgencyDetail, TripSummary } from "../core/types";

interface Review {
  rating_agency: number;
  rating_bus: number;
  rating_trip: number;
  comment: string | null;
  agency_reply: string | null;
  first_name: string;
}

export default function AgencyPage() {
  const { slug = "" } = useParams();
  const { t, i18n } = useTranslation();
  const [agency, setAgency] = useState<AgencyDetail | null>(null);
  const [trips, setTrips] = useState<TripSummary[] | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [routeId, setRouteId] = useState(0);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    api<AgencyDetail>(`/agencies/${slug}`).then(setAgency).catch(() => setMissing(true));
    api<Review[]>(`/agencies/${slug}/reviews`).then(setReviews).catch(() => setReviews([]));
  }, [slug]);

  useEffect(() => {
    setTrips(null);
    api<TripSummary[]>(`/agencies/${slug}/trips${routeId ? `?route_id=${routeId}` : ""}`)
      .then(setTrips)
      .catch(() => setTrips([]));
  }, [slug, routeId]);

  if (missing) return <div className="container page"><p className="muted">{t("common.error")}</p></div>;
  if (!agency) return <div className="container page"><div className="skeleton" style={{ height: 240 }} /></div>;

  const cutoffH = Math.round(agency.refund_cutoff_minutes / 60);
  const money = (n: number) => formatMoney(n, agency.currency_code, agency.minor_units, i18n.language);

  return (
    <div style={agencyStyle(agency.primary_color)}>
      <section className="agency-hero photo-bg photo-bg--agency">
        <div className="photo-bg__image" />
        <div className="container agency-hero__content">
          <Link to="/passager/agences" className="muted">← Toutes les agences</Link>
          <motion.span className="agency-card__logo agency-card__logo--lg" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
            {agency.logo_path ? <img src={agency.logo_path} alt="" /> : initials(agency.name)}
          </motion.span>
          <h1 className="display display-xl">{agency.name}</h1>
          {agency.address && <p className="muted">📍 {agency.address}</p>}
          <div className="chips">
            <button type="button" className={routeId === 0 ? "chip is-active" : "chip"} onClick={() => setRouteId(0)}>
              {t("agency.allRoutes")}
            </button>
            {agency.routes.map((r) => (
              <button key={r.id} type="button" className={routeId === r.id ? "chip is-active" : "chip"} onClick={() => setRouteId(r.id)}>
                {r.origin} <span className="flip-rtl">→</span> {r.destination}
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="container page agency-layout">
        <section>
          <h2 className="subheading">{t("agency.upcoming")}</h2>
          {trips === null && <div className="skeleton" style={{ height: 120 }} />}
          {trips?.length === 0 && <p className="muted">{t("agency.noTrips")}</p>}
          <ul className="trip-list">
            {trips?.map((trip, index) => (
              <motion.li key={trip.id} initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.05 }}>
                <article className="card trip card--hover">
                  <div className="trip__times">
                    <div>
                      <span className="muted">{formatDay(trip.departs_at, trip.timezone, i18n.language)}</span>
                      <strong className="mono">{formatTime(trip.departs_at, trip.timezone, i18n.language)}</strong>
                    </div>
                    <span className="trip__arrow flip-rtl" aria-hidden="true">→</span>
                    <div>
                      <span className="muted">{trip.destination}</span>
                      <strong className="mono">{trip.arrives_at ? formatTime(trip.arrives_at, trip.timezone, i18n.language) : "–"}</strong>
                    </div>
                  </div>
                  <div className="trip__meta">
                    <strong>{trip.origin} <span className="flip-rtl">→</span> {trip.destination}</strong>
                    <span className="muted">
                      {trip.bus_label} ({trip.bus_type.toUpperCase()}) · <span className="mono">{trip.free_seats}</span> {t("agency.freeSeats")}
                    </span>
                    <div className="drivers">
                      {trip.drivers.length === 0 && <span className="muted">{t("agency.driverTbc")}</span>}
                      {trip.drivers.map((d) => (
                        <span key={d.first_name} className="driver">
                          <Avatar name={d.first_name} photo={d.photo_path} size={34} /> {d.first_name}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="trip__buy">
                    <strong className="trip__price mono">{money(trip.price)}</strong>
                    <Link to={`/passager/reserver/${trip.id}`} className="btn">
                      {t("agency.choose")}
                    </Link>
                  </div>
                </article>
              </motion.li>
            ))}
          </ul>
        </section>

        <aside className="side-stack">
          {agency.rewards && agency.rewards.length > 0 && (
            <div className="card">
              <h2 className="subheading">🎁 Fidélité (+{agency.points_per_trip ?? 10} pts / voyage)</h2>
              <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
                Points cumulés sur l’année en cours dans cette agence :
              </p>
              <ul className="plain-list muted">
                {agency.rewards.map((rw) => (
                  <li key={rw.id}>
                    <strong style={{ color: "var(--text)" }}>{rw.points_required} pts</strong> — {rw.title}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="card">
            <h2 className="subheading">{t("agency.policyTitle")}</h2>
            <ul className="plain-list muted">
              {agency.refund_tiers.map((tier) => (
                <li key={tier.min_minutes_before}>
                  {t("agency.refundTier", { h: Math.round(tier.min_minutes_before / 60), p: tier.refund_percent })}
                </li>
              ))}
              <li>{t("agency.refundNone", { h: cutoffH })}</li>
              <li>{t("agency.baggage", { kg: Number(agency.free_baggage_kg) })}</li>
            </ul>
          </div>

          <div className="card">
            <h2 className="subheading">{t("agency.reviews")}</h2>
            {reviews.length === 0 && <p className="muted">{t("agency.noReviews")}</p>}
            {reviews.map((r, i) => (
              <blockquote key={i} className="review">
                <strong>{r.first_name}</strong>
                <span className="muted">
                  {" "}· <span className="star">★</span> {t("agency.rAgency")} {r.rating_agency} · {t("agency.rBus")} {r.rating_bus} · {t("agency.rTrip")} {r.rating_trip}
                </span>
                {r.comment && <p>{r.comment}</p>}
                {r.agency_reply && <p className="muted">↳ {r.agency_reply}</p>}
              </blockquote>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
