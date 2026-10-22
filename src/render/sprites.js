// Sprites pré-rendus (DESIGN §5, §9) : glows, corps d'ennemis (normal / silhouette blanche / élite), icônes de cartes.
// Le glow est calculé une fois ici (dégradés radiaux), jamais de shadowBlur par frame.
import { C } from '../core/data.js';

export const FONT_NUM = 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, "Roboto Mono", monospace';
export const FONT_UI = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
// cache des chaînes rgba() (alpha quantifié à 1/64) : pas d'allocation de chaîne par frame
const HC = new Map();
export function hexA(hex, a) {
  const q = Math.max(0, Math.min(64, Math.round(a * 64))), k = hex + q;
  let s = HC.get(k);
  if (s === undefined) { const n = parseInt(hex.slice(1), 16); s = `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${q / 64})`; if (HC.size < 4096) HC.set(k, s); }
  return s;
}

function canvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined' && typeof document === 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}
// sprite de wu × wu unités, dessiné centré, à l'échelle K (px par u)
function sprite(wu, hu, K, fn) {
  const c = canvas(Math.max(1, Math.ceil(wu * K)), Math.max(1, Math.ceil(hu * K)));
  const g = c.getContext('2d');
  g.setTransform(K, 0, 0, K, c.width / 2, c.height / 2);
  g.lineJoin = 'miter'; g.lineCap = 'round';
  fn(g);
  return { c, w: wu, h: hu };
}
export function glow(color, ru, K, a0 = 1) {
  return sprite(ru * 2, ru * 2, K, g => {
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, ru);
    gr.addColorStop(0, hexA(color, a0)); gr.addColorStop(0.45, hexA(color, a0 * 0.35)); gr.addColorStop(1, hexA(color, 0));
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, ru, 0, Math.PI * 2); g.fill();
  });
}

