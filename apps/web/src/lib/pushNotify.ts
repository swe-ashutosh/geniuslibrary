/**
 * [WEB • LIB] Native OS Notifications
 *
 * Web & PWA Native Push Notifications Utility
 * Provides native OS popups, Service Worker integration, and cross-tab real-time sync.
 */

export interface NativeNotificationOptions {
  title: string;
  body: string;
  icon?: string;
  url?: string;
  tag?: string;
  silent?: boolean;
}

import { requestFCMToken } from "./firebase";
import { BRAND_CONFIG } from "./config";

export function isNotificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function getNotificationPermission(): NotificationPermission | "unsupported" {
  if (!isNotificationSupported()) return "unsupported";
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  if (!isNotificationSupported()) return "unsupported";
  try {
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      // Automatically register & cache FCM device token
      requestFCMToken().catch(() => {});
    }
    return permission;
  } catch (err) {
    console.warn("[PWA Notifications] Request permission error:", err);
    return Notification.permission;
  }
}

// ══════════════════════════════════════════════════════════════
// SECTION 1 · CHIME + PERMISSION
// ══════════════════════════════════════════════════════════════
export async function playNotificationChime() {
  if (typeof window === "undefined") return;
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12); // A5
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.36);
  } catch {}
}

/**
 * Triggers an OS-level native notification popup via Service Worker or Web Notification API.
 */
// ══════════════════════════════════════════════════════════════
// SECTION 2 · NATIVE NOTIFICATION TRIGGER
// Shows the OS popup via Service Worker (fallback when FCM is off).
// ══════════════════════════════════════════════════════════════
export async function triggerNativeNotification(options: NativeNotificationOptions): Promise<boolean> {
  if (typeof window === "undefined") return false;

  const title = options.title || BRAND_CONFIG.notifications.fallbackTitle;
  const body = options.body || "";
  const icon = options.icon || "/icon-192.png";
  const url = options.url || "/";
  const tag = options.tag || `genius-${Date.now()}`;

  // Audio & Haptic feedback
  if (!options.silent) {
    playNotificationChime().catch(() => {});
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      try { navigator.vibrate([150, 75, 150]); } catch {}
    }
  }

  if (!isNotificationSupported()) {
    return false;
  }

  // If permission is default, request permission on user gesture (check-in / tap)
  let permission = Notification.permission;
  if (permission === "default") {
    try {
      permission = await Notification.requestPermission();
      if (permission === "granted") {
        requestFCMToken().catch(() => {});
      }
    } catch (e) {
      console.warn("[PWA Notifications] Permission request error:", e);
    }
  }

  if (permission !== "granted") {
    return false;
  }

  try {
    // 1. Preferred method for PWAs & Android Chrome: Service Worker registration showNotification
    if ("serviceWorker" in navigator) {
      try {
        const registration = await Promise.race([
          navigator.serviceWorker.ready,
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 1200))
        ]);

        if (registration && typeof registration.showNotification === "function") {
          await registration.showNotification(title, {
            body,
            icon,
            badge: "/icon-192.png",
            vibrate: [200, 100, 200],
            tag,
            data: { url },
            silent: options.silent ?? false,
          } as any);
          return true;
        }
      } catch (swErr) {
        console.warn("[PWA Notifications] Service Worker showNotification fallback:", swErr);
      }
    }

    // 2. Fallback: Browser native Notification constructor (Desktop Chrome, Firefox, Safari)
    if (typeof Notification !== "undefined") {
      try {
        const notification = new Notification(title, {
          body,
          icon,
          tag,
          silent: options.silent ?? false,
        });

        notification.onclick = () => {
          window.focus();
          if (url) {
            window.location.href = url;
          }
          notification.close();
        };

        return true;
      } catch (notifErr) {
        console.warn("[PWA Notifications] Notification constructor fallback:", notifErr);
      }
    }

    return false;
  } catch (err) {
    console.warn("[PWA Notifications] Trigger native notification warning:", err);
    return false;
  }
}

// -------------------------------------------------------------
// Cross-Tab Real-time Broadcast Channel
// -------------------------------------------------------------
const CHANNEL_NAME = "genius_notifications_channel";

// ══════════════════════════════════════════════════════════════
// SECTION 3 · CROSS-TAB BROADCAST (BroadcastChannel)
// ══════════════════════════════════════════════════════════════
export function broadcastNotification(payload: any) {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return;
  try {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage({ type: "NEW_NOTIFICATION", payload, timestamp: Date.now() });
    channel.close();
  } catch {}
}

export function subscribeToNotificationBroadcast(onNotification: (payload: any) => void): () => void {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
    return () => {};
  }

  try {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = (event) => {
      if (event.data?.type === "NEW_NOTIFICATION" && event.data?.payload) {
        onNotification(event.data.payload);
      }
    };

    return () => {
      channel.close();
    };
  } catch {
    return () => {};
  }
}
