/**
 * [WEB • LIB] Firebase Connection + Push (FCM)
 *
 * Initializes Firebase web SDK (Analytics + Cloud Messaging) from BRAND_CONFIG.
 * Registers device FCM tokens, syncs them to Supabase + Worker, handles
 * foreground messages and PWA badge count.
 */

import { initializeApp, getApps, getApp } from "firebase/app";
import { getAnalytics, isSupported as isAnalyticsSupported } from "firebase/analytics";
import { getMessaging, isSupported as isMessagingSupported, getToken, onMessage, Messaging } from "firebase/messaging";
import { BRAND_CONFIG, isMasterAdminEmail } from "@/lib/config";

export const firebaseConfig = BRAND_CONFIG.firebase;

// ══════════════════════════════════════════════════════════════
// SECTION 1 · FIREBASE CONNECTION (APP INIT)
// Credentials come from BRAND_CONFIG (white-label.config.ts / env).
// ══════════════════════════════════════════════════════════════
// Safe Singleton Firebase App Initialization
export const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Safe Analytics Initialization
export const initAnalytics = async () => {
  if (typeof window !== "undefined" && (await isAnalyticsSupported())) {
    return getAnalytics(app);
  }
  return null;
};

// Safe Firebase Cloud Messaging (FCM) Initialization
let messagingInstance: Messaging | null = null;

export const getFirebaseMessaging = async (): Promise<Messaging | null> => {
  if (typeof window === "undefined") return null;
  if (messagingInstance) return messagingInstance;

  try {
    const supported = await isMessagingSupported();
    if (supported) {
      messagingInstance = getMessaging(app);
      return messagingInstance;
    }
  } catch (err) {
    console.warn("[FCM] Messaging not supported or blocked in this environment:", err);
  }
  return null;
};

// ══════════════════════════════════════════════════════════════
// SECTION 2 · FCM DEVICE TOKEN REGISTRATION
// Asks notification permission, gets the FCM token for this device.
// ══════════════════════════════════════════════════════════════
export const DEFAULT_VAPID_KEY = BRAND_CONFIG.firebase.vapidPublicKey;

/**
 * Request Notification Permission and Retrieve FCM Device Registration Token.
 * Can be sent to your backend / Supabase to target this specific parent or student.
 */
export async function requestFCMToken(vapidKey?: string): Promise<string | null> {
  if (typeof window === "undefined") return null;

  try {
    if (!("Notification" in window)) {
      console.warn("[FCM] This browser does not support desktop notifications.");
      return null;
    }

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      console.warn("[FCM] Notification permission was denied or dismissed.");
      return null;
    }

    const messaging = await getFirebaseMessaging();
    if (!messaging) return null;

    // Wait for the Service Worker registration to be ready
    let swReg: ServiceWorkerRegistration | undefined;
    if ("serviceWorker" in navigator) {
      swReg = await navigator.serviceWorker.ready;
    }

    const activeVapidKey = vapidKey || DEFAULT_VAPID_KEY;

    const token = await getToken(messaging, {
      vapidKey: activeVapidKey,
      serviceWorkerRegistration: swReg,
    });

    if (token) {
      localStorage.setItem("genius_fcm_token", token);
      console.log("[FCM] Device Token Registered:", token);
      syncFCMTokenWithUser(token).catch(() => {});
      return token;
    }
  } catch (error) {
    console.warn("[FCM] Error obtaining device token:", error);
  }

  return null;
}

/**
 * Automatically syncs the FCM device token with Supabase and Cloudflare API
 */
// ══════════════════════════════════════════════════════════════
// SECTION 3 · TOKEN SYNC (SUPABASE + WORKER)
// Saves the token to profiles.fcm_token and registers it with the
// Cloudflare Worker so pushes can target this device.
// ══════════════════════════════════════════════════════════════
export async function syncFCMTokenWithUser(token?: string, explicitRole?: string) {
  if (typeof window === "undefined") return;
  try {
    const fcmToken = token || localStorage.getItem("genius_fcm_token");
    if (!fcmToken) return;

    let role = explicitRole || localStorage.getItem("genius_user_role") || "student";
    let userId: string | undefined;
    let email: string | undefined;
    let name: string | undefined;

    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        userId = session.user.id;
        email = session.user.email?.toLowerCase();
        name = session.user.user_metadata?.full_name || session.user.user_metadata?.name;
        const metaRole = session.user.user_metadata?.role;
        if (isMasterAdminEmail(email) || metaRole === "admin") {
          role = "admin";
        } else if (metaRole === "staff") {
          role = "staff";
        }

        // 1. Sync to Supabase profiles table
        await supabase
          .from("profiles")
          .update({ fcm_token: fcmToken })
          .eq("id", session.user.id);
      }
    } catch {}

    // 2. Register token with Cloudflare API
    const API_BASE = BRAND_CONFIG.apiUrl;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const { data: { session } } = await createClient().auth.getSession();
      if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;
    } catch {}
    await fetch(`${API_BASE}/api/fcm/register`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        token: fcmToken,
        role: role === "admin" || role === "staff" ? role : "student",
        userId,
        email,
        name,
        deviceInfo: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
      }),
    }).catch(() => {});

    console.log(`[FCM] Token synchronized for role: ${role}`);
  } catch (err) {
    console.warn("[FCM] syncFCMTokenWithUser warning:", err);
  }
}


/**
 * Listen for foreground FCM messages while the user is actively inside the app
 */
// ══════════════════════════════════════════════════════════════
// SECTION 4 · FOREGROUND MESSAGES + APP BADGE
// ══════════════════════════════════════════════════════════════
export async function onForegroundMessage(callback: (payload: any) => void): Promise<(() => void) | null> {
  const messaging = await getFirebaseMessaging();
  if (!messaging) return null;

  return onMessage(messaging, (payload) => {
    console.log("[FCM Foreground Message Received]:", payload);
    callback(payload);
  });
}

/**
 * Updates or clears the PWA App Icon Badge count
 */
export async function setAppBadgeCount(count?: number) {
  if (typeof navigator !== "undefined" && "setAppBadge" in navigator) {
    try {
      if (typeof count === "number" && count > 0) {
        await (navigator as any).setAppBadge(count);
      } else {
        await (navigator as any).clearAppBadge();
      }
    } catch (e) {
      console.warn("[PWA Badge] Could not update app badge:", e);
    }
  }
}
