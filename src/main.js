// DASHLINE — point d'entrée : boucle (sim à pas fixe + rendu natif interpolé), geste, états, sauvegarde, PWA.
import { ZONES, ZONE_IDS, GESTURE } from './core/data.js';
import { CAP } from './core/cards.js';
import { localDateStr } from './core/rng.js';
import { Gesture } from './core/gesture.js';
import { Sim, EV } from './sim/sim.js';
import { Plan } from './sim/plan.js';
import { Bot } from './sim/bot.js';
import { Renderer } from './render/renderer.js';
import { Audio, Haptics } from './audio/audio.js';
import { UI } from './ui/ui.js';
import { loadSave, writeSave, defaultSave } from './meta/save.js';
import { refreshDaily, dailyConfig } from './meta/challenges.js';
import { endRun } from './meta/progression.js';

const params = new URLSearchParams(location.search);
const DEBUG = params.get('debug') === '1';
const QDPR = [2, 1.5, 1, 1];
const app = {
  save: null, storage: null, saveFailed: false, mode: 'menu', sim: null, demo: null, bot: null, paused: false, last: 0,
  gesture: new Gesture(), aimPlan: new Plan(), aimOn: false, vec: new Float32Array(16), pt: { x: 0, y: 0 }, ghost: null, bentN: -1, bentKey: -1,
  quality: 0, ft: { sum: 0, n: 0, t: 0, work: 0, late: 0, good: 0, cool: 0 }, refreshMs: 16.67, iv: new Float32Array(120), ivN: 0, ivI: 0, ivSort: new Float32Array(120),
  fpsCap: false, nextRender: 0, renders: 0, steps: 0, fps: 60, fpsAcc: 0, fpsN: 0, fpsStr: '', frameStats: { n: 0, sum: 0, work: 0 },
  peak: { enemies: 0, bullets: 0, particles: 0 }, ui: null, collectTexts: false, lastTexts: null, endAt: -1, lastEnd: null, invDebug: false, dailyRun: false,
  uiState: { alpha: 0, aimPlan: null, aimOn: false, ghost: null, countdown: 0, fps: '' },
};
window.__dash = app; app.BotClass = Bot;

// ------------------------------------------------------------------ sauvegarde
function storage() { try { const s = window.localStorage; s.getItem('x'); return s; } catch { return null; } }
app.persist = () => { if (!app.storage || !writeSave(app.storage, app.save)) { if (!app.saveFailed) { app.saveFailed = true; app.ui && app.ui.toast('Sauvegarde impossible'); } } };
app.persistSoon = () => { clearTimeout(app.pT); app.pT = setTimeout(app.persist, 400); };
app.resetSave = () => { const st = app.save.settings; app.save = defaultSave(); app.save.settings = st; refreshDaily(app.save); app.persist(); app.applySettings(); };

// ------------------------------------------------------------------ réglages
app.reduced = () => { const r = app.save.settings.reducedMotion; return r === 'yes' || (r === 'system' && matchMedia('(prefers-reduced-motion: reduce)').matches); };
app.applySettings = () => {
  const st = app.save.settings, red = app.reduced();
  app.audio.setVolumes(st.sfx, st.music); app.haptics.enabled = !!st.vibration;
  app.renderer.setMotion(red); if (app.sim) app.sim.reduced = red;
  document.documentElement.dataset.rm = st.reducedMotion === 'system' ? '' : st.reducedMotion === 'yes' ? '1' : '0';
  document.documentElement.dataset.cb = st.colorblind ? '1' : '0';
  if (app.renderer.cb !== !!st.colorblind) app.renderer.setColorblind(!!st.colorblind);
  const cap = st.fps === '60'; if (cap !== app.fpsCap) { app.ivN = 0; app.ft.n = 0; } app.fpsCap = cap;
  if (app.sim) app.sim.assist = st.aimAssist;
};
app.setQuality = q => { q = Math.max(0, Math.min(3, q)); const ch = q !== app.quality; app.quality = q; app.renderer.setLow(q >= 3); if (ch) resize(); };

