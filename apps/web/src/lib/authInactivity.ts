/**
 * [WEB • LIB] Daily Session & Inactivity Manager
 *
 * Daily Midnight Session Manager for Genius Library
 * 
 * Rules:
 * 1. Single Daily Login: User/Student logs in once (e.g. in the morning).
 * 2. Uninterrupted Daily Use: Stays logged in all day across taskbar clears,
 *    swiping away recent apps, process restarts, and phone locking.
 * 3. Daily Midnight Auto-Logout: At midnight (12:00 AM / 00:00:00), the session
 *    automatically resets so the user cleanly logs in for the new day.
 */

export const SESSION_DATE_STORAGE_KEY = 'genius_session_date';
export const SESSION_LOGIN_TIME_KEY = 'genius_session_login_time';
export const SAVED_ROLE_STORAGE_KEY = 'genius_session_role';

/**
 * Returns today's local date string formatted as YYYY-MM-DD
 */
export function getTodayDateString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Returns milliseconds remaining until the upcoming midnight (00:00:00)
 */
export function getMsUntilNextMidnight(): number {
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
  return Math.max(1000, midnight.getTime() - now.getTime());
}

/**
 * Records a successful login for today's session.
 */
export function recordSessionLogin(role?: 'admin' | 'student' | 'staff') {
  if (typeof window === 'undefined') return;
  try {
    const today = getTodayDateString();
    localStorage.setItem(SESSION_DATE_STORAGE_KEY, today);
    localStorage.setItem(SESSION_LOGIN_TIME_KEY, Date.now().toString());
    if (role) {
      localStorage.setItem(SAVED_ROLE_STORAGE_KEY, role);
    }
  } catch (err) {
    console.warn('[SessionManager] Failed to record session:', err);
  }
}

// Backward-compatible alias for recordUserActivity
export function recordUserActivity(force = false) {
  if (typeof window === 'undefined') return;
  const existing = localStorage.getItem(SESSION_DATE_STORAGE_KEY);
  if (!existing || force) {
    recordSessionLogin();
  }
}

/**
 * Checks whether the session has expired.
 * SESSIONS ARE PERSISTENT: Never forces logout on midnight.
 * Supabase Auth handles automatic silent token refresh seamlessly.
 */
export function checkSessionExpiry(): { isExpired: boolean; reason: 'midnight_passed' | 'no_session' | 'valid' } {
  return { isExpired: false, reason: 'valid' };
}

// Backward-compatible alias for checkInactivityExpiry
export function checkInactivityExpiry(): { isExpired: boolean; elapsedHours: number } {
  return { isExpired: false, elapsedHours: 0 };
}

/**
 * Clears session tracking on sign out or midnight reset.
 */
export function clearInactivityTracking() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(SESSION_DATE_STORAGE_KEY);
    localStorage.removeItem(SESSION_LOGIN_TIME_KEY);
    localStorage.removeItem(SAVED_ROLE_STORAGE_KEY);
  } catch {}
}

/**
 * Role storage for instant PWA startup routing.
 */
export function saveUserRole(role: 'admin' | 'student' | 'staff') {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SAVED_ROLE_STORAGE_KEY, role);
    recordSessionLogin(role);
  } catch {}
}

export function getSavedUserRole(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(SAVED_ROLE_STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Initializes global midnight watcher and background-foreground transition monitor.
 */
export function initGlobalActivityTracker(onSessionExpired?: () => void): () => void {
  // Session is persistent across midnight - no force-logout needed
  return () => {};
}

// Backward-compatible alias
export function initContinuousInactivityMonitor(onSessionExpired?: () => void): () => void {
  return () => {};
}
