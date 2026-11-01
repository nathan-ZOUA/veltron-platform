import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import BusLivery from "../components/BusLivery";
import { api, ApiError } from "../core/api";
import { agencyStyle } from "../core/format";
import type { Country, Currency, VerificationReport } from "../core/types";

const SWATCHES = ["#1E8A5E", "#C86A2B", "#3B6BD6", "#8C6BB8", "#C84B6A", "#2B8AC8", "#9B7B2F", "#0F766E"];

interface CreatedResult {
  public_code: string;
  slug: string;
  status: string;
  verification_status: string;
  verification_score: number;
  verification_report: VerificationReport;
}

// Création sécurisée d'une agence (/agence/creer) :
// 1. Adresse physique unique vérifiée (2 agences ne peuvent jamais partager la même adresse)
// 2. Liste alphabétique de tous les pays du monde entier avec leurs devises respectives
// 3. Couleur & aperçu du bus en direct
// 4. Fenêtre modale de confirmation e-mail par code PIN aléatoire à 5 chiffres (renvoi 50 s)
// 5. Audit automatique IA VELTRON -> activation immédiate OU transmission directe (Email + WhatsApp) au propriétaire VELTRON
export default function Partner() {
  const { i18n } = useTranslation();
  const [step, setStep] = useState(0);
  const [countries, setCountries] = useState<Country[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [countrySearch, setCountrySearch] = useState("");

  const [agency, setAgency] = useState({
    name: "",
    legal_id: "",
    email: "",
    phone: "",
    city_name: "",
    address: "",
    country_id: 0,
    currency_code: "XAF",
    primary_color: "#1E8A5E",
    payout_method: "orange_money",
    payout_account_number: "",
    payout_account_name: "",
  });

  const [owner, setOwner] = useState({
    first_name: "",
    last_name: "",
    email: "",
    password: "",
  });
  const [contractAccepted, setContractAccepted] = useState(false);

  // État de la fenêtre modale de confirmation PIN à 5 chiffres
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [challenge, setChallenge] = useState("");
  const [pinCode, setPinCode] = useState("");
  const [devPin, setDevPin] = useState<string | null>(null);
  const [resendLeft, setResendLeft] = useState(0);

  const [created, setCreated] = useState<CreatedResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Country[]>(`/countries?lang=${i18n.language}`, { realm: null })
      .then((cs) => {
        setCountries(cs);
        const def = cs.find((c) => c.iso2 === "CM") ?? cs[0];
        if (def) {
          setAgency((a) => ({
            ...a,
            country_id: a.country_id || def.id,
            currency_code: a.country_id ? a.currency_code : def.default_currency,
            phone: a.phone || `${def.phone_prefix} `,
          }));
        }
      })
      .catch(() => {});

    api<Currency[]>("/currencies", { realm: null }).then(setCurrencies).catch(() => {});
  }, [i18n.language]);

  // Compte à rebours de 50 secondes pour le renvoi du code PIN
  useEffect(() => {
    if (resendLeft <= 0) return;
    const t = window.setInterval(() => setResendLeft((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(t);
  }, [resendLeft]);

  const filteredCountries = useMemo(() => {
    const q = countrySearch.trim().toLowerCase();
    if (!q) return countries;
    return countries.filter(
      (c) =>
        c.name_fr.toLowerCase().includes(q) ||
        c.name_en.toLowerCase().includes(q) ||
        c.iso2.toLowerCase().includes(q) ||
        c.default_currency.toLowerCase().includes(q),
    );
  }, [countries, countrySearch]);

  const selectedCountry = countries.find((c) => c.id === agency.country_id);

  function pickCountry(id: number) {
    const c = countries.find((x) => x.id === id);
    if (!c) return;
    setAgency((prev) => ({
      ...prev,
      country_id: c.id,
      currency_code: c.default_currency,
      phone:
        !prev.phone.trim() || prev.phone.trim().startsWith("+") && prev.phone.trim().length <= 5
          ? `${c.phone_prefix} `
          : prev.phone,
    }));
  }

  // Étape 1 -> Étape 2 : vérifie en base que l'adresse physique n'appartient à aucune autre agence
  async function nextFromStep0() {
    setError("");
    setBusy(true);
    try {
      await api("/agencies/check-address", {
        body: { address: agency.address, email: agency.email },
        realm: null,
      });
      if (!owner.email) {
        setOwner((o) => ({ ...o, email: agency.email }));
      }
      setStep(1);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Adresse ou e-mail invalide.");
    } finally {
      setBusy(false);
    }
  }

  // Envoi (ou renvoi après 50 s) du code PIN aléatoire à 5 chiffres sur l'e-mail de l'agence
  async function sendPinToEmail() {
    setError("");
    setBusy(true);
    try {
      const targetEmail = agency.email.trim().toLowerCase();
      const res = await api<{ challenge: string; resend_in: number; dev_code?: string }>(
        "/agencies/verification/send",
        { body: { email: targetEmail }, realm: null },
      );
      setChallenge(res.challenge);
      setResendLeft(res.resend_in ?? 50);
      setDevPin(res.dev_code ?? null);
      setPinCode("");
      setPinModalOpen(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Impossible d'envoyer le code PIN.");
    } finally {
      setBusy(false);
    }
  }

  // Validation du PIN à 5 chiffres -> Création immédiate + Audit IA
  async function confirmPinAndRegister(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const check = await api<{ verification_token: string }>("/agencies/verification/check", {
        body: { challenge, code: pinCode.trim() },
        realm: null,
      });

      const result = await api<CreatedResult>("/agencies/register", {
        body: {
          agency,
          owner: {
            ...owner,
            email: owner.email.trim() || agency.email.trim(),
          },
          contract_accepted: contractAccepted,
          verification_token: check.verification_token,
        },
        realm: null,
      });

      setPinModalOpen(false);
      setCreated(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Code PIN incorrect ou création refusée.");
    } finally {
      setBusy(false);
    }
  }

  const stepTitles = [
    "1. Identité & Adresse unique",
    "2. Pays & Devise mondiale",
    "3. Couleur & Bus",
    "4. Administrateur & PIN",
  ];

  const canStep0 =
    agency.name.trim().length >= 2 &&
    agency.email.includes("@") &&
    agency.phone.trim().length >= 7 &&
    agency.address.trim().length >= 12;

  const canStep3 =
    owner.first_name.trim().length >= 2 &&
    owner.last_name.trim().length >= 2 &&
    (owner.email || agency.email).includes("@") &&
    owner.password.length >= 8 &&
    contractAccepted;

  return (
    <div className="partner" style={agencyStyle(agency.primary_color)}>
      {/* Panneau gauche : Photo + Bus vectoriel à la couleur choisie */}
      <section
        className="partner__visual photo-bg"
        style={{ "--photo-custom": 'url("/media/agency-create.jpg")' } as React.CSSProperties}
      >
        <div className="photo-bg__image photo-bg__image--custom" />
        <div className="partner__visual-content">
          <span className="badge">Ouverture d’Agence Sécurisée · Audit IA</span>
          <h1 className="display display-xl">Ouvrez votre compagnie sur VELTRON</h1>
          <p className="lead">
            Votre flotte, vos tarifs dans votre devise nationale, vos 6 comptes employés cloisonnés et votre identifiant
            officiel généré automatiquement.
          </p>
          <BusLivery color={agency.primary_color} name={agency.name || "VOTRE AGENCE"} />
          <div className="chips">
            <span className="badge">✓ Adresse physique unique</span>
            <span className="badge">✓ PIN E-mail 5 chiffres</span>
            <span className="badge">✓ Chiffrement Argon2id & E2EE</span>
          </div>
        </div>
      </section>

      {/* Panneau droit : Assistant 4 étapes OU Résultat de vérification IA */}
      <section className="partner__form">
        {created ? (
          <motion.div
            className="card form-grid"
            style={{ width: "min(100%, 580px)" }}
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <span className="badge">
                {created.status === "active" ? "🟢 Validée automatiquement par l’IA VELTRON" : "🟠 Mise en revue de sécurité"}
              </span>
              <span className="badge mono">Score IA : {created.verification_score}/100</span>
            </div>

            <h2 className="display display-xl" style={{ margin: 0 }}>
              {created.status === "active" ? "Agence opérationnelle !" : "Dossier transmis au Propriétaire VELTRON"}
            </h2>

            {/* Carte d'identifiant unique AG-XXXXXX */}
            <div className="agency-id-box">
              <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
                IDENTIFIANT UNIQUE DE VOTRE AGENCE (À CONSERVER PRÉCIEUSEMENT)
              </span>
              <div className="agency-id-box__row">
                <strong className="mono agency-id-box__code">{created.public_code}</strong>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => {
                    navigator.clipboard?.writeText(created.public_code);
                    setCopied(true);
                  }}
                >
                  {copied ? "✓ Copié" : "Copier l’ID"}
                </button>
              </div>
              <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
                Cet ID vous sera demandé sur « J’ai une agence » avec le nom <strong>{agency.name}</strong> et votre e-mail.
              </span>
            </div>

            <p style={{ margin: 0 }}>{created.verification_report.summary}</p>

            {/* Détail des points contrôlés par le système IA */}
            <ul className="call-list">
              {created.verification_report.checks.map((chk) => (
                <li key={chk.code} className="call-row">
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span>
                      {chk.ok ? "✅" : "⚠️"} {chk.label}
                    </span>
                    <span className="mono muted">+{chk.points} pts</span>
                  </div>
                </li>
              ))}
            </ul>

            {created.status !== "active" && (
              <div className="demo-note">
                <strong>Qui vérifie votre dossier ?</strong>
                <p style={{ margin: "6px 0 0" }}>
                  Le système IA VELTRON a détecté un point nécessitant une confirmation humaine et a{" "}
                  <strong>transmis immédiatement une alerte (E-mail + lien WhatsApp direct) au propriétaire VELTRON</strong>{" "}
                  avec vos coordonnées (<span className="mono">{agency.email}</span> / <span className="mono">{agency.phone}</span>)
                  afin de vous contacter et débloquer votre agence rapidement.
                </p>
              </div>
            )}

            <div className="wizard-actions" style={{ flexWrap: "wrap" }}>
              <Link to="/agence/connexion" className="btn btn--lg">
                Se connecter à « J’ai une agence » →
              </Link>
              {created.status === "active" && (
                <Link to={`/passager/a/${created.slug}`} className="btn btn--ghost btn--lg">
                  Voir ma page publique
                </Link>
              )}
            </div>
          </motion.div>
        ) : (
          <div className="card form-grid" style={{ width: "min(100%, 560px)" }}>
            <ol className="stepper">
              {stepTitles.map((label, i) => (
                <li key={label} className={i === step ? "is-active" : i < step ? "is-done" : ""}>
                  {label}
                </li>
              ))}
            </ol>

            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                className="form-grid"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.25 }}
              >
                {step === 0 && (
                  <>
                    <label className="field">
                      <span className="field__label">Nom officiel de l’agence</span>
                      <input
                        className="input"
                        placeholder="Ex. Trans-Atlantique Express"
                        value={agency.name}
                        onChange={(e) => setAgency({ ...agency, name: e.target.value })}
                      />
                    </label>

                    <div className="search-grid">
                      <label className="field">
                        <span className="field__label">N° d’immatriculation légale (RCCM / SIRET / NINEA)</span>
                        <input
                          className="input"
                          placeholder="Ex. RC/DLA/2026/B/1480"
                          value={agency.legal_id}
                          onChange={(e) => setAgency({ ...agency, legal_id: e.target.value })}
                        />
                      </label>
                      <label className="field">
                        <span className="field__label">Ville du siège</span>
                        <input
                          className="input"
                          placeholder="Ex. Douala"
                          value={agency.city_name}
                          onChange={(e) => setAgency({ ...agency, city_name: e.target.value })}
                        />
                      </label>
                    </div>

                    <label className="field">
                      <span className="field__label">Adresse physique complète (unique — jamais partagée par 2 agences)</span>
                      <input
                        className="input"
                        placeholder="Quartier, boulevard/rue, numéro et repère précis de la gare"
                        value={agency.address}
                        onChange={(e) => setAgency({ ...agency, address: e.target.value })}
                      />
                    </label>

                    <div className="search-grid">
                      <label className="field">
                        <span className="field__label">E-mail officiel de l’agence (recevra le PIN à 5 chiffres)</span>
                        <input
                          className="input"
                          type="email"
                          placeholder="direction@mon-agence.com"
                          value={agency.email}
                          onChange={(e) => setAgency({ ...agency, email: e.target.value })}
                        />
                      </label>
                      <label className="field">
                        <span className="field__label">Téléphone / WhatsApp</span>
                        <input
                          className="input"
                          type="tel"
                          placeholder="+237 690 00 00 00"
                          value={agency.phone}
                          onChange={(e) => setAgency({ ...agency, phone: e.target.value })}
                        />
                      </label>
                    </div>
                  </>
                )}

                {step === 1 && (
                  <>
                    <label className="field">
                      <span className="field__label">
                        Rechercher parmi les {countries.length} pays du monde (classés par ordre alphabétique)
                      </span>
                      <input
                        className="input"
                        placeholder="Tapez un pays, un code ISO ou une devise (ex. Canada, Sénégal, JPY…)"
                        value={countrySearch}
                        onChange={(e) => setCountrySearch(e.target.value)}
                      />
                    </label>

                    <label className="field">
                      <span className="field__label">Pays d’implantation (A → Z)</span>
                      <select
                        className="select"
                        size={7}
                        style={{ height: "auto" }}
                        value={agency.country_id}
                        onChange={(e) => pickCountry(Number(e.target.value))}
                      >
                        {filteredCountries.map((c) => (
                          <option key={c.id} value={c.id}>
                            {i18n.language === "en" ? c.name_en : c.name_fr} ({c.iso2}) — {c.default_currency}{" "}
                            {c.currency_name ? `· ${c.currency_name}` : ""} ({c.phone_prefix})
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className="search-grid">
                      <label className="field">
                        <span className="field__label">Devise officielle associée</span>
                        <select
                          className="select"
                          value={agency.currency_code}
                          onChange={(e) => setAgency({ ...agency, currency_code: e.target.value })}
                        >
                          {currencies.map((cur) => (
                            <option key={cur.code} value={cur.code}>
                              {cur.code} — {cur.name} ({cur.symbol})
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="field">
                        <span className="field__label">Indicatif téléphonique</span>
                        <div className="input mono" style={{ display: "flex", alignItems: "center" }}>
                          {selectedCountry ? `${selectedCountry.name_fr} (${selectedCountry.phone_prefix})` : "—"}
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {step === 2 && (
                  <>
                    <span className="field__label">Choisissez la couleur officielle de votre compagnie</span>
                    <div className="swatches">
                      {SWATCHES.map((hex) => (
                        <button
                          key={hex}
                          type="button"
                          aria-label={hex}
                          className={hex === agency.primary_color ? "swatch is-active" : "swatch"}
                          style={{ background: hex }}
                          onClick={() => setAgency({ ...agency, primary_color: hex })}
                        />
                      ))}
                      <input
                        type="color"
                        value={agency.primary_color}
                        onChange={(e) => setAgency({ ...agency, primary_color: e.target.value.toUpperCase() })}
                        title="Couleur personnalisée"
                      />
                    </div>
                    <p className="muted" style={{ fontSize: "var(--text-sm)", margin: 0 }}>
                      Votre espace agence, vos billets PDF/QR et la carrosserie illustrée de vos bus adopteront automatiquement cette identité.
                    </p>
                  </>
                )}

                {step === 3 && (
                  <>
                    <p className="muted" style={{ margin: 0, fontSize: "var(--text-sm)" }}>
                      Ce compte principal est le compte <strong>Administrateur</strong>. Une fois l’agence ouverte, vous pourrez
                      créer les comptes isolés pour la <strong>Secrétaire</strong>, les <strong>Chauffeurs</strong>, la{" "}
                      <strong>Programmation</strong>, la <strong>Comptabilité</strong> et le <strong>Personnel</strong>.
                    </p>
                    <div className="search-grid">
                      <label className="field">
                        <span className="field__label">Prénom de l’administrateur</span>
                        <input
                          className="input"
                          value={owner.first_name}
                          onChange={(e) => setOwner({ ...owner, first_name: e.target.value })}
                        />
                      </label>
                      <label className="field">
                        <span className="field__label">Nom de l’administrateur</span>
                        <input
                          className="input"
                          value={owner.last_name}
                          onChange={(e) => setOwner({ ...owner, last_name: e.target.value })}
                        />
                      </label>
                    </div>
                    <label className="field">
                      <span className="field__label">E-mail personnel de l’administrateur</span>
                      <input
                        className="input"
                        type="email"
                        value={owner.email}
                        onChange={(e) => setOwner({ ...owner, email: e.target.value })}
                      />
                    </label>
                    <label className="field">
                      <span className="field__label">Mot de passe haute sécurité (8 caractères min., chiffré Argon2id)</span>
                      <input
                        className="input"
                        type="password"
                        minLength={8}
                        value={owner.password}
                        onChange={(e) => setOwner({ ...owner, password: e.target.value })}
                      />
                    </label>

                    <div className="card form-grid" style={{ padding: 14 }}>
                      <strong>💳 Compte de réception des paiements de l’agence (versement direct)</strong>
                      <p className="muted" style={{ margin: 0, fontSize: "var(--text-xs)" }}>
                        Lorsqu’un passager achète un billet en ligne, l’argent est directement déduit de son compte et versé sur ce compte de l’agence (net des 0,5 % VELTRON).
                      </p>
                      <div className="search-grid">
                        <label className="field">
                          <span className="field__label">Mode de réception</span>
                          <select
                            className="select"
                            value={agency.payout_method}
                            onChange={(e) => setAgency({ ...agency, payout_method: e.target.value })}
                          >
                            <option value="orange_money">🍊 Orange Money</option>
                            <option value="mtn_momo">💛 MTN Mobile Money</option>
                            <option value="wave">🌊 Wave</option>
                            <option value="bank_transfer">🏦 Virement Bancaire / IBAN</option>
                            <option value="card">💳 Carte / Stripe</option>
                          </select>
                        </label>
                        <label className="field">
                          <span className="field__label">Numéro Mobile Money ou IBAN de l’agence</span>
                          <input
                            className="input"
                            placeholder={agency.phone || "+237 690 00 00 00"}
                            value={agency.payout_account_number}
                            onChange={(e) => setAgency({ ...agency, payout_account_number: e.target.value })}
                          />
                        </label>
                        <label className="field">
                          <span className="field__label">Titulaire du compte</span>
                          <input
                            className="input"
                            placeholder={agency.name || "Nom de la compagnie"}
                            value={agency.payout_account_name}
                            onChange={(e) => setAgency({ ...agency, payout_account_name: e.target.value })}
                          />
                        </label>
                      </div>
                    </div>

                    <div className="demo-note" style={{ display: "grid", gap: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <strong>📜 Contrat de Partenariat Commercial VELTRON</strong>
                        <span className="badge mono">Commission : 0,5 % / voyage</span>
                      </div>
                      <p className="muted" style={{ margin: 0, fontSize: "var(--text-xs)", lineHeight: 1.5 }}>
                        En ouvrant votre compagnie sur la plateforme <strong>VELTRON</strong>, vous acceptez qu’une
                        redevance technologique de <strong>0,5 % (zéro virgule cinq pour cent)</strong> sur le montant
                        totalisé des billets de chaque voyage soit automatiquement prélevée et versée sur le compte du
                        propriétaire de la plateforme VELTRON dès qu’un bus est plein ou qu’un départ est lancé. Votre
                        agence conserve <strong>99,5 %</strong> du chiffre d’affaires de chaque départ.
                      </p>
                      <label className="consent" style={{ marginTop: 4 }}>
                        <input
                          type="checkbox"
                          checked={contractAccepted}
                          onChange={(e) => setContractAccepted(e.target.checked)}
                        />
                        <span>
                          J’ai lu et j’accepte les termes du contrat VELTRON stipulant le reversement automatique de{" "}
                          <strong>0,5 % sur le montant totalisé de chaque voyage</strong> au propriétaire VELTRON.
                        </span>
                      </label>
                    </div>
                  </>
                )}
              </motion.div>
            </AnimatePresence>

            {error && !pinModalOpen && (
              <p className="error" role="alert">
                {error}
              </p>
            )}

            <div className="wizard-actions">
              {step > 0 && (
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => {
                    setError("");
                    setStep(step - 1);
                  }}
                >
                  ← Retour
                </button>
              )}

              {step === 0 && (
                <button type="button" className="btn" disabled={!canStep0 || busy} onClick={nextFromStep0}>
                  {busy ? "Vérification de l’adresse…" : "Vérifier l’adresse & Continuer →"}
                </button>
              )}

              {step === 1 && (
                <button type="button" className="btn" disabled={!agency.country_id} onClick={() => setStep(2)}>
                  Suivant →
                </button>
              )}

              {step === 2 && (
                <button type="button" className="btn" onClick={() => setStep(3)}>
                  Suivant →
                </button>
              )}

              {step === 3 && (
                <button type="button" className="btn btn--lg" disabled={!canStep3 || busy} onClick={sendPinToEmail}>
                  {busy ? "Envoi du code PIN…" : "Recevoir mon code PIN (5 chiffres) & Créer →"}
                </button>
              )}
            </div>
          </div>
        )}
      </section>

      {/* FENÊTRE MODALE DE CONFIRMATION D'APPARTENANCE DE L'E-MAIL (PIN 5 CHIFFRES) */}
      {pinModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <motion.form
            className="modal-panel card form-grid"
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            onSubmit={confirmPinAndRegister}
          >
            <div className="modal-panel__head">
              <span className="badge">Sécurité Anti-Usurpation VELTRON</span>
              <button
                type="button"
                className="btn btn--icon"
                onClick={() => setPinModalOpen(false)}
                aria-label="Fermer"
              >
                ✕
              </button>
            </div>

            <h2 className="subheading" style={{ margin: 0 }}>
              Confirmez que l’adresse {agency.email} vous appartient
            </h2>
            <p className="muted" style={{ margin: 0, fontSize: "var(--text-sm)" }}>
              Nous venons d’envoyer un <strong>code PIN aléatoire à 5 chiffres</strong> sur{" "}
              <strong className="mono">{agency.email}</strong>. Entrez-le ci-dessous pour finaliser l’ouverture de votre agence.
            </p>

            {devPin && (
              <div className="demo-note">
                Mode local sans serveur SMTP externe — Code PIN généré dans <code>backend/verification.log</code> :{" "}
                <strong className="mono" style={{ fontSize: "var(--text-lg)", color: "var(--text)" }}>
                  {devPin}
                </strong>{" "}
                <button type="button" className="chip" onClick={() => setPinCode(devPin)}>
                  Insérer
                </button>
              </div>
            )}

            <label className="field">
              <span className="field__label">Code PIN à 5 chiffres</span>
              <input
                className="input pin-input mono"
                inputMode="numeric"
                pattern="\d{5}"
                maxLength={5}
                placeholder="• • • • •"
                required
                autoFocus
                value={pinCode}
                onChange={(e) => setPinCode(e.target.value.replace(/\D/g, "").slice(0, 5))}
              />
            </label>

            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
              <button
                type="button"
                className="btn btn--ghost"
                disabled={resendLeft > 0 || busy}
                onClick={sendPinToEmail}
              >
                {resendLeft > 0 ? `Renvoyer un code (${resendLeft} s)` : "Renvoyer un nouveau code PIN"}
              </button>

              <button type="submit" className="btn btn--lg" disabled={pinCode.length !== 5 || busy}>
                {busy ? "Vérification IA en cours…" : "Valider le code & Ouvrir l’agence"}
              </button>
            </div>
          </motion.form>
        </div>
      )}
    </div>
  );
}
