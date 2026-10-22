// PRNG déterministe (mulberry32) + hash de chaîne (FNV-1a 32 bits). Repris de PULSAR.
export function mulberry32(seed) {
  let s = seed >>> 0;
  const rand = function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rand.state = () => s;
  return rand;
}

export function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// date locale « AAAA-MM-JJ »
export function localDateStr(d = new Date()) {
  const p = n => (n < 10 ? '0' : '') + n;
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function dayOfYear(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const a = Date.UTC(y, m - 1, d), b = Date.UTC(y, 0, 1);
  return Math.round((a - b) / 86400000) + 1;
}
