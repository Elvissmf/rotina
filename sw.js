// ATENÇÃO (estratégia cache-first): este SW serve os arquivos do cache e
// atualiza em background. Na prática, mudanças de código só aparecem no
// SEGUNDO reload da página. Ao alterar qualquer arquivo desta lista,
// incremente CACHE_NAME — senão usuários podem ficar presos na versão antiga.
const CACHE_NAME = "rotina-cache-v9";

// Emojis JoyPixels usados pela UI e pelo seletor de ícone (EMOJI_SET do
// app.js). Ao adicionar um emoji novo lá, inclua o PNG aqui também.
const EMOJI_ASSETS = [
  "emoji/1f30a.png", "emoji/1f30d.png", "emoji/1f319.png", "emoji/1f31e.png",
  "emoji/1f331.png", "emoji/1f332.png", "emoji/1f333.png", "emoji/1f33f.png",
  "emoji/1f340.png", "emoji/1f343.png", "emoji/1f34e.png", "emoji/1f373.png",
  "emoji/1f375.png", "emoji/1f37d.png", "emoji/1f381.png", "emoji/1f393.png",
  "emoji/1f3a7.png", "emoji/1f3a8.png", "emoji/1f3ac.png", "emoji/1f3ae.png",
  "emoji/1f3af.png", "emoji/1f3b8.png", "emoji/1f3b9.png", "emoji/1f3be.png",
  "emoji/1f3c0.png", "emoji/1f3c3.png", "emoji/1f3ca.png", "emoji/1f3cb.png",
  "emoji/1f3e0.png", "emoji/1f3e6.png", "emoji/1f431.png", "emoji/1f436.png",
  "emoji/1f46a.png", "emoji/1f48a.png", "emoji/1f4a7.png", "emoji/1f4aa.png",
  "emoji/1f4b0.png", "emoji/1f4b3.png", "emoji/1f4b5.png", "emoji/1f4bb.png",
  "emoji/1f4bc.png", "emoji/1f4be.png", "emoji/1f4c5.png", "emoji/1f4c8.png",
  "emoji/1f4c9.png", "emoji/1f4ca.png", "emoji/1f4d0.png", "emoji/1f4d6.png",
  "emoji/1f4da.png", "emoji/1f4dd.png", "emoji/1f4de.png", "emoji/1f4f5.png",
  "emoji/1f4f7.png", "emoji/1f514.png", "emoji/1f525.png", "emoji/1f52c.png",
  "emoji/1f552.png", "emoji/1f5a5.png", "emoji/1f5c2.png", "emoji/1f5d3.png",
  "emoji/1f5e3.png", "emoji/1f634.png", "emoji/1f64f.png", "emoji/1f697.png",
  "emoji/1f6ad.png", "emoji/1f6b4.png", "emoji/1f6b6.png", "emoji/1f6bf.png",
  "emoji/1f6cc.png", "emoji/1f6d2.png", "emoji/1f938.png", "emoji/1f940.png",
  "emoji/1f94b.png", "emoji/1f957.png", "emoji/1f966.png", "emoji/1f9b7.png",
  "emoji/1f9d8.png", "emoji/1f9e0.png", "emoji/1f9f9.png", "emoji/1f9fa.png",
  "emoji/1f9fc.png", "emoji/1fa7a.png", "emoji/1fa99.png", "emoji/23f0.png",
  "emoji/2615.png", "emoji/26a0.png", "emoji/26bd.png", "emoji/2705.png",
  "emoji/2708.png", "emoji/270d.png", "emoji/270f.png", "emoji/2764.png",
  "emoji/2b50.png",
];

const ASSETS = [
  "./",
  "index.html",
  "style.css",
  "app.js",
  "timer-worker.js",
  "manifest.json",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-192.png",
  "icons/icon-maskable-512.png",
].concat(EMOJI_ASSETS);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("./");
    })
  );
});

// Cache-first com atualização em background. Também cacheia o CDN do
// Chart.js (o script é carregado com crossorigin, então response.ok funciona).
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || !event.request.url.startsWith("http")) return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
