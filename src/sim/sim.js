// DASHLINE — simulation déterministe à pas fixe (1/60 s), sans DOM, testable sous Node.
// Horloge (hit-stop, ralentis, choix de cartes, Concentration) incluse : frame(rdtRéel) fait avancer la sim.
import { STEP, AW, AH, CELL, GW, GH, RP, ENEMY, ZONES, MAPS, BOSS_MAPS, BOSSES, FORMATIONS, SILHOUETTES, ELAN_REGEN, GESTURE, TENSION,
  TIERS, multOf, multiBonus, quotaFor, xpNeed, PEARL_R, PEARL_V, BOSS_TYPES } from '../core/data.js';
import { CARDS, CAP, EVOLUTIONS, EVO_IDS, drawOffer, START_CARDS } from '../core/cards.js';
import { mulberry32 } from '../core/rng.js';
import { Arena, PIT } from './arena.js';
import { Plan, planDash, tapVector, K_KILL, K_HIT, K_POP, K_BOSS, circleEntry, targetable, miroirFace } from './plan.js';
import { EV, EventBuf } from './events.js';
import { updateEnemy, angDiff, moveE, fireBullet, distSeg } from './enemies.js';
import { createBoss } from './bosses.js';

export { EV };
const TAU = Math.PI * 2;
const MAXE = 64, MAXB = 256, MAXSHELL = 24, MAXECL = 64, MAXFL = 48, MAXBOOM = 64, MAXTELE = 16, MAXECHO = 4, MAXXP = 96, MAXLINES = 24;
// Cadencement du directeur (§7.2 : 0,5 s et 0,3 s) — ajusté par simulation, cf. NOTES.md
export const FORM_GAP = 1.0, FORM_EMPTY = 0.6;
export const ST_IDLE = 0, ST_DASH = 1, ST_FALL = 2, ST_DEAD = 3;
const CAUSE_DASH = 0, CAUSE_CARD = 1, CAUSE_BAVURE = 2, CAUSE_ECHO = 3;

function mkEnemy(i) {
  return { idx: i, on: false, uid: 0, type: 'pion', x: 0, y: 0, px: 0, py: 0, r: 9, hp: 1, hpMax: 1, elite: false, boss: false, ang: 0, face: 0,
    st: 0, t: 0, cd: 0, lockA: 0, lx: 0, ly: 0, lane: 0, run: 0, born: 0, noFire: 0, stun: 0, bubble: 0, bubbleT: 0, lastDash: -1, planDash: -1,
    kx: 0, ky: 0, kT: 0, wob: 0, spd: 1, rate: 1, side: 1, losT: 0, mv: 0, mvT: 0, tx: 0, ty: 0, spin: 0, open: false, salvo: 0, rotA: 0,
    static: false, gone: false, pathT: 0, direct: true, flameCd: 0, vuln: false, shieldOn: false, crack: 0, rot: 0, part: 0, touch: true, w: 1, deadT: 0, chainId: 0, ox: 0, oy: 0 };
}

export class Sim {
  // cfg : { zone (0..3), tension, sil, atelier {…}, seed, unlocked [cartes], prologue, daily {mod}, invincible, reduced, assist, startLv }
  constructor(cfg = {}) {
    this.cfg = cfg;
    this.zone = cfg.zone || 0; this.Z = ZONES[this.zone];
    this.tension = cfg.tension || 0;
    this.sil = SILHOUETTES[cfg.sil || 'fil'] || SILHOUETTES.fil;
    this.at = Object.assign({ portee: 0, tranchant: 0, sangFroid: 0, elan: 0, garde: 0, souffle: 0, instinct: 0, secondeChance: 0, savoir: 0, butin: 0, relance: 0, eventail: 0, departArme: 0 }, cfg.atelier || {});
    this.seed = (cfg.seed >>> 0) || 1;
    this.rngW = mulberry32(this.seed); this.rngC = mulberry32((this.seed ^ 0x9E3779B9) >>> 0);
    this.assist = cfg.assist || 'normal';
    this.invincible = !!cfg.invincible; this.reduced = !!cfg.reduced;
    this.daily = cfg.daily || null;
    this.unlocked = (cfg.unlocked || START_CARDS).slice();
    this.lv = {}; this.evo = {}; this.cardOrder = [];
    this.arena = new Arena();
    this.enemies = []; for (let i = 0; i < MAXE; i++) this.enemies.push(mkEnemy(i));
    this.bullets = []; for (let i = 0; i < MAXB; i++) this.bullets.push({ on: false, x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, age: 0 });
    this.shells = []; for (let i = 0; i < MAXSHELL; i++) this.shells.push({ on: false, x0: 0, y0: 0, tx: 0, ty: 0, t: 0, dur: 1, r: 34 });
    this.eclats = []; for (let i = 0; i < MAXECL; i++) this.eclats.push({ on: false, x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, pierce: 0, life: 0, hit0: -1, hit1: -1, hit2: -1 });
    this.flames = []; for (let i = 0; i < MAXFL; i++) this.flames.push({ on: false, x0: 0, y0: 0, x1: 0, y1: 0, w: 10, t: 0, life: 1, ring: false, r: 0 });
    this.booms = []; for (let i = 0; i < MAXBOOM; i++) this.booms.push({ on: false, x: 0, y: 0, r: 0, t: 0, kind: 0, colosse: false, cut: false, k: 1 });
    this.teles = []; for (let i = 0; i < MAXTELE; i++) { const g = { on: false, t: 0, n: 0, type: [], x: new Float32Array(12), y: new Float32Array(12), cnt: new Uint8Array(12), elite: new Uint8Array(12), w: 0 }; for (let k = 0; k < 12; k++) g.type.push(''); this.teles.push(g); }
    this.echoes = []; for (let i = 0; i < MAXECHO; i++) this.echoes.push({ on: false, plan: new Plan(), t: 0, s: 0, k: 1, id: 0, speed: 1500, px: 0, py: 0, x: 0, y: 0 });
    this.xpQ = []; for (let i = 0; i < MAXXP; i++) this.xpQ.push({ on: false, t: 0, amt: 0 });
    this.lines = []; for (let i = 0; i < MAXLINES; i++) this.lines.push({ on: false, kind: 0, x0: 0, y0: 0, x1: 0, y1: 0, w: 8, t: 0, tele: 0, life: 0, deadly: false });
    this.ev = new EventBuf(1024);
    // grille spatiale (ennemis) : comptage + préfixe, sans allocation
    this.grid = { count: new Int16Array(GW * GH), start: new Int16Array(GW * GH + 1), items: new Int16Array(MAXE), fill: new Int16Array(GW * GH) };
    this.flowDist = new Int16Array(GW * GH); this.flowNext = new Int16Array(GW * GH); this.flowQ = new Int16Array(GW * GH); this.flowCell = -1; this.flowT = 0;
    this.plan = new Plan(); this.aimPlan = new Plan(); this.tmpPt = { x: 0, y: 0, seg: 0 };
    this.vecs = new Float32Array(16); this.tapV = new Float32Array(2);
    this.intent = { on: false, kind: 0, n: 0, v: new Float32Array(16), tx: 0, ty: 0, age: 0 };
    this.offer = { open: false, ids: [], t: 0, rerolls: 0, start: false };
    this.uidC = 0; this.dashC = 0; this.time = 0; this.realT = 0; this.acc = 0; this.alpha = 0; this.k = 1;
    this.hitstop = 0; this.lastHitstop = -9; this.slow = { on: false, t: 0, hold: 0, ret: 0, scale: 1 };
    this.reprise = 0; this.countdown = 0; this.aiming = false; this.concUsed = 0;
    this.pearlK = this.Z.pearl;
    this.boss = null; this.over = false; this.victory = false;
    this.stats = {};
    this.rec = { kills: 0, elites: 0, arenasCleared: 0, bulletsCut: 0, bavures: 0, glass: 0, backKills: 0, cardKills: 0, triples: 0, noHitArenas: 0,
      bestMulti: 0, dashes: 0, hits: 0, bossKilled: false, bossTime: 0, bossNoHit: false, evolutions: [], maxMult: 1, idleSum: 0, idleN: 0, reached: 1 };
    this.score = 0;
    const P = this.P = {
      x: 0, y: 0, px: 0, py: 0, dir: -Math.PI / 2, state: ST_IDLE, hp: 3, hpMax: 3, elan: 3, elanT: 0, inv: 0, traine: 0, anchor: 0, stun: 0,
      win: 0, chain: 0, chainId: 1, best: 0, chainDashes: 0, fallT: 0, fallX: 0, fallY: 0, s: 0, dashId: 0, kills: 0, cardKills: 0, pts: 0, elite: 0,
      bossHits: 0, speed: 1500, xp: 0, level: 1, pending: 0, tourT: 0, tourA: 0, voile: false, instinctCd: 0, revived: false, idleT: 0, superNow: false,
      dashSX: 0, dashSY: 0, arenaHit: false, bossHit: false, winMax: 0.5, winBonus: 0, mult: 1, lastArriveT: 0, tickDone: false, deathT: 0,
    };
    this.computeStats();
    P.hp = P.hpMax = this.stats.hpMax; P.elan = this.stats.elanMax;
    // cartes offertes au départ (Trait du jour)
    if (this.daily && this.daily.mod === 'eclat') this.addCard('eclatement');
    if (this.daily && this.daily.mod === 'ricochet') this.addCard('ricochet');
    if (cfg.startLv) for (const id in cfg.startLv) for (let i = 0; i < cfg.startLv[id]; i++) this.addCard(id);
    this.arenaIdx = 1; this.phase = 'arena'; this.phaseT = 0; this.mapPrev = '';
    this.quota = 12; this.qKills = 0; this.arenaT = 0; this.formT = 0; this.lastDashX0 = -999; this.lastDashY0 = 0; this.lastDashX1 = -999; this.lastDashY1 = 0;
    this.tuto = null;
    if (cfg.prologue) this.startPrologue(); else this.loadArena(1);
    // Départ armé : 1 carte commune niveau I au choix (parmi 3)
    if (this.at.departArme > 0 && !cfg.prologue) this.openStartOffer();
  }