// ------------------------------------------------------------------ taille
const canvas = document.getElementById('game');
function readSafe() { const cs = getComputedStyle(document.getElementById('probe')); return { top: parseFloat(cs.paddingTop) || 0, right: parseFloat(cs.paddingRight) || 0, bottom: parseFloat(cs.paddingBottom) || 0, left: parseFloat(cs.paddingLeft) || 0 }; }
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, QDPR[app.quality]);
  app.renderer.resize(window.innerWidth, window.innerHeight, dpr, readSafe());
  const land = matchMedia('(orientation: landscape) and (max-height: 540px)').matches;
  document.getElementById('rotate').classList.toggle('on', land);
  if (land && app.mode === 'game' && !app.paused) app.pause();
}

// ------------------------------------------------------------------ parties
function simCfg(zone, tension, extra = {}) {
  const s = app.save;
  return Object.assign({ zone, tension, sil: s.silhouettes.selected, atelier: s.atelier, seed: (Date.now() ^ (Math.random() * 1e9)) >>> 0,
    unlocked: s.cards.unlocked, assist: s.settings.aimAssist, reduced: app.reduced(), invincible: app.invDebug }, extra);
}
app.playSelected = () => {
  const s = app.save;
  if (!s.flags.tutorialDone) { app.startGame(0, 0, { prologue: true }); return; }
  app.startGame(ZONE_IDS.indexOf(s.selected.zone), s.selected.tension, {});
};
app.playDaily = () => { const d = dailyConfig(app.save); app.startGame(d.zone, 0, { seed: d.seed, daily: { mod: d.mod } }); };
app.startGame = (zone, tension, extra) => {
  if (!app.save.zones[ZONE_IDS[zone]].unlocked) zone = 0;
  app.dailyRun = !!(extra && extra.daily);
  app.runArgs = [zone, tension, extra];
  app.sim = new Sim(simCfg(zone, tension, extra));
  app.renderer.reset(); app.renderer.offerAnim.pick = -1;
  app.mode = 'game'; app.paused = false; app.endAt = -1; app.gesture.cancel(app.gesture.id); app.gesture.ignoreId = -1;
  app.ui.hide();
  app.audio.setMusic('game'); app.audio.pauseMusic(false); app.audio.setCard(false);
  app.last = performance.now();
};
app.replay = () => { app.persist(); const [z, t, e] = app.runArgs || [0, 0, {}]; app.startGame(z, t, Object.assign({}, e, { prologue: false })); };
app.pause = () => { if (app.mode !== 'game' || !app.sim || app.sim.over) return; app.paused = true; app.gesture.cancel(app.gesture.id); app.audio.pauseMusic(true); app.ui.go('pause'); app.persist(); };
app.resume = () => { if (app.mode !== 'game') return; app.paused = false; app.sim.resumeCountdown(0.9); app.ui.hide(); app.audio.pauseMusic(false); app.last = performance.now(); };
app.quitRun = () => { app.paused = false; app.endGame(); };
app.endGame = () => {
  const sim = app.sim, result = sim.result();
  const summary = endRun(app.save, result, { daily: app.dailyRun });
  app.persist();
  app.mode = 'end'; app.lastEnd = { result, summary };
  app.audio.setMusic('menu'); app.audio.pauseMusic(false);
  app.ui.go('end', app.lastEnd);
  if (summary.newRecord || result.victory) app.audio.play('fanfare');
};
app.toMenu = () => { app.mode = 'menu'; app.sim = null; app.audio.setMusic('menu'); app.newDemo(); };
app.onZone = () => app.newDemo();
app.newDemo = () => {
  const z = Math.max(0, ZONE_IDS.indexOf(app.save.selected.zone));
  app.demo = new Sim({ zone: z, seed: (Math.random() * 1e9) >>> 0, invincible: true, reduced: app.reduced() });
  app.bot = new Bot(app.demo, { skill: 0.7, seed: 1 });
  app.renderer.reset();
};

