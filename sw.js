// 昭昭专属个人站 - Service Worker (临时禁用缓存,所有请求走网络)
const CACHE_NAME = 'zhaozhao-station-v6-disabled';
const ASSETS = [];

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(keys.map(k => caches.delete(k)));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // 不拦截任何请求,全部走网络
  return;
});