  // ------------------------------------------------------------------ stats
  cardLv(id) { return this.lv[id] || 0; }
  hasEvo(id) { return !!this.evo[id]; }
  computeStats() {
    const s = this.sil, a = this.at, L = id => this.lv[id] || 0, T = this.tension;
    const st = this.stats;
    st.Lmax = (s.Lmax + 10 * a.portee + 12 * L('portee')) * (this.daily && this.daily.mod === 'lmax' ? 0.8 : 1);
    st.rCut = s.rCut + 1.5 * a.tranchant + 2.5 * L('tranchant');
    const baseWin = this.daily && this.daily.mod === 'fen' ? 0.4 : s.window;
    st.window = Math.max(0.2, baseWin + 0.025 * a.sangFroid + 0.05 * L('sangFroid') - (T >= 3 ? 0.05 : 0));
    st.regen = this.daily && this.daily.mod === 'noregen' ? 1e9 : Math.max(0.25, ELAN_REGEN - 0.05 * a.souffle - 0.08 * L('souffle'));
    st.elanMax = s.elan + a.elan + (L('souffle') >= 3 ? 1 : 0) + (L('souffle') >= 5 ? 1 : 0);
    st.hpMax = Math.max(1, s.hp + a.garde + L('garde') - (T >= 5 ? 1 : 0));
    st.speed = s.speed * (1 + 0.12 * L('velocite'));
    st.anchor = Math.max(0.02, s.anchor - 0.012 * L('velocite'));
    st.trailInv = s.trailInv + CAP.fantomeT[L('fantome')];
    st.xpK = (1 + 0.08 * a.savoir) * (1 + 0.12 * L('butin'));
    st.enemySpd = this.Z.speed * (T >= 1 ? 1.15 : 1);
    st.enemyRate = this.Z.rate * (T >= 4 ? 1.25 : 1);
    st.eliteK = (T >= 2 ? 2 : 1) * (this.daily && this.daily.mod === 'elites' ? 3 : 1);
    if (this.P) { this.P.hpMax = st.hpMax; if (this.P.hp > st.hpMax) this.P.hp = st.hpMax; if (this.P.elan > st.elanMax) this.P.elan = st.elanMax; }
  }
  addCard(id) {
    if (id.startsWith('evo:')) {
      const e = id.slice(4); this.evo[e] = true; this.rec.evolutions.push(e); this.emit(EV.EVOLVE, this.P.x, this.P.y, 0, 0, 0, e);
    } else if (id === 'reparation') {
      if (this.P.hp < this.P.hpMax) this.P.hp++; else this.score += 2000;
    } else {
      const was = this.lv[id] || 0;
      if (was >= CARDS[id].max) return;
      this.lv[id] = was + 1;
      if (!was) this.cardOrder.push(id);
      if (id === 'garde') { this.computeStats(); this.P.hp = Math.min(this.P.hpMax, this.P.hp + 1); }
      if (id === 'souffle' && (was + 1 === 3 || was + 1 === 5)) { this.computeStats(); this.P.elan = Math.min(this.stats.elanMax, this.P.elan + 1); }
    }
    this.computeStats();
  }
  totalCardLevels() { let n = 0; for (const id in this.lv) n += this.lv[id]; return n; }

  // ------------------------------------------------------------------ événements
  emit(type, x, y, a, b, c, s) { return this.ev.push(type, x, y, a, b, c, s); }
  clearEvents() { this.ev.clear(); }

  // ------------------------------------------------------------------ arènes
  loadArena(n) {
    this.arenaIdx = n; this.rec.reached = Math.max(this.rec.reached, n);
    const pools = this.Z.pools[n <= 2 ? 0 : 1];
    let key = pools[Math.floor(this.rngW() * pools.length)];
    if (key === this.mapPrev && pools.length > 1) { const i = pools.indexOf(key); key = pools[(i + 1 + Math.floor(this.rngW() * (pools.length - 1))) % pools.length]; }
    this.mapPrev = key;
    const flip = this.rngW() < 0.5;
    this.arena.load(MAPS[key], flip, key);
    this.quota = quotaFor(this.zone, n); this.qKills = 0; this.arenaT = 0; this.formT = 0.4;
    this.placePlayer(); this.flowCell = -1;
    // tourelles placées par la carte (comptent dans le quota)
    for (const t of this.arena.turrets) { const e = this.spawnEnemy('tourelle', t.cx * CELL + 15, t.cy * CELL + 15, false); if (e) { e.noFire = 0.6; e.t = this.rngW() * 3; } }
    this.P.arenaHit = false; this.P.voile = this.cardLv('fantome') >= 5;
    this.phase = 'arena'; this.phaseT = 0;
    this.emit(EV.ARENA_LOAD, 0, 0, n, 0, 0, key);
  }
  placePlayer() {
    const P = this.P;
    P.x = P.px = this.arena.px; P.y = P.py = this.arena.py; P.state = ST_IDLE; P.dir = -Math.PI / 2; P.inv = Math.max(P.inv, 1.0); P.anchor = 0; P.stun = 0;
  }
  clearField(all) {
    for (const b of this.bullets) b.on = false;
    for (const s of this.shells) s.on = false;
    for (const e of this.eclats) e.on = false;
    for (const f of this.flames) f.on = false;
    for (const b of this.booms) b.on = false;
    for (const l of this.lines) l.on = false;
    for (const g of this.teles) g.on = false;
    if (all) for (const e of this.enemies) e.on = false;
  }
  loadBoss() {
    const id = this.Z.boss;
    this.arena.load(BOSS_MAPS[id], false, 'boss:' + id);
    this.arenaIdx = 7; this.rec.reached = 7;
    this.placePlayer(); this.flowCell = -1;
    this.boss = createBoss(id, this);
    this.phase = 'bossIntro'; this.phaseT = 0;
    this.emit(EV.ARENA_LOAD, 0, 0, 7, 0, 0, 'boss:' + id);
    this.emit(EV.BOSS_IN, AW / 2, 120, 0, 0, 0, BOSSES[id].name);
    this.emit(EV.BANNER, 0, 0, 2, 0, 0, 'DUEL');
  }

  // ------------------------------------------------------------------ pools
  take(pool) { for (let i = 0; i < pool.length; i++) if (!pool[i].on) { pool[i].on = true; return pool[i]; } return null; }
  takeBullet() { const b = this.take(this.bullets); if (b) b.age = 0; return b; }
  spawnEnemy(type, x, y, elite) {
    let e = null; for (let i = 0; i < MAXE; i++) if (!this.enemies[i].on) { e = this.enemies[i]; break; }
    if (!e) return null;
    const D = ENEMY[type], P = this.P;
    if (!BOSS_TYPES.has(type) && this.arena.circleHits(x, y, D.r, 0)) { // dégage l'ennemi d'un mur / bord (rayons > 15 u)
      let ok = false;
      for (let d = 3; d <= 45 && !ok; d += 3) for (let k = 0; k < 16; k++) {
        const a = k / 16 * TAU, nx = x + Math.cos(a) * d, ny = y + Math.sin(a) * d;
        if (!this.arena.circleHits(nx, ny, D.r, 0)) { x = nx; y = ny; ok = true; break; }
      }
    }
    e.on = true; e.uid = ++this.uidC; e.type = type; e.x = e.px = x; e.y = e.py = y; e.r = D.r;
    e.hp = e.hpMax = D.hp + (elite ? (type === 'colosse' ? 2 : 1) : 0); e.elite = !!elite; e.boss = BOSS_TYPES.has(type);
    e.ang = e.face = Math.atan2(P.y - y, P.x - x); e.st = 0; e.t = 0; e.cd = 0.8 + this.rngW() * 0.8; e.lockA = e.ang; e.lane = 0; e.run = 0;
    e.born = 0.12; e.noFire = 0.6; e.stun = 0; e.bubble = 0; e.bubbleT = 0; e.lastDash = -1; e.planDash = -1; e.kx = e.ky = e.kT = 0;
    e.wob = this.rngW() * TAU; e.spd = this.stats.enemySpd * (elite ? 1.15 : 1); e.rate = this.stats.enemyRate * (elite ? 1.25 : 1);
    e.side = this.rngW() < 0.5 ? 1 : -1; e.losT = 0; e.mv = 6; e.mvT = 0; e.tx = x; e.ty = y; e.spin = 0; e.open = false; e.salvo = 0; e.rotA = 0;
    e.static = false; e.gone = false; e.pathT = 0; e.direct = true; e.flameCd = 0; e.vuln = false; e.shieldOn = false; e.crack = 0; e.rot = 0; e.part = 0; e.touch = true;
    e.w = type === 'mouch' ? 0.5 : 1; e.deadT = 0; e.chainId = 0; e.ox = x; e.oy = y;
    if (type === 'tireur') e.cd = 1.0 + this.rngW() * 1.4;
    if (type === 'lancier') { e.cd = 1.2 + this.rngW(); e.mv = 7; }
    if (type === 'fileur') e.cd = 1.0 + this.rngW() * 1.2;
    if (type === 'mortier') { e.cd = 1.2 + this.rngW() * 1.5; e.mv = 6; }
    if (type === 'tourelle') { e.rotA = 0; e.born = 0; }
    this.emit(EV.SPAWN, x, y, 0, elite ? 1 : 0, 0, type);
    return e;
  }

