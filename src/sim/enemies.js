// Comportements des 11 ennemis (GAME_DESIGN §6). Fonctions pures sur (sim, e, dt) ; aucune allocation.
import { ENEMY, RP, PEARL_V, AW, AH, CELL, GW, GH } from '../core/data.js';
import { EV } from './events.js';

const TAU = Math.PI * 2, D2R = Math.PI / 180;
export function angDiff(a, b) { let d = a - b; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; }

// déplacement glissant contre les cases bloquantes (murs, vitres, fosses)
export function moveE(sim, e, vx, vy, dt) {
  // rayon de collision plafonné à 13 u : les gros corps (Colosse) se faufilent dans les passages d'une case
  const a = sim.arena, nx = e.x + vx * dt, ny = e.y + vy * dt, r = e.r > 13 ? 13 : e.r;
  if (!a.circleHits(nx, e.y, r, 0)) e.x = nx;
  if (!a.circleHits(e.x, ny, r, 0)) e.y = ny;
}
function steer(e, target, rate, dt) { const d = angDiff(target, e.ang), m = rate * dt; e.ang += d > m ? m : d < -m ? -m : d; }
function toward(sim, e, tx, ty, sp, dt) { const a = Math.atan2(ty - e.y, tx - e.x); e.ang = a; moveE(sim, e, Math.cos(a) * sp, Math.sin(a) * sp, dt); }
// chemin direct libre ? (échantillons sur la ligne, cases bloquantes pour les ennemis)
function clearPath(sim, e, tx, ty) {
  const dx = tx - e.x, dy = ty - e.y, d = Math.sqrt(dx * dx + dy * dy), n = Math.ceil(d / 10);
  const px = -dy / (d || 1) * e.r, py = dx / (d || 1) * e.r;
  for (let i = 1; i <= n; i++) {
    const t = i / n, x = e.x + dx * t, y = e.y + dy * t;
    if (sim.arena.solidEnemy(Math.floor((x + px) / CELL), Math.floor((y + py) / CELL)) || sim.arena.solidEnemy(Math.floor((x - px) / CELL), Math.floor((y - py) / CELL))) return false;
  }
  return true;
}
// angle de poursuite du joueur : direct si le chemin est libre, sinon champ de flux (BFS sur la grille)
export function seekAngle(sim, e) {
  const P = sim.P;
  e.pathT -= 1 / 60;
  if (e.pathT <= 0) { e.pathT = 0.2; e.direct = clearPath(sim, e, P.x, P.y); }
  if (e.direct) return Math.atan2(P.y - e.y, P.x - e.x);
  const nx = sim.flowNext[sim.cellIdx(e.x, e.y)];
  if (nx < 0) return Math.atan2(P.y - e.y, P.x - e.x);
  return Math.atan2(Math.floor(nx / GW) * CELL + 15 - e.y, (nx % GW) * CELL + 15 - e.x);
}
function chase(sim, e, sp, dt) { const a = seekAngle(sim, e); e.ang = a; moveE(sim, e, Math.cos(a) * sp, Math.sin(a) * sp, dt); }
function freeSpotNear(sim, x, y, minD, maxD, out) {
  for (let k = 0; k < 24; k++) {
    const a = sim.rngW() * TAU, d = minD + sim.rngW() * (maxD - minD), px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
    if (px < 20 || py < 20 || px > AW - 20 || py > AH - 20) continue;
    if (sim.arena.circleHits(px, py, 12, 0)) continue;
    out.x = px; out.y = py; return true;
  }
  return false;
}
const spot = { x: 0, y: 0 };

