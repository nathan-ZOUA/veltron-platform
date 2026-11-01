import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import SeatGrid from "../components/SeatGrid";
import { api, ApiError } from "../core/api";
import { useAuth } from "../core/auth";
import { agencyStyle, formatDay, formatMoney, formatTime } from "../core/format";
import type { TripDetail } from "../core/types";

interface Pax { name: string; id_type: string; id_number: string; phone: string }
interface Booking { id: number; reference: string; total: number; currency_code: string; expires_at: string }
interface SavedPayMethod {
  id: number;
  provider: string;
  account_number: string;
  account_name: string | null;
  balance: number;
  currency_code: string;
  is_default: number | boolean;
}

const PAY_PROVIDERS = [
  { id: "orange_money", label: "🍊 Orange Money" },
  { id: "mtn_momo", label: "💛 MTN Mobile Money" },
  { id: "wave", label: "🌊 Wave" },
  { id: "card", label: "💳 Carte Bancaire" },
];

const MAX_SEATS = 6;
const emptyPax = (): Pax => ({ name: "", id_type: "CNI", id_number: "", phone: "" });

export default function TripBooking() {
  const { tripId = "" } = useParams();
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [pax, setPax] = useState<Record<number, Pax>>({});
  const [booking, setBooking] = useState<Booking | null>(null);
  const [savedMethods, setSavedMethods] = useState<SavedPayMethod[]>([]);
  const [payProvider, setPayProvider] = useState<string>("orange_money");
  const [payerAccount, setPayerAccount] = useState<string>("");
  const [payerName, setPayerName] = useState<string>("");
  const [selectedMethodId, setSelectedMethodId] = useState<number>(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const payKey = useRef(crypto.randomUUID());

  const load = () => api<TripDetail>(`/trips/${tripId}`).then(setTrip).catch(() => setError(t("common.error")));
  useEffect(() => { load(); }, [tripId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user) return;
    setPayerName(`${user.first_name} ${user.last_name}`.trim());
    if (user.phone) setPayerAccount(user.phone);
    api<SavedPayMethod[]>("/me/payment-methods", { realm: "passenger" })
      .then((list) => {
        setSavedMethods(list);
        if (list.length > 0) {
          const def = list.find((m) => m.is_default) ?? list[0];
          setSelectedMethodId(def.id);
          setPayProvider(def.provider);
          setPayerAccount(def.account_number);
          if (def.account_name) setPayerName(def.account_name);
        }
      })
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!booking) return;
    const tick = () => setSecondsLeft(Math.max(0, Math.round((new Date(booking.expires_at).getTime() - Date.now()) / 1000)));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [booking]);

  const seatPrice = (cls: string) => (trip && cls === "vip" && trip.vip_price ? trip.vip_price : trip?.price ?? 0);
  const total = useMemo(
    () => (trip ? selected.reduce((sum, id) => sum + seatPrice(trip.seats.find((s) => s.id === id)?.seat_class ?? "standard"), 0) : 0),
    [selected, trip], // eslint-disable-line react-hooks/exhaustive-deps
  );

  if (!trip) return <div className="container page">{error ? <p className="muted">{error}</p> : <div className="skeleton" style={{ height: 300 }} />}</div>;

  const money = (n: number) => formatMoney(n, trip.currency_code, trip.minor_units, i18n.language);
  const locked = booking !== null;

  function toggle(seatId: number) {
    if (locked) return;
    setError("");
    setSelected((cur) => {
      if (cur.includes(seatId)) return cur.filter((id) => id !== seatId);
      if (cur.length >= MAX_SEATS) { setError(t("book.max")); return cur; }
      return [...cur, seatId];
    });
    setPax((cur) => (cur[seatId] ? cur : { ...cur, [seatId]: { ...emptyPax(), name: selected.length === 0 && user ? `${user.first_name} ${user.last_name}` : "" } }));
  }

  const updatePax = (seatId: number, field: keyof Pax, value: string) =>
    setPax((cur) => ({ ...cur, [seatId]: { ...cur[seatId], [field]: value } }));

  async function createBooking() {
    setBusy(true); setError("");
    try {
      const created = await api<Booking>("/bookings", {
        body: {
          trip_id: trip!.id,
          passengers: selected.map((id) => ({
            seat_id: id,
            name: pax[id]?.name,
            id_type: pax[id]?.id_type,
            id_number: pax[id]?.id_number,
            phone: pax[id]?.phone,
          })),
        },
        realm: "passenger",
      });
      setBooking(created);
    } catch (e) {
      if (e instanceof ApiError && e.code === "seat_taken") { setError(t("book.seatTaken")); setSelected([]); load(); }
      else setError(e instanceof ApiError ? e.message : t("common.error"));
    } finally { setBusy(false); }
  }

  async function pay() {
    if (!booking) return;
    setBusy(true); setError("");
    try {
      const result = await api<{ ticket_ids: number[]; points_earned?: number }>(`/bookings/${booking.id}/pay`, {
        body: {
          provider: payProvider,
          payer_account: payerAccount.trim(),
          payer_name: payerName.trim(),
          payment_method_id: selectedMethodId || undefined,
          idempotency_key: payKey.current,
        },
        realm: "passenger",
      });
      navigate(result.ticket_ids.length === 1 ? `/passager/billet/${result.ticket_ids[0]}` : "/passager/mes-billets");
    } catch (e) {
      setError(e instanceof ApiError && e.status === 410 ? t("book.expired") : e instanceof ApiError ? e.message : t("common.error"));
    } finally { setBusy(false); }
  }

  const ready = selected.length > 0 && selected.every((id) => pax[id]?.name.trim());
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");

  return (
    <div className="container page" style={agencyStyle(trip.primary_color)}>
      <header className="page__header">
        <Link to={`/passager/a/${trip.agency_slug}`} className="muted">← {trip.agency_name}</Link>
        <h1 className="display display-xl">{trip.origin} <span className="flip-rtl">→</span> {trip.destination}</h1>
        <p className="lead">
          {formatDay(trip.departs_at, trip.timezone, i18n.language)} · <span className="mono">{formatTime(trip.departs_at, trip.timezone, i18n.language)}</span> · {trip.bus_label}
          {trip.points_per_trip ? <span className="badge" style={{ marginInlineStart: 12 }}>+{trip.points_per_trip} pts fidélité / billet</span> : null}
        </p>
      </header>

      {!user ? (
        <div className="card form-grid">
          <p>{t("book.signIn")} Vos points de fidélité seront crédités automatiquement sur votre compte.</p>
          <div>
            <Link className="btn btn--lg" to={`/passager/connexion?next=${encodeURIComponent(`/passager/reserver/${trip.id}`)}`}>
              {t("nav.login")}
            </Link>
          </div>
        </div>
      ) : (
        <div className="booking-layout">
          <section className="card seat-panel">
            <h2 className="subheading">{t("book.seatsTitle")}</h2>
            <ul className="seat-legend">
              <li><span className="seat seat--legend" /> {t("book.free")}</li>
              <li><span className="seat seat--legend seat--selected" /> {t("book.selected")}</li>
              <li><span className="seat seat--legend seat--taken" /> {t("book.taken")}</li>
            </ul>
            <div className="bus-front muted">{t("book.front")}</div>
            <SeatGrid
              seatsPerRow={trip.layout.seats_per_row}
              seats={trip.seats.map((s) => ({
                ...s,
                disabled: s.taken || locked,
                className: s.taken ? "seat--taken" : selected.includes(s.id) ? "seat--selected" : s.seat_class === "vip" ? "seat--vip" : "",
              }))}
              onSelect={(s) => toggle(s.id)}
            />
            <p className="muted">{t("book.max")}</p>
          </section>

          <section className="booking-main">
            {selected.length > 0 && (
              <div className="card form-grid">
                <h2 className="subheading">{t("book.passengers")}</h2>
                {selected.map((id) => {
                  const seat = trip.seats.find((s) => s.id === id)!;
                  return (
                    <motion.fieldset key={id} className="pax" disabled={locked} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                      <legend className="mono">#{seat.seat_no} · {money(seatPrice(seat.seat_class))}</legend>
                      <label className="field">
                        <span className="field__label">{t("book.name")}</span>
                        <input className="input" value={pax[id]?.name ?? ""} onChange={(e) => updatePax(id, "name", e.target.value)} />
                      </label>
                      <div className="search-grid">
                        <label className="field">
                          <span className="field__label">{t("book.idType")}</span>
                          <select className="select" value={pax[id]?.id_type} onChange={(e) => updatePax(id, "id_type", e.target.value)}>
                            <option value="CNI">{t("book.cni")}</option>
                            <option value="PASSPORT">{t("book.passport")}</option>
                            <option value="OTHER">{t("book.other")}</option>
                          </select>
                        </label>
                        <label className="field">
                          <span className="field__label">{t("book.idNumber")}</span>
                          <input className="input" value={pax[id]?.id_number ?? ""} onChange={(e) => updatePax(id, "id_number", e.target.value)} />
                        </label>
                        <label className="field">
                          <span className="field__label">{t("book.phone")}</span>
                          <input className="input" type="tel" value={pax[id]?.phone ?? ""} onChange={(e) => updatePax(id, "phone", e.target.value)} />
                        </label>
                      </div>
                    </motion.fieldset>
                  );
                })}
              </div>
            )}

            <div className="card summary">
              <p>
                {t("book.total")} : <strong className="mono trip__price">{money(booking ? booking.total : total)}</strong>
              </p>

              {!locked ? (
                <button type="button" className="btn btn--lg" disabled={!ready || busy} onClick={createBooking}>
                  {t("book.pay")}
                </button>
              ) : (
                <>
                  <h2 className="subheading">💳 Mode de paiement enregistré (Débit direct → Compte Agence)</h2>
                  <p className="muted">
                    {t("book.timeLeft")} : <strong className="mono">{mm}:{ss}</strong>
                  </p>

                  {savedMethods.length > 0 && (
                    <label className="field">
                      <span className="field__label">Utiliser un moyen de paiement déjà enregistré</span>
                      <select
                        className="select"
                        value={selectedMethodId}
                        onChange={(e) => {
                          const id = Number(e.target.value);
                          setSelectedMethodId(id);
                          const found = savedMethods.find((m) => m.id === id);
                          if (found) {
                            setPayProvider(found.provider);
                            setPayerAccount(found.account_number);
                            if (found.account_name) setPayerName(found.account_name);
                          }
                        }}
                      >
                        {savedMethods.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.provider.toUpperCase()} · {m.account_number} (Solde : {money(m.balance)})
                          </option>
                        ))}
                        <option value={0}>+ Enregistrer un nouveau numéro / carte</option>
                      </select>
                    </label>
                  )}

                  <div className="pay-methods">
                    {PAY_PROVIDERS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className={payProvider === p.id ? "chip is-active" : "chip"}
                        onClick={() => {
                          setPayProvider(p.id);
                          const match = savedMethods.find((m) => m.provider === p.id);
                          if (match) {
                            setSelectedMethodId(match.id);
                            setPayerAccount(match.account_number);
                          } else {
                            setSelectedMethodId(0);
                          }
                        }}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>

                  <div className="search-grid">
                    <label className="field">
                      <span className="field__label">
                        {payProvider === "card" ? "Numéro de carte" : "Numéro Mobile Money à débiter"}
                      </span>
                      <input
                        className="input mono"
                        required
                        placeholder={payProvider === "card" ? "4970 •••• •••• 1234" : "+237 6..."}
                        value={payerAccount}
                        onChange={(e) => setPayerAccount(e.target.value)}
                      />
                    </label>
                    <label className="field">
                      <span className="field__label">Nom du titulaire du compte</span>
                      <input
                        className="input"
                        required
                        placeholder="Nom & Prénom"
                        value={payerName}
                        onChange={(e) => setPayerName(e.target.value)}
                      />
                    </label>
                  </div>

                  <p className="demo-note">
                    ⚡ En validant, <strong>{money(booking.total)}</strong> est <strong>déduit directement de votre compte ({payerAccount || "enregistré"})</strong> et reversé automatiquement sur le compte de l’agence <strong>{trip.agency_name}</strong> (99,5 % net agence, 0,5 % VELTRON). Vous gagnerez <strong>{(trip.points_per_trip ?? 10) * selected.length} points fidélité</strong>.
                  </p>
                  <button
                    type="button"
                    className="btn btn--lg"
                    disabled={busy || secondsLeft === 0 || !payerAccount.trim()}
                    onClick={pay}
                  >
                    Confirmer & Débiter {money(booking.total)} → {trip.agency_name}
                  </button>
                </>
              )}
              {error && <p className="error" role="alert">{error}</p>}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
