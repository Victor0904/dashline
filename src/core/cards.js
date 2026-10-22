// Cartes de niveau (GAME_DESIGN §9) : Atouts (stats), Capacités, Évolutions, tirage déterministe 1 parmi 3.

export const RARITY = { C: { w: 55, name: 'COMMUNE' }, R: { w: 32, name: 'RARE' }, E: { w: 13, name: 'ÉPIQUE' }, X: { w: 0, name: 'ÉVOLUTION' } };
export const SLOTS = { cap: 5, atout: 4 };

// desc[i] = texte du niveau i+1 (court, 2–4 lignes sur une carte de 108 px)
export const CARDS = {
  // ---- Atouts
  portee: { name: 'PORTÉE', type: 'atout', rar: 'C', max: 5, start: true, desc: ['Lmax +12 u'] },
  tranchant: { name: 'TRANCHANT', type: 'atout', rar: 'C', max: 5, start: true, desc: ['Coupe +2,5 u'] },
  sangFroid: { name: 'SANG-FROID', type: 'atout', rar: 'C', max: 5, start: true, desc: ['Fenêtre de Chaîne +0,05 s'] },
  souffle: { name: 'SOUFFLE', type: 'atout', rar: 'C', max: 5, start: true, desc: ['Élan −0,08 s', 'Élan −0,08 s', 'Élan −0,08 s, +1 charge', 'Élan −0,08 s', 'Élan −0,08 s, +1 charge'] },
  garde: { name: 'GARDE', type: 'atout', rar: 'R', max: 3, start: true, desc: ['+1 PV max et +1 PV'] },
  velocite: { name: 'VÉLOCITÉ', type: 'atout', rar: 'C', max: 5, start: false, desc: ['Dash +12 %, ancrage −0,012 s'] },
  butin: { name: 'BUTIN', type: 'atout', rar: 'C', max: 5, start: false, desc: ['XP +12 %, Tessons +4 %'] },
  // ---- Capacités
  ricochet: { name: 'RICOCHET', type: 'cap', rar: 'R', max: 5, start: true, desc: ['Rebondit 1 fois (60 %)', 'Rebond : 80 %', '2 rebonds', 'Rebondit sur les boucliers', '3 rebonds + onde r 28'] },
  sillage: { name: 'SILLAGE', type: 'cap', rar: 'R', max: 5, start: true, desc: ['Flamme 0,8 s, 10 u', 'Flamme 1,0 s, 12 u', 'Flamme 1,2 s, 14 u', 'Flamme 1,4 s, 16 u', '1,8 s, 20 u, coupe les balles'] },
  coude: { name: 'COUDE', type: 'cap', rar: 'E', max: 5, start: false, desc: ['Le trait plie 1 fois (×1,25)', 'Longueur ×1,4', '2 coudes', 'Longueur ×1,6', '3 coudes ; ≥ 4 kills : gratuit'] },
  onde: { name: 'ONDE', type: 'cap', rar: 'R', max: 5, start: true, desc: ['Onde r 34 à l\'arrivée', 'Onde r 40', 'Onde r 46', 'r 52, coupe les balles', 'r 60 ; ×1,5 si ≥ 3 kills'] },
  concentration: { name: 'CONCENTRATION', type: 'cap', rar: 'E', max: 5, start: true, desc: ['Visée : monde ×0,6, 0,5 s', '×0,5 / 0,6 s', '×0,45 / 0,7 s', '×0,4 / 0,8 s', '×0,3 / 1,0 s'] },
  eclatement: { name: 'ÉCLATEMENT', type: 'cap', rar: 'R', max: 5, start: true, desc: ['Tout tué explose (r 22)', 'Explosion r 26', 'Explosion r 30', 'Explosion r 34', 'r 40 ; Colosse −1 PV'] },
  parade: { name: 'PARADE', type: 'cap', rar: 'R', max: 5, start: true, desc: ['40 % des balles coupées renvoyées', '60 % renvoyées', '80 % renvoyées', '100 % renvoyées', '100 %, perce 3 ennemis'] },
  tourbillon: { name: 'TOURBILLON', type: 'cap', rar: 'R', max: 5, start: true, desc: ['À l\'arrêt : 1 lame r 24', 'Coupe les balles', '2 lames', 'Rayon 28', '3 lames'] },
  echo: { name: 'ÉCHO', type: 'cap', rar: 'E', max: 5, start: false, desc: ['Fantôme du trait, coupe ×0,7', 'Coupe ×0,9', '×1,0 ; kills : fenêtre +0,1 s', 'Rejoue 2 fois', 'Coupe ×1,3, délai 0,2 s'] },
  surcharge: { name: 'SURCHARGE', type: 'cap', rar: 'E', max: 5, start: false, desc: ['Tous les 6 dashs : super-dash', 'Tous les 5 dashs', '+ onde r 50', 'Tous les 4 dashs', 'Vitesse ×1,5, rend 2 Élan'] },
  fantome: { name: 'FANTÔME', type: 'cap', rar: 'R', max: 5, start: false, desc: ['Traîne d\'i-frames +0,05 s', '+0,10 s', '+0,15 s', '+0,20 s', '+0,25 s ; 1 coup absorbé / arène'] },
  predateur: { name: 'PRÉDATEUR', type: 'cap', rar: 'R', max: 5, start: false, desc: ['Dash à ≥ 3 kills : +1 Élan', '+ fenêtre +0,1 s', 'Seuil 2 kills', '≥ 5 kills : Élan plein', 'Seuil 2, fenêtre +0,15 s'] },
  lien: { name: 'LIEN', type: 'cap', rar: 'E', max: 5, start: false, desc: ['Kill → arc à 50 u, 1 saut', '60 u', '2 sauts, 70 u', '80 u', '3 sauts, 90 u'] },
};
export const CARD_IDS = Object.keys(CARDS);
export const START_CARDS = CARD_IDS.filter(id => CARDS[id].start);

