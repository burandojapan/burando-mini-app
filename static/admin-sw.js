// Cache only versioned admin assets. Never cache customer, auth or receipt responses.
const CACHE = "burando-admin-v8";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("burando-admin-") && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (event) => {
  const request = event.request,
    url = new URL(request.url);
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    !/^\/static\/(admin(?:-v7|-workspace)?\.(?:css|js)|burando-admin-\d+\.png)$/.test(
      url.pathname,
    )
  )
    return;
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (
          response.ok &&
          !response.headers.get("content-type")?.includes("text/html")
        ) {
          const copy = response.clone();
          event.waitUntil(
            caches.open(CACHE).then((cache) => cache.put(request, copy)),
          );
        }
        return response;
      })
      .catch(async () => (await caches.match(request)) || Response.error()),
  );
});
