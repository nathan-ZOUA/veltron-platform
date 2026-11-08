import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useAuth } from "../core/auth";

// Portail d'entrée dédié EXCLUSIVEMENT aux agences (/agence)
export default function AgencyHub() {
  const { t } = useTranslation();
  const { agencySession } = useAuth();

  const ACCOUNT_ROLES = [
    {
      badge: t("agencyHub.role1.badge"),
      title: t("agencyHub.role1.title"),
      desc: t("agencyHub.role1.desc"),
    },
    {
      badge: t("agencyHub.role2.badge"),
      title: t("agencyHub.role2.title"),
      desc: t("agencyHub.role2.desc"),
    },
    {
      badge: t("agencyHub.role3.badge"),
      title: t("agencyHub.role3.title"),
      desc: t("agencyHub.role3.desc"),
    },
    {
      badge: t("agencyHub.role4.badge"),
      title: t("agencyHub.role4.title"),
      desc: t("agencyHub.role4.desc"),
    },
    {
      badge: t("agencyHub.role5.badge"),
      title: t("agencyHub.role5.title"),
      desc: t("agencyHub.role5.desc"),
    },
    {
      badge: t("agencyHub.role6.badge"),
      title: t("agencyHub.role6.title"),
      desc: t("agencyHub.role6.desc"),
    },
  ];

  return (
    <>
      <section
        className="service-hero photo-bg"
        style={{ "--photo-custom": 'url("/media/bus.jpeg")' } as React.CSSProperties}
      >
        <div className="photo-bg__image photo-bg__image--custom" />
        <div className="container service-hero__inner">
          <span className="badge">{t("agencyHub.badge")}</span>
          <h1 className="display display-2xl">
            {t("agencyHub.title")} <span className="title-accent">VELTRON PRO</span>
          </h1>
          <p className="lead">
            {t("agencyHub.lead")}
          </p>

          {agencySession && (
            <div className="demo-note" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
              <span>
                Session active : <strong>{agencySession.agency.name}</strong> (<span className="mono">{agencySession.agency.public_code}</span>) — Connecté en tant que{" "}
                <strong>{agencySession.user.first_name}</strong>
              </span>
              <Link to="/agence/espace" className="btn">
                {t("agencyNav.workspace")} →
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* Deux grands boutons photo : Créer une agence vs J'ai une agence */}
      <section className="section">
        <div className="container">
          <div className="gateway__cards">
            <motion.div
              initial={{ opacity: 0, y: 26 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55 }}
            >
              <Link
                to="/agence/creer"
                className="VisualCard VisualCard--tall VisualCard--pro"
                style={{ "--card-bg": 'url("/media/agency-create.jpg")' } as React.CSSProperties}
              >
                <div className="VisualCard__bg" />
                <div className="VisualCard__shade" />
                <div className="VisualCard__content">
                  <span className="VisualCard__tag">🏢 {t("agencyNav.create")}</span>
                  <h2 className="display display-xl">{t("agencyNav.create")}</h2>
                  <p>
                    {t("partner.subtitle")}
                  </p>
                  <ul className="VisualCard__pills">
                    <li>25 Pays d'Afrique</li>
                    <li>Adresse unique vérifiée</li>
                    <li>PIN E-mail 5 chiffres</li>
                    <li>Audit IA instantané</li>
                  </ul>
                  <span className="VisualCard__cta">
                    {t("agencyHub.btnCreate")} <span aria-hidden="true">→</span>
                  </span>
                </div>
              </Link>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 26 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.12 }}
            >
              <Link
                to="/agence/connexion"
                className="VisualCard VisualCard--tall VisualCard--pro"
                style={{ "--card-bg": 'url("/media/agency-login.jpg")' } as React.CSSProperties}
              >
                <div className="VisualCard__bg" />
                <div className="VisualCard__shade" />
                <div className="VisualCard__content">
                  <span className="VisualCard__tag">🔐 {t("agencyNav.login")}</span>
                  <h2 className="display display-xl">{t("agencyNav.login")}</h2>
                  <p>
                    {t("agencyLogin.step1Subtitle")}
                  </p>
                  <ul className="VisualCard__pills">
                    <li>ID Auto AG-XXXXXX</li>
                    <li>Code validation 5 chiffres</li>
                    <li>Délai renvoi 50 s</li>
                    <li>Accès par rôle isolé</li>
                  </ul>
                  <span className="VisualCard__cta">
                    {t("agencyHub.btnLogin")} <span aria-hidden="true">→</span>
                  </span>
                </div>
              </Link>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Architecture des 6 comptes cloisonnés */}
      <section className="section section--tinted">
        <div className="container">
          <h2 className="display display-xl section-title">{t("agencyHub.rolesTitle")}</h2>
          <p className="muted section-note">
            Aucun employé ne peut accéder au compte ou aux prérogatives d’un autre. Toute l’équipe collabore dans des salons
            chiffrés de bout en bout (<span className="mono">ECDH P-256 + AES-256-GCM</span>) avec thèmes personnalisables.
          </p>

          <div className="agency-grid">
            {ACCOUNT_ROLES.map((item, idx) => (
              <motion.article
                key={item.title}
                className="card card--hover form-grid"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.05 }}
              >
                <span className="badge">{item.badge}</span>
                <h3 style={{ margin: 0 }}>{item.title}</h3>
                <p className="muted" style={{ margin: 0, fontSize: "var(--text-sm)" }}>
                  {item.desc}
                </p>
              </motion.article>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

