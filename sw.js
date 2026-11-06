'use strict';
// 서비스 워커: 홈 화면 앱 + 오프라인 플레이.
// - 코드/HTML: 네트워크 우선 (배포하면 바로 최신), 오프라인이면 캐시
// - 곡/아이콘: 캐시 우선 (용량 큼, 잘 안 바뀜)
// 곡 파일을 교체하면 CACHE 버전을 올릴 것.
const CACHE = 'counterbeat-v6';
const CORE = [
  './', './index.html', './audio.js', './songs.js', './game.js',
  './ui.js', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png',
  './icons/apple-touch-icon.png', './music/0.%20Lobby.mp3', './music/1.%20CATCH%20POINT.mp3', './music/2.%20UNREACHABLE.mp3', './music/3.%20STALEMATE.mp3',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const isStatic = url => /\.(mp3|png)$/i.test(url.pathname);

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const url = new URL(req.url);
  if (isStatic(url)) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    })));
    return;
  }
  e.respondWith(fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req).then(hit => hit || caches.match('./index.html'))));
});
