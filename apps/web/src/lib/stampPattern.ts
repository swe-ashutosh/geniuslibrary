/**
 * [WEB • LIB] Physical Stamp Verification (Anti-Proxy)
 *
 * Capacitive 3-Point Touch Stamp Geometry & Pattern Verification
 * Stores pattern in Supabase (Sole Database Mandate) with offline localStorage cache.
 */

import { createClient } from '@/lib/supabase/client';
import { BRAND_CONFIG } from '@/lib/config';

export interface StampTouchPoint {
  x: number;
  y: number;
}

export interface StampGeometry {
  sideLengths: [number, number, number]; // sorted [d_min, d_mid, d_max] in pixels
  ratios: [number, number];              // [d_mid / d_min, d_max / d_min]
  perimeter: number;                     // sum of 3 sides
  points?: StampTouchPoint[];
}

export interface StampPattern {
  id: string;
  name: string;
  ratios: [number, number];              // [r1, r2] (scale & rotation invariant)
  nominalPerimeter?: number;             // approximate reference perimeter
  tolerance: number;                     // e.g. 0.20 (20% ratio tolerance)
  updatedAt: string;
  updatedBy: string;
}

export interface PatternMatchResult {
  isMatch: boolean;
  score: number;                         // 0 to 100
  reason?: string;
  measured?: StampGeometry;
}

const STAMP_STORAGE_KEY = 'genius_registered_stamp_pattern_v1';
const SUPABASE_SYSTEM_ID = 'SYSTEM_STAMP_CONFIG';

/**
 * Extracts 3-point triangle geometry from touch coordinates.
 * Scale-invariant and rotation-invariant via Euclidean side length ratios.
 */
export function extractStampGeometry(
  points: Array<{ clientX?: number; clientY?: number; x?: number; y?: number }>
): StampGeometry | null {
  if (!points || points.length < 3) return null;

  const p1 = { x: points[0].clientX ?? points[0].x ?? 0, y: points[0].clientY ?? points[0].y ?? 0 };
  const p2 = { x: points[1].clientX ?? points[1].x ?? 0, y: points[1].clientY ?? points[1].y ?? 0 };
  const p3 = { x: points[2].clientX ?? points[2].x ?? 0, y: points[2].clientY ?? points[2].y ?? 0 };

  const d12 = Math.hypot(p1.x - p2.x, p1.y - p2.y);
  const d23 = Math.hypot(p2.x - p3.x, p2.y - p3.y);
  const d31 = Math.hypot(p3.x - p1.x, p3.y - p1.y);

  // Must have distinct physical contact nodes (minimum 12px distance)
  if (d12 < 12 || d23 < 12 || d31 < 12) {
    return null;
  }

  const sortedLengths = [d12, d23, d31].sort((a, b) => a - b) as [number, number, number];
  const [dMin, dMid, dMax] = sortedLengths;

  // Compute side ratios (scale invariant: independent of screen DPI or window zoom)
  const r1 = +(dMid / dMin).toFixed(3);
  const r2 = +(dMax / dMin).toFixed(3);
  const perimeter = Math.round(d12 + d23 + d31);

  return {
    sideLengths: sortedLengths,
    ratios: [r1, r2],
    perimeter,
    points: [p1, p2, p3],
  };
}

/**
 * Matches a detected 3-point touch stamp against the Admin registered pattern.
 * If no custom pattern is registered, any valid 3-point conductive stamp is accepted.
 */
export function matchStampPattern(
  points: Array<{ clientX?: number; clientY?: number; x?: number; y?: number }>,
  target?: StampPattern | null
): PatternMatchResult {
  const measured = extractStampGeometry(points);
  if (!measured) {
    return {
      isMatch: false,
      score: 0,
      reason: 'Please press all 3 contact points of the physical stamp onto the screen.',
    };
  }

  // If Admin has not configured a custom pattern yet, accept any physical 3-point stamp
  if (!target || !target.ratios || target.ratios.length < 2) {
    return {
      isMatch: true,
      score: 100,
      measured,
    };
  }

  const [targetR1, targetR2] = target.ratios;
  const [measR1, measR2] = measured.ratios;
  const tolerance = target.tolerance ?? 0.22; // default 22% tolerance for physical tilt

  const diff1 = Math.abs(measR1 - targetR1) / targetR1;
  const diff2 = Math.abs(measR2 - targetR2) / targetR2;

  const avgDiff = (diff1 + diff2) / 2;
  const score = Math.max(0, Math.min(100, Math.round((1 - avgDiff) * 100)));

  const isMatch = diff1 <= tolerance && diff2 <= tolerance;

  return {
    isMatch,
    score,
    reason: isMatch
      ? undefined
      : `Stamp pattern mismatch (${score}% match). Please use the authorized ${BRAND_CONFIG.shortName} physical stamp.`,
    measured,
  };
}

/**
 * Loads the current registered stamp pattern from Supabase (sole database) with localStorage fallback.
 */
export async function getRegisteredStampPattern(): Promise<StampPattern | null> {
  // 1. Supabase Database
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('student_id', SUPABASE_SYSTEM_ID)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data && data.message) {
      const parsed = typeof data.message === 'string' ? JSON.parse(data.message) : data.message;
      if (parsed && Array.isArray(parsed.ratios)) {
        if (typeof window !== 'undefined') {
          localStorage.setItem(STAMP_STORAGE_KEY, JSON.stringify(parsed));
        }
        return parsed as StampPattern;
      }
    }
  } catch (err) {
    console.warn('Could not fetch stamp pattern from Supabase, checking local cache:', err);
  }

  // 2. Local Cache fallback
  if (typeof window !== 'undefined') {
    try {
      const cached = localStorage.getItem(STAMP_STORAGE_KEY);
      if (cached) {
        return JSON.parse(cached) as StampPattern;
      }
    } catch {}
  }

  return null;
}

/**
 * Saves a calibrated stamp pattern into Supabase and updates local cache.
 */
export async function saveRegisteredStampPattern(pattern: StampPattern): Promise<{ success: boolean; error?: string }> {
  // Update local cache immediately
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STAMP_STORAGE_KEY, JSON.stringify(pattern));
      window.dispatchEvent(new CustomEvent('stamp_pattern_updated', { detail: pattern }));
    } catch {}
  }

  // Upsert to Supabase
  try {
    const supabase = createClient();
    const { error } = await supabase.from('messages').upsert({
      id: `stamp-config-${pattern.id || 'master'}`,
      student_id: SUPABASE_SYSTEM_ID,
      student_name: `${BRAND_CONFIG.name} Stamp Config`,
      student_email: BRAND_CONFIG.adminEmail || BRAND_CONFIG.email,
      sender_role: 'admin',
      sender_name: 'Library Admin',
      message: JSON.stringify(pattern),
      recipient_role: 'all',
      is_read: true,
      created_at: new Date().toISOString(),
    });

    if (error) {
      console.warn('Supabase stamp pattern save notice:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    console.warn('Error saving stamp pattern to Supabase:', err);
    return { success: true }; // Local cache is active
  }
}

/**
 * Resets / Clears the custom stamp pattern (reverts to accepting any 3-point conductive stamp).
 */
export async function clearRegisteredStampPattern(): Promise<void> {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(STAMP_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent('stamp_pattern_updated', { detail: null }));
  }

  try {
    const supabase = createClient();
    await supabase.from('messages').delete().eq('student_id', SUPABASE_SYSTEM_ID);
  } catch {}
}
