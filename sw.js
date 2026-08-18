// 昭昭专属个人站 - Service Worker
const CACHE_NAME = 'zhaozhao-station-v5';
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
      // 清除所有旧版本缓存（包含 zhaozhao-station-v3、v4 等）
      return Promise.all(keys.map(k => {
        if (k !== CACHE_NAME) {
          console.log('[SW] 清理旧缓存:', k);
          return caches.delete(k);
        }
      }));
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

  // HTML/JS/CSS 走网络优先，避免缓存导致改不生效
  const isAsset = /\.(html|css|js|json)(\?|$)/.test(url.pathname) || url.pathname.endsWith('/');
  if (isAsset) {
    event.respondWith(
      fetch(event.request).then(response => {
        if (response && response.status === 200) {
          const respClone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, respClone));
        }
        return response;
      }).catch(() => caches.match(event.request))
    );
    return;
  }

  // 其他静态资源用缓存优先
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
