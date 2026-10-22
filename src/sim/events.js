// Événements émis par la simulation (consommés par le rendu, l'audio, la vibration, les tests). Tampon pré-alloué.
let n = 0;
export const EV = {};
for (const k of ['DASH', 'DRY', 'ARRIVE', 'CUT', 'KILL', 'HIT_E', 'POP', 'PARRY', 'BULLET_CUT', 'GLASS', 'TIER', 'CHAIN_BREAK', 'WINDOW_TICK',
  'HURT', 'DEATH', 'LEVEL', 'OFFER', 'CARD', 'EVOLVE', 'ARENA_CLEAR', 'ARENA_LOAD', 'BOSS_IN', 'BOSS_HIT', 'BOSS_PHASE', 'BOSS_DEAD', 'RUPTURE',
  'SPAWN_TELE', 'SPAWN', 'TELE', 'FIRE', 'BOOM', 'WAVE', 'LIEN', 'ECHO', 'SUPER', 'FALL', 'VOILE', 'INSTINCT', 'BAVURE', 'MULTI', 'REVIVE',
  'SHELL', 'SLAM', 'BEAM', 'SLASH', 'PISTON', 'ECLAT', 'BOUNCE', 'BANNER', 'TUTO', 'HITSTOP', 'REFLET', 'NODE_BACK', 'WON']) EV[k] = ++n;
export const EV_NAMES = Object.fromEntries(Object.entries(EV).map(([k, v]) => [v, k]));

export class EventBuf {
  constructor(size = 1024) { this.items = []; for (let i = 0; i < size; i++) this.items.push({ type: 0, x: 0, y: 0, a: 0, b: 0, c: 0, s: '' }); this.n = 0; }
  push(type, x, y, a, b, c, s) {
    if (this.n >= this.items.length) return null;
    const e = this.items[this.n++]; e.type = type; e.x = x; e.y = y; e.a = a || 0; e.b = b || 0; e.c = c || 0; e.s = s || '';
    return e;
  }
  clear() { this.n = 0; }
}
