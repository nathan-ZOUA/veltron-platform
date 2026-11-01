import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import ThemeToggle from "../components/ThemeToggle";
import LanguageSwitcher from "../components/LanguageSwitcher";
import AuthorBadge from "../components/AuthorBadge";

// Page d'ouverture initiale de VELTRON : demande immédiatement si le visiteur
// est Passager ou Agence, avec arrière-plans vidéo et photos dédiés.
export default function Gateway() {
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
          <span className="badge">Plateforme internationale de transport interurbain</span>
          <h1 className="display display-2xl">
            Bienvenue sur <span className="title-accent">VELTRON</span>.
            <br />
            Choisissez votre espace dédié.
          </h1>
          <p className="lead">
            Deux univers totalement indépendants et sécurisés : l’un conçu pour le confort des voyageurs,
            l’autre pensé pour la performance opérationnelle des compagnies de transport.
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
                <span className="VisualCard__tag">Espace Voyageur</span>
                <h2 className="display display-xl">Je suis Passager</h2>
                <p>
                  Réservation de billets avec QR code, location et achat de bus, suivi GPS/vitesse en temps réel avec calcul
                  d’arrivée selon le trafic, et programme de fidélité annuel.
                </p>
                <ul className="VisualCard__pills">
                  <li>Réservation</li>
                  <li>Location & Achat</li>
                  <li>Suivi Live km/h</li>
                  <li>Points Fidélité</li>
                </ul>
                <span className="VisualCard__cta">
                  Entrer dans l’espace Passager <span aria-hidden="true">→</span>
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
                <span className="VisualCard__tag">Espace Compagnie & Équipes</span>
                <h2 className="display display-xl">Je suis une Agence</h2>
                <p>
                  Créez votre agence vérifiée par IA ou connectez votre équipe avec code PIN sécurisé : 6 comptes cloisonnés,
                  programmation des départs, guichet et messagerie chiffrée de bout en bout.
                </p>
                <ul className="VisualCard__pills">
                  <li>Créer mon agence</li>
                  <li>J’ai une agence (ID + PIN)</li>
                  <li>6 Comptes isolés</li>
                  <li>Chat E2EE</li>
                </ul>
                <span className="VisualCard__cta">
                  Entrer dans l’espace Agence <span aria-hidden="true">→</span>
                </span>
              </div>
            </Link>
          </motion.div>
        </div>
      </section>

      <footer className="gateway__footer container">
        <AuthorBadge compact />
        <Link to="/supervision" className="gateway__owner-link">
          Supervision Propriétaire VELTRON
        </Link>
      </footer>
    </div>
  );
}

