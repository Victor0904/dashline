// Arène 12 × 16 cases de 30 u : murs, vitres, fosses, tourelles. Requêtes de collision sans allocation.
import { AW, AH, CELL, GW, GH, RP } from '../core/data.js';

export const FLOOR = 0, WALL = 1, GLASS = 2, PIT = 3;

export class Arena {
  constructor() {
    this.cell = new Uint8Array(GW * GH);
    this.glassT = new Float32Array(GW * GH);   // > 0 : vitre brisée, secondes avant reformation
    this.glassHold = new Uint8Array(GW * GH);  // reformation retardée tant que le joueur est dessus
    this.wx = new Float32Array(GW * GH); this.wy = new Float32Array(GW * GH); this.wallN = 0; // murs (coins haut-gauche)
    this.turrets = []; this.px = 165; this.py = 465; this.key = ''; this.flip = false;
    this.hitNx = 0; this.hitNy = 0;
  }
  load(rows, flip, key) {
    this.key = key || ''; this.flip = !!flip; this.turrets.length = 0; this.wallN = 0;
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
      const ch = rows[y][flip ? GW - 1 - x : x];
      const i = y * GW + x;
      this.cell[i] = ch === '#' ? WALL : ch === 'o' ? GLASS : ch === '_' ? PIT : FLOOR;
      this.glassT[i] = 0; this.glassHold[i] = 0;
      if (ch === 'P') { this.px = x * CELL + 15; this.py = y * CELL + 15; }
      if (ch === 'T') this.turrets.push({ cx: x, cy: y });
      if (ch === '#') { this.wx[this.wallN] = x * CELL; this.wy[this.wallN] = y * CELL; this.wallN++; }
    }
  }
  at(cx, cy) { if (cx < 0 || cy < 0 || cx >= GW || cy >= GH) return WALL; return this.cell[cy * GW + cx]; }
  cellOf(x, y) { const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL); if (cx < 0 || cy < 0 || cx >= GW || cy >= GH) return -1; return cy * GW + cx; }
  glassIntact(i) { return this.cell[i] === GLASS && this.glassT[i] <= 0; }
  // bloquant pour les ennemis : murs, vitres intactes, fosses
  solidEnemy(cx, cy) { const c = this.at(cx, cy); return c === WALL || c === PIT || (c === GLASS && this.glassT[cy * GW + cx] <= 0); }
  // bloquant pour les balles : murs, vitres intactes
  solidBullet(cx, cy) { const c = this.at(cx, cy); return c === WALL || (c === GLASS && this.glassT[cy * GW + cx] <= 0); }
  isPit(x, y) { const i = this.cellOf(x, y); return i >= 0 && this.cell[i] === PIT; }
  // cercle contre cases bloquantes (mode 0 ennemi, 1 balle, 2 murs seuls)
  circleHits(x, y, r, mode) {
    if (x - r < 0 || y - r < 0 || x + r > AW || y + r > AH) return true;
    const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL), y0 = Math.floor((y - r) / CELL), y1 = Math.floor((y + r) / CELL);
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const solid = mode === 0 ? this.solidEnemy(cx, cy) : mode === 1 ? this.solidBullet(cx, cy) : this.at(cx, cy) === WALL;
      if (!solid) continue;
      const nx = Math.max(cx * CELL, Math.min(x, cx * CELL + CELL)), ny = Math.max(cy * CELL, Math.min(y, cy * CELL + CELL));
      const dx = x - nx, dy = y - ny;
      if (dx * dx + dy * dy < r * r) return true;
    }
    return false;
  }
  // ligne de vue (murs et vitres intactes bloquent)
  los(x0, y0, x1, y1) {
    const dx = x1 - x0, dy = y1 - y0, d = Math.sqrt(dx * dx + dy * dy), n = Math.ceil(d / 8);
    for (let i = 1; i < n; i++) { const t = i / n; if (this.solidBullet(Math.floor((x0 + dx * t) / CELL), Math.floor((y0 + dy * t) / CELL))) return false; }
    return true;
  }
  // Rayon d'un cercle de rayon RP (+0,5) contre murs et bords : distance du premier contact (≤ maxD), normale dans hitNx/hitNy.
  rayWall(x, y, dx, dy, maxD) {
    const e = RP + 0.5;
    let best = maxD, nx = 0, ny = 0;
    // bords d'arène
    if (dx > 1e-9) { const t = (AW - e - x) / dx; if (t < best) { best = Math.max(0, t); nx = -1; ny = 0; } }
    else if (dx < -1e-9) { const t = (e - x) / dx; if (t < best) { best = Math.max(0, t); nx = 1; ny = 0; } }
    if (dy > 1e-9) { const t = (AH - e - y) / dy; if (t < best) { best = Math.max(0, t); nx = 0; ny = -1; } }
    else if (dy < -1e-9) { const t = (e - y) / dy; if (t < best) { best = Math.max(0, t); nx = 0; ny = 1; } }
    // murs (AABB élargies de e)
    for (let i = 0; i < this.wallN; i++) {
      const bx0 = this.wx[i] - e, by0 = this.wy[i] - e, bx1 = this.wx[i] + CELL + e, by1 = this.wy[i] + CELL + e;
      let tmin = -1e9, tmax = 1e9, ax = 0;
      if (Math.abs(dx) < 1e-9) { if (x < bx0 || x > bx1) continue; }
      else { let t1 = (bx0 - x) / dx, t2 = (bx1 - x) / dx; if (t1 > t2) { const q = t1; t1 = t2; t2 = q; } if (t1 > tmin) { tmin = t1; ax = 0; } if (t2 < tmax) tmax = t2; }
      if (Math.abs(dy) < 1e-9) { if (y < by0 || y > by1) continue; }
      else { let t1 = (by0 - y) / dy, t2 = (by1 - y) / dy; if (t1 > t2) { const q = t1; t1 = t2; t2 = q; } if (t1 > tmin) { tmin = t1; ax = 1; } if (t2 < tmax) tmax = t2; }
      if (tmin > tmax || tmax <= 1e-4 || tmin < -1e-3 || tmin >= best) continue;
      best = Math.max(0, tmin);
      if (ax === 0) { nx = dx > 0 ? -1 : 1; ny = 0; } else { nx = 0; ny = dy > 0 ? -1 : 1; }
    }
    this.hitNx = nx; this.hitNy = ny;
    return best;
  }
  // le point (x, y) est-il dans une case où le joueur peut se tenir (hors mur, dans l'arène) ?
  standable(x, y) { return x >= RP && y >= RP && x <= AW - RP && y <= AH - RP && !this.circleHits(x, y, RP, 2); }
  update(dt, px, py) {
    const pc = this.cellOf(px, py);
    for (let i = 0; i < GW * GH; i++) {
      if (this.glassT[i] > 0) {
        if (this.glassT[i] - dt <= 0 && i === pc) { this.glassT[i] = 0.001; continue; } // joueur dessus : attend son départ
        this.glassT[i] -= dt; if (this.glassT[i] < 0) this.glassT[i] = 0;
      }
    }
  }
}
