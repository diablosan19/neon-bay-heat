// sound.js — a small WebAudio synth: an engine whose pitch follows the
// player's speed, a two-tone siren that swells as a cruiser closes in, and
// one-shot stings for crashes, cash and crimes. No audio files, everything
// is oscillators and filtered noise, and everything is wrapped so a browser
// without audio (or a headless check) simply stays silent.

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.started = false;
  }

  start() {
    if (this.started) return;
    this.started = true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(ctx.destination);

      // Engine: a sawtooth through a lowpass, pitch set per frame.
      this.engineOsc = ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 55;
      this.engineFilter = ctx.createBiquadFilter();
      this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.value = 420;
      this.engineGain = ctx.createGain();
      this.engineGain.gain.value = 0;
      this.engineOsc.connect(this.engineFilter).connect(this.engineGain).connect(this.master);
      this.engineOsc.start();

      // Siren: a square wave the update loop flips between two tones.
      this.sirenOsc = ctx.createOscillator();
      this.sirenOsc.type = 'square';
      this.sirenOsc.frequency.value = 720;
      this.sirenGain = ctx.createGain();
      this.sirenGain.gain.value = 0;
      this.sirenOsc.connect(this.sirenGain).connect(this.master);
      this.sirenOsc.start();
    } catch {
      this.ctx = null;
    }
  }

  // Called every frame with the world: engine by speed, siren by the
  // nearest cruiser.
  update(state) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const p = state.player;
    if (!p.onFoot && p.car && state.status === 'playing') {
      const spd = Math.abs(p.car.speed);
      this.engineOsc.frequency.setTargetAtTime(52 + spd * 0.55, t, 0.06);
      this.engineFilter.frequency.setTargetAtTime(320 + spd * 1.6, t, 0.06);
      this.engineGain.gain.setTargetAtTime(0.05 + Math.min(0.05, spd / 9000), t, 0.09);
    } else {
      this.engineGain.gain.setTargetAtTime(0, t, 0.09);
    }
    let nearest = Infinity;
    for (const car of state.cars) {
      if (car.mode !== 'cop') continue;
      const d = Math.hypot(car.x - p.x, car.y - p.y);
      if (d < nearest) nearest = d;
    }
    if (nearest < 620 && state.status === 'playing') {
      const vol = 0.028 * (1 - nearest / 620);
      this.sirenGain.gain.setTargetAtTime(vol, t, 0.1);
      const tone = Math.floor(state.t * 1.6) % 2 === 0 ? 715 : 955;
      this.sirenOsc.frequency.setTargetAtTime(tone, t, 0.03);
    } else {
      this.sirenGain.gain.setTargetAtTime(0, t, 0.12);
    }
  }

  sting(kind) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const blip = (freq, dur, type, vol, when = 0, slideTo = 0) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t + when);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + when + dur);
      g.gain.setValueAtTime(vol, t + when);
      g.gain.exponentialRampToValueAtTime(0.0001, t + when + dur);
      o.connect(g).connect(this.master);
      o.start(t + when);
      o.stop(t + when + dur + 0.02);
    };
    if (kind === 'cash') {
      blip(880, 0.09, 'sine', 0.16);
      blip(1318, 0.14, 'sine', 0.16, 0.07);
    } else if (kind === 'crime') {
      blip(196, 0.16, 'square', 0.1, 0, 147);
    } else if (kind === 'crash') {
      // A burst of white noise through a falling lowpass.
      const len = Math.floor(ctx.sampleRate * 0.18);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(900, t);
      f.frequency.exponentialRampToValueAtTime(140, t + 0.18);
      const g = ctx.createGain();
      g.gain.value = 0.22;
      src.connect(f).connect(g).connect(this.master);
      src.start(t);
    } else if (kind === 'busted' || kind === 'wasted') {
      blip(392, 0.22, 'triangle', 0.16);
      blip(311, 0.22, 'triangle', 0.16, 0.2);
      blip(233, 0.42, 'triangle', 0.16, 0.4);
    } else if (kind === 'enter') {
      blip(330, 0.07, 'sine', 0.1);
      blip(495, 0.09, 'sine', 0.1, 0.05);
    }
  }

  // Drain the simulation's event queue into stings.
  consumeEvents(state) {
    for (const e of state.events) this.sting(e);
  }
}
