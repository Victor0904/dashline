// Service worker DASHLINE : pré-cache de tous les fichiers, cache-first, nettoyage des anciennes versions. Chemins relatifs.
const VERSION = 'dashline-v1.0.0';
const FILES = [
  './', './index.html', './manifest.webmanifest', './css/style.css', './design/tokens.css',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png',
  './src/main.js', './src/core/data.js', './src/core/rng.js', './src/core/cards.js', './src/core/gesture.js',
  './src/sim/sim.js', './src/sim/arena.js', './src/sim/plan.js', './src/sim/enemies.js', './src/sim/bosses.js', './src/sim/events.js', './src/sim/bot.js',
  './src/meta/save.js', './src/meta/economy.js', './src/meta/challenges.js', './src/meta/progression.js',
  './src/render/sprites.js', './src/render/renderer.js', './src/audio/audio.js', './src/ui/ui.js',
];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('dashline-') && k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(res => {
    if (res && res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()))));
});
