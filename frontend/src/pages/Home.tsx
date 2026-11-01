import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { motion, useScroll, useTransform } from "framer-motion";
import { useTranslation } from "react-i18next";
import AnimatedHeading from "../components/AnimatedHeading";
import Reveal from "../components/Reveal";
import { AUTHOR } from "../app/config";
import { useAuth } from "../core/auth";
import { useBusSimulation } from "../features/demo/useBusSimulation";

interface TextItem {
  title: string;
  text: string;
}

const PASSENGER_CARDS = [
  {
    to: "/passager/agences",
    tag: "Billetterie QR",
    title: "Réservation de billets",
    text: "Comparez les compagnies par pays, choisissez votre siège sur le plan 2+2 ou 2+3 et obtenez votre billet QR instantané.",
    cta: "Réserver un billet",
    bg: "/media/ticket-booking.jpg",
  },
  {
    to: "/passager/location",
    tag: "Groupes & Événements",
    title: "Location de bus",
    text: "Excursion, mariage, séminaire ou délégation : demandez un devis sur mesure avec ou sans chauffeur et suivez les offres.",
    cta: "Louer un bus",
    bg: "/media/bus-rental.jpg",
  },
  {
    to: "/passager/achat-bus",
    tag: "Marché Véhicules",
    title: "Achat de bus",
    text: "Parcourez les autocars VIP, bus standards et minibus mis en vente par des compagnies vérifiées sur VELTRON.",
    cta: "Voir les bus en vente",
    bg: "/media/bus-purchase.jpg",
  },
  {
    to: "/passager/suivi",
    tag: "Temps Réel & Trafic",
    title: "Évolution de mon trajet",
    text: "Vitesse en km/h, distance restante et heure d’arrivée recalculée selon les bouchons ou incidents déclarés par le chauffeur.",
    cta: "Suivre un trajet",
    bg: "/media/tracking.jpg",
  },
  {
    to: "/passager/fidelite",
    tag: "Récompenses Annuelles",
    title: "Mes points de fidélité",
    text: "Cumulez des points à chaque voyage dans la même agence (actualisés chaque année) et débloquez bagages ou billets gratuits.",
    cta: "Voir mes récompenses",
    bg: "/media/loyalty.jpg",
  },
];

function HeroTicker() {
  const { progress } = useBusSimulation({ durationSeconds: 14, autoRestart: true });

  return (
    <Link to="/passager/suivi" className="ticker card card--hover" aria-label="Suivi de trajet en temps réel">
      <div className="ticker__head">
        <span className="live-dot" aria-hidden="true" />
        <span>Trajet en direct · Yaoundé → Douala</span>
        <span className="badge badge--sim">LIVE KM/H</span>
      </div>
      <div className="ticker__route">
        <strong>Yaoundé</strong>
        <div className="ticker__track">
          <div className="ticker__line" />
          <div className="ticker__bus" style={{ insetInlineStart: `${progress * 100}%` }} />
        </div>
        <strong>Douala</strong>
      </div>
    </Link>
  );
}