// ------------------------------------------------------------------ événements de sim → rendu, audio, vibration, indices
function handleEvents(sim, sound) {
  const r = app.renderer, a = app.audio, h = app.haptics, s = app.save;
  for (let i = 0; i < sim.ev.n; i++) {
    const e = sim.ev.items[i];
    r.onEvent(e, sim);
    if (!sound) continue;
    switch (e.type) {
      case EV.DASH: a.play('dash', (e.x / 180) - 1); h.vibrate(6); break;
      case EV.DRY: a.play('dry'); h.vibrate(4); break;
      case EV.CUT: a.play('cut'); h.vibrate(10, 'kill', 60); break;
      case EV.KILL: if (e.c !== 0) a.play('boom', sim.P.chain - 1, 1); break;
      case EV.MULTI: h.vibrate(e.a >= 6 ? [20, 25, 20, 25, 40] : [14, 30, 22], 'multi'); break;
      case EV.TIER: a.play('tier', e.a); a.setTier(e.a); h.vibrate([18, 40, 30], 'tier'); break;
      case EV.PARRY: a.play('clang'); h.vibrate([30, 20, 10]); break;
      case EV.BULLET_CUT: a.play('bullet'); break;
      case EV.GLASS: a.play('glass'); break;
      case EV.CHAIN_BREAK: a.play('chainBreak'); a.setTier(1); if (!s.flags.hints.chain) { s.flags.hints.chain = true; r.showHint('Moins de 0,5 s entre deux traits'); } break;
      case EV.WINDOW_TICK: a.play('tick'); break;
      case EV.HURT: case EV.FALL: a.play('hurt'); a.noteIdx = 0; a.setTier(1); h.vibrate([60, 40, 90]); break;
      case EV.DEATH: a.play('death'); a.setMusic('off'); h.vibrate([120, 60, 200]); break;
      case EV.LEVEL: a.play('level'); break;
      case EV.OFFER: a.setCard(true); app.gesture.ignoreCurrent(); if (!s.flags.hints.card) { s.flags.hints.card = true; r.showHint('Choisis : le temps est suspendu', 2.5); } break;
      case EV.CARD: a.play('card'); a.setCard(sim.offer.open); break;
      case EV.EVOLVE: a.play('evolve'); h.vibrate([30, 30, 60]); break;
      case EV.TELE: a.play('tele', e.a); break;
      case EV.FIRE: a.play('fire'); break;
      case EV.SLAM: case EV.PISTON: case EV.SHELL: a.play('slam'); if (e.type === EV.PISTON) h.vibrate(20, 'p', 200); break;
      case EV.BEAM: a.play('beam'); break;
      case EV.BOOM: case EV.WAVE: a.play('wave'); break;
      case EV.SUPER: a.play('super'); break;
      case EV.BOSS_IN: a.setMusic('boss', 1); break;
      case EV.BOSS_PHASE: a.setMusic('boss', Math.min(3, e.a || 1)); break;
      case EV.BOSS_HIT: a.play('gong'); h.vibrate(35); break;
      case EV.RUPTURE: a.play('rupture'); break;
      case EV.BOSS_DEAD: a.play('fanfare'); break;
      case EV.SPAWN: if (e.s === 'boucl' && !s.flags.hints.shield && s.flags.tutorialDone) { s.flags.hints.shield = true; r.showHint('Bouclier : contourne-le, frappe de dos'); } break;
    }
  }
  // dominos : chaque explosion joue la note suivante de la Chaîne
  sim.clearEvents();
}

