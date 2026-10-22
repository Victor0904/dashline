// Planification d'un trait (GAME_DESIGN §2.3, §3.3) — « le trait est honnête ».
// La MÊME fonction calcule la ligne de visée affichée et le dash exécuté par la simulation : chemin (murs, rebonds,
// coudes, boucliers, fosses, assistance), contacts dans l'ordre du trait (kills, coups, bulles, entailles) et vitres.
// Aucune allocation : les résultats sont écrits dans un objet Plan pré-alloué.
import { RP, GESTURE, ASSIST, BOSS_TYPES } from '../core/data.js';
import { CAP } from '../core/cards.js';
import { PIT } from './arena.js';

export const K_KILL = 1, K_HIT = 2, K_POP = 3, K_BOSS = 4;
const MAXS = 24, MAXC = 64, MAXG = 48;
const D2R = Math.PI / 180;

export class Plan {
  constructor() {
    this.n = 0; this.sx = new Float32Array(MAXS); this.sy = new Float32Array(MAXS); this.ex_ = new Float32Array(MAXS); this.ey_ = new Float32Array(MAXS);
    this.sl = new Float32Array(MAXS); this.s0 = new Float32Array(MAXS); this.knee = new Uint8Array(MAXS); // knee[i] : le segment i commence par un coude (1) ou un rebond (2)
    this.L = 0; this.ox = 0; this.oy = 0; this.ex = 0; this.ey = 0; this.dirX = 1; this.dirY = 0; this.dir = 0;
    this.cN = 0; this.cE = new Array(MAXC).fill(null); this.cUid = new Int32Array(MAXC); this.cS = new Float32Array(MAXC); this.cK = new Uint8Array(MAXC);
    this.cX = new Float32Array(MAXC); this.cY = new Float32Array(MAXC);
    this.gN = 0; this.gCell = new Int16Array(MAXG); this.gS = new Float32Array(MAXG);
    this.block = false; this.blockE = null; this.blockUid = 0; this.blockX = 0; this.blockY = 0; this.tailX = 0; this.tailY = 0;
    this.pit = false; this.ok = false; this.short = false; this.superDash = false; this.rCut = 13; this.rawL = 0; this.tap = false;
    this.kills = 0;
  }
  copyFrom(o) {
    this.n = o.n; for (let i = 0; i < o.n; i++) { this.sx[i] = o.sx[i]; this.sy[i] = o.sy[i]; this.ex_[i] = o.ex_[i]; this.ey_[i] = o.ey_[i]; this.sl[i] = o.sl[i]; this.s0[i] = o.s0[i]; this.knee[i] = o.knee[i]; }
    this.L = o.L; this.ox = o.ox; this.oy = o.oy; this.ex = o.ex; this.ey = o.ey; this.dirX = o.dirX; this.dirY = o.dirY; this.dir = o.dir;
    this.cN = o.cN; for (let i = 0; i < o.cN; i++) { this.cE[i] = o.cE[i]; this.cUid[i] = o.cUid[i]; this.cS[i] = o.cS[i]; this.cK[i] = o.cK[i]; this.cX[i] = o.cX[i]; this.cY[i] = o.cY[i]; }
    this.gN = o.gN; for (let i = 0; i < o.gN; i++) { this.gCell[i] = o.gCell[i]; this.gS[i] = o.gS[i]; }
    this.block = o.block; this.blockE = o.blockE; this.blockUid = o.blockUid; this.blockX = o.blockX; this.blockY = o.blockY; this.tailX = o.tailX; this.tailY = o.tailY;
    this.pit = o.pit; this.ok = o.ok; this.short = o.short; this.superDash = o.superDash; this.rCut = o.rCut; this.rawL = o.rawL; this.tap = o.tap; this.kills = o.kills;
  }
  // position à l'abscisse curviligne s
  at(s, out) {
    if (this.n === 0) { out.x = this.ox; out.y = this.oy; out.seg = 0; return out; }
    let i = 0; while (i < this.n - 1 && s > this.s0[i] + this.sl[i]) i++;
    const l = this.sl[i], t = l > 0 ? Math.max(0, Math.min(1, (s - this.s0[i]) / l)) : 1;
    out.x = this.sx[i] + (this.ex_[i] - this.sx[i]) * t; out.y = this.sy[i] + (this.ey_[i] - this.sy[i]) * t; out.seg = i;
    return out;
  }
}

