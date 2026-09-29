/**
 * Procedural adaptive soundscape. No audio files: every sound is synthesised
 * with the Web Audio API so the score can follow the story state.
 */
export type Mood =
  | 'calm'
  | 'curious'
  | 'hostile'
  | 'chaos'
  | 'boss'
  | 'peace'
  | 'descent'
  | 'eye'
  | 'silence'
  | 'end';

interface MoodParams {
  drone: number;
  cut: number;
  hum: number;
  noise: number;
  noiseF: number;
  pad: number;
  seq: null | 'pulse' | 'boss' | 'bells';
  tempo: number;
  artifacts: boolean;
}

const MOODS: Record<Mood, MoodParams> = {
  calm: { drone: 0.2, cut: 220, hum: 0.035, noise: 0.018, noiseF: 900, pad: 0, seq: null, tempo: 60, artifacts: false },
  curious: { drone: 0.22, cut: 320, hum: 0.045, noise: 0.025, noiseF: 1200, pad: 0, seq: null, tempo: 60, artifacts: true },
  hostile: { drone: 0.28, cut: 520, hum: 0.05, noise: 0.03, noiseF: 700, pad: 0, seq: 'pulse', tempo: 92, artifacts: true },
  chaos: { drone: 0.3, cut: 900, hum: 0.05, noise: 0.05, noiseF: 500, pad: 0, seq: 'pulse', tempo: 112, artifacts: true },
  boss: { drone: 0.18, cut: 700, hum: 0.02, noise: 0.02, noiseF: 600, pad: 0, seq: 'boss', tempo: 124, artifacts: false },
  peace: { drone: 0, cut: 200, hum: 0, noise: 0.012, noiseF: 3200, pad: 0.13, seq: null, tempo: 60, artifacts: false },
  descent: { drone: 0.24, cut: 260, hum: 0, noise: 0.07, noiseF: 380, pad: 0, seq: 'bells', tempo: 64, artifacts: false },
  eye: { drone: 0.32, cut: 120, hum: 0, noise: 0.012, noiseF: 300, pad: 0, seq: null, tempo: 60, artifacts: false },
  silence: { drone: 0, cut: 100, hum: 0, noise: 0, noiseF: 300, pad: 0, seq: null, tempo: 60, artifacts: false },
  end: { drone: 0.07, cut: 150, hum: 0, noise: 0.008, noiseF: 900, pad: 0, seq: null, tempo: 60, artifacts: false },
};

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

class AudioEngine {
  ctx: AudioContext | null = null;
  private out!: GainNode; // enabled toggle
  private duck!: GainNode; // freeze / silence
  private bus!: GainNode;
  private sfxBus!: GainNode;
  private musBus!: GainNode;
  private ambBus!: GainNode;
  private noiseBuf!: AudioBuffer;
  private droneGain!: GainNode;
  private droneFilter!: BiquadFilterNode;
  private humGain!: GainNode;
  private noiseGain!: GainNode;
  private noiseFilter!: BiquadFilterNode;
  private padGain!: GainNode;
  private curve!: Float32Array<ArrayBuffer>;
  private chargeNodes: { o: OscillatorNode; g: GainNode; f: BiquadFilterNode } | null = null;
  private seqTimer = 0;
  private nextNote = 0;
  private step = 0;
  private artifactTimer = 0;
  mood: Mood = 'calm';
  intensity = 1;
  enabled = true;

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.out = ctx.createGain();
    this.out.gain.value = this.enabled ? 1 : 0;
    this.duck = ctx.createGain();
    this.bus = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.bus.connect(comp).connect(this.out).connect(this.duck).connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 0.8;
    this.musBus = ctx.createGain();
    this.musBus.gain.value = 0.55;
    this.ambBus = ctx.createGain();
    this.ambBus.gain.value = 0.9;
    this.sfxBus.connect(this.bus);
    this.musBus.connect(this.bus);
    this.ambBus.connect(this.bus);

    // noise buffer
    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    this.curve = this.makeCurve(28);

