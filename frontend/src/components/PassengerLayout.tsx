import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import ThemeToggle from "./ThemeToggle";
import LanguageSwitcher from "./LanguageSwitcher";
import Footer from "./Footer";
import AngeAssistant from "./AngeAssistant";
import { useAuth } from "../core/auth";

export default function PassengerLayout() {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [angeOpen, setAngeOpen] = useState(false);
  const location = useLocation();
  const { user, logout } = useAuth();

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  const links = [
    { to: "/passager", label: t("nav.home"), end: true },
    { to: "/passager/agences", label: t("nav.booking") },
    { to: "/passager/location", label: t("nav.rental") },
    { to: "/passager/achat-bus", label: t("nav.sales") },
    { to: "/passager/suivi", label: t("nav.tracking") },
    { to: "/passager/fidelite", label: t("nav.loyalty") },
    ...(user ? [{ to: "/passager/mes-billets", label: t("nav.myTickets") }] : []),
  ];

  return (
    <div className="portal-shell portal-shell--passenger">
      <header className="site-header">
        <div className="container site-header__inner">
          <div className="brand-group">
            <Link to="/passager" className="brand" aria-label="VELTRON Passager">
              <span className="brand__mark" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 6l8 13 8-13" />
                </svg>
              </span>
              <span>VELTRON</span>
            </Link>
            <Link to="/" className="portal-pill" title="Revenir au choix des 3 Portails">
              Voyageur ⇄
            </Link>
          </div>

          <nav className={menuOpen ? "nav is-open" : "nav"} aria-label="Navigation Passager">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) => (isActive ? "nav__link is-active" : "nav__link")}
              >
                {link.label}
              </NavLink>
            ))}
          </nav>

          <div className="header-tools">
            {user ? (
              <>
                <span className="user-pill">{user.first_name}</span>
                <button type="button" className="btn btn--ghost header-auth" onClick={logout}>
                  {t("nav.logout")}
                </button>
              </>
            ) : (
              <Link to="/passager/connexion" className="btn header-auth">
                {t("nav.login")}
              </Link>
            )}
            <LanguageSwitcher />
            <ThemeToggle />
            <button
              type="button"
              className="btn btn--icon menu-button"
              aria-label={t("nav.menu")}
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

      <AngeAssistant realm="passenger" openExternal={angeOpen} onCloseExternal={() => setAngeOpen(false)} />
      <Footer />
    </div>
  );
}
