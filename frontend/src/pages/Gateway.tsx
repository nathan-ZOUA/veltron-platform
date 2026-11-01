import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import ThemeToggle from "../components/ThemeToggle";
import LanguageSwitcher from "../components/LanguageSwitcher";
import AuthorBadge from "../components/AuthorBadge";

// Page d'ouverture initiale de VELTRON : demande immédiatement si le visiteur
// est Passager ou Agence, avec arrière-plans vidéo et photos dédiés.
export default function Gateway() {
  const { t } = useTranslation();

  return (
    <div className="gateway">
      <video className="gateway__video" autoPlay muted loop playsInline poster="/media/passengers-welcome.jpeg">
        <source src="/videos/veltron-home.mp4" type="video/mp4" />
      </video>
      <div className="gateway__veil" />

      <header className="gateway__topbar container">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 6l8 13 8-13" />
            </svg>
          </span>
          <span>VELTRON</span>
        </div>
        <div className="header-tools">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </header>

      <section className="gateway__center container">
        <motion.div
          className="gateway__intro"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65 }}
        >
          <span className="badge">{t("gateway.badge")}</span>
          <h1 className="display display-2xl">
            {t("gateway.title1")} <span className="title-accent">VELTRON</span>.
            <br />
            {t("gateway.title2")}
          </h1>
          <p className="lead">
            {t("gateway.lead")}
          </p>
        </motion.div>

        <div className="gateway__cards">
          <motion.div
            initial={{ opacity: 0, x: -36 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.65, delay: 0.15 }}
          >
            <Link
              to="/passager"
              className="VisualCard VisualCard--tall"
              style={{ "--card-bg": 'url("/media/passengers-welcome.jpeg")' } as React.CSSProperties}
            >
              <div className="VisualCard__bg" />
              <div className="VisualCard__shade" />
              <div className="VisualCard__content">
                <span className="VisualCard__tag">{t("gateway.passenger.tag")}</span>
                <h2 className="display display-xl">{t("gateway.passenger.title")}</h2>
                <p>{t("gateway.passenger.desc")}</p>
                <ul className="VisualCard__pills">
                  {((t("gateway.passenger.pills", { returnObjects: true }) as string[]) || []).map((pill, idx) => (
                    <li key={idx}>{pill}</li>
                  ))}
                </ul>
                <span className="VisualCard__cta">
                  {t("gateway.passenger.cta")} <span aria-hidden="true">→</span>
                </span>
              </div>
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 36 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.65, delay: 0.25 }}
          >
            <Link
              to="/agence"
              className="VisualCard VisualCard--tall VisualCard--pro"
              style={{ "--card-bg": 'url("/media/bus.jpeg")' } as React.CSSProperties}
            >
              <div className="VisualCard__bg" />
              <div className="VisualCard__shade" />
              <div className="VisualCard__content">
                <span className="VisualCard__tag">{t("gateway.agency.tag")}</span>
                <h2 className="display display-xl">{t("gateway.agency.title")}</h2>
                <p>{t("gateway.agency.desc")}</p>
                <ul className="VisualCard__pills">
                  {((t("gateway.agency.pills", { returnObjects: true }) as string[]) || []).map((pill, idx) => (
                    <li key={idx}>{pill}</li>
                  ))}
                </ul>
                <span className="VisualCard__cta">
                  {t("gateway.agency.cta")} <span aria-hidden="true">→</span>
                </span>
              </div>
            </Link>
          </motion.div>
        </div>
      </section>

      <footer className="gateway__footer container">
        <AuthorBadge compact />
        <Link to="/supervision" className="gateway__owner-link">
          {t("gateway.supervision")}
        </Link>
      </footer>
    </div>
  );
}

