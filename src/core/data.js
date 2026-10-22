// DASHLINE — constantes de gameplay (GAME_DESIGN.md, normatif) et palette (DESIGN.md / tokens.css).

export const STEP = 1 / 60;
export const AW = 360, AH = 480, CELL = 30, GW = 12, GH = 16;
export const HUD_U = 52, PAD_MIN = 80;

// ------------------------------------------------------------------ geste (§2.2)
export const GESTURE = {
  aimThreshold: 10, gains: [2.0, 2.5, 3.2], gain: 2.5, Lmin: 36, slack: 30,
  tapMove: 10, tapMs: 220, tapMin: 20, tapEnemy: 26, bufferAge: 0.25,
};
export const ASSIST = {
  normal: { magnet: 7, overrun: true, pits: true, tapEnemy: 26 },
  strong: { magnet: 13, overrun: true, pits: true, tapEnemy: 26 },
  off: { magnet: 0, overrun: false, pits: false, tapEnemy: 0 },
};

// ------------------------------------------------------------------ dash / silhouettes (§3, §5)
export const RP = 6; // hurtbox joueur
export const SILHOUETTES = {
  fil: { id: 'fil', name: 'Fil', Lmax: 150, speed: 1500, rCut: 13, hp: 3, window: 0.50, elan: 3, trailInv: 0.06, anchor: 0.08, cost: 0 },
  masse: { id: 'masse', name: 'Masse', Lmax: 120, speed: 1250, rCut: 20, hp: 4, window: 0.55, elan: 3, trailInv: 0.06, anchor: 0.08, cost: 1500, wave: 24, noStun: true },
  ombre: { id: 'ombre', name: 'Ombre', Lmax: 185, speed: 1900, rCut: 11, hp: 2, window: 0.42, elan: 4, trailInv: 0.10, anchor: 0.05, cost: 3000 },
};
export const SIL_IDS = ['fil', 'masse', 'ombre'];
export const ELAN_REGEN = 0.75;

// ------------------------------------------------------------------ chaîne / score (§4)
export const TIERS = [0, 5, 12, 22, 35, 50, 70, 100];
export function multOf(chain) { let m = 1; for (let i = 1; i < TIERS.length; i++) if (chain >= TIERS[i]) m = i + 1; return m; }
export function multiBonus(n) { return Math.min(3, 1 + 0.2 * (n - 1)); }

// ------------------------------------------------------------------ ennemis (§6)
export const ENEMY = {
  pion: { r: 9, hp: 1, pts: 100, xp: 1, speed: 60 },
  mouch: { r: 5, hp: 1, pts: 40, xp: 1, speed: 95 },
  tireur: { r: 10, hp: 1, pts: 150, xp: 2, speed: 45 },
  charg: { r: 12, hp: 1, pts: 200, xp: 2, speed: 50 },
  boucl: { r: 12, hp: 1, pts: 250, xp: 3, speed: 40 },
  mortier: { r: 11, hp: 1, pts: 200, xp: 2, speed: 40 },
  colosse: { r: 18, hp: 3, pts: 400, xp: 5, speed: 38 },
  lancier: { r: 10, hp: 1, pts: 250, xp: 3, speed: 0 },
  fileur: { r: 9, hp: 1, pts: 300, xp: 3, speed: 0 },
  egide: { r: 11, hp: 1, pts: 300, xp: 3, speed: 35 },
  tourelle: { r: 12, hp: 1, pts: 250, xp: 3, speed: 0 },
  // parties de boss (jamais tuées par les cartes)
  maitre: { r: 16, hp: 8, pts: 0, xp: 0, speed: 40 },
  piston: { r: 22, hp: 3, pts: 0, xp: 0, speed: 0 },
  noyau: { r: 24, hp: 4, pts: 0, xp: 0, speed: 0 },
  miroir: { r: 22, hp: 9, pts: 0, xp: 0, speed: 0 },
  noeud: { r: 12, hp: 1, pts: 0, xp: 0, speed: 0 },
};
export const BOSS_TYPES = new Set(['maitre', 'piston', 'noyau', 'miroir', 'noeud']);
export const PEARL_R = 5, PEARL_V = 220;

