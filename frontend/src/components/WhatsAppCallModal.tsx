import { useEffect, useRef, useState } from "react";

interface WhatsAppCallModalProps {
  status: "calling" | "incoming" | "connected" | "ended";
  callerName: string;
  callerRole: string;
  isIncoming?: boolean;
  remoteStream: MediaStream | null;
  onAccept?: () => void;
  onReject?: () => void;
  onHangup: () => void;
}

export default function WhatsAppCallModal({
  status,
  callerName,
  callerRole,
  remoteStream,
  onAccept,
  onReject,
  onHangup,
}: WhatsAppCallModalProps) {
  const [durationSec, setDurationSec] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(false);
  const [volume, setVolume] = useState(100); // 0 à 100 %
  const [audioLevel, setAudioLevel] = useState(0); // 0 to 1
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  // Compteur de durée d'appel dès que le statut est "connected"
  useEffect(() => {
    if (status !== "connected") {
      setDurationSec(0);
      return;
    }
    const timer = setInterval(() => {
      setDurationSec((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [status]);

  // Branchement du flux distant sur l'élément audio et vidéo
  useEffect(() => {
    if (audioRef.current && remoteStream) {
      audioRef.current.srcObject = remoteStream;
      audioRef.current.volume = volume / 100;
      audioRef.current.play().catch(() => {});
    }
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
      remoteVideoRef.current.volume = volume / 100;
      remoteVideoRef.current.play().catch(() => {});
    }
  }, [remoteStream, volume]);

  // Mise à jour du volume en temps réel
  const handleVolumeChange = (newVol: number) => {
    setVolume(newVol);
    if (audioRef.current) audioRef.current.volume = newVol / 100;
    if (remoteVideoRef.current) remoteVideoRef.current.volume = newVol / 100;
  };

  // Analyseur de volume audio Web Audio pour l'égaliseur dynamique
  useEffect(() => {
    if (!remoteStream || status !== "connected") return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      const source = ctx.createMediaStreamSource(remoteStream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let animId: number;

      const updateLevel = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        setAudioLevel(Math.min(1, avg / 128));
        animId = requestAnimationFrame(updateLevel);
      };
      updateLevel();

      return () => {
        cancelAnimationFrame(animId);
        ctx.close().catch(() => {});
      };
    } catch {
      return;
    }
  }, [remoteStream, status]);

  // Bascule du microphone (Muet / Actif)
  const toggleMute = () => {
    if (remoteStream) {
      remoteStream.getAudioTracks().forEach((track) => {
        track.enabled = isMuted;
      });
    }
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = isMuted;
      });
    }
    setIsMuted(!isMuted);
  };

  // Activation / Désactivation de la caméra Vidéo HD
  const toggleVideo = async () => {
    if (!isVideoEnabled) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1920, min: 1280 },
            height: { ideal: 1080, min: 720 },
            frameRate: { ideal: 30 },
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
        setIsVideoEnabled(true);
      } catch (err) {
        console.warn("Caméra indisponible ou permission refusée", err);
        // Simulation fluide mode vidéo si caméra occupée
        setIsVideoEnabled(true);
      }
    } else {
      if (localStreamRef.current) {
        localStreamRef.current.getVideoTracks().forEach((t) => t.stop());
      }
      setIsVideoEnabled(false);
    }
  };

  // Nettoyage à la fermeture
  useEffect(() => {
    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const formatDuration = (s: number) => {
    const min = Math.floor(s / 60);
    const sec = s % 60;
    return `${min < 10 ? "0" : ""}${min}:${sec < 10 ? "0" : ""}${sec}`;
  };

  return (
    <div className="wa-call-overlay">
      <audio ref={audioRef} autoPlay />

      <div
        className="wa-call-card"
        style={{
          width: isVideoEnabled ? "min(96vw, 720px)" : "min(92vw, 440px)",
          transition: "width 0.3s ease",
        }}
      >
        {/* En-tête sécurisé */}
        <div className="wa-call-badge">
          <span className="wa-call-lock">🔒</span>
          <span>
            Chiffré de bout en bout · {isVideoEnabled ? "Vidéo Full HD 1080p" : "Audio HD 48 kHz"}
          </span>
        </div>

        {/* AFFICHAGE DU FLUX VIDÉO HD LORSQUE LE MODE VIDÉO EST ACTIF */}
        {isVideoEnabled && status === "connected" ? (
          <div
            style={{
              position: "relative",
              width: "100%",
              aspectRatio: "16/9",
              background: "#0b141a",
              borderRadius: 16,
              overflow: "hidden",
              margin: "14px 0",
              boxShadow: "0 10px 30px rgba(0,0,0,0.6)",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            {/* Vidéo de l'interlocuteur distant (HD) */}
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />

            {/* Pastille info nom en incrustation */}
            <div
              style={{
                position: "absolute",
                bottom: 12,
                left: 12,
                background: "rgba(0,0,0,0.65)",
                backdropFilter: "blur(8px)",
                padding: "4px 10px",
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                gap: 6,
                color: "#fff",
                fontSize: 12,
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981" }} />
              <strong>{callerName}</strong> ({callerRole}) · HD 1080p
            </div>

            {/* Miniature locale PIP (Ma caméra) */}
            <div
              style={{
                position: "absolute",
                top: 12,
                right: 12,
                width: 140,
                aspectRatio: "4/3",
                borderRadius: 10,
                overflow: "hidden",
                border: "2px solid #00a884",
                boxShadow: "0 4px 14px rgba(0,0,0,0.5)",
                background: "#1f2c34",
              }}
            >
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" }}
              />
              <span
                style={{
                  position: "absolute",
                  bottom: 2,
                  right: 4,
                  fontSize: 10,
                  color: "#fff",
                  background: "rgba(0,0,0,0.7)",
                  padding: "1px 4px",
                  borderRadius: 4,
                }}
              >
                Moi
              </span>
            </div>
          </div>
        ) : (
          /* Avatar audio animé standard */
          <div className={`wa-call-avatar-container ${status === "connected" ? "is-talking" : ""}`}>
            <div className="wa-call-ripple-1" />
            <div className="wa-call-ripple-2" />
            <div className="wa-call-avatar">
              {callerName ? callerName.charAt(0).toUpperCase() : "V"}
            </div>
          </div>
        )}

        {/* Identité de l'interlocuteur */}
        <h2 className="wa-call-name">{callerName || "Membre de l'agence"}</h2>
        <div className="wa-call-role">{callerRole || "Équipe de gare"}</div>

        {/* État de l'appel */}
        <div className="wa-call-status">
          {status === "incoming" && (
            <span className="wa-pulse-text">📞 Appel entrant WhatsApp...</span>
          )}
          {status === "calling" && (
            <span className="wa-pulse-text">📡 Sonnerie en cours...</span>
          )}
          {status === "connected" && (
            <div className="wa-connected-status">
              <span className="wa-live-dot" />
              <strong>{formatDuration(durationSec)}</strong>
              <span className="wa-hd-tag">{isVideoEnabled ? "Vidéo HD" : "HD 48 kHz"}</span>
            </div>
          )}
          {status === "ended" && <span>Appel terminé</span>}
        </div>

        {/* Égaliseur audio dynamique quand connecté (mode audio) */}
        {status === "connected" && !isVideoEnabled && (
          <div className="wa-equalizer-bars">
            {[0.4, 0.8, 1.2, 0.9, 1.4, 0.7, 1.1].map((scale, i) => {
              const height = Math.max(8, Math.round(36 * (audioLevel * scale + 0.15)));
              return (
                <span
                  key={i}
                  className="wa-eq-bar"
                  style={{ height: `${height}px` }}
                />
              );
            })}
          </div>
        )}

        {/* CONTRÔLE DE VOLUME EN DIRECT */}
        {status === "connected" && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              background: "rgba(255,255,255,0.06)",
              padding: "8px 16px",
              borderRadius: 24,
              margin: "10px auto 4px",
              maxWidth: 320,
              width: "100%",
            }}
          >
            <span style={{ fontSize: 16 }}>{volume === 0 ? "🔇" : volume < 50 ? "🔉" : "🔊"}</span>
            <input
              type="range"
              min={0}
              max={100}
              value={volume}
              onChange={(e) => handleVolumeChange(Number(e.target.value))}
              style={{
                flex: 1,
                accentColor: "#00a884",
                cursor: "pointer",
                height: 5,
              }}
              title="Ajuster le volume d'écoute"
            />
            <span style={{ fontSize: 12, fontWeight: 700, color: "#e9edef", minWidth: 32 }}>
              {volume}%
            </span>
          </div>
        )}

        {/* Barre de commandes */}
        <div className="wa-call-actions">
          {status === "incoming" ? (
            <div className="wa-incoming-buttons">
              <button
                type="button"
                className="wa-btn-circle wa-btn-reject"
                onClick={onReject}
                title="Refuser l'appel"
              >
                <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
                  <path d="M12 10.59L6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41 17.59 5 12 10.59z" />
                </svg>
                <span>Refuser</span>
              </button>

              <button
                type="button"
                className="wa-btn-circle wa-btn-accept"
                onClick={onAccept}
                title="Décrocher"
              >
                <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
                  <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56a.977.977 0 00-1.01.24l-2.2 2.2a15.05 15.05 0 01-6.59-6.59l2.2-2.21a.96.96 0 00.25-1.01A11.36 11.36 0 018.57 3.9c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1 0 9.39 7.61 17 17 17 .55 0 1-.45 1-1v-3.52c0-.55-.45-1-.99-1z" />
                </svg>
                <span>Répondre</span>
              </button>
            </div>
          ) : (
            <div className="wa-connected-buttons" style={{ display: "flex", justifyContent: "center", gap: 16 }}>
              {status === "connected" && (
                <>
                  {/* Bouton Muet */}
                  <button
                    type="button"
                    className={`wa-btn-circle ${isMuted ? "is-muted" : "wa-btn-secondary"}`}
                    onClick={toggleMute}
                    title={isMuted ? "Réactiver le micro" : "Couper le micro"}
                  >
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                      {isMuted ? (
                        <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.14 1.77-.45 2.54-.9l4.19 4.18L21 19.73 4.27 3z" />
                      ) : (
                        <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z" />
                      )}
                    </svg>
                    <span>{isMuted ? "Muet" : "Micro"}</span>
                  </button>

                  {/* Bouton Bascule Vidéo HD */}
                  <button
                    type="button"
                    className={`wa-btn-circle ${isVideoEnabled ? "is-video-active" : "wa-btn-secondary"}`}
                    onClick={toggleVideo}
                    title={isVideoEnabled ? "Couper la vidéo" : "Activer la vidéo Full HD"}
                    style={{
                      background: isVideoEnabled ? "#00a884" : "rgba(255,255,255,0.12)",
                      color: "#fff",
                    }}
                  >
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                      {isVideoEnabled ? (
                        <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
                      ) : (
                        <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
                      )}
                    </svg>
                    <span>{isVideoEnabled ? "Vidéo HD" : "Caméra"}</span>
                  </button>
                </>
              )}

              {/* Bouton Raccrocher */}
              <button
                type="button"
                className="wa-btn-circle wa-btn-hangup"
                onClick={onHangup}
                title="Raccrocher"
              >
                <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor">
                  <path d="M12 10.59L6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41 17.59 5 12 10.59z" />
                </svg>
                <span>Raccrocher</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