function angDiff(a, b) { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; }
// entrée d'un segment (p + d·t, t ∈ [0, len]) dans le disque (c, R) : t ou -1
export function circleEntry(px, py, dx, dy, len, cx, cy, R) {
  const fx = px - cx, fy = py - cy, b = fx * dx + fy * dy, c = fx * fx + fy * fy - R * R;
  if (c <= 0) return 0;
  const disc = b * b - c; if (disc < 0) return -1;
  const t = -b - Math.sqrt(disc);
  if (t < 0 || t > len) return -1;
  return t;
}

// L'ennemi est-il « vivant et présent » pour un trait ?
export function targetable(e) { return e.on && e.hp > 0 && !e.gone && !(e.type === 'noeud' && e.born > 0); }

// Type de blocage à l'entrée (x, y) dans l'ennemi e : 0 rien, 1 parade (bouclier/miroir), 2 mur (tourelle fermée)
function blockKind(e, x, y, superDash, ricochetShields) {
  switch (e.type) {
    case 'boucl': if (superDash) return 0; return Math.abs(angDiff(Math.atan2(y - e.y, x - e.x), e.face)) <= 75 * D2R ? 1 : 0;
    case 'maitre': if (!e.shieldOn) return 0; return Math.abs(angDiff(Math.atan2(y - e.y, x - e.x), e.face)) <= 60 * D2R ? 1 : 0;
    case 'miroir': return miroirFace(e, x, y) === e.crack ? 0 : 1;
    case 'tourelle': return e.open ? 0 : 2;
  }
  return 0;
}
// face du losange touchée (0..3) : faces centrées sur rot + 45° + k·90°
export function miroirFace(e, x, y) {
  let a = Math.atan2(y - e.y, x - e.x) - e.rot - Math.PI / 4;
  a = ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return Math.floor((a + Math.PI / 4) / (Math.PI / 2)) % 4;
}
function contactKind(e) {
  if (BOSS_TYPES.has(e.type)) {
    if (e.type === 'noeud') return K_KILL;
    if (e.type === 'piston' || e.type === 'noyau') return e.vuln ? K_BOSS : 0;
    return K_BOSS;
  }
  if (e.type === 'tourelle' && !e.open) return 0;
  if (e.bubble > 0) return K_POP;
  if (e.hp > 1) return K_HIT;
  return K_KILL;
}

const tmp = { x: 0, y: 0, seg: 0 };