  // ------------------------------------------------------------------ directeur de densité (§7.2)
  weightAlive() { let w = 0; for (const e of this.enemies) if (e.on && !e.boss) w += e.w; return w; }
  aliveCount() { let n = 0; for (const e of this.enemies) if (e.on) n++; return n; }
  pendingW() { let w = 0; for (const g of this.teles) if (g.on) w += g.w; return w; }
  telesOn() { let n = 0; for (const g of this.teles) if (g.on) n++; return n; }
  updateDirector(dt) {
    this.arenaT += dt;
    const alive = this.weightAlive(), pend = this.pendingW();
    if (this.qKills + alive + pend >= this.quota) return;
    const p = Math.min(1, this.qKills / this.quota), warm = 0.5 + 0.5 * Math.min(1, this.arenaT / 6);
    const T = (this.Z.b + this.Z.g * p + 0.5 * (this.arenaIdx - 1)) * warm;
    this.formT -= dt;
    if (alive + pend === 0 && this.formT > FORM_EMPTY) this.formT = FORM_EMPTY;
    if (alive + pend < T && this.formT <= 0 && this.telesOn() < 3 && this.aliveCount() < 40) {
      this.spawnFormation(this.pickFormation());
      this.formT = FORM_GAP;
    }
  }
  pickFormation() {
    const z = this.zone, a = this.arenaIdx;
    let tot = 0;
    for (const f of FORMATIONS) if (a >= f.from && f.w[z] > 0) tot += f.w[z];
    let r = this.rngW() * tot;
    for (const f of FORMATIONS) { if (a < f.from || !f.w[z]) continue; r -= f.w[z]; if (r < 0) return f.id; }
    return 'ruee';
  }
  eliteRoll(type) {
    if (type === 'mouch') return false;
    const z = this.Z; if (this.zone === 0 && this.arenaIdx < z.eliteFrom) return false;
    return this.rngW() < z.elite * this.stats.eliteK;
  }
  // case libre d'apparition : ≥ 90 u du joueur, bords préférés (×3), jamais dans la ligne du dernier dash prolongée de 60 u
  spawnPoint(out, minD = 90, edgeOnly = false) {
    const a = this.arena, P = this.P;
    let tot = 0;
    const W = this._spw || (this._spw = new Float32Array(GW * GH));
    const dx = this.lastDashX1 - this.lastDashX0, dy = this.lastDashY1 - this.lastDashY0, dl = Math.hypot(dx, dy) || 1;
    const lx1 = this.lastDashX1 + dx / dl * 60, ly1 = this.lastDashY1 + dy / dl * 60;
    for (let cy = 0; cy < GH; cy++) for (let cx = 0; cx < GW; cx++) {
      const i = cy * GW + cx; W[i] = 0;
      if (a.cell[i] !== 0) continue;
      const x = cx * CELL + 15, y = cy * CELL + 15;
      if ((x - P.x) ** 2 + (y - P.y) ** 2 < minD * minD) continue;
      if (this.lastDashX0 > -900 && distSeg(x, y, this.lastDashX0, this.lastDashY0, lx1, ly1) < 30) continue;
      let busy = false; for (const e of this.enemies) if (e.on && (e.x - x) ** 2 + (e.y - y) ** 2 < 24 * 24) { busy = true; break; }
      if (busy) continue;
      const edge = cx <= 1 || cy <= 1 || cx >= GW - 2 || cy >= GH - 2;
      if (edgeOnly && !edge) continue;
      W[i] = edge ? 3 : 1; tot += W[i];
    }
    if (tot <= 0) { if (minD > 40) return this.spawnPoint(out, minD - 30, false); return false; }
    let r = this.rngW() * tot;
    for (let i = 0; i < GW * GH; i++) { if (!W[i]) continue; r -= W[i]; if (r < 0) { out.x = (i % GW) * CELL + 15; out.y = Math.floor(i / GW) * CELL + 15; out.cx = i % GW; out.cy = Math.floor(i / GW); return true; } }
    return false;
  }
  okSpot(x, y, r) {
    if (x < r || y < r || x > AW - r || y > AH - r) return false;
    if (this.arena.circleHits(x, y, r, 0)) return false;
    const P = this.P; if ((x - P.x) ** 2 + (y - P.y) ** 2 < 90 * 90) return false;
    return true;
  }
  newTele() { const g = this.take(this.teles); if (!g) return null; g.t = 0.7; g.n = 0; g.w = 0; return g; }
  teleAdd(g, type, x, y, cnt = 1, elite = null) {
    if (!g || g.n >= 12) return;
    const i = g.n++; g.type[i] = type; g.x[i] = x; g.y[i] = y; g.cnt[i] = cnt;
    g.elite[i] = elite === null ? (this.eliteRoll(type) ? 1 : 0) : elite ? 1 : 0;
    g.w += type === 'mouch' ? 0.5 * cnt : cnt;
  }
  near(x, y, d, r, out) {
    for (let k = 0; k < 10; k++) { const a = this.rngW() * TAU, nx = x + Math.cos(a) * d, ny = y + Math.sin(a) * d; if (this.okSpot(nx, ny, r)) { out.x = nx; out.y = ny; return true; } }
    out.x = x; out.y = y; return false;
  }
  spawnFormation(id) {
    const sp = this._sp || (this._sp = { x: 0, y: 0, cx: 0, cy: 0 }), q = this._q || (this._q = { x: 0, y: 0 });
    const r = this.rngW;
    if (!this.spawnPoint(sp)) return;
    const g = this.newTele(); if (!g) return;
    const P = this.P;
    switch (id) {
      case 'ruee': {
        const n = 4 + Math.floor(r() * 3);
        // portails espacés de 30 u le long du bord le plus proche du point tiré
        const cx = sp.cx, cy = sp.cy, horiz = Math.min(cy, GH - 1 - cy) <= Math.min(cx, GW - 1 - cx);
        let placed = 0;
        for (let k = 0; k < 12 && placed < n; k++) {
          const off = (k % 2 ? 1 : -1) * Math.ceil(k / 2);
          const x = horiz ? sp.x + off * 30 : sp.x, y = horiz ? sp.y : sp.y + off * 30;
          if (this.okSpot(x, y, 10)) { this.teleAdd(g, 'pion', x, y); placed++; }
        }
        break;
      }
      case 'nuee': this.teleAdd(g, 'mouch', sp.x, sp.y, 6 + Math.floor(r() * 5), false); break;
      case 'duo': {
        this.teleAdd(g, 'tireur', sp.x, sp.y);
        const ox = AW - sp.x, oy = AH - sp.y;
        if (this.okSpot(ox, oy, 12)) this.teleAdd(g, 'tireur', ox, oy);
        else if (this.near(ox, oy, 40, 12, q)) this.teleAdd(g, 'tireur', q.x, q.y);
        break;
      }
      case 'taureau': this.teleAdd(g, 'charg', sp.x, sp.y); for (let i = 0; i < 3; i++) if (this.near(sp.x, sp.y, 32, 10, q)) this.teleAdd(g, 'pion', q.x, q.y); break;
      case 'phalange': {
        const a = Math.atan2(P.y - sp.y, P.x - sp.x), px = -Math.sin(a), py = Math.cos(a);
        for (const s of [-1, 1]) {
          const tx = sp.x + px * 18 * s, ty = sp.y + py * 18 * s;
          if (this.okSpot(tx, ty, 10)) this.teleAdd(g, 'tireur', tx, ty);
          const bx = tx + Math.cos(a) * 30, by = ty + Math.sin(a) * 30;
          if (this.okSpot(bx, by, 12)) this.teleAdd(g, 'boucl', bx, by);
        }
        if (!g.n) this.teleAdd(g, 'boucl', sp.x, sp.y);
        break;
      }
      case 'barrage': this.teleAdd(g, 'mortier', sp.x, sp.y); if (this.spawnPoint(q)) this.teleAdd(g, 'mortier', q.x, q.y); for (let i = 0; i < 4; i++) if (this.near(sp.x, sp.y, 34, 10, q)) this.teleAdd(g, 'pion', q.x, q.y); break;
      case 'colosse': this.teleAdd(g, 'colosse', sp.x, sp.y); if (this.near(sp.x, sp.y, 44, 6, q)) this.teleAdd(g, 'mouch', q.x, q.y, 6, false); break;
      case 'ligne': this.teleAdd(g, 'lancier', sp.x, sp.y); if (this.spawnPoint(q)) this.teleAdd(g, 'lancier', q.x, q.y); for (let i = 0; i < 3; i++) if (this.near(sp.x, sp.y, 32, 10, q)) this.teleAdd(g, 'pion', q.x, q.y); break;
      case 'ombres': this.teleAdd(g, 'fileur', sp.x, sp.y); if (this.spawnPoint(q)) this.teleAdd(g, 'fileur', q.x, q.y); break;
      case 'escorte': {
        this.teleAdd(g, 'egide', sp.x, sp.y);
        for (let i = 0; i < 2; i++) if (this.near(sp.x, sp.y, 30, 12, q)) this.teleAdd(g, 'boucl', q.x, q.y);
        for (let i = 0; i < 3; i++) if (this.near(sp.x, sp.y, 46, 10, q)) this.teleAdd(g, 'pion', q.x, q.y);
        break;
      }
    }
    if (!g.n) { g.on = false; return; }
    this.emit(EV.SPAWN_TELE, sp.x, sp.y, g.n, 0, 0, id);
  }
  updateTeles(dt) {
    for (const g of this.teles) {
      if (!g.on) continue;
      g.t -= dt;
      if (g.t > 0) continue;
      g.on = false;
      for (let i = 0; i < g.n; i++) {
        const type = g.type[i];
        if (type === 'mouch') {
          for (let k = 0; k < g.cnt[i]; k++) { const a = k / g.cnt[i] * TAU, d = 6 + (k % 3) * 5; let x = g.x[i] + Math.cos(a) * d, y = g.y[i] + Math.sin(a) * d; if (this.arena.circleHits(x, y, 5, 0)) { x = g.x[i]; y = g.y[i]; } this.spawnEnemy('mouch', x, y, false); }
        } else {
          const e = this.spawnEnemy(type, g.x[i], g.y[i], !!g.elite[i]);
          if (e && g.static) e.static = true;
        }
      }
      g.static = false;
    }
  }

