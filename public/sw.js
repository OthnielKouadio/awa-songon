// Service worker minimal : sert uniquement à rendre l'app installable et à
// accélérer les rechargements (cache des fichiers statiques immuables).
// Aucune donnée métier (commandes, prix, sessions, appels Supabase) n'est
// jamais mise en cache — tout ça reste toujours en direct du réseau, pour
// ne jamais montrer un statut de commande périmé.
const CACHE = "awa-static-v2"; // changer la version purge les anciens caches à l'activation

// En local (next dev), les fichiers /_next/static gardent le même nom d'une
// version à l'autre : les mettre en cache ferait tourner du code périmé. Ici le
// service worker vide tout, se désinscrit et recharge les onglets ouverts.
const LOCAL = ["localhost", "127.0.0.1", "[::1]"].includes(self.location.hostname);

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  if (LOCAL) {
    event.waitUntil(
      caches
        .keys()
        .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
        .then(() => self.registration.unregister())
        .then(() => self.clients.matchAll({ type: "window" }))
        .then((tabs) => tabs.forEach((t) => t.navigate(t.url)))
    );
    return;
  }
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/** Fichiers hashés par Next.js (JS/CSS immuables) et nos propres icônes/polices. */
function isStaticAsset(url) {
  return url.origin === self.location.origin && (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/"));
}

self.addEventListener("fetch", (event) => {
  if (LOCAL || event.request.method !== "GET") return; // local : jamais de cache · écritures : jamais interceptées

  const url = new URL(event.request.url);
  if (!isStaticAsset(url)) return; // tout le reste (pages, API Supabase) : réseau direct, sans passer par le SW

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(event.request);
      const network = fetch(event.request)
        .then((res) => {
          if (res.ok) cache.put(event.request, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || network; // affiche le cache tout de suite si dispo, rafraîchit en tâche de fond
    })
  );
});