// ---------------------------------------------------------------------------------------------------------------
// sim : { arena, enemies (pool), stats: {Lmax, rCut}, cardLv(id), hasEvo(id), assist } ; vecs : [vx0, vy0, vx1, vy1…]
// opts : { tap: bool, superDash: bool, assist: 'normal'|'strong'|'off' }
export function planDash(sim, out, ox, oy, vecs, nVec, opts) {
  const A = ASSIST[opts.assist || 'normal'] || ASSIST.normal;
  const st = sim.stats, arena = sim.arena, enemies = sim.enemies;
  const superDash = !!opts.superDash;
  const Lmax = st.Lmax * (superDash ? 1.5 : 1);
  const rCut = st.rCut * (superDash ? 2 : 1);
  out.ox = ox; out.oy = oy; out.n = 0; out.cN = 0; out.gN = 0; out.block = false; out.blockE = null; out.pit = false;
  out.superDash = superDash; out.rCut = rCut; out.tap = !!opts.tap; out.kills = 0;
  const ricLv = sim.cardLv('ricochet'), flipper = sim.hasEvo('flipper');
  let bounces = flipper ? 64 : CAP.ricochetBounces[ricLv];
  const keep = flipper ? 1 : CAP.ricochetKeep[ricLv];
  const ricShields = flipper || ricLv >= 4;

  // --- longueur brute
  let raw = 0;
  for (let i = 0; i < nVec; i++) raw += Math.hypot(vecs[i * 2], vecs[i * 2 + 1]);
  out.rawL = raw;
  out.short = raw < GESTURE.Lmin - 1e-6;
  let scale = 1;
  if (nVec > 1) {
    const lv = sim.cardLv('coude'), allowed = sim.hasEvo('origami') ? Lmax * nVec : Lmax * CAP.coudeLen[lv];
    if (raw > allowed) scale = allowed / raw;
  } else if (raw > Lmax) scale = Lmax / raw;

  // --- direction du 1er segment + aimantation (trait simple uniquement)
  let dx0 = vecs[0], dy0 = vecs[1], l0 = Math.hypot(dx0, dy0);
  if (l0 < 1e-6) { dx0 = 0; dy0 = -1; l0 = 0; } else { dx0 /= l0; dy0 /= l0; }
  if (nVec === 1 && A.magnet > 0 && l0 > 0) {
    const L = l0 * scale, thr = A.magnet * D2R, dir = Math.atan2(dy0, dx0);
    let best = thr + 1e-9, bx = 0, by = 0, found = false;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i]; if (!targetable(e) || !contactKind(e)) continue;
      const ddx = e.x - ox, ddy = e.y - oy, d = Math.sqrt(ddx * ddx + ddy * ddy);
      if (d > L + 20 || d < 1) continue;
      const a = Math.abs(angDiff(Math.atan2(ddy, ddx), dir));
      if (a <= best) { best = a; bx = ddx / d; by = ddy / d; found = true; }
    }
    if (found) { dx0 = bx; dy0 = by; }
  }
  out.dirX = dx0; out.dirY = dy0; out.dir = Math.atan2(dy0, dx0);

  // --- tracé des segments
  let x = ox, y = oy, sTot = 0, stopped = false;
  for (let v = 0; v < nVec && !stopped; v++) {
    let dx, dy, len;
    if (v === 0) { dx = dx0; dy = dy0; len = l0 * scale; }
    else { const vx = vecs[v * 2], vy = vecs[v * 2 + 1], l = Math.hypot(vx, vy); if (l < 1e-6) continue; dx = vx / l; dy = vy / l; len = l * scale; }
    let kneeFlag = v > 0 ? 1 : 0;
    while (len > 1e-3 && out.n < MAXS) {
      const r = traceOne(sim, out, x, y, dx, dy, len, rCut, superDash, ricShields, kneeFlag, sTot);
      sTot += r.d; x = r.x; y = r.y; kneeFlag = 0;
      if (r.kind === 0) { len = 0; break; }
      if (r.kind === 1 && bounces > 0 && (r.isWall || ricShields)) {
        bounces--; len = (len - r.d) * keep;
        const dot = dx * r.nx + dy * r.ny; dx -= 2 * dot * r.nx; dy -= 2 * dot * r.ny; kneeFlag = 2;
        if (len < 1) { stopped = true; break; }
        continue;
      }
      // arrêt (mur sans rebond, parade)
      if (r.block) { out.block = true; out.blockE = r.e; out.blockUid = r.e.uid; out.blockX = x; out.blockY = y; out.tailX = x + dx * (len - r.d); out.tailY = y + dy * (len - r.d); }
      stopped = true; break;
    }
  }
  finalize(out);

  // --- dépassement (on finit derrière l'ennemi traversé, pas dedans)
  if (A.overrun && !out.block && out.n > 0) {
    const Lcap = Lmax + 20;
    for (let iter = 0; iter < 3; iter++) {
      const i = out.n - 1, sx = out.sx[i], sy = out.sy[i], l = out.sl[i];
      const dx = (out.ex_[i] - sx) / (l || 1), dy = (out.ey_[i] - sy) / (l || 1);
      let ext = -1;
      for (let k = 0; k < enemies.length; k++) {
        const e = enemies[k]; if (!targetable(e) || !contactKind(e)) continue;
        const t = (e.x - sx) * dx + (e.y - sy) * dy; if (t < 0 || t > l + e.r + rCut) continue;
        const perp = Math.abs((e.x - sx) * dy - (e.y - sy) * dx); if (perp > e.r + rCut) continue;
        const de = Math.hypot(out.ex - e.x, out.ey - e.y); if (de >= e.r + 16) continue;
        const want = t + e.r + 14; if (want > ext) ext = want;
      }
      if (ext <= l + 0.01) break;
      const maxL = Lcap - out.s0[i]; ext = Math.min(ext, maxL);
      if (ext <= l + 0.01) break;
      // retrace le dernier segment avec la nouvelle longueur
      out.n = i; const kf = out.knee[i];
      const r = traceOne(sim, out, sx, sy, dx, dy, ext, rCut, superDash, ricShields, kf, out.s0[i]);
      if (r.block) { out.block = true; out.blockE = r.e; out.blockUid = r.e.uid; out.blockX = r.x; out.blockY = r.y; out.tailX = r.x + dx * (ext - r.d); out.tailY = r.y + dy * (ext - r.d); }
      finalize(out);
      if (r.kind !== 0) break;
    }
  }

  // --- fosses (assistance) : prolonger jusqu'au sol (+24 u max), sinon raccourcir au bord
  if (A.pits && out.n > 0 && arena.isPit(out.ex, out.ey)) {
    const i = out.n - 1, l = out.sl[i], dx = (out.ex_[i] - out.sx[i]) / (l || 1), dy = (out.ey_[i] - out.sy[i]) / (l || 1);
    const room = arena.rayWall(out.ex, out.ey, dx, dy, 24);
    let ok = -1;
    for (let d = 2; d <= room + 1e-6; d += 2) if (!arena.isPit(out.ex + dx * d, out.ey + dy * d)) { ok = d; break; }
    if (ok > 0 && !out.block) { setLast(out, l + ok); }
    else { let d = l; while (d > 0 && arena.isPit(out.sx[i] + dx * d, out.sy[i] + dy * d)) d -= 2; setLast(out, Math.max(0, d)); }
  }

  // --- contacts
  computeContacts(sim, out, rCut);
  // jamais dans un corps : recul le long du trait si l'arrivée chevauche un ennemi survivant
  if (out.n > 0) {
    const i = out.n - 1, l = out.sl[i], dx = (out.ex_[i] - out.sx[i]) / (l || 1), dy = (out.ey_[i] - out.sy[i]) / (l || 1);
    let newL = l;
    for (let k = 0; k < enemies.length; k++) {
      const e = enemies[k]; if (!targetable(e) || isKilled(out, e)) continue;
      const need = e.r + RP + 2;
      const fx = out.sx[i] + dx * newL - e.x, fy = out.sy[i] + dy * newL - e.y;
      if (fx * fx + fy * fy >= need * need) continue;
      // plus grand t ≤ newL tel que |p(t) − c| ≥ need
      const b = (out.sx[i] - e.x) * dx + (out.sy[i] - e.y) * dy, c = (out.sx[i] - e.x) ** 2 + (out.sy[i] - e.y) ** 2 - need * need;
      const disc = b * b - c;
      if (disc < 0) continue;
      const t = -b - Math.sqrt(disc);
      newL = Math.max(0, Math.min(newL, t));
    }
    if (newL < l - 1e-3) { setLast(out, newL); computeContacts(sim, out, rCut); }
  }

  // --- vitres traversées
  computeGlass(arena, out);
  out.pit = out.n > 0 && arena.isPit(out.ex, out.ey);
  out.ok = !out.short && (out.L >= 8 || out.block);
  let k = 0; for (let i = 0; i < out.cN; i++) if (out.cK[i] === K_KILL) k++;
  out.kills = k;
  return out;
}

