// public/firebase-messaging-sw.js
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js");

// ⚠️ Hardcoded here because service workers cannot access import.meta.env
firebase.initializeApp({
  apiKey: "AIzaSyDjiYxIJR6a-seO0AUsDsRA0KAqH5JatQ0",
  authDomain: "ik-tangience.firebaseapp.com",
  projectId: "ik-tangience",
  storageBucket: "ik-tangience.firebasestorage.app",
  messagingSenderId: "631990889690",
  appId: "1:631990889690:web:c973f976ec8360323cc9e3",
});

const messaging = firebase.messaging();

// ─── Handle Messages from Client ──────────────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, body, icon, data } = event.data;
    console.log('📩 Service worker received notification request:', { title, body });
    
    // ✅ Show notification using service worker API
    self.registration.showNotification(title || "New Message", {
      body: body || "You have a new message",
      icon: icon || "/IKT.png",
      badge: "/IKT.png",
      vibrate: [200, 100, 200],
      data: data || {},
      requireInteraction: true,
      tag: "message-" + Date.now(),
      actions: [
        { action: "open", title: "Open App" },
        { action: "dismiss", title: "Dismiss" },
      ],
    }).then(() => {
      console.log('✅ Notification shown by service worker');
    }).catch((error) => {
      console.error('❌ Service worker failed to show notification:', error);
    });
  }
});

// ─── Background Messages ──────────────────────────────────────────────────────
messaging.onBackgroundMessage((payload) => {
  console.log("📩 Background message received:", payload);

  const title = payload.notification?.title ?? payload.data?.title ?? "New Message";
  const body = payload.notification?.body ?? payload.data?.body ?? "";
  const icon = payload.notification?.image ?? payload.data?.image ?? "/IKT.png";

  self.registration.showNotification(title, {
    body,
    icon,
    badge: "/IKT.png",
    vibrate: [200, 100, 200],
    data: payload.data ?? {},
    requireInteraction: true,
    actions: [
      { action: "open", title: "Open App" },
      { action: "dismiss", title: "Dismiss" },
    ],
  });
});

// ─── Notification Click Handler ───────────────────────────────────────────────
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  if (event.action === "dismiss") return;

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes("/messages") && "focus" in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow("/messages");
        }
      })
  );
});