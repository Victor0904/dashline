// DASHLINE — rendu Canvas 2D (DESIGN §3–§9). Couche d'arène pré-rendue (1 drawImage), glows pré-rendus,
// pools d'effets pré-alloués, HUD en px CSS dessiné par-dessus tout sur panneaux sombres.
import { AW, AH, CELL, GW, GH, HUD_U, PAD_MIN, C, TIER_COL, TIER_COL_CB, ZONES, RP, multOf, xpNeed, BOSSES } from '../core/data.js';
import { CARDS, EVOLUTIONS, EVO_OF, cardLabel, cardDesc, cardRarity, RARITY } from '../core/cards.js';
import { mulberry32 } from '../core/rng.js';
import { EV } from '../sim/events.js';
import { K_KILL, K_HIT, K_BOSS, K_POP } from '../sim/plan.js';
import { FLOOR, WALL, GLASS, PIT } from '../sim/arena.js';
import { hexA, glow, buildEnemySprites, playerPath, cardIcon, FONT_NUM, FONT_UI } from './sprites.js';

const TAU = Math.PI * 2;
const MAXP = 512, MAXR = 32, MAXD = 32, MAXT = 24, MAXL = 16, MAXM = 96;
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];
const FC = new Map();
function F(size, w, num) { const k = size * 10 + (w === 800 ? 1 : 0) + (num ? 2 : 0) * 100000; let f = FC.get(k); if (!f) { f = `${w} ${size}px ${num ? FONT_NUM : FONT_UI}`; FC.set(k, f); } return f; }
const NB = ' ';
function fmt(n) { n = Math.round(n); let out = ''; while (n >= 1000) { const g = n % 1000; out = NB + (g < 10 ? '00' : g < 100 ? '0' : '') + g + out; n = Math.floor(n / 1000); } return n + out; }
const MULTI_STR = n => n === 3 ? 'TRIPLÉ' : n === 4 ? 'QUADRUPLÉ' : 'CARNAGE ' + n;
const NUM_STR = []; for (let i = 0; i < 1000; i++) NUM_STR.push(String(i));
const easeOut = k => 1 - (1 - k) * (1 - k);

export class Renderer {
  constructor(cv) {
    this.cv = cv;
    this.ctx = cv.getContext('2d', { alpha: false }); // pas de desynchronized (leçon PULSAR v3)
    this.W = 360; this.H = 640; this.dpr = 1; this.s = 1; this.K = 1; this.AX = 0; this.AY = 52; this.PADY = 532; this.safe = { top: 0, bottom: 0, left: 0, right: 0 };
    this.reduced = false; this.cb = false; this.low = false; this.partK = 1; this.fibers = true;
    this.rng = mulberry32(0xF00D); // rngFx : rendu uniquement
    this.col = Object.assign({}, C); this.tierCol = TIER_COL;
    // particules (tableaux typés)
    this.pn = 0; this.px = new Float32Array(MAXP); this.py = new Float32Array(MAXP); this.pvx = new Float32Array(MAXP); this.pvy = new Float32Array(MAXP);
    this.pl = new Float32Array(MAXP); this.pm = new Float32Array(MAXP); this.ps = new Float32Array(MAXP); this.pc = new Uint8Array(MAXP);
    this.PAL = ['#FFFFFF', '#D7FF3A', 'INK', '#8FD8FF', '#C9D6E8', '#ECFF9E', '#8EA2FF', '#FF2D55', '#FF7A1A'];
    this.palA = []; this.buildPal();
    this.bucketN = new Int16Array(16); this.bucket = []; for (let i = 0; i < 16; i++) this.bucket.push(new Int16Array(MAXP));
    this.rings = []; for (let i = 0; i < MAXR; i++) this.rings.push({ on: false, x: 0, y: 0, r0: 0, r1: 0, t: 0, life: 0.2, col: '#fff', w: 2, fill: null });
    this.debris = []; for (let i = 0; i < MAXD; i++) this.debris.push({ on: false, type: 'pion', x: 0, y: 0, cut: 0, face: 0, side: 1, t: 0, boomAt: -1, boom: -1, vx: 0, vy: 0, rot: 0, va: 0, a: 1, uid: 0, s: 0, dashId: 0, elite: false });
    this.trails = []; for (let i = 0; i < 24; i++) this.trails.push({ on: false, live: false, n: 0, xs: new Float32Array(26), ys: new Float32Array(26), t: 0, life: 0.35, echo: false, superD: false, seed: 0, hx: 0, hy: 0 });
    this.labels = []; for (let i = 0; i < MAXL; i++) this.labels.push({ on: false, str: '', x: 0, y: 0, size: 12, col: '#fff', t: 0, life: 0.6, rise: 20, w: 0, stroke: null });
    this.motes = []; for (let i = 0; i < MAXM; i++) this.motes.push({ on: false, x: 0, y: 0, ox: 0, oy: 0, t: 0, life: 0.4 });
    this.links = []; for (let i = 0; i < 12; i++) this.links.push({ on: false, x0: 0, y0: 0, x1: 0, y1: 0, t: 0 });
    this.banners = []; this.banner = null; this.bannerT = 0;
    this.tier = { t: 0, str: '', col: '#fff' }; this.hint = { str: '', t: 0 };
    this.trauma = 0; this.zoomT = 0; this.aberT = 0; this.flashT = 0; this.vignT = 0; this.rmBorder = 0; this.deathT = -1;
    this.slideT = 0; this.layer = null; this.layerPrev = null; this.layerKey = ''; this.layerK = 0;
    this.curTrail = null; this.dashId = 0; this.cutList = []; this.time = 0; this.hurtLostT = 0;
    this.textRects = null; // test : rectangles des textes dessinés (px CSS)
    this.offerAnim = { pick: -1, t: 0, ids: null, n: 0 };
    this.debug = false; this.showGrid = false; this.builtK = 0; this.zk = 1; this.zox = 0; this.zoy = 0; this.kick = 0;
  }
  buildPal() {
    this.palA.length = 0;
    for (const c of this.PAL) { const row = []; for (let l = 1; l <= 4; l++) row.push(c === 'INK' ? hexA(C.lo, l / 4) : hexA(c, l / 4)); this.palA.push(row); }
  }
  setColorblind(cb) {
    this.cb = cb;
    const v = cb ? '#3DE0FF' : '#D7FF3A', vs = cb ? '#A8F0FF' : '#ECFF9E';
    this.col.volt = v; this.col.voltSoft = vs; this.tierCol = cb ? TIER_COL_CB : TIER_COL;
    this.PAL[1] = v; this.PAL[5] = vs; this.buildPal();
    this.builtK = 0; if (this.W) this.buildAssets();
  }
  setMotion(r) { this.reduced = r; }
  setLow(low) { this.low = low; this.partK = low ? 0.5 : 1; this.fibers = !low; }

  // ------------------------------------------------------------------ mise en page (GAME_DESIGN §1)
  resize(W, H, dpr, safe) {
    this.W = W; this.H = H; this.dpr = dpr; this.safe = safe;
    this.cv.width = Math.round(W * dpr); this.cv.height = Math.round(H * dpr);
    const s = Math.min(W / AW, (H - safe.top - safe.bottom) / (HUD_U + AH + PAD_MIN));
    this.s = s; this.K = s * dpr;
    this.AX = (W - AW * s) / 2; this.AY = safe.top + HUD_U * s; this.PADY = this.AY + AH * s;
    if (Math.abs(this.K - this.builtK) > 1e-3) this.buildAssets();
    this.layerKey = '';
  }
  buildAssets() {
    const K = this.K; this.builtK = K;
    this.S = buildEnemySprites(K);
    this.gVolt = glow(this.col.volt, 32, K, 0.55); this.gDanger = glow(C.danger, 10, K, 0.35); this.gWhite = glow('#FFFFFF', 16, K, 0.5);
    // vignette de coup reçu (pré-rendue, px CSS)
    const W = Math.max(1, Math.round(this.W * this.dpr)), H = Math.max(1, Math.round(this.H * this.dpr));
    const v = document.createElement('canvas'); v.width = W; v.height = H; const g = v.getContext('2d');
    const gr = g.createRadialGradient(W / 2, H / 2, W * 0.3, W / 2, H / 2, H * 0.7); gr.addColorStop(0, hexA(C.danger, 0)); gr.addColorStop(1, hexA(C.danger, 1));
    g.fillStyle = gr; g.fillRect(0, 0, W, H); this.vign = v;
    const cv2 = document.createElement('canvas'); cv2.width = W; cv2.height = H; const g2 = cv2.getContext('2d');
    const gr2 = g2.createRadialGradient(W / 2, H / 2, W * 0.35, W / 2, H / 2, H * 0.75); gr2.addColorStop(0, hexA(this.col.volt, 0)); gr2.addColorStop(1, hexA(this.col.volt, 1));
    g2.fillStyle = gr2; g2.fillRect(0, 0, W, H); this.vignVolt = cv2;
    this.chromaCv = null;
  }
  hudRects() {
    const m = 12, top = this.safe.top;
    return { pause: { x: this.W - this.AX - m - 48, y: top + 4, w: 48, h: 48, hit: 56 }, skip: { x: this.W - this.AX - m - 48 - 8 - 92, y: top + 6, w: 92, h: 44 } };
  }
  cardRects(n) {
    const gap = 8, cw = Math.min(n > 3 ? 96 : 128, (this.W - 32 - (n - 1) * gap) / n), ch = Math.min(cw * 1.8, 230);
    const y = this.H - this.safe.bottom - 16 - 52 - ch;
    const x0 = (this.W - (cw * n + gap * (n - 1))) / 2;
    const out = []; for (let i = 0; i < n; i++) out.push({ x: x0 + i * (cw + gap), y, w: cw, h: ch });
    return out;
  }
  rerollRect(n) { const r = this.cardRects(n)[0]; return { x: this.W / 2 - 90, y: r.y + r.h + 4, w: 180, h: 48 }; }
  toArena(cx, cy) { return { x: (cx - this.AX) / this.s, y: (cy - this.AY) / this.s }; }

