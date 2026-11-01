import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { api, ApiError } from "../core/api";
import { useAuth } from "../core/auth";
import { formatMoney } from "../core/format";
import type { AgencySummary, Country } from "../core/types";

interface RentalItem {
  id: number;
  reference: string;
  departure: string;
  destination: string;
  start_date: string;
  end_date: string;
  passengers: number;
  bus_type: string;
  with_driver: number;
  status: string;
  quote_amount: number | null;
  agency_reply: string | null;
  agency_name: string | null;
  currency_code: string;
}

const BUS_TYPES = [
  { id: "coach", title: "Autocar Grand Tourisme", seats: "50 – 70 places", desc: "Climatisation, soute XXL, idéal longues distances & délégations." },
  { id: "vip", title: "Autocar VIP Salon", seats: "28 – 40 places", desc: "Sièges inclinables larges 2+1 / 2+2, Wi-Fi, prises USB." },
  { id: "standard", title: "Bus Interurbain", seats: "45 – 60 places", desc: "Robuste et économique pour sorties associatives, écoles ou mariages." },
  { id: "minibus", title: "Minibus Privatif", seats: "14 – 29 places", desc: "Agile en ville comme sur route pour petits groupes & navettes aéroport." },
];

export default function BusRental() {
  const { i18n } = useTranslation();
  const { user } = useAuth();
  const [countries, setCountries] = useState<Country[]>([]);
  const [agencies, setAgencies] = useState<AgencySummary[]>([]);
  const [myRentals, setMyRentals] = useState<RentalItem[]>([]);

  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    country_id: 0,
    agency_id: 0,
    departure: "",
    destination: "",
    start_date: today,
    end_date: today,
    passengers: 45,
    bus_type: "coach",
    with_driver: true,
    contact_name: user ? `${user.first_name} ${user.last_name}` : "",
    contact_email: user?.email ?? "",
    contact_phone: user?.phone ?? "",
    notes: "",
  });

  const [createdRef, setCreatedRef] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Country[]>(`/countries?lang=${i18n.language}`, { realm: null })
      .then((rows) => {
        setCountries(rows);
        const cm = rows.find((c) => c.iso2 === "CM") ?? rows[0];
        if (cm) setForm((f) => ({ ...f, country_id: f.country_id || cm.id }));
      })
      .catch(() => {});
    api<AgencySummary[]>("/agencies", { realm: null }).then(setAgencies).catch(() => {});
  }, [i18n.language]);

  useEffect(() => {
    if (user) {
      setForm((f) => ({
        ...f,
        contact_name: f.contact_name || `${user.first_name} ${user.last_name}`,
        contact_email: f.contact_email || user.email,
        contact_phone: f.contact_phone || (user.phone ?? ""),
      }));
      api<RentalItem[]>("/me/rentals", { realm: "passenger" }).then(setMyRentals).catch(() => {});
    }
  }, [user]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setCreatedRef("");
    try {
      const res = await api<{ reference: string }>("/rentals", {
        body: {
          ...form,
          agency_id: form.agency_id || null,
        },
        realm: "passenger",
      });
      setCreatedRef(res.reference);
      if (user) {
        api<RentalItem[]>("/me/rentals", { realm: "passenger" }).then(setMyRentals).catch(() => {});
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Impossible d'envoyer la demande.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section
        className="service-hero photo-bg"
        style={{ "--photo-custom": 'url("/media/bus-rental.jpg")' } as React.CSSProperties}
      >
        <div className="photo-bg__image photo-bg__image--custom" />
        <div className="container service-hero__inner">
          <span className="badge">Service Affrètement & Groupes</span>
          <h1 className="display display-xl">Location de bus sur mesure</h1>
          <p className="lead">
            Mariage, séminaire d’entreprise, excursion touristique ou transfert d’équipe : choisissez votre gabarit,
            avec ou sans chauffeur professionnel, et recevez un devis chiffré des compagnies agréées.
          </p>
        </div>
      </section>

      <div className="container page">
        {/* Sélecteur visuel de gabarit */}
        <section>
          <h2 className="subheading" style={{ marginBottom: 14 }}>1. Choisissez la catégorie de véhicule</h2>
          <div className="agency-grid">
            {BUS_TYPES.map((bt) => (
              <motion.button
                key={bt.id}
                type="button"
                whileHover={{ y: -5 }}
                onClick={() => setForm({ ...form, bus_type: bt.id })}
                className={`card card--hover selectable-card ${form.bus_type === bt.id ? "is-selected" : ""}`}
              >
                <span className="badge">{bt.seats}</span>
                <h3 style={{ margin: "8px 0 4px" }}>{bt.title}</h3>
                <p className="muted" style={{ margin: 0, fontSize: "var(--text-sm)" }}>{bt.desc}</p>
              </motion.button>
            ))}
          </div>
        </section>

        {/* Formulaire complet */}
        <section className="agency-layout">
          <form className="card form-grid" onSubmit={submit}>
            <h2 className="subheading">2. Détails de votre trajet & coordonnées</h2>

            <div className="search-grid">
              <label className="field">
                <span className="field__label">Pays de prise en charge</span>
                <select
                  className="select"
                  value={form.country_id}
                  onChange={(e) => setForm({ ...form, country_id: Number(e.target.value) })}
                >
                  {countries.map((c) => (
                    <option key={c.id} value={c.id}>
                      {i18n.language === "en" ? c.name_en : c.name_fr} ({c.default_currency})
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span className="field__label">Agence souhaitée (optionnel)</span>
                <select
                  className="select"
                  value={form.agency_id}
                  onChange={(e) => setForm({ ...form, agency_id: Number(e.target.value) })}
                >
                  <option value={0}>Toutes les agences partenaires du pays</option>
                  {agencies.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.currency_code})
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="search-grid">
              <label className="field">
                <span className="field__label">Ville / Lieu de départ</span>
                <input
                  className="input"
                  required
                  placeholder="Ex. Yaoundé — Carrefour Bastos"
                  value={form.departure}
                  onChange={(e) => setForm({ ...form, departure: e.target.value })}
                />
              </label>
              <label className="field">
                <span className="field__label">Destination</span>
                <input
                  className="input"
                  required
                  placeholder="Ex. Kribi — Plage de Londji"
                  value={form.destination}
                  onChange={(e) => setForm({ ...form, destination: e.target.value })}
                />
              </label>
            </div>

            <div className="search-grid">
              <label className="field">
                <span className="field__label">Date de départ</span>
                <input
                  className="input"
                  type="date"
                  required
                  min={today}
                  value={form.start_date}
                  onChange={(e) => setForm({ ...form, start_date: e.target.value, end_date: e.target.value > form.end_date ? e.target.value : form.end_date })}
                />
              </label>
              <label className="field">
                <span className="field__label">Date de retour</span>
                <input
                  className="input"
                  type="date"
                  required
                  min={form.start_date}
                  value={form.end_date}
                  onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                />
              </label>
              <label className="field">
                <span className="field__label">Nombre de passagers</span>
                <input
                  className="input"
                  type="number"
                  min={5}
                  max={500}
                  required
                  value={form.passengers}
                  onChange={(e) => setForm({ ...form, passengers: Number(e.target.value) })}
                />
              </label>
            </div>

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={form.with_driver}
                onChange={(e) => setForm({ ...form, with_driver: e.target.checked })}
              />
              <span>Inclure un chauffeur professionnel certifié et le carburant</span>
            </label>

            <div className="search-grid">
              <label className="field">
                <span className="field__label">Votre nom complet</span>
                <input
                  className="input"
                  required
                  value={form.contact_name}
                  onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
                />
              </label>
              <label className="field">
                <span className="field__label">E-mail de réception du devis</span>
                <input
                  className="input"
                  type="email"
                  required
                  value={form.contact_email}
                  onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
                />
              </label>
              <label className="field">
                <span className="field__label">Téléphone / WhatsApp</span>
                <input
                  className="input"
                  type="tel"
                  required
                  placeholder="+237 6..."
                  value={form.contact_phone}
                  onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
                />
              </label>
            </div>

            <label className="field">
              <span className="field__label">Précisions (étapes, bagages spéciaux, horaires souhaités)</span>
              <textarea
                className="textarea"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Départ souhaité à 06h30, arrêt intermédiaire…"
              />
            </label>

            <button type="submit" className="btn btn--lg" disabled={busy}>
              {busy ? "Transmission en cours…" : "Demander mon devis gratuit →"}
            </button>

            {createdRef && (
              <div className="demo-note" role="status">
                <strong>✓ Demande transmise avec succès !</strong>
                <p style={{ margin: "6px 0 0" }}>
                  Numéro de dossier : <strong className="mono">{createdRef}</strong>. Les agences sélectionnées
                  peuvent maintenant vous répondre directement avec leur tarif.
                </p>
              </div>
            )}
            {error && <p className="error">{error}</p>}
          </form>

          <aside className="side-stack">
            <div className="card">
              <h3 className="subheading">Garanties Location VELTRON</h3>
              <ul className="plain-list muted">
                <li>Véhicules inspectés et assurés pour le transport collectif</li>
                <li>Chauffeurs titulaires du permis transport en commun vérifié</li>
                <li>Devis transparent dans la devise officielle du pays</li>
                <li>Assistance et remplacement en cas d’imprévu mécanique</li>
              </ul>
            </div>

            {user && (
              <div className="card">
                <h3 className="subheading">Mes demandes & devis reçus</h3>
                {myRentals.length === 0 ? (
                  <p className="muted">Aucune demande enregistrée sur votre compte pour l’instant.</p>
                ) : (
                  <ul className="call-list">
                    {myRentals.map((r) => (
                      <li key={r.id} className="call-row">
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                          <strong className="mono">{r.reference}</strong>
                          <span className="badge">{r.status === "quoted" ? "Devis reçu" : "En étude"}</span>
                        </div>
                        <span>
                          {r.departure} → {r.destination} ({r.passengers} pers.)
                        </span>
                        <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
                          Du {r.start_date} au {r.end_date}
                          {r.agency_name ? ` · ${r.agency_name}` : ""}
                        </span>
                        {r.quote_amount !== null && (
                          <strong style={{ color: "var(--success)" }}>
                            Offre : {formatMoney(r.quote_amount, r.currency_code, r.currency_code === "EUR" ? 2 : 0, i18n.language)}
                          </strong>
                        )}
                        {r.agency_reply && <p className="muted" style={{ margin: 0 }}>{r.agency_reply}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </aside>
        </section>
      </div>
    </>
  );
}

