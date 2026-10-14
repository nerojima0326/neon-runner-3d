// 서비스 워커: 홈 화면 설치 + 오프라인 플레이
//  - 같은 출처 파일: 네트워크 우선 (개발 중 항상 최신), 실패 시 캐시
//  - CDN(three.js · 캐릭터/보스 모델): 캐시 우선 (한 번 받으면 오프라인 가능)
// 버전은 등록 URL(sw.js?v=X.Y.Z)에서 받음 → config.js의 VERSION 한 곳만 올리면 캐시도 교체됨
const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
const CACHE = 'neon-runner-v' + VERSION;
const SHELL = [
  './', './index.html', './manifest.json', './css/style.css',
  './js/main.js', './js/config.js', './js/state.js', './js/save.js', './js/meta.js', './js/net.js', './js/audio.js',
  './js/world.js', './js/fx.js', './js/player.js', './js/obstacles.js', './js/ui.js', './js/ghost.js', './js/vfx.js', './js/boss.js',
  './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  const store = r => { if (r && r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return r; };
  if (url.origin === location.origin) {
    e.respondWith(fetch(e.request).then(store).catch(() => caches.match(e.request, { ignoreSearch: true })));
  } else if (/jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com|polyhaven\.org/.test(url.host)) {
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(store)));
  }
});