function isKilled(out, e) { for (let i = 0; i < out.cN; i++) if (out.cE[i] === e && out.cK[i] === K_KILL) return true; return false; }

function finalize(out) {
  let s = 0;
  for (let i = 0; i < out.n; i++) { out.s0[i] = s; s += out.sl[i]; }
  out.L = s;
  if (out.n > 0) { out.ex = out.ex_[out.n - 1]; out.ey = out.ey_[out.n - 1]; } else { out.ex = out.ox; out.ey = out.oy; }
}
function setLast(out, l) {
  const i = out.n - 1, ol = out.sl[i] || 1, dx = (out.ex_[i] - out.sx[i]) / ol, dy = (out.ey_[i] - out.sy[i]) / ol;
  out.sl[i] = l; out.ex_[i] = out.sx[i] + dx * l; out.ey_[i] = out.sy[i] + dy * l;
  finalize(out);
}

const R1 = { kind: 0, d: 0, x: 0, y: 0, nx: 0, ny: 0, block: false, isWall: false, e: null };
// Trace un segment jusqu'au premier obstacle (mur, bord, tourelle fermée, bouclier de face, face de miroir).
// kind 0 = longueur entièrement parcourue, 1 = obstacle.
function traceOne(sim, out, x, y, dx, dy, len, rCut, superDash, ricShields, kneeFlag, s0) {
  const arena = sim.arena, enemies = sim.enemies;
  let best = arena.rayWall(x, y, dx, dy, len), nx = arena.hitNx, ny = arena.hitNy, isWall = best < len, blk = null, block = false;
  for (let k = 0; k < enemies.length; k++) {
    const e = enemies[k]; if (!targetable(e)) continue;
    const R = e.type === 'tourelle' && !e.open ? e.r + RP + 0.5 : e.r + rCut;
    const t = circleEntry(x, y, dx, dy, best, e.x, e.y, R);
    if (t < 0 || t >= best) continue;
    if (t === 0 && e.type !== 'tourelle') { // déjà au contact au départ : seul un bouclier dont on est devant bloque
      const fx = x - e.x, fy = y - e.y; if (fx * dx + fy * dy >= 0) continue;
    }
    const ix = x + dx * t, iy = y + dy * t, bk = blockKind(e, ix, iy, superDash, ricShields);
    if (!bk) continue;
    best = t; blk = e; block = bk === 1; isWall = bk === 2;
    const ln = Math.hypot(ix - e.x, iy - e.y) || 1; nx = (ix - e.x) / ln; ny = (iy - e.y) / ln;
  }
  const i = out.n++;
  out.sx[i] = x; out.sy[i] = y; out.ex_[i] = x + dx * best; out.ey_[i] = y + dy * best; out.sl[i] = best; out.s0[i] = s0; out.knee[i] = kneeFlag;
  R1.d = best; R1.x = x + dx * best; R1.y = y + dy * best; R1.nx = nx; R1.ny = ny; R1.e = blk; R1.block = block; R1.isWall = isWall;
  R1.kind = (best < len - 1e-6 || blk) ? 1 : 0;
  if (R1.kind === 1 && !blk && !isWall) R1.kind = 0;
  return R1;
}

