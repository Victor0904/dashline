// Bot joueur (GAME_DESIGN §15) : à chaque fin d'ancrage, évalue ~48 directions × 3 longueurs + les cibles directes
// avec la MÊME planification que la ligne de visée (kills prévus, parade, menace à l'arrivée), après un temps de
// réaction de 0,12–0,30 s selon la compétence, avec une erreur de visée. Sert aussi de démo sur l'écran titre.
import { RP, AW, AH, PEARL_R, GESTURE } from '../core/data.js';
import { mulberry32 } from '../core/rng.js';
import { Plan, K_KILL, K_HIT, K_BOSS, targetable } from './plan.js';
import { distSeg } from './enemies.js';
import { CARDS } from '../core/cards.js';

const TAU = Math.PI * 2;
const PRIO = ['eclatement', 'onde', 'sillage', 'tourbillon', 'lien', 'echo', 'parade', 'predateur', 'ricochet', 'surcharge', 'portee', 'tranchant',
  'sangFroid', 'souffle', 'garde', 'fantome', 'coude', 'velocite', 'concentration', 'butin'];

export class Bot {
  // skill 0..1 (0,4 / 0,55 / 0,7) ; react : temps de réaction (s) ; aimErr : erreur angulaire (°, écart-type)
  constructor(sim, o = {}) {
    this.sim = sim; this.skill = o.skill ?? 0.55;
    const k = Math.max(0, Math.min(1, (this.skill - 0.4) / 0.3));
    this.react = o.react ?? (0.30 - 0.18 * k);
    this.aimErr = o.aimErr ?? (16 - 9 * k); // précision : écart-type de l'erreur angulaire (0,4 → 16°, 0,55 → 11,5°, 0,7 → 7°)
    this.rng = mulberry32((o.seed ?? 7) >>> 0);
    this.think = -1; this.plan = new Plan(); this.best = new Plan(); this.vec = new Float32Array(2);
    this.offerT = 0; this.waitT = 0; this.stats = { decisions: 0, dashes: 0 };
    this.cardPref = o.cardPref || PRIO;
  }
  gauss() { let u = 0, v = 0; while (u === 0) u = this.rng(); v = this.rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v); }

  update(rdt) {
    const sim = this.sim, P = sim.P;
    if (sim.over) return;
    if (sim.offer.open) {
      this.offerT += rdt;
      if (this.offerT > 0.45 + this.rng() * 0.4) { sim.chooseCard(this.pickCard(sim.offer.ids)); this.offerT = 0; }
      return;
    }
    if (sim.tuto && sim.time > 40) sim.skipPrologue();
    if (!sim.canDash()) { if (P.state !== 0) this.think = -1; return; }
    if (this.think < 0) this.think = this.react * (0.75 + this.rng() * 0.5);
    this.think -= rdt;
    if (this.think > 0) return;
    this.decide();
  }

  pickCard(ids) {
    let best = 0, bs = -1e9;
    // un joueur ne choisit pas toujours la carte optimale : bruit proportionnel au manque de compétence
    const noise = 70 * (1 - this.skill);
    ids.forEach((id, i) => {
      let s = 0;
      if (id.startsWith('evo:')) s = 1000;
      else if (id === 'reparation') s = -10 + (this.sim.P.hp < this.sim.P.hpMax ? 50 : 0);
      else { const r = this.cardPref.indexOf(id); s = 100 - (r < 0 ? 50 : r * 4) + (this.sim.lv[id] ? 12 : 0); if (id === 'garde' && this.sim.P.hp < 2) s += 60; }
      s += (this.rng() - 0.5) * noise * (id.startsWith('evo:') ? 0 : 1);
      if (s > bs) { bs = s; best = i; }
    });
    return best;
  }

  // danger à la position (x, y) dans les ~0,45 s suivant l'arrivée (hors ennemis tués par le trait)
  danger(x, y, pl) {
    const sim = this.sim; let d = 0;
    for (const e of sim.enemies) {
      if (!e.on || e.gone || e.hp <= 0) continue;
      let killed = false; if (pl) for (let i = 0; i < pl.cN; i++) if (pl.cE[i] === e && pl.cK[i] === K_KILL) { killed = true; break; }
      if (killed) continue;
      const dist = Math.hypot(e.x - x, e.y - y) - e.r - RP;
      // distance parcourue par un poursuivant pendant l'immobilité qui suit l'arrivée (ancrage + réaction ≈ 0,4 s)
      const reach = e.type === 'mouch' ? 58 : e.type === 'pion' ? 42 : e.type === 'charg' ? 28 : 20;
      if (e.touch && dist < reach) d += (reach - dist) * 2.5;
      switch (e.type) {
        case 'charg': if (e.st === 1 || e.st === 2) { const L = e.lane || 300; if (distSeg(x, y, e.lx, e.ly, e.lx + Math.cos(e.lockA) * L, e.ly + Math.sin(e.lockA) * L) < 14 + RP + 6) d += 120; } else if (e.cd < 0.6 && Math.hypot(e.x - x, e.y - y) < 230) d += 8; break;
        case 'lancier': if (e.st >= 1) { const L = e.lane || 600; if (distSeg(x, y, e.x, e.y, e.x + Math.cos(e.lockA) * L, e.y + Math.sin(e.lockA) * L) < 4 + RP + 8) d += 120; } break;
        case 'colosse': if (e.st === 1 && Math.hypot(e.x - x, e.y - y) < 64 + RP + 8) d += 120; else if (Math.hypot(e.x - x, e.y - y) < 80) d += 20; break;
        case 'boucl': if (Math.hypot(e.x - x, e.y - y) < 34 + RP + 10 && Math.cos(Math.atan2(y - e.y, x - e.x) - e.face) > 0) d += 40; break;
        case 'fileur': if (e.st === 1 && Math.hypot(e.tx - x, e.ty - y) < 52) d += 100; if (e.st === 2 && Math.hypot(e.x - x, e.y - y) < 48) d += 100; break;
        case 'tireur': if (e.st === 1 && distSeg(x, y, e.x, e.y, e.x + Math.cos(e.lockA) * 500, e.y + Math.sin(e.lockA) * 500) < 14) d += 30; break;
        case 'maitre': { const dd = Math.hypot(e.x - x, e.y - y); if (dd < 55) d += 80; if (sim.boss && (sim.boss.st === 'tele' || sim.boss.st === 'gap') && dd < 230) d += 25; break; }
      }
    }
    for (const b of sim.bullets) {
      if (!b.on) continue;
      for (let t = 0.05; t <= 0.45; t += 0.1) { const bx = b.x + b.vx * t, by = b.y + b.vy * t; const q = Math.hypot(bx - x, by - y); if (q < PEARL_R + RP + 7) { d += 70 * (1 - t); break; } }
    }
    for (const s of sim.shells) if (s.on && Math.hypot(s.tx - x, s.ty - y) < s.r + RP + 6) d += 110;
    for (const l of sim.lines) if (l.on && l.t > -0.6 && (l.kind !== 1 || l.t < l.tele) && distSeg(x, y, l.x0, l.y0, l.x1, l.y1) < l.w / 2 + RP + 6) d += l.kind === 1 ? 130 : 110;
    for (const g of sim.teles) if (g.on) for (let i = 0; i < g.n; i++) if (Math.hypot(g.x[i] - x, g.y[i] - y) < 30) d += 15;
    const B = sim.boss;
    if (B && sim.phase === 'boss') {
      if (B.id === 'presse') {
        for (const p of B.pist) if (p.alive && (p.st === 'tele' || p.st === 'down') && Math.abs(x - p.e.x) < 50) d += 130;
        for (const g of B.ghosts) if ((g.st === 'tele' || g.st === 'down') && Math.abs(x - g.x) < 50) d += 130;
        if (B.roll && Math.abs(y - B.roll.y) < 70 && B.roll.t > 0.3) d += 60;
      }
      if (B.id === 'trait') { const n = B.nodes.length; for (let i = 0; i < n; i++) { const a = B.nodes[i], c = B.nodes[(i + 1) % n]; if (a.gone || c.gone) continue; if (distSeg(x, y, a.x, a.y, c.x, c.y) < 4 + RP + 10) d += 90; } }
      if (B.id === 'miroir') { for (const l of sim.lines) if (l.on && l.kind === 3 && distSeg(x, y, l.x0, l.y0, l.x1, l.y1) < 16) d += 90; }
    }
    if (sim.arena.isPit(x, y)) d += 500;
    // bords et coins : on s'y fait coincer
    const m = Math.min(x, y, AW - x, AH - y); if (m < 24) d += (24 - m) * 0.4;
    return d;
  }

  evalPlan(pl) {
    const sim = this.sim, P = sim.P;
    if (!pl.ok) return -1e9;
    let s = 0, kills = 0, boss = 0, hits = 0;
    for (let i = 0; i < pl.cN; i++) { const k = pl.cK[i]; if (k === K_KILL) { kills++; if (pl.cE[i].type === 'noeud') boss += 2; } else if (k === K_BOSS) boss++; else if (k === K_HIT) hits++; }
    let alive = 0; for (const e of sim.enemies) if (e.on && !e.boss) alive++;
    s += kills * 12 + (kills >= 3 ? kills * 4 : 0) + boss * 30 + hits * (alive <= 3 ? 60 : 22);
    if (pl.block) s -= 45;
    if (pl.pit) s -= 400;
    s -= this.danger(pl.ex, pl.ey, pl);
    // rester près de l'action, éviter les bords
    let near = 0, nearest = 1e9; for (const e of sim.enemies) if (e.on && !e.gone && !e.boss) { const d = Math.hypot(pl.ex - e.x, pl.ey - e.y); if (d > 45 && d < 150) near++; if (d < nearest) nearest = d; }
    s += Math.min(5, near) * 0.8;
    if (nearest < 1e9) { // chasse : se rapprocher (distance de chemin, cases) des ennemis restants
      const c = sim.cellIdx(pl.ex, pl.ey), hd = this.hunt[c];
      s -= (hd < 0 ? 12 : Math.max(0, hd - 2)) * 1.5;
    }
    if (sim.boss && sim.phase === 'boss') s += this.bossPos(pl.ex, pl.ey);
    s -= Math.hypot(pl.ex - AW / 2, pl.ey - AH / 2) * 0.012;
    return s;
  }
  bossPos(x, y) {
    const sim = this.sim, B = sim.boss;
    if (B.id === 'maitre') { const e = B.e; if (!e.on) return 0; const d = Math.hypot(e.x - x, e.y - y); const behind = Math.cos(Math.atan2(y - e.y, x - e.x) - e.face) < -0.2; return (behind && d < 140 ? 8 : 0) - (d < 40 ? 20 : 0); }
    if (B.id === 'presse') return y > 300 ? 4 : 0;
    return 0;
  }

  // BFS multi-sources depuis les cases des ennemis (murs bloquants ; vitres et fosses franchissables en dash)
  buildHunt() {
    const sim = this.sim, A = sim.arena, H = this.hunt || (this.hunt = new Int16Array(192)), Q = this.hq || (this.hq = new Int16Array(192));
    H.fill(-1); let h = 0, t = 0;
    for (const e of sim.enemies) if (e.on && !e.gone && e.hp > 0) { const c = sim.cellIdx(e.x, e.y); if (H[c] < 0) { H[c] = 0; Q[t++] = c; } }
    while (h < t) {
      const c = Q[h++], cx = c % 12, cy = (c / 12) | 0;
      for (let k = 0; k < 4; k++) {
        const nx = cx + (k === 0 ? 1 : k === 1 ? -1 : 0), ny = cy + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (nx < 0 || ny < 0 || nx >= 12 || ny >= 16 || A.at(nx, ny) === 1) continue;
        const n = ny * 12 + nx; if (H[n] >= 0) continue; H[n] = H[c] + 1; Q[t++] = n;
      }
    }
  }
  decide() {
    const sim = this.sim, P = sim.P, pl = this.plan;
    this.stats.decisions++;
    this.buildHunt();
    const Lmax = sim.stats.Lmax;
    let bs = -1e9, found = false;
    const vec = this.vec;
    const tryV = (vx, vy) => {
      vec[0] = vx; vec[1] = vy;
      sim.planFor(pl, P.x, P.y, 0, vec, 1, 0, 0);
      const s = this.evalPlan(pl);
      if (s > bs) { bs = s; this.best.copyFrom(pl); this.bvx = vx; this.bvy = vy; found = true; }
    };
    // cibles directes (centre + dépassement), puis 48 directions × 3 longueurs
    for (const e of sim.enemies) {
      if (!targetable(e)) continue;
      const dx = e.x - P.x, dy = e.y - P.y, d = Math.hypot(dx, dy); if (d < 1 || d > Lmax + 30) continue;
      const L = Math.min(Lmax, d + e.r + 14); tryV(dx / d * L, dy / d * L);
    }
    for (let i = 0; i < 48; i++) {
      const a = i / 48 * TAU, c = Math.cos(a), s = Math.sin(a);
      tryV(c * Lmax, s * Lmax); tryV(c * Lmax * 0.62, s * Lmax * 0.62); tryV(c * Math.max(GESTURE.Lmin + 2, Lmax * 0.34), s * Math.max(GESTURE.Lmin + 2, Lmax * 0.34));
    }
    if (!found) { this.think = 0.05; return; }
    const hereDanger = this.danger(P.x, P.y, null);
    const kills = this.best.kills;
    let bossHit = 0; for (let i = 0; i < this.best.cN; i++) if (this.best.cK[i] === K_BOSS || (this.best.cK[i] === K_KILL && this.best.cE[i].type === 'noeud')) bossHit++;
    const chainUrgent = P.chain > 0 && P.win < 0.32 && P.elan >= 2;
    const go = kills > 0 || bossHit > 0 || hereDanger > 8 || chainUrgent || (P.elan >= sim.stats.elanMax && P.idleT > 0.6) || (P.idleT > 1.4 && P.elan >= 2);
    if (!go || (P.elan <= 0)) { this.think = 0.04 + this.rng() * 0.04; return; }
    // erreur de visée (le bot n'est pas parfait) : rotation + longueur bruitées, l'assistance corrige une partie
    const err = this.gauss() * this.aimErr * Math.PI / 180, lk = 1 + this.gauss() * 0.15 * (1.2 - this.skill);
    const c = Math.cos(err), s = Math.sin(err);
    vec[0] = (this.bvx * c - this.bvy * s) * lk; vec[1] = (this.bvx * s + this.bvy * c) * lk;
    sim.requestDash(vec, 1);
    this.stats.dashes++;
    this.think = -1;
  }
}

// Joue une partie complète sous Node (pas de rendu) ; renvoie le résultat de la sim.
export function playRun(sim, bot, maxTime = 600) {
  const dt = 1 / 60;
  let t = 0;
  while (!sim.over && t < maxTime) { bot.update(dt); sim.frame(dt); sim.clearEvents(); t += dt; }
  return sim;
}
