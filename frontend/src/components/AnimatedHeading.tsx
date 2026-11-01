import { motion } from "framer-motion";

// ----------------------------------------------------------------------------
// Titre révélé mot par mot (ou caractère par caractère pour le chinois,
// qui n'a pas d'espaces entre les mots).
// ----------------------------------------------------------------------------

interface Props {
  text: string;
  className?: string;
  delay?: number;
}

export default function AnimatedHeading({ text, className, delay = 0 }: Props) {
  const hasSpaces = text.includes(" ");
  const parts = hasSpaces ? text.split(" ") : Array.from(text);

  return (
    <span className={className} aria-label={text}>
      {parts.map((part, index) => (
        <motion.span
          key={`${part}-${index}`}
          aria-hidden="true"
          style={{ display: "inline-block", whiteSpace: "pre" }}
          initial={{ opacity: 0, y: "0.6em", filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.7, delay: delay + index * 0.09, ease: [0.22, 1, 0.36, 1] }}
        >
          {part}
          {hasSpaces && index < parts.length - 1 ? " " : ""}
        </motion.span>
      ))}
    </span>
  );
}
