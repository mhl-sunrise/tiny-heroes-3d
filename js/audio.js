// audio.js — fully procedural sound (no external files) using the WebAudio API.
// Keeps the game self-contained and small.

class AudioBus {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.fireGain = null;
    this.fireStarted = false;
    this._ready = false;
  }

  // Must be called from a user gesture (autoplay policies).
  init() {
    if (this._ready) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.9;
      this.master.connect(this.ctx.destination);
      this._ready = true;
    } catch (e) {
      this._ready = false;
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.9;
  }

  isMuted() {
    return this.muted;
  }

  // Continuous crackling fire bed. Intensity 0..1 scales volume + sizzle.
  startFire(intensity) {
    if (!this._ready || this.fireStarted) return;
    this.fireStarted = true;
    const ctx = this.ctx;
    const bufSize = 2 * ctx.sampleRate;
    const buffer = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    // brown-ish noise for a warm crackle
    let last = 0;
    for (let i = 0; i < bufSize; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5 + white * 0.06;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;

    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 520;
    bp.Q.value = 0.7;

    this.fireGain = ctx.createGain();
    this.fireGain.gain.value = 0;

    // subtle LFO to breathe the flame
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 6.5;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.03;
    lfo.connect(lfoGain).connect(this.fireGain.gain);

    src.connect(bp).connect(this.fireGain).connect(this.master);
    src.start();
    lfo.start();
    this.setFireIntensity(intensity);
  }

  setFireIntensity(intensity) {
    if (!this.fireGain) return;
    const target = Math.max(0, Math.min(1, intensity)) * 0.12;
    this.fireGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.6);
  }

  // Short UI / event blips.
  blip(freq = 660, dur = 0.12, type = "sine", vol = 0.5) {
    if (!this._ready) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.linearRampToValueAtTime(vol, ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g).connect(this.master);
    o.start();
    o.stop(ctx.currentTime + dur + 0.02);
  }

  grab() {
    this.blip(440, 0.08, "triangle", 0.4);
    setTimeout(() => this.blip(560, 0.09, "triangle", 0.4), 70);
  }

  save() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((n, i) => setTimeout(() => this.blip(n, 0.16, "sine", 0.5), i * 90));
  }

  win() {
    const notes = [392, 523.25, 659.25, 783.99, 1046.5];
    notes.forEach((n, i) => setTimeout(() => this.blip(n, 0.3, "triangle", 0.55), i * 140));
  }

  lose() {
    const notes = [440, 349.23, 261.63, 196];
    notes.forEach((n, i) => setTimeout(() => this.blip(n, 0.4, "sine", 0.5), i * 180));
  }
}

export default AudioBus;
