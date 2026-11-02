// Service worker : l'app fonctionne hors ligne (sauf l'interrogation d'Open Food Facts).
// Changer VERSION à chaque mise en ligne pour forcer la mise à jour des fichiers en cache.
const VERSION = "fameux-n-v15";
const LIB = "https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js";
const SHELL = [
  "./",
  "./index.html",
  "./pourquoi.html",
  "./style.css",
  "./app.js",
  "./config.js",
  "./flammes.svg",
  "./motif-codes.svg",
  "./marques-nestle.json",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
  LIB,
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Open Food Facts : toujours en direct
  if (url.hostname.endsWith("openfoodfacts.org")) return;

  // La liste des marques : réseau d'abord pour avoir la dernière version, cache sinon
  if (url.pathname.endsWith("/marques-nestle.json")) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put("./marques-nestle.json", copy));
          return res;
        })
        .catch(() => caches.match("./marques-nestle.json"))
    );
    return;
  }

  // Polices Google : mises en cache au premier passage pour fonctionner hors ligne
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy));
        return res;
      }))
    );
    return;
  }

  // Le reste : cache d'abord
  event.respondWith(
    caches.match(req, { ignoreSearch: url.origin === location.origin }).then((hit) => hit || fetch(req))
  );
});
