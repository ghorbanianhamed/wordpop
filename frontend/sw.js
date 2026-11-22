// WordPop service worker: instant start from cache + push notifications.
const CACHE = "wordpop-v18";
const SHELL = ["/", "/index.html", "/styles.css", "/app.js", "/manifest.webmanifest", "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  // cache: "reload" fetches fresh copies from the server, never from the browser's HTTP cache,
  // so a new version is installed with its own files.
  const fresh = SHELL.map((url) => new Request(url, { cache: "reload" }));
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(fresh)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Only keep real WordPop files. While the free server is asleep, the host may answer
// with its own "waking up" page, which must never replace the app in the cache.
async function isGenuine(res, url) {
  if (!res || !res.ok || res.type !== "basic") return false;
  const type = res.headers.get("content-type") || "";
  if (url.pathname.endsWith(".js")) return type.includes("javascript");
  if (url.pathname.endsWith(".css")) return type.includes("css");
  if (type.includes("text/html")) return (await res.clone().text()).includes('id="view"') ||
    ["privacy.html", "terms.html", "delete-account.html"].some((p) => url.pathname.endsWith(p));
  return true;
}

// Stale-while-revalidate: answer instantly from the cache, then refresh it in the
// background so the next launch gets any update. The API is never cached.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  const key = event.request.mode === "navigate" ? "/index.html" : event.request;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(key);
    const refresh = fetch(event.request).then(async (res) => {
      if (await isGenuine(res, url)) await cache.put(key, res.clone());
      return res;
    }).catch(() => null);

    if (cached) {
      event.waitUntil(refresh);
      return cached;
    }
    return (await refresh) || caches.match("/index.html");
  })());
});

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data?.text() }; }
  event.waitUntil(
    self.registration.showNotification(data.title || "WordPop", {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      tag: data.tag || "wordpop",
      data: { url: data.url || "/#/quiz" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/#/quiz";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const win of wins) {
        if ("focus" in win) {
          win.postMessage({ type: "navigate", url: target.replace(/^\//, "") });
          return win.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
