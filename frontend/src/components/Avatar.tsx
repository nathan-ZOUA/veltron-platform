import { useState } from "react";
import { initials } from "../core/format";

// Photo du chauffeur (si l'agence en a fournie) ou initiales en secours.
export default function Avatar({ name, photo, size = 40 }: { name: string; photo?: string | null; size?: number }) {
  const [broken, setBroken] = useState(false);
  const style = { width: size, height: size, fontSize: size * 0.38 };

  if (photo && !broken) {
    const src = photo.startsWith("/") || photo.startsWith("http") ? photo : `/uploads/${photo}`;
    return <img className="avatar" style={style} src={src} alt={name} onError={() => setBroken(true)} />;
  }
  return <span className="avatar avatar--initials" style={style} aria-label={name}>{initials(name)}</span>;
}