  // ------------------------------------------------------------------ intention de dash (entrées)
  // vecteur(s) relatif(s) : vecs = [vx0, vy0, …] en u
  requestDash(vecs, n) {
    const I = this.intent; I.on = true; I.kind = 0; I.n = Math.min(8, n); I.age = 0;
    for (let i = 0; i < I.n * 2; i++) I.v[i] = vecs[i];
  }
  requestTap(tx, ty) { const I = this.intent; I.on = true; I.kind = 1; I.tx = tx; I.ty = ty; I.age = 0; I.n = 1; }
  canDash() { const P = this.P; return P.state === ST_IDLE && P.anchor <= 0 && P.stun <= 0 && !this.offer.open && this.phase !== 'dead' && this.phase !== 'won' && this.countdown <= 0; }
  nextSuper() {
    const l = this.cardLv('surcharge'); if (!l) return false;
    const N = this.hasEvo('dechirure') ? 3 : CAP.surchargeN[l];
    return (this.P.chainDashes + 1) % N === 0 && this.P.chain > 0;
  }
  // origine de la visée : point d'arrivée prévu pendant un dash, sinon le joueur
  aimOrigin(out) { const P = this.P; if (P.state === ST_DASH) { out.x = this.plan.ex; out.y = this.plan.ey; } else { out.x = P.x; out.y = P.y; } return out; }
  // plan affiché par la ligne de visée (même calcul que l'exécution)
  planFor(out, ox, oy, kind, vecs, n, tx, ty) {
    const opts = this._po || (this._po = { tap: false, superDash: false, assist: 'normal' });
    opts.assist = this.assist; opts.superDash = this.nextSuper(); opts.tap = kind === 1;
    if (kind === 1) { if (!tapVector(this, ox, oy, tx, ty, this.assist, this.tapV)) { out.ok = false; out.n = 0; out.cN = 0; out.short = true; out.L = 0; out.ox = ox; out.oy = oy; out.ex = ox; out.ey = oy; return out; } return planDash(this, out, ox, oy, this.tapV, 1, opts); }
    return planDash(this, out, ox, oy, vecs, n, opts);
  }
  processIntent() {
    const I = this.intent; if (!I.on || !this.canDash()) return;
    I.on = false;
    const P = this.P;
    this.planFor(this.plan, P.x, P.y, I.kind, I.v, I.n, I.tx, I.ty);
    if (!this.plan.ok) return;
    this.startDash();
  }

  // ------------------------------------------------------------------ dash
  startDash() {
    const P = this.P, pl = this.plan;
    if (P.elan <= 0) { this.emit(EV.DRY, P.x, P.y, 0, 0); return false; }
    P.elan--; P.state = ST_DASH; P.s = 0; P.dashId = ++this.dashC; P.kills = 0; P.cardKills = 0; P.pts = 0; P.elite = 0; P.bossHits = 0;
    P.dashSX = P.x; P.dashSY = P.y; P.superNow = pl.superDash;
    P.speed = this.stats.speed * (pl.superDash && this.cardLv('surcharge') >= 5 ? 1.5 : 1);
    if (P.chain > 0) P.chainDashes++;
    P.dir = pl.dir; P.idleT = 0;
    this.rec.dashes++;
    this.rec.idleSum += Math.min(3, this.time - P.lastArriveT); this.rec.idleN++;
    for (let i = 0; i < pl.cN; i++) pl.cE[i].planDash = P.dashId;
    if (pl.blockE) pl.blockE.planDash = P.dashId;
    this.lastDashX0 = P.x; this.lastDashY0 = P.y; this.lastDashX1 = pl.ex; this.lastDashY1 = pl.ey;
    this.concUsed = 0;
    this.emit(EV.DASH, P.x, P.y, pl.dir, pl.L, pl.superDash ? 1 : 0);
    if (pl.superDash) this.emit(EV.SUPER, P.x, P.y, 0, 0);
    return true;
  }
  // effet d'un contact du trait (dash ou Écho) sur e
  applyContact(e, kind, dashId, cause, dirA, cx, cy) {
    if (e.lastDash === dashId) return;
    e.lastDash = dashId;
    const P = this.P;
    switch (kind) {
      case K_KILL:
        if (e.type === 'noeud') { this.boss && this.boss.onNode(e, this); break; }
        if (e.type === 'boucl' && cause === CAUSE_DASH) this.rec.backKills++;
        this.emit(EV.CUT, e.x, e.y, dirA, e.uid, P.s, e.type);
        this.killEnemy(e, cause, dirA);
        break;
      case K_HIT: this.hitEnemy(e, cx, cy, 1); break;
      case K_POP: e.bubble = 0; e.bubbleT = 3; this.emit(EV.POP, e.x, e.y, 0, 0); break;
      case K_BOSS:
        if (this.boss && this.boss.onHit(e, this)) {
          P.bossHits++; this.score += 500 * P.mult; this.doHitstop(70);
          this.emit(EV.BOSS_HIT, e.x, e.y, dirA, 0, 0, e.type);
        }
        break;
    }
  }
  hitEnemy(e, cx, cy, dmg) {
    e.hp -= dmg;
    if (e.hp <= 0) { this.killEnemy(e, CAUSE_DASH, Math.atan2(e.y - cy, e.x - cx)); return; }
    const a = Math.atan2(e.y - cy, e.x - cx);
    e.kx = Math.cos(a) * 24; e.ky = Math.sin(a) * 24; e.kT = 0.12; e.stun = 0.35; e.st = 0; e.cd = Math.max(e.cd, 0.6);
    this.emit(EV.HIT_E, e.x, e.y, a, e.hp, 0, e.type);
  }
  updateDash(dt) {
    const P = this.P, pl = this.plan, pt = this.tmpPt;
    const s0 = P.s, s1 = Math.min(pl.L, P.s + P.speed * dt);
    const x0 = P.x, y0 = P.y;
    P.s = s1; pl.at(s1, pt); P.x = pt.x; P.y = pt.y;
    const seg = pt.seg, sl = pl.sl[seg]; if (sl > 0) P.dir = Math.atan2(pl.ey_[seg] - pl.sy[seg], pl.ex_[seg] - pl.sx[seg]);
    // contacts prévus (verrouillés au départ : « le trait est honnête »)
    for (let i = 0; i < pl.cN; i++) {
      if (pl.cS[i] > s1 || pl.cS[i] < s0 - 1e-6 && s0 > 0) continue;
      const e = pl.cE[i]; if (!e.on || e.uid !== pl.cUid[i] || e.hp <= 0) continue;
      this.applyContact(e, pl.cK[i], P.dashId, CAUSE_DASH, P.dir, pl.cX[i], pl.cY[i]);
    }
    // vitres
    for (let i = 0; i < pl.gN; i++) {
      if (pl.gS[i] > s1 || (pl.gS[i] < s0 && s0 > 0)) continue;
      const c = pl.gCell[i]; if (!this.arena.glassIntact(c)) continue;
      this.arena.glassT[c] = 6; this.score += 50; this.rec.glass++;
      this.emit(EV.GLASS, (c % GW) * CELL + 15, Math.floor(c / GW) * CELL + 15, 0, 0);
    }
    // balayage : ennemis entrés dans le trait pendant le dash (non prévus), balles coupées
    this.sweep(x0, y0, P.x, P.y, pl.rCut, P.dashId, CAUSE_DASH, true);
    // Sillage
    const sl2 = this.cardLv('sillage');
    if (sl2 && (P.x !== x0 || P.y !== y0)) this.addFlame(x0, y0, P.x, P.y, sl2);
    // Déchirure : la faille suit le super-dash
    if (P.superNow && this.hasEvo('dechirure')) this.addRift(x0, y0, P.x, P.y);
    if (s1 >= pl.L - 1e-6) this.arrive();
  }
  // capsule (x0,y0)→(x1,y1) de rayon rc : ennemis non prévus et balles
  sweep(x0, y0, x1, y1, rc, dashId, cause, cutBullets) {
    const dx = x1 - x0, dy = y1 - y0, l = Math.sqrt(dx * dx + dy * dy);
    if (l > 1e-6) {
      const ux = dx / l, uy = dy / l, dirA = Math.atan2(dy, dx);
      for (let i = 0; i < MAXE; i++) {
        const e = this.enemies[i]; if (!targetable(e) || e.lastDash === dashId) continue;
        if (cause === CAUSE_DASH && e.planDash === dashId) continue;
        const t = circleEntry(x0, y0, ux, uy, l, e.x, e.y, e.r + rc); if (t < 0) continue;
        const cx = x0 + ux * t, cy = y0 + uy * t;
        // ennemi entré dans le trait : mêmes règles que la planification (bouclier de face = parade)
        if (cause === CAUSE_DASH && this.blocks(e, cx, cy)) { this.parryAt(e, cx, cy); return; }
        let kind = K_KILL;
        if (e.boss) { if (e.type === 'noeud') kind = K_KILL; else if ((e.type === 'piston' || e.type === 'noyau') && !e.vuln) continue; else if (this.blocks(e, cx, cy)) continue; else kind = K_BOSS; }
        else if (e.type === 'tourelle' && !e.open) continue;
        else if (e.bubble > 0) kind = K_POP; else if (e.hp > 1) kind = K_HIT;
        this.applyContact(e, kind, dashId, cause, dirA, cx, cy);
      }
    }
    if (cutBullets) this.cutBullets(x0, y0, x1, y1, rc);
  }
  blocks(e, x, y) {
    const P = this.P;
    if (e.type === 'boucl') return !P.superNow && Math.abs(angDiff(Math.atan2(y - e.y, x - e.x), e.face)) <= 75 * Math.PI / 180 && !(this.cardLv('ricochet') >= 4 || this.hasEvo('flipper'));
    if (e.type === 'maitre') return e.shieldOn && Math.abs(angDiff(Math.atan2(y - e.y, x - e.x), e.face)) <= Math.PI / 3;
    if (e.type === 'miroir') return miroirFace(e, x, y) !== e.crack;
    return false;
  }
  parryAt(e, cx, cy) {
    const P = this.P; P.x = cx; P.y = cy; this.plan.L = P.s; this.plan.block = true; this.plan.blockE = e; this.plan.blockX = cx; this.plan.blockY = cy;
    this.arrive();
  }
  cutBullets(x0, y0, x1, y1, rc) {
    const P = this.P, par = this.cardLv('parade');
    for (let i = 0; i < MAXB; i++) {
      const b = this.bullets[i]; if (!b.on) continue;
      if (distSeg(b.x, b.y, x0, y0, x1, y1) > rc + PEARL_R) continue;
      b.on = false; this.rec.bulletsCut++; this.score += 10 * P.mult;
      this.emit(EV.BULLET_CUT, b.x, b.y, 0, 0);
      if (par && this.rngW() < CAP.paradeP[par]) this.spawnEclat(b.x, b.y, par >= 5 ? 3 : 1);
    }
  }
  spawnEclat(x, y, pierce) {
    let best = null, bd = 1e9;
    for (const e of this.enemies) { if (!targetable(e) || e.boss) continue; const d = (e.x - x) ** 2 + (e.y - y) ** 2; if (d < bd) { bd = d; best = e; } }
    const c = this.take(this.eclats); if (!c) return;
    const a = best ? Math.atan2(best.y - y, best.x - x) : this.rngW() * TAU;
    c.x = c.px = x; c.y = c.py = y; c.vx = Math.cos(a) * 420; c.vy = Math.sin(a) * 420; c.pierce = pierce; c.life = 1.2; c.hit0 = c.hit1 = c.hit2 = -1;
    this.emit(EV.ECLAT, x, y, a, 0);
  }
  arrive() {
    const P = this.P, pl = this.plan, st = this.stats;
    P.state = ST_IDLE; P.traine = st.trailInv; P.anchor = st.anchor; P.s = pl.L; P.lastArriveT = this.time; P.tourT = 0; P.tickDone = false;
    const n = P.kills;
    // parade (bouclier de face / face de miroir / Maître en garde)
    if (pl.block) {
      const bx = Math.cos(P.dir), by = Math.sin(P.dir);
      const nx = P.x - bx * 16, ny = P.y - by * 16;
      if (this.arena.standable(nx, ny)) { P.x = nx; P.y = ny; }
      if (!this.sil.noStun) { P.stun = 0.25; this.intent.on = false; }
      this.emit(EV.PARRY, pl.blockX, pl.blockY, P.dir, 0);
    }
    // Élan : remboursement si le dash a tué (et Prédateur, Coude V)
    if (n > 0) P.elan = Math.min(st.elanMax, P.elan + 1);
    const pre = this.cardLv('predateur');
    if (pre) {
      const thr = pre >= 3 ? 2 : 3;
      if (n >= thr) P.elan = Math.min(st.elanMax, P.elan + 1);
      if (pre >= 4 && n >= 5) P.elan = st.elanMax;
    }
    if (this.cardLv('coude') >= 5 && pl.n > 1 && n >= 4) P.elan = Math.min(st.elanMax, P.elan + 1);
    if (P.superNow && this.cardLv('surcharge') >= 5) P.elan = Math.min(st.elanMax, P.elan + 2);
    // score du dash (multi)
    if (P.pts > 0) {
      const mb = multiBonus(Math.max(1, n));
      const pts = Math.round(P.pts * P.mult * mb);
      this.score += pts;
      this.emit(EV.ARRIVE, P.x, P.y, n, pts, P.elite, '');
    } else this.emit(EV.ARRIVE, P.x, P.y, n, 0, 0, '');
    if (n >= 3) { this.rec.triples++; this.emit(EV.MULTI, P.x, P.y, n, 0); }
    if (this.tuto && n > 0) this.tuto.dashKills++;
    if (n > this.rec.bestMulti) this.rec.bestMulti = n;
    // hit-stop à l'arrivée seulement
    if (n > 0) this.doHitstop(Math.min(90, 30 + 10 * n) + (P.elite ? 20 : 0));
    // fenêtre de Chaîne
    P.winBonus = 0;
    if (pre >= 2 && n >= (pre >= 3 ? 2 : 3)) P.winBonus = pre >= 5 ? 0.15 : 0.1;
    if (P.chain > 0) { P.win = st.window + P.winBonus; P.winMax = P.win; }
    // ondes à l'arrivée
    const ond = this.cardLv('onde');
    if (ond) this.addBoom(P.x, P.y, CAP.ondeR[ond] * (ond >= 5 && n >= 3 ? 1.5 : 1), 0.05, 1, ond >= 4);
    if (this.sil.wave) this.addBoom(P.x, P.y, this.sil.wave, 0.0, 1, false);
    if (P.superNow && this.cardLv('surcharge') >= 3) this.addBoom(P.x, P.y, 50, 0.02, 1, false);
    // rebonds : ondes (Ricochet V / Flipper)
    if (this.hasEvo('flipper') || this.cardLv('ricochet') >= 5) {
      const r = this.hasEvo('flipper') ? CAP.ondeR[Math.max(1, ond)] : 28;
      for (let i = 1; i < pl.n; i++) if (pl.knee[i] === 2) this.addBoom(pl.sx[i], pl.sy[i], r, 0.0, 1, false);
    }
    // Écho
    const ec = this.cardLv('echo');
    if (ec) { this.addEcho(this.hasEvo('origami') ? 1.3 : CAP.echoK[ec], CAP.echoDelay[ec]); if (ec >= 4) this.addEcho(this.hasEvo('origami') ? 1.3 : CAP.echoK[ec], 0.7); }
    // chute dans une fosse
    if (pl.pit && this.arena.isPit(P.x, P.y)) this.fall();
    P.superNow = false;
    if (P.pending > 0 && P.state === ST_IDLE && this.phase !== 'dead' && !this.offer.open) this.openOffer();
    this.checkClear();
  }
  doHitstop(ms) {
    if (this.realT - this.lastHitstop < 0.2) return;
    if (this.reduced) ms = Math.min(ms, 40);
    this.lastHitstop = this.realT; this.hitstop = Math.max(this.hitstop, ms / 1000);
    this.emit(EV.HITSTOP, 0, 0, ms, 0);
  }
  startSlow(scale, hold, ret) {
    if (this.reduced) { hold /= 2; ret /= 2; }
    const s = this.slow; s.on = true; s.t = 0; s.hold = hold; s.ret = ret; s.scale = scale;
  }