    this.buildDrone();
    this.applyMood(0.1);
    this.seqTimer = window.setInterval(() => this.schedule(), 25);
    this.scheduleArtifact();
  }

  /** fresh distortion node per voice so finished notes can be garbage-collected */
  private shaper(dest?: AudioNode) {
    const s = this.ctx!.createWaveShaper();
    s.curve = this.curve;
    if (dest) s.connect(dest);
    return s;
  }

  private makeCurve(k: number) {
    const n = 1024;
    const c = new Float32Array(new ArrayBuffer(n * 4));
    for (let i = 0; i < n; i++) {
      const x = (i / n) * 2 - 1;
      c[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
    }
    return c;
  }

  private buildDrone() {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    this.droneFilter = ctx.createBiquadFilter();
    this.droneFilter.type = 'lowpass';
    this.droneFilter.Q.value = 2;
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0;
    const pan = ctx.createStereoPanner();
    const lfo = ctx.createOscillator();
    const lfoG = ctx.createGain();
    lfo.frequency.value = 0.045;
    lfoG.gain.value = 0.55;
    lfo.connect(lfoG).connect(pan.pan);
    lfo.start(t);
    [55, 55.35, 82.4].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = i === 2 ? 'triangle' : 'sawtooth';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = i === 2 ? 0.25 : 0.5;
      o.connect(g).connect(this.droneFilter);
      o.start(t);
    });
    const sub = ctx.createOscillator();
    sub.frequency.value = 27.5;
    const sg = ctx.createGain();
    sg.gain.value = 0.9;
    sub.connect(sg).connect(this.droneGain);
    sub.start(t);
    // slow filter breathing
    const flfo = ctx.createOscillator();
    const flg = ctx.createGain();
    flfo.frequency.value = 0.07;
    flg.gain.value = 60;
    flfo.connect(flg).connect(this.droneFilter.frequency);
    flfo.start(t);
    this.droneFilter.connect(this.droneGain).connect(pan).connect(this.ambBus);

    // mechanical hum
    this.humGain = ctx.createGain();
    this.humGain.gain.value = 0;
    [100, 150, 200.6].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = [0.6, 0.25, 0.12][i];
      o.connect(g).connect(this.humGain);
      o.start(t);
    });
    this.humGain.connect(this.ambBus);

    // air / wind
    const n = ctx.createBufferSource();
    n.buffer = this.noiseBuf;
    n.loop = true;
    this.noiseFilter = ctx.createBiquadFilter();
    this.noiseFilter.type = 'bandpass';
    this.noiseFilter.Q.value = 0.8;
    this.noiseGain = ctx.createGain();
    this.noiseGain.gain.value = 0;
    const npan = ctx.createStereoPanner();
    const nl = ctx.createOscillator();
    const nlg = ctx.createGain();
    nl.frequency.value = 0.11;
    nlg.gain.value = 0.7;
    nl.connect(nlg).connect(npan.pan);
    nl.start(t);
    n.connect(this.noiseFilter).connect(this.noiseGain).connect(npan).connect(this.ambBus);
    n.start(t);

    // warm pad (false peace)
    this.padGain = ctx.createGain();
    this.padGain.gain.value = 0;
    const pf = ctx.createBiquadFilter();
    pf.type = 'lowpass';
    pf.frequency.value = 1400;
    [60, 64, 67, 71, 74, 48].forEach((m, i) => {
      [-4, 4].forEach((det) => {
        const o = ctx.createOscillator();
        o.type = i === 5 ? 'sine' : 'triangle';
        o.frequency.value = midi(m);
        o.detune.value = det;
        const g = ctx.createGain();
        g.gain.value = i === 5 ? 0.3 : 0.09;
        o.connect(g).connect(pf);
        o.start(t);
      });
    });
    pf.connect(this.padGain).connect(this.ambBus);
  }

  private applyMood(time = 2.5) {
    if (!this.ctx) return;
    const p = MOODS[this.mood];
    const t = this.ctx.currentTime;
    const ramp = (param: AudioParam, v: number) => {
      param.cancelScheduledValues(t);
      param.setValueAtTime(param.value, t);
      param.linearRampToValueAtTime(v, t + time);
    };
    ramp(this.droneGain.gain, p.drone);
    ramp(this.droneFilter.frequency, p.cut);
    ramp(this.humGain.gain, p.hum);
    ramp(this.noiseGain.gain, p.noise);
    ramp(this.noiseFilter.frequency, p.noiseF);
    ramp(this.padGain.gain, p.pad);
  }

  setMood(m: Mood, time = 2.5) {
    if (this.mood === m) return;
    this.mood = m;
    this.applyMood(time);
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setTargetAtTime(on ? 1 : 0, t, 0.08);
  }

  /** total silence, instantly */
  freeze() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.duck.gain.cancelScheduledValues(t);
    this.duck.gain.setValueAtTime(this.duck.gain.value, t);
    this.duck.gain.linearRampToValueAtTime(0, t + 0.03);
  }
  unfreeze(time = 0.4) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.duck.gain.cancelScheduledValues(t);
    this.duck.gain.setValueAtTime(this.duck.gain.value, t);
    this.duck.gain.linearRampToValueAtTime(1, t + time);
  }

  // ───────────────────────── sequencer ─────────────────────────
  private schedule() {
    const ctx = this.ctx;
    if (!ctx) return;
    const p = MOODS[this.mood];
    if (!p.seq) {
      this.nextNote = ctx.currentTime + 0.05;
      return;
    }
    const spb = 60 / p.tempo / 4; // 16ths
    if (this.nextNote < ctx.currentTime) this.nextNote = ctx.currentTime + 0.05;
    while (this.nextNote < ctx.currentTime + 0.12) {
      this.playStep(p.seq, this.step % 16, this.nextNote);
      this.step++;
      this.nextNote += spb;
    }
  }

  private playStep(seq: 'pulse' | 'boss' | 'bells', s: number, t: number) {
    if (seq === 'pulse') {
      if (s === 0 || s === 8 || (this.mood === 'chaos' && (s === 11 || s === 14))) this.kick(t, 0.8);
      if (s === 4 || s === 12) this.bass(t, midi(33), 0.28, 0.5);
      if (s % 2 === 1) this.tick(t, 0.05 + (s === 7 ? 0.05 : 0));
      if (this.mood === 'chaos' && s === 6) this.metal(t, 0.09);
      return;
    }
    if (seq === 'bells') {
      if (s === 0 && Math.random() < 0.6) {
        const notes = [72, 75, 79, 82, 84, 87];
        this.bell(t, midi(notes[(Math.random() * notes.length) | 0]), 0.05);
      }
      return;
    }
    // boss
    const I = this.intensity;
    if (s % 4 === 0) this.kick(t, 0.95);
    if (s % 4 === 2) this.hat(t, 0.08);
    if (I >= 2 && s % 2 === 1) this.hat(t, 0.035);
    const line = [33, 33, 45, 33, 36, 33, 40, 31, 33, 33, 45, 33, 36, 43, 40, 38];
    if (s % 2 === 0 || I >= 3) this.bass(t, midi(line[s]), 0.12, 0.42);
    if (I >= 2 && (s === 6 || s === 14)) this.stab(t, [57, 60, 64].map(midi), 0.05);
    if (I >= 3) {
      const arp = [69, 72, 76, 81, 76, 72, 69, 64];
      this.arp(t, midi(arp[s % 8] + (I >= 5 ? 12 : 0)), 0.025);
    }
    if (I >= 4 && s === 12) this.metal(t, 0.07);
  }

  private env(g: GainNode, t: number, a: number, peak: number, d: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  private kick(t: number, v: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.16);
    this.env(g, t, 0.002, v, 0.32);
    o.connect(g).connect(this.musBus);
    o.start(t);
    o.stop(t + 0.4);
  }
  private bass(t: number, f: number, dur: number, v: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    const flt = ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.setValueAtTime(1400, t);
    flt.frequency.exponentialRampToValueAtTime(120, t + dur);
    const g = ctx.createGain();
    this.env(g, t, 0.005, v, dur);
    const pre = ctx.createGain();
    pre.gain.value = 0.6;
    o.connect(pre).connect(this.shaper()).connect(flt);
    flt.connect(g).connect(this.musBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  private noiseHit(t: number, type: BiquadFilterType, f: number, q: number, v: number, dur: number, dest?: AudioNode) {
    const ctx = this.ctx!;
    const n = ctx.createBufferSource();
    n.buffer = this.noiseBuf;
    const flt = ctx.createBiquadFilter();
    flt.type = type;
    flt.frequency.value = f;
    flt.Q.value = q;
    const g = ctx.createGain();
    this.env(g, t, 0.002, v, dur);
    n.connect(flt).connect(g).connect(dest || this.musBus);
    n.start(t, Math.random() * 1.5);
    n.stop(t + dur + 0.05);
    return { flt, g };
  }
  private hat(t: number, v: number) {
    this.noiseHit(t, 'highpass', 8000, 1, v, 0.045);
  }
  private tick(t: number, v: number) {
    this.noiseHit(t, 'bandpass', 3200, 6, v, 0.03);
  }
  private metal(t: number, v: number) {
    const ctx = this.ctx!;
    [320, 471, 689].forEach((f) => {
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = f;
      const g = ctx.createGain();
      this.env(g, t, 0.001, v * 0.4, 0.18);
      o.connect(g).connect(this.musBus);
      o.start(t);
      o.stop(t + 0.25);
    });
  }
  private stab(t: number, fs: number[], v: number) {
    const ctx = this.ctx!;
    fs.forEach((f) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      const flt = ctx.createBiquadFilter();
      flt.type = 'lowpass';
      flt.frequency.setValueAtTime(3000, t);
      flt.frequency.exponentialRampToValueAtTime(300, t + 0.25);
      const g = ctx.createGain();
      this.env(g, t, 0.005, v, 0.28);
      o.connect(flt).connect(g).connect(this.musBus);
      o.start(t);
      o.stop(t + 0.35);
    });
  }
  private arp(t: number, f: number, v: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = f;
    const g = ctx.createGain();
    this.env(g, t, 0.003, v, 0.09);
    o.connect(g).connect(this.musBus);
    o.start(t);
    o.stop(t + 0.12);
  }
  private bell(t: number, f: number, v: number) {
    const ctx = this.ctx!;
    [1, 2.76, 5.4].forEach((m, i) => {
      const o = ctx.createOscillator();
      o.frequency.value = f * m;
      const g = ctx.createGain();
      this.env(g, t, 0.004, v / (i + 1), 2.6 / (i + 1));
      const pan = ctx.createStereoPanner();
      pan.pan.value = Math.random() * 1.4 - 0.7;
      o.connect(g).connect(pan).connect(this.musBus);
      o.start(t);
      o.stop(t + 3);
    });
  }

  // ─────────────── curiosity artifacts: clicks + processed-UI whispers ───────────────
  private scheduleArtifact() {
    clearTimeout(this.artifactTimer);
    this.artifactTimer = window.setTimeout(() => {
      if (this.ctx && MOODS[this.mood].artifacts) {
        Math.random() < 0.55 ? this.whisper(0.035) : this.microClicks();
      }
      this.scheduleArtifact();
    }, 1400 + Math.random() * 4200);
  }
  whisper(v = 0.04) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const dur = 0.5 + Math.random() * 0.7;
    const n = ctx.createBufferSource();
    n.buffer = this.noiseBuf;
    const f1 = ctx.createBiquadFilter();
    f1.type = 'bandpass';
    f1.Q.value = 9;
    f1.frequency.setValueAtTime(700 + Math.random() * 600, t);
    f1.frequency.linearRampToValueAtTime(1800 + Math.random() * 1200, t + dur * 0.5);
    f1.frequency.linearRampToValueAtTime(900, t + dur);
    const f2 = ctx.createBiquadFilter();
    f2.type = 'bandpass';
    f2.Q.value = 12;
    f2.frequency.value = 2400 + Math.random() * 800;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    // syllable-like amplitude
    for (let i = 0; i < 5; i++) g.gain.linearRampToValueAtTime(v * (0.3 + Math.random()), t + (dur / 5) * (i + 0.5));
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 1.8 - 0.9;
    n.connect(f1).connect(g);
    n.connect(f2).connect(g);
    g.connect(pan).connect(this.sfxBus);
    n.start(t, Math.random());
    n.stop(t + dur + 0.1);
  }
  microClicks() {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const n = 2 + ((Math.random() * 4) | 0);
    for (let i = 0; i < n; i++) this.noiseHit(t + i * (0.03 + Math.random() * 0.06), 'bandpass', 2000 + Math.random() * 5000, 8, 0.05, 0.015, this.sfxBus);
  }

  // ───────────────────────── SFX ─────────────────────────
  private tone(type: OscillatorType, f0: number, f1: number, dur: number, v: number, dest?: AudioNode, delay = 0) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
    const g = ctx.createGain();
    this.env(g, t, 0.003, v, dur);
    o.connect(g).connect(dest || this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  private nz(type: BiquadFilterType, f: number, q: number, v: number, dur: number, delay = 0) {
    if (!this.ctx) return;
    this.noiseHit(this.ctx.currentTime + delay, type, f, q, v, dur, this.sfxBus);
  }
  hover() {
    this.tone('sine', 1400, 1900, 0.05, 0.025);
  }
  magnet() {
    this.tone('sine', 320, 480, 0.12, 0.02);
  }
  click() {
    this.tone('sine', 190, 60, 0.12, 0.2);
    this.nz('highpass', 4000, 1, 0.06, 0.02);
  }
  type() {
    this.nz('bandpass', 2600 + Math.random() * 1400, 10, 0.05, 0.012);
  }
  pulse() {
    this.tone('sine', 880, 240, 0.08, 0.1);
    this.nz('highpass', 5000, 1, 0.04, 0.03);
  }
  chargeStart() {
    const ctx = this.ctx;
    if (!ctx || this.chargeNodes) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(420, t + 1.2);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 8;
    f.frequency.setValueAtTime(200, t);
    f.frequency.exponentialRampToValueAtTime(2600, t + 1.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.07, t + 0.3);
    o.connect(f).connect(g).connect(this.sfxBus);
    o.start(t);
    this.chargeNodes = { o, g, f };
  }
  chargeStop() {
    const ctx = this.ctx;
    const n = this.chargeNodes;
    if (!ctx || !n) return;
    const t = ctx.currentTime;
    n.g.gain.cancelScheduledValues(t);
    n.g.gain.setValueAtTime(n.g.gain.value, t);
    n.g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    n.o.stop(t + 0.08);
    this.chargeNodes = null;
  }
  burst(p: number) {
    this.tone('sine', 160, 32, 0.5 + p * 0.4, 0.35 + p * 0.25);
    this.nz('lowpass', 900 + p * 1600, 1, 0.18 + p * 0.1, 0.4 + p * 0.3);
    this.tone('square', 1200, 90, 0.18, 0.03);
  }
  hit() {
    this.tone('square', 1100 + Math.random() * 300, 420, 0.05, 0.035);
  }
  kill() {
    this.nz('bandpass', 1800, 2, 0.14, 0.18);
    this.tone('triangle', 600, 80, 0.25, 0.08);
  }
  hurt() {
    if (this.ctx) this.tone('sawtooth', 110, 40, 0.3, 0.2, this.shaper(this.sfxBus));
    this.nz('lowpass', 600, 1, 0.2, 0.25);
  }
  impact(v = 1) {
    this.tone('sine', 85, 30, 0.35, 0.25 * v);
    this.nz('lowpass', 500, 1, 0.1 * v, 0.2);
  }
  shatter() {
    for (let i = 0; i < 7; i++) this.nz('bandpass', 2500 + Math.random() * 6000, 12, 0.06, 0.04, i * 0.025 + Math.random() * 0.02);
    this.tone('sine', 300, 60, 0.3, 0.1);
  }
  bossHit() {
    this.tone('square', 220, 180, 0.08, 0.05);
    this.tone('square', 331, 250, 0.08, 0.04);
  }
  scrollLock() {
    this.tone('sine', 70, 28, 0.9, 0.5);
    this.nz('lowpass', 300, 1, 0.3, 0.5);
    if (this.ctx) this.tone('square', 60, 40, 0.15, 0.1, this.shaper(this.sfxBus));
  }
  corrupt() {
    for (let i = 0; i < 10; i++) this.tone('square', 200 + Math.random() * 2400, 100 + Math.random() * 800, 0.03, 0.03, undefined, i * 0.035);
  }
  glitch() {
    for (let i = 0; i < 4; i++) this.tone('square', 60 + Math.random() * 3000, 50 + Math.random() * 1000, 0.02, 0.04, undefined, i * 0.02);
  }
  dash() {
    const ctx = this.ctx;
    if (!ctx) return;
    const { flt } = this.noiseHit(ctx.currentTime, 'bandpass', 600, 3, 0.16, 0.22, this.sfxBus);
    flt.frequency.exponentialRampToValueAtTime(5000, ctx.currentTime + 0.2);
  }
  tear() {
    const ctx = this.ctx;
    if (!ctx) return;
    for (let i = 0; i < 26; i++) this.nz('bandpass', 1200 + Math.random() * 3500, 3, 0.05 + Math.random() * 0.08, 0.05, i * 0.045);
    this.tone('sine', 60, 25, 1.6, 0.4);
  }
  boom() {
    this.tone('sine', 55, 20, 2.4, 0.6);
    this.nz('lowpass', 200, 1, 0.3, 1.6);
  }
  heartbeat() {
    this.tone('sine', 60, 35, 0.18, 0.4);
    this.tone('sine', 55, 32, 0.2, 0.3, undefined, 0.22);
  }
  chime() {
    const ctx = this.ctx;
    if (!ctx) return;
    this.bell(ctx.currentTime, midi(84), 0.05);
  }
  swell(dur = 2) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const n = ctx.createBufferSource();
    n.buffer = this.noiseBuf;
    n.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(200, t);
    f.frequency.exponentialRampToValueAtTime(4000, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.2, t + dur);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.02);
    n.connect(f).connect(g).connect(this.sfxBus);
    n.start(t);
    n.stop(t + dur + 0.05);
  }
}

export const audio = new AudioEngine();