// ------------------------------------------------------------------ ennemis
export function enemyPath(g, type, r) {
  g.beginPath();
  switch (type) {
    case 'pion': g.arc(0, 0, r, 0.5, Math.PI * 2 - 0.5); g.lineTo(r + 5, 0); g.closePath(); break;
    case 'mouch': g.moveTo(6, 0); g.lineTo(-4, 3.5); g.lineTo(-4, -3.5); g.closePath(); break;
    case 'tireur': g.rect(-9, -9, 18, 18); break;
    case 'charg': g.moveTo(14, 0); g.lineTo(-10, 10); g.lineTo(-5, 0); g.lineTo(-10, -10); g.closePath(); break;
    case 'boucl': g.arc(0, 0, r, 0, Math.PI * 2); break;
    case 'mortier': for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; i ? g.lineTo(Math.cos(a) * r, Math.sin(a) * r) : g.moveTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); break;
    case 'colosse': for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + Math.PI / 8; i ? g.lineTo(Math.cos(a) * r, Math.sin(a) * r) : g.moveTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); break;
    case 'lancier': g.moveTo(13, 0); g.lineTo(0, 4); g.lineTo(-13, 0); g.lineTo(0, -4); g.closePath(); break;
    case 'fileur': for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); g.lineTo(Math.cos(a + 0.5) * 3, Math.sin(a + 0.5) * 3); } g.closePath(); break;
    case 'egide': g.arc(0, 0, r, 0, Math.PI * 2); break;
    case 'tourelle': g.rect(-12, -12, 24, 24); break;
    case 'noeud': g.arc(0, 0, r, 0, Math.PI * 2); break;
    default: g.arc(0, 0, r, 0, Math.PI * 2);
  }
}
function enemyBody(g, type, r, white) {
  g.fillStyle = white ? 'rgba(255,255,255,.95)' : hexA(C.dfill, 0.9);
  g.strokeStyle = white ? C.white : C.danger; g.lineWidth = 2;
  enemyPath(g, type, r); g.fill(); g.stroke();
  if (white) return;
  g.strokeStyle = C.danger;
  if (type === 'tireur') { g.beginPath(); g.moveTo(9, 0); g.lineTo(19, 0); g.stroke(); }
  if (type === 'charg') { g.beginPath(); g.moveTo(-2, 8); g.lineTo(6, 14); g.moveTo(-2, -8); g.lineTo(6, -14); g.stroke(); }
  if (type === 'mortier') { g.beginPath(); g.arc(0, 0, 4, 0, Math.PI * 2); g.stroke(); }
  if (type === 'egide') { g.strokeStyle = C.steel; g.lineWidth = 1.5; g.beginPath(); g.moveTo(-5, 0); g.lineTo(5, 0); g.moveTo(0, -5); g.lineTo(0, 5); g.stroke(); }
  if (type !== 'mouch' && type !== 'mortier' && type !== 'egide' && type !== 'lancier' && type !== 'tourelle' && type !== 'fileur') { g.fillStyle = C.white; g.beginPath(); g.arc(r * 0.45, 0, 2, 0, Math.PI * 2); g.fill(); }
  if (type === 'lancier') { g.fillStyle = C.white; g.beginPath(); g.ellipse(4, 0, 2.5, 1.6, 0, 0, Math.PI * 2); g.fill(); }
}
const SIZES = { pion: 34, mouch: 16, tireur: 44, charg: 36, boucl: 30, mortier: 30, colosse: 44, lancier: 32, fileur: 26, egide: 30, tourelle: 30, noeud: 30 };
export function buildEnemySprites(K) {
  const S = {};
  for (const t of Object.keys(SIZES)) {
    const r = { pion: 9, mouch: 5, tireur: 10, charg: 12, boucl: 12, mortier: 11, colosse: 18, lancier: 10, fileur: 9, egide: 11, tourelle: 12, noeud: 12 }[t];
    const sz = SIZES[t] + 10;
    S[t] = sprite(sz, sz, K, g => enemyBody(g, t, r, false));
    S[t + '_w'] = sprite(sz, sz, K, g => enemyBody(g, t, r, true));
    S[t + '_e'] = sprite(sz + 10, sz + 10, K, g => {
      enemyBody(g, t, r, false);
      // élite : double contour blanc décalé de 3 u + 3 pointes blanches (pas d'or en jeu)
      g.save(); g.strokeStyle = C.white; g.lineWidth = 1.2; g.scale((r + 3) / r, (r + 3) / r); enemyPath(g, t, r); g.restore(); g.strokeStyle = C.white; g.lineWidth = 1.2; g.stroke();
      g.fillStyle = C.white;
      for (let i = 0; i < 3; i++) { const a = Math.PI / 2 + (i - 1) * 0.9 + Math.PI; const x = Math.cos(a) * (r + 4), y = Math.sin(a) * (r + 4); g.beginPath(); g.moveTo(x + Math.cos(a) * 5, y + Math.sin(a) * 5); g.lineTo(x + Math.cos(a + 1.6) * 2, y + Math.sin(a + 1.6) * 2); g.lineTo(x + Math.cos(a - 1.6) * 2, y + Math.sin(a - 1.6) * 2); g.closePath(); g.fill(); }
    });
  }
  return S;
}

// ------------------------------------------------------------------ joueur (DESIGN §4)
export function playerPath(g, sil) {
  g.beginPath();
  if (sil === 'masse') { g.moveTo(9, 0); g.lineTo(0, 9); g.lineTo(-9, 0); g.lineTo(0, -9); g.closePath(); }
  else if (sil === 'ombre') { g.moveTo(13, 0); g.lineTo(-6, 4); g.lineTo(-3, 0); g.lineTo(-6, -4); g.closePath(); }
  else { g.moveTo(10, 0); g.lineTo(-7, 7); g.lineTo(-3, 0); g.lineTo(-7, -7); g.closePath(); }
}

