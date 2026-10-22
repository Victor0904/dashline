// Sauvegarde localStorage (GAME_DESIGN §13) : checksum FNV-1a, copie de secours, migration versionnée + fusion profonde.
import { fnv1a, localDateStr } from '../core/rng.js';
import { START_CARDS } from '../core/cards.js';

export const SAVE_KEY = 'dashline.save';
export const BAK_KEY = 'dashline.save.bak';
// v1 = schéma de la spec ; v2 = indices d'onboarding (1er bouclier, 1re carte, 1re Chaîne rompue), stats étendues, réglage qualité.
export const CURRENT = 2;

export function emptyRecords() { return { top: [], bestChain: 0, bestClear: null, bestBoss: null, noHit: false }; }

export function defaultSave() {
  return {
    v: CURRENT, sum: '',
    tessons: 0, tessonsTotal: 0,
    atelier: { portee: 0, tranchant: 0, sangFroid: 0, elan: 0, garde: 0, souffle: 0, instinct: 0, secondeChance: 0, savoir: 0, butin: 0, relance: 0, eventail: 0, departArme: 0 },
    silhouettes: { owned: ['fil'], selected: 'fil' },
    cards: { unlocked: START_CARDS.slice(), evolutionsSeen: [] },
    zones: {
      dojo: { unlocked: true, cleared: false, tensionMax: 0 },
      docks: { unlocked: false, cleared: false, tensionMax: 0 },
      verriere: { unlocked: false, cleared: false, tensionMax: 0 },
      vide: { unlocked: false, cleared: false, tensionMax: 0 },
    },
    selected: { zone: 'dojo', tension: 0 },
    records: { dojo: { 0: emptyRecords() }, global: { bestChain: 0, bestMulti: 0, kills: 0, runs: 0, playTimeS: 0, bulletsCut: 0 }, daily: [] },
    challenges: { done: [], progress: { bulletsCut: 0, bavures: 0 } },
    daily: { date: '', contracts: [], rerolled: false, bonusClaimed: false, dailyRunDone: false },
    stats: { runs: 0, playTimeS: 0, kills: 0, dashes: 0, bosses: 0, bestLevel: 0 },
    settings: { sfx: 0.8, music: 0.6, vibration: true, reducedMotion: 'system', fps: 'auto', gain: 2.5, tapDash: true, aimAssist: 'normal', colorblind: false, showFps: false },
    flags: { tutorialDone: false, welcomeBonusUsed: false, hints: { shield: false, card: false, chain: false } },
  };
}

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const clone = v => JSON.parse(JSON.stringify(v));
export function deepMerge(def, obj) {
  if (!isObj(obj)) return clone(def);
  const out = clone(def);
  for (const k of Object.keys(obj)) {
    if (isObj(def[k]) && isObj(obj[k])) out[k] = deepMerge(def[k], obj[k]);
    else if (obj[k] !== undefined) out[k] = obj[k];
  }
  return out;
}

export const MIGRATIONS = {
  // v0 (sans numéro) → v1 : on garde tout, la fusion avec les valeurs par défaut complète le reste
  0: s => Object.assign({}, s, { v: 1 }),
  // v1 → v2 : indices d'onboarding (si le tutoriel est fait, les indices de base sont considérés vus), stats étendues
  1: s => {
    const o = Object.assign({}, s, { v: 2 });
    const done = !!(s.flags && s.flags.tutorialDone);
    o.flags = Object.assign({}, s.flags || {}, { hints: { shield: done, card: done, chain: done } });
    const st = s.stats || {};
    o.records = Object.assign({}, s.records || {});
    o.records.global = Object.assign({ kills: st.kills || 0, runs: st.runs || 0, playTimeS: st.playTimeS || 0, bulletsCut: (s.challenges && s.challenges.progress && s.challenges.progress.bulletsCut) || 0 }, (s.records && s.records.global) || {});
    return o;
  },
};

export function migrate(save) {
  let s = isObj(save) ? save : {};
  if (typeof s.v !== 'number') s = Object.assign({}, s, { v: 0 });
  while (s.v < CURRENT) s = MIGRATIONS[s.v](s);
  const merged = deepMerge(defaultSave(), s);
  merged.v = CURRENT;
  // normalisation
  merged.zones.dojo.unlocked = true;
  if (!merged.silhouettes.owned.includes('fil')) merged.silhouettes.owned.unshift('fil');
  if (!merged.silhouettes.owned.includes(merged.silhouettes.selected)) merged.silhouettes.selected = 'fil';
  for (const id of START_CARDS) if (!merged.cards.unlocked.includes(id)) merged.cards.unlocked.push(id);
  for (const z of Object.keys(merged.zones)) {
    if (!isObj(merged.records[z])) merged.records[z] = {};
    for (const t of Object.keys(merged.records[z])) merged.records[z][t] = deepMerge(emptyRecords(), merged.records[z][t]);
  }
  return merged;
}

// sum = FNV-1a 32 bits (hex) du JSON sans le champ sum
export function checksum(save) {
  const body = Object.assign({}, save); delete body.sum;
  return fnv1a(JSON.stringify(body)).toString(16).padStart(8, '0');
}
export function serialize(save) {
  const body = Object.assign({}, save); delete body.sum;
  const json = JSON.stringify(body);
  return JSON.stringify(Object.assign(body, { sum: fnv1a(json).toString(16).padStart(8, '0') }));
}
export function parseValid(raw) {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const o = JSON.parse(raw);
    if (!isObj(o) || typeof o.sum !== 'string') return null;
    const { sum, ...rest } = o;
    if (fnv1a(JSON.stringify(rest)).toString(16).padStart(8, '0') !== sum) return null;
    return o;
  } catch { return null; }
}

export function loadSave(storage) {
  let raw = null, bak = null;
  try { raw = storage.getItem(SAVE_KEY); } catch { /* indisponible */ }
  const main = parseValid(raw);
  if (main) return { save: migrate(main), source: 'main' };
  try { bak = storage.getItem(BAK_KEY); } catch { /* idem */ }
  const b = parseValid(bak);
  if (b) return { save: migrate(b), source: 'backup' };
  return { save: defaultSave(), source: raw || bak ? 'reset' : 'new' };
}

export function writeSave(storage, save) {
  try {
    const data = serialize(save);
    const old = storage.getItem(SAVE_KEY);
    if (old && parseValid(old)) storage.setItem(BAK_KEY, old);
    storage.setItem(SAVE_KEY, data);
    save.sum = JSON.parse(data).sum;
    return true;
  } catch { return false; }
}

export function memoryStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); }, _map: m };
}
export { localDateStr };
