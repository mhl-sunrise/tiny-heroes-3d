// audio.js — fully procedural sound (no external files) using the WebAudio API.
// Keeps the game self-contained and small.

class AudioBus {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.fireGain = null;
    this.fireStarted = false;
    this._boomBuf = null; // decoded "collapsing structure" one-shot (polyphonic)
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
      // soft-clip guard: big booms + the fire roar must not distort harshly
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 18;
      comp.ratio.value = 6;
      comp.attack.value = 0.004;
      comp.release.value = 0.18;
      this.master.connect(comp).connect(this.ctx.destination);
      this._ready = true;
      this._loadBoomSample(); // non-blocking; boom() stays procedural until it lands
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

  // Fire ambience, looping forever. The real recording (assets/fire-ambience.mp3,
  // soundreality via Pixabay, free to use) is decoded once, looped click-free and
  // fed into fireGain -- the same node the old procedural crackle used, so the
  // fire-level + proximity scaling in game.js works unchanged. If the sample is
  // missing or fails to decode (offline dev, CDN hiccup) we fall back to the
  // procedural brown-noise roar.
  startFire(intensity) {
    if (!this._ready || this.fireStarted) return;
    this.fireStarted = true;
    this._fireIntensity = intensity;
    const ctx = this.ctx;

    this.fireGain = ctx.createGain();
    this.fireGain.gain.value = 0;

    // slow LFO so the fire "breathes" (applies to sample and fallback alike)
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 6.5;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.03;
    lfo.connect(lfoGain).connect(this.fireGain.gain);
    lfo.start();

    this.fireGain.connect(this.master);

    this._loadFireSample()
      .then(() => this.setFireIntensity(this._fireIntensity))
      .catch(() => {
        this._startProceduralFire();
        this.setFireIntensity(this._fireIntensity);
      });
  }

  async _loadFireSample() {
    const res = await fetch("assets/fire-ambience.mp3");
    if (!res.ok) throw new Error("fire sample missing (" + res.status + ")");
    const decoded = await this.ctx.decodeAudioData(await res.arrayBuffer());
    const src = this.ctx.createBufferSource();
    src.buffer = this._seamlessLoop(decoded);
    src.loop = true;
    src.connect(this.fireGain);
    src.start();
  }

