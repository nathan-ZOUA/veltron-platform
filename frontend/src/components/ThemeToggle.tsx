import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useTheme } from "../theme/ThemeContext";

// Bouton soleil / lune pour changer de thème.
export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const { t } = useTranslation();

  const label = theme === "dark" ? t("common.themeToLight") : t("common.themeToDark");

  return (
    <button type="button" className="btn btn--icon" onClick={toggleTheme} aria-label={label} title={label}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={theme}
          initial={{ rotate: -90, opacity: 0, scale: 0.6 }}
          animate={{ rotate: 0, opacity: 1, scale: 1 }}
          exit={{ rotate: 90, opacity: 0, scale: 0.6 }}
          transition={{ duration: 0.25 }}
          style={{ display: "grid", placeItems: "center" }}
        >
          {theme === "dark" ? (
            // Soleil
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
            </svg>
          ) : (
            // Lune
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
            </svg>
          )}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}
