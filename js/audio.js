// audio.js — sound built on the WebAudio API: real looped recordings for the
// fire ambience + debris crash, everything else (SFX and the action music
// loop) is synthesized procedurally, so the game stays small.

class AudioBus {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.fireGain = null;
    this.fireStarted = false;
    this.musicOn = false;
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

  // --- Action music: a small procedural loop that plays under gameplay ---
  // A look-ahead scheduler (setInterval + WebAudio clock) keeps the groove
  // tight even when the render loop stutters. Everything runs through
  // _musicGain into master, so the mute button and the soft-clip compressor
  // handle it automatically. Call startMusic() from a user gesture.
  startMusic() {
    if (!this._ready || this.musicOn) return;
    this.musicOn = true;
    const ctx = this.ctx;
    this._musicGain = ctx.createGain();
    this._musicGain.gain.value = 0.0001;
    this._musicGain.gain.setTargetAtTime(0.3, ctx.currentTime, 0.4); // gentle fade-in
    this._musicGain.connect(this.master);
    this._beat = 60 / 118; // 118 BPM — urgent but not frantic
    this._mStep = 0; // sixteenth-note position inside the 4-bar (64-step) loop
    this._mNext = ctx.currentTime + 0.15;
    this._musicTimer = setInterval(() => this._musicTick(), 40);
    this._musicTick();
  }

  stopMusic() {
    if (!this.musicOn) return;
    this.musicOn = false;
    clearInterval(this._musicTimer);
    const g = this._musicGain;
    if (g) {
      g.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.12); // quick fade-out
      setTimeout(() => g.disconnect(), 800);
    }
  }

  _musicTick() {
    if (!this.musicOn) return;
    const ahead = this.ctx.currentTime + 0.15; // ~4 steps of lookahead
    while (this._mNext < ahead) {
      this._playMusicStep(this._mStep, this._mNext);
      this._mNext += this._beat / 4;
      this._mStep = (this._mStep + 1) % 64;
    }
  }

  _mn(m) {
    return 440 * Math.pow(2, (m - 69) / 12); // midi number -> frequency
  }

  _playMusicStep(step, t) {
    const bar = Math.floor(step / 16);
    const p = step % 16;
    // Am - F - C - G: the classic "heroic" action progression
    const roots = [45, 41, 48, 43]; // A2, F2, C3, G2 (midi)
    const pads = [
      [57, 60, 64], // Am
      [53, 57, 60], // F
      [60, 64, 67], // C
      [55, 59, 62], // G
    ];
    const root = roots[bar];
    // four-on-the-floor kick + a pickup into the loop's head
    if (p === 0 || p === 4 || p === 8 || p === 12 || (bar === 3 && p === 15)) this._mkick(t);
    // snare on the backbeat
    if (p === 4 || p === 12) this._msnare(t);
    // off-beat hi-hats keep the shuffle
    if (p % 4 === 2) this._mhat(t);
    // eighth-note bassline: root-root-fifth-root ...
    if (p % 2 === 0) {
      const e = p / 2;
      this._mbass(t, this._mn(e === 2 || e === 6 ? root + 7 : root));
    }
    // soft pad chord at the top of each bar
    if (p === 0) pads[bar].forEach((m) => this._mpad(t, this._mn(m)));
    // tiny siren motif on the last two bars (fire-truck "wee-oo", chord tones)
    if (bar === 2 && p === 0) this._mlead(t, this._mn(76)); // E5
    if (bar === 2 && p === 3) this._mlead(t, this._mn(79)); // G5
    if (bar === 3 && p === 0) this._mlead(t, this._mn(71)); // B4
    if (bar === 3 && p === 3) this._mlead(t, this._mn(74)); // D5
  }

  // --- music instruments (all short-lived, into _musicGain) ---
  _mkick(t) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.1); // chest thump
    g.gain.setValueAtTime(0.55, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g).connect(this._musicGain);
    o.start(t);
    o.stop(t + 0.2);
  }
  _msnare(t) {
    this._mburst(t, 0.12, 1800, "bandpass", 0.32, 0.004);
  }
  _mhat(t) {
    this._mburst(t, 0.04, 8000, "highpass", 0.07, 0.002);
  }
  _mbass(t, f) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = f;
    const fl = ctx.createBiquadFilter();
    fl.type = "lowpass";
    fl.frequency.value = 420;
    fl.Q.value = 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.38, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22); // short 8th-note feel
    o.connect(fl).connect(g).connect(this._musicGain);
    o.start(t);
    o.stop(t + 0.25);
  }
  _mpad(t, f) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.value = f;
    const g = ctx.createGain();
    const dur = this._beat * 1.6;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.11, t + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this._musicGain);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  _mlead(t, f) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = "square";
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.13, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(g).connect(this._musicGain);
    o.start(t);
    o.stop(t + 0.15);
  }
  // Reusable short decaying noise hit (snare / hat).
  _mburst(t, dur, freq, type, vol, attack) {
    const ctx = this.ctx;
    const n = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = ctx.createBufferSource();
    s.buffer = buf;
    const fl = ctx.createBiquadFilter();
    fl.type = type;
    fl.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl).connect(g).connect(this._musicGain);
    s.start(t);
    s.stop(t + dur);
  }
}

export default AudioBus;
