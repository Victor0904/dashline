// Défis permanents, contrats du jour, Trait du jour (GAME_DESIGN §11).
import { mulberry32, fnv1a, localDateStr, dayOfYear } from '../core/rng.js';
import { ZONE_IDS } from '../core/data.js';
import { EVO_IDS } from '../core/cards.js';

// check(r = résultat de partie, s = sauvegarde APRÈS mise à jour des cumuls)
export const DEFIS = [
  { id: 'D1', text: 'Premier trait : tuer un ennemi', reward: 10, check: r => r.kills >= 1 },
  { id: 'D2', text: 'TRIPLÉ : 3 kills en un dash', reward: 30, unlock: ['velocite'], check: r => r.bestMulti >= 3 },
  { id: 'D3', text: 'Chaîne 25', reward: 50, unlock: ['predateur'], check: r => r.bestChain >= 25 },
  { id: 'D4', text: 'Chaîne 60', reward: 150, unlock: ['lien'], sil: 'ombre', check: r => r.bestChain >= 60 },
  { id: 'D5', text: 'Chaîne 120', reward: 400, check: r => r.bestChain >= 120 },
  { id: 'D6', text: 'CARNAGE 6 en un dash', reward: 100, unlock: ['coude'], check: r => r.bestMulti >= 6 },
  { id: 'D7', text: 'Nettoyer le Dojo', reward: 100, unlock: ['echo'], sil: 'masse', check: r => r.victory && r.zone === 0 },
  { id: 'D8', text: 'Nettoyer les Docks', reward: 200, unlock: ['surcharge'], check: r => r.victory && r.zone === 1 },
  { id: 'D9', text: 'Nettoyer la Verrière', reward: 300, check: r => r.victory && r.zone === 2 },
  { id: 'D10', text: 'Nettoyer le Vide', reward: 600, check: r => r.victory && r.zone === 3 },
  { id: 'D11', text: 'Sans faute : une arène sans être touché', reward: 40, unlock: ['fantome'], check: r => r.noHitArenas >= 1 },
  { id: 'D12', text: 'Battre un boss sans être touché', reward: 300, check: r => r.bossNoHit },
  { id: 'D13', text: 'Couper 200 balles (cumul)', reward: 80, unlock: ['butin'], target: 200, prog: s => s.challenges.progress.bulletsCut, check: (r, s) => s.challenges.progress.bulletsCut >= 200 },
  { id: 'D14', text: '5 Bavures (cumul)', reward: 60, target: 5, prog: s => s.challenges.progress.bavures, check: (r, s) => s.challenges.progress.bavures >= 5 },
  { id: 'D15', text: '1 000 kills (cumul)', reward: 150, target: 1000, prog: s => s.stats.kills, check: (r, s) => s.stats.kills >= 1000 },
  { id: 'D16', text: '10 000 kills (cumul)', reward: 600, target: 10000, prog: s => s.stats.kills, check: (r, s) => s.stats.kills >= 10000 },
  { id: 'D17', text: 'Obtenir une évolution', reward: 150, check: r => r.evolutions.length >= 1 },
  { id: 'D18', text: 'Obtenir les 6 évolutions', reward: 800, target: 6, prog: s => s.cards.evolutionsSeen.length, check: (r, s) => EVO_IDS.every(e => s.cards.evolutionsSeen.includes(e)) },
  { id: 'D19', text: 'Nettoyer une zone en Tension 5', reward: 500, check: r => r.victory && r.tension >= 5 },
  { id: 'D20', text: 'Battre le Trait en moins de 60 s', reward: 400, check: r => r.victory && r.zone === 3 && r.bossTime < 60 },
];
export const DEFI_BY_ID = Object.fromEntries(DEFIS.map(d => [d.id, d]));

