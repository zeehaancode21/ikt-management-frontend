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

// ─── Background Messages (app closed or tab not focused) ──────────────────────
messaging.onBackgroundMessage((payload) => {
  console.log("Background message received:", payload);

  const title = payload.notification?.title ?? "New Message";
  const body  = payload.notification?.body  ?? "";
  const icon  = payload.notification?.icon  ?? "/IKT.png";

  self.registration.showNotification(title, {
    body,
    icon,
    badge: "/IKT.png",
    vibrate: [200, 100, 200],
    data: payload.data ?? {},
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

  // Open /messages page when notification is clicked
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // If app is already open, focus it
        for (const client of clientList) {
          if (client.url.includes("/messages") && "focus" in client) {
            return client.focus();
          }
        }
        // Otherwise open a new window
        if (clients.openWindow) {
          return clients.openWindow("/messages");
        }
      })
  );
});