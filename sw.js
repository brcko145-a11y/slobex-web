/* Slobex – Hintergrunddienst der Web-App (iPhone).
 * - lädt die App-Dateien schnell aus dem Zwischenspeicher
 * - fasst keine Server-Anfragen an (Nachrichten, Anmeldung) – die gehen immer direkt
 * - zeigt Benachrichtigungen (siehe unten)
 */
const VERSION = "1.7.0-1794444641485";
const CACHE = "slobex-" + VERSION;
const SCOPE = self.registration.scope;

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll([SCOPE, SCOPE + "index.html"]))
      .then(() => self.skipWaiting()),
  );
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("slobex-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // Nur eigene Dateien; alles andere (Server, Firebase) unverändert durchlassen
  if (e.request.method !== "GET" || url.origin !== self.location.origin || !url.href.startsWith(SCOPE)) return;
  if (e.request.mode === "navigate") {
    // Seite: erst Netz (neueste Version), sonst gespeicherte
    e.respondWith(
      fetch(e.request)
        .then((r) => {
          const copy = r.clone();
          caches.open(CACHE).then((c) => c.put(SCOPE + "index.html", copy));
          return r;
        })
        .catch(() => caches.match(SCOPE + "index.html")),
    );
    return;
  }
  if (url.pathname.includes("/assets/") || /\.(png|svg|webmanifest)$/.test(url.pathname)) {
    // Dateien mit Prüfsumme im Namen ändern sich nie → aus dem Speicher
    e.respondWith(
      caches.match(e.request).then(
        (hit) =>
          hit ||
          fetch(e.request).then((r) => {
            if (r.ok) {
              const copy = r.clone();
              caches.open(CACHE).then((c) => c.put(e.request, copy));
            }
            return r;
          }),
      ),
    );
  }
});

/* __SLOBEX_PUSH__ */
