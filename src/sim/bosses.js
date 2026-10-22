// Boss (GAME_DESIGN §8) : le Maître, la Presse, le Miroir, le Trait. Leurs parties ciblables sont des entrées du pool
// d'ennemis (type maitre / piston / noyau / miroir / noeud) : la planification du trait les traite comme le reste.
import { AW, AH, RP, BOSSES, CELL } from '../core/data.js';
import { EV } from './events.js';
import { fireBullet, distSeg, angDiff, moveE } from './enemies.js';

const TAU = Math.PI * 2, D2R = Math.PI / 180;

export function createBoss(id, sim) {
  switch (id) {
    case 'maitre': return new Maitre(sim);
    case 'presse': return new Presse(sim);
    case 'miroir': return new Miroir(sim);
    case 'trait': return new Trait(sim);
  }
  return null;
}

class BossBase {
  constructor(sim, id) { this.id = id; this.name = BOSSES[id].name; this.total = BOSSES[id].entailles; this.dead = false; this.x = AW / 2; this.y = 120; this.t = 0; this.phase = 1; this.addT = 0; }
  done() { return 0; }
  spawnAdds(sim, type, n, minD = 90) {
    const g = sim.newTele(); if (!g) return;
    const sp = { x: 0, y: 0, cx: 0, cy: 0 };
    for (let i = 0; i < n; i++) if (sim.spawnPoint(sp, minD)) sim.teleAdd(g, type, sp.x, sp.y, 1, false);
    if (!g.n) g.on = false; else sim.emit(EV.SPAWN_TELE, sp.x, sp.y, g.n, 0, 0, 'boss');
  }
  countType(sim, type) { let n = 0; for (const e of sim.enemies) if (e.on && e.type === type) n++; return n; }
  setPhase(sim, p) { if (p !== this.phase) { this.phase = p; sim.emit(EV.BOSS_PHASE, this.x, this.y, p, 0); } }
}

// ------------------------------------------------------------------ LE MAÎTRE (Dojo) · 8 entailles
class Maitre extends BossBase {
  constructor(sim) {
    super(sim, 'maitre');
    const e = this.e = sim.spawnEnemy('maitre', AW / 2, 130, false);
    e.hp = e.hpMax = 8; e.shieldOn = true; e.noFire = 0; e.born = 0;
    this.st = 'garde'; this.stT = 1.2; this.trails = 0; this.dx = 0; this.dy = 0; this.len = 0; this.run = 0; this.addT = 9; this.armor = 0;
  }
  done() { return 8 - Math.max(0, this.e.hp); }
  laneEnd(sim, a, max) {
    const e = this.e, dx = Math.cos(a), dy = Math.sin(a);
    for (let s = 0; s <= max; s += 4) if (sim.arena.circleHits(e.x + dx * s, e.y + dy * s, e.r, 0)) return Math.max(0, s - 4);
    return max;
  }
  update(dt, sim) {
    const e = this.e, P = sim.P;
    this.x = e.x; this.y = e.y;
    const hp = e.hp; this.setPhase(sim, hp >= 6 ? 1 : hp >= 3 ? 2 : 3);
    const toP = Math.atan2(P.y - e.y, P.x - e.x), d = Math.hypot(P.x - e.x, P.y - e.y);
    // invocations (P2 : 4 Pions / 9 s ; P3 : / 7 s)
    if (this.phase >= 2) { this.addT -= dt; if (this.addT <= 0) { this.addT = this.phase === 2 ? 9 : 7; this.spawnAdds(sim, 'pion', 4); } }
    if (this.armor > 0) this.armor -= dt;
    e.vuln = this.st === 'open' && this.armor <= 0;
    e.armor = this.armor > 0;
    this.stT -= dt;
    switch (this.st) {
      case 'garde': {
        e.shieldOn = true;
        const df = angDiff(toP, e.face), m = 120 * D2R * dt; e.face += df > m ? m : df < -m ? -m : df;
        if (d > 30) moveE(sim, e, Math.cos(toP) * 40, Math.sin(toP) * 40, dt);
        if (this.stT <= 0) { this.trails = this.phase >= 2 ? 3 : 1; this.tele(sim); }
        break;
      }
      case 'tele': {
        if (this.stT <= 0) { this.st = 'dash'; this.run = 0; }
        break;
      }
      case 'dash': {
        const step = Math.min(1200 * dt, this.len - this.run), x0 = e.x, y0 = e.y;
        e.x += this.dx * step; e.y += this.dy * step; this.run += step;
        if (distSeg(P.x, P.y, x0, y0, e.x, e.y) < e.r + RP) sim.hurt(e);
        if (this.run >= this.len - 1e-3) {
          sim.emit(EV.SLAM, e.x, e.y, 2, 0);
          if (this.phase >= 3) {
            sim.addLine(2, this.lx, this.ly, e.x, e.y, 8, 0, 1.2, 0);
            const a0 = Math.atan2(P.y - e.y, P.x - e.x);
            for (let i = 0; i < 5; i++) fireBullet(sim, e.x, e.y, a0 + (i - 2) * 20 * D2R, 160 * sim.pearlK);
            sim.emit(EV.FIRE, e.x, e.y, 2, 0);
          }
          this.trails--;
          if (this.trails > 0) { this.st = 'gap'; this.stT = 0.2; }
          else { this.st = 'open'; this.stT = 1.0; e.shieldOn = false; }
        }
        break;
      }
      case 'gap': if (this.stT <= 0) this.tele(sim); break;
      case 'open': e.shieldOn = false; if (this.stT <= 0) { this.st = 'garde'; this.stT = 1.2; } break;
    }
  }
  tele(sim) {
    const e = this.e, P = sim.P, a = Math.atan2(P.y - e.y, P.x - e.x), d = Math.hypot(P.x - e.x, P.y - e.y);
    this.dx = Math.cos(a); this.dy = Math.sin(a); this.len = this.laneEnd(sim, a, d + 40); this.lx = e.x; this.ly = e.y;
    e.face = a; e.shieldOn = true;
    const tt = this.phase >= 2 ? 0.45 : 0.55;
    this.st = 'tele'; this.stT = tt;
    sim.addLine(1, e.x, e.y, e.x + this.dx * this.len, e.y + this.dy * this.len, 18, tt, 0, 0);
    sim.emit(EV.TELE, e.x, e.y, 9, 0);
  }
  onHit(part, sim) {
    const e = this.e, P = sim.P;
    if (this.armor > 0) return false;
    e.hp--; this.armor = 1.8;
    const a = Math.atan2(e.y - P.y, e.x - P.x);
    e.kx = Math.cos(a) * 30; e.ky = Math.sin(a) * 30;
    moveE(sim, e, e.kx / 0.016, e.ky / 0.016, 0.016); e.kx = e.ky = 0;
    this.st = 'garde'; this.stT = 1.2; this.trails = 0;
    if (e.hp <= 0) { this.dead = true; e.on = false; }
    return true;
  }
}

