import { useCallback, useEffect, useMemo, useState } from "react";

// ============================================================================
// SIMULATION DE BUS
// Fait avancer un point le long d'un tracé. Ce sont des positions SIMULÉES :
// l'interface affiche toujours le badge « SIMULÉ » à côté.
// ============================================================================

export interface Point {
  x: number;
  y: number;
}

// Tracé schématique Douala → Yaoundé dans un repère SVG de 800 x 420
export const ROUTE_POINTS: Point[] = [
  { x: 110, y: 310 },
  { x: 210, y: 345 },
  { x: 300, y: 300 },
  { x: 385, y: 335 },
  { x: 470, y: 262 },
  { x: 545, y: 212 },
  { x: 625, y: 192 },
  { x: 690, y: 112 },
];

export interface BusPosition extends Point {
  angle: number; // orientation en degrés
}

// Calcule la position sur le tracé pour une progression de 0 à 1.
export function pointAtProgress(points: Point[], progress: number): BusPosition {
  const clamped = Math.min(1, Math.max(0, progress));

  // Longueur de chaque segment
  const lengths: number[] = [];
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const length = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
    lengths.push(length);
    total += length;
  }

  // Distance à parcourir
  let remaining = clamped * total;
  for (let i = 0; i < lengths.length; i++) {
    if (remaining <= lengths[i] || i === lengths.length - 1) {
      const ratio = lengths[i] === 0 ? 0 : Math.min(1, remaining / lengths[i]);
      const a = points[i];
      const b = points[i + 1];
      return {
        x: a.x + (b.x - a.x) * ratio,
        y: a.y + (b.y - a.y) * ratio,
        angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
      };
    }
    remaining -= lengths[i];
  }
  return { ...points[0], angle: 0 };
}

interface Options {
  durationSeconds?: number; // durée totale du trajet simulé
  autoRestart?: boolean;    // recommence quand le bus est arrivé
}

export function useBusSimulation({ durationSeconds = 45, autoRestart = false }: Options = {}) {
  const [progress, setProgress] = useState(0);
  const [running, setRunning] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(() => new Date());

  const TICK_MS = 100;

  useEffect(() => {
    if (!running) return;

    const timer = window.setInterval(() => {
      setProgress((current) => {
        const next = current + TICK_MS / 1000 / durationSeconds;
        if (next >= 1) {
          if (autoRestart) return 0;
          setRunning(false);
          return 1;
        }
        return next;
      });
      setLastUpdate(new Date());
    }, TICK_MS);

    return () => window.clearInterval(timer);
  }, [running, durationSeconds, autoRestart]);

  const toggle = useCallback(() => setRunning((value) => !value), []);

  const restart = useCallback(() => {
    setProgress(0);
    setLastUpdate(new Date());
    setRunning(true);
  }, []);

  // Vitesse simulée : varie légèrement autour de 70 km/h pendant le trajet
  const speedKmh = useMemo(() => {
    if (!running || progress >= 1) return 0;
    return Math.round(72 + 14 * Math.sin(progress * 24));
  }, [running, progress]);

  const position = useMemo(() => pointAtProgress(ROUTE_POINTS, progress), [progress]);

  const arrived = progress >= 1;

  return { progress, running, arrived, position, speedKmh, lastUpdate, toggle, restart };
}