export const EVOLUTIONS = {
  flipper: { name: 'FLIPPER', a: 'ricochet', b: 'onde', desc: 'Rebonds illimités (100 %), chaque rebond = onde' },
  incendie: { name: 'INCENDIE', a: 'sillage', b: 'eclatement', desc: 'Flamme ×1,5 ; tués dans la flamme : anneau de feu' },
  origami: { name: 'ORIGAMI', a: 'coude', b: 'echo', desc: 'L\'Écho rejoue le trait plié, coupe ×1,3' },
  tempsSuspendu: { name: 'TEMPS SUSPENDU', a: 'concentration', b: 'sangFroid', desc: 'Visée ×0,15, fenêtre gelée, 1,2 s' },
  miroir: { name: 'MIROIR', a: 'parade', b: 'tourbillon', desc: 'Lames ×2 qui renvoient 100 % des balles' },
  dechirure: { name: 'DÉCHIRURE', a: 'surcharge', b: 'tranchant', desc: 'Super-dash tous les 3 dashs + faille 2 s' },
};
export const EVO_IDS = Object.keys(EVOLUTIONS);
export const EVO_OF = {}; for (const id of EVO_IDS) EVO_OF[EVOLUTIONS[id].a] = id;

// Valeurs par niveau des capacités (lv 1..5 ; index 0 = niveau 0)
export const CAP = {
  ricochetBounces: [0, 1, 1, 2, 2, 3], ricochetKeep: [0, 0.6, 0.8, 0.8, 0.8, 0.8],
  sillageLife: [0, 0.8, 1.0, 1.2, 1.4, 1.8], sillageW: [0, 10, 12, 14, 16, 20],
  coudeN: [0, 1, 1, 2, 2, 3], coudeLen: [1, 1.25, 1.4, 1.4, 1.6, 1.6],
  ondeR: [0, 34, 40, 46, 52, 60],
  concK: [1, 0.6, 0.5, 0.45, 0.4, 0.3], concT: [0, 0.5, 0.6, 0.7, 0.8, 1.0],
  eclatR: [0, 22, 26, 30, 34, 40],
  paradeP: [0, 0.4, 0.6, 0.8, 1, 1],
  tourN: [0, 1, 1, 2, 2, 3], tourR: [0, 24, 24, 24, 28, 28],
  echoK: [0, 0.7, 0.9, 1.0, 1.0, 1.3], echoDelay: [0, 0.35, 0.35, 0.35, 0.35, 0.2],
  surchargeN: [0, 6, 5, 5, 4, 4],
  fantomeT: [0, 0.05, 0.10, 0.15, 0.20, 0.25],
  lienR: [0, 50, 60, 70, 80, 90], lienJ: [0, 1, 1, 2, 2, 3],
};

