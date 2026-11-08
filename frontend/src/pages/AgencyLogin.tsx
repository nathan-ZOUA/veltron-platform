import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { api, ApiError } from "../core/api";
import { useAuth } from "../core/auth";
import type { AgencySession } from "../core/types";

const DEMO_ACCOUNTS = [
  { label: "Administrateur (Owner)", email: "owner.equateur@veltron.test" },
  { label: "Secrétaire (Guichet)", email: "desk.equateur@veltron.test" },
  { label: "Chauffeur (Jean-Paul)", email: "driver1.equateur@veltron.test" },
  { label: "Personnel", email: "staff.equateur@veltron.test" },
  { label: "Programmation", email: "prog.equateur@veltron.test" },
  { label: "Comptable", email: "compta.equateur@veltron.test" },
];

// Connexion "J'ai une agence" (/agence/connexion) :
export default function AgencyLogin() {
  const { t } = useTranslation();
  const { saveAgencyLogin } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    public_code: "",
    agency_name: "",
    email: "",
    password: "",
  });

  const [step, setStep] = useState<"credentials" | "otp">("credentials");
  const [challenge, setChallenge] = useState("");
  const [maskedEmail, setMaskedEmail] = useState("");
  const [detectedRole, setDetectedRole] = useState("");
  const [otp, setOtp] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [resendLeft, setResendLeft] = useState(0);

  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Compte à rebours strict de 50 secondes avant de pouvoir réinitialiser / renvoyer un code
  useEffect(() => {
    if (resendLeft <= 0) return;
    const id = window.setInterval(() => setResendLeft((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(id);
  }, [resendLeft]);

  function fillDemo(email: string) {
    setForm({
      public_code: "AG-EQT001",
      agency_name: "Équateur Voyages",
      email,
      password: "Veltron#2026",
    });
    setError("");
  }

  async function initiate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await api<{
        challenge: string;
        masked_email: string;
        agency_name: string;
        role: string;
        resend_in: number;
        dev_code?: string;
      }>("/agency/auth/initiate", {
        body: {
          public_code: form.public_code.trim().toUpperCase(),
          agency_name: form.agency_name.trim(),
          email_or_matricule: form.email.trim(),
          email: form.email.trim(),
          password: form.password,
        },
        realm: null,
      });
      setChallenge(res.challenge);
      setMaskedEmail(res.masked_email);
      setDetectedRole(res.role);
      setResendLeft(res.resend_in ?? 50);
      setDevCode(res.dev_code ?? null);
      setOtp("");
      setStep("otp");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Vérification impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function resendOtp() {
    setBusy(true);
    setError("");
    try {
      const res = await api<{ challenge: string; resend_in: number; dev_code?: string }>("/agency/auth/resend", {
        body: { challenge },
        realm: null,
      });
      setChallenge(res.challenge);
      setResendLeft(res.resend_in ?? 50);
      setDevCode(res.dev_code ?? null);
      setOtp("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Renvoi refusé.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await api<{ token: string; session: AgencySession }>("/agency/auth/verify", {
        body: { challenge, code: otp.trim() },
        realm: null,
      });
      saveAgencyLogin(res.token, res.session);
      navigate("/agence/espace");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Code de validation invalide.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <section
        className="auth__visual photo-bg"
        style={{ "--photo-custom": 'url("/media/agency-login.jpg")' } as React.CSSProperties}
      >
        <div className="photo-bg__image photo-bg__image--custom" />
        <motion.div
          className="auth__visual-content"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
        >
          <span className="badge">Authentification Multi-Facteurs Agence</span>
          <h2 className="display display-xl">J’ai déjà une agence sur VELTRON</h2>
          <p className="muted">
            Pour protéger vos recettes, vos manifestes passagers et vos communications d’équipe contre tout piratage,
            chaque session requiert votre <strong>ID Agence automatique</strong>, le nom de la compagnie, vos identifiants
            personnels et un <strong>code de validation à 5 chiffres</strong> envoyé par e-mail.
          </p>
          <Link to="/agence/creer" className="btn btn--ghost">
            Pas encore inscrit ? Créer une agence →
          </Link>
        </motion.div>
      </section>

      <section className="auth__panel">
        {step === "credentials" ? (
          <motion.form
            className="form-grid auth__form"
            style={{ width: "min(100%, 480px)", display: "flex", flexDirection: "column", gap: 16 }}
            onSubmit={initiate}
            initial={{ opacity: 0, x: 28 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <div>
              <span className="badge" style={{ background: "rgba(140, 107, 184, 0.15)", color: "var(--accent)" }}>
                🏢 {t("agencyNav.hub")}
              </span>
              <h1 className="heading display-md" style={{ margin: "8px 0 4px" }}>
                {t("agencyLogin.title")}
              </h1>
              <p className="muted" style={{ margin: 0, fontSize: "var(--text-xs)" }}>
                {t("agencyLogin.step1Subtitle")}
              </p>
            </div>

            <div className="search-grid" style={{ gap: 12 }}>
              <label className="field">
                <span className="field__label">{t("agencyLogin.publicCode")}</span>
                <input
                  className="input mono"
                  required
                  placeholder="AG-EQT001"
                  value={form.public_code}
                  onChange={(e) => setForm({ ...form, public_code: e.target.value.toUpperCase() })}
                />
              </label>

              <label className="field">
                <span className="field__label">{t("agencyLogin.agencyName")}</span>
                <input
                  className="input"
                  required
                  placeholder="Équateur Voyages"
                  value={form.agency_name}
                  onChange={(e) => setForm({ ...form, agency_name: e.target.value })}
                />
              </label>
            </div>

            <label className="field">
              <span className="field__label">{t("agencyLogin.email")}</span>
              <input
                className="input"
                required
                placeholder="prenom.nom@mon-agence.com ou Matricule"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </label>

            <label className="field">
              <span className="field__label">{t("agencyLogin.password")}</span>
              <input
                className="input"
                type="password"
                required
                placeholder="••••••••"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </label>

            {error && (
              <p className="error" role="alert" style={{ margin: "2px 0" }}>
                {error}
              </p>
            )}

            <button type="submit" className="btn btn--lg" disabled={busy} style={{ marginTop: 4, height: 48, fontSize: "var(--text-sm)", fontWeight: 700 }}>
              {busy ? t("common.loading") : t("agencyLogin.btnContinue")}
            </button>

            <div style={{ textAlign: "center", padding: "4px 0" }}>
              <Link to="/agence/rejoindre" className="link" style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--accent)" }}>
                👉 {t("agencyNav.join")} →
              </Link>
            </div>

            {/* Comptes de test sous accordéon épuré (ne surcharge jamais la page) */}
            <details className="demo-accordion">
              <summary>💡 {t("agencyLogin.demoShortcut")}</summary>
              <div className="chips" style={{ marginTop: 10 }}>
                {DEMO_ACCOUNTS.map((acc) => (
                  <button key={acc.email} type="button" className="chip" onClick={() => fillDemo(acc.email)}>
                    {acc.label}
                  </button>
                ))}
              </div>
            </details>
          </motion.form>
        ) : (
          <motion.form
            className="card form-grid auth__form"
            style={{ width: "min(100%, 500px)" }}
            onSubmit={verifyOtp}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <span className="badge">Étape 2/2 · {t("agencyLogin.title")}</span>
              <span className="badge mono">{t("agencyLogin.roleDetected")} : {detectedRole.toUpperCase()}</span>
            </div>

            <h1 className="subheading" style={{ fontSize: "var(--text-xl)", margin: 0 }}>
              {t("agencyLogin.step2Subtitle")}
            </h1>
            <p className="muted" style={{ margin: 0 }}>
              Un code à <strong>5 chiffres</strong> vient d’être envoyé à <strong className="mono">{maskedEmail}</strong>{" "}
              pour déverrouiller votre accès à <strong>{form.agency_name}</strong>.
            </p>

            {devCode && (
              <div className="demo-note">
                Mode local (journal <code>backend/verification.log</code>) — Code reçu :{" "}
                <strong className="mono" style={{ fontSize: "var(--text-lg)", color: "var(--text)" }}>
                  {devCode}
                </strong>{" "}
                <button type="button" className="chip" onClick={() => setOtp(devCode)}>
                  Insérer
                </button>
              </div>
            )}

            <label className="field">
              <span className="field__label">{t("agencyLogin.pinPlaceholder")}</span>
              <input
                className="input pin-input mono"
                inputMode="numeric"
                pattern="\d{5}"
                maxLength={5}
                placeholder="• • • • •"
                required
                autoFocus
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 5))}
              />
            </label>

            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}

            <button type="submit" className="btn btn--lg" disabled={otp.length !== 5 || busy}>
              {busy ? t("common.loading") : t("agencyLogin.btnVerify")}
            </button>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
              <button
                type="button"
                className="btn btn--ghost"
                disabled={resendLeft > 0 || busy}
                onClick={resendOtp}
              >
                {resendLeft > 0
                  ? `${t("agencyLogin.resendIn")} ${resendLeft} s`
                  : t("agencyLogin.btnResend")}
              </button>

              <button
                type="button"
                className="link"
                onClick={() => {
                  setStep("credentials");
                  setError("");
                }}
              >
                {t("agencyLogin.btnBack")}
              </button>
            </div>
          </motion.form>
        )}
      </section>
    </div>
  );
}