// ------------------------------------------------------------------ icônes de cartes (glyphes vectoriels, 1 unité = taille/24)
export function cardIcon(g, id, x, y, size, col, col2) {
  const k = size / 24;
  g.save(); g.translate(x, y); g.scale(k, k);
  g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 2; g.lineCap = 'round'; g.lineJoin = 'round';
  const L = (...p) => { g.beginPath(); g.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]); g.stroke(); };
  const O = (cx, cy, r, a0 = 0, a1 = Math.PI * 2) => { g.beginPath(); g.arc(cx, cy, r, a0, a1); g.stroke(); };
  const base = id.startsWith('evo:') ? id.slice(4) : id;
  switch (base) {
    case 'portee': L(-9, 7, 9, -7); L(3, -8, 9, -7, 8, -1); break;
    case 'tranchant': L(-8, 8, 8, -8); L(-4, 8, 8, -4); break;
    case 'sangFroid': O(0, 0, 8, -Math.PI / 2, Math.PI); L(0, 0, 0, -5); L(0, 0, 4, 2); break;
    case 'souffle': L(-9, -4, -3, -6, 3, -2, 9, -4); L(-9, 3, -3, 1, 3, 5, 9, 3); break;
    case 'garde': L(0, -9, 8, 0, 0, 9, -8, 0, 0, -9); break;
    case 'velocite': L(-8, -6, -2, 0, -8, 6); L(0, -6, 6, 0, 0, 6); break;
    case 'butin': L(0, -9, 6, 0, 0, 9, -6, 0, 0, -9); L(-6, 0, 6, 0); break;
    case 'ricochet': L(-9, 6, -3, -6, 3, 6, 9, -6); break;
    case 'sillage': L(-9, 7, 7, -7); g.globalAlpha *= 0.6; L(-6, 9, 9, -4); g.globalAlpha /= 0.6; break;
    case 'coude': L(-8, 8, -2, -4, 8, -6); g.beginPath(); g.arc(-2, -4, 2, 0, 7); g.fill(); break;
    case 'onde': O(0, 0, 3); O(0, 0, 7); g.globalAlpha *= 0.5; O(0, 0, 10); g.globalAlpha /= 0.5; break;
    case 'concentration': g.beginPath(); g.ellipse(0, 0, 9, 5, 0, 0, 7); g.stroke(); g.beginPath(); g.arc(0, 0, 2.5, 0, 7); g.fill(); break;
    case 'eclatement': for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; L(Math.cos(a) * 3, Math.sin(a) * 3, Math.cos(a) * 9, Math.sin(a) * 9); } break;
    case 'parade': L(-8, 8, 0, 0); L(0, 0, 8, -2); L(4, -5, 8, -2, 5, 2); break;
    case 'tourbillon': O(0, 0, 8, 0, 1.2); O(0, 0, 8, 2.1, 3.3); O(0, 0, 8, 4.2, 5.4); g.beginPath(); g.arc(0, 0, 2, 0, 7); g.fill(); break;
    case 'echo': L(-6, -6, 0, 0, -6, 6); g.globalAlpha *= 0.45; L(1, -6, 7, 0, 1, 6); g.globalAlpha /= 0.45; break;
    case 'surcharge': L(2, -10, -5, 1, 1, 1, -2, 10, 6, -2, 0, -2, 2, -10); break;
    case 'fantome': g.globalAlpha *= 0.5; L(-8, -6, -2, 0, -8, 6); g.globalAlpha /= 0.5; L(-2, -6, 4, 0, -2, 6); break;
    case 'predateur': L(-8, -6, -4, 6, 0, -6, 4, 6, 8, -6); break;
    case 'lien': L(-9, 4, -5, -3, -1, 3, 3, -4, 6, 2, 9, -3); break;
    case 'flipper': L(-9, 6, -3, -6, 3, 6, 9, -6); O(0, 0, 10); break;
    case 'incendie': L(-9, 7, 7, -7); O(4, -4, 6); break;
    case 'origami': L(-8, 8, -2, -4, 8, -6); L(-5, 9, 1, -3, 9, -3); break;
    case 'tempsSuspendu': g.beginPath(); g.ellipse(0, 0, 9, 5, 0, 0, 7); g.stroke(); L(-3, -3, -3, 3); L(3, -3, 3, 3); break;
    case 'miroir': O(0, 0, 8, 0, 1.2); O(0, 0, 8, 3.1, 4.3); L(-8, 8, 0, 0, 8, 8); break;
    case 'dechirure': L(2, -10, -5, 1, 1, 1, -2, 10); L(-9, -9, 9, 9); break;
    case 'reparation': L(-6, 0, 6, 0); L(0, -6, 0, 6); break;
    default: O(0, 0, 7);
  }
  g.restore();
}
