import { useState, useEffect } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { api, ApiError } from "../core/api";

const AVAILABLE_MODULES = [
  { id: "desk", label: "Guichet & Vente", icon: "🎟️" },
  { id: "boarding", label: "Embarquement & Quai", icon: "📋" },
  { id: "fleet", label: "Flotte & Bus", icon: "🚌" },
  { id: "tracking", label: "Suivi GPS en Direct", icon: "🗺️" },
  { id: "rentals", label: "Location de Bus", icon: "🤝" },
  { id: "sales", label: "Bourse & Vente de Bus", icon: "🛒" },
  { id: "analytics", label: "Diagramme des Ventes", icon: "📊" },
  { id: "cash_journal", label: "Journal de Caisse & Compta", icon: "💼" },
  { id: "settings", label: "Sécurité & Audit", icon: "⚙️" },
];

export default function AgencyJoin() {
  const navigate = useNavigate();

  const [step, setStep] = useState<"form" | "pending" | "approved" | "rejected" | "reported">("form");
  const [form, setForm] = useState({
    agency_code: "AG-EQT001",
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    password: "",
    requested_role: "secretary",
    custom_role_title: "",
  });

  const [selectedModules, setSelectedModules] = useState<string[]>(["desk", "cash_journal"]);
  const [showCustomCircles, setShowCustomCircles] = useState(false);
  const [generatedMatricule, setGeneratedMatricule] = useState<string>("");
  const [agencyName, setAgencyName] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [busy, setBusy] = useState<boolean>(false);

  // Mise à jour automatique des modules par défaut quand le rôle change
  useEffect(() => {
    switch (form.requested_role) {
      case "secretary":
        setSelectedModules(["desk", "cash_journal"]);
        break;
      case "staff":
        setSelectedModules(["boarding"]);
        break;
      case "driver":
        setSelectedModules(["tracking"]);
        break;
      case "manager":
        setSelectedModules(["fleet", "tracking"]);
        break;
      case "accountant":
        setSelectedModules(["cash_journal", "analytics"]);
        break;
      case "other":
        setShowCustomCircles(true);
        break;
    }
  }, [form.requested_role]);

  function toggleModule(id: string) {
    if (selectedModules.includes(id)) {
      setSelectedModules(selectedModules.filter((m) => m !== id));
    } else {
      setSelectedModules([...selectedModules, id]);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);

    try {
      const res = await api<{
        ok: boolean;
        agency_name: string;
        request_id: number;
        status: string;
      }>("/agency/join-request", {
        body: {
          agency_code: form.agency_code.trim().toUpperCase(),
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          password: form.password,
          requested_role: form.requested_role,
          custom_role_title: form.requested_role === "other" ? form.custom_role_title.trim() : form.requested_role,
          modules: selectedModules,
        },
        realm: null,
      });

      setAgencyName(res.agency_name);
      setStep("pending");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors de l'envoi de la demande d'adhésion.");
    } finally {
      setBusy(false);
    }
  }

  // Vérifier le statut de la demande auprès du serveur
  async function checkStatus() {
    setBusy(true);
    setError("");
    try {
      const res = await api<{
        status: "pending" | "approved" | "rejected" | "reported";
        matricule?: string;
        agency_name: string;
      }>(`/agency/join-request/status?agency_code=${encodeURIComponent(form.agency_code.trim())}&email=${encodeURIComponent(form.email.trim())}`, {
        realm: null,
      });

      setAgencyName(res.agency_name);
      if (res.status === "approved" && res.matricule) {
        setGeneratedMatricule(res.matricule);
        setStep("approved");
      } else if (res.status === "rejected") {
        setStep("rejected");
      } else if (res.status === "reported") {
        setStep("reported");
      } else {
        setStep("pending");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Impossible de vérifier le statut.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap photo-bg" style={{ "--photo-custom": 'url("/media/veltron-royal-bus.jpg")', position: "relative" } as React.CSSProperties}>
      <div className="photo-bg__image photo-bg__image--custom" style={{ opacity: 0.25 }} />
      <section className="auth-card" style={{ maxWidth: step === "form" ? 580 : 520 }}>
        {/* ÉTAPE 1 : FORMULAIRE ÉPURÉ, CLAIR ET AÉRÉ */}
        {step === "form" && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <span className="badge" style={{ background: "rgba(140, 107, 184, 0.15)", color: "var(--accent)", fontWeight: 700 }}>
                🏢 Portail Collaborateurs VELTRON
              </span>
              <h1 className="heading display-md" style={{ margin: "8px 0 4px" }}>
                Création de Compte Personnel
              </h1>
              <p className="muted" style={{ margin: 0, fontSize: "var(--text-xs)" }}>
                Rejoignez l'équipe de votre agence avec le code d'accès fourni par votre direction.
              </p>
            </div>

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* SECTION 1 : AFFECTATION & RÔLE */}
              <div className="form-section">
                <h3 className="form-section__title">
                  <span>🏢</span> 1. Agence & Poste de travail
                </h3>

                <div className="search-grid" style={{ gap: 12 }}>
                  <label className="field">
                    <span className="field__label">Code d'accès agence *</span>
                    <input
                      className="input mono"
                      type="text"
                      required
                      placeholder="Ex: AG-EQT001"
                      value={form.agency_code}
                      onChange={(e) => setForm({ ...form, agency_code: e.target.value.toUpperCase() })}
                    />
                  </label>

                  <label className="field">
                    <span className="field__label">Rôle / Poste souhaité *</span>
                    <select
                      className="select"
                      value={form.requested_role}
                      onChange={(e) => setForm({ ...form, requested_role: e.target.value })}
                    >
                      <option value="secretary">🎟️ Secrétaire / Guichet</option>
                      <option value="staff">📋 Personnel d'Embarquement (Quai)</option>
                      <option value="driver">🚌 Chauffeur de Bus</option>
                      <option value="accountant">💰 Comptable / Trésorier</option>
                      <option value="manager">📊 Responsable Programmation</option>
                      <option value="other">⚙️ Autre rôle personnalisé</option>
                    </select>
                  </label>
                </div>

                {form.requested_role === "other" && (
                  <label className="field" style={{ marginTop: 4 }}>
                    <span className="field__label">Intitulé personnalisé de votre fonction *</span>
                    <input
                      className="input"
                      type="text"
                      required
                      placeholder="Ex: Contrôleur de bord, Pointeur de quai..."
                      value={form.custom_role_title}
                      onChange={(e) => setForm({ ...form, custom_role_title: e.target.value })}
                    />
                  </label>
                )}

                {/* Modules inclus & personnalisation sans surcharge visuelle */}
                <div style={{ marginTop: 6, borderTop: "1px dashed var(--border)", paddingTop: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                    <span style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--muted)" }}>
                      Cercles métier attribués :
                    </span>
                    <button
                      type="button"
                      className="link"
                      style={{ fontSize: 11, fontWeight: 600, color: "var(--accent)" }}
                      onClick={() => setShowCustomCircles(!showCustomCircles)}
                    >
                      {showCustomCircles ? "Masquer les cercles ▲" : "⚙️ Ajuster mes cercles ▼"}
                    </button>
                  </div>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                    {selectedModules.map((mId) => {
                      const mod = AVAILABLE_MODULES.find((m) => m.id === mId);
                      return (
                        <span key={mId} className="badge" style={{ background: "rgba(140, 107, 184, 0.12)", color: "var(--accent)", fontSize: 11, padding: "3px 8px", borderRadius: 6 }}>
                          {mod?.icon} {mod?.label}
                        </span>
                      );
                    })}
                  </div>

                  {/* Sélecteur compact de cercles (affiché uniquement à la demande) */}
                  {showCustomCircles && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}
                    >
                      {AVAILABLE_MODULES.map((mod) => {
                        const isSelected = selectedModules.includes(mod.id);
                        return (
                          <button
                            key={mod.id}
                            type="button"
                            onClick={() => toggleModule(mod.id)}
                            className="chip"
                            style={{
                              background: isSelected ? "var(--accent)" : "var(--surface)",
                              color: isSelected ? "#fff" : "inherit",
                              borderColor: isSelected ? "var(--accent)" : "var(--border)",
                              fontSize: 11,
                              cursor: "pointer",
                              padding: "4px 10px",
                            }}
                          >
                            <span>{mod.icon}</span>
                            <span>{mod.label}</span>
                            {isSelected && <span>✓</span>}
                          </button>
                        );
                      })}
                    </motion.div>
                  )}
                </div>
              </div>

              {/* SECTION 2 : IDENTITÉ PERSONNELLE */}
              <div className="form-section">
                <h3 className="form-section__title">
                  <span>👤</span> 2. Vos Coordonnées
                </h3>

                <div className="search-grid" style={{ gap: 12 }}>
                  <label className="field">
                    <span className="field__label">Prénom *</span>
                    <input
                      className="input"
                      type="text"
                      required
                      placeholder="Ex: Alain"
                      value={form.first_name}
                      onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span className="field__label">Nom de famille *</span>
                    <input
                      className="input"
                      type="text"
                      required
                      placeholder="Ex: Talla"
                      value={form.last_name}
                      onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                    />
                  </label>
                </div>

                <div className="search-grid" style={{ gap: 12 }}>
                  <label className="field">
                    <span className="field__label">Adresse e-mail personnelle *</span>
                    <input
                      className="input"
                      type="email"
                      required
                      placeholder="prenom.nom@gmail.com"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span className="field__label">Téléphone portable *</span>
                    <input
                      className="input"
                      type="tel"
                      required
                      placeholder="+237 690 00 00 00"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    />
                  </label>
                </div>
              </div>

              {/* SECTION 3 : SÉCURITÉ DU COMPTE */}
              <div className="form-section">
                <h3 className="form-section__title">
                  <span>🔒</span> 3. Mot de passe du compte
                </h3>

                <label className="field">
                  <span className="field__label">Mot de passe personnel (8 caractères minimum) *</span>
                  <input
                    className="input"
                    type="password"
                    required
                    minLength={8}
                    placeholder="••••••••"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                  />
                </label>
              </div>

              {error && <p className="error" style={{ margin: "2px 0" }}>{error}</p>}

              <button
                type="submit"
                className="btn btn--lg"
                disabled={busy}
                style={{ height: 48, fontSize: "var(--text-sm)", fontWeight: 700 }}
              >
                {busy ? "Envoi de la demande en cours..." : "Envoyer ma demande pour validation admin →"}
              </button>

              <div style={{ textAlign: "center", marginTop: 4 }}>
                <Link to="/agence/connexion" className="link" style={{ fontSize: "var(--text-xs)", color: "var(--accent)", fontWeight: 600 }}>
                  ← Déjà membre ? Se connecter à l'espace agence
                </Link>
              </div>
            </form>
          </motion.div>
        )}

        {/* ÉTAPE 2 : ÉCRAN D'ATTENTE DE VALIDATION PAR L'ADMINISTRATEUR */}
        {step === "pending" && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} style={{ textAlign: "center", padding: "10px 4px" }}>
            <div style={{ fontSize: 44, marginBottom: 12 }}>⏳</div>
            <span className="badge" style={{ background: "rgba(245, 158, 11, 0.15)", color: "#d97706", fontWeight: 700 }}>
              EN ATTENTE DE VALIDATION PAR L'ADMINISTRATEUR
            </span>
            <h2 className="heading display-md" style={{ margin: "14px 0 8px" }}>
              Demande transmise avec succès !
            </h2>
            <p className="muted" style={{ fontSize: "var(--text-sm)", lineHeight: 1.6, margin: "0 auto 16px", maxWidth: 420 }}>
              Votre demande pour rejoindre l'agence <strong>{agencyName || form.agency_code}</strong> est en cours d'examen par votre administrateur.
            </p>

            <div
              className="card"
              style={{
                background: "rgba(140, 107, 184, 0.06)",
                textAlign: "start",
                padding: "14px 16px",
                margin: "16px 0",
                fontSize: "var(--text-xs)",
                lineHeight: 1.6,
                border: "1px solid rgba(140, 107, 184, 0.2)",
                borderRadius: 12,
              }}
            >
              🔒 <strong>Sécurité renforcée VELTRON :</strong>
              <br />
              L'administrateur de l'agence a reçu votre demande dans son tableau de bord avec votre adresse IP. Dès qu'il valide votre profil, un <strong>matricule unique</strong> vous sera attribué pour accéder à votre poste.
            </div>

            {error && <p className="error">{error}</p>}

            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 18 }}>
              <button type="button" className="btn btn--lg" onClick={checkStatus} disabled={busy} style={{ height: 46 }}>
                {busy ? "Vérification..." : "🔄 Vérifier l'état de validation"}
              </button>

              <Link to="/agence/connexion" className="link" style={{ fontSize: "var(--text-xs)" }}>
                Retour à la page de connexion
              </Link>
            </div>
          </motion.div>
        )}

        {/* ÉTAPE 3 : COMPTE VALIDÉ AVEC MATRICULE UNIQUE & AVERTISSEMENT */}
        {step === "approved" && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} style={{ textAlign: "center", padding: "10px 4px" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
            <span className="badge" style={{ background: "rgba(16, 185, 129, 0.15)", color: "#10b981", fontWeight: 700 }}>
              ADHÉSION VALIDÉE PAR L'ADMINISTRATEUR
            </span>
            <h2 className="heading display-md" style={{ margin: "14px 0 8px" }}>
              Bienvenue chez {agencyName} !
            </h2>
            <p className="muted" style={{ fontSize: "var(--text-sm)", margin: 0 }}>
              Votre compte a été activé avec succès. Voici votre identifiant officiel :
            </p>

            {/* CARTE D'AFFICHAGE DU MATRICULE OFFICIEL */}
            <div
              className="card"
              style={{
                background: "linear-gradient(135deg, rgba(140, 107, 184, 0.15), rgba(16, 185, 129, 0.15))",
                borderColor: "var(--accent)",
                padding: "20px 16px",
                margin: "18px 0",
                borderRadius: 14,
              }}
            >
              <div style={{ fontSize: "var(--text-xs)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700, color: "var(--accent)" }}>
                Votre Matricule Officiel Unique
              </div>
              <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: "0.08em", color: "#10b981", margin: "8px 0" }}>
                {generatedMatricule}
              </div>
              <div className="badge" style={{ background: "var(--surface)", border: "1px solid var(--border)", fontSize: 11 }}>
                Rôle : {form.requested_role === "other" ? form.custom_role_title : form.requested_role}
              </div>
            </div>

            {/* AVERTISSEMENT DE SÉCURITÉ CONSEILLANT DE BIEN CONSERVER LE MATRICULE */}
            <div
              className="card"
              style={{
                background: "rgba(245, 158, 11, 0.12)",
                borderColor: "#f59e0b",
                color: "#b45309",
                textAlign: "start",
                padding: "14px",
                fontSize: "var(--text-xs)",
                lineHeight: 1.5,
                marginBottom: 20,
                borderRadius: 12,
              }}
            >
              ⚠️ <strong>IMPORTANT — CONSERVEZ PRÉCIEUSEMENT VOTRE MATRICULE :</strong>
              <br />
              Gardez bien ce matricule et ne le perdez sous aucun prétexte. Chaque membre du personnel dispose de son identifiant propre : aucun autre employé ne pourra avoir accès à votre compte ou à vos opérations.
            </div>

            <button
              type="button"
              className="btn btn--lg"
              onClick={() => navigate("/agence/connexion")}
              style={{ width: "100%", height: 48, fontWeight: 700 }}
            >
              🚀 Accéder à mon espace agence avec mon matricule →
            </button>
          </motion.div>
        )}

        {/* ÉTAPE REJETÉE */}
        {step === "rejected" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ textAlign: "center", padding: "16px 4px" }}>
            <div style={{ fontSize: 44, marginBottom: 12 }}>❌</div>
            <h2 className="heading display-md" style={{ color: "#ef4444" }}>
              Demande non retenue
            </h2>
            <p className="muted" style={{ fontSize: "var(--text-sm)", margin: "12px 0 20px" }}>
              L'administrateur de l'agence {agencyName} n'a pas validé votre demande d'adhésion. Veuillez contacter votre direction pour toute clarification.
            </p>
            <button type="button" className="btn btn--outline" onClick={() => setStep("form")}>
              ← Recommencer
            </button>
          </motion.div>
        )}

        {/* ÉTAPE SIGNALÉE FRAUDE */}
        {step === "reported" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ textAlign: "center", padding: "16px 4px" }}>
            <div style={{ fontSize: 44, marginBottom: 12 }}>🚨</div>
            <h2 className="heading display-md" style={{ color: "#b91c1c" }}>
              Accès bloqué & Signalement enregistré
            </h2>
            <p className="muted" style={{ fontSize: "var(--text-sm)", margin: "12px 0 20px" }}>
              Cette tentative d'accès a été formellement signalée par l'administrateur de l'agence pour motif de tentative d'intrusion ou fausse identité. Les traces techniques et l'adresse IP ont été journalisées.
            </p>
            <Link to="/" className="btn btn--ghost">
              Retour à l'accueil
            </Link>
          </motion.div>
        )}
      </section>
    </div>
  );
}