// ------------------------------------------------------------------ tirage (§9.2)
// state : { lv: {id: niveau}, evo: {evoId: true}, unlocked: [ids], evoSeen } ; rng : rngCards ; n : 3 ou 4
export function ownedCount(lv, type) { let n = 0; for (const id in lv) if (lv[id] > 0 && CARDS[id] && CARDS[id].type === type) n++; return n; }
export function evoOwnedFor(evo, a) { for (const e in evo) if (evo[e] && EVOLUTIONS[e].a === a) return true; return false; }

export function availableEvolutions(lv, evo) {
  const out = [];
  for (const e of EVO_IDS) {
    if (evo[e]) continue;
    const E = EVOLUTIONS[e];
    if ((lv[E.a] || 0) >= CARDS[E.a].max && (lv[E.b] || 0) >= 3) out.push(e);
  }
  return out;
}

export function drawOffer(state, rng, n = 3) {
  const lv = state.lv, evo = state.evo || {};
  const freeCap = ownedCount(lv, 'cap') < SLOTS.cap, freeAtout = ownedCount(lv, 'atout') < SLOTS.atout;
  const news = [], ups = [];
  for (const id of state.unlocked) {
    const c = CARDS[id]; if (!c) continue;
    const l = lv[id] || 0;
    if (l === 0) { if (evoOwnedFor(evo, id)) continue; if (c.type === 'cap' ? freeCap : freeAtout) news.push(id); }
    else if (l < c.max) ups.push(id);
  }
  const evos = availableEvolutions(lv, evo);
  const out = [];
  if (evos.length) out.push('evo:' + evos[Math.floor(rng() * evos.length)]);
  if (!news.length && !ups.length && !out.length) return ['reparation'];
  const pickW = list => {
    let tot = 0; for (const id of list) tot += RARITY[CARDS[id].rar].w;
    let r = rng() * tot;
    for (const id of list) { r -= RARITY[CARDS[id].rar].w; if (r < 0) return id; }
    return list[list.length - 1];
  };
  const rest = [];
  if (news.length && out.length < n) { const id = pickW(news); out.push(id); }
  if (ups.length && out.length < n) { const id = pickW(ups); out.push(id); }
  for (const id of news) if (out.indexOf(id) < 0) rest.push(id);
  for (const id of ups) if (out.indexOf(id) < 0) rest.push(id);
  while (out.length < n && rest.length) { const id = pickW(rest); out.push(id); rest.splice(rest.indexOf(id), 1); }
  // mélange des emplacements hors évolution (l'évolution reste en 1)
  const s0 = out[0] && out[0].startsWith('evo:') ? 1 : 0;
  for (let i = out.length - 1; i > s0; i--) { const j = s0 + Math.floor(rng() * (i - s0 + 1)); const t = out[i]; out[i] = out[j]; out[j] = t; }
  if (out.length < n) out.push('reparation');
  return out;
}

export function cardLabel(id) {
  if (id === 'reparation') return 'RÉPARATION';
  if (id.startsWith('evo:')) return EVOLUTIONS[id.slice(4)].name;
  return CARDS[id].name;
}
export function cardDesc(id, lvNext) {
  if (id === 'reparation') return '+1 PV, ou +2 000 pts si PV pleins';
  if (id.startsWith('evo:')) return EVOLUTIONS[id.slice(4)].desc;
  const d = CARDS[id].desc;
  return d[Math.min(d.length - 1, lvNext - 1)] || d[0];
}
export function cardRarity(id) {
  if (id === 'reparation') return 'C';
  if (id.startsWith('evo:')) return 'X';
  return CARDS[id].rar;
}
