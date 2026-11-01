import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import AuthorBadge from "../components/AuthorBadge";
import { ApiError } from "../core/api";
import { useAuth } from "../core/auth";

// Connexion / inscription dédiée EXCLUSIVEMENT aux passagers (/passager/connexion)
export default function Auth() {
  const { t } = useTranslation();
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [form, setForm] = useState({
    email: "",
    password: "",
    first_name: "",
    last_name: "",
    phone: "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [field]: e.target.value });

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (mode === "login") {
        await login(form.email, form.password);
      } else {
        await register(form);
      }
      const next = params.get("next");
      navigate(next && next.startsWith("/passager") ? next : "/passager");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  function fillDemo(email: string) {
    setMode("login");
    setForm((f) => ({ ...f, email, password: "Veltron#2026" }));
    setError("");
  }

  return (
    <div className="auth">
      <section
        className="auth__visual photo-bg"
        style={{ "--photo-custom": 'url("/media/passengers-welcome.jpeg")' } as React.CSSProperties}
      >
        <div className="photo-bg__image photo-bg__image--custom" />
        <motion.div
          className="auth__visual-content"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.75 }}
        >
          <span className="badge">Compte Voyageur VELTRON</span>
          <h2 className="display display-xl">
            Voyagez sereinement, cumulez des points à chaque trajet.
          </h2>
          <ul className="plain-list" style={{ color: "var(--text-muted)" }}>
            <li>Billets QR infalsifiables & remboursement automatique jusqu’à 2 h avant départ</li>
            <li>Points de fidélité annuels cumulés dans chaque agence et échangeables en récompenses</li>
            <li>Suivi en temps réel de votre bus (km/h, bouchons et heure d’arrivée recalculée)</li>
          </ul>
          <AuthorBadge />
        </motion.div>
      </section>

      <section className="auth__panel">
        <motion.form
          className="form-grid auth__form"
          onSubmit={submit}
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.55 }}
        >
          <div className="chips">
            <button
              type="button"
              className={mode === "login" ? "chip is-active" : "chip"}
              onClick={() => {
                setMode("login");
                setError("");
              }}
            >
              Connexion Passager
            </button>
            <button
              type="button"
              className={mode === "register" ? "chip is-active" : "chip"}
              onClick={() => {
                setMode("register");
                setError("");
              }}
            >
              Créer un compte
            </button>
          </div>

          <h1 className="display display-xl">
            {mode === "login" ? t("auth.loginTitle") : t("auth.registerTitle")}
          </h1>

          {mode === "register" && (
            <>
              <div className="search-grid">
                <label className="field">
                  <span className="field__label">{t("auth.first")}</span>
                  <input className="input" required value={form.first_name} onChange={set("first_name")} />
                </label>
                <label className="field">
                  <span className="field__label">{t("auth.last")}</span>
                  <input className="input" required value={form.last_name} onChange={set("last_name")} />
                </label>
              </div>
              <label className="field">
                <span className="field__label">Téléphone (optionnel)</span>
                <input
                  className="input"
                  type="tel"
                  placeholder="+237 6..."
                  value={form.phone}
                  onChange={set("phone")}
                />
              </label>
            </>
          )}

          <label className="field">
            <span className="field__label">{t("auth.email")}</span>
            <input
              className="input"
              type="email"
              required
              autoComplete="email"
              value={form.email}
              onChange={set("email")}
            />
          </label>

          <label className="field">
            <span className="field__label">{t("auth.password")}</span>
            <input
              className="input"
              type="password"
              required
              minLength={mode === "register" ? 8 : undefined}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={form.password}
              onChange={set("password")}
            />
          </label>

          <button type="submit" className="btn btn--lg" disabled={busy}>
            {busy ? "Connexion en cours…" : mode === "login" ? "Se connecter" : "Créer mon compte passager"}
          </button>

          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}

          <div className="demo-note">
            <strong>Comptes passagers de démonstration (1 clic) :</strong>
            <div className="chips" style={{ marginTop: 8 }}>
              <button type="button" className="chip" onClick={() => fillDemo("passager1@veltron.test")}>
                Amina (40 pts fidélité)
              </button>
              <button type="button" className="chip" onClick={() => fillDemo("passager2@veltron.test")}>
                Brice (voyageur)
              </button>
            </div>
          </div>

          <p className="muted" style={{ fontSize: "var(--text-xs)" }}>
            Vous représentez une compagnie de transport ? Rendez-vous sur{" "}
            <Link to="/agence" className="link">
              l’Espace Agence dédié
            </Link>
            .
          </p>
        </motion.form>
      </section>
    </div>
  );
}