  // ------------------------------------------------------------------ morts & Chaîne
  killEnemy(e, cause, dirA) {
    if (!e.on) return;
    const P = this.P, D = ENEMY[e.type];
    e.on = false; e.hp = 0;
    if (e.boss) return;
    this.qKills += e.w;
    if (e.type === 'egide') { let other = false; for (const o of this.enemies) if (o.on && o.type === 'egide') other = true; if (!other) for (const o of this.enemies) if (o.on) { o.bubble = 0; o.bubbleT = 0; } }
    const pts = D.pts * (e.elite ? 2 : 1);
    if (cause === CAUSE_BAVURE) {
      this.score += Math.round(pts * 0.5); this.rec.bavures++;
      this.emit(EV.BAVURE, e.x, e.y, dirA, 0, 0, e.type);
      this.emit(EV.KILL, e.x, e.y, dirA, 0, 2, e.type);
      return;
    }
    if (cause !== CAUSE_DASH) {
      if (P.state === ST_DASH) { if (P.cardKills >= 24) { e.on = true; e.hp = 1; this.qKills -= e.w; return; } P.cardKills++; }
      this.rec.cardKills++;
    }
    this.rec.kills++; if (e.elite) this.rec.elites++;
    // Chaîne
    if (P.chain === 0) P.chainId++;
    P.chain++; if (P.chain > P.best) P.best = P.chain;
    if (cause === CAUSE_ECHO && this.cardLv('echo') >= 3 && P.win > 0) P.win += 0.1;
    const m = multOf(P.chain);
    if (m > P.mult) { P.mult = m; if (m > this.rec.maxMult) this.rec.maxMult = m; this.emit(EV.TIER, P.x, P.y, m, 0); }
    // points : regroupés à l'arrivée pour les kills du dash (bonus multi), immédiats sinon
    if (P.state === ST_DASH) { P.pts += pts; P.kills++; if (e.elite) P.elite = 1; }
    else this.score += pts * P.mult;
    // XP (créditée à l'arrivée des mots d'XP, 0,4 s)
    const q = this.take(this.xpQ); if (q) { q.t = 0.4; q.amt = D.xp * (e.elite ? 3 : 1) * this.stats.xpK; }
    this.emit(EV.KILL, e.x, e.y, dirA, P.state === ST_DASH ? P.kills : 0, cause, e.type);
    if (this.tuto) this.tuto.kills++;
    // effets de cartes déclenchés par un kill
    const ecl = this.cardLv('eclatement');
    if (ecl) this.addBoom(e.x, e.y, CAP.eclatR[ecl], 0.08, 2, false);
    if (this.hasEvo('incendie') && this.inFlame(e.x, e.y)) this.addFireRing(e.x, e.y);
    const li = this.cardLv('lien');
    if (li && cause !== 4) this.lien(e.x, e.y, CAP.lienR[li], CAP.lienJ[li]);
  }
  breakChain() {
    const P = this.P;
    if (P.chain >= 5) this.emit(EV.CHAIN_BREAK, P.x, P.y, P.chain, 0);
    P.chain = 0; P.mult = 1; P.win = 0; P.chainDashes = 0;
  }
  lien(x, y, R, jumps) {
    let cx = x, cy = y;
    for (let j = 0; j < jumps; j++) {
      let best = null, bd = R * R;
      for (const e of this.enemies) { if (!targetable(e) || e.boss || (e.type === 'tourelle' && !e.open)) continue; const d = (e.x - cx) ** 2 + (e.y - cy) ** 2; if (d <= bd) { bd = d; best = e; } }
      if (!best) return;
      this.emit(EV.LIEN, cx, cy, best.x, best.y);
      const bx = best.x, by = best.y;
      if (best.bubble > 0) { best.bubble = 0; best.bubbleT = 3; return; }
      if (best.hp > 1) { this.hitEnemy(best, cx, cy, 1); return; }
      this.killEnemy(best, 4, Math.atan2(by - cy, bx - cx));
      cx = bx; cy = by;
    }
  }

