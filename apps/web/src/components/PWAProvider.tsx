"use client";

/**
 * [WEB • COMPONENT] PWA Runtime
 *
 * Registers service workers, install prompt/toast, foreground FCM ->
 * native notification popups and push permission flows.
 */
import { useEffect, useState } from "react";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { Download, X, Share } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  initGlobalActivityTracker,
  checkInactivityExpiry,
  clearInactivityTracking,
  recordUserActivity,
  getSavedUserRole
} from "@/lib/authInactivity";
import { BRAND_CONFIG, isMasterAdminEmail } from "@/lib/config";
import {
  initAnalytics,
  setAppBadgeCount,
  requestFCMToken,
  syncFCMTokenWithUser,
  onForegroundMessage
} from "@/lib/firebase";
import { triggerNativeNotification } from "@/lib/pushNotify";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PWAProvider() {
  const router = useRouter();
  const pathname = usePathname();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSTip, setShowIOSTip] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // 0. Initialize Firebase Analytics & Clear App Icon Badge on Open
    initAnalytics().catch(() => {});
    setAppBadgeCount(0);

    // 0.1 Record active application touch
    recordUserActivity();

    // 1. Register Service Workers (Standard Offline SW + Firebase Messaging SW)
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          // Check for SW updates
          reg.addEventListener("updatefound", () => {
            const installingWorker = reg.installing;
            if (installingWorker) {
              installingWorker.onstatechange = () => {
                if (installingWorker.state === "installed" && navigator.serviceWorker.controller) {
                  console.log("[PWA] New version available");
                }
              };
            }
          });
        })
        .catch((err) => {
          console.warn("[PWA] Service Worker registration failed:", err);
        });

      // Register Firebase Messaging Background Service Worker
      navigator.serviceWorker
        .register("/firebase-messaging-sw.js")
        .then(() => {
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            requestFCMToken().then((token) => {
              if (token) syncFCMTokenWithUser(token);
            }).catch(() => {});
          }
        })
        .catch((err) => {
          console.warn("[FCM SW] Service Worker registration failed:", err);
        });
    }

    // 1.5 Listen for Foreground FCM Push Messages
    let unsubscribeFCM: (() => void) | null = null;
    onForegroundMessage((payload) => {
      console.log("[PWAProvider] Received foreground notification:", payload);
      const title = payload.notification?.title || payload.data?.title || BRAND_CONFIG.notifications.fallbackTitle;
      const body = payload.notification?.body || payload.data?.body || BRAND_CONFIG.notifications.fallbackBody;
      const url = payload.data?.url || "/";
      const tag = payload.data?.tag || `genius-fg-${Date.now()}`;

      triggerNativeNotification({
        title,
        body,
        url,
        tag,
      });
    }).then((unsub) => {
      if (unsub) unsubscribeFCM = unsub;
    });

    // 2. Detect if already installed / running in standalone mode
    const checkStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsStandalone(checkStandalone);

    // 2.5 Auto-direct to student/admin dashboard when PWA is opened in standalone mode from home screen
    if (checkStandalone && (pathname === "/" || pathname === "")) {
      (async () => {
        try {
          const supabase = createClient();
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user) {
            const { isExpired } = checkInactivityExpiry();
            if (!isExpired) {
              recordUserActivity(true);
              const savedRole = getSavedUserRole() || session.user.user_metadata?.role;
              const isAdmin = isMasterAdminEmail(session.user.email) || savedRole === "admin";
              if (isAdmin) {
                router.replace("/admin/");
              } else if (savedRole === "staff") {
                router.replace("/staff/");
              } else {
                router.replace("/student/");
              }
            }
          }
        } catch {}
      })();
    }

    if (checkStandalone) {
      return () => {
        if (unsubscribeFCM) unsubscribeFCM();
      };
    }

    // Check if user dismissed recently
    const dismissedUntil = localStorage.getItem("genius_pwa_dismissed");
    if (dismissedUntil && Number(dismissedUntil) > Date.now()) {
      return () => {
        if (unsubscribeFCM) unsubscribeFCM();
      };
    }

    // 3. Android / Chrome / Edge install prompt listener
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowInstallPrompt(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);

    // 4. Detect iOS Safari
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    const isSafari = /safari/.test(userAgent) && !/chrome|crios|fxios/.test(userAgent);

    let iosTimer: NodeJS.Timeout | null = null;
    if (isIosDevice && isSafari && !checkStandalone) {
      setIsIOS(true);
      // Delay showing tip to not overwhelm user on first second
      iosTimer = setTimeout(() => setShowInstallPrompt(true), 3000);
    }

    return () => {
      if (iosTimer) clearTimeout(iosTimer);
      if (unsubscribeFCM) unsubscribeFCM();
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
    };
  }, [pathname, router]);

  const handleInstallClick = async () => {
    if (isIOS) {
      setShowIOSTip(true);
      return;
    }

    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted") {
      setShowInstallPrompt(false);
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    setShowInstallPrompt(false);
    setShowIOSTip(false);
    // Dismiss for 7 days
    localStorage.setItem("genius_pwa_dismissed", String(Date.now() + 7 * 24 * 60 * 60 * 1000));
  };

  if (isStandalone || !showInstallPrompt) {
    return null;
  }

  return (
    <aside
      aria-label="Install App"
      className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-md animate-in fade-in slide-in-from-bottom-5 duration-300"
    >
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#FFC107]/40 bg-[#0A2E5C] p-3.5 text-white shadow-2xl backdrop-blur-xl ring-1 ring-black/20">
        <div className="flex items-center gap-3">
          <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-[#FFC107]/50 bg-white/5 shadow-md p-1">
            <Image
              src="/icon-192.png"
              alt={`${BRAND_CONFIG.fullName} Logo`}
              width={48}
              height={48}
              className="object-contain h-full w-full"
            />
          </div>
          <div>
            <h4 className="text-xs sm:text-sm font-bold text-white tracking-tight">
              {BRAND_CONFIG.shortName}
            </h4>
            <p className="text-[11px] text-[#E5E7EB] font-medium">
              Install app for fast 1-tap mobile access
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={handleInstallClick}
            type="button"
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#FFC107] hover:bg-[#E5E7EB] text-[#0A2E5C] px-3 py-2 text-xs font-black shadow-sm transition-all active:scale-95"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Install</span>
          </button>
          <button
            onClick={handleDismiss}
            type="button"
            className="rounded-xl p-2 text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
            title="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* iOS Instructions modal/tooltip */}
      {showIOSTip && (
        <div className="mt-2 rounded-2xl border border-[#FFC107]/40 bg-[#0A2E5C] p-4 text-white shadow-xl text-xs space-y-2 animate-in fade-in">
          <div className="flex items-center justify-between font-bold text-[#FFC107]">
            <span>Install on iOS (iPhone / iPad):</span>
            <button onClick={() => setShowIOSTip(false)} className="text-zinc-400 hover:text-white">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <ol className="list-decimal pl-4 space-y-1 text-zinc-300">
            <li className="flex items-center gap-1.5">
              <span>1. Tap the Safari Share button</span>
              <Share className="h-3.5 w-3.5 text-[#FFC107] inline" />
            </li>
            <li>2. Scroll down and tap <strong>&quot;Add to Home Screen&quot;</strong> (होम स्क्रीन में जोड़ें)</li>
            <li>3. Tap <strong>Add</strong> in the top right corner</li>
          </ol>
        </div>
      )}
    </aside>
  );
}