  // The raw slice has an arbitrary start/end, so the loop point would click.
  // Fix: crossfade the last `fade` samples (the tail) into a copy of the first
  // `fade` samples (the head) and drop the raw tail -- the loop boundary now
  // falls inside the crossfade region, so the repeat is inaudible.
  _seamlessLoop(buffer, fadeSec = 0.5) {
    const ctx = this.ctx;
    const fade = Math.min(Math.floor(buffer.sampleRate * fadeSec), Math.floor(buffer.length / 4));
    const len = buffer.length;
    const outLen = len - fade;
    const out = ctx.createBuffer(buffer.numberOfChannels, outLen, buffer.sampleRate);
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const src = buffer.getChannelData(ch);
      const dst = out.getChannelData(ch);
      for (let i = 0; i < fade; i++) {
        const t = i / fade;
        dst[i] = src[len - fade + i] * (1 - t) + src[i] * t;
      }
      dst.set(src.subarray(fade, outLen), fade);
    }
    return out;
  }

  // Fallback fire sound (original procedural version): brown noise band-passed.
  _startProceduralFire() {
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

    src.connect(bp).connect(this.fireGain);
    src.start();
  }

  setFireIntensity(intensity) {
    if (!this.fireGain) return;
    // 0.45 peak: a far fire stays a murmur, a fire right next to you is a roar.
    // (Higher than the old procedural 0.3 because the real recording sits
    // quieter than synthesized noise at the same gain.)
    const target = Math.max(0, Math.min(1, intensity)) * 0.45;
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

  // Low-HP heartbeat: two soft thumps, repeated while `on` is true.
  heartbeat(on) {
    if (on && this._ready && !this._hbOn) this._hbTick();
    this._hbOn = !!on;
  }
  _hbTick() {
    if (!this._hbOn || !this._ready) return;
    this.blip(72, 0.1, "sine", 0.5);
    setTimeout(() => this.blip(58, 0.09, "sine", 0.35), 150);
    setTimeout(() => this._hbTick(), 850);
  }

  // Level-up fanfare.
  // Fire-escape creak while climbing up a floor
  climb() {
    for (let i = 0; i < 6; i++) {
      setTimeout(
        () => this.blip(120 + Math.random() * 70, 0.1, "square", 0.12),
        i * 380
      );
    }
  }

  levelUp() {
    const notes = [330, 415, 494, 659, 831];
    notes.forEach((n, i) => setTimeout(() => this.blip(n, 0.18, "triangle", 0.5), i * 110));
  }

  // --- Tension: falling debris + ultra danger
  whoosh() {
    // debris cutting the air overhead
    this.blip(900, 0.09, "sawtooth", 0.1);
    setTimeout(() => this.blip(500, 0.12, "sawtooth", 0.08), 60);
  }
  // A chunk tearing loose from the ceiling, right as the fall begins.
  crack() {
    this.blip(170, 0.07, "square", 0.3);
    this._noiseBurst(0.09, 1400, 0.4, "bandpass"); // dry snap of breaking plaster
    setTimeout(() => this.blip(85, 0.16, "sawtooth", 0.25), 60); // low groan after
  }
  async _loadBoomSample() {
    try {
      const res = await fetch("assets/debris-crash.mp3");
      if (!res.ok) return;
      this._boomBuf = await this.ctx.decodeAudioData(await res.arrayBuffer());
    } catch {
      /* keep the procedural fallback */
    }
  }
  boom(vol = 1) {
    // Real "collapsing structure" recording (Mixkit, free licence): concrete
    // slams down, dust scatters, long settling tail. Random playback rate
    // (0.85-1.15x) keeps repeated impacts from sounding copy-pasted. vol is
    // distance-scaled (near = violent). Polyphonic: one fresh source per hit.
    if (this._ready && this._boomBuf) {
      const ctx = this.ctx;
      const t = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = this._boomBuf;
      src.playbackRate.value = 0.85 + Math.random() * 0.3;
      const g = ctx.createGain();
      const dur = this._boomBuf.duration / src.playbackRate.value;
      const peak = 0.9 * vol;
      g.gain.setValueAtTime(peak, t);
      g.gain.setValueAtTime(peak, t + Math.max(0, dur - 0.25));
      g.gain.linearRampToValueAtTime(0, t + dur); // no click at the sample end
      src.connect(g).connect(this.master);
      src.start(t);
      return;
    }
    this._proceduralBoom(vol); // sample not loaded yet (or failed)
  }
  _proceduralBoom(vol = 1) {
    // debris impact: a real EXPLOSION — chest-thumping sub drop, a sharp
    // crack at the moment of contact, a muffled smash, then a rolling
    // building-shake tail. vol is distance-scaled (near = violent).
    this._sweep(130, 32, 0.5, "sine", 0.95 * vol); // the "BWOOOM"
    this.blip(70, 0.3, "triangle", 0.6 * vol);
    this._noiseBurst(0.06, 3500, 0.9 * vol, "highpass"); // sharp contact crack
    this._noiseBurst(0.3, 750, 0.85 * vol, "lowpass"); // the heavy smash
    this._noiseBurst(0.55, 220, 0.4 * vol, "lowpass"); // rolling tail
    this.blip(420, 0.05, "sawtooth", 0.2 * vol);
  }
  // Oscillator with a pitch sweep — the sub drop of a boom.
  _sweep(f0, f1, dur, type, vol) {
    if (!this._ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  // Short decaying noise burst — the "smash" part of a heavy impact.
  _noiseBurst(dur, freq, vol, type = "lowpass") {
    if (!this._ready) return;
    const ctx = this.ctx;
    const n = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) {
      const env = 1 - i / n;
      d[i] = (Math.random() * 2 - 1) * env * env;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(this.master);
    src.start();
  }
  thud() {
    this.blip(70, 0.22, "sine", 0.5);
    this.blip(120, 0.1, "triangle", 0.3);
  }
  closeCall() {
    // bright chime — the reward for a near miss
    this.blip(880, 0.07, "triangle", 0.35);
    setTimeout(() => this.blip(1320, 0.12, "triangle", 0.35), 70);
  }
  rumble() {
    // building groans before a debris burst
    for (let i = 0; i < 4; i++) {
      setTimeout(
        () => this.blip(45 + Math.random() * 25, 0.3, "sawtooth", 0.22),
        i * 320
      );
    }
  }
  dangerSting() {
    // ultra-danger entry
    for (let i = 0; i < 3; i++) {
      setTimeout(() => this.blip(1200 + i * 200, 0.06, "square", 0.18), i * 90);
    }
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