// ------------------------------------------------------------------ boucle : sim 1/60 s, rendu natif (60/90/120/144 Hz) interpolé
function frame(now) {
  requestAnimationFrame(frame);
  if (app.fpsCap) { if (now < app.nextRender - 2) return; app.nextRender = Math.max(app.nextRender + 1000 / 60, now - 1000 / 60); }
  const w0 = performance.now();
  let rdt = (now - app.last) / 1000; app.last = now; if (!(rdt > 0)) rdt = 0;
  const raw = rdt; rdt = Math.min(0.05, rdt);
  const r = app.renderer, sim = app.sim, U = app.uiState;
  app.renders++;
  if (app.collectTexts) r.textRects = [];
  if ((app.mode === 'game' || app.mode === 'end') && sim) {
    if (app.mode === 'game' && !app.paused) {
      updateAim(sim);
      sim.aiming = app.aimOn && app.aimPlan.ok;
      app.steps += sim.frame(rdt);
      handleEvents(sim, true);
      // musique : passe-bas si immobile > 1 s sans Chaîne
      app.audio.setIdle(sim.P.chain === 0 && sim.P.idleT > 1 ? Math.max(0, 1 - (sim.P.idleT - 1)) : 1);
      if (app.aimOn && app.aimPlan.ok) app.audio.play('aim', Math.min(1, app.aimPlan.L / sim.stats.Lmax));
      if (sim.over && app.endAt < 0) app.endAt = now; // sim.over arrive après ~0,6 s de ralenti de mort
      if (app.endAt > 0 && now >= app.endAt) { app.endAt = -1; app.endGame(); }
      trackPeaks(sim);
    }
    if (r.offerAnim.pick >= 0) { r.offerAnim.t += rdt; if (r.offerAnim.t > 0.3) r.offerAnim.pick = -1; }
    r.update(app.paused ? 0 : rdt, sim);
    U.alpha = app.paused ? 1 : sim.alpha; U.aimPlan = app.aimPlan; U.aimOn = app.aimOn; U.ghost = app.ghost; U.countdown = sim.countdown;
    U.fps = app.save.settings.showFps || DEBUG ? app.fpsStr : '';
    r.drawGame(sim, U);
  } else {
    const d = app.demo;
    if (d) {
      app.bot.update(rdt); d.frame(rdt); handleEvents(d, false); r.update(rdt, d);
      if (d.over || d.time > 90) app.newDemo();
      r.drawMenu(d);
    } else r.drawMenu(null);
  }
  if (app.collectTexts) app.lastTexts = r.textRects;
  measure(raw * 1000, performance.now() - w0);
}
function trackPeaks(sim) {
  const p = app.peak; let e = 0, b = 0;
  for (const q of sim.enemies) if (q.on) e++; for (const q of sim.bullets) if (q.on) b++;
  if (e > p.enemies) p.enemies = e; if (b > p.bullets) p.bullets = b; if (app.renderer.pn > p.particles) p.particles = app.renderer.pn;
}
// Qualité adaptative (technique PULSAR v2) : budget = intervalle réel des frames ; descend ET remonte.
function measure(ms, work) {
  if (ms <= 0 || ms > 1000) return;
  const fs = app.frameStats; fs.n++; fs.sum += ms; fs.work += work;
  if (!app.fpsCap) { app.iv[app.ivI] = ms; app.ivI = (app.ivI + 1) % 120; if (app.ivN < 120) app.ivN++; }
  app.fpsAcc += ms; app.fpsN++;
  if (app.fpsAcc > 500) {
    app.fps = 1000 * app.fpsN / app.fpsAcc; app.fpsAcc = 0; app.fpsN = 0;
    app.fpsStr = `${app.fps.toFixed(0)} FPS · ${(1000 / app.refreshMs).toFixed(0)} Hz · Q${app.quality}` + (DEBUG && app.sim ? ` · E${app.peak.enemies} B${app.peak.bullets} P${app.renderer.pn}` : '');
  }
  const f = app.ft;
  if (app.mode !== 'game' || app.paused) { f.sum = f.n = f.t = f.work = f.late = 0; return; }
  const budget = app.fpsCap ? Math.max(16.67, app.refreshMs) : app.refreshMs;
  f.sum += ms; f.n++; f.t += ms; f.work += work; if (ms > budget * 1.5) f.late++;
  if (f.t >= 2000) {
    if (app.ivN >= 60) { const a = app.ivSort; for (let i = 0; i < app.ivN; i++) a[i] = app.iv[i]; const sub = a.subarray(0, app.ivN); sub.sort(); const p20 = sub[Math.floor(app.ivN * 0.2)]; app.refreshMs = p20 < app.refreshMs ? p20 : app.refreshMs + (p20 - app.refreshMs) * 0.15; }
    const avgWork = f.work / f.n, late = f.late / f.n, avg = f.sum / f.n;
    app.lastQ = { budget: +budget.toFixed(2), avgWork: +avgWork.toFixed(2), late: +late.toFixed(3) };
    if (f.cool > 0) f.cool -= f.t;
    if ((late > 0.25 || avgWork > budget * 0.85 || avg > budget * 1.05) && app.quality < 3) { app.setQuality(app.quality + 1); f.good = 0; f.cool = 12000; }
    else if (avgWork < budget * 0.45 && late < 0.05 && app.quality > 0 && f.cool <= 0) { f.good += f.t; if (f.good >= 6000) { app.setQuality(app.quality - 1); f.good = 0; } }
    else f.good = 0;
    f.sum = f.n = f.t = f.work = f.late = 0;
  }
}

