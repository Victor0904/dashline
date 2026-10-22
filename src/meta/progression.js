// Fin de partie : Tessons, records, défis, contrats, déblocages (GAME_DESIGN §10–§12).
import { ZONE_IDS, ZONES } from '../core/data.js';
import { CARDS, EVO_IDS } from '../core/cards.js';
import { emptyRecords } from './save.js';
import { tessonsFor, nextGoal, atelierComplete } from './economy.js';
import { DEFIS, applyContracts } from './challenges.js';
import { localDateStr } from '../core/rng.js';

export function recordsFor(save, zone, tension) {
  const z = ZONE_IDS[zone];
  if (!save.records[z]) save.records[z] = {};
  if (!save.records[z][tension]) save.records[z][tension] = emptyRecords();
  return save.records[z][tension];
}

// opts : { date, daily: bool }
export function endRun(save, r, opts = {}) {
  const date = opts.date || localDateStr();
  const zid = ZONE_IDS[r.zone], zs = save.zones[zid];
  const firstClear = r.victory && !zs.cleared;
  const T = tessonsFor(r, save, firstClear);
  const sum = { tessons: T, firstClear, newRecord: false, defis: [], unlocks: [], contracts: [], daily: null, goal: null, dailyBonus: 0 };
  let gain = T.grand;
  if (T.welcome) save.flags.welcomeBonusUsed = true;
  if (r.prologue) save.flags.tutorialDone = true;
  // Trait du jour : la première partie du jour rapporte +150
  if (opts.daily) {
    if (!save.daily.dailyRunDone) { save.daily.dailyRunDone = true; sum.dailyBonus = 150; gain += 150; }
    let d = save.records.daily.find(x => x.date === date);
    if (!d) { d = { date, score: 0 }; save.records.daily.push(d); }
    if (r.score > d.score) d.score = r.score;
    save.records.daily.sort((a, b) => (a.date < b.date ? 1 : -1)); save.records.daily.length = Math.min(7, save.records.daily.length);
    sum.daily = d;
  }
  save.tessons += gain; save.tessonsTotal += gain;
  // stats & cumuls
  const st = save.stats;
  st.runs++; st.playTimeS += Math.round(r.duration); st.kills += r.kills; st.dashes += r.dashes; if (r.bossKilled) st.bosses++;
  st.bestLevel = Math.max(st.bestLevel || 0, r.level);
  const g = save.records.global;
  g.runs = st.runs; g.kills = st.kills; g.playTimeS = st.playTimeS;
  g.bulletsCut = (g.bulletsCut || 0) + r.bulletsCut;
  g.bestChain = Math.max(g.bestChain, r.bestChain); g.bestMulti = Math.max(g.bestMulti, r.bestMulti);
  save.challenges.progress.bulletsCut += r.bulletsCut; save.challenges.progress.bavures += r.bavures;
  for (const e of r.evolutions) if (!save.cards.evolutionsSeen.includes(e)) save.cards.evolutionsSeen.push(e);
  // records de zone / Tension
  if (!r.daily) {
    const rec = recordsFor(save, r.zone, r.tension);
    const best = rec.top.length ? rec.top[0].score : 0;
    if (r.score > best && r.score > 0) sum.newRecord = true;
    rec.top.push({ score: r.score, date, sil: r.sil, chain: r.bestChain });
    rec.top.sort((a, b) => b.score - a.score); rec.top.length = Math.min(5, rec.top.length);
    rec.bestChain = Math.max(rec.bestChain, r.bestChain);
    if (r.victory) {
      if (rec.bestClear === null || r.duration < rec.bestClear) rec.bestClear = Math.round(r.duration * 10) / 10;
      if (rec.bestBoss === null || r.bossTime < rec.bestBoss) rec.bestBoss = Math.round(r.bossTime * 10) / 10;
      if (r.hits === 0) rec.noHit = true;
    }
  }
  // zones & Tension
  if (r.victory && !r.daily) {
    zs.cleared = true;
    zs.tensionMax = Math.min(5, Math.max(zs.tensionMax, r.tension + 1));
    const next = ZONE_IDS[r.zone + 1];
    if (next && !save.zones[next].unlocked) { save.zones[next].unlocked = true; sum.unlocks.push({ kind: 'zone', id: next, name: ZONES[r.zone + 1].name }); }
  }
  // défis
  for (const d of DEFIS) {
    if (save.challenges.done.includes(d.id)) continue;
    if (!d.check(r, save)) continue;
    save.challenges.done.push(d.id);
    save.tessons += d.reward; save.tessonsTotal += d.reward;
    sum.defis.push(d.id);
    for (const c of d.unlock || []) if (!save.cards.unlocked.includes(c)) { save.cards.unlocked.push(c); sum.unlocks.push({ kind: 'card', id: c, name: CARDS[c].name }); }
    if (d.sil) sum.unlocks.push({ kind: 'sil', id: d.sil, name: d.sil === 'ombre' ? 'Ombre' : 'Masse' });
  }
  if (save.daily.contracts.length) sum.contracts = applyContracts(save, r);
  sum.goal = nextGoal(save);
  sum.complete = atelierComplete(save);
  return sum;
}
export { EVO_IDS };
