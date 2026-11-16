class SoundEngine {
  private ctx: AudioContext | null = null;
  private muted = false;

  constructor() {
    try {
      this.muted = localStorage.getItem('kingsgate_muted') === '1';
    } catch {
      this.muted = false;
    }
  }

  private getCtx(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  isMuted(): boolean {
    return this.muted;
  }

  setMuted(val: boolean) {
    this.muted = val;
    try {
      localStorage.setItem('kingsgate_muted', val ? '1' : '0');
    } catch {
      // ignore storage errors
    }
  }

  toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  private tone(freqStart: number, freqEnd: number, duration: number, type: OscillatorType, gainPeak: number, delay = 0) {
    const ctx = this.getCtx();
    if (!ctx) return;
    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), now + duration);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(gainPeak, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.01);
  }

  playMove() {
    this.tone(240, 95, 0.065, 'triangle', 0.16);
    this.tone(480, 180, 0.03, 'sine', 0.06);
  }

  playCapture() {
    this.tone(175, 58, 0.1, 'sawtooth', 0.14);
    this.tone(360, 120, 0.06, 'triangle', 0.14);
  }

  playCastle() {
    this.tone(220, 95, 0.06, 'triangle', 0.14, 0);
    this.tone(260, 110, 0.06, 'triangle', 0.14, 0.085);
  }

  playCheck() {
    this.tone(587.33, 440, 0.16, 'sine', 0.12);
    this.tone(880, 660, 0.18, 'triangle', 0.07, 0.03);
  }

  playPromote() {
    this.tone(440, 660, 0.11, 'sine', 0.12, 0);
    this.tone(660, 880, 0.14, 'triangle', 0.11, 0.06);
  }

  playGameStart() {
    this.tone(330, 440, 0.12, 'sine', 0.1, 0);
    this.tone(440, 554.37, 0.14, 'sine', 0.1, 0.09);
  }

  playGameOver(victory: boolean) {
    if (victory) {
      this.tone(392, 392, 0.12, 'triangle', 0.12, 0);
      this.tone(493.88, 493.88, 0.12, 'triangle', 0.12, 0.1);
      this.tone(587.33, 587.33, 0.24, 'triangle', 0.14, 0.2);
    } else {
      this.tone(349.23, 311.13, 0.16, 'sine', 0.1, 0);
      this.tone(293.66, 220, 0.26, 'sine', 0.1, 0.14);
    }
  }

  playLowTime() {
    this.tone(720, 680, 0.045, 'sine', 0.05);
  }
}

export const soundFx = new SoundEngine();
