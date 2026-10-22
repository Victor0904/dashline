// Économie (GAME_DESIGN §10) : Tessons de fin de partie, Atelier, Silhouettes, prochain objectif.
import { ZONES, SILHOUETTES } from '../core/data.js';

// Levier unique d'équilibrage de la méta (§10.2) : coefficient global sur tous les coûts (arrondi à 10).
export const K_COST = 2.1;

export const ATELIER = {
  portee: { branch: 'LAME', name: 'Portée', costs: [30, 120, 350, 800, 1600], fx: l => `Lmax +${10 * l} u` },
  tranchant: { branch: 'LAME', name: 'Tranchant', costs: [60, 250, 700, 1500], fx: l => `Coupe +${(1.5 * l).toFixed(1).replace('.', ',')} u` },
  sangFroid: { branch: 'LAME', name: 'Sang-froid', costs: [80, 300, 750, 1500, 2600], fx: l => `Fenêtre +${(0.025 * l).toFixed(3).replace('.', ',')} s` },
  elan: { branch: 'LAME', name: 'Élan', costs: [400, 2500], fx: l => `+${l} charge${l > 1 ? 's' : ''}` },
  garde: { branch: 'CORPS', name: 'Garde', costs: [500, 3000], fx: l => `+${l} PV max` },
  souffle: { branch: 'CORPS', name: 'Souffle', costs: [50, 200, 600, 1300], fx: l => `Élan −${(0.05 * l).toFixed(2).replace('.', ',')} s` },
  instinct: { branch: 'CORPS', name: 'Instinct', costs: [150, 500, 1200, 2400], fx: l => l ? `Ralenti réflexe, recharge ${[0, 12, 10, 8, 6][l]} s` : 'Ralenti réflexe' },
  secondeChance: { branch: 'CORPS', name: 'Seconde chance', costs: [3500], fx: l => l ? '1 résurrection / partie' : 'Résurrection' },
  savoir: { branch: 'ESPRIT', name: 'Savoir', costs: [40, 180, 500, 1100], fx: l => `XP +${8 * l} %` },
  butin: { branch: 'ESPRIT', name: 'Butin', costs: [100, 300, 700, 1400, 2500], fx: l => `Tessons +${6 * l} %` },
  relance: { branch: 'ESPRIT', name: 'Relance', costs: [120, 600, 1800], fx: l => `${l} relance${l > 1 ? 's' : ''} de cartes` },
  eventail: { branch: 'ESPRIT', name: 'Éventail', costs: [4000], fx: l => l ? '4 cartes proposées' : '3 → 4 cartes' },
  departArme: { branch: 'ESPRIT', name: 'Départ armé', costs: [900], fx: l => l ? '1 carte commune au départ' : 'Carte de départ' },
};
export const ATELIER_IDS = Object.keys(ATELIER);
export const BRANCHES = ['LAME', 'CORPS', 'ESPRIT'];
export function cost(id, level) { const c = ATELIER[id].costs[level]; return c === undefined ? null : Math.round(c * K_COST / 10) * 10; }
export function maxLevel(id) { return ATELIER[id].costs.length; }
export function cheapestCost() { let m = Infinity; for (const id of ATELIER_IDS) m = Math.min(m, cost(id, 0)); return m; }
export function baseAtelierCost() { let t = 0; for (const id of ATELIER_IDS) for (const c of ATELIER[id].costs) t += c; return t; }
export function totalAtelierCost() { let t = 0; for (const id of ATELIER_IDS) for (let l = 0; l < maxLevel(id); l++) t += cost(id, l); return t; }
export function totalSilCost() { return silCost("masse") + silCost("ombre"); }

export function canBuy(save, id) { const l = save.atelier[id] || 0, c = cost(id, l); return c !== null && save.tessons >= c; }
export function buy(save, id) {
  const l = save.atelier[id] || 0, c = cost(id, l);
  if (c === null || save.tessons < c) return false;
  save.tessons -= c; save.atelier[id] = l + 1; return true;
}
// Silhouettes : condition (§5) puis achat
export function silCondition(save, id) {
  if (id === 'masse') return save.zones.dojo.cleared;
  if (id === 'ombre') return save.records.global.bestChain >= 60;
  return true;
}
export function silConditionText(id) { return id === 'masse' ? 'Nettoyer le Dojo' : id === 'ombre' ? 'Atteindre une Chaîne de 60' : ''; }
export function canBuySil(save, id) { return !save.silhouettes.owned.includes(id) && silCondition(save, id) && save.tessons >= silCost(id); }
export function silCost(id) { return Math.round(SILHOUETTES[id].cost * K_COST / 10) * 10; }
export function buySil(save, id) {
  if (!canBuySil(save, id)) return false;
  save.tessons -= silCost(id); save.silhouettes.owned.push(id); return true;
}
export function anyAffordable(save) {
  for (const id of ATELIER_IDS) if (canBuy(save, id)) return true;
  for (const id of ['masse', 'ombre']) if (canBuySil(save, id)) return true;
  return false;
}
// prochain objectif : amélioration abordable la moins chère, sinon la plus proche
export function nextGoal(save) {
  let best = null;
  for (const id of ATELIER_IDS) {
    const l = save.atelier[id] || 0, c = cost(id, l); if (c === null) continue;
    if (!best || c < best.cost) best = { id, name: ATELIER[id].name, level: l + 1, cost: c };
  }
  if (!best) return null;
  best.affordable = save.tessons >= best.cost; best.missing = Math.max(0, best.cost - save.tessons);
  return best;
}
export function atelierComplete(save) {
  for (const id of ATELIER_IDS) if ((save.atelier[id] || 0) < maxLevel(id)) return false;
  return save.silhouettes.owned.length >= 3;
}

// Tessons d'une partie (§10.1) — détail ligne à ligne pour l'écran de fin
export function tessonsFor(result, save, firstClear) {
  const lines = [];
  const add = (k, label, v) => { if (v) lines.push({ k, label, v }); return v; };
  let base = 0;
  base += add('kills', `Kills × 1`, result.kills);
  base += add('elites', `Élites × 4`, result.elites * 4);
  base += add('arenas', `Arènes × 12`, result.arenasCleared * 12);
  base += add('boss', 'Boss', result.bossKilled ? 80 + (firstClear ? 80 : 0) : 0);
  base += add('chain', `Chaîne ${result.bestChain}`, Math.floor(result.bestChain / 5) * 3);
  base += add('score', 'Score', Math.floor(result.score / 2000));
  const zk = ZONES[result.zone].tess, tk = 1 + 0.2 * (result.tension || 0), ak = 1 + 0.06 * (save.atelier.butin || 0), ck = 1 + 0.04 * (result.butinLv || 0);
  const total = Math.ceil(base * zk * tk * ak * ck);
  const mult = zk * tk * ak * ck;
  // prime de bienvenue : la toute 1re partie est complétée jusqu'au coût de l'amélioration la moins chère
  let welcome = 0; const cheapest = cheapestCost();
  if (!save.flags.welcomeBonusUsed && save.stats.runs === 0 && total < cheapest) welcome = cheapest - total;
  return { lines, base, mult, total, welcome, grand: total + welcome };
}
