"use client";

/**
 * [WEB • COMPONENT] Biometric App Lock Overlay
 *
 * Provides a WhatsApp/Banking-style screen lock overlay for Admin and Student panels.
 * Triggers automatically when PWA is reopened, resumed from background, or switched back to.
 * Unlocks instantly with 1-touch Fingerprint / Face ID scan.
 */

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Fingerprint, Lock, LogOut, ShieldCheck } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import {
  isWebAuthnSupported,
  hasRegisteredPasskey,
  getBiometricProfile,
  verifyBiometricOnly,
  type BiometricProfile,
} from "@/lib/webauthn";
import { createClient } from "@/lib/supabase/client";
import { clearInactivityTracking } from "@/lib/authInactivity";

interface BiometricAppLockProps {
  userName?: string;
  userRole?: string;
}

export function BiometricAppLock({ userName, userRole }: BiometricAppLockProps) {
  const router = useRouter();
  const [isLocked, setIsLocked] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [profile, setProfile] = useState<BiometricProfile | null>(null);
  const lastHiddenTimeRef = useRef<number | null>(null);
  const isPromptingRef = useRef(false);

  // Check if App Lock is enabled on this device
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isWebAuthnSupported() && hasRegisteredPasskey()) {
      setProfile(getBiometricProfile());

      // If user opened app / tab afresh, check session storage lock state
      const wasUnlocked = sessionStorage.getItem("genius_app_unlocked");
      if (!wasUnlocked) {
        setIsLocked(true);
      }
    }
  }, []);

  // Unlock handler
  const handleUnlock = async () => {
    if (isVerifying || isPromptingRef.current) return;
    setIsVerifying(true);
    isPromptingRef.current = true;
    setErrorMsg("");

    try {
      const res = await verifyBiometricOnly();
      if (res.success) {
        if (typeof sessionStorage !== "undefined") {
          sessionStorage.setItem("genius_app_unlocked", "true");
        }
        setIsLocked(false);
        setErrorMsg("");
      } else {
        if (res.error && !res.error.toLowerCase().includes("cancelled") && !res.error.toLowerCase().includes("declined")) {
          setErrorMsg(res.error);
        }
      }
    } catch (err: any) {
      setErrorMsg(err?.message || "Biometric verification failed.");
    } finally {
      setIsVerifying(false);
      isPromptingRef.current = false;
    }
  };

  // Listen to App Minimize / Background / Resume
  useEffect(() => {
    if (typeof document === "undefined") return;

    const handleVisibilityChange = () => {
      if (!isWebAuthnSupported() || !hasRegisteredPasskey()) return;

      if (document.visibilityState === "hidden") {
        lastHiddenTimeRef.current = Date.now();
      } else if (document.visibilityState === "visible") {
        // App resumed to foreground
        if (lastHiddenTimeRef.current) {
          const awayDuration = Date.now() - lastHiddenTimeRef.current;
          // If away for more than 1 second, lock screen
          if (awayDuration > 1000) {
            if (typeof sessionStorage !== "undefined") {
              sessionStorage.removeItem("genius_app_unlocked");
            }
            setIsLocked(true);
          }
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  // Auto-trigger biometric identifier when lock appears
  useEffect(() => {
    if (isLocked && !isPromptingRef.current) {
      const timer = setTimeout(() => {
        handleUnlock();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isLocked]);

  const handleLogoutFromLock = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    clearInactivityTracking();
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.removeItem("genius_app_unlocked");
    }
    router.push("/login/");
  };

  if (!isLocked) return null;

  return (
    <div className="fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-[#0A2E5C] text-white p-6 animate-fadeIn select-none">
      {/* Decorative Gold Radial Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[400px] bg-[#FFC107]/15 blur-[120px] rounded-full pointer-events-none" />

      <div className="w-full max-w-sm flex flex-col items-center text-center relative z-10">
        <BrandLogo variant="navbar" size="lg" darkBackground />

        {/* Biometric Shield Icon Badge */}
        <div className="mt-8 relative">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-[#0B5ED7] via-[#0A2E5C] to-[#141A24] border border-[#FFC107]/40 shadow-2xl shadow-[#0A2E5C]/80">
            <Fingerprint className={`h-10 w-10 text-[#FFC107] ${isVerifying ? "animate-pulse" : ""}`} />
          </div>
          <div className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-[#FFC107] text-[#0A2E5C] shadow-md border-2 border-[#0A2E5C]">
            <Lock className="h-3.5 w-3.5" />
          </div>
        </div>

        <h2 className="mt-5 text-xl font-black text-white tracking-tight">Genius Library is Locked</h2>
        <p className="mt-1 text-xs text-zinc-300">
          Touch fingerprint sensor or scan Face ID to unlock {userName ? `for ${userName}` : "your panel"}.
        </p>

        {errorMsg && (
          <p className="mt-3 text-xs text-rose-300 bg-rose-950/50 border border-rose-800/80 rounded-xl px-3 py-1.5 leading-snug">
            {errorMsg}
          </p>
        )}

        {/* Unlock Button */}
        <button
          type="button"
          onClick={handleUnlock}
          disabled={isVerifying}
          className="mt-6 w-full flex items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-[#FFC107] to-[#FFA000] py-3.5 px-6 text-xs font-black text-[#0A2E5C] shadow-lg shadow-[#FFC107]/20 hover:scale-[1.02] active:scale-95 transition-all cursor-pointer"
        >
          <Fingerprint className={`h-4 w-4 ${isVerifying ? "animate-spin" : ""}`} />
          <span>{isVerifying ? "Waiting for Sensor..." : `Unlock with ${profile?.deviceName || "Biometric"}`}</span>
        </button>

        {/* Logout Option */}
        <button
          type="button"
          onClick={handleLogoutFromLock}
          className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-zinc-400 hover:text-rose-400 transition cursor-pointer"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span>Sign Out / Switch Account</span>
        </button>
      </div>
    </div>
  );
}
