// src/hooks/usePushNotifications.ts
import { useEffect, useCallback, useState } from "react";
import { messaging, requestNotificationPermission, onMessage } from "@/lib/firebase";
import api from "@/lib/api";

export function usePushNotifications() {
  const [serviceWorkerReady, setServiceWorkerReady] = useState(false);

  const registerToken = useCallback(async () => {
    try {
      if (!('Notification' in window)) {
        console.log('⚠️ This browser does not support notifications');
        return;
      }

      if (Notification.permission === 'denied') {
        console.log('⚠️ Notification permission is denied.');
        return;
      }

      console.log('📱 Requesting notification permission...');
      const token = await requestNotificationPermission();
      
      if (!token) {
        console.log('⚠️ No FCM token received');
        return;
      }

      console.log('✅ FCM Token obtained:', token);
      const response = await api.post("/api/notifications/fcm-token", { token });
      console.log("✅ FCM token registered with backend:", response.data);
      
    } catch (err: any) {
      console.error("❌ Error registering FCM token:", err);
      
      if (err.response) {
        console.error("📝 Response data:", err.response.data);
        console.error("📝 Response status:", err.response.status);
      }
    }
  }, []);

  // ✅ METHOD 1: Force Notification via Service Worker Registration
  const showForcedNotification = useCallback(async (title: string, body: string, icon: string, payload: any) => {
    try {
      if (!('Notification' in window)) {
        console.warn('⚠️ Notification API not supported');
        return false;
      }

      if (Notification.permission !== "granted") {
        console.warn('⚠️ Permission not granted:', Notification.permission);
        return false;
      }

      // ✅ Get the service worker registration
      let registration;
      try {
        registration = await navigator.serviceWorker.ready;
      } catch (error) {
        console.error('❌ Failed to get service worker:', error);
        return false;
      }

      if (!registration) {
        console.warn('⚠️ No service worker registration found');
        return false;
      }

      console.log('📤 Showing forced notification via service worker...');

      // ✅ Try with showNotification
      await registration.showNotification(title || "New Message", {
        body: body || "You have a new message",
        icon: icon || "/IKT.png",
        badge: "/IKT.png",
        vibrate: [200, 100, 200],
        data: payload?.data || {},
        requireInteraction: true,
        silent: false,
        tag: "forced-" + Date.now(),
        actions: [
          { action: "open", title: "Open App" },
          { action: "dismiss", title: "Dismiss" },
        ],
      });

      console.log('✅ Forced notification shown successfully');
      return true;

    } catch (error) {
      console.error('❌ Forced notification failed:', error);
      return false;
    }
  }, []);

  // ✅ METHOD 2: Direct Notification with Fallback
  const showDirectNotification = useCallback((title: string, body: string, icon: string, payload: any) => {
    try {
      if (!('Notification' in window)) {
        console.warn('⚠️ Notification API not supported');
        return false;
      }

      if (Notification.permission !== "granted") {
        console.warn('⚠️ Permission not granted:', Notification.permission);
        return false;
      }

      console.log('📤 Showing direct notification...');

      const notificationOptions: NotificationOptions = {
        body: body || "You have a new message",
        icon: icon || "/IKT.png",
        badge: "/IKT.png",
        silent: false,
        tag: "direct-" + Date.now(),
        data: payload?.data || {},
        requireInteraction: true,
        renotify: true,
      };

      if ('vibrate' in navigator) {
        notificationOptions.vibrate = [200, 100, 200];
      }

      const notification = new Notification(title || "New Message", notificationOptions);

      notification.onclick = (event) => {
        event.preventDefault();
        window.focus();
        if (window.location.pathname !== "/messages") {
          window.location.href = "/messages";
        }
      };

      setTimeout(() => notification.close(), 10000);

      console.log('✅ Direct notification shown successfully');
      return true;

    } catch (error) {
      console.error('❌ Direct notification failed:', error);
      return false;
    }
  }, []);

  // ✅ METHOD 3: HTML/CSS Custom Notification (Always works!)
  const showCustomNotification = useCallback((title: string, body: string) => {
    try {
      console.log('📤 Showing custom HTML notification...');

      // Remove any existing custom notifications
      const existing = document.querySelector('.custom-notification-container');
      if (existing) existing.remove();

      // Create container
      const container = document.createElement('div');
      container.className = 'custom-notification-container';
      container.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 999999;
        width: 380px;
        max-width: 90vw;
        animation: slideInRight 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        cursor: pointer;
      `;

      // Create notification card
      const card = document.createElement('div');
      card.style.cssText = `
        background: #1e293b;
        color: #f1f5f9;
        border-radius: 16px;
        padding: 20px 24px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
        border-left: 5px solid #3b82f6;
        display: flex;
        align-items: flex-start;
        gap: 14px;
        transition: transform 0.2s;
        backdrop-filter: blur(10px);
        background: rgba(30, 41, 59, 0.95);
      `;

      // Icon
      const iconDiv = document.createElement('div');
      iconDiv.style.cssText = `
        flex-shrink: 0;
        width: 44px;
        height: 44px;
        border-radius: 50%;
        background: #3b82f6;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 20px;
      `;
      iconDiv.textContent = '💬';

      // Content
      const contentDiv = document.createElement('div');
      contentDiv.style.cssText = `
        flex: 1;
        min-width: 0;
      `;

      const titleEl = document.createElement('div');
      titleEl.style.cssText = `
        font-weight: 700;
        font-size: 15px;
        color: #f1f5f9;
        margin-bottom: 4px;
      `;
      titleEl.textContent = title || 'New Message';

      const bodyEl = document.createElement('div');
      bodyEl.style.cssText = `
        font-size: 13.5px;
        color: #94a3b8;
        line-height: 1.5;
        word-wrap: break-word;
      `;
      bodyEl.textContent = body || 'You have a new message';

      // Close button
      const closeBtn = document.createElement('button');
      closeBtn.style.cssText = `
        flex-shrink: 0;
        background: none;
        border: none;
        color: #64748b;
        cursor: pointer;
        font-size: 20px;
        padding: 0 4px;
        transition: color 0.2s;
        line-height: 1;
      `;
      closeBtn.textContent = '✕';
      closeBtn.onmouseenter = () => closeBtn.style.color = '#f1f5f9';
      closeBtn.onmouseleave = () => closeBtn.style.color = '#64748b';

      // Assemble
      contentDiv.appendChild(titleEl);
      contentDiv.appendChild(bodyEl);
      card.appendChild(iconDiv);
      card.appendChild(contentDiv);
      card.appendChild(closeBtn);
      container.appendChild(card);

      // Add to DOM
      document.body.appendChild(container);

      // Animation styles
      const style = document.createElement('style');
      style.textContent = `
        @keyframes slideInRight {
          from { transform: translateX(120%) scale(0.95); opacity: 0; }
          to { transform: translateX(0) scale(1); opacity: 1; }
        }
        @keyframes slideOutRight {
          from { transform: translateX(0) scale(1); opacity: 1; }
          to { transform: translateX(120%) scale(0.95); opacity: 0; }
        }
      `;
      if (!document.querySelector('#custom-notif-styles')) {
        style.id = 'custom-notif-styles';
        document.head.appendChild(style);
      }

      // Click handlers
      const closeNotification = () => {
        container.style.animation = 'slideOutRight 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards';
        setTimeout(() => container.remove(), 350);
      };

      closeBtn.onclick = (e) => {
        e.stopPropagation();
        closeNotification();
      };

      container.onclick = () => {
        window.focus();
        if (window.location.pathname !== "/messages") {
          window.location.href = "/messages";
        }
        closeNotification();
      };

      // Auto-close after 10 seconds
      setTimeout(closeNotification, 10000);

      // Play sound if possible
      try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        gainNode.gain.value = 0.1;
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.15);
      } catch (audioError) {
        // Silent fail for audio
      }

      console.log('✅ Custom HTML notification shown');
      return true;

    } catch (error) {
      console.error('❌ Custom notification failed:', error);
      return false;
    }
  }, []);

  // ✅ MAIN: Try all methods
  const showNotification = useCallback(async (title: string, body: string, icon: string, payload: any) => {
    console.log('🔔 Attempting to show notification...');

    // ✅ Try all methods in sequence
    const methods = [
      { name: 'Forced Service Worker', fn: () => showForcedNotification(title, body, icon, payload) },
      { name: 'Direct Notification', fn: () => showDirectNotification(title, body, icon, payload) },
    ];

    for (const method of methods) {
      try {
        const result = await method.fn();
        if (result) {
          console.log(`✅ Success using: ${method.name}`);
          
          // ✅ Also show custom notification as backup
          setTimeout(() => {
            showCustomNotification(title, body);
          }, 300);
          
          return true;
        }
      } catch (error) {
        console.warn(`❌ Method ${method.name} failed:`, error);
      }
    }

    // ✅ Fallback: Always show custom HTML notification
    console.log('📤 Using final fallback: Custom HTML notification');
    showCustomNotification(title, body);
    return false;
  }, [showForcedNotification, showDirectNotification, showCustomNotification]);

  // ✅ Initialize service worker
  useEffect(() => {
    const initServiceWorker = async () => {
      try {
        if ('serviceWorker' in navigator) {
          const registration = await navigator.serviceWorker.ready;
          setServiceWorkerReady(true);
          console.log('✅ Service worker ready:', registration);
          
          // ✅ Test if service worker can show notifications
          try {
            await registration.showNotification('Test', {
              body: 'Service worker is working!',
              icon: '/IKT.png',
              requireInteraction: true,
            });
            console.log('✅ Service worker test notification worked!');
          } catch (testError) {
            console.warn('⚠️ Service worker test notification failed:', testError);
          }
        }
      } catch (error) {
        console.error('❌ Service worker init failed:', error);
      }
    };

    initServiceWorker();
  }, []);

  useEffect(() => {
    registerToken();

    const unsubscribe = onMessage(messaging, async (payload) => {
      console.log("📩 Foreground message received:", payload);

      const title = 
        payload.notification?.title ?? 
        payload.data?.title ?? 
        "New Message";
      
      const body = 
        payload.notification?.body ?? 
        payload.data?.body ?? 
        "";
      
      const icon = 
        payload.notification?.image ?? 
        payload.data?.image ?? 
        "/IKT.png";

      console.log('📨 Extracted notification data:', { title, body, icon });

      // ✅ Show notification
      await showNotification(title, body, icon, payload);
    });

    return () => {
      if (unsubscribe) {
        unsubscribe();
        console.log("📱 Push notifications unsubscribed");
      }
    };
  }, [registerToken, showNotification]);

  return {
    reRegisterToken: registerToken,
    isSupported: 'Notification' in window,
    permissionStatus: typeof Notification !== 'undefined' ? Notification.permission : 'unsupported',
    serviceWorkerReady,
    showNotification,
  };
}