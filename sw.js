// 昭昭专属个人站 - Service Worker
const CACHE_NAME = 'zhaozhao-station-v13';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/db.js',
  './js/app.js',
  './js/wizard.js',
  './js/privacy.js',
  './js/modules/home.js',
  './js/modules/timer.js',
  './js/modules/reading.js',
  './js/modules/workout.js',
  './js/modules/emotion.js',
  './js/modules/soul.js',
  './js/modules/starmap.js',
  './js/modules/cards.js',
  './js/modules/projects.js',
  './js/modules/review.js',
  './js/modules/reminders.js',
  './js/modules/aichat.js',
  './assets/icons/icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS).catch(err => {
        console.log('[SW] 缓存部分失败:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // 只缓存同源 GET 请求
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  // 不拦截 API 请求和 CDN
  if (url.origin !== location.origin) return;

  // 带 ?nocache= 或 ?t= 参数：完全绕开缓存
  if (url.searchParams.has('nocache') || url.searchParams.has('t')) {
    event.respondWith(fetch(event.request, { cache: 'no-store' }));
    return;
  }

  // 关键修复：JS / CSS 文件用 network-first 策略，确保浏览器拿到最新代码
  // 只有在网络失败时才回退到缓存
  const isCode = /\.(js|css)(\?|#|$)/.test(url.pathname);
  if (isCode) {
    event.respondWith(
      fetch(event.request, { cache: 'reload' })
        .then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then(c => c || new Response('/* offline */', { headers: { 'Content-Type': 'application/javascript' } })))
    );
    return;
  }

  // 其他资源（HTML/图片）：cache-first + 后台更新
  event.respondWith(
    caches.match(event.request).then(cached => {
      const fetchPromise = fetch(event.request).then(response => {
        if (response && response.status === 200) {
          const respClone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, respClone));
        }
        return response;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