export function fireBullet(sim, x, y, ang, speed) {
  const P = sim.P;
  if ((x - P.x) * (x - P.x) + (y - P.y) * (y - P.y) < 40 * 40) return false; // aucune balle ne naît à < 40 u du joueur
  const b = sim.takeBullet(); if (!b) return false;
  b.x = b.px = x; b.y = b.py = y; b.vx = Math.cos(ang) * speed; b.vy = Math.sin(ang) * speed;
  return true;
}
// longueur d'un rayon (case par case) jusqu'au premier mur/vitre
export function beamLen(sim, x, y, a, max) {
  const dx = Math.cos(a), dy = Math.sin(a);
  for (let s = 0; s < max; s += 4) { const px = x + dx * s, py = y + dy * s; if (px < 0 || py < 0 || px > AW || py > AH || sim.arena.solidBullet(Math.floor(px / CELL), Math.floor(py / CELL))) return s; }
  return max;
}
function laneLen(sim, e, a, max) {
  const dx = Math.cos(a), dy = Math.sin(a);
  for (let s = 0; s < max; s += 4) if (sim.arena.circleHits(e.x + dx * s, e.y + dy * s, e.r, 0)) return Math.max(0, s - 4);
  return max;
}
function distSeg(px, py, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy || 1;
  let t = ((px - x0) * dx + (py - y0) * dy) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = x0 + dx * t - px, qy = y0 + dy * t - py; return Math.sqrt(qx * qx + qy * qy);
}
export { distSeg };

