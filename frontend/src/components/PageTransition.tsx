import { motion } from "framer-motion";
import type { ReactNode } from "react";

// Enveloppe chaque page : fondu + léger glissement à l'entrée et à la sortie.
export default function PageTransition({ children }: { children: ReactNode }) {
  return (
    <motion.main
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.main>
  );
}