// mode : 'sum' (cumul du jour) | 'max' (meilleure partie)
export const CONTRATS = [
  { id: 'C1', text: n => `Tuer ${n} ennemis`, target: 150, reward: 60, mode: 'sum', val: r => r.kills },
  { id: 'C2', text: n => `Atteindre une Chaîne de ${n}`, target: 30, reward: 80, mode: 'max', val: r => r.bestChain },
  { id: 'C3', text: n => `Faire ${n} TRIPLÉS`, target: 5, reward: 70, mode: 'sum', val: r => r.triples },
  { id: 'C4', text: n => `Couper ${n} balles`, target: 40, reward: 60, mode: 'sum', val: r => r.bulletsCut },
  { id: 'C5', text: n => `Atteindre l'arène ${n}`, target: 4, reward: 60, mode: 'max', val: r => r.arenaReached },
  { id: 'C6', text: () => 'Vaincre un boss', target: 1, reward: 120, mode: 'sum', val: r => (r.bossKilled ? 1 : 0) },
  { id: 'C7', text: n => `Briser ${n} vitres`, target: 20, reward: 50, mode: 'sum', val: r => r.glass },
  { id: 'C8', text: n => `Tuer ${n} Boucliers par le dos`, target: 10, reward: 70, mode: 'sum', val: r => r.backKills },
  { id: 'C9', text: n => `${n} arènes Sans faute`, target: 3, reward: 90, mode: 'sum', val: r => r.noHitArenas },
  { id: 'C10', text: n => `Tuer ${n} ennemis avec des cartes`, target: 60, reward: 70, mode: 'sum', val: r => r.cardKills },
  { id: 'C11', text: n => `Finir une partie au niveau ${n}`, target: 8, reward: 80, mode: 'max', val: r => r.level },
  { id: 'C12', text: () => 'Atteindre ×6', target: 1, reward: 100, mode: 'max', val: r => (r.maxMult >= 6 ? 1 : 0) },
];
export const CONTRAT_BY_ID = Object.fromEntries(CONTRATS.map(c => [c.id, c]));
export function contractText(c) { return CONTRAT_BY_ID[c.id].text(c.target); }

function zonesCleared(save) { let n = 0; for (const z of ZONE_IDS) if (save.zones[z].cleared) n++; return n; }
export function contractReward(save, c) { return Math.round(CONTRAT_BY_ID[c.id].reward * (1 + 0.25 * zonesCleared(save))); }

export function genContracts(dateStr) {
  const rng = mulberry32(fnv1a(dateStr)), pool = CONTRATS.map(c => c.id), out = [];
  while (out.length < 3) { const i = Math.floor(rng() * pool.length); out.push(pool.splice(i, 1)[0]); }
  return out.map(id => ({ id, target: CONTRAT_BY_ID[id].target, progress: 0, claimed: false }));
}
// renouvelle les contrats si la date a avancé ; une date qui recule ne change rien (on garde le jeu le plus récent)
export function refreshDaily(save, dateStr = localDateStr()) {
  const d = save.daily;
  if (d.date && dateStr <= d.date) return false;
  save.daily = { date: dateStr, contracts: genContracts(dateStr), rerolled: false, bonusClaimed: false, dailyRunDone: false };
  return true;
}
export function rerollContract(save, i) {
  const d = save.daily; if (d.rerolled || !d.contracts[i] || d.contracts[i].claimed) return false;
  const rng = mulberry32(fnv1a(d.date + ':relance'));
  const have = d.contracts.map(c => c.id), pool = CONTRATS.map(c => c.id).filter(id => !have.includes(id));
  const id = pool[Math.floor(rng() * pool.length)];
  d.contracts[i] = { id, target: CONTRAT_BY_ID[id].target, progress: 0, claimed: false };
  d.rerolled = true;
  return true;
}
export function applyContracts(save, r) {
  const changed = [];
  for (const c of save.daily.contracts) {
    if (c.claimed) continue;
    const def = CONTRAT_BY_ID[c.id], v = def.val(r), before = c.progress;
    c.progress = def.mode === 'sum' ? Math.min(c.target, c.progress + v) : Math.min(c.target, Math.max(c.progress, v));
    changed.push({ id: c.id, before, after: c.progress, target: c.target, done: c.progress >= c.target && before < c.target });
  }
  return changed;
}
export function claimContract(save, i) {
  const c = save.daily.contracts[i]; if (!c || c.claimed || c.progress < c.target) return 0;
  const v = contractReward(save, c); c.claimed = true; save.tessons += v; save.tessonsTotal += v;
  let bonus = 0;
  if (!save.daily.bonusClaimed && save.daily.contracts.every(q => q.claimed)) { save.daily.bonusClaimed = true; bonus = 100; save.tessons += 100; save.tessonsTotal += 100; }
  return v + bonus;
}
export function claimableCount(save) { return save.daily.contracts.filter(c => !c.claimed && c.progress >= c.target).length; }

// Trait du jour (§11.3)
export const DAILY_MODS = [
  { id: 'lmax', text: 'Lmax ×0,8' }, { id: 'fen', text: 'Fenêtre 0,4 s' }, { id: 'eclat', text: 'Tout explose (Éclatement I offert)' },
  { id: 'ricochet', text: 'Ricochet offert' }, { id: 'elites', text: 'Élites ×3' }, { id: 'noregen', text: 'Sans Élan régénéré : seuls les kills rechargent' },
];
export function dailyConfig(save, dateStr = localDateStr()) {
  const seed = fnv1a(dateStr);
  const unlocked = ZONE_IDS.filter(z => save.zones[z].unlocked).length;
  const zone = (dayOfYear(dateStr) % unlocked);
  const mod = DAILY_MODS[mulberry32(seed)() * DAILY_MODS.length | 0];
  return { seed, zone, mod: mod.id, modText: mod.text, date: dateStr };
}
