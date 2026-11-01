import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "../core/auth";

const ACCOUNT_ROLES = [
  {
    badge: "Compte 1 · Direction",
    title: "Administrateur (Créateur)",
    desc: "Crée l’agence, configure le délai maximal de remplissage (ex. 40 min), gère les 5 autres types de comptes, les finances et le journal d’audit.",
  },
  {
    badge: "Compte 2 · Gare & Embarquement",
    title: "Secrétaire",
    desc: "Gère les départs-arrivées, les billets QR, les reports, les clients en retard ou absents, et l’ajout de passagers sans bagage à départ imminent.",
  },
  {
    badge: "Compte 3 · Route & Télémétrie",
    title: "Chauffeur",
    desc: "Consulte ses bus et départs attribués, signale son évolution (vitesse km/h, bouchon, panne…), sa disponibilité et partage son ressenti.",
  },
  {
    badge: "Compte 4 · Terrain",
    title: "Membre du personnel",
    desc: "Contrôle les billets QR à la porte du bus, enregistre les bagages et assiste l’embarquement sans accès aux données sensibles.",
  },
  {
    badge: "Compte 5 · Exploitation",
    title: "Responsable Programmation",
    desc: "Configure la flotte (bus 2+2 ou 2+3), ouvre les lignes interurbaines, planifie les horaires et publie les annonces de vente/location.",
  },
  {
    badge: "Compte 6 · Trésorerie",
    title: "Comptable",
    desc: "Suit les encaissements, les remboursements automatiques et répond aux demandes de devis de location de bus.",
  },
];

// Portail d'entrée dédié EXCLUSIVEMENT aux agences (/agence)
export default function AgencyHub() {
  const { agencySession } = useAuth();

  return (
    <>
      <section
        className="service-hero photo-bg"
        style={{ "--photo-custom": 'url("/media/bus.jpeg")' } as React.CSSProperties}
      >
        <div className="photo-bg__image photo-bg__image--custom" />
        <div className="container service-hero__inner">
          <span className="badge">Portail Professionnel Compagnies · Sécurité Maximale</span>
          <h1 className="display display-2xl">
            Pilotez votre compagnie sur <span className="title-accent">VELTRON PRO</span>
          </h1>
          <p className="lead">
            Un environnement d’exploitation étanche, protégé par double validation PIN (5 chiffres), audit d’authenticité IA,
            isolation cryptographique des comptes employés et messagerie d’équipe chiffrée de bout en bout.
          </p>

          {agencySession && (
            <div className="demo-note" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
              <span>
                Session active : <strong>{agencySession.agency.name}</strong> (<span className="mono">{agencySession.agency.public_code}</span>) — Connecté en tant que{" "}
                <strong>{agencySession.user.first_name}</strong>
              </span>
              <Link to="/agence/espace" className="btn">
                Ouvrir mon espace agence →
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
                  <span className="VisualCard__tag">Nouvelle Compagnie</span>
                  <h2 className="display display-xl">Créer une agence</h2>
                  <p>
                    Enregistrez votre compagnie parmi tous les pays du monde avec sa devise officielle, vérifiez la propriété
                    de votre e-mail par code PIN à 5 chiffres et obtenez immédiatement votre ID Agence unique après contrôle IA.
                  </p>
                  <ul className="VisualCard__pills">
                    <li>213 Pays & Devises</li>
                    <li>Adresse unique vérifiée</li>
                    <li>PIN E-mail 5 chiffres</li>
                    <li>Audit IA instantané</li>
                  </ul>
                  <span className="VisualCard__cta">
                    Ouvrir mon agence maintenant <span aria-hidden="true">→</span>
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
                  <span className="VisualCard__tag">Compagnie Déjà Inscrite</span>
                  <h2 className="display display-xl">J’ai une agence</h2>
                  <p>
                    Entrez l’identifiant automatique fourni lors de la création (<span className="mono">AG-XXXXXX</span>),
                    le nom de l’agence et votre adresse e-mail, puis validez le code à 5 chiffres (renouvelable toutes les 50 s).
                  </p>
                  <ul className="VisualCard__pills">
                    <li>ID Auto AG-XXXXXX</li>
                    <li>Code validation 5 chiffres</li>
                    <li>Délai renvoi 50 s</li>
                    <li>Accès par rôle isolé</li>
                  </ul>
                  <span className="VisualCard__cta">
                    Accéder à mon agence <span aria-hidden="true">→</span>
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
          <h2 className="display display-xl section-title">6 comptes strictement isolés & Messagerie E2EE</h2>
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

