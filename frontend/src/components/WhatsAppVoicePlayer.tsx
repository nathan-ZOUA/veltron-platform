import { useEffect, useRef, useState } from "react";

interface WhatsAppVoicePlayerProps {
  audioData: string; // Base64 data URL
  durationSec: number;
  isMine: boolean;
  senderName: string;
}

export default function WhatsAppVoicePlayer({
  audioData,
  durationSec,
  isMine,
  senderName,
}: WhatsAppVoicePlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [waveformBars] = useState<number[]>(() => {
    // Génère un profil d'onde vocal réaliste (30 barres)
    const bars: number[] = [];
    let prev = 0.4;
    for (let i = 0; i < 30; i++) {
      const variation = (Math.sin(i * 0.7) * 0.35 + Math.random() * 0.4);
      prev = Math.max(0.15, Math.min(0.95, (prev + variation) / 2));
      bars.push(Math.round(prev * 100));
    }
    return bars;
  });

  const duration = durationSec || 1;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
    };
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch(() => {});
    }
  };

  const handleSeek = (index: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const seekPct = index / waveformBars.length;
    const targetTime = seekPct * (audio.duration || duration);
    audio.currentTime = targetTime;
    setCurrentTime(targetTime);
    if (!isPlaying) {
      audio.play().catch(() => {});
    }
  };

  const cycleSpeed = () => {
    const nextRate = playbackRate === 1 ? 1.5 : playbackRate === 1.5 ? 2 : 1;
    setPlaybackRate(nextRate);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextRate;
    }
  };

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const playedPct = (currentTime / (duration || 1)) * 100;

  return (
    <div className={`wa-voice-bubble ${isMine ? "is-mine" : ""}`}>
      <audio ref={audioRef} src={audioData} preload="metadata" />

      {/* Avatar avec icône micro */}
      <div className="wa-voice-avatar-wrap">
        <div className="wa-voice-avatar">
          {senderName.charAt(0).toUpperCase()}
        </div>
        <span className="wa-voice-mic-badge">🎙️</span>
      </div>

      {/* Contrôle de lecture Play / Pause */}
      <button
        type="button"
        className="wa-voice-play-btn"
        onClick={togglePlay}
        aria-label={isPlaying ? "Pause" : "Lecture"}
      >
        {isPlaying ? (
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <rect x="6" y="4" width="4" height="16" rx="1.5" />
            <rect x="14" y="4" width="4" height="16" rx="1.5" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>

      {/* Zone d'onde sonore et durée */}
      <div className="wa-voice-center">
        <div className="wa-voice-waveform" role="progressbar">
          {waveformBars.map((barHeight, idx) => {
            const barPct = (idx / waveformBars.length) * 100;
            const isPlayed = barPct <= playedPct;
            return (
              <button
                key={idx}
                type="button"
                className={`wa-waveform-bar ${isPlayed ? "is-played" : ""}`}
                style={{ height: `${barHeight}%` }}
                onClick={() => handleSeek(idx)}
                aria-label={`Avancer à ${Math.round(barPct)}%`}
              />
            );
          })}
        </div>
        <div className="wa-voice-meta-row">
          <span className="wa-voice-time">
            {formatTime(isPlaying ? currentTime : duration)}
          </span>
          <button
            type="button"
            className="wa-voice-speed-pill"
            onClick={cycleSpeed}
            title="Modifier la vitesse de lecture"
          >
            {playbackRate}x
          </button>
        </div>
      </div>
    </div>
  );
}

