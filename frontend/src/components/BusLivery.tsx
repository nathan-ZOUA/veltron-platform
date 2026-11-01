// Bus en illustration vectorielle : la carrosserie prend la couleur de l'agence.
// Utilisé dans l'assistant de création d'agence (aperçu en direct) et ailleurs.

import { readableText } from "../core/format";

interface Props {
  color: string;
  name?: string;
  className?: string;
}

export default function BusLivery({ color, name = "VELTRON", className }: Props) {
  const textColor = readableText(color);
  return (
    <svg className={`livery ${className ?? ""}`} viewBox="0 0 640 270" role="img" aria-label={name}>
      {/* Ombre au sol */}
      <ellipse cx="320" cy="240" rx="270" ry="14" fill="rgba(0,0,0,0.28)" />
      <g className="livery__body">
        {/* Carrosserie */}
        <rect x="40" y="50" width="560" height="170" rx="34" fill="#f4f5f9" />
        {/* Bandeau de couleur de l'agence */}
        <path d="M40 150 H600 V186 Q600 220 566 220 H74 Q40 220 40 186 Z" fill={color} />
        <text x="320" y="196" textAnchor="middle" fontSize="26" fontWeight="800"
              fontFamily="Plus Jakarta Sans, sans-serif" fill={textColor} letterSpacing="2">
          {name.toUpperCase().slice(0, 22)}
        </text>
        {/* Vitres */}
        {[70, 160, 250, 340, 430].map((x) => (
          <rect key={x} x={x} y="72" width="74" height="58" rx="10" fill="#2b3350" opacity="0.92" />
        ))}
        <rect x="518" y="72" width="62" height="78" rx="12" fill="#2b3350" opacity="0.92" />
        {/* Phares */}
        <rect x="586" y="168" width="18" height="14" rx="5" fill="#ffe9a8" />
        <rect x="36" y="168" width="10" height="14" rx="4" fill="#ff7b7b" />
      </g>
      {/* Roues */}
      {[150, 470].map((cx) => (
        <g key={cx} className="livery__wheel" style={{ transformOrigin: `${cx}px 222px` }}>
          <circle cx={cx} cy="222" r="30" fill="#1b1d27" />
          <circle cx={cx} cy="222" r="14" fill="#9aa0b8" />
          <path d={`M${cx - 12} 222 H${cx + 12} M${cx} 210 V234`} stroke="#1b1d27" strokeWidth="3" />
        </g>
      ))}
    </svg>
  );
}
