import { useState, useEffect } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { api, ApiError } from "../core/api";

const AVAILABLE_MODULES = [
  { id: "desk", label: "Guichet & Vente", icon: "🎟️", desc: "Émission de billets, encaissement espèces / Momo / Carte, gestion bagages" },
  { id: "boarding", label: "Embarquement & Quai", icon: "📋", desc: "Appel des passagers, sièges verts/rouges, remplacement passagers sans bagages" },
  { id: "fleet", label: "Flotte & Bus", icon: "🚌", desc: "Affectation des bus, immatriculations, disposition des sièges" },
  { id: "tracking", label: "Suivi GPS en Direct", icon: "🗺️", desc: "Localisation Maps en direct, signal chauffeur, vue globale agence" },
  { id: "rentals", label: "Location & Devis", icon: "🤝", desc: "Gestion des demandes de location de bus et chiffrage des devis" },
  { id: "sales", label: "Bourse & Vente de Bus", icon: "🛒", desc: "Petites annonces de véhicules et opportunités de flotte" },
  { id: "analytics", label: "Statistiques & Ventes", icon: "📊", desc: "Diagrammes de chiffre d'affaires (journalier, hebdo, mensuel, annuel)" },
  { id: "cash_journal", label: "Journal de Caisse", icon: "💼", desc: "Bilan comptable quotidien, total espèces, mobile money et cartes" },
  { id: "settings", label: "Sécurité & Accès", icon: "⚙️", desc: "Gestion des autorisations et audit de traçabilité" },
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
  const [generatedMatricule, setGeneratedMatricule] = useState<string>("");
  const [agencyName, setAgencyName] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [busy, setBusy] = useState<boolean>(false);

  // Mise à jour automatique des modules par défaut quand le rôle change
  useEffect(() => {
    switch (form.requested_role) {
      case "secretary":
        setSelectedModules(["desk", "cash_journal", "fleet"]);
        break;
      case "staff":
        setSelectedModules(["boarding", "tracking"]);
        break;
      case "driver":
        setSelectedModules(["tracking", "trips"]);
        break;
      case "manager":
        setSelectedModules(["desk", "boarding", "fleet", "tracking", "rentals", "sales", "analytics"]);
        break;
      case "accountant":
        setSelectedModules(["analytics", "cash_journal", "sales"]);
        break;
      case "other":
        // Laisse l'utilisateur choisir ses cercles
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
    <div className="auth-wrap">
      <section className="auth-card" style={{ maxWidth: step === "form" ? 640 : 540 }}>
        {/* ÉTAPE 1 : FORMULAIRE DE CANDIDATURE / ADHÉSION */}
        {step === "form" && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <span className="badge" style={{ background: "rgba(140, 107, 184, 0.15)", color: "var(--accent)" }}>
              🏢 Espace Collaborateur VELTRON
            </span>
            <h1 className="heading display-md" style={{ margin: "8px 0 4px" }}>
              Rejoindre une Agence Partenaire
            </h1>
            <p className="muted" style={{ margin: "0 0 var(--space-4)", fontSize: "var(--text-sm)" }}>
              Entrez le code d'accès fourni par votre direction, choisissez votre poste ou composez vos cercles métier. Votre compte sera instantanément soumis pour validation.
            </p>

            <form onSubmit={handleSubmit} className="stack" style={{ gap: "var(--space-3)" }}>
              <div className="search-grid">
                <label className="field">
                  <span className="field__label">Code d'accès agence (fourni par l'admin) *</span>
                  <input
                    className="input"
                    type="text"
                    required
                    placeholder="Ex: AG-EQT001"
                    value={form.agency_code}
                    onChange={(e) => setForm({ ...form, agency_code: e.target.value.toUpperCase() })}
                  />
                </label>

                <label className="field">
                  <span className="field__label">Poste / Rôle souhaité *</span>
                  <select
                    className="select"
                    value={form.requested_role}
                    onChange={(e) => setForm({ ...form, requested_role: e.target.value })}
                  >
                    <option value="secretary">🎟️ Secrétaire / Guichetier(e)</option>
                    <option value="staff">📋 Agent d'Embarquement & Quai</option>
                    <option value="driver">🚌 Chauffeur de Bus</option>
                    <option value="manager">📊 Responsable Programmation</option>
                    <option value="accountant">💰 Comptable / Trésorier</option>
                    <option value="other">⚙️ Autre rôle (Personnalisé avec cercles)</option>
                  </select>
                </label>
              </div>

              {form.requested_role === "other" && (
                <label className="field">
                  <span className="field__label">Intitulé de votre poste personnalisé *</span>
                  <input
                    className="input"
                    type="text"
                    required
                    placeholder="Ex: Contrôleur de bord, Responsable Bagages, Logisticien..."
                    value={form.custom_role_title}
                    onChange={(e) => setForm({ ...form, custom_role_title: e.target.value })}
                  />
                </label>
              )}

              {/* SECTION DES CERCLES MÉTIER POUR COMPOSER LE TABLEAU DE BORD */}
              <div style={{ marginTop: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: "var(--text-xs)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    🎯 Cercles Métier & Modules de votre futur tableau de bord :
                  </span>
                  <span className="muted" style={{ fontSize: 11 }}>
                    {selectedModules.length} module(s) actif(s)
                  </span>
                </div>
                <p className="muted" style={{ margin: "0 0 10px", fontSize: "var(--text-xs)" }}>
                  Sélectionnez les cercles correspondants à vos responsabilités dans l'agence. VELTRON adaptera automatiquement votre interface :
                </p>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))",
                    gap: 8,
                  }}
                >
                  {AVAILABLE_MODULES.map((mod) => {
                    const isSelected = selectedModules.includes(mod.id);
                    return (
                      <button
                        key={mod.id}
                        type="button"
                        onClick={() => toggleModule(mod.id)}
                        className="card card--interactive"
                        style={{
                          padding: "8px 10px",
                          borderRadius: 8,
                          textAlign: "start",
                          background: isSelected ? "rgba(140, 107, 184, 0.12)" : "var(--surface)",
                          border: isSelected ? "2px solid var(--accent)" : "1px solid var(--border)",
                          cursor: "pointer",
                          transition: "all 0.15s ease",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: "var(--text-xs)" }}>
                          <span>{mod.icon}</span>
                          <span style={{ color: isSelected ? "var(--accent)" : "inherit" }}>{mod.label}</span>
                          {isSelected && <span style={{ marginLeft: "auto", color: "var(--accent)" }}>✓</span>}
                        </div>
                        <div className="muted" style={{ fontSize: 10, marginTop: 4, lineHeight: 1.3 }}>
                          {mod.desc}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="search-grid" style={{ marginTop: 8 }}>
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

              <div className="search-grid">
                <label className="field">
                  <span className="field__label">Adresse e-mail personnelle *</span>
                  <input
                    className="input"
                    type="email"
                    required
                    placeholder="alain.talla@gmail.com"
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

              {error && <p className="error">{error}</p>}

              <button type="submit" className="btn btn--lg" disabled={busy} style={{ marginTop: 8 }}>
                {busy ? "Envoi de la demande..." : "Envoyer ma demande pour validation admin →"}
              </button>

              <div style={{ textAlign: "center", marginTop: 4 }}>
                <Link to="/agence/connexion" className="link" style={{ fontSize: "var(--text-xs)" }}>
                  ← Déjà validé ? Se connecter à l'espace agence
                </Link>
              </div>
            </form>
          </motion.div>
        )}

        {/* ÉTAPE 2 : ÉCRAN D'ATTENTE DE VALIDATION PAR L'ADMINISTRATEUR */}
        {step === "pending" && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>⏳</div>
            <span className="badge" style={{ background: "rgba(245, 158, 11, 0.15)", color: "#d97706", fontWeight: 700 }}>
              EN ATTENTE DE VALIDATION ADMIN
            </span>
            <h2 className="heading display-md" style={{ margin: "12px 0 8px" }}>
              Demande transmise avec succès !
            </h2>
            <p className="muted" style={{ fontSize: "var(--text-sm)", lineHeight: 1.6 }}>
              Votre demande pour rejoindre l'agence <strong>{agencyName || form.agency_code}</strong> est actuellement en cours de vérification par l'administrateur.
            </p>

            <div
              className="card"
              style={{
                background: "var(--surface-hover)",
                textAlign: "start",
                padding: "var(--space-3)",
                margin: "var(--space-3) 0",
                fontSize: "var(--text-xs)",
                lineHeight: 1.6,
              }}
            >
              🔒 <strong>Sécurité renforcée VELTRON :</strong>
              <br />
              Pour protéger l'agence contre toute tentative d'intrusion ou fraude, l'administrateur examine votre demande avec votre adresse IP et les détails transmis. Dès qu'il valide votre profil, un <strong>matricule unique</strong> vous sera immédiatement délivré.
            </div>

            {error && <p className="error">{error}</p>}

            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
              <button type="button" className="btn btn--lg" onClick={checkStatus} disabled={busy}>
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
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 52, marginBottom: 12 }}>🎉</div>
            <span className="badge" style={{ background: "rgba(16, 185, 129, 0.15)", color: "#10b981", fontWeight: 700 }}>
              ADHÉSION VALIDÉE PAR L'ADMINISTRATEUR
            </span>
            <h2 className="heading display-md" style={{ margin: "12px 0 8px" }}>
              Bienvenue chez {agencyName} !
            </h2>
            <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
              Votre compte a été activé avec succès. Votre identifiant officiel au sein de l'agence a été généré :
            </p>

            {/* CARTE D'AFFICHAGE DU MATRICULE OFFICIEL */}
            <div
              className="card"
              style={{
                background: "linear-gradient(135deg, rgba(140, 107, 184, 0.15), rgba(16, 185, 129, 0.15))",
                borderColor: "var(--accent)",
                padding: "var(--space-4)",
                margin: "var(--space-4) 0",
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
                padding: "var(--space-3)",
                fontSize: "var(--text-xs)",
                lineHeight: 1.5,
                marginBottom: 20,
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
              style={{ width: "100%" }}
            >
              🚀 Accéder à mon espace agence avec mon matricule →
            </button>
          </motion.div>
        )}

        {/* ÉTAPE REJETÉE */}
        {step === "rejected" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>❌</div>
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
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🚨</div>
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
