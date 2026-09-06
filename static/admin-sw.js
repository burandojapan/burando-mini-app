const CACHE = "burando-admin-v1";

const STATIC_FILES = [
  "/static/admin.css?v=5",
  "/static/admin.js?v=5",
  "/static/burando-admin-192.png",
  "/static/burando-admin-512.png",
  "/static/burando-admin-180.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then(cache => cache.addAll(STATIC_FILES))
  );

  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE)
          .map(key => caches.delete(key))
      )
    )
  );

  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET") {
    return;
  }

  // API doim serverdan
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  // Admin HTML network-first
  if (
    url.pathname === "/admin" ||
    url.pathname === "/"
  ) {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(request)
      )
    );

    return;
  }

  // Static asset cache-first
  if (url.pathname.startsWith("/static/")) {
    event.respondWith(
      caches.match(request).then(cached =>
        cached ||
        fetch(request).then(response => {
          const clone = response.clone();

          caches.open(CACHE).then(cache =>
            cache.put(request, clone)
          );

          return response;
        })
      )
    );
  }
});