// ------------------------------------------------------------------ visée (ligne de visée = plan exact du trait)
function updateAim(sim) {
  const g = app.gesture;
  g.setParams(app.save.settings.gain, sim.stats.Lmax);
  app.aimOn = g.active && g.aiming && !sim.offer.open;
  if (!app.aimOn) return;
  const o = sim.aimOrigin(app.pt);
  const coudes = sim.cardLv('coude') ? CAP.coudeN[sim.cardLv('coude')] : 0;
  let n = 1;
  if (coudes) { n = g.bent(coudes, app.vec); if (n < 2) n = 1; }
  if (n === 1) g.vector(app.vec);
  app.aimN = n;
  sim.planFor(app.aimPlan, o.x, o.y, 0, app.vec, n);
}

// ------------------------------------------------------------------ entrées
const S = () => app.renderer.s;
function inRect(x, y, r, pad = 0) { return x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad; }
function inPause(x, y) { const p = app.renderer.hudRects().pause; return inRect(x, y, p, 4); }
canvas.addEventListener('pointerdown', ev => {
  app.audio.unlock();
  ev.preventDefault();
  if (app.mode !== 'game' || !app.sim || app.paused) return;
  const sim = app.sim, x = ev.clientX, y = ev.clientY, r = app.renderer;
  if (inPause(x, y)) { app.pause(); return; }
  if (sim.tuto && inRect(x, y, r.hudRects().skip)) { sim.skipPrologue(); return; }
  if (sim.offer.open) {
    if (sim.offer.t < 0.35) return; // anti faux-tap
    const rects = r.cardRects(sim.offer.ids.length);
    for (let i = 0; i < rects.length; i++) if (inRect(x, y, rects[i])) { r.offerAnim.ids = sim.offer.ids.slice(); r.offerAnim.pick = i; r.offerAnim.t = 0; sim.chooseCard(i); app.haptics.vibrate(15); return; }
    if (sim.offer.rerolls > 0 && !sim.offer.start && inRect(x, y, r.rerollRect(sim.offer.ids.length))) { sim.reroll(); app.audio.play('ui'); }
    return;
  }
  if (app.gesture.active) { if (DEBUG) { app.invDebug = !app.invDebug; sim.invincible = app.invDebug; } return; }
  app.gesture.down(ev.pointerId, x / S(), y / S(), ev.timeStamp || performance.now());
  app.ghost = { ax: x, ay: y, fx: x, fy: y };
  try { canvas.setPointerCapture(ev.pointerId); } catch { /* */ }
}, { passive: false });
canvas.addEventListener('pointermove', ev => {
  const g = app.gesture; if (ev.pointerId !== g.id) return;
  const list = ev.getCoalescedEvents ? ev.getCoalescedEvents() : null;
  if (list && list.length) for (const c of list) g.move(ev.pointerId, c.clientX / S(), c.clientY / S(), c.timeStamp || ev.timeStamp);
  else g.move(ev.pointerId, ev.clientX / S(), ev.clientY / S(), ev.timeStamp);
  if (app.ghost) { app.ghost.ax = g.ax * S(); app.ghost.ay = g.ay * S(); app.ghost.fx = ev.clientX; app.ghost.fy = ev.clientY; }
}, { passive: true });
function release(ev, cancel) {
  const g = app.gesture;
  if (ev.pointerId !== g.id) { if (ev.pointerId === g.ignoreId) g.ignoreId = -1; return; }
  app.ghost = null;
  if (cancel || !app.sim || app.mode !== 'game') { g.cancel(ev.pointerId); return; }
  const sim = app.sim, res = g.up(ev.pointerId, ev.clientX / S(), ev.clientY / S(), ev.timeStamp || performance.now());
  app.aimOn = false; sim.aiming = false;
  if (!res) return;
  if (res.kind === 'vec') {
    const coudes = sim.cardLv('coude') ? CAP.coudeN[sim.cardLv('coude')] : 0;
    let n = 1; if (coudes) { n = g.bent(coudes, app.vec); if (n < 2) { n = 1; app.vec[0] = res.vecs[0]; app.vec[1] = res.vecs[1]; } } else { app.vec[0] = res.vecs[0]; app.vec[1] = res.vecs[1]; }
    sim.requestDash(app.vec, n);
  } else if (res.kind === 'tap' && app.save.settings.tapDash) {
    const px = res.x * S(), py = res.y * S(), r = app.renderer;
    if (py < r.AY || py > r.PADY) return; // tap dans le pad : ignoré
    const p = r.toArena(px, py); sim.requestTap(p.x, p.y);
  }
}
canvas.addEventListener('pointerup', ev => release(ev, false));
canvas.addEventListener('pointercancel', ev => release(ev, true));
canvas.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('gesturestart', e => e.preventDefault());
window.addEventListener('keydown', ev => {
  if (ev.code === 'Escape' || ev.code === 'KeyP') { if (app.mode === 'game') app.paused ? app.resume() : app.pause(); }
  if (DEBUG && ev.code === 'KeyD') { app.renderer.showGrid = !app.renderer.showGrid; }
});