  // ------------------------------------------------------------------ effets de cartes
  // kind 1 onde (repousse), 2 éclatement, 3 seconde chance, 4 anneau de feu
  addBoom(x, y, r, delay, kind, cut) {
    const b = this.take(this.booms); if (!b) return;
    b.x = x; b.y = y; b.r = r; b.t = delay; b.kind = kind; b.cut = cut; b.colosse = kind === 2 && this.cardLv('eclatement') >= 5;
  }
  updateBooms(dt) {
    for (const b of this.booms) {
      if (!b.on) continue;
      b.t -= dt; if (b.t > 0) continue;
      b.on = false;
      this.emit(b.kind === 2 ? EV.BOOM : EV.WAVE, b.x, b.y, b.r, b.kind);
      const r2 = b.r;
      for (const e of this.enemies) {
        if (!targetable(e) || e.boss || (e.type === 'tourelle' && !e.open)) continue;
        const dx = e.x - b.x, dy = e.y - b.y, d = Math.sqrt(dx * dx + dy * dy);
        if (d > r2 + e.r) continue;
        if (e.bubble > 0) { e.bubble = 0; e.bubbleT = 3; continue; }
        if (e.hp <= 1) this.killEnemy(e, CAUSE_CARD, Math.atan2(dy, dx));
        else if (b.colosse || b.kind === 3) this.hitEnemy(e, b.x, b.y, 1);
        else if (b.kind === 1) { const a = Math.atan2(dy, dx); e.kx = Math.cos(a) * 30; e.ky = Math.sin(a) * 30; e.kT = 0.12; }
      }
      if (b.cut || b.kind === 3) for (const q of this.bullets) if (q.on && (q.x - b.x) ** 2 + (q.y - b.y) ** 2 <= b.r * b.r) { q.on = false; this.rec.bulletsCut++; this.emit(EV.BULLET_CUT, q.x, q.y, 0, 0); }
    }
  }
  addFlame(x0, y0, x1, y1, lvl) {
    const f = this.take(this.flames) || this.oldestFlame();
    f.on = true; f.x0 = x0; f.y0 = y0; f.x1 = x1; f.y1 = y1; f.life = CAP.sillageLife[lvl]; f.t = 0; f.w = CAP.sillageW[lvl] * (this.hasEvo('incendie') ? 1.5 : 1); f.ring = false; f.r = 0;
  }
  addRift(x0, y0, x1, y1) {
    const f = this.take(this.flames) || this.oldestFlame();
    f.on = true; f.x0 = x0; f.y0 = y0; f.x1 = x1; f.y1 = y1; f.life = 2; f.t = 0; f.w = 14; f.ring = false; f.r = -1; f.id = ++this.dashC;
  }
  addFireRing(x, y) { const f = this.take(this.flames) || this.oldestFlame(); f.on = true; f.x0 = f.x1 = x; f.y0 = f.y1 = y; f.life = 1.5; f.t = 0; f.w = 0; f.ring = true; f.r = 30; }
  oldestFlame() { let o = this.flames[0]; for (const f of this.flames) if (f.t / f.life > o.t / o.life) o = f; return o; }
  inFlame(x, y) { for (const f of this.flames) if (f.on && !f.ring && f.r >= 0 && distSeg(x, y, f.x0, f.y0, f.x1, f.y1) <= f.w / 2 + 4) return true; return false; }
  updateFlames(dt) {
    const lvl = this.cardLv('sillage');
    for (const f of this.flames) {
      if (!f.on) continue;
      f.t += dt; if (f.t >= f.life) { f.on = false; continue; }
      for (const e of this.enemies) {
        if (!targetable(e) || (e.type === 'tourelle' && !e.open)) continue;
        if (e.boss) {
          if (f.r === -1 && e.type !== 'noeud' && e.lastDash !== f.id && (e.vuln || e.type === 'maitre' || e.type === 'miroir')) {
            if (distSeg(e.x, e.y, f.x0, f.y0, f.x1, f.y1) <= f.w / 2 + e.r) this.applyContact(e, K_BOSS, f.id, CAUSE_CARD, 0, e.x, e.y);
          }
          continue;
        }
        const d = f.ring ? Math.hypot(e.x - f.x0, e.y - f.y0) - f.r : distSeg(e.x, e.y, f.x0, f.y0, f.x1, f.y1) - f.w / 2;
        if (d > e.r) continue;
        if (e.bubble > 0) { e.bubble = 0; e.bubbleT = 3; continue; }
        if (e.hp <= 1 || f.r === -1) this.killEnemy(e, CAUSE_CARD, 0);
        else if (e.flameCd <= 0) { e.flameCd = 0.5; this.hitEnemy(e, f.x0, f.y0, 1); }
      }
      if (lvl >= 5 && !f.ring) for (const q of this.bullets) if (q.on && distSeg(q.x, q.y, f.x0, f.y0, f.x1, f.y1) <= f.w / 2 + PEARL_R) { q.on = false; this.rec.bulletsCut++; this.emit(EV.BULLET_CUT, q.x, q.y, 0, 0); }
    }
  }
  addEcho(k, delay) {
    const E = this.take(this.echoes); if (!E) return;
    E.plan.copyFrom(this.plan); E.t = delay; E.s = 0; E.k = k; E.id = ++this.dashC; E.speed = this.P.speed; E.x = E.px = this.plan.ox; E.y = E.py = this.plan.oy;
  }
  updateEchoes(dt) {
    const pt = this.tmpPt;
    for (const E of this.echoes) {
      if (!E.on) continue;
      if (E.t > 0) { E.t -= dt; if (E.t <= 0) this.emit(EV.ECHO, E.plan.ox, E.plan.oy, 0, 0); continue; }
      const s1 = Math.min(E.plan.L, E.s + E.speed * dt);
      E.px = E.x; E.py = E.y;
      E.plan.at(s1, pt); E.x = pt.x; E.y = pt.y; E.s = s1;
      this.sweep(E.px, E.py, E.x, E.y, this.stats.rCut * E.k, E.id, CAUSE_ECHO, false);
      if (s1 >= E.plan.L - 1e-6) E.on = false;
    }
  }
  updateEclats(dt) {
    for (const c of this.eclats) {
      if (!c.on) continue;
      c.px = c.x; c.py = c.y; c.x += c.vx * dt; c.y += c.vy * dt; c.life -= dt;
      if (c.life <= 0 || c.x < 0 || c.y < 0 || c.x > AW || c.y > AH || this.arena.solidBullet(Math.floor(c.x / CELL), Math.floor(c.y / CELL))) { c.on = false; continue; }
      for (const e of this.enemies) {
        if (!targetable(e) || e.boss || (e.type === 'tourelle' && !e.open)) continue;
        if (e.uid === c.hit0 || e.uid === c.hit1 || e.uid === c.hit2) continue;
        if (distSeg(e.x, e.y, c.px, c.py, c.x, c.y) > e.r + 3) continue;
        if (e.bubble > 0) { e.bubble = 0; e.bubbleT = 3; } else if (e.hp > 1) this.hitEnemy(e, c.x, c.y, 1); else this.killEnemy(e, CAUSE_CARD, Math.atan2(c.vy, c.vx));
        if (c.hit0 < 0) c.hit0 = e.uid; else if (c.hit1 < 0) c.hit1 = e.uid; else c.hit2 = e.uid;
        c.pierce--; if (c.pierce <= 0) { c.on = false; break; }
      }
    }
  }
  updateTourbillon(dt) {
    const lv = this.cardLv('tourbillon'), P = this.P; if (!lv || P.state !== ST_IDLE) return;
    P.tourT += dt; if (P.tourT < 0.1) return;
    const mir = this.hasEvo('miroir');
    P.tourA += 9.4248 * dt; // 540°/s
    const n = CAP.tourN[lv], R = CAP.tourR[lv], br = mir ? 12 : 6;
    for (let k = 0; k < n; k++) {
      const a = P.tourA + k * TAU / n, bx = P.x + Math.cos(a) * R, by = P.y + Math.sin(a) * R;
      for (const e of this.enemies) {
        if (!targetable(e) || e.boss || (e.type === 'tourelle' && !e.open)) continue;
        if ((e.x - bx) ** 2 + (e.y - by) ** 2 > (e.r + br) ** 2) continue;
        if (e.bubble > 0) { e.bubble = 0; e.bubbleT = 3; continue; }
        if (e.hp > 1) { if (e.flameCd <= 0) { e.flameCd = 0.5; this.hitEnemy(e, P.x, P.y, 1); } } else this.killEnemy(e, CAUSE_CARD, a);
      }
      if (lv >= 2 || mir) for (const q of this.bullets) {
        if (!q.on || (q.x - bx) ** 2 + (q.y - by) ** 2 > (br + PEARL_R) ** 2) continue;
        q.on = false; this.rec.bulletsCut++; this.emit(EV.BULLET_CUT, q.x, q.y, 0, 0);
        if (mir) this.spawnEclat(q.x, q.y, 3);
      }
    }
  }

  // ------------------------------------------------------------------ joueur touché
  vulnerable() {
    const P = this.P;
    if (this.invincible || P.state !== ST_IDLE || P.traine > 0 || P.inv > 0 || this.offer.open || this.reprise > 0) return false;
    if (this.phase === 'clear' || this.phase === 'bossIntro' || this.phase === 'won' || this.phase === 'dead') return false;
    return true;
  }
  hurt(src) {
    if (!this.vulnerable()) return false;
    const P = this.P;
    if (P.voile) { P.voile = false; P.inv = 0.5; this.emit(EV.VOILE, P.x, P.y, 0, 0); return false; }
    P.arenaHit = true; P.bossHit = true; this.rec.hits++;
    if (!this.tuto) P.hp--;
    this.breakChain();
    P.inv = 1.0; P.elan = this.stats.elanMax; P.elanT = 0;
    this.doHitstop(70); this.startSlow(0.3, 0.25, 0.2);
    this.emit(EV.HURT, P.x, P.y, P.hp, 0);
    if (P.hp <= 0) this.die();
    return true;
  }
  die() {
    const P = this.P;
    if (this.at.secondeChance > 0 && !P.revived) {
      P.revived = true; P.hp = 1; P.inv = 1.5;
      this.addBoom(P.x, P.y, 120, 0, 3, true);
      this.emit(EV.REVIVE, P.x, P.y, 0, 0);
      return;
    }
    P.state = ST_DEAD; this.phase = 'dead'; this.phaseT = 0; P.deathT = 0;
    this.startSlow(0.2, 0.6, 0.01);
    this.emit(EV.DEATH, P.x, P.y, 0, 0);
  }
  fall() {
    const P = this.P;
    P.state = ST_FALL; P.fallT = 0.4; P.fallX = P.dashSX; P.fallY = P.dashSY;
    this.breakChain();
    if (!this.tuto && !this.invincible) P.hp--;
    P.arenaHit = true; P.bossHit = true; this.rec.hits++;
    this.emit(EV.FALL, P.x, P.y, P.hp, 0);
    if (P.hp <= 0) { P.state = ST_IDLE; this.die(); }
  }
  // Instinct (Atelier) : ralenti ×0,35 pendant 0,3 s si une attaque va toucher dans 0,2 s
  instinct() {
    const P = this.P, lv = this.at.instinct;
    if (!lv || P.instinctCd > 0 || !this.vulnerable()) return;
    P.instinctCd = [0, 12, 10, 8, 6][lv];
    this.startSlow(0.35, 0.3, 0.05);
    this.emit(EV.INSTINCT, P.x, P.y, 0, 0);
  }
  threatCheckLine(x, y, a, len, w) { const P = this.P; if (distSeg(P.x, P.y, x, y, x + Math.cos(a) * len, y + Math.sin(a) * len) < w + RP) this.instinct(); }
  threatCheckLane(x, y, a, len, w) { const P = this.P; if (distSeg(P.x, P.y, x, y, x + Math.cos(a) * len, y + Math.sin(a) * len) < w) this.instinct(); }
  fireShell(x0, y0, tx, ty) {
    const s = this.take(this.shells); if (!s) return false;
    s.x0 = x0; s.y0 = y0; s.tx = tx; s.ty = ty; s.t = 0; s.dur = 1.0; s.r = 34; return true;
  }

