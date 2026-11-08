import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import ThemeToggle from "./ThemeToggle";
import LanguageSwitcher from "./LanguageSwitcher";
import Footer from "./Footer";
import AngeAssistant from "./AngeAssistant";
import { useAuth } from "../core/auth";
import { agencyStyle } from "../core/format";

const ROLE_LABELS: Record<string, string> = {
  owner: "Administrateur",
  manager: "Programmation",
  secretary: "Secrétaire",
  driver: "Chauffeur",
  staff: "Personnel",
  accountant: "Comptable",
};

export default function AgencyLayout() {
  const { agencySession, logoutAgency } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [angeOpen, setAngeOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  function handleLogout() {
    logoutAgency();
    navigate("/agence");
  }

  return (
    <div
      className="portal-shell portal-shell--agency"
      style={agencySession ? agencyStyle(agencySession.agency.primary_color) : undefined}
    >
      <header className="site-header site-header--agency">
        <div className="container site-header__inner">
          <div className="brand-group">
            <Link to={agencySession ? "/agence/espace" : "/agence"} className="brand" aria-label="VELTRON Agence">
              <span className="brand__mark" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 6l8 13 8-13" />
                </svg>
              </span>
              <span>{agencySession ? agencySession.agency.name : "VELTRON PRO"}</span>
            </Link>
            <Link to="/" className="portal-pill portal-pill--pro" title="Revenir à l'accueil général">
              Agences ⇄
            </Link>
          </div>

          <nav className={menuOpen ? "nav is-open" : "nav"} aria-label="Navigation Agence">
            {!agencySession ? (
              <>
                <NavLink to="/agence" end className={({ isActive }) => (isActive ? "nav__link is-active" : "nav__link")}>
                  Portail Agence
                </NavLink>
                <NavLink to="/agence/creer" className={({ isActive }) => (isActive ? "nav__link is-active" : "nav__link")}>
                  Créer une agence
                </NavLink>
                <NavLink to="/agence/connexion" className={({ isActive }) => (isActive ? "nav__link is-active" : "nav__link")}>
                  J'ai une agence
                </NavLink>
                <NavLink to="/agence/rejoindre" className={({ isActive }) => (isActive ? "nav__link is-active" : "nav__link")}>
                  Nouveau personnel
                </NavLink>
              </>
            ) : (
              <div className="security-chips-group">
                <span className="security-chip mono" title="Identifiant unique de votre agence">
                  ID {agencySession.agency.public_code}
                </span>
                <span className="security-chip security-chip--role">
                  {ROLE_LABELS[agencySession.role] ?? agencySession.role} · {agencySession.user.first_name}
                </span>
                <span className="security-chip security-chip--e2ee" title="Base de données d'agence auto-provisionnée et strictement isolée">
                  🗄️ DB Isolée Active
                </span>
              </div>
            )}
          </nav>

          <div className="header-tools">
            {agencySession ? (
              <button type="button" className="btn btn--ghost header-auth" onClick={handleLogout}>
                Déconnexion
              </button>
            ) : (
              <Link to="/agence/connexion" className="btn header-auth">
                Accès Agence
              </Link>
            )}
            <LanguageSwitcher />
            <ThemeToggle />
            <button
              type="button"
              className="btn btn--icon menu-button"
              aria-label="Menu de navigation"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <main className="portal-main">
        <Outlet />
      </main>

      <AngeAssistant realm="agency" openExternal={angeOpen} onCloseExternal={() => setAngeOpen(false)} />
      <Footer />
    </div>
  );
}
