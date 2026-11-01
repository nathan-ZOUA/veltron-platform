import { useState } from "react";

// Photo de profil ou silhouette bonhomme style WhatsApp
export default function Avatar({
  name,
  photo,
  size = 40,
}: {
  name: string;
  photo?: string | null;
  size?: number;
}) {
  const [broken, setBroken] = useState(false);
  const style = { width: size, height: size, minWidth: size, minHeight: size };

  if (photo && !broken) {
    const src = photo.startsWith("/") || photo.startsWith("http") || photo.startsWith("data:") ? photo : `/uploads/${photo}`;
    return (
      <img
        className="avatar"
        style={{ ...style, borderRadius: "50%", objectFit: "cover" }}
        src={src}
        alt={name}
        onError={() => setBroken(true)}
      />
    );
  }

  // Bonhomme silhouette stylisé WhatsApp
  return (
    <span
      className="avatar avatar--whatsapp"
      style={{
        ...style,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #2a2e3f, #181b26)",
        color: "#9ca3af",
        border: "1.5px solid rgba(255, 255, 255, 0.15)",
        borderRadius: "50%",
        boxShadow: "0 2px 6px rgba(0, 0, 0, 0.25)",
      }}
      aria-label={name}
      title={name}
    >
      <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
      </svg>
    </span>
  );
}
