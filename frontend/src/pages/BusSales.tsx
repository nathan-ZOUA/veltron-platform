import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { api, ApiError } from "../core/api";
import { useAuth } from "../core/auth";
import { agencyStyle, formatMoney } from "../core/format";

interface BusListing {
  id: number;
  title: string;
  brand: string;
  model: string | null;
  year: number;
  seats: number;
  mileage_km: number | null;
  price: number;
  currency_code: string;
  minor_units: number;
  description: string | null;
  photo_path: string | null;
  agency_name: string;
  agency_slug: string;
  primary_color: string;
  country_name: string;
  country: string;
}

export default function BusSales() {
  const { i18n } = useTranslation();
  const { user } = useAuth();
  const [listings, setListings] = useState<BusListing[] | null>(null);
  const [search, setSearch] = useState("");
  const [minSeats, setMinSeats] = useState(0);

  const [selected, setSelected] = useState<BusListing | null>(null);
  const [form, setForm] = useState({
    name: user ? `${user.first_name} ${user.last_name}` : "",
    email: user?.email ?? "",
    phone: user?.phone ?? "",
    message: "",
  });
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<BusListing[]>("/bus-listings", { realm: null })
      .then(setListings)
      .catch(() => setListings([]));
  }, []);

  useEffect(() => {
    if (user) {
      setForm((f) => ({
        ...f,
        name: f.name || `${user.first_name} ${user.last_name}`,
        email: f.email || user.email,
        phone: f.phone || (user.phone ?? ""),
      }));
    }
  }, [user]);

  const filtered = useMemo(() => {
    if (!listings) return null;
    const q = search.trim().toLowerCase();
    return listings.filter(
      (b) =>
        b.seats >= minSeats &&
        (!q ||
          b.title.toLowerCase().includes(q) ||
          b.brand.toLowerCase().includes(q) ||
          b.country_name.toLowerCase().includes(q) ||
          b.agency_name.toLowerCase().includes(q)),
    );
  }, [listings, search, minSeats]);

  function openInquiry(b: BusListing) {
    setSelected(b);
    setSent(false);
    setError("");
    setForm((f) => ({
      ...f,
      message: `Bonjour ${b.agency_name}, je suis intéressé par votre véhicule « ${b.title} » (${b.year}, ${b.seats} places). Pouvons-nous organiser une inspection ?`,
    }));
  }

  async function sendInquiry(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      await api(`/bus-listings/${selected.id}/inquire`, { body: form, realm: "passenger" });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Envoi impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section
        className="service-hero photo-bg"
        style={{ "--photo-custom": 'url("/media/bus-purchase.jpg")' } as React.CSSProperties}
      >
        <div className="photo-bg__image photo-bg__image--custom" />
        <div className="container service-hero__inner">
          <span className="badge">Marketplace Véhicules Certifiés</span>
          <h1 className="display display-xl">Achat d’autocars, bus & minibus</h1>
          <p className="lead">
            Acquérez des véhicules issus directement des flottes d’agences vérifiées sur VELTRON, avec historique
            d’entretien et contact direct avec la direction technique.
          </p>

          <div className="tracking-search">
            <input
              className="input"
              placeholder="Rechercher une marque (Mercedes, Yutong, Toyota…), un pays ou une agence"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select className="select" style={{ maxWidth: 230 }} value={minSeats} onChange={(e) => setMinSeats(Number(e.target.value))}>
              <option value={0}>Toutes capacités</option>
              <option value={25}>25+ places</option>
              <option value={45}>45+ places</option>
              <option value={55}>55+ places</option>
            </select>
          </div>
        </div>
      </section>

      <div className="container page">
        {filtered === null && (
          <div className="agency-grid">
            {[1, 2, 3].map((n) => (
              <div key={n} className="skeleton" style={{ height: 340 }} />
            ))}
          </div>
        )}

        {filtered?.length === 0 && (
          <p className="muted">Aucun véhicule ne correspond à votre filtre actuellement.</p>
        )}

        <div className="bus-market-grid">
          {filtered?.map((b, idx) => (
            <motion.article
              key={b.id}
              style={agencyStyle(b.primary_color)}
              className="card bus-sale-card"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.06 }}
            >
              <div className="bus-sale-card__media">
                <img src={b.photo_path || "/media/bus.jpeg"} alt={b.title} loading="lazy" />
                <span className="bus-sale-card__badge">{b.year}</span>
              </div>

              <div className="bus-sale-card__body">
                <div className="chips">
                  <span className="badge">{b.brand}</span>
                  <span className="badge">{b.seats} places</span>
                  {b.mileage_km ? <span className="badge mono">{b.mileage_km.toLocaleString("fr-FR")} km</span> : null}
                </div>

                <h3>{b.title}</h3>
                <p className="muted" style={{ fontSize: "var(--text-sm)", margin: 0 }}>
                  Vendu par <strong>{b.agency_name}</strong> · {b.country_name}
                </p>
                {b.description && <p className="muted" style={{ fontSize: "var(--text-sm)" }}>{b.description}</p>}

                <div className="bus-sale-card__footer">
                  <strong className="trip__price mono">
                    {formatMoney(b.price, b.currency_code, b.minor_units, i18n.language)}
                  </strong>
                  <button type="button" className="btn" onClick={() => openInquiry(b)}>
                    Contacter le vendeur
                  </button>
                </div>
              </div>
            </motion.article>
          ))}
        </div>
      </div>

      {/* Fenêtre modale de prise de contact achat */}
      {selected && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={() => setSelected(null)}>
          <motion.div
            className="modal-panel card"
            initial={{ opacity: 0, scale: 0.94, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-panel__head">
              <h2 className="subheading">Offre / Inspection : {selected.title}</h2>
              <button type="button" className="btn btn--icon" onClick={() => setSelected(null)} aria-label="Fermer">
                ✕
              </button>
            </div>

            {sent ? (
              <div className="form-grid">
                <div className="demo-note">
                  <strong>✓ Votre message a été transmis à {selected.agency_name}.</strong>
                  <p style={{ margin: "6px 0 0" }}>
                    La direction de l’agence vous recontactera par e-mail ou téléphone pour convenir d’un rendez-vous
                    d’inspection mécanique et d’essai routier.
                  </p>
                </div>
                <button type="button" className="btn" onClick={() => setSelected(null)}>
                  Fermer
                </button>
              </div>
            ) : (
              <form className="form-grid" onSubmit={sendInquiry}>
                <div className="search-grid">
                  <label className="field">
                    <span className="field__label">Votre nom / Société</span>
                    <input
                      className="input"
                      required
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span className="field__label">E-mail</span>
                    <input
                      className="input"
                      type="email"
                      required
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                    />
                  </label>
                </div>
                <label className="field">
                  <span className="field__label">Téléphone / WhatsApp</span>
                  <input
                    className="input"
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </label>
                <label className="field">
                  <span className="field__label">Votre message</span>
                  <textarea
                    className="textarea"
                    required
                    value={form.message}
                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                  />
                </label>
                {error && <p className="error">{error}</p>}
                <div className="wizard-actions">
                  <button type="button" className="btn btn--ghost" onClick={() => setSelected(null)}>
                    Annuler
                  </button>
                  <button type="submit" className="btn" disabled={busy}>
                    {busy ? "Envoi…" : "Envoyer ma demande d’achat"}
                  </button>
                </div>
              </form>
            )}
          </motion.div>
        </div>
      )}
    </>
  );
}

