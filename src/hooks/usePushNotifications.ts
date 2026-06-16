import { useEffect, useCallback } from "react";
import { messaging, requestNotificationPermission, onMessage } from "@/lib/firebase";
import api from "@/lib/api";

/**
 * Call this hook once inside your authenticated layout (e.g. AppLayout.tsx).
 * It will:
 *  1. Ask the user for notification permission
 *  2. Get the FCM token and send it to your backend
 *  3. Listen for foreground messages and show a browser notification
 */
export function usePushNotifications() {
  const registerToken = useCallback(async () => {
    try {
      const token = await requestNotificationPermission();
      if (!token) return;

      // Send the FCM token to your Spring Boot backend
      // Your backend should store this token against the logged-in user
      await api.post("/notifications/fcm-token", { token });
      console.log("FCM token registered with backend.");
    } catch (err) {
      console.error("Error registering FCM token:", err);
    }
  }, []);

  useEffect(() => {
    registerToken();

    // ─── Foreground Messages (app is open and focused) ──────────────────
    const unsubscribe = onMessage(messaging, (payload) => {
      console.log("Foreground message received:", payload);

      const title = payload.notification?.title ?? "New Message";
      const body  = payload.notification?.body  ?? "";

      // Show native browser notification even when app is open
      if (Notification.permission === "granted") {
        const notification = new Notification(title, {
          body,
          icon: "/IKT.png",
          badge: "/IKT.png",
        });

        // Click notification → go to messages page
        notification.onclick = () => {
          window.focus();
          window.location.href = "/messages";
        };
      }
    });

    return () => unsubscribe();
  }, [registerToken]);
}