// ------------------------------------------------------------------ zones (§6.3, §7, §8, §10)
export const ZONES = [
  { id: 'dojo', name: 'Dojo', speed: 1.00, rate: 1.00, pearl: 1.00, quota: 1.00, b: 3, g: 5, tess: 1.0,
    elite: 0.04, eliteFrom: 4, pools: [['L1', 'L2'], ['L2', 'L3']], boss: 'maitre', bossName: 'LE MAÎTRE',
    col: { floor: '#0C1A1C', grid: '#132A2D', wall: '#1A2A2E', edge: '#3C5A5E' } },
  { id: 'docks', name: 'Docks', speed: 1.08, rate: 1.10, pearl: 1.05, quota: 1.15, b: 5, g: 6, tess: 1.4,
    elite: 0.06, eliteFrom: 1, pools: [['L1', 'L4'], ['L3', 'L4', 'L5']], boss: 'presse', bossName: 'LA PRESSE',
    col: { floor: '#0E1022', grid: '#1A1D3A', wall: '#1C2140', edge: '#3E4778' } },
  { id: 'verriere', name: 'Verrière', speed: 1.16, rate: 1.20, pearl: 1.10, quota: 1.30, b: 6, g: 7, tess: 1.8,
    elite: 0.08, eliteFrom: 1, pools: [['L2', 'L6'], ['L6', 'L7', 'L5']], boss: 'miroir', bossName: 'LE MIROIR',
    col: { floor: '#170E1B', grid: '#27182D', wall: '#2A1A30', edge: '#5A3A66' } },
  { id: 'vide', name: 'Vide', speed: 1.24, rate: 1.30, pearl: 1.15, quota: 1.45, b: 7, g: 8, tess: 2.2,
    elite: 0.12, eliteFrom: 1, pools: [['L4', 'L8'], ['L5', 'L7', 'L8']], boss: 'trait', bossName: 'LE TRAIT',
    col: { floor: '#050506', grid: '#141416', wall: '#121214', edge: '#3A3A40' } },
];
export const ZONE_IDS = ZONES.map(z => z.id);
export const QUOTA_Z1 = [12, 16, 20, 24, 28, 32];
// QUOTA_K : coefficient d'équilibrage (simulation, cf. NOTES.md) appliqué aux quotas de la spec
export const QUOTA_K = 1.6;
export function quotaFor(zone, arena) { return Math.round(QUOTA_Z1[arena - 1] * ZONES[zone].quota * QUOTA_K); }

// formations (§7.2) : poids par zone
export const FORMATIONS = [
  { id: 'ruee', w: [30, 18, 12, 10], from: 1 },
  { id: 'nuee', w: [22, 16, 12, 12], from: 1 },
  { id: 'duo', w: [18, 12, 10, 8], from: 1 },
  { id: 'taureau', w: [15, 12, 10, 10], from: 3 },
  { id: 'phalange', w: [15, 12, 12, 12], from: 4 },
  { id: 'barrage', w: [0, 15, 8, 8], from: 1 },
  { id: 'colosse', w: [0, 15, 10, 10], from: 1 },
  { id: 'ligne', w: [0, 0, 10, 8], from: 1 },
  { id: 'ombres', w: [0, 0, 8, 10], from: 1 },
  { id: 'escorte', w: [0, 0, 8, 12], from: 1 },
];

// ------------------------------------------------------------------ cartes d'arènes (§7.3)
export const MAPS = {
  L1: ['............', '............', '............', '...#....#...', '............', '............', '............', '.....##.....',
    '.....##.....', '............', '............', '............', '...#....#...', '............', '............', '.....P......'],
  L2: ['............', '.#...##...#.', '............', '............', '...#....#...', '............', '.#........#.', '.....oo.....',
    '.....oo.....', '.#........#.', '............', '...#....#...', '............', '............', '.#........#.', '.....P......'],
  L3: ['............', '............', '.####..####.', '............', '............', '............', '.....oo.....', '..#..oo..#..',
    '..#......#..', '..#......#..', '............', '............', '.####..####.', '............', '............', '.....P......'],
  L4: ['............', '............', '..__....__..', '..__....__..', '............', '.....##.....', '.#...##...#.', '.#........#.',
    '............', '..________..', '............', '.....##.....', '............', '.#........#.', '............', '.....P......'],
  L5: ['............', '.##......##.', '.#........#.', '............', '....____....', '....____....', '............', '..o......o..',
    '..o......o..', '............', '....____....', '....____....', '............', '.#........#.', '.##......##.', '.....P......'],
  L6: ['............', '.oooo..oooo.', '............', '............', '.#T.......#.', '.#..####..#.', '.#........#.', '............',
    '............', '.#........#.', '.#..####..#.', '.#.......T#.', '............', '.oooo..oooo.', '............', '.....P......'],
  L7: ['............', '.#.#.##.#.#.', '............', '.##......##.', '....#..#....', '....#..#....', '.o........o.', '.o...__...o.',
    '.o...__...o.', '.o........o.', '....#..#....', '....#..#....', '.##......##.', '............', '.#.#.##.#.#.', '.....P......'],
  L8: ['..__....__..', '..__....__..', '............', '____....____', '............', '...#....#...', '............', '.....__.....',
    '.....__.....', '............', '...#....#...', '............', '____....____', '............', '..__....__..', '.....P......'],
};
export const MAP_NAMES = { L1: 'Cour', L2: 'Piliers', L3: 'Couloirs', L4: 'Quai', L5: 'Grue', L6: 'Verrière', L7: 'Dédale', L8: 'Îlots' };