// ------------------------------------------------------------------ LA PRESSE (Docks) · 4 pistons × 3 + noyau 4
const COL_X = [45, 135, 225, 315], FLOOR_Y = 446, TOP_Y = 90;
class Presse extends BossBase {
  constructor(sim) {
    super(sim, 'presse');
    this.pist = [];
    for (let i = 0; i < 4; i++) {
      const e = sim.spawnEnemy('piston', COL_X[i], 45, false); e.hp = e.hpMax = 3; e.touch = false; e.born = 0; e.noFire = 0; e.vuln = false;
      this.pist.push({ e, st: 'idle', t: 0, y: TOP_Y, ghost: false, alive: true });
    }
    this.core = null; this.coreHp = 4; this.slamT = 1.5; this.rollT = 5; this.roll = null; this.mortT = 6; this.pionT = 8; this.ringT = 1.6; this.ghosts = [{ st: 'idle', t: 0, x: 0, y: TOP_Y }, { st: 'idle', t: 0, x: 0, y: TOP_Y }];
    this.y = 45;
  }
  destroyed() { let n = 0; for (const p of this.pist) if (!p.alive) n++; return n; }
  done() { let d = 0; for (const p of this.pist) d += 3 - Math.max(0, p.e.hp); return d + (4 - this.coreHp); }
  update(dt, sim) {
    const P = sim.P, nd = this.destroyed();
    this.setPhase(sim, nd < 2 ? 1 : nd < 4 ? 2 : 3);
    // pistons
    for (const p of this.pist) this.updatePiston(p, dt, sim);
    // cadence des frappes
    if (nd < 4) {
      this.slamT -= dt;
      if (this.slamT <= 0) {
        this.slamT = this.phase === 1 ? 2.2 : 1.6;
        const n = this.phase === 1 ? 1 : 2;
        const pc = Math.max(0, Math.min(3, Math.floor(P.x / 90)));
        let chosen = 0;
        const first = this.pist[pc];
        if (first.alive && first.st === 'idle') { this.trigger(first, sim); chosen++; }
        for (let k = 0; k < 6 && chosen < n; k++) { const p = this.pist[Math.floor(sim.rngW() * 4)]; if (p.alive && p.st === 'idle') { this.trigger(p, sim); chosen++; } }
      }
    }
    // Rouleau (P2)
    if (this.phase === 2) {
      this.rollT -= dt;
      if (this.rollT <= 0 && !this.roll) { this.rollT = 7; this.roll = { t: 0, y: AH - 20 }; sim.emit(EV.TELE, AW / 2, AH - 20, 10, 0); }
    }
    if (this.roll) {
      const r = this.roll; r.t += dt;
      if (r.t >= 1.0) { r.y -= 160 * dt; if (Math.abs(P.y - r.y) < 20 + RP) sim.hurt(null); if (r.y < TOP_Y + 20) this.roll = null; }
    }
    // adds : 2 Mortiers / 12 s (max 2), Pions
    this.mortT -= dt; if (this.mortT <= 0) { this.mortT = 12; const m = this.countType(sim, 'mortier'); if (m < 2) this.spawnAdds(sim, 'mortier', 2 - m); }
    this.pionT -= dt; if (this.pionT <= 0) { this.pionT = 10; this.spawnAdds(sim, 'pion', 3); }
    // noyau exposé
    if (nd >= 4) {
      if (!this.core) {
        const e = this.core = sim.spawnEnemy('noyau', AW / 2, 45, false); e.hp = e.hpMax = 4; e.born = 0; e.noFire = 0; e.vuln = false; e.touch = true; this.coreT = 0;
        sim.emit(EV.BOSS_PHASE, AW / 2, 45, 4, 0);
      }
      const e = this.core; this.coreT += dt; if (this.coreArmor > 0) this.coreArmor -= dt;
      if (e.y < 140) { e.y = Math.min(140, e.y + 95 * dt); e.vuln = e.y >= 139; }
      this.x = e.x; this.y = e.y;
      if (e.vuln) {
        this.ringT -= dt;
        if (this.ringT <= 0) { this.ringT = 1.6; const a0 = sim.rngW() * TAU; for (let i = 0; i < 10; i++) fireBullet(sim, e.x, e.y, a0 + i * TAU / 10, 130 * sim.pearlK); sim.emit(EV.FIRE, e.x, e.y, 3, 0); }
        this.slamT -= dt;
        if (this.slamT <= 0) {
          this.slamT = 2.2;
          for (let k = 0; k < 2; k++) { const g = this.ghosts[k]; if (g.st !== 'idle') continue; g.st = 'tele'; g.t = 0.9; g.x = COL_X[k === 0 ? Math.max(0, Math.min(3, Math.floor(P.x / 90))) : Math.floor(sim.rngW() * 4)]; g.y = TOP_Y; sim.emit(EV.TELE, g.x, 200, 11, 0); }
        }
      }
      for (const g of this.ghosts) this.updateGhost(g, dt, sim);
    }
  }
  trigger(p, sim) { p.st = 'tele'; p.t = 0.9; sim.emit(EV.TELE, p.e.x, 200, 11, 0); }
  colHit(x, headY, sim) {
    const P = sim.P;
    if (Math.abs(P.x - x) < 43 && P.y < headY + 22) sim.hurt(null);
  }
  updatePiston(p, dt, sim) {
    const e = p.e;
    if (!p.alive) { e.vuln = false; return; }
    p.t -= dt;
    switch (p.st) {
      case 'tele': if (p.t <= 0.2 && p.t + dt > 0.2 && Math.abs(sim.P.x - e.x) < 43) sim.instinct(); if (p.t <= 0) { p.st = 'down'; p.t = 0.25; } break;
      case 'down': p.y = TOP_Y + (FLOOR_Y - TOP_Y) * (1 - Math.max(0, p.t) / 0.25); this.colHit(e.x, p.y, sim); if (p.t <= 0) { p.st = 'floor'; p.t = 1.4; p.y = FLOOR_Y; sim.emit(EV.PISTON, e.x, FLOOR_Y, 0, 0); } break;
      case 'floor': if (p.t <= 0) { p.st = 'up'; p.t = 0.3; p.hitThis = false; } break;
      case 'up': p.y = FLOOR_Y - (FLOOR_Y - TOP_Y) * (1 - Math.max(0, p.t) / 0.3); if (p.t <= 0) { p.st = 'idle'; p.y = TOP_Y; } break;
    }
    e.vuln = p.st === 'floor' && !p.hitThis;
    if (e.vuln) { e.y = FLOOR_Y; } else { e.y = 45; }
    e.px = e.x; e.py = e.y;
  }
  updateGhost(g, dt, sim) {
    g.t -= dt;
    if (g.st === 'tele' && g.t <= 0) { g.st = 'down'; g.t = 0.25; }
    else if (g.st === 'down') { g.y = TOP_Y + (FLOOR_Y - TOP_Y) * (1 - Math.max(0, g.t) / 0.25); this.colHit(g.x, g.y, sim); if (g.t <= 0) { g.st = 'up'; g.t = 0.3; sim.emit(EV.PISTON, g.x, FLOOR_Y, 1, 0); } }
    else if (g.st === 'up' && g.t <= 0) { g.st = 'idle'; g.y = TOP_Y; }
  }
  onHit(part, sim) {
    if (part.type === 'piston') {
      const p = this.pist.find(q => q.e === part); if (!p || !p.alive || p.st !== 'floor' || p.hitThis) return false;
      part.hp--; p.hitThis = true;
      if (part.hp <= 0) { p.alive = false; part.gone = true; part.vuln = false; part.hp = 0; sim.emit(EV.BOSS_PHASE, part.x, FLOOR_Y, 0, 1); }
      return true;
    }
    if (part === this.core && part.vuln && !(this.coreArmor > 0)) {
      part.hp--; this.coreHp = part.hp; this.coreArmor = 1.6;
      if (part.hp <= 0) { this.dead = true; part.on = false; }
      return true;
    }
    return false;
  }
}

