// All sound is synthesized with WebAudio: engine hum, two-tone siren, blips,
// thuds, a success jingle and a soft ambient pad. No audio files anywhere.
window.PC = window.PC || {};

PC.AudioSys = {
  ctx: null, muted: false, master: null,
  engineOsc: null, engineGain: null, engineFilter: null,
  sirenOsc: null, sirenGain: null, sirenTimer: 0, sirenHigh: false,
  padOsc: null, padGain: null,

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    // Engine: sawtooth through a lowpass, gain follows throttle.
    this.engineOsc = this.ctx.createOscillator(); this.engineOsc.type = 'sawtooth';
    this.engineFilter = this.ctx.createBiquadFilter(); this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 300;
    this.engineGain = this.ctx.createGain(); this.engineGain.gain.value = 0;
    this.engineOsc.connect(this.engineFilter); this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master); this.engineOsc.start();
    // Siren: square wave whose pitch the update loop alternates.
    this.sirenOsc = this.ctx.createOscillator(); this.sirenOsc.type = 'triangle';
    this.sirenGain = this.ctx.createGain(); this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(this.master);
    this.sirenOsc.start();
    // Ambient pad: two detuned sines, very quiet, always on once started.
    this.padOsc = this.ctx.createOscillator(); this.padOsc.type = 'sine';
    this.padOsc.frequency.value = 196;
    const pad2 = this.ctx.createOscillator(); pad2.type = 'sine'; pad2.frequency.value = 294.5;
    this.padGain = this.ctx.createGain(); this.padGain.gain.value = 0.016;
    this.padOsc.connect(this.padGain); pad2.connect(this.padGain);
    this.padGain.connect(this.master); this.padOsc.start(); pad2.start();
  },
  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  },
  // Called every frame: speed01 drives the engine, policeDist drives the siren.
  update(dt, driving, speed01, nearestPoliceDist) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const eg = driving ? 0.05 + speed01 * 0.075 : 0;
    this.engineGain.gain.setTargetAtTime(eg, t, 0.08);
    this.engineOsc.frequency.setTargetAtTime(55 + speed01 * 165, t, 0.06);
    this.engineFilter.frequency.setTargetAtTime(240 + speed01 * 900, t, 0.1);
    let sg = 0;
    if (nearestPoliceDist !== null && nearestPoliceDist < 130) {
      sg = 0.055 * (1 - nearestPoliceDist / 130);
      this.sirenTimer += dt;
      if (this.sirenTimer > 0.42) {
        this.sirenTimer = 0; this.sirenHigh = !this.sirenHigh;
        this.sirenOsc.frequency.setValueAtTime(this.sirenHigh ? 880 : 660, t);
      }
    }
    this.sirenGain.gain.setTargetAtTime(sg, t, 0.15);
  },
  blip(freq, dur, vol, type) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type || 'sine'; o.frequency.value = freq || 880;
    g.gain.setValueAtTime(vol || 0.12, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + (dur || 0.12));
    o.connect(g); g.connect(this.master); o.start(); o.stop(this.ctx.currentTime + (dur || 0.12));
  },
  pickup() { this.blip(740, 0.1, 0.14); setTimeout(() => this.blip(1180, 0.14, 0.14), 70); },
  thud() {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(120, this.ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(38, this.ctx.currentTime + 0.18);
    g.gain.setValueAtTime(0.3, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.2);
    o.connect(g); g.connect(this.master); o.start(); o.stop(this.ctx.currentTime + 0.22);
  },
  jingle() {
    if (!this.ctx) return;
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => setTimeout(() => this.blip(f, 0.22, 0.13, 'triangle'), i * 110));
  },
  alarm() { this.blip(220, 0.3, 0.16, 'square'); setTimeout(() => this.blip(180, 0.4, 0.16, 'square'), 200); },
};
