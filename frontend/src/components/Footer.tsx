import { useTranslation } from "react-i18next";
import AuthorBadge from "./AuthorBadge";

export default function Footer() {
  const { t } = useTranslation();

  return (
    <footer className="site-footer">
      <div className="container site-footer__inner">
        <div>
          <strong className="display">VELTRON</strong>
          <p className="muted">{t("app.tagline")}</p>
        </div>
        <AuthorBadge />
        <p className="muted">
          © {new Date().getFullYear()} VELTRON. {t("footer.rights")}
        </p>
      </div>
    </footer>
  );
}