// ------------------------------------------------------------------ LE MIROIR (Verrière) · 9 entailles
class Miroir extends BossBase {
  constructor(sim) {
    super(sim, 'miroir');
    const e = this.e = sim.spawnEnemy('miroir', AW / 2, 240, false);
    e.hp = e.hpMax = 9; e.born = 0; e.noFire = 0; e.rot = 0; e.crack = Math.floor(sim.rngW() * 4); e.vuln = true;
    this.x = e.x; this.y = e.y; this.dirS = 1; this.revT = 4; this.closed = 0; this.ringT = 2.5; this.spiral = 0; this.addT = 3; this.lastDash = sim.P.dashId;
  }
  done() { return 9 - Math.max(0, this.e.hp); }
  update(dt, sim) {
    const e = this.e, P = sim.P;
    this.setPhase(sim, e.hp > 5 ? 1 : 2);
    let sp = 60;
    if (this.phase === 2) { sp = 90; this.revT -= dt; if (this.revT <= 0) { this.revT = 4; this.dirS = -this.dirS; } }
    e.rot += sp * D2R * dt * this.dirS;
    if (this.closed > 0) { this.closed -= dt; e.crack = this.closed > 0 ? -1 : this.nextCrack; }
    // Reflet : copie rouge du dernier trait, télégraphe 0,6 s à +0,9 s, puis rayon mortel 0,2 s
    if (P.dashId !== this.lastDash && P.state !== 1) {
      this.lastDash = P.dashId;
      const pl = sim.plan;
      for (let i = 0; i < pl.n; i++) if (pl.sl[i] > 1) sim.addLine(3, pl.sx[i], pl.sy[i], pl.ex_[i], pl.ey_[i], 10, 0.6, 0.2, 0.9);
      sim.emit(EV.REFLET, pl.ex, pl.ey, 0, 0);
    }
    this.ringT -= dt;
    if (this.ringT <= 0) {
      this.ringT = 4;
      const n = this.phase === 2 ? 16 : 12; this.spiral += 11 * D2R;
      for (let i = 0; i < n; i++) fireBullet(sim, e.x + Math.cos(this.spiral + i * TAU / n) * 26, e.y + Math.sin(this.spiral + i * TAU / n) * 26, this.spiral + i * TAU / n, 120 * sim.pearlK);
      sim.emit(EV.FIRE, e.x, e.y, 3, 0);
    }
    if (this.phase === 2) { this.addT -= dt; if (this.addT <= 0) { this.addT = 10; this.spawnAdds(sim, 'fileur', 2); } }
  }
  onHit(part, sim) {
    const e = this.e;
    if (e.crack < 0) return false;
    e.hp--;
    let c = e.crack; while (c === e.crack) c = Math.floor(sim.rngW() * 4);
    this.nextCrack = c; e.crack = -1; this.closed = 2.5; // se referme : toutes les faces parent 2,5 s

    if (e.hp <= 0) { this.dead = true; e.on = false; }
    return true;
  }
}

