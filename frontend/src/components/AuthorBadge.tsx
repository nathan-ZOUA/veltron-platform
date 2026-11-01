import { useTranslation } from "react-i18next";
import { AUTHOR } from "../app/config";

interface Props {
  compact?: boolean; // version courte pour l'en-tête
}

// Signature « Nathan Zoua » : monogramme NZ + nom.
export default function AuthorBadge({ compact = false }: Props) {
  const { t } = useTranslation();

  return (
    <span className="author-badge" title={AUTHOR.name}>
      <span className="author-badge__mark" aria-hidden="true">
        {AUTHOR.initials}
      </span>
      <span className={compact ? "author-badge__text author-badge__text--compact" : "author-badge__text"}>
        {!compact && <>{t("footer.madeBy")} </>}
        <strong>{AUTHOR.name}</strong>
      </span>
    </span>
  );
}
