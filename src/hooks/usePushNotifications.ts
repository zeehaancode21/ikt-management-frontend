// src/hooks/usePushNotifications.ts
import { useEffect, useCallback, useState, useRef } from "react";
import { messaging, requestNotificationPermission, onMessage } from "@/lib/firebase";
import api from "@/lib/api";

export function usePushNotifications() {
  const [serviceWorkerReady, setServiceWorkerReady] = useState(false);
  // ✅ Track recent notifications to prevent duplicates
  const recentNotifications = useRef<Map<string, number>>(new Map());
  const DUPLICATE_WINDOW = 3000; // 3 seconds window to detect duplicates
  const shownNotifications = useRef<Set<string>>(new Set()); // ✅ Track shown notifications

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

  // ✅ Check if notification is a duplicate
  const isDuplicateNotification = useCallback((title: string, body: string, messageId?: string) => {
    // Create a unique key for this notification
    const key = messageId || `${title}-${body}`;
    const now = Date.now();
    const lastTime = recentNotifications.current.get(key);
    
    // ✅ CRITICAL FIX: Check if this notification has already been SHOWN
    if (shownNotifications.current.has(key)) {
      console.log('🔄 Notification already shown, skipping duplicate:', key);
      return true;
    }
    
    // Check if we received this same notification recently (within DUPLICATE_WINDOW)
    if (lastTime && (now - lastTime) < DUPLICATE_WINDOW) {
      console.log('🔄 Duplicate notification detected in time window, skipping:', key);
      return true;
    }
    
    // ✅ Store the current time for this notification
    recentNotifications.current.set(key, now);
    
    // Clean up old entries (older than 10 seconds)
    for (const [k, v] of recentNotifications.current.entries()) {
      if (now - v > 10000) {
        recentNotifications.current.delete(k);
        // Also clean up shown notifications
        shownNotifications.current.delete(k);
      }
    }
    
    return false;
  }, []);

  // ✅ MARK notification as shown
  const markNotificationAsShown = useCallback((messageId?: string) => {
    if (messageId) {
      shownNotifications.current.add(messageId);
    }
  }, []);

  // ✅ METHOD 1: Force Notification via Service Worker Registration (WITH LOGO)
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

      const messageId = payload?.data?.messageId || payload?.messageId || Date.now().toString();
      
      // ✅ Try with showNotification (WITH LOGO)
      await registration.showNotification(title || "New Message", {
        body: body || "You have a new message",
        icon: icon || "/IKT.png", // ✅ This shows the logo
        badge: "/IKT.png",
        
        data: payload?.data || {},
        requireInteraction: false,
        silent: false,
        tag: "msg-" + messageId,
        actions: [
          { action: "open", title: "Open App" },
          { action: "dismiss", title: "Dismiss" },
        ],
      });

      // ✅ Mark as shown
      markNotificationAsShown(messageId);
      
      console.log('✅ Forced notification shown successfully with logo');
      return true;

    } catch (error) {
      console.error('❌ Forced notification failed:', error);
      return false;
    }
  }, [markNotificationAsShown]);

  // ✅ METHOD 2: Direct Notification with Fallback (WITH LOGO)
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

      const messageId = payload?.data?.messageId || payload?.messageId || Date.now().toString();

      const notificationOptions: NotificationOptions = {
        body: body || "You have a new message",
        icon: icon || "/IKT.png", // ✅ This shows the logo
        badge: "/IKT.png",
        silent: false,
        tag: "msg-" + messageId,
        data: payload?.data || {},
        requireInteraction: false,
        renotify: false,
      };

      const notification = new Notification(title || "New Message", notificationOptions);

      // ✅ Mark as shown
      markNotificationAsShown(messageId);

      notification.onclick = (event) => {
        event.preventDefault();
        window.focus();
        if (window.location.pathname !== "/messages") {
          window.location.href = "/messages";
        }
      };

      setTimeout(() => notification.close(), 10000);

      console.log('✅ Direct notification shown successfully with logo');
      return true;

    } catch (error) {
      console.error('❌ Direct notification failed:', error);
      return false;
    }
  }, [markNotificationAsShown]);

  // ✅ METHOD 3: HTML/CSS Custom Notification (Fallback - WITHOUT LOGO)
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

      // Icon (emoji fallback since we can't show logo in HTML notification easily)
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

      console.log('✅ Custom HTML notification shown (fallback)');
      return true;

    } catch (error) {
      console.error('❌ Custom notification failed:', error);
      return false;
    }
  }, []);

  // ✅ MAIN: Show notification with duplicate detection (PREFERS LOGO VERSION)
  const showNotification = useCallback(async (title: string, body: string, icon: string, payload: any) => {
    // Get messageId
    const messageId = payload?.data?.messageId || payload?.messageId;
    
    // ✅ Check for duplicate BEFORE showing
    if (messageId && isDuplicateNotification(title, body, messageId)) {
      console.log('⚠️ Skipping duplicate notification');
      return false;
    }

    console.log('🔔 Attempting to show notification...');

    // ✅ Try methods that show logo FIRST
    const methods = [
      { name: 'Forced Service Worker (with logo)', fn: () => showForcedNotification(title, body, icon, payload) },
      { name: 'Direct Notification (with logo)', fn: () => showDirectNotification(title, body, icon, payload) },
    ];

    for (const method of methods) {
      try {
        const result = await method.fn();
        if (result) {
          console.log(`✅ Success using: ${method.name}`);
          return true;
        }
      } catch (error) {
        console.warn(`❌ Method ${method.name} failed:`, error);
      }
    }

    // ✅ Last resort: Show custom HTML (without logo)
    console.log('📤 Using final fallback: Custom HTML notification (no logo)');
    showCustomNotification(title, body);
    
    // ✅ Mark as shown even for fallback
    if (messageId) {
      markNotificationAsShown(messageId);
    }
    
    return false;
  }, [showForcedNotification, showDirectNotification, showCustomNotification, isDuplicateNotification, markNotificationAsShown]);

  // ✅ Initialize service worker
  useEffect(() => {
    const initServiceWorker = async () => {
      try {
        if ('serviceWorker' in navigator) {
          const registration = await navigator.serviceWorker.ready;
          setServiceWorkerReady(true);
          console.log('✅ Service worker ready:', registration);
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

      const title = payload.notification?.title ?? payload.data?.title ?? "New Message";
      const body = payload.notification?.body ?? payload.data?.body ?? "";
      const icon = payload.notification?.image ?? payload.data?.image ?? "/IKT.png";
      const messageId = payload.data?.messageId || payload.messageId;

      console.log('📨 Extracted notification data:', { title, body, icon, messageId });

      // ✅ Show notification - duplicate detection happens inside showNotification
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