  // ------------------------------------------------------------------ cartes (§9.2)
  openOffer() {
    const o = this.offer, n = this.at.eventail > 0 ? 4 : 3;
    o.ids = drawOffer({ lv: this.lv, evo: this.evo, unlocked: this.unlocked }, this.rngC, n);
    o.open = true; o.t = 0; o.start = false;
    if (o.rerolls === undefined || !this._rerollInit) { o.rerolls = this.at.relance; this._rerollInit = true; }
    this.emit(EV.OFFER, 0, 0, o.ids.length, this.P.pending, 0);
  }
  openStartOffer() {
    const o = this.offer, commons = this.unlocked.filter(id => CARDS[id] && CARDS[id].rar === 'C');
    const ids = [];
    while (ids.length < 3 && commons.length) { const i = Math.floor(this.rngC() * commons.length); ids.push(commons.splice(i, 1)[0]); }
    o.ids = ids; o.open = true; o.t = 0; o.start = true; o.rerolls = this.at.relance; this._rerollInit = true;
    this.emit(EV.OFFER, 0, 0, ids.length, 0, 0);
  }
  reroll() {
    const o = this.offer; if (!o.open || o.rerolls <= 0 || o.start) return false;
    o.rerolls--; o.ids = drawOffer({ lv: this.lv, evo: this.evo, unlocked: this.unlocked }, this.rngC, o.ids.length); o.t = 0;
    return true;
  }
  chooseCard(i) {
    const o = this.offer; if (!o.open || i < 0 || i >= o.ids.length) return false;
    const id = o.ids[i];
    this.addCard(id);
    this.emit(EV.CARD, this.P.x, this.P.y, i, 0, 0, id);
    o.open = false;
    if (!o.start) this.P.pending = Math.max(0, this.P.pending - 1);
    if (this.P.pending > 0) this.openOffer();
    else { this.reprise = 0.6; }
    return true;
  }
  addXp(a) {
    const P = this.P;
    P.xp += a;
    while (P.xp >= xpNeed(P.level)) { P.xp -= xpNeed(P.level); P.level++; P.pending++; this.emit(EV.LEVEL, P.x, P.y, P.level, 0); }
  }

  // ------------------------------------------------------------------ fin d'arène
  checkClear() {
    if (this.phase !== 'arena') return;
    if (this.qKills < this.quota - 1e-6) return;
    for (const e of this.enemies) if (e.on) return;
    for (const g of this.teles) if (g.on) return;
    this.phase = 'clear'; this.phaseT = 0; this.rec.arenasCleared++;
    const par = this.quota * 1.4, t = this.arenaT;
    const bonus = Math.round(1000 * Math.max(0, (par - t) / par) / 10) * 10;
    this.score += bonus;
    const noHit = !this.P.arenaHit; if (noHit) { this.score += 500; this.rec.noHitArenas++; }
    this.startSlow(0.4, 0.3, 0.05);
    this.emit(EV.ARENA_CLEAR, this.P.x, this.P.y, bonus, noHit ? 1 : 0, this.arenaIdx);
    this.emit(EV.BANNER, 0, 0, 1, 0, 0, 'ARÈNE NETTOYÉE');
  }
  chainFrozen() {
    return this.offer.open || this.reprise > 0 || this.phase === 'clear' || this.phase === 'bossIntro' || this.countdown > 0 ||
      (this.aiming && this.hasEvo('tempsSuspendu'));
  }

  // ------------------------------------------------------------------ Prologue (§14)
  startPrologue() {
    this.arena.load(MAPS.L1, false, 'L1'); this.arenaIdx = 1;
    this.placePlayer(); this.P.inv = 0.5;
    this.phase = 'prologue'; this.tuto = { step: 0, kills: 0, dashKills: 0, t: 0, done: false };
    this.quota = 1e9; this.qKills = 0;
    this.tutoStep(1);
  }
  tutoStep(n) {
    const T = this.tuto; T.step = n; T.kills = 0; T.dashKills = 0; T.t = 0;
    for (const e of this.enemies) e.on = false;
    const P = this.P, sp = (type, x, y, stat) => { const e = this.spawnEnemy(type, x, y, false); if (e) { e.static = stat; e.noFire = 1.2; } return e; };
    if (n === 1) { for (let i = 0; i < 3; i++) sp('pion', 135 + i * 45, 300, true); }
    else if (n === 2) { for (let i = 0; i < 3; i++) sp('pion', 70 + i * 22, 250 - i * 22, true); for (let i = 0; i < 3; i++) sp('pion', 230 + i * 22, 190 + i * 22, true); }
    else if (n === 3) { for (let i = 0; i < 4; i++) { const e = sp('pion', 60 + i * 80, 90, false); if (e) e.spd = 0.35; } }
    else if (n === 4) { const e = sp('tireur', 180, 120, false); if (e) { e.cd = 1.5; e.noFire = 1.0; } }
    this.emit(EV.TUTO, P.x, P.y, n, 0);
  }
  updatePrologue() {
    const T = this.tuto, P = this.P;
    T.t += STEP;
    const alive = this.aliveCount();
    if (T.step === 1 && T.kills >= 1 && P.state === ST_IDLE) { if (alive === 0 || T.t > 0.3) this.tutoStep(2); }
    else if (T.step === 2 && T.dashKills >= 2 && P.state === ST_IDLE) this.tutoStep(3);
    else if (T.step === 3 && (P.chain >= 6 || (alive === 0 && P.state === ST_IDLE))) {
      if (alive === 0 && P.chain < 6) this.tutoStep(3); else this.tutoStep(4);
    }
    else if (T.step === 4 && alive === 0 && P.state === ST_IDLE) this.endPrologue();
  }
  endPrologue() {
    this.tuto = null;
    for (const e of this.enemies) e.on = false;
    this.clearField(false);
    this.P.chain = 0; this.P.mult = 1; this.P.win = 0; this.P.chainDashes = 0;
    this.loadArena(1);
    this.emit(EV.BANNER, 0, 0, 0, 0, 0, 'ARÈNE 1');
    if (this.at.departArme > 0) this.openStartOffer();
  }
  skipPrologue() { if (this.tuto) this.endPrologue(); }

  // ------------------------------------------------------------------ horloge (temps réel → pas fixes)
  timeScale(rdt) {
    let k = 1;
    if (this.offer.open) { this.offer.t += rdt; return 0.08; }
    if (this.reprise > 0) { this.reprise -= rdt; k = 0.08 + 0.92 * (1 - Math.max(0, this.reprise) / 0.6); }
    if (this.countdown > 0) { this.countdown -= rdt; return 0; }
    const s = this.slow;
    if (s.on) {
      s.t += rdt;
      if (s.t < s.hold) k = Math.min(k, s.scale);
      else if (s.t < s.hold + s.ret) k = Math.min(k, s.scale + (1 - s.scale) * (s.t - s.hold) / s.ret);
      else s.on = false;
    }
    const cl = this.cardLv('concentration');
    if (cl && this.aiming) {
      const evo = this.hasEvo('tempsSuspendu'), maxT = evo ? 1.2 : CAP.concT[cl];
      if (this.concUsed < maxT) { this.concUsed += rdt; k = Math.min(k, evo ? 0.15 : CAP.concK[cl]); }
    } else if (!this.aiming) this.concUsed = 0;
    return k;
  }
  // rdt : temps réel écoulé (s), plafonné à 50 ms
  frame(rdt) {
    rdt = Math.min(0.05, Math.max(0, rdt));
    this.realT += rdt;
    let k;
    if (this.hitstop > 0) { this.hitstop -= rdt; k = 0; } else k = this.timeScale(rdt);
    this.k = k;
    const I = this.intent;
    if (I.on) { I.age += rdt; if (I.age > GESTURE.bufferAge) I.on = false; }
    this.acc += rdt * k;
    let n = 0;
    while (this.acc >= STEP && n < 4) { this.step(STEP); this.acc -= STEP; n++; }
    if (n === 4) this.acc = 0;
    this.alpha = this.acc / STEP;
    // pré-visée/intention : exécutée « au prochain pas » même au ralenti (un pas supplémentaire n'est pas forcé)
    return n;
  }
  resumeCountdown(t) { this.countdown = t; }

