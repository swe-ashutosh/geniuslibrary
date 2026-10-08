/**
 * [WEB • LIB] Login Security & Rate Limiting
 */

// =========================================================================
// Genius Library — Security, Rate Limiting & Account Lockout
// =========================================================================

const LOCK_KEY_PREFIX = "library_sec_lock_";
const SIGNUP_THROTTLE_KEY = "library_sec_signup_throttle";

export interface LoginSecurityStatus {
  isLocked: boolean;
  attempts: number;
  remainingAttempts: number;
}

/**
 * Check if an email is currently locked due to 5 consecutive failed login attempts.
 */
export function getLoginSecurityStatus(email: string): LoginSecurityStatus {
  if (typeof window === "undefined" || !email) {
    return { isLocked: false, attempts: 0, remainingAttempts: 5 };
  }

  const cleanEmail = email.trim().toLowerCase();
  try {
    const raw = localStorage.getItem(LOCK_KEY_PREFIX + encodeEmailKey(cleanEmail));
    if (!raw) {
      return { isLocked: false, attempts: 0, remainingAttempts: 5 };
    }

    const data = JSON.parse(raw);
    const attempts = Number(data.attempts) || 0;
    const isLocked = Boolean(data.locked) || attempts >= 5;

    return {
      isLocked,
      attempts,
      remainingAttempts: Math.max(0, 5 - attempts),
    };
  } catch {
    return { isLocked: false, attempts: 0, remainingAttempts: 5 };
  }
}

/**
 * Record a failed login attempt for the given email.
 * If attempts reach 5, locks the account until password is reset.
 */
export function recordFailedLoginAttempt(email: string): LoginSecurityStatus {
  if (typeof window === "undefined" || !email) {
    return { isLocked: false, attempts: 1, remainingAttempts: 4 };
  }

  const cleanEmail = email.trim().toLowerCase();
  const current = getLoginSecurityStatus(cleanEmail);
  const newAttempts = current.attempts + 1;
  const isLocked = newAttempts >= 5;

  const data = {
    attempts: newAttempts,
    locked: isLocked,
    lockedAt: isLocked ? Date.now() : undefined,
  };

  try {
    localStorage.setItem(LOCK_KEY_PREFIX + encodeEmailKey(cleanEmail), JSON.stringify(data));
  } catch {}

  return {
    isLocked,
    attempts: newAttempts,
    remainingAttempts: Math.max(0, 5 - newAttempts),
  };
}

/**
 * Clear failed attempts after successful login.
 */
export function resetLoginAttempts(email: string) {
  if (typeof window === "undefined" || !email) return;
  const cleanEmail = email.trim().toLowerCase();
  try {
    localStorage.removeItem(LOCK_KEY_PREFIX + encodeEmailKey(cleanEmail));
  } catch {}
}

/**
 * Unlock account after successful password reset via Supabase.
 */
export function unlockAccountAfterPasswordReset(email?: string) {
  if (typeof window === "undefined") return;
  try {
    if (email) {
      resetLoginAttempts(email);
    } else {
      // If email not directly provided, clear any locked keys in localStorage
      const keys = Object.keys(localStorage);
      for (const k of keys) {
        if (k.startsWith(LOCK_KEY_PREFIX)) {
          localStorage.removeItem(k);
        }
      }
    }
  } catch {}
}

/**
 * Check signup rate limiting (Max 3 registrations per 15 minutes per device/browser).
 */
export function checkSignupRateLimit(): { allowed: boolean; waitSeconds?: number } {
  if (typeof window === "undefined") return { allowed: true };
  try {
    const raw = localStorage.getItem(SIGNUP_THROTTLE_KEY);
    if (!raw) return { allowed: true };

    const data = JSON.parse(raw);
    const now = Date.now();
    const windowMs = 15 * 60 * 1000;
    const recent = (data.timestamps || []).filter((t: number) => now - t < windowMs);

    if (recent.length >= 3) {
      const oldest = recent[0];
      const waitSeconds = Math.ceil((oldest + windowMs - now) / 1000);
      return { allowed: false, waitSeconds: Math.max(1, waitSeconds) };
    }

    return { allowed: true };
  } catch {
    return { allowed: true };
  }
}

/**
 * Record a signup attempt for rate limiting.
 */
export function recordSignupAttempt() {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(SIGNUP_THROTTLE_KEY);
    const now = Date.now();
    const windowMs = 15 * 60 * 1000;
    let timestamps: number[] = [];

    if (raw) {
      const data = JSON.parse(raw);
      timestamps = (data.timestamps || []).filter((t: number) => now - t < windowMs);
    }

    timestamps.push(now);
    localStorage.setItem(SIGNUP_THROTTLE_KEY, JSON.stringify({ timestamps }));
  } catch {}
}

// Simple base64 encoder safe for unicode
function encodeEmailKey(str: string): string {
  try {
    return btoa(unescape(encodeURIComponent(str)));
  } catch {
    return str.replace(/[^a-zA-Z0-9]/g, "_");
  }
}
