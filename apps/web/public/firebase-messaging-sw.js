// Scripts for firebase and firebase messaging
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');
importScripts('/pwa-config.js');

// Firebase web config comes from /pwa-config.js (auto-generated from white-label.config.ts).
const firebaseConfig = self.PWA_CONFIG.firebase;

firebase.initializeApp(firebaseConfig);

// Retrieve an instance of Firebase Messaging so that it can handle background messages.
const messaging = firebase.messaging();

// Handle background push messages even when PWA is completely closed
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);

  const notificationTitle = payload.notification?.title || payload.data?.title || self.PWA_CONFIG?.brand?.fallbackTitle || 'Library';
  const notificationOptions = {
    body: payload.notification?.body || payload.data?.body || self.PWA_CONFIG?.brand?.fallbackBody || 'New alert from your library.',
    icon: payload.notification?.icon || payload.data?.icon || '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [200, 100, 200],
    requireInteraction: true,
    tag: payload.data?.tag || `genius-fcm-${Date.now()}`,
    data: {
      url: payload.data?.url || payload.fcmOptions?.link || '/',
    },
  };

  // Update App Badge if supported (Badging API)
  if ('setAppBadge' in navigator) {
    const badgeCount = payload.data?.badge ? parseInt(payload.data.badge, 10) : 1;
    navigator.setAppBadge(badgeCount).catch(() => {});
  }

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Fallback native push event listener
self.addEventListener('push', (event) => {
  if (!event.data) return;
  try {
    const data = event.data.json();
    const title = data.notification?.title || data.data?.title || self.PWA_CONFIG?.brand?.fallbackTitle || 'Library';
    const options = {
      body: data.notification?.body || data.data?.body || 'New update received',
      icon: data.notification?.icon || data.data?.icon || '/icon-192.png',
      badge: '/icon-192.png',
      vibrate: [200, 100, 200],
      requireInteraction: true,
      tag: data.data?.tag || `genius-push-${Date.now()}`,
      data: {
        url: data.data?.url || data.fcmOptions?.link || '/',
      },
    };
    event.waitUntil(self.registration.showNotification(title, options));
  } catch (e) {}
});

// Handle notification click to navigate user to appropriate page
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
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
