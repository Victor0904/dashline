// Audio 100 % synthétisé (DESIGN §11) : percussions sèches, métal tranchant, sub-basse.
// Breakbeat demi-temps 140 BPM ; les kills de la Chaîne jouent la mélodie (ré mineur pentatonique).
const PENTA = [62, 65, 67, 69, 72]; // ré4 fa4 sol4 la4 do5
function mtof(n) { return 440 * Math.pow(2, (n - 69) / 12); }
function chainNote(i) { // ré4, fa4, sol4, la4, do5, ré5… sur 3 octaves, puis reste sur les 5 plus hautes
  const max = 15; if (i >= max) i = max - 5 + ((i - max) % 5);
  return PENTA[i % 5] + 12 * Math.floor(i / 5);
}

export class Audio {
  constructor() {
    this.ctx = null; this.enabled = false; this.sfxVol = 0.8; this.musicVol = 0.6; this.voices = 0; this.MAXV = 32; this.last = Object.create(null);
    this.state = 'off'; this.step = 0; this.next = 0; this.bpm = 140; this.layer = 0; this.layerT = 0; this.idleLP = 1; this.cardOpen = false; this.bossPhase = 1;
    this.noteIdx = 0;
  }
  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
        const c = this.ctx = new AC();
        this.master = c.createGain(); this.master.gain.value = 0.9;
        const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
        this.master.connect(comp); comp.connect(c.destination);
        this.sfx = c.createGain(); this.sfx.gain.value = this.sfxVol; this.sfx.connect(this.master);
        this.music = c.createGain(); this.music.gain.value = this.musicVol;
        this.mlp = c.createBiquadFilter(); this.mlp.type = 'lowpass'; this.mlp.frequency.value = 18000;
        this.music.connect(this.mlp); this.mlp.connect(this.master);
        this.bus = c.createGain(); this.bus.gain.value = 1; this.bus.connect(this.music);
        const len = c.sampleRate; this.noise = c.createBuffer(1, len, c.sampleRate);
        const d = this.noise.getChannelData(0); let s = 12345; for (let i = 0; i < len; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; d[i] = (s / 0x7fffffff) * 2 - 1; }
        this.enabled = true;
        this.timer = setInterval(() => this.schedule(), 25);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch { this.enabled = false; }
  }
  setVolumes(sfx, music) { this.sfxVol = sfx; this.musicVol = music; if (this.ctx) { this.sfx.gain.setTargetAtTime(sfx, this.ctx.currentTime, 0.05); this.music.gain.setTargetAtTime(this.musicPaused ? 0.0001 : music, this.ctx.currentTime, 0.05); } }
  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  ok() { return this.enabled && this.ctx && this.ctx.state === 'running'; }
  spam(k, ms) { const n = performance.now(); if (this.last[k] && n - this.last[k] < ms) return true; this.last[k] = n; return false; }
  voice(d) { if (this.voices >= this.MAXV) return false; this.voices++; setTimeout(() => { this.voices--; }, d * 1000 + 60); return true; }
  osc(type, f0, f1, dur, peak, delay = 0, filt, pan) {
    const c = this.ctx, t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let n = o; if (filt) { const f = c.createBiquadFilter(); f.type = filt[0]; f.frequency.value = filt[1]; if (filt[2]) f.Q.value = filt[2]; o.connect(f); n = f; }
    n.connect(g); this.out(g, pan); o.start(t); o.stop(t + dur + 0.03);
  }
  nz(dur, peak, type, f0, f1, q, delay = 0, pan) {
    const c = this.ctx, t = c.currentTime + delay, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise; f.type = type; f.frequency.setValueAtTime(f0, t); if (f1 && f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur); if (q) f.Q.value = q;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); this.out(g, pan); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.03);
  }
  out(node, pan) {
    if (pan && this.ctx.createStereoPanner) { const p = this.ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); node.connect(p); p.connect(this.sfx); }
    else node.connect(this.sfx);
  }
  // note de la Chaîne quantifiée à la double croche (±30 ms max, sinon immédiate)
  chainPluck(idx) {
    const c = this.ctx, sx = 60 / this.bpm / 4, now = c.currentTime;
    let t = this.next - sx; while (t < now) t += sx;
    const delay = t - now <= 0.03 ? t - now : 0;
    const f = mtof(chainNote(idx));
    this.osc('square', f, f, 0.12, 0.07, delay, ['lowpass', 2400]);
    this.osc('triangle', f * 2, f * 2, 0.08, 0.03, delay);
  }
  play(name, a = 0, b = 0) {
    if (!this.ok()) return;
    switch (name) {
      case 'aim': if (this.spam(name, 120) || !this.voice(0.15)) return; this.nz(0.14, 0.012 + 0.02 * a, 'bandpass', 1200, 1200 + 800 * a, 3); break;
      case 'dash': if (!this.voice(0.12)) return; this.nz(0.09, 0.22, 'bandpass', 2000, 6000, 1.4, 0, a); this.osc('sine', 900, 300, 0.09, 0.14, 0, null, a); break;
      case 'dry': if (this.spam(name, 60) || !this.voice(0.02)) return; this.osc('square', 3000, 3000, 0.008, 0.05); break;
      case 'cut': if (this.spam(name, 25) || !this.voice(0.07)) return; this.osc('square', 1800, 1800, 0.06, 0.03, 0, ['highpass', 1200]); this.osc('square', 2700, 2700, 0.06, 0.025, 0, ['highpass', 1200]); break;
      case 'boom': if (this.spam(name, 18) || !this.voice(0.13)) return; this.osc('sine', 90, 45, 0.12, 0.28); this.nz(0.08, 0.12, 'lowpass', 2500, 400); if (b) this.chainPluck(a); break;
      case 'bullet': if (this.spam(name, 25) || !this.voice(0.03)) return; this.osc('triangle', 4000, 4000, 0.03, 0.04); break;
      case 'clang': if (!this.voice(0.3)) return; for (const f of [520, 1180, 1900]) this.osc('sine', f, f * 0.99, 0.3, 0.07); break;
      case 'glass': if (this.spam(name, 40) || !this.voice(0.1)) return; for (let i = 0; i < 8; i++) { const f = 3000 + Math.random() * 3000; this.osc('sine', f, f, 0.03, 0.03, i * 0.01); } break;
      case 'tier': { if (!this.voice(0.3)) return; const root = mtof(50 + [0, 3, 5, 7, 10, 12, 15, 17][Math.min(7, a - 1)]); for (const k of [1, 1.5, 2]) this.osc('triangle', root * k * 2, root * k * 2, 0.3, 0.07); this.nz(0.12, 0.12, 'highpass', 1500, 1500); break; }
      case 'chainBreak': if (!this.voice(0.4)) return; this.osc('sawtooth', 600, 120, 0.4, 0.07, 0, ['lowpass', 2000]); this.duck(400, 0.6); this.noteIdx = 0; break;
      case 'tick': if (this.spam(name, 80) || !this.voice(0.01)) return; this.osc('square', 2000, 2000, 0.01, 0.05); break;
      case 'hurt': if (!this.voice(0.25)) return; this.osc('sawtooth', 70, 50, 0.2, 0.35, 0, ['lowpass', 900]); this.osc('square', 140, 90, 0.2, 0.08, 0, ['lowpass', 1500]); break;
      case 'death': if (!this.voice(1.3)) return; this.osc('sine', 80, 30, 0.6, 0.4); this.nz(1.2, 0.15, 'lowpass', 1500, 200); break;
      case 'tele': {
        if (this.spam('tele' + a, 120) || !this.voice(0.6)) return;
        if (a === 1) this.nz(0.55, 0.03, 'highpass', 2000, 6000);                 // Tireur « tsss » montant
        else if (a === 2) this.osc('sawtooth', 80, 160, 0.6, 0.05, 0, ['lowpass', 800]); // Chargeur « grr »
        else if (a === 4) this.osc('sine', 2000, 1000, 0.6, 0.03);                // Mortier sifflement
        else if (a === 6) this.osc('sawtooth', 110, 220, 1.0, 0.03, 0, ['lowpass', 900]); // Lancier bourdon
        else if (a === 7) { this.osc('square', 2400, 2400, 0.01, 0.05); this.osc('square', 2400, 2400, 0.01, 0.05, 0.06); } // Fileur double clic
        else this.osc('triangle', 300, 500, 0.3, 0.03);
        break;
      }
      case 'fire': if (this.spam(name, 50) || !this.voice(0.06)) return; this.osc('square', 700, 350, 0.05, 0.03, 0, ['lowpass', 2500]); break;
      case 'slam': if (this.spam(name, 80) || !this.voice(0.25)) return; this.osc('sine', 70, 35, 0.25, 0.3); this.nz(0.2, 0.15, 'lowpass', 1200, 150); break;
      case 'beam': if (!this.voice(0.2)) return; this.osc('sawtooth', 160, 160, 0.15, 0.08, 0, ['lowpass', 1800]); this.nz(0.15, 0.08, 'bandpass', 900, 900, 2); break;
      case 'level': if (!this.voice(0.4)) return; [62, 65, 69, 74].forEach((n, i) => this.osc('triangle', mtof(n + 12), mtof(n + 12), 0.1, 0.09, i * 0.06)); break;
      case 'card': if (!this.voice(0.3)) return; this.nz(0.08, 0.15, 'bandpass', 3000, 7000, 1.4); [62, 69, 74].forEach(n => this.osc('triangle', mtof(n + 12), mtof(n + 12), 0.25, 0.05)); break;
      case 'evolve': if (!this.voice(0.9)) return; [62, 65, 67, 69, 72, 74].forEach((n, i) => this.osc('triangle', mtof(n + 12), mtof(n + 12), 0.14, 0.08, i * 0.06)); break;
      case 'gong': if (!this.voice(0.9)) return; this.osc('sine', 110, 108, 0.9, 0.25); this.osc('sine', 277, 275, 0.6, 0.05); this.play('cut'); break;
      case 'rupture': if (!this.voice(1.2)) return; this.osc('sine', 110, 108, 1.0, 0.28, 0.12); [62, 69, 74].forEach(n => this.osc('triangle', mtof(n), mtof(n), 0.6, 0.06, 0.12)); break;
      case 'wave': if (this.spam(name, 60) || !this.voice(0.2)) return; this.nz(0.18, 0.08, 'lowpass', 1500, 200); break;
      case 'super': if (!this.voice(0.3)) return; this.osc('sine', 60, 40, 0.3, 0.3); break;
      case 'buy': if (!this.voice(0.4)) return; this.play('cut'); [69, 74, 81].forEach((n, i) => this.osc('triangle', mtof(n), mtof(n), 0.12, 0.08, i * 0.05)); break;
      case 'ui': if (this.spam(name, 40) || !this.voice(0.03)) return; this.osc('sine', 880, 880, 0.03, 0.06); break;
      case 'count': if (this.spam(name, 35) || !this.voice(0.02)) return; this.osc('square', 1800, 1800, 0.012, 0.025); break;
      case 'fanfare': if (!this.voice(0.8)) return; [62, 65, 69, 74, 69, 74].forEach((n, i) => this.osc('triangle', mtof(n + 12), mtof(n + 12), 0.12, 0.09, i * 0.09)); break;
    }
  }
  duck(freq, dur) { if (!this.ctx) return; const t = this.ctx.currentTime, f = this.mlp.frequency; f.cancelScheduledValues(t); f.setValueAtTime(freq, t); f.linearRampToValueAtTime(this.targetLP(), t + dur); }
  targetLP() { return this.cardOpen ? 800 : 2500 + 15500 * this.idleLP; }
  // couches pilotées par le palier de Chaîne (fondu 0,5 s) ; passe-bas si immobile > 1 s sans Chaîne
  setTier(m) { this.layer = m; }
  setIdle(k) { // k : 1 normal → 0 filtré (2,5 kHz)
    if (Math.abs(k - this.idleLP) < 0.02 || !this.ctx) { this.idleLP = k; return; }
    this.idleLP = k; this.mlp.frequency.setTargetAtTime(this.targetLP(), this.ctx.currentTime, 0.15);
  }
  setCard(open) { this.cardOpen = open; if (this.ctx) this.mlp.frequency.setTargetAtTime(this.targetLP(), this.ctx.currentTime, 0.08); }
  setMusic(state, phase = 1) {
    this.state = state; this.bossPhase = phase;
    this.bpm = state === 'boss' ? 140 + 6 * (phase - 1) : state === 'menu' ? 120 : 140;
    if (this.ctx) { const t = this.ctx.currentTime; this.bus.gain.cancelScheduledValues(t); this.bus.gain.setValueAtTime(Math.max(0.0001, this.bus.gain.value), t); this.bus.gain.linearRampToValueAtTime(state === 'off' ? 0.0001 : 1, t + 0.5); }
  }
  pauseMusic(p) { this.musicPaused = p; if (!this.ctx) return; const t = this.ctx.currentTime; this.music.gain.cancelScheduledValues(t); this.music.gain.setValueAtTime(Math.max(0.0001, this.music.gain.value), t); this.music.gain.linearRampToValueAtTime(p ? 0.0001 : this.musicVol, t + 0.2); }
  schedule() {
    if (!this.ok() || this.state === 'off') return;
    const c = this.ctx;
    if (this.next < c.currentTime) this.next = c.currentTime + 0.05;
    while (this.next < c.currentTime + 0.12) { this.beat(this.step, this.next); this.next += 60 / this.bpm / 4; this.step = (this.step + 1) % 64; }
  }
  beat(s, t) {
    const c = this.ctx, bus = this.bus, L = this.state === 'menu' ? 1 : this.layer, boss = this.state === 'boss', susp = this.cardOpen;
    const pos = s % 16, bar = Math.floor(s / 16) % 4;
    const env = (node, g, dur, peak) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); node.connect(g); g.connect(bus); };
    const tone = (type, f, dur, peak, lp) => { const o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.value = f; let n = o; if (lp) { const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = lp; o.connect(fl); n = fl; } env(n, g, dur, peak); o.start(t); o.stop(t + dur + 0.02); };
    const noise = (dur, peak, type, f) => { const sN = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain(); sN.buffer = this.noise; fl.type = type; fl.frequency.value = f; sN.connect(fl); env(fl, g, dur, peak); sN.start(t, (s * 0.013) % 0.5); sN.stop(t + dur + 0.02); };
    // nappe en ré (filtre 1,2 kHz) au début de chaque mesure
    if (pos === 0) for (const d of [-6, 6]) { const o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter(); o.type = 'sawtooth'; o.frequency.value = mtof(bar === 3 ? 45 : bar === 2 ? 41 : 50); o.detune.value = d; f.type = 'lowpass'; f.frequency.value = 1200; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.018, t + 0.4); g.gain.linearRampToValueAtTime(0.0001, t + 60 / this.bpm * 4); o.connect(f); f.connect(g); g.connect(bus); o.start(t); o.stop(t + 60 / this.bpm * 4 + 0.05); }
    if (susp) return; // choix de carte : rythme suspendu, seule la nappe tient
    // kick demi-temps (temps 1 et 3 ressentis à 70)
    const kick = pos === 0 || (pos === 10 && (L >= 2 || boss)) || (boss && pos === 8);
    if (kick) { const o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14); g.gain.setValueAtTime(0.32, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16); o.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.17); }
    // charleston clairsemé / doubles croches (×4+)
    if ((pos % 4 === 2) || (L >= 4 && pos % 2 === 1)) noise(0.03, L >= 4 ? 0.035 : 0.045, 'highpass', 7500);
    if (this.state === 'menu') return;
    // ×2 : breakbeat complet (caisse claire sur le temps 3, ghost notes)
    if (L >= 2 || boss) { if (pos === 8) { noise(0.12, 0.12, 'bandpass', 1800); tone('triangle', 190, 0.08, 0.06); } if (pos === 7 || pos === 14) noise(0.04, 0.03, 'bandpass', 2200); }
    // ×3 : sub-basse (motif ré-ré-fa-sol, 8 pas)
    if ((L >= 3 || boss) && pos % 2 === 0) { const mot = [38, 38, 41, 43, 38, 38, 41, 43]; tone('sine', mtof(mot[(pos / 2) % 8]), 0.2, 0.12); }
    // ×4–×5 : arpège carré staccato
    if (L >= 4 && pos % 2 === 0) tone('square', mtof(PENTA[(s / 2 + bar) % 5] + 12), 0.06, 0.025, 2800);
    // ×6+ : stabs + taikos sur les temps forts ; boss : taikos lourds
    if ((L >= 6 || boss) && pos % 8 === 0) tone('sine', boss ? 70 : 90, 0.3, boss ? 0.22 : 0.16);
    if (L >= 6 && (pos === 0 || pos === 6)) { for (const n of [62, 69]) tone('sawtooth', mtof(n + 12), 0.12, 0.025, 3500); }
  }
}

export class Haptics {
  constructor() { this.enabled = true; this.last = Object.create(null); }
  vibrate(p, key = 'x', minMs = 0) {
    if (!this.enabled || typeof navigator === 'undefined' || !navigator.vibrate) return;
    const n = performance.now(); if (minMs && this.last[key] && n - this.last[key] < minMs) return; this.last[key] = n;
    try { navigator.vibrate(p); } catch { /* ignoré */ }
  }
}
