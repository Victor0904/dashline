// Geste « tracé relatif » + tap direct (GAME_DESIGN §2.2, §9.6). Module pur (aucun DOM) : coordonnées déjà converties en u.
import { GESTURE } from './data.js';

const NP = 64;
export class Gesture {
  constructor() {
    this.id = -1; this.ax = 0; this.ay = 0; this.fx = 0; this.fy = 0; this.sx = 0; this.sy = 0; this.t0 = 0; this.path = 0;
    this.aiming = false; this.gain = GESTURE.gain; this.Lmax = 150; this.ignoreId = -1;
    // échantillons du chemin du doigt (Coude) : 1 point / 16 ms, tampon circulaire de 64 points
    this.px = new Float32Array(NP); this.py = new Float32Array(NP); this.pn = 0; this.pi = 0; this.lastSample = -1e9;
    this.vecs = new Float32Array(16);
  }
  setParams(gain, Lmax) { this.gain = gain; this.Lmax = Lmax; }
  get active() { return this.id !== -1; }
  down(id, x, y, t) {
    if (this.id !== -1) return false; // seul le premier doigt compte
    if (id === this.ignoreId) return false;
    this.id = id; this.ax = this.fx = this.sx = x; this.ay = this.fy = this.sy = y; this.t0 = t; this.path = 0; this.aiming = false;
    this.pn = 0; this.pi = 0; this.lastSample = -1e9; this.sample(x, y, t);
    return true;
  }
  sample(x, y, t) {
    if (t - this.lastSample < 16 && this.pn > 0) { const j = (this.pi + NP - 1) % NP; this.px[j] = x; this.py[j] = y; return; }
    this.lastSample = t; this.px[this.pi] = x; this.py[this.pi] = y; this.pi = (this.pi + 1) % NP; if (this.pn < NP) this.pn++;
  }
  move(id, x, y, t) {
    if (id !== this.id) return false;
    this.path += Math.hypot(x - this.fx, y - this.fy);
    this.fx = x; this.fy = y;
    let dx = x - this.ax, dy = y - this.ay; const d = Math.hypot(dx, dy), lim = this.Lmax / this.gain + GESTURE.slack;
    // ancre glissante : le doigt « tire » l'ancre
    if (d > lim) {
      const k = (d - lim) / d; this.ax += dx * k; this.ay += dy * k;
      // points antérieurs à l'ancre : on repart de l'ancre
      this.pn = 0; this.pi = 0; this.lastSample = -1e9; this.sample(this.ax, this.ay, t - 16);
    }
    this.sample(x, y, t);
    dx = x - this.ax; dy = y - this.ay;
    this.aiming = Math.hypot(dx, dy) >= GESTURE.aimThreshold; // revenir sous 10 u = annulation
    return true;
  }
  // vecteur brut du trait (u) = (doigt − ancre) × G
  vector(out) { out[0] = (this.fx - this.ax) * this.gain; out[1] = (this.fy - this.ay) * this.gain; return out; }
  // lâcher : { kind: 'vec', n, vecs } | { kind: 'tap', x, y } | null
  up(id, x, y, t) {
    if (id !== this.id) { if (id === this.ignoreId) this.ignoreId = -1; return null; }
    this.move(id, x, y, t);
    this.id = -1;
    const dur = t - this.t0;
    if (this.aiming) { this.aiming = false; return { kind: 'vec', n: 1, vecs: this.vector(this.vecs) }; }
    if (this.path < GESTURE.tapMove && dur < GESTURE.tapMs) return { kind: 'tap', x: this.sx, y: this.sy };
    return null;
  }
  cancel(id) { if (id === this.id) { this.id = -1; this.aiming = false; } }
  // ignore un doigt déjà posé (ouverture des cartes) jusqu'à son lâcher
  ignoreCurrent() { if (this.id !== -1) { this.ignoreId = this.id; this.id = -1; this.aiming = false; } }

  // Coude : simplification Ramer-Douglas-Peucker du chemin du doigt (ε 14 u), au plus coudes+1 segments, angle ≥ 35°
  bent(coudes, out) {
    const n = this.pn; if (n < 3 || coudes <= 0) return 0;
    const xs = [], ys = [];
    for (let i = 0; i < n; i++) { const j = (this.pi - n + i + NP) % NP; xs.push(this.px[j]); ys.push(this.py[j]); }
    xs[0] = this.ax; ys[0] = this.ay; xs[n - 1] = this.fx; ys[n - 1] = this.fy;
    // RDP récursif qui mémorise la déviation de chaque sommet conservé
    const keep = new Map(); keep.set(0, Infinity); keep.set(n - 1, Infinity);
    const rdp = (a, b) => {
      let best = -1, bd = 0;
      const dx = xs[b] - xs[a], dy = ys[b] - ys[a], l = Math.hypot(dx, dy) || 1;
      for (let i = a + 1; i < b; i++) { const d = Math.abs((xs[i] - xs[a]) * dy - (ys[i] - ys[a]) * dx) / l; if (d > bd) { bd = d; best = i; } }
      if (best > 0 && bd > 14) { keep.set(best, bd); rdp(a, best); rdp(best, b); }
    };
    rdp(0, n - 1);
    let idx = [...keep.keys()].sort((a, b) => a - b);
    // au plus coudes+1 segments : on garde les sommets de plus grande déviation
    if (idx.length - 2 > coudes) {
      const inner = idx.slice(1, -1).sort((a, b) => keep.get(b) - keep.get(a)).slice(0, coudes);
      idx = [0, ...inner.sort((a, b) => a - b), n - 1];
    }
    // angle entre segments ≥ 35°
    let changed = true;
    while (changed && idx.length > 2) {
      changed = false;
      for (let k = 1; k < idx.length - 1; k++) {
        const a = idx[k - 1], b = idx[k], c = idx[k + 1];
        const a1 = Math.atan2(ys[b] - ys[a], xs[b] - xs[a]), a2 = Math.atan2(ys[c] - ys[b], xs[c] - xs[b]);
        let d = Math.abs(a2 - a1); if (d > Math.PI) d = 2 * Math.PI - d;
        if (d < 35 * Math.PI / 180) { idx.splice(k, 1); changed = true; break; }
      }
    }
    if (idx.length <= 2) return 0;
    for (let k = 0; k < idx.length - 1; k++) { out[k * 2] = (xs[idx[k + 1]] - xs[idx[k]]) * this.gain; out[k * 2 + 1] = (ys[idx[k + 1]] - ys[idx[k]]) * this.gain; }
    return idx.length - 1;
  }
}
