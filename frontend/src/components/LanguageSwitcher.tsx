import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { LANGUAGES } from "../i18n";

// Menu déroulant pour choisir la langue (FR / EN / AR / ZH).
export default function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Ferme le menu au clic extérieur ou avec la touche Échap
  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, []);

  const current = LANGUAGES.find((l) => l.code === i18n.language) ?? LANGUAGES[0];

  return (
    <div className="lang" ref={containerRef}>
      <button
        type="button"
        className="btn btn--ghost"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={t("common.language")}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18" />
        </svg>
        <span>{current.code.toUpperCase()}</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.ul
            className="lang__menu"
            role="menu"
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.18 }}
          >
            {LANGUAGES.map((language) => (
              <li key={language.code} role="none">
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={language.code === i18n.language}
                  className="lang__option"
                  onClick={() => {
                    i18n.changeLanguage(language.code);
                    setOpen(false);
                  }}
                >
                  <span lang={language.code}>{language.label}</span>
                  <span className="muted mono">{language.code}</span>
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
