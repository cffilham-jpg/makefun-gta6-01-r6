// Solmar Bay — every sound is synthesized live with WebAudio. No audio files,
// no network: oscillators and filtered noise make the engine, sirens, gunfire
// and the little welcome jingle on the title screen.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineOsc = null;
    this.engineOsc2 = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenTimer = 0;
    this.sirenHigh = false;
    this.musicTimer = 0;
    this.musicStep = 0;
    this.musicOn = false;
    this.muted = false;
    this.engineOn = false;
  }

  /** Create the context on the first user gesture (browsers require it). */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);
    this.startEngineLoop();
    this.startSirenLoop();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  startEngineLoop() {
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    this.engineOsc2 = this.ctx.createOscillator();
    this.engineOsc2.type = 'square';
    this.engineOsc2.frequency.value = 28;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(filter);
    this.engineOsc2.connect(filter);
    filter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
    this.engineOsc2.start();
  }

  /** Called every frame: speedRatio 0..1, driving true while in a car. */
  updateEngine(speedRatio, driving) {
    if (!this.ctx || !this.engineGain) return;
    const t = this.ctx.currentTime;
    const target = driving ? 0.05 + speedRatio * 0.06 : 0;
    this.engineGain.gain.setTargetAtTime(target, t, 0.08);
    const freq = 48 + speedRatio * 130;
    this.engineOsc.frequency.setTargetAtTime(freq, t, 0.06);
    this.engineOsc2.frequency.setTargetAtTime(freq * 0.5, t, 0.06);
  }

  startSirenLoop() {
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 720;
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    this.sirenOsc.start();
  }

  /** Called every frame: near true when a police car is close. */
  updateSiren(dt, near) {
    if (!this.ctx || !this.sirenGain) return;
    const t = this.ctx.currentTime;
    this.sirenGain.gain.setTargetAtTime(near ? 0.045 : 0, t, 0.1);
    if (!near) return;
    this.sirenTimer += dt;
    if (this.sirenTimer > 0.42) {
      this.sirenTimer = 0;
      this.sirenHigh = !this.sirenHigh;
      this.sirenOsc.frequency.setTargetAtTime(this.sirenHigh ? 960 : 700, t, 0.03);
    }
  }

  /** A short filtered-noise burst with a low thump: one gunshot. */
  gunshot(big) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const dur = big ? 0.22 : 0.12;
    const buffer = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * dur), this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = big ? 900 : 1800;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(big ? 0.5 : 0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start(t);
  }

  /** Two-note chime for pickups and cash. */
  chime() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [660, 990].forEach((f, i) => {
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + i * 0.09);
      g.gain.exponentialRampToValueAtTime(0.18, t + i * 0.09 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.09 + 0.35);
      o.connect(g);
      g.connect(this.master);
      o.start(t + i * 0.09);
      o.stop(t + i * 0.09 + 0.4);
    });
  }

  /** A rising four-note arpeggio when a mission is completed. */
  missionComplete() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [523, 659, 784, 1047].forEach((f, i) => {
      const o = this.ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + i * 0.11);
      g.gain.exponentialRampToValueAtTime(0.22, t + i * 0.11 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.11 + 0.5);
      o.connect(g);
      g.connect(this.master);
      o.start(t + i * 0.11);
      o.stop(t + i * 0.11 + 0.55);
    });
  }

  /** A low two-note sting when the wanted level rises. */
  wantedUp() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [196, 147].forEach((f, i) => {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + i * 0.16);
      g.gain.exponentialRampToValueAtTime(0.14, t + i * 0.16 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.16 + 0.4);
      o.connect(g);
      g.connect(this.master);
      o.start(t + i * 0.16);
      o.stop(t + i * 0.16 + 0.45);
    });
  }

  /** A soft thud for a crash. */
  crash(strength) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(Math.min(0.5, 0.1 + strength * 0.4), t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + 0.25);
  }

  /** The welcome jingle: a warm major phrase when the game starts. */
  welcome() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [392, 494, 587, 784].forEach((f, i) => {
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + i * 0.13);
      g.gain.exponentialRampToValueAtTime(0.2, t + i * 0.13 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.13 + 0.7);
      o.connect(g);
      g.connect(this.master);
      o.start(t + i * 0.13);
      o.stop(t + i * 0.13 + 0.75);
    });
  }

  /** A gentle looping pad: one soft chord note per beat, called every frame. */
  updateMusic(dt) {
    if (!this.ctx || !this.musicOn) return;
    this.musicTimer += dt;
    if (this.musicTimer < 0.55) return;
    this.musicTimer = 0;
    const scale = [262, 294, 330, 392, 440, 392, 330, 294];
    const f = scale[this.musicStep % scale.length];
    this.musicStep++;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.045, t + 0.1);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + 0.85);
  }
}