export function updateEnemy(sim, e, dt) {
  const P = sim.P;
  if (e.born > 0) e.born -= dt;
  if (e.noFire > 0) e.noFire -= dt;
  const dxp = P.x - e.x, dyp = P.y - e.y, d = Math.sqrt(dxp * dxp + dyp * dyp), toP = Math.atan2(dyp, dxp);
  const sp = ENEMY[e.type].speed * e.spd, rate = e.rate;
  // recul (coup de dash sur un ennemi à plusieurs PV)
  if (e.kT > 0) { const k = Math.min(1, dt / e.kT); moveE(sim, e, e.kx * k / dt, e.ky * k / dt, dt); e.kx *= 1 - k; e.ky *= 1 - k; e.kT -= dt; }
  // incrusté dans un mur / bord (recul, onde…) : on le dégage vers la case libre la plus proche
  if (!e.static && sim.arena.circleHits(e.x, e.y, Math.min(13, e.r), 0)) {
    for (let r = 2; r <= 40; r += 2) { let done = false; for (let k = 0; k < 12; k++) { const a = k * 0.5236, nx = e.x + Math.cos(a) * r, ny = e.y + Math.sin(a) * r; if (!sim.arena.circleHits(nx, ny, Math.min(13, e.r), 0)) { e.x = nx; e.y = ny; done = true; break; } } if (done) break; }
  }
  if (e.stun > 0) { e.stun -= dt; return; }
  switch (e.type) {
    case 'pion': {
      if (e.static) { e.ang = toP; break; }
      steer(e, seekAngle(sim, e), Math.PI, dt);
      moveE(sim, e, Math.cos(e.ang) * sp, Math.sin(e.ang) * sp, dt);
      break;
    }
    case 'mouch': {
      e.wob += dt * 12.566; // 2 Hz
      const a = seekAngle(sim, e) + Math.sin(e.wob) * 0.6;
      let vx = Math.cos(a) * sp, vy = Math.sin(a) * sp;
      // séparation 12 u (grille spatiale)
      const g = sim.grid, cx = Math.floor(e.x / CELL), cy = Math.floor(e.y / CELL);
      for (let yy = cy - 1; yy <= cy + 1; yy++) for (let xx = cx - 1; xx <= cx + 1; xx++) {
        if (xx < 0 || yy < 0 || xx >= GW || yy >= GH) continue;
        const c = yy * GW + xx;
        for (let k = g.start[c]; k < g.start[c + 1]; k++) {
          const o = sim.enemies[g.items[k]]; if (o === e || o.type !== 'mouch') continue;
          const ox = e.x - o.x, oy = e.y - o.y, dd = Math.sqrt(ox * ox + oy * oy);
          if (dd > 0 && dd < 12) { vx += ox / dd * (12 - dd) * 12; vy += oy / dd * (12 - dd) * 12; }
        }
      }
      e.ang = a; moveE(sim, e, vx, vy, dt);
      break;
    }
    case 'tireur': {
      if (e.st === 0) {
        const los = sim.arena.los(e.x, e.y, P.x, P.y);
        if (!los) { chase(sim, e, sp, dt); e.ang = toP; } // cherche une ligne de vue en se rapprochant else if (d < 150) { e.ang = toP; moveE(sim, e, -Math.cos(toP) * sp, -Math.sin(toP) * sp, dt); }
        else if (d > 220) chase(sim, e, sp, dt);
        else e.ang = toP;
        e.cd -= dt * rate;
        if (e.cd <= 0 && los && e.noFire <= 0) { e.st = 1; e.t = 0.55; e.lockA = toP; sim.emit(EV.TELE, e.x, e.y, 1, 0); }
      } else {
        e.t -= dt; if (e.t > 0.15) e.lockA = toP; e.ang = e.lockA;
        if (e.t <= 0.2 && e.t + dt > 0.2) sim.threatCheckLine(e.x, e.y, e.lockA, 600, 5);
        if (e.t <= 0) {
          if (!fireBullet(sim, e.x + Math.cos(e.lockA) * 14, e.y + Math.sin(e.lockA) * 14, e.lockA, PEARL_V * sim.pearlK)) { e.cd = 0.5; }
          else { e.cd = 2.4; sim.emit(EV.FIRE, e.x, e.y, 0, 0); }
          e.st = 0;
        }
      }
      break;
    }
    case 'charg': {
      if (e.st === 0) {
        chase(sim, e, sp, dt);
        e.cd -= dt * rate;
        if (e.cd <= 0 && d < 230 && e.noFire <= 0 && sim.arena.los(e.x, e.y, P.x, P.y)) {
          e.st = 1; e.t = 0.7; e.lockA = toP; e.lx = e.x; e.ly = e.y; e.lane = laneLen(sim, e, toP, 300); sim.emit(EV.TELE, e.x, e.y, 2, 0);
        }
      } else if (e.st === 1) {
        e.ang = e.lockA; e.t -= dt;
        if (e.t <= 0.2 && e.t + dt > 0.2) sim.threatCheckLane(e.lx, e.ly, e.lockA, e.lane, 14 + RP);
        if (e.t <= 0) { e.st = 2; e.run = 0; }
      } else if (e.st === 2) {
        const step = 540 * e.spd * dt, cx = Math.cos(e.lockA), cy = Math.sin(e.lockA);
        const nx = e.x + cx * step, ny = e.y + cy * step;
        if (sim.arena.circleHits(nx, ny, e.r, 0)) { e.st = 3; e.t = 0.9; sim.emit(EV.SLAM, e.x, e.y, 0, 0); }
        else { e.x = nx; e.y = ny; e.run += step; if (e.run >= 300) { e.st = 3; e.t = 0.5; } }
        // écrase les ennemis sur son couloir (Bavure)
        for (let i = 0; i < sim.enemies.length; i++) {
          const o = sim.enemies[i]; if (!o.on || o === e || o.hp <= 0 || o.boss) continue;
          const ox = o.x - e.x, oy = o.y - e.y, rr = o.r + e.r;
          if (ox * ox + oy * oy < rr * rr) sim.killEnemy(o, 2, e.lockA);
        }
      } else { e.t -= dt; if (e.t <= 0) { e.st = 0; e.cd = 2.5; } }
      break;
    }
    case 'boucl': {
      chase(sim, e, sp, dt);
      const df = angDiff(toP, e.face), m = 100 * D2R * dt;
      e.face += df > m ? m : df < -m ? -m : df;
      const front = Math.abs(angDiff(toP, e.face)) <= 75 * D2R;
      if (e.st === 0) {
        e.cd -= dt * rate;
        if (e.cd <= 0 && d < 34 + RP && front && P.state === 0 && e.noFire <= 0) { e.st = 1; e.t = 0.4; e.lockA = e.face; sim.emit(EV.TELE, e.x, e.y, 3, 0); }
      } else {
        e.t -= dt;
        if (e.t <= 0.2 && e.t + dt > 0.2 && d < 34 + RP) sim.instinct();
        if (e.t <= 0) {
          if (d < 34 + RP && Math.abs(angDiff(toP, e.lockA)) <= 90 * D2R) sim.hurt(e);
          e.st = 0; e.cd = 1.0;
        }
      }
      break;
    }
    case 'mortier': {
      e.mv -= dt;
      if (e.st === 2) { // déplacement de 60 u
        const ddx = e.tx - e.x, ddy = e.ty - e.y, dd = Math.sqrt(ddx * ddx + ddy * ddy);
        if (dd < 2) e.st = 0; else { e.ang = Math.atan2(ddy, ddx); moveE(sim, e, ddx / dd * 40 * e.spd, ddy / dd * 40 * e.spd, dt); if (e.mvT > 2) e.st = 0; e.mvT += dt; }
      } else if (e.mv <= 0) {
        e.mv = 6;
        if (freeSpotNear(sim, e.x, e.y, 55, 65, spot)) { e.tx = spot.x; e.ty = spot.y; e.st = 2; e.mvT = 0; }
      }
      e.ang = toP;
      e.cd -= dt * rate;
      if (e.cd <= 0 && e.noFire <= 0) { e.cd = 3.0; if (sim.fireShell(e.x, e.y, P.x, P.y)) sim.emit(EV.TELE, e.x, e.y, 4, 0); }
      break;
    }
    case 'colosse': {
      if (e.st === 0) {
        chase(sim, e, sp, dt);
        e.cd -= dt * rate;
        if (e.cd <= 0 && d < 70 && e.noFire <= 0) { e.st = 1; e.t = 0.8; sim.emit(EV.TELE, e.x, e.y, 5, 0); }
      } else {
        e.t -= dt; e.ang = toP;
        if (e.t <= 0.2 && e.t + dt > 0.2 && d < 64 + RP) sim.instinct();
        if (e.t <= 0) { if (d < 64 + RP) sim.hurt(e); sim.emit(EV.SLAM, e.x, e.y, 1, 0); e.st = 0; e.cd = 1.5; }
      }
      break;
    }
    case 'lancier': {
      e.mv -= dt;
      if (e.st === 3) { // changement de poste
        const ddx = e.tx - e.x, ddy = e.ty - e.y, dd = Math.sqrt(ddx * ddx + ddy * ddy);
        if (dd < 3 || e.mvT > 2.5) { e.st = 0; e.cd = Math.max(e.cd, 0.6); } else { moveE(sim, e, ddx / dd * 120, ddy / dd * 120, dt); e.mvT += dt; }
        e.ang = toP; break;
      }
      if (e.st === 0) {
        e.ang = toP;
        if (e.mv <= 0) { e.mv = 7; if (freeSpotNear(sim, e.x, e.y, 60, 140, spot)) { e.tx = spot.x; e.ty = spot.y; e.st = 3; e.mvT = 0; break; } }
        e.cd -= dt * rate;
        if (e.cd <= 0 && e.noFire <= 0) { e.st = 1; e.t = 1.1; e.lockA = toP; sim.emit(EV.TELE, e.x, e.y, 6, 0); }
      } else if (e.st === 1) {
        e.t -= dt; if (e.t > 0.25) e.lockA = toP; e.ang = e.lockA;
        e.lane = beamLen(sim, e.x, e.y, e.lockA, 700);
        if (e.t <= 0.2 && e.t + dt > 0.2) sim.threatCheckLane(e.x, e.y, e.lockA, e.lane, 4 + RP);
        if (e.t <= 0) { e.st = 2; e.t = 0.15; sim.emit(EV.BEAM, e.x, e.y, e.lockA, e.lane); }
      } else {
        e.t -= dt;
        const ex = e.x + Math.cos(e.lockA) * e.lane, ey = e.y + Math.sin(e.lockA) * e.lane;
        if (distSeg(P.x, P.y, e.x, e.y, ex, ey) < 4 + RP) sim.hurt(e);
        if (e.t <= 0) { e.st = 0; e.cd = 3.5; }
      }
      break;
    }
    case 'fileur': {
      e.spin += dt * TAU * 6;
      if (e.st === 0) {
        e.cd -= dt * rate;
        if (e.cd <= 0 && e.noFire <= 0) {
          let ok = false;
          for (let k = 0; k < 16 && !ok; k++) {
            const a = sim.rngW() * TAU, tx = P.x + Math.cos(a) * 60, ty = P.y + Math.sin(a) * 60;
            if (tx < 15 || ty < 15 || tx > AW - 15 || ty > AH - 15 || sim.arena.circleHits(tx, ty, e.r, 0)) continue;
            e.tx = tx; e.ty = ty; ok = true;
          }
          if (ok) { e.st = 1; e.t = 0.5; sim.emit(EV.TELE, e.tx, e.ty, 7, 0); } else e.cd = 0.3;
        }
      } else if (e.st === 1) {
        e.t -= dt;
        if (e.t <= 0) { e.x = e.px = e.tx; e.y = e.py = e.ty; e.st = 2; e.t = 0.35; e.lockA = Math.atan2(P.y - e.y, P.x - e.x); e.ang = e.lockA; }
      } else {
        e.t -= dt;
        const inCone = d < 40 + RP && Math.abs(angDiff(toP, e.lockA)) <= 40 * D2R;
        if (e.t <= 0.2 && e.t + dt > 0.2 && inCone) sim.instinct();
        if (e.t <= 0) { if (inCone) sim.hurt(e); sim.emit(EV.SLASH, e.x, e.y, e.lockA, 0); e.st = 0; e.cd = 3.2 - 0.85; }
      }
      break;
    }
    case 'egide': {
      // se tient derrière ses alliés (opposé au joueur)
      let n = 0, sx = 0, sy = 0;
      for (let i = 0; i < sim.enemies.length; i++) { const o = sim.enemies[i]; if (!o.on || o === e || o.boss) continue; sx += o.x; sy += o.y; n++; }
      let tx = P.x, ty = P.y;
      if (n) { tx = sx / n - Math.cos(toP) * 50; ty = sy / n - Math.sin(toP) * 50; }
      const ddx = tx - e.x, ddy = ty - e.y, dd = Math.sqrt(ddx * ddx + ddy * ddy);
      if (dd > 6) moveE(sim, e, ddx / dd * sp, ddy / dd * sp, dt);
      e.ang = toP;
      // aura : bulles
      for (let i = 0; i < sim.enemies.length; i++) {
        const o = sim.enemies[i]; if (!o.on || o === e || o.boss || o.type === 'egide') continue;
        const ox = o.x - e.x, oy = o.y - e.y;
        if (ox * ox + oy * oy <= 80 * 80 && o.bubble === 0 && o.bubbleT <= 0) o.bubble = 1;
      }
      break;
    }
    case 'tourelle': {
      e.t += dt * rate;
      const cyc = e.t % 3.0, open = cyc >= 1.6;
      if (open !== e.open) { e.open = open; if (open) { e.salvo = 0; } }
      if (!open && cyc >= 1.3 && e.st === 0) { e.st = 1; sim.emit(EV.TELE, e.x, e.y, 8, 0); }
      if (open) {
        e.st = 0;
        const k = cyc - 1.6;
        if ((e.salvo === 0 && k >= 0) || (e.salvo === 1 && k >= 0.7)) {
          if (e.noFire <= 0) {
            for (let q = 0; q < 4; q++) { const a = e.rotA + q * Math.PI / 2; fireBullet(sim, e.x + Math.cos(a) * 14, e.y + Math.sin(a) * 14, a, 200 * sim.pearlK); }
            sim.emit(EV.FIRE, e.x, e.y, 1, 0);
          }
          e.rotA += Math.PI / 4; e.salvo++;
        }
      }
      e.ang = e.rotA;
      break;
    }
  }
}