  // ------------------------------------------------------------------ couche d'arène pré-rendue (DESIGN §3)
  buildLayer(arena, zone) {
    const K = this.K, z = ZONES[zone].col;
    const c = document.createElement('canvas'); c.width = Math.ceil(AW * K); c.height = Math.ceil(AH * K);
    const g = c.getContext('2d'); g.setTransform(K, 0, 0, K, 0, 0);
    g.fillStyle = z.floor; g.fillRect(0, 0, AW, AH);
    g.strokeStyle = z.grid; g.lineWidth = 1; g.beginPath();
    for (let x = CELL; x < AW; x += CELL) { g.moveTo(x, 0); g.lineTo(x, AH); }
    for (let y = CELL; y < AH; y += CELL) { g.moveTo(0, y); g.lineTo(AW, y); }
    g.stroke();
    // fosses
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) if (arena.cell[y * GW + x] === PIT) {
      g.fillStyle = C.pit; g.fillRect(x * CELL, y * CELL, CELL, CELL);
      g.strokeStyle = 'rgba(42,51,70,.2)'; g.lineWidth = 1; g.beginPath(); for (let i = 1; i <= 6; i++) { const xx = x * CELL + i * CELL / 7; g.moveTo(xx, y * CELL + 6); g.lineTo(xx, y * CELL + CELL - 4); } g.stroke();
    }
    g.setLineDash([4, 4]); g.strokeStyle = C.pitEdge; g.lineWidth = 1.5; g.beginPath();
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) if (arena.cell[y * GW + x] === PIT) {
      const X = x * CELL, Y = y * CELL;
      if (arena.at(x, y - 1) !== PIT) { g.moveTo(X, Y + 0.75); g.lineTo(X + CELL, Y + 0.75); }
      if (arena.at(x, y + 1) !== PIT) { g.moveTo(X, Y + CELL - 0.75); g.lineTo(X + CELL, Y + CELL - 0.75); }
      if (arena.at(x - 1, y) !== PIT) { g.moveTo(X + 0.75, Y); g.lineTo(X + 0.75, Y + CELL); }
      if (arena.at(x + 1, y) !== PIT) { g.moveTo(X + CELL - 0.75, Y); g.lineTo(X + CELL - 0.75, Y + CELL); }
    }
    g.stroke(); g.setLineDash([]);
    // ombres portées des murs puis murs (face + arête haute 3 u)
    g.fillStyle = 'rgba(0,0,0,.35)';
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) if (arena.cell[y * GW + x] === WALL) g.fillRect(x * CELL + 4, y * CELL + 6, CELL, CELL);
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) if (arena.cell[y * GW + x] === WALL) {
      g.fillStyle = z.wall; g.fillRect(x * CELL, y * CELL, CELL, CELL);
      if (arena.at(x, y - 1) !== WALL) { g.fillStyle = z.edge; g.fillRect(x * CELL, y * CELL, CELL, 3); }
      g.strokeStyle = hexA(z.edge, 0.55); g.lineWidth = 1; g.strokeRect(x * CELL + 0.5, y * CELL + 0.5, CELL - 1, CELL - 1);
    }
    // bord : liseré 2 u + coins en équerre 10 u
    g.strokeStyle = C.lineStrong; g.lineWidth = 2; g.strokeRect(1, 1, AW - 2, AH - 2);
    g.strokeStyle = z.edge; g.lineWidth = 2; g.beginPath();
    for (const [cx, cy, sx, sy] of [[0, 0, 1, 1], [AW, 0, -1, 1], [0, AH, 1, -1], [AW, AH, -1, -1]]) { g.moveTo(cx + sx * 12, cy + sy * 2); g.lineTo(cx + sx * 2, cy + sy * 2); g.lineTo(cx + sx * 2, cy + sy * 12); }
    g.stroke();
    return c;
  }
  ensureLayer(sim) {
    const key = sim.arena.key + '|' + sim.arena.flip + '|' + sim.zone + '|' + sim.arenaIdx;
    if (key === this.layerKey && this.layerK === this.K) return;
    const changedArena = this.layerKey && this.layerKey !== key && this.layerK === this.K;
    if (changedArena && this.layer) { this.layerPrev = this.layer; this.slideT = this.reduced ? 0.12 : 0.5; this.slideMax = this.slideT; }
    this.layer = this.buildLayer(sim.arena, sim.zone); this.layerKey = key; this.layerK = this.K;
  }

  // ------------------------------------------------------------------ pools d'effets
  reset() {
    this.pn = 0;
    for (const a of [this.rings, this.debris, this.trails, this.labels, this.motes, this.links]) for (const o of a) o.on = false;
    this.banners.length = 0; this.banner = null; this.bannerT = 0; this.tier.t = 0; this.hint.t = 0;
    this.trauma = this.zoomT = this.aberT = this.flashT = this.vignT = this.rmBorder = 0; this.deathT = -1; this.slideT = 0; this.layerPrev = null; this.layerKey = '';
    this.curTrail = null; this.cutList.length = 0;
  }
  take(pool) { for (const o of pool) if (!o.on) { o.on = true; return o; } let o = pool[0]; for (const q of pool) if ((q.t / (q.life || 1)) > (o.t / (o.life || 1))) o = q; o.on = true; return o; }
  part(x, y, vx, vy, life, col, size) {
    if (this.pn >= MAXP) return; const j = this.pn++;
    this.px[j] = x; this.py[j] = y; this.pvx[j] = vx; this.pvy[j] = vy; this.pl[j] = life; this.pm[j] = life; this.ps[j] = size; this.pc[j] = col;
  }
  burst(x, y, n, col, vmin, vmax, life, size, dir = 0, cone = TAU) {
    n = Math.max(1, Math.round(n * this.partK));
    for (let i = 0; i < n; i++) { const a = dir + (this.rng() - 0.5) * cone, v = vmin + this.rng() * (vmax - vmin); this.part(x, y, Math.cos(a) * v, Math.sin(a) * v, life * (0.6 + this.rng() * 0.4), col, size); }
  }
  ring(x, y, r0, r1, life, col, w, fill) { const o = this.take(this.rings); o.x = x; o.y = y; o.r0 = r0; o.r1 = r1; o.t = 0; o.life = life; o.col = col; o.w = w; o.fill = fill || null; return o; }
  // libellé du monde : jamais superposé (empile vers le haut), jamais en double
  label(str, x, y, size, col, life = 0.6, stroke = null) {
    for (const l of this.labels) if (l.on && l.str === str && l.t < 0.15 && Math.abs(l.x - x) < 40 && Math.abs(l.y - y) < 40) return null;
    const g = this.ctx; g.font = F(size, 800, false); const w = g.measureText(str).width / 1; // px à l'échelle 1 (u)
    let yy = y;
    for (let k = 0; k < 4; k++) {
      let hit = null;
      for (const l of this.labels) { if (!l.on) continue; const ly = l.y - l.rise * (l.t / l.life); if (Math.abs(ly - yy) < (l.size + size) * 0.55 + 2 && Math.abs(l.x - x) < (l.w + w) / 2 + 4) { hit = l; break; } }
      if (!hit) break;
      yy = hit.y - hit.rise * (hit.t / hit.life) - (hit.size + size) * 0.6 - 2;
    }
    const o = this.take(this.labels); o.str = str; o.x = Math.max(w / 2 + 4, Math.min(AW - w / 2 - 4, x)); o.y = Math.max(size + 52, yy); // jamais dans la zone de bannière / barre de boss o.size = size; o.col = col; o.t = 0; o.life = life; o.rise = 20; o.w = w; o.stroke = stroke;
    return o;
  }
  pushBanner(str, col) {
    if (this.banner && this.banner.str === str && this.bannerT > 0.2) return; // pas de doublon
    for (const b of this.banners) if (b.str === str) return;
    if (!this.banner || this.bannerT <= 0) { this.banner = { str, col }; this.bannerT = 0.8; return; }
    if (this.banners.length >= 3) this.banners.shift();
    this.banners.push({ str, col });
  }
  showHint(str, t = 3) { this.hint.str = str; this.hint.t = t; }
  shake(a) { if (!this.reduced) this.trauma = Math.min(1, this.trauma + a); }
  flash(a) { if (this.reduced) { this.rmBorder = 0.2; return; } if (this.flashT <= 0) this.flashT = Math.min(0.1, a); }
  aber(t) { if (!this.reduced && !this.low) this.aberT = Math.max(this.aberT, t); }
  zoom() { if (!this.reduced) this.zoomT = 0.25; }

  // ------------------------------------------------------------------ événements de la sim → effets
  onEvent(e, sim) {
    const col = this.col, P = sim.P;
    switch (e.type) {
      case EV.DASH: {
        const t = this.take(this.trails); t.live = true; t.n = 1; t.xs[0] = e.x; t.ys[0] = e.y; t.hx = e.x; t.hy = e.y; t.t = 0; t.life = 0.35; t.echo = false; t.superD = !!e.c; t.seed = this.rng() * 100;
        this.curTrail = t; this.dashId++; this.cutList.length = 0;
        break;
      }
      case EV.CUT: { // découpe : silhouette blanche figée + fente, 2 moitiés
        const en = sim.enemies.find(q => q.uid === e.b);
        for (const side of [1, -1]) {
          const d = this.take(this.debris);
          d.type = e.s; d.x = e.x; d.y = e.y; d.cut = e.a; d.face = en ? en.ang : e.a; d.side = side; d.t = 0; d.boomAt = -1; d.boom = -1; d.vx = d.vy = 0; d.rot = 0; d.va = 0; d.a = 1; d.uid = e.b; d.s = e.c; d.dashId = this.dashId; d.elite = !!(en && en.elite);
        }
        break;
      }
      case EV.KILL: {
        // XP : 1–3 étincelles aspirées vers le joueur (0,4 s)
        if (e.c !== 2) { const n = 1 + Math.min(2, Math.floor((e.s === 'colosse' ? 3 : e.s === 'pion' || e.s === 'mouch' ? 0 : 1) + this.rng() * 1.5)); for (let i = 0; i < n; i++) { const m = this.take(this.motes); m.x = e.x; m.y = e.y; m.ox = (this.rng() - 0.5) * 60; m.oy = (this.rng() - 0.5) * 60; m.t = 0; m.life = 0.4 + i * 0.05; } }
        if (e.c !== 0) { // tué hors du trait (cartes, Écho, Bavure) : découpe + explosion immédiates
          for (const side of [1, -1]) { const d = this.take(this.debris); d.type = e.s; d.x = e.x; d.y = e.y; d.cut = e.a; d.face = e.a; d.side = side; d.t = 0; d.boomAt = 0.02; d.boom = -1; d.vx = d.vy = 0; d.rot = 0; d.va = 0; d.a = 1; d.uid = -1; d.s = 0; d.dashId = -1; d.elite = false; }
        }
        break;
      }
      case EV.ARRIVE: {
        const t = this.curTrail; if (t && t.live) { t.live = false; t.t = 0; }
        // dominos : explosions dans l'ordre du trait, 25 ms d'écart (temps réel)
        const list = this.cutList; list.length = 0;
        for (const d of this.debris) if (d.on && d.dashId === this.dashId && d.side === 1 && d.boomAt < 0) list.push(d);
        list.sort((a, b) => a.s - b.s);
        for (let i = 0; i < list.length; i++) for (const d of this.debris) if (d.on && d.uid === list[i].uid && d.dashId === this.dashId) d.boomAt = i * 0.025;
        this.ring(e.x, e.y, 6, 22, 0.15, C.white, 2);
        this.burst(e.x, e.y, 6, 1, 80, 180, 0.25, 2, P.dir + Math.PI, 1.2);
        this.kick = 0.08;
        if (e.b > 0) this.label('+' + fmt(e.b), e.x, e.y - 16, 11, col.voltSoft, 0.6);
        break;
      }
      case EV.MULTI: {
        const n = e.a;
        if (n >= 5) this.label(MULTI_STR(n), e.x, e.y - 34, 24, C.white, 0.7, col.volt); else this.label(MULTI_STR(n), e.x, e.y - 34, 18, col.voltSoft, 0.6);
        this.shake(Math.min(0.4, 0.15 + 0.05 * (n - 3)));
        if (n >= 6) { this.flash(0.1); this.zoom(); }
        break;
      }
      case EV.HIT_E: this.ring(e.x, e.y, 4, 20, 0.15, C.white, 2); this.burst(e.x, e.y, 6, 0, 60, 160, 0.25, 2); break;
      case EV.POP: this.ring(e.x, e.y, 10, 22, 0.2, C.steel, 2); this.burst(e.x, e.y, 6, 4, 60, 140, 0.3, 2); break;
      case EV.PARRY: this.label('PARADE', e.x, e.y - 22, 12, C.steel, 0.6); this.burst(e.x, e.y, 8, 4, 100, 200, 0.3, 2); this.shake(0.2); break;
      case EV.BULLET_CUT: this.burst(e.x, e.y, 4, 0, 80, 140, 0.2, 1.5); break;
      case EV.GLASS: this.burst(e.x, e.y, 10, 3, 40, 160, 0.45, 2.5); break;
      case EV.TIER: {
        const m = e.a; this.tier.t = 0.62; this.tier.str = '×' + m; this.tier.col = this.tierCol[m - 1]; this.tier.m = m;
        this.ring(P.x, P.y, 10, 70, 0.35, this.tierCol[m - 1], 3);
        if (m >= 4) this.aber(0.2); if (m >= 5) this.zoom();
        break;
      }
      case EV.CHAIN_BREAK: this.pushBanner('CHAÎNE ROMPUE · ' + e.a, C.mid); this.chainBreakT = 0.6; break;
      case EV.HURT: this.vignT = 0.45; this.ring(e.x, e.y, 6, 40, 0.3, C.danger, 3); this.burst(e.x, e.y, 14, 0, 60, 200, 0.4, 2); this.shake(0.6); this.aber(0.35); this.hurtLostT = 0.3; break;
      case EV.FALL: this.vignT = 0.35; this.ring(e.x, e.y, 14, 2, 0.35, C.white, 2); this.label('CHUTE', e.x, e.y - 20, 12, C.mid); this.hurtLostT = 0.3; break;
      case EV.DEATH: this.deathT = 0; this.vignT = 0.45; this.shake(0.6); break;
      case EV.REVIVE: this.ring(e.x, e.y, 10, 120, 0.4, col.volt, 3); this.pushBanner('SECONDE CHANCE', col.volt); break;
      case EV.VOILE: this.ring(e.x, e.y, 8, 30, 0.3, C.white, 2); this.label('VOILE', e.x, e.y - 22, 12, C.white); break;
      case EV.LEVEL: this.ring(P.x, P.y, 10, 60, 0.4, C.xp, 2); this.label('NIV ' + e.a, P.x, P.y + 30, 16, C.xp, 0.8); break;
      case EV.BOOM: this.ring(e.x, e.y, e.a * 0.3, e.a, 0.18, col.volt, 2, hexA(col.volt, 0.25)); break;
      case EV.WAVE: this.ring(e.x, e.y, 6, e.a, 0.22, C.white, 3, hexA(col.volt, 0.18)); break;
      case EV.LIEN: { const l = this.take(this.links); l.x0 = e.x; l.y0 = e.y; l.x1 = e.a; l.y1 = e.b; l.t = 0; break; }
      case EV.ECHO: break;
      case EV.ECLAT: break;
      case EV.SPAWN: this.ring(e.x, e.y, 2, 18, 0.15, C.white, 2); break;
      case EV.BOSS_HIT: this.flash(0.1); this.shake(0.35); this.ring(e.x, e.y, 8, 40, 0.25, C.white, 3); this.burst(e.x, e.y, 10, 0, 80, 220, 0.35, 2); break;
      case EV.RUPTURE: this.flash(0.1); this.ring(e.x, e.y, 20, 200, 0.6, C.white, 3); this.shake(0.4); break;
      case EV.BOSS_DEAD: this.zoom(); this.shake(0.8); this.ring(e.x, e.y, 10, 220, 0.6, C.white, 4); this.burst(e.x, e.y, 40, 0, 80, 300, 0.7, 3); this.burst(e.x, e.y, 30, 1, 80, 260, 0.7, 2); break;
      case EV.SLAM: this.shake(e.a === 1 ? 0.25 : 0.12); this.ring(e.x, e.y, 6, e.a === 1 ? 64 : 30, 0.25, C.hot, 2); break;
      case EV.PISTON: this.shake(0.3); this.burst(e.x, e.y, 12, 4, 80, 220, 0.4, 2, -Math.PI / 2, 2); break;
      case EV.SHELL: this.ring(e.x, e.y, 6, e.a, 0.25, C.hot, 3); this.burst(e.x, e.y, 10, 8, 60, 160, 0.3, 2); break;
      case EV.BANNER: this.pushBanner(e.s, e.a === 1 || e.a === 3 ? col.volt : e.a === 4 ? C.white : C.hi); break;
      case EV.ARENA_CLEAR: if (e.a > 0 || e.b) this.label((e.b ? 'SANS FAUTE · ' : 'BONUS ') + '+' + fmt(e.a + (e.b ? 500 : 0)), AW / 2, AH * 0.42, 14, col.voltSoft, 1.0); break;
      case EV.BOSS_IN: break;
      case EV.DRY: this.label('À SEC', e.x, e.y - 22, 11, C.lo, 0.5); break;
      case EV.BAVURE: this.label('BAVURE', e.x, e.y - 14, 11, C.mid, 0.6); break;
      case EV.INSTINCT: this.ring(e.x, e.y, 30, 12, 0.3, C.white, 1.5); break;
      case EV.SUPER: this.ring(e.x, e.y, 8, 28, 0.2, col.volt, 3); break;
    }
  }

  // ------------------------------------------------------------------ mise à jour des effets (temps réel)
  update(rdt, sim) {
    this.time += rdt;
    const P = sim ? sim.P : null;
    // trait vivant : suit la tête
    const t = this.curTrail;
    if (t && t.live && P) {
      const pl = sim.plan; let n = 1;
      for (let i = 1; i < pl.n && n < 24; i++) { if (pl.s0[i] <= P.s) { t.xs[n] = pl.sx[i]; t.ys[n] = pl.sy[i]; n++; } }
      t.n = n; t.hx = P.x; t.hy = P.y;
    }
    for (const tr of this.trails) if (tr.on && !tr.live) { tr.t += rdt; if (tr.t >= tr.life) tr.on = false; }
    // débris : silence puis boom
    for (const d of this.debris) {
      if (!d.on) continue;
      d.t += rdt;
      if (d.boom < 0) {
        if (d.boomAt >= 0) { d.boomAt -= rdt; if (d.boomAt <= 0) this.explode(d); }
        else if (d.t > 1.5) this.explode(d);
        d.x += Math.cos(d.cut) * 8 * rdt * d.side * 0.5;
      } else {
        d.boom += rdt; d.x += d.vx * rdt; d.y += d.vy * rdt; d.rot += d.va * rdt; d.a = 1 - d.boom / 0.45;
        if (d.boom >= 0.45) d.on = false;
      }
    }
    for (let i = 0; i < this.pn; i++) {
      this.pl[i] -= rdt;
      if (this.pl[i] <= 0) { const j = --this.pn; this.px[i] = this.px[j]; this.py[i] = this.py[j]; this.pvx[i] = this.pvx[j]; this.pvy[i] = this.pvy[j]; this.pl[i] = this.pl[j]; this.pm[i] = this.pm[j]; this.ps[i] = this.ps[j]; this.pc[i] = this.pc[j]; i--; continue; }
      this.px[i] += this.pvx[i] * rdt; this.py[i] += this.pvy[i] * rdt; this.pvx[i] *= 0.92; this.pvy[i] *= 0.92;
    }
    for (const r of this.rings) if (r.on) { r.t += rdt; if (r.t >= r.life) r.on = false; }
    for (const l of this.labels) if (l.on) { l.t += rdt; if (l.t >= l.life) l.on = false; }
    for (const m of this.motes) if (m.on) { m.t += rdt; if (m.t >= m.life) m.on = false; }
    for (const l of this.links) if (l.on) { l.t += rdt; if (l.t >= 0.12) l.on = false; }
    if (this.bannerT > 0) { this.bannerT -= rdt; if (this.bannerT <= 0 && this.banners.length) { this.banner = this.banners.shift(); this.bannerT = 0.8; } }
    if (this.tier.t > 0) this.tier.t -= rdt;
    if (this.hint.t > 0) this.hint.t -= rdt;
    this.trauma = Math.max(0, this.trauma - 1.8 * rdt); this.zoomT = Math.max(0, this.zoomT - rdt); this.aberT = Math.max(0, this.aberT - rdt);
    this.flashT = Math.max(0, this.flashT - rdt); this.vignT = Math.max(0, this.vignT - rdt); this.rmBorder = Math.max(0, this.rmBorder - rdt);
    this.kick = Math.max(0, (this.kick || 0) - rdt); this.hurtLostT = Math.max(0, this.hurtLostT - rdt); this.chainBreakT = Math.max(0, (this.chainBreakT || 0) - rdt);
    if (this.slideT > 0) this.slideT -= rdt;
    if (this.deathT >= 0) this.deathT += rdt;
  }
  explode(d) {
    const nx = -Math.sin(d.cut) * d.side, ny = Math.cos(d.cut) * d.side;
    d.boom = 0;
    if (this.reduced) { d.vx = d.vy = 0; d.va = 0; }
    else { d.vx = nx * 140 + Math.cos(d.cut) * 20; d.vy = ny * 140 + Math.sin(d.cut) * 20; d.va = (this.rng() - 0.5) * 8; }
    if (d.side === 1) {
      this.ring(d.x, d.y, 4, 26, 0.18, C.white, 2);
      const k = this.partK;
      for (let i = 0; i < Math.round(10 * k); i++) { const a = this.rng() * TAU, v = 60 + this.rng() * 160; this.part(d.x, d.y, Math.cos(a) * v, Math.sin(a) * v, 0.25 + this.rng() * 0.25, i < 4 ? 0 : i < 8 ? 1 : 2, i < 8 ? 2 : 3); }
      if (this.onBoom) this.onBoom(d);
    }
  }

  // ------------------------------------------------------------------ dessin
  // transformation monde (u → pixels de l'écran) avec tremblement et zoom
  setWorld(g, ox, oy) { const K = this.K * this.zk; g.setTransform(K, 0, 0, K, this.dpr * (this.AX + (ox + this.zox) * this.s), this.dpr * (this.AY + (oy + this.zoy) * this.s)); }
  rec(str, x, y, size, align) { // enregistre le rectangle d'un texte (px CSS) — test « pas de textes superposés »
    if (!this.textRects) return;
    const g = this.ctx, w = g.measureText(str).width;
    const m = g.getTransform(), sc = m.a / this.dpr, X = (m.e / this.dpr) + x * sc, Y = (m.f / this.dpr) + y * sc;
    const W = w * sc, H = size * sc;
    const x0 = align === 'center' ? X - W / 2 : align === 'right' ? X - W : X;
    this.textRects.push({ str, x: x0, y: Y - H * 0.8, w: W, h: H });
  }
  text(g, str, x, y, size, align) { g.textAlign = align || 'left'; g.fillText(str, x, y); this.rec(str, x, y, size, align); }

  drawGame(sim, ui) {
    const g = this.ctx, P = sim.P, a = ui.alpha;
    this.ensureLayer(sim);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = C.ink0; g.fillRect(0, 0, this.cv.width, this.cv.height);
    // tremblement (u), zoom 3 % centré joueur
    let shx = 0, shy = 0;
    if (!this.reduced && this.trauma > 0) { const k = 6 * this.trauma * this.trauma; shx = (this.rng() * 2 - 1) * k; shy = (this.rng() * 2 - 1) * k; }
    const z = this.zoomT > 0 ? 1 + 0.03 * Math.sin(Math.PI * (1 - this.zoomT / 0.25)) : 1;
    this.zk = z; const pxi = P.px + (P.x - P.px) * a, pyi = P.py + (P.y - P.py) * a;
    this.zox = (pxi - pxi * z) / z; this.zoy = (pyi - pyi * z) / z;
    // clip arène
    g.save();
    g.beginPath(); g.rect(this.AX * this.dpr, this.AY * this.dpr, AW * this.s * this.dpr, AH * this.s * this.dpr); g.clip();
    this.setWorld(g, shx, shy);
    // 1. couche statique (glissement entre arènes)
    if (this.slideT > 0 && this.layerPrev) {
      const k = 1 - this.slideT / this.slideMax;
      if (this.reduced) { g.globalAlpha = 1 - k; g.drawImage(this.layerPrev, 0, 0, AW, AH); g.globalAlpha = k; g.drawImage(this.layer, 0, 0, AW, AH); g.globalAlpha = 1; }
      else { const e = k * k, e2 = 1 - (1 - k) * (1 - k); g.drawImage(this.layerPrev, 0, AH * e, AW, AH); g.drawImage(this.layer, 0, -AH * (1 - e2), AW, AH); g.fillStyle = this.col.volt; g.fillRect(0, -AH * (1 - e2) + AH - 1, AW, 2); }
    } else g.drawImage(this.layer, 0, 0, AW, AH);
    this.drawGlass(g, sim);
    // 2. poussières + liseré d'intensité
    this.drawDust(g);
    const m = P.mult; if (m > 1) { g.strokeStyle = hexA(this.tierCol[m - 1], Math.min(0.25, m * 0.03)); g.lineWidth = 3; g.strokeRect(1.5, 1.5, AW - 3, AH - 3); }
    // 3. télégraphes (danger-tele)
    this.drawTeles(g, sim, a);
    // 4. Sillage, failles
    this.drawFlames(g, sim);
    // 5. traits du joueur (lighter) ; 6. particules, anneaux
    g.globalCompositeOperation = 'lighter';
    this.drawTrails(g, sim);
    this.drawParticles(g);
    this.drawRings(g);
    this.drawLinks(g);
    g.globalCompositeOperation = 'source-over';
    this.drawDebris(g, shx, shy);
    // 7–8. ennemis, boucliers, bulles
    this.drawEnemies(g, sim, a, shx, shy);
    this.setWorld(g, shx, shy);
    this.drawBossOverlay(g, sim, a);
    // 9. perles et obus (au-dessus des effets)
    this.drawBullets(g, sim, a);
    // 10. joueur, anneau, tics
    this.drawPlayer(g, sim, a, pxi, pyi);
    // 11. ligne de visée
    if (ui.aimPlan && ui.aimOn) this.drawAim(g, sim, ui.aimPlan);
    // 12. mots d'XP
    this.drawMotes(g, pxi, pyi);
    // 13. textes flottants, gros chiffre de palier
    this.drawLabels(g);
    if (this.debug) this.drawDebug(g, sim);
    g.restore();
    // 14. post : aberration, vignettes, flash, désaturation de mort
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (this.aberT > 0 && !this.reduced && !this.low) this.applyChroma(this.aberT / 0.35);
    if (sim.aiming && sim.cardLv('concentration') && sim.concUsed > 0 && sim.k < 1) {
      g.globalAlpha = 0.10; g.drawImage(this.vignVolt, 0, 0); g.globalAlpha = 1;
      if (!this.reduced) { g.globalCompositeOperation = 'saturation'; g.fillStyle = 'rgba(128,128,128,.55)'; g.fillRect(this.AX * this.dpr, this.AY * this.dpr, AW * this.s * this.dpr, AH * this.s * this.dpr); g.globalCompositeOperation = 'source-over'; }
    }
    if (this.vignT > 0) { g.globalAlpha = this.vignT; g.drawImage(this.vign, 0, 0); g.globalAlpha = 1; }
    if (this.deathT >= 0) { const k = Math.min(1, this.deathT / 0.4); g.globalCompositeOperation = 'saturation'; g.fillStyle = `rgba(128,128,128,${k})`; g.fillRect(0, 0, this.cv.width, this.cv.height); g.globalCompositeOperation = 'source-over'; }
    if (this.flashT > 0) { g.fillStyle = `rgba(255,255,255,${this.flashT})`; g.fillRect(0, 0, this.cv.width, this.cv.height); }
    if (this.reduced && this.rmBorder > 0) { g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); g.strokeStyle = hexA(C.white, Math.min(1, this.rmBorder * 2)); g.lineWidth = 4; g.strokeRect(this.AX + 2, this.AY + 2, AW * this.s - 4, AH * this.s - 4); }
    // 15. HUD + pad ; 16. overlays
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawHUD(g, sim, ui);
    if (sim.offer.open || this.offerAnim.pick >= 0) this.drawCards(g, sim, ui);
    if (ui.countdown > 0) this.drawCountdown(g, ui.countdown);
  }

  drawGlass(g, sim) {
    const A = sim.arena;
    for (let i = 0; i < GW * GH; i++) {
      if (A.cell[i] !== GLASS) continue;
      const x = (i % GW) * CELL, y = Math.floor(i / GW) * CELL, t = A.glassT[i];
      if (t <= 0) {
        g.fillStyle = 'rgba(143,216,255,.22)'; g.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
        g.strokeStyle = 'rgba(143,216,255,.8)'; g.lineWidth = 1.5; g.strokeRect(x + 1.5, y + 1.5, CELL - 3, CELL - 3);
        g.beginPath(); g.moveTo(x + 6, y + 22); g.lineTo(x + 20, y + 8); g.stroke();
      } else {
        g.setLineDash([3, 4]); g.strokeStyle = 'rgba(143,216,255,.25)'; g.lineWidth = 1; g.strokeRect(x + 1.5, y + 1.5, CELL - 3, CELL - 3); g.setLineDash([]);
        if (t < 0.4) { g.fillStyle = `rgba(143,216,255,${0.22 * (1 - t / 0.4)})`; g.fillRect(x + 1, y + 1, CELL - 2, CELL - 2); }
      }
    }
  }
  drawDust(g) {
    g.fillStyle = 'rgba(238,242,248,.08)';
    for (let i = 0; i < 18; i++) {
      const sx = (i * 97.3) % AW, sy = (i * 151.7) % AH, x = (sx + this.time * 6 * (i % 2 ? 1 : -0.6)) % AW, y = (sy + this.time * 6 * 0.7) % AH;
      g.fillRect(x < 0 ? x + AW : x, y, 1.5, 1.5);
    }
  }
  drawTeles(g, sim, a) {
    const dt = C.dtele, dg = C.danger;
    // apparitions : cercle r 14 + 4 chevrons qui convergent
    for (const grp of sim.teles) {
      if (!grp.on) continue;
      const k = 1 - Math.max(0, grp.t) / 0.7;
      for (let i = 0; i < grp.n; i++) {
        const x = grp.x[i], y = grp.y[i];
        g.fillStyle = dt; g.beginPath(); g.arc(x, y, 14, 0, TAU); g.fill();
        g.strokeStyle = dg; g.lineWidth = 1.5; g.setLineDash([3, 3]); g.stroke(); g.setLineDash([]);
        g.beginPath();
        for (let q = 0; q < 4; q++) { const an = q * Math.PI / 2 + 0.785, d = 30 - 16 * k, cx = x + Math.cos(an) * d, cy = y + Math.sin(an) * d; g.moveTo(cx + Math.cos(an + 2.5) * 5, cy + Math.sin(an + 2.5) * 5); g.lineTo(cx, cy); g.lineTo(cx + Math.cos(an - 2.5) * 5, cy + Math.sin(an - 2.5) * 5); }
        g.stroke();
        if (grp.t < 0.1) { g.fillStyle = 'rgba(255,255,255,.6)'; g.beginPath(); g.arc(x, y, 8, 0, TAU); g.fill(); }
      }
    }
    for (const e of sim.enemies) {
      if (!e.on) continue;
      switch (e.type) {
        case 'tireur': if (e.st === 1) {
          const late = e.t <= 0.15, L = 520, dx = Math.cos(e.lockA), dy = Math.sin(e.lockA);
          let s = 0; for (; s < L; s += 6) { const x = e.x + dx * s, y = e.y + dy * s; if (x < 0 || y < 0 || x > AW || y > AH || sim.arena.solidBullet(Math.floor(x / CELL), Math.floor(y / CELL))) break; }
          g.strokeStyle = late ? dg : hexA(dg, 0.5 + 0.5 * (1 - e.t / 0.55)); g.lineWidth = late ? 2 : 1; g.setLineDash(late ? [] : [6, 4]);
          g.beginPath(); g.moveTo(e.x, e.y); g.lineTo(e.x + dx * s, e.y + dy * s); g.stroke(); g.setLineDash([]);
        } break;
        case 'charg': if (e.st === 1) {
          g.save(); g.translate(e.lx, e.ly); g.rotate(e.lockA);
          const len = e.lane; g.fillStyle = dt; g.fillRect(0, -14, len, 28); g.strokeStyle = dg; g.lineWidth = 1.5; g.setLineDash([5, 4]); g.strokeRect(0, -14, len, 28); g.setLineDash([]);
          g.beginPath(); const off = (this.time * 120) % 24; for (let x = 10 + off; x < len - 6; x += 24) { g.moveTo(x, -7); g.lineTo(x + 7, 0); g.lineTo(x, 7); } g.stroke(); g.restore();
        } break;
        case 'boucl': if (e.st === 1) { g.fillStyle = dt; g.beginPath(); g.moveTo(e.x, e.y); g.arc(e.x, e.y, 34, e.lockA - Math.PI / 2, e.lockA + Math.PI / 2); g.closePath(); g.fill(); g.strokeStyle = dg; g.setLineDash([4, 3]); g.lineWidth = 1.2; g.stroke(); g.setLineDash([]); } break;
        case 'colosse': if (e.st === 1) { const k = 1 - e.t / 0.8; g.strokeStyle = C.hot; g.lineWidth = 2.5; g.beginPath(); g.arc(e.x, e.y, 80 - 16 * k, 0, TAU); g.stroke(); g.fillStyle = 'rgba(255,122,26,.10)'; g.beginPath(); g.arc(e.x, e.y, 64, 0, TAU); g.fill(); } break;
        case 'lancier': if (e.st === 1) {
          const k = 1 - e.t / 1.1, ex = e.x + Math.cos(e.lockA) * e.lane, ey = e.y + Math.sin(e.lockA) * e.lane;
          g.strokeStyle = e.t <= 0.25 ? C.hot : hexA(C.hot, 0.35 + 0.5 * k); g.lineWidth = 1 + 3 * k; g.setLineDash(e.t <= 0.25 ? [] : [8, 5]);
          g.beginPath(); g.moveTo(e.x, e.y); g.lineTo(ex, ey); g.stroke(); g.setLineDash([]);
        } else if (e.st === 2) {
          const ex = e.x + Math.cos(e.lockA) * e.lane, ey = e.y + Math.sin(e.lockA) * e.lane;
          g.strokeStyle = C.hot; g.lineWidth = 8; g.beginPath(); g.moveTo(e.x, e.y); g.lineTo(ex, ey); g.stroke();
          g.strokeStyle = C.white; g.lineWidth = 2; g.stroke();
        } break;
        case 'fileur':
          if (e.st === 1) { g.strokeStyle = hexA(dg, 0.5); g.setLineDash([3, 3]); g.lineWidth = 1.5; g.beginPath(); for (let q = 0; q < 4; q++) { const an = q * Math.PI / 2 + this.time * 6; g.lineTo(e.tx + Math.cos(an) * 9, e.ty + Math.sin(an) * 9); g.lineTo(e.tx + Math.cos(an + 0.5) * 3, e.ty + Math.sin(an + 0.5) * 3); } g.closePath(); g.stroke(); g.setLineDash([]); }
          if (e.st === 2) { g.fillStyle = dt; g.beginPath(); g.moveTo(e.x, e.y); g.arc(e.x, e.y, 40, e.lockA - 0.698, e.lockA + 0.698); g.closePath(); g.fill(); g.strokeStyle = dg; g.lineWidth = 1.2; g.setLineDash([4, 3]); g.stroke(); g.setLineDash([]); }
          break;
        case 'egide': g.strokeStyle = 'rgba(201,214,232,.25)'; g.setLineDash([4, 5]); g.lineWidth = 1; g.beginPath(); g.arc(e.x, e.y, 80, 0, TAU); g.stroke(); g.setLineDash([]); break;
      }
    }
    // obus : cercle cible qui se remplit en 1,0 s ; ombre au sol
    for (const s of sim.shells) {
      if (!s.on) continue; const k = Math.min(1, s.t / s.dur);
      g.fillStyle = 'rgba(255,122,26,.14)'; g.beginPath(); g.arc(s.tx, s.ty, s.r * k, 0, TAU); g.fill();
      g.strokeStyle = C.hot; g.lineWidth = 1.5; g.setLineDash([4, 4]); g.beginPath(); g.arc(s.tx, s.ty, s.r, 0, TAU); g.stroke(); g.setLineDash([]);
    }
    // lignes de boss
    for (const l of sim.lines) {
      if (!l.on || l.t < 0) continue;
      if (l.t < l.tele) {
        const k = l.t / Math.max(0.01, l.tele);
        g.strokeStyle = hexA(dg, 0.35 + 0.55 * k); g.lineWidth = l.kind === 1 ? l.w : Math.max(1.5, l.w * 0.4); g.setLineDash(l.kind === 1 ? [] : [7, 5]);
        if (l.kind === 1) { g.strokeStyle = dt; }
        g.beginPath(); g.moveTo(l.x0, l.y0); g.lineTo(l.x1, l.y1); g.stroke(); g.setLineDash([]);
        if (l.kind === 1) { g.strokeStyle = dg; g.lineWidth = 1.2; g.setLineDash([5, 4]); g.stroke(); g.setLineDash([]); }
      } else {
        g.strokeStyle = l.kind === 3 ? dg : hexA(dg, 0.85); g.lineWidth = l.w; g.beginPath(); g.moveTo(l.x0, l.y0); g.lineTo(l.x1, l.y1); g.stroke();
        g.strokeStyle = C.white; g.lineWidth = 1.5; g.stroke();
      }
    }
  }
  drawFlames(g, sim) {
    for (const f of sim.flames) {
      if (!f.on) continue;
      const k = f.t / f.life, al = 0.42 * (1 - k);
      if (f.ring) { g.fillStyle = hexA(this.col.voltSoft, 0.3 * (1 - k)); g.beginPath(); g.arc(f.x0, f.y0, f.r, 0, TAU); g.fill(); continue; }
      if (f.r === -1) { g.strokeStyle = '#000'; g.lineWidth = f.w; g.beginPath(); g.moveTo(f.x0, f.y0); g.lineTo(f.x1, f.y1); g.stroke(); g.strokeStyle = hexA(this.col.volt, 0.5 + 0.4 * Math.sin(this.time * 20)); g.lineWidth = 1.5; g.stroke(); continue; }
      g.strokeStyle = hexA(this.col.volt, al); g.lineWidth = f.w * (1 + 0.15 * Math.sin(this.time * 18 + f.x0 * 0.1)); g.lineCap = 'round';
      g.beginPath(); g.moveTo(f.x0, f.y0); g.lineTo(f.x1, f.y1); g.stroke(); g.lineCap = 'butt';
    }
  }
  drawTrails(g, sim) {
    const v = this.col.volt;
    for (const t of this.trails) {
      if (!t.on) continue;
      const k = t.live ? 0 : t.t / t.life, ke = easeOut(k), a = 1 - k * k;
      // polyligne : sommets + tête
      const n = t.n; let L = 0;
      const xs = t.xs, ys = t.ys; xs[n] = t.hx; ys[n] = t.hy;
      for (let i = 0; i < n; i++) L += Math.hypot(xs[i + 1] - xs[i], ys[i + 1] - ys[i]);
      if (L < 1) continue;
      const sTail = L * ke; let s = 0;
      const wHead = (t.superD ? 1.6 : 1) * 6 * (1 - k * 0.6);
      for (let i = 0; i < n; i++) {
        const x0 = xs[i], y0 = ys[i], x1 = xs[i + 1], y1 = ys[i + 1], l = Math.hypot(x1 - x0, y1 - y0);
        if (l < 0.01 || s + l <= sTail) { s += l; continue; }
        const u0 = Math.max(0, (sTail - s) / l), ax = x0 + (x1 - x0) * u0, ay = y0 + (y1 - y0) * u0;
        const w0 = 1 + (wHead - 1) * ((s + u0 * l) / L), w1 = 1 + (wHead - 1) * ((s + l) / L);
        const nx = -(y1 - y0) / l, ny = (x1 - x0) / l;
        const quad = (k0, k1) => { g.beginPath(); g.moveTo(ax + nx * w0 * k0, ay + ny * w0 * k0); g.lineTo(x1 + nx * w1 * k1, y1 + ny * w1 * k1); g.lineTo(x1 - nx * w1 * k1, y1 - ny * w1 * k1); g.lineTo(ax - nx * w0 * k0, ay - ny * w0 * k0); g.closePath(); g.fill(); };
        if (!t.echo) { g.fillStyle = hexA(v, 0.18 * a); quad(2.2, 2.2); g.fillStyle = hexA(v, 0.85 * a); quad(1, 1); }
        g.fillStyle = `rgba(255,255,255,${(t.echo ? 0.45 : 1) * a})`; quad(0.25, 0.27);
        if (this.fibers && !this.reduced && !t.echo) {
          g.strokeStyle = hexA(this.col.voltSoft, 0.35 * a); g.lineWidth = t.superD ? 1.5 : 1; g.beginPath();
          for (const o of [-4, 4]) { const j = Math.sin(t.seed + o + i) * 1.5; g.moveTo(ax + nx * o * 0.3, ay + ny * o * 0.3); g.lineTo(x1 + nx * (o + j), y1 + ny * (o + j)); }
          g.stroke();
        }
        s += l;
      }
      if (!t.echo) g.drawImage(this.gVolt.c, t.hx - 20, t.hy - 20, 40, 40);
    }
    // Écho : fantôme du trait (cœur seul, sans halo)
    for (const E of sim.echoes) {
      if (!E.on || E.t > 0) continue;
      g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineWidth = 2; g.beginPath(); g.moveTo(E.plan.ox, E.plan.oy);
      for (let i = 0; i < E.plan.n; i++) { if (E.plan.s0[i] > E.s) break; g.lineTo(E.plan.ex_[i], E.plan.ey_[i]); }
      g.lineTo(E.x, E.y); g.stroke();
    }
  }
  drawParticles(g) {
    const bn = this.bucketN; bn.fill(0);
    for (let i = 0; i < this.pn; i++) { const c = this.pc[i]; if (c > 1) continue; const lvl = Math.min(3, Math.floor(this.pl[i] / this.pm[i] * 4)); const b = c * 4 + lvl; if (b < 16) this.bucket[b][bn[b]++] = i; }
    for (let b = 0; b < 16; b++) {
      const cnt = bn[b]; if (!cnt) continue;
      g.fillStyle = this.palA[b >> 2][b & 3];
      const list = this.bucket[b];
      for (let k = 0; k < cnt; k++) { const i = list[k], s = this.ps[i]; g.fillRect(this.px[i] - s / 2, this.py[i] - s / 2, s, s); }
    }
    // couleurs ≥ 4 (acier, verre, xp…) et encre
    g.globalCompositeOperation = 'source-over';
    for (let i = 0; i < this.pn; i++) {
      const c = this.pc[i]; if (c <= 1) continue;
      const lvl = Math.min(3, Math.floor(this.pl[i] / this.pm[i] * 4)), s = this.ps[i];
      if (c === 2) { g.fillStyle = C.ink0; g.fillRect(this.px[i] - 2, this.py[i] - 2, 4, 4); g.strokeStyle = this.palA[2][lvl]; g.lineWidth = 1; g.strokeRect(this.px[i] - 2, this.py[i] - 2, 4, 4); }
      else { g.fillStyle = this.palA[c][lvl]; g.fillRect(this.px[i] - s / 2, this.py[i] - s / 2, s, s); }
    }
    g.globalCompositeOperation = 'lighter';
  }
  drawRings(g) {
    for (const r of this.rings) {
      if (!r.on) continue;
      const k = r.t / r.life, rad = r.r0 + (r.r1 - r.r0) * easeOut(k), al = (1 - k) * (this.reduced ? 0.5 : 1);
      if (r.fill) { g.globalAlpha = 1 - k; g.fillStyle = r.fill; g.beginPath(); g.arc(r.x, r.y, rad, 0, TAU); g.fill(); g.globalAlpha = 1; }
      g.strokeStyle = r.col.length === 7 ? hexA(r.col, al) : r.col; g.lineWidth = r.w; g.beginPath(); g.arc(r.x, r.y, Math.max(0.1, rad), 0, TAU); g.stroke();
    }
  }
  drawLinks(g) {
    g.strokeStyle = hexA(this.col.voltSoft, 0.9); g.lineWidth = 1.5;
    for (const l of this.links) {
      if (!l.on) continue;
      g.beginPath(); g.moveTo(l.x0, l.y0);
      for (let i = 1; i < 6; i++) { const t = i / 6, j = (this.rng() - 0.5) * 10; g.lineTo(l.x0 + (l.x1 - l.x0) * t - (l.y1 - l.y0) / 60 * j, l.y0 + (l.y1 - l.y0) * t + (l.x1 - l.x0) / 60 * j); }
      g.lineTo(l.x1, l.y1); g.stroke();
    }
  }
  drawDebris(g, shx, shy) {
    const K = this.K * this.zk;
    for (const d of this.debris) {
      if (!d.on) continue;
      const spr = this.S[d.type + '_w'] || this.S.pion_w;
      const c = Math.cos(d.cut + d.rot), s = Math.sin(d.cut + d.rot);
      const tx = this.dpr * (this.AX + (d.x + shx + this.zox) * this.s * this.zk), ty = this.dpr * (this.AY + (d.y + shy + this.zoy) * this.s * this.zk);
      g.setTransform(K * c, K * s, -K * s, K * c, tx, ty);
      g.globalAlpha = Math.max(0, d.a);
      g.save(); g.beginPath(); if (d.side > 0) g.rect(-30, 0, 60, 30); else g.rect(-30, -30, 60, 30); g.clip();
      g.rotate(d.face - d.cut); g.drawImage(spr.c, -spr.w / 2, -spr.h / 2, spr.w, spr.h);
      g.restore();
      if (d.boom < 0 && d.side > 0) { g.globalAlpha = 1; g.strokeStyle = C.white; g.lineWidth = 2; g.beginPath(); g.moveTo(-14, 0); g.lineTo(14, 0); g.stroke(); }
    }
    g.globalAlpha = 1;
    this.setWorld(g, shx, shy);
  }
  drawEnemies(g, sim, a, shx, shy) {
    const K = this.K * this.zk;
    // Moucherons : un seul tracé pour tout l'essaim
    this.setWorld(g, shx, shy);
    let any = false;
    g.beginPath();
    for (const e of sim.enemies) {
      if (!e.on || e.type !== 'mouch') continue; any = true;
      const x = e.px + (e.x - e.px) * a, y = e.py + (e.y - e.py) * a, c = Math.cos(e.ang), s = Math.sin(e.ang);
      g.moveTo(x + c * 6, y + s * 6); g.lineTo(x - c * 4 - s * 3.5, y - s * 4 + c * 3.5); g.lineTo(x - c * 4 + s * 3.5, y - s * 4 - c * 3.5); g.closePath();
    }
    if (any) { g.fillStyle = hexA(C.dfill, 0.9); g.fill(); g.strokeStyle = C.danger; g.lineWidth = 1.6; g.stroke(); }
    for (const e of sim.enemies) {
      if (!e.on || e.type === 'mouch' || e.boss) continue;
      const x = e.px + (e.x - e.px) * a, y = e.py + (e.y - e.py) * a;
      const sc = e.born > 0 ? 1 - e.born / 0.12 * 0.4 : 1;
      const spr = this.S[e.type + (e.elite ? '_e' : '')];
      const ang = e.type === 'boucl' ? e.face : e.type === 'fileur' ? e.spin : e.ang;
      const c = Math.cos(ang) * sc, s = Math.sin(ang) * sc;
      const tx = this.dpr * (this.AX + (x + shx + this.zox) * this.s * this.zk), ty = this.dpr * (this.AY + (y + shy + this.zoy) * this.s * this.zk);
      g.setTransform(K * c, K * s, -K * s, K * c, tx, ty);
      if (e.type === 'fileur' && e.st === 1) g.globalAlpha = 0.6;
      g.drawImage(spr.c, -spr.w / 2, -spr.h / 2, spr.w, spr.h);
      g.globalAlpha = 1;
      if (e.type === 'boucl') { // arc 150° acier épais à r 17, hachuré
        g.strokeStyle = C.steel; g.lineWidth = 5; g.beginPath(); g.arc(0, 0, 17, -1.309, 1.309); g.stroke();
        g.strokeStyle = C.steelDim; g.lineWidth = 1; g.beginPath(); for (let q = -65; q <= 65; q += 16) { const r = q * Math.PI / 180; g.moveTo(Math.cos(r) * 15, Math.sin(r) * 15); g.lineTo(Math.cos(r + 0.12) * 19, Math.sin(r + 0.12) * 19); } g.stroke();
      }
      if (e.type === 'colosse') { // encoches de PV
        g.setTransform(K, 0, 0, K, tx, ty);
        for (let q = 0; q < e.hpMax; q++) { g.fillStyle = q < e.hp ? C.danger : C.ink3; g.fillRect(-e.hpMax * 3 + q * 6, -2, 4, 4); }
      }
      if (e.type === 'tourelle') {
        g.setTransform(K, 0, 0, K, tx, ty);
        if (!e.open) { const k = e.st === 1 ? 0.5 : 1; g.fillStyle = C.steel; g.fillRect(-11, -11 * k, 22, 3); g.fillRect(-11, 8 * k, 22, 3); g.strokeStyle = C.steelDim; g.lineWidth = 1; g.strokeRect(-10, -10, 20, 20); }
        else { g.strokeStyle = C.danger; g.lineWidth = 2.5; g.beginPath(); for (let q = 0; q < 4; q++) { const an = e.rotA + q * Math.PI / 2; g.moveTo(Math.cos(an) * 6, Math.sin(an) * 6); g.lineTo(Math.cos(an) * 15, Math.sin(an) * 15); } g.stroke(); }
      }
      if (e.bubble > 0) { g.setTransform(K, 0, 0, K, tx, ty); g.strokeStyle = 'rgba(201,214,232,.5)'; g.lineWidth = 1.5; g.beginPath(); g.arc(0, 0, e.r + 5, 0, TAU); g.stroke(); }
      if (e.stun > 0 && e.type === 'charg') { g.setTransform(K, 0, 0, K, tx, ty); g.fillStyle = C.mid; for (let q = 0; q < 3; q++) { const an = this.time * 8 + q * 2.1; g.fillRect(Math.cos(an) * 12 - 1, -16 + Math.sin(an) * 3, 2, 2); } }
    }
  }
  drawBossOverlay(g, sim, a) {
    const B = sim.boss; if (!B) return;
    const dg = C.danger;
    if (B.id === 'maitre') {
      const e = B.e; if (!e.on) return;
      const x = e.px + (e.x - e.px) * a, y = e.py + (e.y - e.py) * a;
      g.save(); g.translate(x, y); g.rotate(e.face);
      g.fillStyle = hexA(C.dfill, 0.9); g.strokeStyle = dg; g.lineWidth = 2.5;
      g.beginPath(); for (let i = 0; i < 8; i++) { const an = i * Math.PI / 4, r = i % 2 ? 11 : 16; g.lineTo(Math.cos(an) * r, Math.sin(an) * r); } g.closePath(); g.fill(); g.stroke();
      g.fillStyle = C.white; g.beginPath(); g.arc(7, 0, 2.5, 0, TAU); g.fill();
      if (e.shieldOn) { g.strokeStyle = C.steel; g.lineWidth = 5; g.beginPath(); g.arc(0, 0, 22, -Math.PI / 3, Math.PI / 3); g.stroke(); }
      g.restore();
      if (e.vuln) this.diamond(g, x, y - 28);
    } else if (B.id === 'presse') {
      // bloc de la Presse (bande haute) + pistons
      g.fillStyle = '#1A1E38'; g.fillRect(0, 0, AW, 90); g.strokeStyle = hexA(C.dfill, 1); g.lineWidth = 2;
      for (const p of B.pist) {
        const x = p.e.x;
        if (!p.alive) { g.strokeStyle = 'rgba(88,98,115,.5)'; g.setLineDash([4, 4]); g.strokeRect(x - 40, 60, 80, 28); g.setLineDash([]); continue; }
        if (p.st === 'tele') { const k = 1 - p.t / 0.9; g.fillStyle = `rgba(255,45,85,${0.08 + 0.14 * k})`; g.fillRect(x - 45, 90, 90, AH - 90); g.strokeStyle = dg; g.setLineDash([6, 5]); g.lineWidth = 1.5; g.strokeRect(x - 44, 91, 88, AH - 92); g.setLineDash([]); }
        const hy = p.y;
        g.fillStyle = '#2A1218'; g.fillRect(x - 10, 60, 20, hy - 60);
        g.fillStyle = hexA(C.dfill, 0.95); g.strokeStyle = p.st === 'down' ? C.hot : dg; g.lineWidth = 2.5; g.fillRect(x - 40, hy - 20, 80, 30); g.strokeRect(x - 40, hy - 20, 80, 30);
        for (let q = 0; q < p.e.hpMax; q++) { g.fillStyle = q < p.e.hp ? C.white : C.ink3; g.fillRect(x - 13 + q * 10, hy - 6, 6, 6); }
        if (p.e.vuln) this.diamond(g, x, hy - 32);
      }
      for (const gh of B.ghosts) {
        if (gh.st === 'tele') { const k = 1 - gh.t / 0.9; g.fillStyle = `rgba(255,45,85,${0.08 + 0.14 * k})`; g.fillRect(gh.x - 45, 90, 90, AH - 90); g.strokeStyle = dg; g.setLineDash([6, 5]); g.strokeRect(gh.x - 44, 91, 88, AH - 92); g.setLineDash([]); }
        if (gh.st === 'down') { g.fillStyle = hexA(C.hot, 0.5); g.fillRect(gh.x - 40, gh.y - 20, 80, 30); }
      }
      if (B.roll) { const r = B.roll; if (r.t < 1) { g.fillStyle = `rgba(255,45,85,${0.08 + 0.12 * r.t})`; g.fillRect(0, r.y - 20, AW, 40); g.strokeStyle = dg; g.setLineDash([6, 5]); g.strokeRect(1, r.y - 20, AW - 2, 40); g.setLineDash([]); } else { g.fillStyle = hexA(C.hot, 0.75); g.fillRect(0, r.y - 20, AW, 40); g.strokeStyle = C.white; g.lineWidth = 1.5; g.strokeRect(1, r.y - 20, AW - 2, 40); } }
      if (B.core && B.core.on) { const e = B.core; g.fillStyle = hexA(C.dfill, 0.95); g.strokeStyle = dg; g.lineWidth = 3; g.beginPath(); g.arc(e.x, e.y, 24, 0, TAU); g.fill(); g.stroke(); g.fillStyle = C.white; g.beginPath(); g.arc(e.x, e.y, 5, 0, TAU); g.fill(); if (e.vuln) this.diamond(g, e.x, e.y - 36); }
    } else if (B.id === 'miroir') {
      const e = B.e; if (!e.on) return;
      g.save(); g.translate(e.x, e.y); g.rotate(e.rot);
      g.fillStyle = hexA(C.dfill, 0.9); g.beginPath(); g.moveTo(22, 0); g.lineTo(0, 22); g.lineTo(-22, 0); g.lineTo(0, -22); g.closePath(); g.fill();
      for (let f = 0; f < 4; f++) {
        const a0 = f * Math.PI / 2, a1 = a0 + Math.PI / 2;
        g.strokeStyle = f === e.crack ? C.white : C.steel; g.lineWidth = f === e.crack ? 2 : 4;
        g.beginPath(); g.moveTo(Math.cos(a0) * 22, Math.sin(a0) * 22); g.lineTo(Math.cos(a1) * 22, Math.sin(a1) * 22); g.stroke();
        if (f === e.crack) { const mx = Math.cos(a0 + Math.PI / 4) * 15.5, my = Math.sin(a0 + Math.PI / 4) * 15.5; g.beginPath(); g.moveTo(mx - 4, my - 3); g.lineTo(mx, my + 1); g.lineTo(mx + 3, my - 4); g.stroke(); }
      }
      g.strokeStyle = C.danger; g.lineWidth = 1.5; g.beginPath(); g.arc(0, 0, 6, 0, TAU); g.stroke();
      g.restore();
      if (e.crack >= 0) { const fa = e.rot + Math.PI / 4 + e.crack * Math.PI / 2; this.diamond(g, e.x + Math.cos(fa) * 32, e.y + Math.sin(fa) * 32); }
    } else if (B.id === 'trait') {
      const n = B.nodes.length;
      g.strokeStyle = C.danger; g.lineWidth = 8; g.lineCap = 'round';
      for (let i = 0; i < n; i++) { const p = B.nodes[i], q = B.nodes[(i + 1) % n]; if (p.gone || q.gone) continue; g.globalAlpha = p.born > 0 || q.born > 0 ? 0.35 : 0.9; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y); g.stroke(); }
      g.globalAlpha = 1; g.lineCap = 'butt';
      g.strokeStyle = C.white; g.lineWidth = 1.5;
      for (let i = 0; i < n; i++) { const p = B.nodes[i], q = B.nodes[(i + 1) % n]; if (p.gone || q.gone) continue; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y); g.stroke(); }
      for (const p of B.nodes) {
        if (p.gone) { g.strokeStyle = 'rgba(238,242,248,.25)'; g.setLineDash([3, 3]); g.lineWidth = 1; g.beginPath(); g.arc(p.x, p.y, 12 * (1 - p.deadT / 5), 0, TAU); g.stroke(); g.setLineDash([]); continue; }
        if (p.born > 0) { g.strokeStyle = hexA(C.danger, 0.5); g.setLineDash([3, 3]); g.lineWidth = 1.5; g.beginPath(); g.arc(p.x, p.y, 12 + p.born * 6, 0, TAU); g.stroke(); g.setLineDash([]); continue; }
        g.fillStyle = hexA(C.dfill, 0.95); g.strokeStyle = C.danger; g.lineWidth = 2.5; g.beginPath(); g.arc(p.x, p.y, 12, 0, TAU); g.fill(); g.stroke();
        g.fillStyle = C.white; g.beginPath(); g.arc(p.x, p.y, 3, 0, TAU); g.fill();
      }
    }
  }
  diamond(g, x, y) { g.fillStyle = C.white; g.beginPath(); g.moveTo(x, y - 5); g.lineTo(x + 4, y); g.lineTo(x, y + 5); g.lineTo(x - 4, y); g.closePath(); g.fill(); }
  drawBullets(g, sim, a) {
    const gd = this.gDanger.c;
    for (const b of sim.bullets) { if (!b.on) continue; const x = b.px + (b.x - b.px) * a, y = b.py + (b.y - b.py) * a; g.drawImage(gd, x - 10, y - 10, 20, 20); }
    g.fillStyle = C.danger; g.beginPath();
    for (const b of sim.bullets) { if (!b.on) continue; const x = b.px + (b.x - b.px) * a, y = b.py + (b.y - b.py) * a; g.moveTo(x + 5, y); g.arc(x, y, 5, 0, TAU); }
    g.fill();
    g.fillStyle = C.white; g.beginPath();
    for (const b of sim.bullets) { if (!b.on) continue; const x = b.px + (b.x - b.px) * a, y = b.py + (b.y - b.py) * a; g.moveTo(x + 2.5, y); g.arc(x, y, 2.5, 0, TAU); }
    g.fill();
    // obus en vol (ombre au sol qui grossit)
    for (const s of sim.shells) {
      if (!s.on) continue; const k = Math.min(1, s.t / s.dur);
      const x = s.x0 + (s.tx - s.x0) * k, y = s.y0 + (s.ty - s.y0) * k - Math.sin(k * Math.PI) * 60;
      g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.arc(s.x0 + (s.tx - s.x0) * k, s.y0 + (s.ty - s.y0) * k, 3 + 4 * k, 0, TAU); g.fill();
      g.fillStyle = C.hot; g.beginPath(); g.arc(x, y, 6, 0, TAU); g.fill();
    }
    // éclats renvoyés (Parade) : losanges Volt
    g.fillStyle = this.col.volt;
    for (const c of sim.eclats) { if (!c.on) continue; const an = Math.atan2(c.vy, c.vx), co = Math.cos(an), si = Math.sin(an); g.beginPath(); g.moveTo(c.x + co * 6, c.y + si * 6); g.lineTo(c.x - si * 1.5, c.y + co * 1.5); g.lineTo(c.x - co * 6, c.y - si * 6); g.lineTo(c.x + si * 1.5, c.y - co * 1.5); g.closePath(); g.fill(); }
  }
  drawPlayer(g, sim, a, x, y) {
    const P = sim.P, sil = sim.sil.id;
    if (P.state === 2) { const k = Math.max(0, P.fallT / 0.4); g.globalAlpha = k; this.chevron(g, sil, x, y, P.dir, k, 1, P); g.globalAlpha = 1; return; }
    if (P.state === 3 || this.deathT >= 0) { // le chevron se fend en deux, en rouge
      const k = Math.min(1, Math.max(0, this.deathT) / 0.6);
      for (const side of [1, -1]) { g.save(); g.translate(x - Math.sin(P.dir) * side * 8 * k, y + Math.cos(P.dir) * side * 8 * k); g.rotate(P.dir); g.beginPath(); g.rect(-20, side > 0 ? 0 : -20, 40, 20); g.clip(); playerPath(g, sil); g.fillStyle = C.dfill; g.fill(); g.strokeStyle = C.danger; g.lineWidth = 2; g.stroke(); g.restore(); }
      return;
    }
    const dashing = P.state === 1;
    if (dashing) { const pl = sim.plan; const pt = this._pt || (this._pt = { x: 0, y: 0 }); for (let i = 1; i <= 5; i++) { const s = P.s - i * 14; if (s < 0) break; pl.at(s, pt); g.globalAlpha = 0.5 - i * 0.08; this.chevron(g, sil, pt.x, pt.y, P.dir, 1, 1.6, P); } g.globalAlpha = 1; }
    const blink = P.inv > 0 && Math.floor(this.time * 24) % 2 === 0;
    if (!blink) {
      const br = P.state === 0 && !this.reduced ? 1 + 0.03 * (1 + Math.sin(this.time * 12.57)) : 1;
      const kick = this.kick > 0 ? 1 + 0.25 * (this.kick / 0.08) : 1;
      this.chevron(g, sil, x, y, P.dir, br * kick, dashing ? 1.6 : 1, P);
    }
    g.fillStyle = C.white; g.beginPath(); g.arc(x, y, 2.5, 0, TAU); g.fill();
    // anneau de fenêtre (r 16)
    if (P.chain > 0 && !dashing && P.win > 0) {
      const k = Math.min(1, P.win / Math.max(0.01, P.winMax || sim.stats.window)), warn = P.win < 0.15;
      g.strokeStyle = warn ? (Math.floor(this.time * 40) % 2 ? C.white : 'rgba(255,255,255,.2)') : this.col.volt; g.lineWidth = 2;
      g.beginPath(); g.arc(x, y, 16, -Math.PI / 2, -Math.PI / 2 + TAU * k); g.stroke();
    }
    // tics d'Élan (210°–330° en bas du joueur)
    const n = sim.stats.elanMax; g.lineWidth = 2;
    for (let i = 0; i < n; i++) {
      const an = (30 + 120 * (n === 1 ? 0.5 : i / (n - 1))) * Math.PI / 180, on = i < P.elan;
      g.strokeStyle = on ? this.col.volt : (P.elan === 0 && Math.floor(this.time * 8) % 2 ? C.lo : C.ink3);
      g.beginPath(); g.moveTo(x + Math.cos(an) * 21, y + Math.sin(an) * 21); g.lineTo(x + Math.cos(an) * 25, y + Math.sin(an) * 25); g.stroke();
    }
    if (P.stun > 0) { g.fillStyle = C.steel; for (let i = 0; i < 3; i++) { const an = this.time * 10 + i * 2.1; g.fillRect(x + Math.cos(an) * 12 - 1, y + Math.sin(an) * 12 - 1, 2.5, 2.5); } }
  }
  chevron(g, sil, x, y, dir, sc, stretch, P) {
    g.save(); g.translate(x, y); g.rotate(dir); g.scale(sc * stretch, sc);
    playerPath(g, sil);
    g.fillStyle = sil === 'ombre' ? C.ink0 : C.white; g.fill();
    g.strokeStyle = P.stun > 0 ? C.steel : this.col.volt; g.lineWidth = sil === 'masse' ? 3 : 2; g.lineJoin = 'miter'; g.stroke();
    if (sil === 'masse') { g.beginPath(); g.moveTo(0, -5); g.lineTo(0, 5); g.stroke(); }
    if (sil === 'ombre') { g.fillStyle = C.white; g.beginPath(); g.moveTo(5, 0); g.lineTo(-2, 1.5); g.lineTo(-2, -1.5); g.fill(); }
    g.restore();
  }
  drawAim(g, sim, pl) {
    const dry = sim.P.elan <= 0, short = pl.short || !pl.ok;
    const col = dry || short ? C.lo : 'rgba(255,255,255,.85)';
    g.strokeStyle = col; g.lineWidth = 2; g.setLineDash(dry ? [3, 6] : [8, 6]); g.lineDashOffset = this.reduced ? 0 : -this.time * 90;
    g.beginPath(); g.moveTo(pl.ox, pl.oy);
    for (let i = 0; i < pl.n; i++) g.lineTo(pl.ex_[i], pl.ey_[i]);
    g.stroke();
    if (pl.block) { g.strokeStyle = 'rgba(88,98,115,.4)'; g.beginPath(); g.moveTo(pl.blockX, pl.blockY); g.lineTo(pl.tailX, pl.tailY); g.stroke(); }
    g.setLineDash([]); g.lineDashOffset = 0;
    // rebonds (losange Volt) et coudes (cercle blanc)
    for (let i = 1; i < pl.n; i++) {
      const x = pl.sx[i], y = pl.sy[i];
      if (pl.knee[i] === 2) { g.fillStyle = this.col.volt; g.beginPath(); g.moveTo(x, y - 4); g.lineTo(x + 3, y); g.lineTo(x, y + 4); g.lineTo(x - 3, y); g.closePath(); g.fill(); }
      else if (pl.knee[i] === 1) { g.strokeStyle = C.white; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, 3, 0, TAU); g.stroke(); }
    }
    const ex = pl.ex, ey = pl.ey;
    g.strokeStyle = dry || short ? C.lo : this.col.volt; g.lineWidth = 2; g.beginPath(); g.arc(ex, ey, short ? 3 : 8, 0, TAU); g.stroke();
    if (!short) { g.beginPath(); g.moveTo(ex - 4, ey); g.lineTo(ex + 4, ey); g.moveTo(ex, ey - 4); g.lineTo(ex, ey + 4); g.stroke(); }
    if (!dry && !short) {
      g.strokeStyle = C.white; g.lineWidth = 1.5;
      for (let i = 0; i < pl.cN; i++) {
        const e = pl.cE[i], k = pl.cK[i]; if (!e.on || (k !== K_KILL && k !== K_HIT && k !== K_BOSS)) continue;
        const r = e.r + 5; g.beginPath();
        for (const sx of [-1, 1]) for (const sy of [-1, 1]) { g.moveTo(e.x + sx * r, e.y + sy * (r - 4)); g.lineTo(e.x + sx * r, e.y + sy * r); g.lineTo(e.x + sx * (r - 4), e.y + sy * r); }
        g.stroke();
        if (k === K_HIT && e.type === 'colosse' && Math.floor(this.time * 8) % 2) { g.fillStyle = C.white; g.fillRect(-e.hpMax * 3 + (e.hp - 1) * 6 + e.x, e.y - 2, 4, 4); }
      }
    }
    if (pl.block) { g.strokeStyle = C.danger; g.lineWidth = 2.5; const b = pl; g.beginPath(); g.moveTo(b.blockX - 5, b.blockY - 5); g.lineTo(b.blockX + 5, b.blockY + 5); g.moveTo(b.blockX + 5, b.blockY - 5); g.lineTo(b.blockX - 5, b.blockY + 5); g.stroke(); }
  }
  drawMotes(g, px, py) {
    g.fillStyle = C.xp; g.beginPath(); let any = false;
    for (const m of this.motes) {
      if (!m.on) continue; any = true;
      const k = m.t / m.life, e = k * k * (3 - 2 * k), x = m.x + m.ox * Math.sin(k * Math.PI) + (px - m.x) * e, y = m.y + m.oy * Math.sin(k * Math.PI) + (py - m.y) * e;
      g.moveTo(x, y - 3); g.lineTo(x + 3, y); g.lineTo(x, y + 3); g.lineTo(x - 3, y);
    }
    if (any) g.fill();
  }
  drawLabels(g) {
    for (const l of this.labels) {
      if (!l.on || !l.str) continue;
      const k = l.t / l.life; g.globalAlpha = 1 - k * k;
      g.font = F(l.size, 800, false); g.lineWidth = 3; g.strokeStyle = l.stroke || C.ink0; g.textAlign = 'center';
      const y = l.y - l.rise * k;
      g.strokeText(l.str, l.x, y); g.fillStyle = l.col; this.text(g, l.str, l.x, y, l.size, 'center');
    }
    g.globalAlpha = 1;
    if (this.tier.t > 0) {
      const k = 1 - this.tier.t / 0.62, sc = k < 0.2 ? 1.6 - 3 * k : 1;
      g.save(); g.translate(AW / 2, 110); g.scale(sc, sc); g.globalAlpha = Math.min(1, this.tier.t * 2);
      g.font = F(48, 800, true); g.lineWidth = 4; g.strokeStyle = C.ink0; g.textAlign = 'center';
      g.strokeText(this.tier.str, 0, 0); g.fillStyle = this.tier.col; this.text(g, this.tier.str, 0, 0, 48, 'center');
      g.restore(); g.globalAlpha = 1;
    }
  }
  drawDebug(g, sim) {
    g.strokeStyle = 'rgba(0,255,255,.6)'; g.lineWidth = 1;
    for (const e of sim.enemies) if (e.on) { g.beginPath(); g.arc(e.x, e.y, e.r, 0, TAU); g.stroke(); }
    g.beginPath(); g.arc(sim.P.x, sim.P.y, RP, 0, TAU); g.stroke();
    const pl = sim.plan; if (pl.n) { g.strokeStyle = 'rgba(255,255,0,.4)'; g.lineWidth = pl.rCut * 2; g.lineCap = 'round'; g.beginPath(); g.moveTo(pl.ox, pl.oy); for (let i = 0; i < pl.n; i++) g.lineTo(pl.ex_[i], pl.ey_[i]); g.stroke(); g.lineCap = 'butt'; }
    if (this.showGrid) { g.strokeStyle = 'rgba(255,255,255,.15)'; for (let x = 0; x <= AW; x += CELL) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, AH); g.stroke(); } for (let y = 0; y <= AH; y += CELL) { g.beginPath(); g.moveTo(0, y); g.lineTo(AW, y); g.stroke(); } }
  }
  applyChroma(k) {
    const cv = this.cv, ctx = this.ctx;
    if (!this.chromaCv || this.chromaCv.width !== cv.width || this.chromaCv.height !== cv.height) { this.chromaCv = document.createElement('canvas'); this.chromaCv.width = cv.width; this.chromaCv.height = cv.height; this.chromaCtx = this.chromaCv.getContext('2d'); }
    const o = this.chromaCtx, d = Math.max(1, Math.round(2 * this.dpr * Math.min(1, k)));
    o.globalCompositeOperation = 'copy'; o.drawImage(cv, 0, 0);
    o.globalCompositeOperation = 'multiply'; o.fillStyle = '#FF0000'; o.fillRect(0, 0, cv.width, cv.height);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = '#00FFFF'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(this.chromaCv, d, 0);
    ctx.globalCompositeOperation = 'source-over';
  }

  // ------------------------------------------------------------------ HUD (px CSS), panneaux sombres, toujours au-dessus
  drawHUD(g, sim, ui) {
    const P = sim.P, m = 12, top = this.safe.top, W = this.W, AX = this.AX, col = this.col, hs = (this.AY - top) / 52;
    // bande HUD
    g.fillStyle = 'rgba(13,17,24,.92)'; g.fillRect(0, 0, W, this.AY);
    // barre d'XP 3 px + NIV
    const need = xpNeed(P.level);
    g.fillStyle = C.ink3; g.fillRect(0, top, W, 3); g.fillStyle = C.xp; g.fillRect(0, top, W * Math.min(1, P.xp / need), 3);
    g.font = F(10, 800, false); g.fillStyle = C.mid; this.text(g, 'NIV ' + P.level, AX + m, top + 15, 10);
    const y1 = top + 31 * hs;
    // PV (losanges 12 px)
    for (let i = 0; i < P.hpMax; i++) {
      const x = AX + m + 6 + i * 16;
      g.beginPath(); g.moveTo(x, y1 - 6); g.lineTo(x + 6, y1); g.lineTo(x, y1 + 6); g.lineTo(x - 6, y1); g.closePath();
      if (i < P.hp) { g.fillStyle = C.white; g.fill(); g.strokeStyle = col.volt; } else g.strokeStyle = i === P.hp && this.hurtLostT > 0 ? C.danger : C.lo;
      g.lineWidth = 1.5; g.stroke();
    }
    // score
    const sx = AX + m + Math.max(58, P.hpMax * 16 + 10);
    g.font = F(20, 800, true); g.fillStyle = C.hi; this.text(g, fmt(sim.score), sx, y1 + 7, 20);
    // Chaîne + multiplicateur (alignés à gauche du bouton pause)
    const pr = this.hudRects().pause, mm = P.mult, tc = this.tierCol[mm - 1];
    const cx = pr.x - 10;
    const pulse = this.tier.t > 0.45 ? 1 + 0.15 * ((this.tier.t - 0.45) / 0.17) : 1;
    g.font = F(Math.round(22 * pulse), 800, true); g.fillStyle = tc; const ms = '×' + mm; this.text(g, ms, cx, y1 + 8, 22, 'right');
    g.font = F(22, 800, true); const mw = g.measureText(ms).width;
    g.font = F(18, 800, true); const cs = P.chain < 1000 ? NUM_STR[P.chain] : String(P.chain); this.text(g, cs, cx - mw - 10, y1 + 7, 18, 'right');
    const cw = g.measureText(cs).width;
    g.font = F(10, 800, false); g.fillStyle = C.mid; this.text(g, 'CHAÎNE', cx - mw - 16 - cw, y1 + 5, 10, 'right');
    // barre de fenêtre 72 × 3
    const bx = cx - 72, by = y1 + 14;
    g.fillStyle = C.ink3; g.fillRect(bx, by, 72, 3);
    if (P.chain > 0) { const k = P.state === 1 ? 1 : Math.max(0, P.win / Math.max(0.01, P.winMax || sim.stats.window)); g.fillStyle = P.win < 0.15 && P.state !== 1 ? (Math.floor(this.time * 40) % 2 ? C.white : C.ink3) : col.volt; g.fillRect(bx, by, 72 * Math.min(1, k), 3); }
    // progression d'arène / boss
    g.font = F(10, 800, false); g.fillStyle = C.mid;
    if (sim.boss && sim.arenaIdx === 7) this.text(g, 'DUEL', AX + m, by + 4, 10);
    else if (sim.tuto) this.text(g, 'PROLOGUE', AX + m, by + 4, 10);
    else {
      this.text(g, 'ARÈNE ' + sim.arenaIdx + '/6', AX + m, by + 4, 10);
      const q = Math.min(10, Math.floor(sim.qKills / sim.quota * 10));
      for (let i = 0; i < 10; i++) { g.fillStyle = i < q ? C.hi : C.ink3; g.fillRect(AX + m + 70 + i * 7, by - 2, 5, 5); }
    }
    // bouton pause 48 × 48
    g.strokeStyle = C.lineStrong; g.lineWidth = 1.5; rr(g, pr.x, pr.y, 48, 48, 12); g.stroke();
    g.fillStyle = C.hi; g.fillRect(pr.x + 17, pr.y + 16, 4, 16); g.fillRect(pr.x + 27, pr.y + 16, 4, 16);
    if (sim.tuto) { const sk = this.hudRects().skip; g.fillStyle = C.ink2; rr(g, sk.x, sk.y, sk.w, sk.h, 12); g.fill(); g.strokeStyle = C.lineStrong; g.stroke(); g.font = F(12, 800, false); g.fillStyle = C.hi; this.text(g, 'PASSER', sk.x + sk.w / 2, sk.y + 27, 12, 'center'); }
    // barre de boss (haut de l'arène, panneau)
    let bannerY = this.AY + 8;
    if (sim.boss && sim.arenaIdx === 7) {
      const B = sim.boss, bw = AW * this.s - 24, bxx = AX + 12, byy = this.AY + 6;
      g.fillStyle = 'rgba(13,17,24,.78)'; rr(g, bxx - 6, byy - 2, bw + 12, 30, 8); g.fill();
      g.font = F(10, 800, false); g.fillStyle = C.mid; this.text(g, B.name, bxx, byy + 10, 10);
      if (B.id === 'trait') {
        const nn = B.nodes.length; for (let i = 0; i < nn; i++) { const q = B.nodes[i]; g.fillStyle = q.gone ? C.ink3 : C.hi; g.beginPath(); g.arc(bxx + bw - 6 - (nn - 1 - i) * 12, byy + 6, 4, 0, TAU); g.fill(); }
        const sw = (bw - 8) / 3; for (let i = 0; i < 3; i++) { g.fillStyle = i < B.phase - 1 ? C.ink3 : C.hi; g.fillRect(bxx + i * (sw + 4), byy + 16, sw, 6); }
      } else {
        const tot = B.total, done = B.done(), sw = (bw - (tot - 1) * 2) / tot;
        for (let i = 0; i < tot; i++) { g.fillStyle = i < tot - done ? C.hi : C.ink3; g.fillRect(bxx + i * (sw + 2), byy + 16, sw, 6); }
      }
      bannerY = this.AY + 38;
    }
    // bannière (une seule à la fois, panneau derrière)
    if (this.bannerT > 0 && this.banner) {
      g.font = F(14, 800, false); const w = g.measureText(this.banner.str).width + 32;
      g.globalAlpha = Math.min(1, this.bannerT * 5);
      g.fillStyle = 'rgba(13,17,24,.85)'; rr(g, (W - w) / 2, bannerY, w, 30, 8); g.fill();
      g.fillStyle = this.banner.col; this.text(g, this.banner.str, W / 2, bannerY + 20, 14, 'center');
      g.globalAlpha = 1;
    }
    // indice (tutoriel / onboarding) : bas de l'arène, panneau
    const hintStr = sim.tuto ? TUTO[sim.tuto.step] : (this.hint.t > 0 ? this.hint.str : '');
    if (hintStr && !sim.offer.open) {
      g.font = F(13, 800, false); const w = Math.min(W - 24, g.measureText(hintStr).width + 28);
      const hy = this.PADY - 44;
      g.fillStyle = 'rgba(13,17,24,.88)'; rr(g, (W - w) / 2, hy, w, 32, 8); g.fill(); g.strokeStyle = hexA(col.volt, 0.5); g.lineWidth = 1; g.stroke();
      g.fillStyle = C.hi; this.text(g, hintStr, W / 2, hy + 21, 13, 'center');
    }
    // pad de tracé
    const PY = this.PADY;
    g.fillStyle = C.ink1; g.fillRect(0, PY, W, this.H - PY);
    g.fillStyle = C.line; g.fillRect(0, PY, W, 1);
    const ey = PY + 12;
    g.font = F(10, 800, false); g.fillStyle = C.mid; this.text(g, 'ÉLAN', AX + m, ey + 9, 10);
    const n = sim.stats.elanMax;
    for (let i = 0; i < n; i++) {
      const x = AX + m + 38 + i * 26;
      g.fillStyle = C.ink3; g.fillRect(x, ey, 22, 8);
      if (i < P.elan) { g.fillStyle = col.volt; g.fillRect(x, ey, 22, 8); }
      else if (i === P.elan && P.elan < n) { g.fillStyle = hexA(col.volt, 0.45); g.fillRect(x, ey, 22 * Math.min(1, P.elanT / sim.stats.regen), 8); }
      if (P.elan === 0 && Math.floor(this.time * 6) % 2) { g.strokeStyle = C.lo; g.lineWidth = 1; g.strokeRect(x + 0.5, ey + 0.5, 21, 7); }
    }
    // icônes de cartes (Capacités à gauche, Atouts à droite), non interactives
    this.drawCardRow(g, sim, ey - 7);
    // fantôme du geste / main du tutoriel
    if (ui.ghost) {
      g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 2; g.beginPath(); g.arc(ui.ghost.ax, ui.ghost.ay, 10, 0, TAU); g.stroke();
      g.beginPath(); g.moveTo(ui.ghost.ax, ui.ghost.ay); g.lineTo(ui.ghost.fx, ui.ghost.fy); g.stroke();
    } else if (sim.tuto && sim.tuto.step <= 2) {
      const k = (this.time % 1.6) / 1.6, hx = W / 2 - 40 + 80 * Math.min(1, k * 1.6), hy = PY + Math.min(this.H - this.safe.bottom - PY, 160) * 0.6 - 30 * Math.min(1, k * 1.6);
      g.globalAlpha = k > 0.75 ? (1 - k) * 4 : 0.8;
      g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 2; g.beginPath(); g.moveTo(W / 2 - 40, PY + Math.min(this.H - this.safe.bottom - PY, 160) * 0.6); g.lineTo(hx, hy); g.stroke();
      g.fillStyle = 'rgba(238,242,248,.85)'; g.beginPath(); g.arc(hx, hy, 9, 0, TAU); g.fill(); g.fillRect(hx - 4, hy, 8, 18);
      g.globalAlpha = 1;
    } else if (this.H - this.safe.bottom - PY > 70 && !sim.offer.open) {
      g.font = F(10, 800, false); g.fillStyle = C.lo; this.text(g, 'ZONE DE TRACÉ — GLISSE ET LÂCHE', W / 2, (PY + 40 + this.H - this.safe.bottom) / 2 + 4, 10, 'center');
    }
    if (ui.fps) { g.font = F(10, 800, true); g.fillStyle = C.mid; this.text(g, ui.fps, AX + m, this.H - this.safe.bottom - 6, 10); }
  }
  drawCardRow(g, sim, y) {
    const caps = [], atouts = [];
    for (const id of sim.cardOrder) (CARDS[id].type === 'cap' ? caps : atouts).push(id);
    const m = 12; let x = this.W - this.AX - m - 22;
    const draw = (id, x) => {
      const evo = sim.hasEvo(EVO_OF[id] || '__') ? EVO_OF[id] : null;
      const rc = evo ? C.gold : RCOL[CARDS[id].rar];
      g.strokeStyle = rc; g.lineWidth = 1.5; rr(g, x, y, 22, 22, 4); g.stroke();
      cardIcon(g, evo ? 'evo:' + evo : id, x + 11, y + 11, 18, evo ? C.gold : C.hi);
      g.font = F(10, 800, true); g.fillStyle = C.mid; this.text(g, evo ? '★' : ROMAN[sim.lv[id]], x + 11, y + 34, 10, 'center');
    };
    for (let i = atouts.length - 1; i >= 0; i--) { draw(atouts[i], x); x -= 26; }
    if (atouts.length) x -= 6;
    const minX = this.AX + m + 38 + sim.stats.elanMax * 26 + 6;
    for (let i = caps.length - 1; i >= 0; i--) { if (x < minX) break; draw(caps[i], x); x -= 26; }
  }
  drawCountdown(g, t) {
    const n = Math.ceil(t / 0.3); const str = n >= 3 ? '3' : n === 2 ? '2' : '1';
    g.font = F(48, 800, true); g.fillStyle = C.hi; g.strokeStyle = C.ink0; g.lineWidth = 4; g.textAlign = 'center';
    const y = this.AY + AH * this.s * 0.45;
    g.strokeText(str, this.W / 2, y); this.text(g, str, this.W / 2, y, 48, 'center');
  }
  // choix 1 parmi 3 (DESIGN §10.4)
  drawCards(g, sim, ui) {
    const o = sim.offer, an = this.offerAnim;
    const ids = o.open ? o.ids : an.ids; if (!ids) return;
    const n = ids.length, rects = this.cardRects(n);
    const t = o.open ? o.t : 1;
    // les textes déjà dessinés sous les cartes (opaques) sont masqués : on ne les compte plus comme visibles
    if (this.textRects) this.textRects = this.textRects.filter(q => !rects.some(r => q.x < r.x + r.w && q.x + q.w > r.x && q.y < r.y + r.h && q.y + q.h > r.y));
    g.fillStyle = 'rgba(7,9,13,.55)'; g.fillRect(0, this.AY, this.W, this.H - this.AY);
    g.font = F(16, 800, false); g.fillStyle = C.hi;
    const title = o.start ? 'DÉPART ARMÉ' : 'NIVEAU ' + sim.P.level + (sim.P.pending > 1 ? ' · encore ' + (sim.P.pending - 1) : '');
    this.text(g, title, this.W / 2, rects[0].y - 16, 16, 'center');
    for (let i = 0; i < n; i++) {
      const r = rects[i], id = ids[i];
      const appear = Math.min(1, Math.max(0, (t - i * 0.04) / 0.18));
      if (appear <= 0) continue;
      let y = r.y + (1 - appear) * 30, al = (t > 0.35 ? 1 : 0.7) * appear;
      if (an.pick >= 0) { const k = an.t; if (i === an.pick) y -= k * 60; else { y += k * 200; al *= Math.max(0, 1 - k / 0.3); } }
      if (al <= 0.01) continue;
      const rar = cardRarity(id), rc = rar === 'X' ? C.gold : RCOL[rar];
      g.globalAlpha = Math.min(1, appear * 1.5) * (an.pick >= 0 && i !== an.pick ? Math.max(0, 1 - an.t / 0.3) : 1);
      g.fillStyle = C.ink2; rr(g, r.x, y, r.w, r.h, 12); g.fill(); // fond opaque : le jeu ne transparaît pas
      g.globalAlpha = al;
      g.strokeStyle = rc; g.lineWidth = 2; rr(g, r.x, y, r.w, r.h, 12); g.stroke();
      g.fillStyle = rc; g.fillRect(r.x + 12, y + 2, r.w - 24, 4);
      g.font = F(10, 800, false); g.fillStyle = rc; this.text(g, rar === 'X' ? '◆ ÉVOLUTION' : RARITY[rar].name, r.x + r.w / 2, y + 22, 10, 'center');
      cardIcon(g, id, r.x + r.w / 2, y + 54, 40, rar === 'X' ? C.gold : this.col.volt);
      const name = cardLabel(id);
      g.font = F(name.length > 9 ? 12 : 15, 800, false); g.fillStyle = C.hi; this.text(g, name, r.x + r.w / 2, y + 96, name.length > 9 ? 12 : 15, 'center');
      const lv = id.startsWith('evo:') || id === 'reparation' ? 0 : (sim.lv[id] || 0);
      const lvStr = id.startsWith('evo:') ? 'remplace ' + CARDS[EVOLUTIONS[id.slice(4)].a].name : id === 'reparation' ? '' : lv ? ROMAN[lv] + ' → ' + ROMAN[lv + 1] : 'NOUVEAU';
      if (lvStr) { g.font = F(lvStr.length > 14 ? 10 : 12, 800, true); g.fillStyle = this.col.voltSoft; this.text(g, lvStr, r.x + r.w / 2, y + 116, lvStr.length > 14 ? 10 : 12, 'center'); }
      g.font = F(11, 500, false); g.fillStyle = C.mid; this.wrap(g, cardDesc(id, lv + 1), r.x + r.w / 2, y + 140, r.w - 14, 14, 11, Math.floor((r.h - 140) / 14));
      if (i === an.pick && an.pick >= 0) { g.strokeStyle = this.col.volt; g.lineWidth = 3; g.beginPath(); g.moveTo(r.x, y + r.h * Math.min(1, an.t * 2)); g.lineTo(r.x + r.w, y + r.h * (Math.min(1, an.t * 2) - 0.3)); g.stroke(); }
    }
    g.globalAlpha = 1;
    if (o.open && o.rerolls > 0 && !o.start) {
      const rb = this.rerollRect(n);
      g.fillStyle = C.ink2; rr(g, rb.x, rb.y, rb.w, rb.h, 12); g.fill(); g.strokeStyle = C.lineStrong; g.lineWidth = 1.5; g.stroke();
      g.font = F(13, 800, false); g.fillStyle = C.hi; this.text(g, '↻ RELANCER (' + o.rerolls + ')', this.W / 2, rb.y + 30, 13, 'center');
    }
  }
  wrap(g, s, x, y, w, lh, size, maxLines) {
    const words = s.split(' '); let line = '', n = 0;
    for (const wd of words) {
      const t = line ? line + ' ' + wd : wd;
      if (g.measureText(t).width > w && line) { if (n < maxLines) this.text(g, line, x, y, size, 'center'); y += lh; n++; line = wd; } else line = t;
    }
    if (n < maxLines) this.text(g, line, x, y, size, 'center');
  }
  // écran titre : démo de l'IA, assombrie
  drawMenu(sim) {
    const g = this.ctx;
    if (!sim) { g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = C.ink0; g.fillRect(0, 0, this.cv.width, this.cv.height); return; }
    const saveRects = this.textRects; this.textRects = null;
    this.drawGameWorldOnly(sim);
    this.textRects = saveRects;
    g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = 'rgba(7,9,13,.5)'; g.fillRect(0, 0, this.cv.width, this.cv.height);
  }
  drawGameWorldOnly(sim) {
    const g = this.ctx, a = sim.alpha;
    this.ensureLayer(sim);
    g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = C.ink0; g.fillRect(0, 0, this.cv.width, this.cv.height);
    this.zk = 1; this.zox = 0; this.zoy = 0;
    g.save(); g.beginPath(); g.rect(this.AX * this.dpr, this.AY * this.dpr, AW * this.s * this.dpr, AH * this.s * this.dpr); g.clip();
    this.setWorld(g, 0, 0);
    g.drawImage(this.layer, 0, 0, AW, AH); this.drawGlass(g, sim); this.drawTeles(g, sim, a);
    g.globalCompositeOperation = 'lighter'; this.drawTrails(g, sim); this.drawParticles(g); this.drawRings(g); g.globalCompositeOperation = 'source-over';
    this.drawDebris(g, 0, 0); this.drawEnemies(g, sim, a, 0, 0); this.setWorld(g, 0, 0); this.drawBossOverlay(g, sim, a); this.drawBullets(g, sim, a);
    const P = sim.P; this.drawPlayer(g, sim, a, P.px + (P.x - P.px) * a, P.py + (P.y - P.py) * a);
    g.restore();
  }
}
const RCOL = { C: C.rarC, R: C.rarR, E: C.rarE, X: C.gold };
const TUTO = ['', 'Glisse et lâche : tu traces', 'Tue en un trait = élan rendu', 'Enchaîne en moins d’une demi-seconde', 'Immobile, tu es vulnérable. Bouge pendant qu’il vise.'];
export function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