function computeContacts(sim, out, rCut) {
  const enemies = sim.enemies;
  out.cN = 0;
  for (let k = 0; k < enemies.length; k++) {
    const e = enemies[k]; if (!targetable(e) || e === out.blockE) continue;
    const kind = contactKind(e); if (!kind) continue;
    const R = e.r + rCut;
    let s = -1, cx = 0, cy = 0;
    for (let i = 0; i < out.n; i++) {
      const l = out.sl[i]; if (l <= 0) continue;
      const dx = (out.ex_[i] - out.sx[i]) / l, dy = (out.ey_[i] - out.sy[i]) / l;
      const t = circleEntry(out.sx[i], out.sy[i], dx, dy, l, e.x, e.y, R);
      if (t >= 0) { s = out.s0[i] + t; cx = out.sx[i] + dx * t; cy = out.sy[i] + dy * t; break; }
    }
    if (s < 0 || out.cN >= MAXC) continue;
    // insertion triée par abscisse
    let j = out.cN++;
    while (j > 0 && out.cS[j - 1] > s) { out.cE[j] = out.cE[j - 1]; out.cUid[j] = out.cUid[j - 1]; out.cS[j] = out.cS[j - 1]; out.cK[j] = out.cK[j - 1]; out.cX[j] = out.cX[j - 1]; out.cY[j] = out.cY[j - 1]; j--; }
    out.cE[j] = e; out.cUid[j] = e.uid; out.cS[j] = s; out.cK[j] = kind; out.cX[j] = cx; out.cY[j] = cy;
  }
}

function computeGlass(arena, out) {
  out.gN = 0;
  for (let i = 0; i < out.n; i++) {
    const l = out.sl[i]; if (l <= 0) continue;
    const dx = (out.ex_[i] - out.sx[i]) / l, dy = (out.ey_[i] - out.sy[i]) / l;
    for (let t = 0; t <= l; t += 3) {
      const c = arena.cellOf(out.sx[i] + dx * t, out.sy[i] + dy * t);
      if (c < 0 || !arena.glassIntact(c)) continue;
      let seen = false; for (let g = 0; g < out.gN; g++) if (out.gCell[g] === c) { seen = true; break; }
      if (!seen && out.gN < MAXG) { out.gCell[out.gN] = c; out.gS[out.gN] = out.s0[i] + t; out.gN++; }
    }
  }
}

// Vecteur d'un tap (§2.2) : destination = point tapé ; ennemi à < 26 u → son centre (puis dépassement par planDash).
export function tapVector(sim, ox, oy, tx, ty, assist, outV) {
  const A = ASSIST[assist || 'normal'] || ASSIST.normal;
  if (A.tapEnemy > 0) {
    let best = A.tapEnemy, be = null;
    for (const e of sim.enemies) { if (!targetable(e) || !contactKind(e)) continue; const d = Math.hypot(e.x - tx, e.y - ty); if (d < best) { best = d; be = e; } }
    if (be) { tx = be.x; ty = be.y; }
  }
  let vx = tx - ox, vy = ty - oy; const d = Math.hypot(vx, vy);
  if (d < GESTURE.tapMin) return false;
  if (d < GESTURE.Lmin) { vx *= GESTURE.Lmin / d; vy *= GESTURE.Lmin / d; }
  outV[0] = vx; outV[1] = vy;
  return true;
}

export { PIT };