export default function Home() {
  const { t } = useTranslation();
  const { user } = useAuth();

  const heroRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const photoY = useTransform(scrollYProgress, [0, 1], ["0%", "18%"]);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [showPreview, setShowPreview] = useState(false);

  function handlePreview(event: FormEvent) {
    event.preventDefault();
    setShowPreview(true);
  }

  const steps = t("how.items", { returnObjects: true }) as unknown as TextItem[];

  return (
    <>
      {/* ------------------------------ HÉROS PASSAGER ------------------------------ */}
      <section className="hero photo-bg photo-bg--hero" ref={heroRef}>
        <video className="hero-video" autoPlay muted loop playsInline poster="/media/passengers-welcome.jpeg">
          <source src="/videos/veltron-home.mp4" type="video/mp4" />
        </video>
        <motion.div className="photo-bg__image" style={{ y: photoY }} />

        <div className="container hero__content">
          <motion.span
            className="badge"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            {user ? `Bienvenue ${user.first_name} · Espace Passager` : "Espace Passager VELTRON"}
          </motion.span>

          <h1 className="display display-hero">
            <AnimatedHeading text={t("hero.title1")} />
            <AnimatedHeading className="title-accent" text={t("hero.title2")} delay={0.35} />
          </h1>

          <motion.p
            className="lead"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.7 }}
          >
            Réservez votre siège, louez ou achetez un autocar, suivez l’évolution de votre bus en direct (km/h et bouchons)
            et cumulez des points de fidélité à chaque voyage.
          </motion.p>

          <motion.div
            className="hero__actions"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.9 }}
          >
            <Link to="/passager/agences" className="btn btn--lg">
              Réserver un billet
            </Link>
            <Link to="/passager/suivi" className="btn btn--lg btn--ghost">
              Suivre mon trajet en direct
            </Link>
            {!user && (
              <Link to="/passager/connexion" className="btn btn--lg btn--ghost">
                Se connecter & gagner des points
              </Link>
            )}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 1.05 }}
          >
            <HeroTicker />
          </motion.div>
        </div>
      </section>

      {/* -------------------- SERVICES PASSAGER CLIQUABLES AVEC PHOTOS -------------------- */}
      <section className="section">
        <div className="container">
          <Reveal>
            <h2 className="display display-xl section-title">Tous vos services voyageurs en un clic</h2>
            <p className="muted section-note">
              Choisissez une action ci-dessous : chaque service est directement connecté aux compagnies vérifiées sur VELTRON.
            </p>
          </Reveal>

          <div className="service-cards-grid">
            {PASSENGER_CARDS.map((card, index) => (
              <Reveal key={card.to} delay={(index % 3) * 0.08} variant="up">
                <Link
                  to={card.to}
                  className={index === 0 ? "VisualCard VisualCard--wide" : "VisualCard"}
                  style={{ "--card-bg": `url("${card.bg}")` } as React.CSSProperties}
                >
                  <div className="VisualCard__bg" />
                  <div className="VisualCard__shade" />
                  <div className="VisualCard__content">
                    <span className="VisualCard__tag">{card.tag}</span>
                    <h3>{card.title}</h3>
                    <p>{card.text}</p>
                    <span className="VisualCard__cta">
                      {card.cta} <span aria-hidden="true">→</span>
                    </span>
                  </div>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* --------------------------- ÉTAPES --------------------------- */}
      <section className="section section--tinted">
        <div className="container">
          <Reveal>
            <h2 className="display display-xl section-title">{t("how.title")}</h2>
          </Reveal>

          <ol className="steps">
            {steps.map((step, index) => (
              <li key={step.title}>
                <Reveal variant="left" delay={index * 0.12}>
                  <div className="step">
                    <span className="step__number mono">{index + 1}</span>
                    <div>
                      <h3>{step.title}</h3>
                      <p className="muted">{step.text}</p>
                    </div>
                  </div>
                </Reveal>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ------------------------------ CONTACT ------------------------------ */}
      <section className="section" id="contact">
        <div className="container contact">
          <Reveal variant="left">
            <h2 className="display display-xl">
              {t("contact.title1")}
              <span className="title-accent">{t("contact.title2")}</span>
            </h2>
            <p className="lead contact__text">{t("contact.text")}</p>

            <ul className="contact__links">
              <li>
                <a href={`mailto:${AUTHOR.email}`}>
                  <span className="muted">{t("contact.email")}</span>
                  <span>{AUTHOR.email}</span>
                  <span className="contact__arrow flip-rtl" aria-hidden="true">↗</span>
                </a>
              </li>
              <li>
                <a href={AUTHOR.whatsapp} target="_blank" rel="noopener noreferrer">
                  <span className="muted">{t("contact.whatsapp")}</span>
                  <span>{t("contact.whatsappLink")}</span>
                  <span className="contact__arrow flip-rtl" aria-hidden="true">↗</span>
                </a>
              </li>
              <li>
                <a href={AUTHOR.github} target="_blank" rel="noopener noreferrer">
                  <span className="muted">{t("contact.github")}</span>
                  <span>{t("contact.githubLink")}</span>
                  <span className="contact__arrow flip-rtl" aria-hidden="true">↗</span>
                </a>
              </li>
            </ul>
          </Reveal>

          <Reveal variant="scale" delay={0.1}>
            <form className="card form-grid" onSubmit={handlePreview}>
              <p className="muted contact__notice">{t("contact.notice")}</p>
              <label className="field">
                <span className="field__label">{t("contact.name")}</span>
                <input className="input" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("contact.namePlaceholder")} />
              </label>
              <label className="field">
                <span className="field__label">{t("contact.mail")}</span>
                <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("contact.mailPlaceholder")} />
              </label>
              <label className="field">
                <span className="field__label">{t("contact.message")}</span>
                <textarea className="textarea" value={message} onChange={(e) => setMessage(e.target.value)} placeholder={t("contact.messagePlaceholder")} />
              </label>
              <div>
                <button type="submit" className="btn btn--lg">
                  {t("contact.preview")} <span className="flip-rtl" aria-hidden="true">→</span>
                </button>
              </div>
              {showPreview && (
                <motion.div className="demo-note" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}>
                  <strong>{t("contact.previewTitle")}</strong>
                  <p>{name}</p>
                  <p>{email}</p>
                  <p>{message}</p>
                </motion.div>
              )}
            </form>
          </Reveal>
        </div>
      </section>
    </>
  );
}