// ------------------------------------------------------------------ cycle de vie
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { if (app.mode === 'game' && !app.paused) app.pause(); app.persist(); app.audio.suspend(); }
  else { app.audio.resume(); app.last = performance.now(); if (refreshDaily(app.save, localDateStr())) { app.persist(); app.ui.refresh(); } }
});
window.addEventListener('pagehide', () => app.persist());
window.addEventListener('resize', resize);
matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', () => app.applySettings());

function boot() {
  app.storage = storage();
  const loaded = app.storage ? loadSave(app.storage) : { save: defaultSave(), source: 'new' };
  app.save = loaded.save;
  refreshDaily(app.save, localDateStr());
  app.renderer = new Renderer(canvas); app.renderer.debug = DEBUG;
  app.audio = new Audio(); app.haptics = new Haptics();
  // chaque explosion des dominos joue la note suivante de la Chaîne (ré mineur pentatonique)
  app.renderer.onBoom = () => { if (app.mode === 'game') app.audio.play('boom', app.audio.noteIdx++, 1); };
  app.ui = new UI(app);
  resize(); app.applySettings();
  app.newDemo();
  app.audio.setMusic('menu');
  app.ui.go('title');
  if (loaded.source === 'backup') app.ui.toast('Sauvegarde restaurée');
  else if (loaded.source === 'reset') app.ui.toast('Nouvelle sauvegarde');
  app.persist();
  app.last = performance.now();
  requestAnimationFrame(frame);
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => { /* hors ligne indisponible */ });
}
boot();
export { ZONES, GESTURE };