  // ------------------------------------------------------------------ pas de simulation
  rebuildGrid() {
    const g = this.grid; g.count.fill(0);
    for (let i = 0; i < MAXE; i++) { const e = this.enemies[i]; if (!e.on) continue; const c = this.cellIdx(e.x, e.y); g.count[c]++; }
    let s = 0; for (let c = 0; c < GW * GH; c++) { g.start[c] = s; s += g.count[c]; } g.start[GW * GH] = s;
    g.fill.set(g.start.subarray(0, GW * GH));
    for (let i = 0; i < MAXE; i++) { const e = this.enemies[i]; if (!e.on) continue; const c = this.cellIdx(e.x, e.y); g.items[g.fill[c]++] = i; }
  }
  // champ de flux vers la case du joueur (BFS, 8 voisins sans couper les coins), recalculé au changement de case
  updateFlow() {
    const P = this.P, c0 = this.cellIdx(P.x, P.y);
    this.flowT -= STEP;
    if (c0 === this.flowCell && this.flowT > 0) return;
    this.flowCell = c0; this.flowT = 0.5;
    const D = this.flowDist, N = this.flowNext, Q = this.flowQ, A = this.arena;
    D.fill(-1); N.fill(-1);
    let h = 0, t = 0; D[c0] = 0; Q[t++] = c0;
    while (h < t) {
      const c = Q[h++], cx = c % GW, cy = (c / GW) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= GW || ny >= GH || A.solidEnemy(nx, ny)) continue;
        if (dx && dy && (A.solidEnemy(cx + dx, cy) || A.solidEnemy(cx, cy + dy))) continue;
        const n = ny * GW + nx; if (D[n] >= 0) continue;
        D[n] = D[c] + 1; N[n] = c; Q[t++] = n;
      }
    }
  }
  cellIdx(x, y) { let cx = Math.floor(x / CELL), cy = Math.floor(y / CELL); cx = cx < 0 ? 0 : cx >= GW ? GW - 1 : cx; cy = cy < 0 ? 0 : cy >= GH ? GH - 1 : cy; return cy * GW + cx; }

  step(dt) {
    const P = this.P, st = this.stats;
    this.time += dt; this.phaseT += dt;
    P.px = P.x; P.py = P.y;
    for (let i = 0; i < MAXE; i++) { const e = this.enemies[i]; if (e.on) { e.px = e.x; e.py = e.y; } }
    for (let i = 0; i < MAXB; i++) { const b = this.bullets[i]; if (b.on) { b.px = b.x; b.py = b.y; } }
    this.rebuildGrid();
    this.updateFlow();
    // --- phases
    if (this.phase === 'dead') { P.deathT += dt; if (this.phaseT > 0.12) this.over = true; this.updateWorld(dt, true); return; }
    if (this.phase === 'won') { if (this.phaseT > 0.6) this.over = true; return; }
    if (this.phase === 'clear') {
      if (this.phaseT >= 0.7 && !this._loaded) {
        this._loaded = true;
        this.clearField(true);
        if (this.arenaIdx >= 6) this.loadBoss(); else { this.loadArena(this.arenaIdx + 1); this.phase = 'clear'; this.phaseT = 0.7; }
        if (P.pending > 0 && !this.offer.open) this.openOffer();
      }
      if (this.phaseT >= 1.2 && this.phase === 'clear') { this.phase = 'arena'; this._loaded = false; this.emit(EV.BANNER, 0, 0, 0, 0, 0, 'ARÈNE ' + this.arenaIdx); }
      if (this.phase === 'bossIntro') this._loaded = false;
    }
    if (this.phase === 'bossIntro' && this.phaseT >= 1.4) { this.phase = 'boss'; this.phaseT = 0; this.bossT0 = this.time; P.bossHit = false; }
    // --- timers joueur
    if (P.inv > 0) P.inv -= dt;
    if (P.traine > 0) P.traine -= dt;
    if (P.anchor > 0) P.anchor -= dt;
    if (P.stun > 0) P.stun -= dt;
    if (P.instinctCd > 0) P.instinctCd -= dt;
    if (P.state === ST_FALL) { P.fallT -= dt; if (P.fallT <= 0) { P.state = ST_IDLE; P.x = P.px = P.fallX; P.y = P.py = P.fallY; P.inv = 1.0; } }
    if (P.state !== ST_DASH && P.elan < st.elanMax) { P.elanT += dt; if (P.elanT >= st.regen) { P.elan++; P.elanT = 0; } } else if (P.elan >= st.elanMax) P.elanT = 0;
    if (P.state === ST_IDLE && P.chain > 0 && !this.chainFrozen()) {
      P.win -= dt;
      if (P.win <= 0.15 && !P.tickDone) { P.tickDone = true; this.emit(EV.WINDOW_TICK, P.x, P.y, 0, 0); }
      if (P.win <= 0) this.breakChain();
    }
    if (P.state === ST_IDLE) P.idleT += dt;
    // XP
    for (const q of this.xpQ) if (q.on) { q.t -= dt; if (q.t <= 0) { q.on = false; this.addXp(q.amt); } }
    // --- intention de dash, puis dash
    this.processIntent();
    if (P.state === ST_DASH) this.updateDash(dt);
    this.updateWorld(dt, false);
    // --- phases (suite)
    if (this.phase === 'prologue') this.updatePrologue();
    else if (this.phase === 'arena') { this.updateDirector(dt); this.checkClear(); }
    else if (this.phase === 'boss' && this.boss) { this.boss.update(dt, this); if (this.boss.dead) this.bossKilled(); }
  }
  updateWorld(dt, dying) {
    const P = this.P;
    this.arena.update(dt, P.x, P.y);
    this.updateTeles(dt);
    for (let i = 0; i < MAXE; i++) {
      const e = this.enemies[i]; if (!e.on) continue;
      if (e.flameCd > 0) e.flameCd -= dt;
      if (e.bubbleT > 0) e.bubbleT -= dt;
      if (e.boss) continue;
      updateEnemy(this, e, dt);
    }
    // bulles d'Égide qui disparaissent hors aura
    // balles
    for (let i = 0; i < MAXB; i++) {
      const b = this.bullets[i]; if (!b.on) continue;
      b.age += dt; b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.x < 0 || b.y < 0 || b.x > AW || b.y > AH || this.arena.solidBullet(Math.floor(b.x / CELL), Math.floor(b.y / CELL))) { b.on = false; continue; }
      if (!dying && distSeg(P.x, P.y, b.px, b.py, b.x, b.y) < PEARL_R + RP) { if (this.vulnerable()) { b.on = false; this.hurt(null); } }
    }
    // obus de mortier
    for (const s of this.shells) {
      if (!s.on) continue;
      s.t += dt;
      if (s.t >= s.dur - 0.2 && s.t - dt < s.dur - 0.2 && (P.x - s.tx) ** 2 + (P.y - s.ty) ** 2 < (s.r + RP) ** 2) this.instinct();
      if (s.t >= s.dur) { s.on = false; this.emit(EV.SHELL, s.tx, s.ty, s.r, 0); if (!dying && (P.x - s.tx) ** 2 + (P.y - s.ty) ** 2 < (s.r + RP) ** 2) this.hurt(null); }
    }
    // lignes de boss (télégraphes, rayons, lignes persistantes)
    for (const l of this.lines) {
      if (!l.on) continue;
      l.t += dt;
      if (l.t < 0) continue;
      if (l.t >= l.tele + l.life) { l.on = false; continue; }
      if (l.t >= l.tele && !dying && distSeg(P.x, P.y, l.x0, l.y0, l.x1, l.y1) < l.w / 2 + RP) this.hurt(null);
      if (l.t < l.tele && l.t + dt >= l.tele - 0.2 && distSeg(P.x, P.y, l.x0, l.y0, l.x1, l.y1) < l.w / 2 + RP) this.instinct();
    }
    this.updateBooms(dt);
    this.updateFlames(dt);
    this.updateEchoes(dt);
    this.updateEclats(dt);
    this.updateTourbillon(dt);
    // contact des corps
    if (!dying && P.state === ST_IDLE) {
      for (let i = 0; i < MAXE; i++) {
        const e = this.enemies[i]; if (!e.on || e.born > 0 || !e.touch || e.hp <= 0) continue;
        if (e.type === 'tourelle') continue;
        const rr = e.r + RP;
        if ((e.x - P.x) ** 2 + (e.y - P.y) ** 2 < rr * rr) { this.hurt(e); break; }
      }
    }
    // Chargeur en charge
  }
  addLine(kind, x0, y0, x1, y1, w, tele, life, delay = 0) {
    const l = this.take(this.lines); if (!l) return null;
    l.kind = kind; l.x0 = x0; l.y0 = y0; l.x1 = x1; l.y1 = y1; l.w = w; l.t = -delay; l.tele = tele; l.life = life;
    return l;
  }
  bossKilled() {
    const P = this.P;
    this.rec.bossKilled = true; this.rec.bossTime = this.time - this.bossT0; this.rec.bossNoHit = !P.bossHit;
    const T = BOSSES[this.Z.boss].T;
    const bonus = Math.round(3000 * Math.max(0, (T - this.rec.bossTime) / T));
    this.score += bonus;
    this.victory = true;
    this.clearField(true);
    this.phase = 'won'; this.phaseT = 0;
    this.startSlow(0.25, 0.6, 0.01);
    this.emit(EV.BOSS_DEAD, this.boss.x, this.boss.y, bonus, 0);
    this.emit(EV.BANNER, 0, 0, 3, 0, 0, 'ZONE NETTOYÉE');
  }

  // ------------------------------------------------------------------ résultat (méta)
  result() {
    const P = this.P, b = this.boss;
    return {
      zone: this.zone, tension: this.tension, sil: this.sil.id, victory: this.victory,
      arenaReached: this.rec.reached, bossEntailles: b ? b.done() : 0, bossTotal: b ? b.total : 0,
      score: Math.round(this.score), bestChain: P.best, bestMulti: this.rec.bestMulti, kills: this.rec.kills, elites: this.rec.elites,
      arenasCleared: this.rec.arenasCleared, bossKilled: this.rec.bossKilled, bossTime: this.rec.bossTime, bossNoHit: this.rec.bossKilled && this.rec.bossNoHit,
      level: P.level, cards: this.cardOrder.map(id => ({ id, lv: this.lv[id], evo: EVO_IDS.find(e => this.evo[e] && EVOLUTIONS[e].a === id) || null })),
      evolutions: this.rec.evolutions.slice(), bulletsCut: this.rec.bulletsCut, bavures: this.rec.bavures, glass: this.rec.glass,
      backKills: this.rec.backKills, cardKills: this.rec.cardKills, triples: this.rec.triples, noHitArenas: this.rec.noHitArenas,
      maxMult: this.rec.maxMult, dashes: this.rec.dashes, hits: this.rec.hits, duration: this.time, butinLv: this.cardLv('butin'),
      daily: !!this.daily, prologue: !!this.cfg.prologue,
    };
  }
}
