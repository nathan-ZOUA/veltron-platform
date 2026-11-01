import { useEffect, useRef, useState } from "react";
import { animate, useInView } from "framer-motion";
import { useTranslation } from "react-i18next";
import { LANGUAGES } from "../i18n";

// Compteur qui monte de 0 jusqu'à la valeur quand il devient visible.
interface Props {
  value: number;
  suffix?: string;
  durationSeconds?: number;
}

export default function AnimatedCounter({ value, suffix = "", durationSeconds = 1.6 }: Props) {
  const { i18n } = useTranslation();
  const ref = useRef<HTMLSpanElement>(null);
  const isVisible = useInView(ref, { once: true });
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!isVisible) return;
    const controls = animate(0, value, {
      duration: durationSeconds,
      ease: "easeOut",
      onUpdate: (latest) => setDisplay(Math.round(latest)),
    });
    return () => controls.stop();
  }, [isVisible, value, durationSeconds]);

  const locale = LANGUAGES.find((l) => l.code === i18n.language)?.numberLocale ?? "fr-FR";

  return (
    <span ref={ref} className="mono">
      {new Intl.NumberFormat(locale).format(display)}
      {suffix}
    </span>
  );
}
