// Ultra-Fast Edge & Offline Service Worker
// Brand values come from /pwa-config.js (auto-generated from white-label.config.ts).
importScripts("/pwa-config.js");
const CACHE_NAME = "genius-library-v6";

const CRITICAL_STATIC_ASSETS = [
  "/",
  "/?source=pwa",
  "/index.html",
  "/manifest.webmanifest",
  "/manifest.json",
  "/navbarlogo.png",
  "/navbarlogo-dark.png",
  "/navbaricon.png",
  "/logo.png",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
  "/favicon.ico",
  "/library-hall.jpg",
  "/library-cubicle.jpg",
  "/library-lounge.jpg",
  "/hero-banner.jpg",
];

// Install: Pre-cache critical homepage shell & assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await Promise.all(
        CRITICAL_STATIC_ASSETS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn(`[PWA SW] Pre-cache skipped for ${url}:`, err);
          })
        )
      );
    })
  );
  self.skipWaiting();
});

// Activate: Immediately purge old cache versions to ensure zero stale conflicts
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch: Edge-speed offline-first caching
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // 1. Only intercept GET requests from the same origin
  if (event.request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  // 2. Bypass API routes, Supabase calls, and HMR hot-updates
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.includes("hot-update")
  ) {
    return;
  }

  // 3. Next.js Static Chunks & Styles (/_next/static/*) -> Cache-First
  // Hashed filenames never change, giving 0ms response time and full offline hydration
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // 4. Static Media & Images -> Cache-First with network fallback
  if (
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".jpg") ||
    url.pathname.endsWith(".jpeg") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".ico") ||
    url.pathname.endsWith(".webp") ||
    url.pathname.endsWith(".woff2")
  ) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // 5. HTML Navigation (Homepage and routes) -> Network-First with Instant Offline Fallback
  // Guarantees browser always loads matching, up-to-date CSS/JS chunk hashes from new deployments
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(event.request);
          if (cached) return cached;
          const fallback = (await caches.match("/")) || (await caches.match("/index.html"));
          if (fallback) return fallback;
          return new Response("Offline - " + (self.PWA_CONFIG?.brand?.fullName || "Library"), {
            status: 503,
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
        })
    );
    return;
  }
});

// Native Push Notifications
self.addEventListener("push", (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: self.PWA_CONFIG?.brand?.shortName || "Library", body: event.data.text() };
    }
  }

  const title = data.title || self.PWA_CONFIG?.brand?.fallbackTitle || "Library";
  const options = {
    body: data.body || data.message || "New notification from library",
    icon: data.icon || "/icon-192.png",
    badge: "/icon-192.png",
    vibrate: [200, 100, 200],
    tag: data.tag || `notif-${Date.now()}`,
    data: {
      url: data.url || data.actionUrl || "/",
    },
  };

  // Update App Badge if supported (Badging API)
  if ("setAppBadge" in navigator) {
    const badgeVal = data.badge ? parseInt(data.badge, 10) : 1;
    navigator.setAppBadge(badgeVal).catch(() => {});
  }

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
