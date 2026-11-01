import { motion } from "framer-motion";
import type { ReactNode } from "react";

// ----------------------------------------------------------------------------
// Révèle son contenu quand il entre dans l'écran.
// variant : "up" (monte), "fade" (fondu), "scale" (zoom léger), "left" (glisse)
// ----------------------------------------------------------------------------

type Variant = "up" | "fade" | "scale" | "left";

interface Props {
  children: ReactNode;
  variant?: Variant;
  delay?: number;
  className?: string;
}

const VARIANTS = {
  up: { hidden: { opacity: 0, y: 32 }, visible: { opacity: 1, y: 0 } },
  fade: { hidden: { opacity: 0 }, visible: { opacity: 1 } },
  scale: { hidden: { opacity: 0, scale: 0.92 }, visible: { opacity: 1, scale: 1 } },
  left: { hidden: { opacity: 0, x: -36 }, visible: { opacity: 1, x: 0 } },
};

export default function Reveal({ children, variant = "up", delay = 0, className }: Props) {
  return (
    <motion.div
      className={className}
      variants={VARIANTS[variant]}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