// arènes de boss (§8) — interprétations notées dans NOTES.md
export const BOSS_MAPS = {
  maitre: ['............', '............', '............', '...#....#...', '............', '............', '............', '............',
    '............', '............', '............', '............', '...#....#...', '............', '............', '.....P......'],
  presse: ['############', '############', '############', '............', '............', '............', '............', '............',
    '............', '............', '............', '............', '............', '............', '............', '.....P......'],
  miroir: ['............', '.oooo..oooo.', '............', '............', '.#........#.', '.#..####..#.', '.#........#.', '............',
    '............', '.#........#.', '.#..####..#.', '.#........#.', '............', '.oooo..oooo.', '............', '.....P......'],
  trait: ['..__....__..', '..__....__..', '............', '............', '............', '............', '............', '............',
    '............', '............', '............', '............', '............', '............', '..__....__..', '.....P......'],
};

// ------------------------------------------------------------------ boss (§8)
export const BOSSES = {
  maitre: { name: 'LE MAÎTRE', zone: 0, T: 60, entailles: 8 },
  presse: { name: 'LA PRESSE', zone: 1, T: 80, entailles: 16 },
  miroir: { name: 'LE MIROIR', zone: 2, T: 85, entailles: 9 },
  trait: { name: 'LE TRAIT', zone: 3, T: 100, entailles: 18 },
};

// ------------------------------------------------------------------ XP (§9.1)
export function xpNeed(L) { return 4 + 4 * (L - 1) + Math.floor(0.5 * (L - 1) * (L - 1)); }

// ------------------------------------------------------------------ Tension (§10.4)
export const TENSION = [
  { k: 1.0 }, { k: 1.2, speed: 0.15 }, { k: 1.4, elite: 2 }, { k: 1.6, window: -0.05 }, { k: 1.8, rate: 0.25 }, { k: 2.0, hp: -1 },
];

// ------------------------------------------------------------------ palette (DESIGN §2)
export const C = {
  ink0: '#07090D', ink1: '#0D1118', ink2: '#151B26', ink3: '#1F2836',
  line: 'rgba(170,190,220,.16)', lineStrong: 'rgba(170,190,220,.34)',
  volt: '#D7FF3A', voltSoft: '#ECFF9E', voltDeep: '#7A9A00', white: '#FFFFFF',
  danger: '#FF2D55', hot: '#FF7A1A', dfill: '#3A0812', dtele: 'rgba(255,45,85,.16)',
  steel: '#C9D6E8', steelDim: '#6F8099', glass: '#8FD8FF', xp: '#8EA2FF', tesson: '#B78CFF', gold: '#FFC53D',
  rarC: '#9AA6B8', rarR: '#4DA3FF', rarE: '#B57BFF', evo: '#FFC53D',
  hi: '#EEF2F8', mid: '#9AA6B8', lo: '#586273', pit: '#000000', pitEdge: '#2A3346',
};
export const TIER_COL = ['#586273', '#EEF2F8', '#ECFF9E', '#D7FF3A', '#9BFF5A', '#5AFFC8', '#8EA2FF', '#FFFFFF'];
export const TIER_COL_CB = ['#586273', '#EEF2F8', '#A8F0FF', '#3DE0FF', '#4DA3FF', '#8EA2FF', '#C9D6E8', '#FFFFFF'];
