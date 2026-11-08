// Moteur d'effets sonores Web Audio haute définition style WhatsApp Pro
// Génération 100% autonome sans fichiers externes pour une fiabilité totale.

class SoundFXEngine {
  private ctx: AudioContext | null = null;
  private ringInterval: number | null = null;
  private activeOscillators: OscillatorNode[] = [];

  private getContext(): AudioContext {
    if (!this.ctx || this.ctx.state === "closed") {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  // Bip d'envoi de message réussi façon WhatsApp
  playMessageSent() {
    try {
      const ctx = this.getContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.08);

      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.08);
    } catch {}
  }

  // Carillon de message entrant façon WhatsApp
  playMessageReceived() {
    try {
      const ctx = this.getContext();
      const now = ctx.currentTime;

      // Note 1 : E6 (1318 Hz)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(1318, now);
      gain1.gain.setValueAtTime(0.18, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.09);

      // Note 2 : A6 (1760 Hz)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(1760, now + 0.07);
      gain2.gain.setValueAtTime(0.18, now + 0.07);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.07);
      osc2.stop(now + 0.22);
    } catch {}
  }

  // Sonnerie d'appel sortant (Tonalité d'acheminement pro 440+480 Hz)
  startOutgoingRing(): () => void {
    this.stopRinging();
    try {
      const ctx = this.getContext();

      const playBurst = () => {
        try {
          if (ctx.state === "closed") return;
          const now = ctx.currentTime;
          const osc1 = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const gain = ctx.createGain();

          osc1.type = "sine";
          osc1.frequency.setValueAtTime(440, now);
          osc2.type = "sine";
          osc2.frequency.setValueAtTime(480, now);

          gain.gain.setValueAtTime(0.12, now);
          gain.gain.setValueAtTime(0.12, now + 1.6);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 1.8);

          osc1.connect(gain);
          osc2.connect(gain);
          gain.connect(ctx.destination);

          osc1.start(now);
          osc2.start(now);
          osc1.stop(now + 1.8);
          osc2.stop(now + 1.8);

          this.activeOscillators.push(osc1, osc2);
        } catch {}
      };

      playBurst();
      this.ringInterval = window.setInterval(playBurst, 4000);
    } catch {}

    return () => this.stopRinging();
  }

  // Sonnerie d'appel entrant façon WhatsApp (Mélodie cadencée)
  startIncomingRing(): () => void {
    this.stopRinging();
    try {
      const ctx = this.getContext();

      const playChime = () => {
        try {
          if (ctx.state === "closed") return;
          const now = ctx.currentTime;
          const notes = [
            { f: 587.33, t: 0.0 }, // D5
            { f: 880.0, t: 0.12 }, // A5
            { f: 1174.66, t: 0.24 }, // D6
            { f: 880.0, t: 0.38 }, // A5
            { f: 1046.5, t: 0.52 }, // C6
          ];

          notes.forEach(({ f, t }) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = "triangle";
            osc.frequency.setValueAtTime(f, now + t);
            gain.gain.setValueAtTime(0.2, now + t);
            gain.gain.exponentialRampToValueAtTime(0.001, now + t + 0.14);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now + t);
            osc.stop(now + t + 0.15);
            this.activeOscillators.push(osc);
          });
        } catch {}
      };

      playChime();
      this.ringInterval = window.setInterval(playChime, 2500);
    } catch {}

    return () => this.stopRinging();
  }

  // Clôture immédiate de toute sonnerie active
  stopRinging() {
    if (this.ringInterval) {
      clearInterval(this.ringInterval);
      this.ringInterval = null;
    }
    this.activeOscillators.forEach((osc) => {
      try {
        osc.stop();
        osc.disconnect();
      } catch {}
    });
    this.activeOscillators = [];
  }

  // Son de connexion d'appel réussi
  playCallConnected() {
    this.stopRinging();
    try {
      const ctx = this.getContext();
      const now = ctx.currentTime;
      [
        { f: 523.25, t: 0 },
        { f: 659.25, t: 0.1 },
        { f: 783.99, t: 0.2 },
      ].forEach(({ f, t }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(f, now + t);
        gain.gain.setValueAtTime(0.16, now + t);
        gain.gain.exponentialRampToValueAtTime(0.001, now + t + 0.12);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + t);
        osc.stop(now + t + 0.12);
      });
    } catch {}
  }

  // Son de fin d'appel
  playCallEnded() {
    this.stopRinging();
    try {
      const ctx = this.getContext();
      const now = ctx.currentTime;
      [
        { f: 440, t: 0 },
        { f: 330, t: 0.14 },
      ].forEach(({ f, t }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(f, now + t);
        gain.gain.setValueAtTime(0.18, now + t);
        gain.gain.exponentialRampToValueAtTime(0.001, now + t + 0.14);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + t);
        osc.stop(now + t + 0.14);
      });
    } catch {}
  }
}

export const soundFX = new SoundFXEngine();

