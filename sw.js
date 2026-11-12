/* Slobex – Hintergrunddienst der Web-App (iPhone).
 * - lädt die App-Dateien schnell aus dem Zwischenspeicher
 * - fasst keine Server-Anfragen an (Nachrichten, Anmeldung) – die gehen immer direkt
 * - zeigt Benachrichtigungen (siehe unten)
 */
const VERSION = "1.7.0-1794496045884";
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

/* ---- Benachrichtigungen (Firebase Cloud Messaging, Datennachrichten) ----
 * Der Server schickt nur Datennachrichten an die Web-App; hier wird daraus
 * eine sichtbare Mitteilung. Nachrichtentext ist nie enthalten (nur „Neue
 * Nachricht von …“), außer bei Schnellfragen.
 */
self.addEventListener("push", (e) => {
  let d = {};
  try {
    const p = e.data ? e.data.json() : {};
    d = p.data || p || {};
  } catch {
    d = {};
  }
  const type = d.type || "message";
  const title = d.title || "Slobex";
  let body = d.body || "Neue Nachricht";
  if (type === "question" && d.choices) body += "\n" + String(d.choices).split("\n").join(" · ");
  const tag = d.callId || d.conversationId || type;
  const opts = {
    body,
    tag,
    renotify: type === "call" || type === "knock",
    silent: d.silent === "1",
    icon: SCOPE + "icon-192.png",
    badge: SCOPE + "icon-192.png",
    data: { conversationId: d.conversationId || "", type },
    requireInteraction: type === "call",
  };
  e.waitUntil(
    (async () => {
      // Ist Slobex gerade sichtbar offen, nicht zusätzlich stören (außer Anruf)
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const visible = wins.some((w) => w.visibilityState === "visible");
      if (visible && type !== "call" && type !== "knock") {
        // iPhone verlangt zu jeder Push-Nachricht eine Mitteilung – kurz zeigen und gleich schließen
        await self.registration.showNotification(title, { ...opts, silent: true });
        const shown = await self.registration.getNotifications({ tag });
        shown.forEach((n) => n.close());
        return;
      }
      await self.registration.showNotification(title, opts);
    })(),
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const id = (e.notification.data && e.notification.data.conversationId) || "";
  e.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const win = wins.find((w) => w.url.startsWith(SCOPE));
      if (win) {
        await win.focus();
        if (id) win.postMessage({ type: "open-chat", conversationId: id });
        return;
      }
      await self.clients.openWindow(SCOPE + (id ? "?chat=" + encodeURIComponent(id) : ""));
    })(),
  );
});