// ------------------------------------------------------------------ LE TRAIT (Vide) · 3 phases de nœuds
const PH = [{ n: 5, reborn: 5, arms: 0 }, { n: 6, reborn: 4, arms: 2 }, { n: 7, reborn: 3.5, arms: 3 }];
class Trait extends BossBase {
  constructor(sim) {
    super(sim, 'trait');
    this.nodes = []; this.cx = AW / 2; this.cy = 230; this.rot = 0; this.spA = 0; this.spT = 0; this.prevDone = 0; this.x = this.cx; this.y = this.cy;
    this.startPhase(sim, 1);
  }
  startPhase(sim, p) {
    for (const n of this.nodes) n.on = false;
    this.nodes.length = 0; this.phase = p;
    const def = PH[p - 1];
    for (let i = 0; i < def.n; i++) {
      const e = sim.spawnEnemy('noeud', this.cx, this.cy, false); if (!e) continue;
      e.born = p === 1 ? 0.3 : 3.5; e.noFire = 0; e.hp = 1; e.part = i; e.gone = false;
      e.ax = 60 + sim.rngW() * 30; e.ay = 60 + sim.rngW() * 30; e.fx = 0.3 + sim.rngW() * 0.2; e.fy = 0.3 + sim.rngW() * 0.2; e.phx = sim.rngW() * TAU; e.phy = sim.rngW() * TAU;
      this.nodes.push(e);
    }
    this.place(sim, 0);
    if (p === 3) this.spawnAdds(sim, 'lancier', 2);
    sim.emit(EV.BOSS_PHASE, this.cx, this.cy, p, 0);
  }
  done() { let d = this.prevDone; for (const n of this.nodes) if (n.gone) d++; return d; }
  place(sim, t) {
    const n = this.nodes.length;
    for (let i = 0; i < n; i++) {
      const e = this.nodes[i], a = this.rot + i * TAU / n;
      const bx = this.cx + Math.cos(a) * 110, by = this.cy + Math.sin(a) * 150;
      e.x = Math.max(24, Math.min(AW - 24, bx + Math.sin(TAU * e.fx * t + e.phx) * e.ax));
      e.y = Math.max(30, Math.min(AH - 40, by + Math.sin(TAU * e.fy * t + e.phy) * e.ay));
    }
  }
  update(dt, sim) {
    const P = sim.P, def = PH[this.phase - 1];
    this.t += dt;
    if (this.phase >= 2) this.rot += 30 * D2R * dt;
    this.place(sim, this.t);
    for (const e of this.nodes) if (e.born > 0) e.born -= dt;
    // renaissance
    for (const e of this.nodes) if (e.gone) { e.deadT -= dt; if (e.deadT <= 0) { e.gone = false; e.hp = 1; e.born = 0.3; sim.emit(EV.NODE_BACK, e.x, e.y, 0, 0); } }
    // segments rouges : mortels à l'arrêt
    const n = this.nodes.length;
    if (P.state === 0) for (let i = 0; i < n; i++) {
      const a = this.nodes[i], b = this.nodes[(i + 1) % n];
      if (a.gone || b.gone || a.born > 0 || b.born > 0) continue;
      if (distSeg(P.x, P.y, a.x, a.y, b.x, b.y) < 4 + RP) { sim.hurt(null); break; }
    }
    // spirales
    if (def.arms) {
      this.spT -= dt; this.spA += 40 * D2R * dt;
      if (this.spT <= 0) { this.spT = 1 / 8 * def.arms / 2; for (let k = 0; k < def.arms; k++) fireBullet(sim, this.cx, this.cy, this.spA + k * TAU / def.arms, 110 * sim.pearlK); }
    }
  }
  onNode(e, sim) {
    const P = sim.P, def = PH[this.phase - 1];
    if (e.gone) return;
    e.gone = true; e.deadT = def.reborn;
    // un nœud coupé compte dans la Chaîne
    if (P.chain === 0) P.chainId++;
    P.chain++; if (P.chain > P.best) P.best = P.chain;
    e.chainId = P.chainId;
    if (P.state === 1) P.kills++; // un nœud coupé rend l'Élan comme un kill
    sim.score += 500 * P.mult; sim.doHitstop(70);
    sim.emit(EV.BOSS_HIT, e.x, e.y, 0, 0, 0, 'noeud');
    // Rupture : tous les nœuds de la phase coupés dans une même Chaîne
    let all = true; for (const q of this.nodes) if (!q.gone || q.chainId !== P.chainId) { all = false; break; }
    if (all) {
      sim.emit(EV.RUPTURE, this.cx, this.cy, this.phase, 0);
      sim.emit(EV.BANNER, 0, 0, 4, 0, 0, 'RUPTURE');
      this.prevDone += this.nodes.length;
      if (this.phase >= 3) { this.dead = true; for (const q of this.nodes) q.on = false; }
      else this.startPhase(sim, this.phase + 1);
    }
  }
  onHit() { return false; }
}
