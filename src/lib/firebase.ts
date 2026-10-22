import { initializeApp } from "firebase/app";
import { getMessaging, getToken, onMessage } from "firebase/messaging";

import { logger } from "@/lib/logger";
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const messaging = getMessaging(app);

/**
 * Requests notification permission from the browser
 * and returns the FCM token to send to your backend.
 */
export async function requestNotificationPermission(): Promise<string | null> {
  try {
    // Check if browser supports notifications
    if (!("Notification" in window)) {
      logger.warn("This browser does not support notifications.");
      return null;
    }

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      logger.warn("Notification permission denied.");
      return null;
    }

    // Register service worker first
    const registration = await navigator.serviceWorker.register(
      "/firebase-messaging-sw.js"
    );

    const token = await getToken(messaging, {
      vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: registration,
    });

    logger.log("FCM token obtained");
    return token;
  } catch (err) {
    logger.error("Failed to get FCM token:", err);
    return null;
  }
}

export { onMessage };