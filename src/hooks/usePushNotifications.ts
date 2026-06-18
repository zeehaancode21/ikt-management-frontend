// src/hooks/usePushNotifications.ts
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
      // Check if browser supports notifications
      if (!('Notification' in window)) {
        console.log('⚠️ This browser does not support notifications');
        return;
      }

      // Check if permission is already denied
      if (Notification.permission === 'denied') {
        console.log('⚠️ Notification permission is denied. Please enable it in browser settings.');
        return;
      }

      console.log('📱 Requesting notification permission...');
      const token = await requestNotificationPermission();
      
      if (!token) {
        console.log('⚠️ No FCM token received');
        return;
      }

      console.log('✅ FCM Token obtained:', token);

      // ✅ FIX: Use /api prefix to match backend controller
      const response = await api.post("/api/notifications/fcm-token", { token });
      console.log("✅ FCM token registered with backend:", response.data);
      
    } catch (err: any) {
      console.error("❌ Error registering FCM token:", err);
      
      // Log detailed error information
      if (err.response) {
        console.error("📝 Response data:", err.response.data);
        console.error("📝 Response status:", err.response.status);
        console.error("📝 Response headers:", err.response.headers);
      } else if (err.request) {
        console.error("📝 No response received:", err.request);
      } else {
        console.error("📝 Error message:", err.message);
      }
    }
  }, []);

  useEffect(() => {
    // Register token when component mounts
    registerToken();

    // ─── Foreground Messages (app is open and focused) ──────────────────
    const unsubscribe = onMessage(messaging, (payload) => {
      console.log("📩 Foreground message received:", payload);

      // Try notification first, then data payload
      const title = payload.notification?.title ?? payload.data?.title ?? "New Message";
      const body = payload.notification?.body ?? payload.data?.body ?? "";
      const icon = payload.notification?.image ?? payload.data?.image ?? "/IKT.png";

      // Show native browser notification even when app is open
      if (Notification.permission === "granted") {
        try {
          const notification = new Notification(title, {
            body,
            icon: icon,
            badge: "/IKT.png",
            vibrate: [200, 100, 200],
            silent: false,
            tag: "message-notification",
            data: payload.data || {},
          });

          // Click notification → go to messages page
          notification.onclick = () => {
            window.focus();
            // If the app is already on messages page, just focus, else navigate
            if (window.location.pathname !== "/messages") {
              window.location.href = "/messages";
            }
          };

          // Auto-close notification after 10 seconds
          setTimeout(() => {
            notification.close();
          }, 10000);

        } catch (notifError) {
          console.error("❌ Error showing notification:", notifError);
        }
      } else {
        console.log("⚠️ Notification permission not granted. Current status:", Notification.permission);
      }
    });

    // ─── Cleanup on unmount ──────────────────────────────────────────────────
    return () => {
      if (unsubscribe) {
        unsubscribe();
        console.log("📱 Push notifications unsubscribed");
      }
    };
  }, [registerToken]);

  // ─── Return useful methods for manual control ─────────────────────────────
  return {
    // Method to manually re-register token
    reRegisterToken: registerToken,
    // Check if notifications are supported
    isSupported: 'Notification' in window,
    // Check current permission status
    permissionStatus: typeof Notification !== 'undefined' ? Notification.permission : 'unsupported',
  };
}