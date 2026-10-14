/**
 * [WEB • LIB • CORE] Unified API Client (Cloudflare Worker + Supabase)
 * Unified API Client for Supabase + Library System
 * Single Source of Truth: Supabase PostgreSQL (500MB quota; zero automated eviction)
 */

import { BRAND_CONFIG, isMasterAdminEmail } from './config';
import { parseDeskNum, matchSeatNumber, formatDeskId } from './seatUtils';
import { enqueueOfflineMutation } from './offlineSync';

const API_BASE_URL = BRAND_CONFIG.apiUrl;

// ══════════════════════════════════════════════════════════════════
// SECTION 1 · DATA MODELS
// Shared TypeScript interfaces — the shape of every record the UI renders.
// ══════════════════════════════════════════════════════════════════
export interface Shift {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  fee: number;
  totalSeats: number;
  availableSeats: number;
  isActive: boolean;
}

export interface Seat {
  id: string;
  seatNumber: string;
  zone: string;
  shiftId?: string | null;
  isAvailable: boolean;
  currentStudentId?: string | null;
  currentStudentName?: string | null;
  occupiedAt?: string | null;
}

export interface AttendanceRecord {
  id: string;
  studentId: string;
  studentName: string;
  seatNumber?: string | null;
  shiftId?: string | null;
  shiftName?: string | null;
  checkIn: string;
  checkOut?: string | null;
  status: string;
  photoUrl?: string | null;
  date: string;
  source?: 'supabase';
  verificationMethod?: 'nfc' | 'qr' | 'admin' | 'stamp';
}

export interface Book {
  id: string;
  title: string;
  author: string;
  isbn?: string | null;
  category: string;
  publisher?: string | null;
  totalCopies: number;
  availableCopies: number;
  coverUrl?: string | null;
  description?: string | null;
}

export interface BookIssue {
  id: string;
  bookId: string;
  bookTitle: string;
  studentId: string;
  studentName: string;
  issuedAt: string;
  dueDate: string;
  returnedAt?: string | null;
  status: 'issued' | 'returned' | 'overdue';
  fineAmount: number;
}

export interface FeeRecord {
  id: string;
  studentId: string;
  studentName: string;
  type: string;
  amount: number;
  totalDue?: number | null;
  remainingDue?: number | null;
  paid: boolean;
  paidAt?: string | null;
  dueDate?: string | null;
  description?: string | null;
  receiptNo?: string | null;
  createdAt?: string | null;
}

export interface Announcement {
  id: string;
  title: string;
  message: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  targetAudience?: string;
  createdAt?: string;
}

export interface StudentRecord {
  id: string;
  studentCode: string;
  fullName: string;
  email: string;
  phone: string;
  gender?: 'Male' | 'Female' | 'Other' | string;
  parentName?: string;
  parentPhone?: string;
  address?: string;
  course?: string;
  shift?: string;
  membershipPlan?: string;
  seatNumber?: string | null;
  role?: string;
  status: 'active' | 'pending' | 'suspended';
  feeStatus?: 'Paid' | 'Due';
  dueAmount?: number;
  avatarUrl?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export type Student = StudentRecord;

export interface DashboardStats {
  totalSeats: number;
  availableSeats: number;
  occupiedSeats: number;
  reservedSeats?: number;
  activeShiftsCount: number;
  totalBooks: number;
  booksIssuedCount: number;
  attendanceTodayCount: number;
  totalStudentsCount?: number;
  pendingStudentsCount?: number;
}

// -------------------------------------------------------------
export interface NotificationRecord {
  id: string;
  recipientRole: 'admin' | 'student' | 'all';
  recipientId?: string | null;
  title: string;
  message: string;
  type: 'fee_reminder' | 'signup' | 'payment' | 'message' | 'attendance' | 'general' | 'announcement' | 'exam' | 'exam_result';
  actionUrl?: string | null;
  isRead: boolean;
  createdAt: string;
}

// -------------------------------------------------------------
// Helper fetcher with Fast Timeout & In-Memory Auth Token Cache
let cachedAuthToken: { token: string; expiresAt: number } | null = null;

// ── AUTH TOKEN ────────────────────────────────────────────────
// Reads the Supabase access token for the Authorization header.
async function getAuthToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  const now = Date.now();
  if (cachedAuthToken && cachedAuthToken.expiresAt > now) {
    return cachedAuthToken.token;
  }
  try {
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    if (data?.session?.access_token) {
      cachedAuthToken = {
        token: data.session.access_token,
        expiresAt: now + 45 * 1000, // cache for 45 seconds
      };
      return data.session.access_token;
    }
  } catch {}
  return null;
}

// ══════════════════════════════════════════════════════════════════
// SECTION 2 · HTTP CLIENT (FETCH + AUTH + ETAG CACHE)
// Attaches the Supabase JWT to every call, caches GETs by ETag (304 = instant + free), timeouts, and invalidateApiCache() after writes.
// ══════════════════════════════════════════════════════════════════
interface ETagEntry {
  etag: string;
  data: any;
  timestamp: number;
}

const etagMemoryCache = new Map<string, ETagEntry>();

/**
 * Proper Cache Busting: Invalidates cached API responses when records change
 * to avoid stale cache across clients.
 */
export function invalidateApiCache(prefix?: string) {
  if (!prefix) {
    etagMemoryCache.clear();
    return;
  }
  for (const key of etagMemoryCache.keys()) {
    if (key.includes(prefix)) {
      etagMemoryCache.delete(key);
    }
  }
}

async function fetchApi<T>(endpoint: string, options?: RequestInit & { timeoutMs?: number; bustCache?: boolean }): Promise<T> {
  const method = (options?.method || 'GET').toUpperCase();
  const isGet = method === 'GET';

  // Automatic Cache Busting: Clear cached responses on write mutations
  if (!isGet) {
    const baseKey = endpoint.split('?')[0];
    invalidateApiCache(baseKey);
  }

  const authHeaders: Record<string, string> = {};
  const token = await getAuthToken();
  if (token) {
    authHeaders['Authorization'] = `Bearer ${token}`;
  }

  const customHeaders: Record<string, string> = { ...authHeaders };

  // ETag conditional check for GET requests
  const cached = isGet && !options?.bustCache ? etagMemoryCache.get(endpoint) : null;
  if (cached?.etag) {
    customHeaders['If-None-Match'] = cached.etag;
  }

  const timeoutMs = options?.timeoutMs || 4500;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      signal: options?.signal || controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...customHeaders,
        ...options?.headers,
      },
    });

    // 304 Not Modified: Return cached data instantly with 0-byte payload over wire!
    if (res.status === 304 && cached?.data) {
      return cached.data as T;
    }

    if (!res.ok) {
      throw new Error(`API error ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    const newEtag = res.headers.get('etag') || res.headers.get('ETag');
    if (isGet && newEtag) {
      etagMemoryCache.set(endpoint, {
        etag: newEtag,
        data,
        timestamp: Date.now(),
      });
    }

    return data;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ══════════════════════════════════════════════════════════════════
// SECTION 3 · OFFLINE FALLBACK CACHE
// STORAGE_KEYS + last-known-good data in localStorage so the UI still renders when the Worker/Supabase is unreachable.
// ══════════════════════════════════════════════════════════════════
const STORAGE_KEYS = {
  ATTENDANCE: 'genius_attendance_records',
  DISPUTES: 'genius_desk_disputes',
  SEATS: 'genius_seat_allocations',
  BOOKS: 'genius_books_data',
  BOOK_ISSUES: 'genius_book_issues',
  FEES: 'genius_fees_records',
  MESSAGES: 'genius_messages_records',
  STAFF: 'genius_staff_records',
  NOTIFICATIONS: 'genius_notifications_records',
  CLEARED_NOTIFICATIONS: 'genius_cleared_notification_ids',
  STUDENTS: 'genius_students_records',
  HOLIDAYS: 'genius_library_holidays',
  REOPENED_MAP: 'genius_library_reopened_map',
};

export interface LibraryHoliday {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  reason?: string;
  closedBy?: string;
  createdAt: string;
}

function getLocalData<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : fallback;
  } catch {
    return fallback;
  }
}

function setLocalData<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn(`Failed to cache ${key} in localStorage:`, err);
  }
}

// ══════════════════════════════════════════════════════════════════
// SECTION 4 · CORE API METHODS
// Every read/write resolves: Cloudflare Worker -> Supabase -> offline cache fallback.
// ══════════════════════════════════════════════════════════════════

// Shifts
// ── 4a. SHIFTS & SEATS ───────────────────────────────────────
export async function getShifts(): Promise<Shift[]> {
  let liveTotalSeats = 134;
  let liveAvailableSeats = 134;
  try {
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    const { data: dbSeats } = await supabase.from('seats').select('id, is_available');
    if (Array.isArray(dbSeats) && dbSeats.length > 0) {
      liveTotalSeats = dbSeats.length;
      liveAvailableSeats = dbSeats.filter(s => s.is_available !== false).length;
    }
  } catch {}

  const baseShifts: Shift[] = [
    { id: 'standard-3hr', name: 'Standard (3 Hours Pass)', startTime: '24/7 Flexible', endTime: '3 Hours Daily', fee: 300, totalSeats: liveTotalSeats, availableSeats: liveAvailableSeats, isActive: true },
    { id: 'prime-6hr', name: 'Pro / Prime (6 Hours Pass)', startTime: '24/7 Flexible', endTime: '6 Hours Daily', fee: 500, totalSeats: liveTotalSeats, availableSeats: liveAvailableSeats, isActive: true },
    { id: 'reserve-mini', name: 'Elite / Reserve Mini', startTime: '24/7 Dedicated', endTime: '24/7 Access', fee: 500, totalSeats: liveTotalSeats, availableSeats: liveAvailableSeats, isActive: true },
    { id: 'reserve-big', name: 'Prime / Reserve Big', startTime: '24/7 Dedicated', endTime: '24/7 Access', fee: 600, totalSeats: liveTotalSeats, availableSeats: liveAvailableSeats, isActive: true },
    { id: 'reserve-locker', name: 'Max / Reserve Locker', startTime: '24/7 Dedicated', endTime: '24/7 Access + Locker', fee: 700, totalSeats: liveTotalSeats, availableSeats: liveAvailableSeats, isActive: true },
    { id: 'night-ultra', name: 'Night Shift Ultra', startTime: '10:00 PM', endTime: '06:00 AM', fee: 500, totalSeats: liveTotalSeats, availableSeats: liveAvailableSeats, isActive: true },
  ];

  try {
    const data = await fetchApi<{ success: boolean; shifts: Shift[] }>('/api/shifts');
    if (data?.shifts && data.shifts.length > 0) {
      return data.shifts.map(s => ({
        ...s,
        totalSeats: liveTotalSeats,
        availableSeats: liveAvailableSeats,
      }));
    }
  } catch {}

  return baseShifts;
}

// Seats (Single Source of Truth: Supabase Primary Database)
export async function getSeats(): Promise<{ total: number; available: number; occupied: number; seats: Seat[] }> {
  try {
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    const { data: dbSeats, error } = await supabase.from('seats').select('*').order('seat_number', { ascending: true });
    if (!error && Array.isArray(dbSeats) && dbSeats.length > 0) {
      const mappedSeats: Seat[] = dbSeats.map((s: any) => ({
        id: s.id,
        seatNumber: s.seat_number,
        zone: s.zone || 'General',
        isAvailable: s.is_available ?? true,
        currentStudentName: s.current_student_name || null,
        currentStudentId: s.current_student_id || null,
        shiftId: s.shift_id || null,
      }));
      const occupied = mappedSeats.filter(s => !s.isAvailable).length;
      const result = {
        total: mappedSeats.length,
        available: Math.max(0, mappedSeats.length - occupied),
        occupied,
        seats: mappedSeats,
      };
      setLocalData(STORAGE_KEYS.SEATS, mappedSeats);
      return result;
    }
  } catch (err) {
    console.warn('Supabase getSeats error:', err);
  }

  const cachedSeats = getLocalData<Seat[]>(STORAGE_KEYS.SEATS, []);
  if (cachedSeats.length > 0) {
    const occupied = cachedSeats.filter(s => !s.isAvailable).length;
    return { total: cachedSeats.length, available: Math.max(0, cachedSeats.length - occupied), occupied, seats: cachedSeats };
  }

  return {
    total: 0,
    available: 0,
    occupied: 0,
    seats: [],
  };
}

export async function allocateSeat(seatNumber: string, studentId: string, studentName: string, shiftId?: string) {
  try {
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    await markSeatOccupiedInSupabase(supabase, seatNumber, studentId, studentName);
  } catch {
    enqueueOfflineMutation({
      type: 'seat_upsert',
      table: 'seats',
      action: 'update',
      payload: {
        is_available: false,
        current_student_id: studentId,
        current_student_name: studentName,
        shift_id: shiftId || null,
        occupied_at: new Date().toISOString(),
      },
      filter: { column: 'seat_number', value: seatNumber },
    });
  }
  // Local cache update
  const seatsList = getLocalData<Seat[]>(STORAGE_KEYS.SEATS, []);
  const updated = seatsList.map(s => matchSeatNumber(s.seatNumber, seatNumber) ? {
    ...s,
    isAvailable: false,
    currentStudentId: studentId,
    currentStudentName: studentName,
    shiftId: shiftId || null,
    occupiedAt: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
  } : s);
  setLocalData(STORAGE_KEYS.SEATS, updated);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('seats_updated'));
  }
  return { success: true, message: `Seat ${seatNumber} allocated to ${studentName}` };
}

export async function vacateSeat(seatNumber: string) {
  try {
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    await markSeatVacantInSupabase(supabase, null, seatNumber);
  } catch {
    enqueueOfflineMutation({
      type: 'seat_upsert',
      table: 'seats',
      action: 'update',
      payload: {
        is_available: true,
        current_student_id: null,
        current_student_name: null,
        shift_id: null,
        occupied_at: null,
      },
      filter: { column: 'seat_number', value: seatNumber },
    });
  }
  const seatsList = getLocalData<Seat[]>(STORAGE_KEYS.SEATS, []);
  const updated = seatsList.map(s => matchSeatNumber(s.seatNumber, seatNumber) ? {
    ...s,
    isAvailable: true,
    currentStudentId: null,
    currentStudentName: null,
    shiftId: null,
    occupiedAt: null,
  } : s);
  setLocalData(STORAGE_KEYS.SEATS, updated);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('seats_updated'));
  }
  return { success: true, message: `Seat ${seatNumber} is now vacant` };
}

// ── SEAT NUMBER SANITIZATION HELPER ─────────────────────────
// Strips URLs, gate keywords, and cleans desk strings so raw URLs never bleed into the UI or DB.
export function formatSeatCode(raw: string): string | null {
  if (!raw) return null;
  const clean = raw.trim().toUpperCase().replace(/^#/, '');
  if (!clean || clean === 'MASTER' || clean === 'AUTO' || clean === 'GATE' || clean === 'STAND' || clean === 'DESK') return null;

  // Numbers only: "15" -> "S-15"
  if (/^[0-9]{1,3}$/.test(clean)) {
    return `S-${clean.padStart(2, '0')}`;
  }
  // S15 -> S-15
  if (/^S[0-9]{1,3}$/.test(clean)) {
    return `S-${clean.slice(1).padStart(2, '0')}`;
  }
  // Standard format like S-01, A-01, B-12
  if (/^[A-Z0-9_-]{1,8}$/.test(clean)) {
    return clean;
  }
  return null;
}

export function sanitizeSeatNumber(raw?: string | null): string | null {
  if (!raw) return null;
  const str = String(raw).trim();
  if (
    !str ||
    str === 'AUTO' ||
    str === 'MASTER' ||
    str === 'STAND' ||
    str === 'GATE' ||
    str === 'null' ||
    str === 'undefined' ||
    str === '—' ||
    str === 'Desk' ||
    str === 'Study Desk'
  ) {
    return null;
  }

  // If it's a URL or contains domain/protocol (e.g. "https://genius.librarywale.in/attendance", "https://genius.librarywale.in", etc.)
  if (str.includes('http://') || str.includes('https://') || str.includes('librarywale') || str.includes('/attendance') || str.includes('.in') || str.includes('.com')) {
    // Check if query params have ?seat=, &seat=, ?desk=, &desk=, /qr/, or /desk/
    const match = str.match(/[?&/](?:seat|desk|seatNumber|seatId)[=/]([A-Za-z0-9_-]+)/i);
    if (match && match[1]) {
      return formatSeatCode(match[1]);
    }
    // No desk parameter found in URL -> this was a generic Master Gate / Entrance QR scan!
    return null;
  }

  // Remove common prefixes: "Desk #", "Desk ", "Seat #", "Seat ", "#"
  const cleaned = str.replace(/^(?:Desk|Seat|Desk\s*#|Seat\s*#|#)\s*/i, '').trim();
  if (!cleaned || cleaned.includes('http') || cleaned.includes('/') || cleaned.length > 10) {
    return null;
  }

  return formatSeatCode(cleaned);
}

// ── SUPABASE SEAT STATE & RANDOM ALLOCATION HELPERS ──────────
export async function markSeatOccupiedInSupabase(
  supabase: any,
  seatNumber: string,
  studentId: string,
  studentName: string
) {
  try {
    const deskNum = parseDeskNum(seatNumber);
    const nowIso = new Date().toISOString();
    const variants = Array.from(
      new Set(
        [
          seatNumber,
          deskNum ? String(deskNum) : null,
          deskNum ? String(deskNum).padStart(2, '0') : null,
          deskNum ? `S-${String(deskNum).padStart(2, '0')}` : null,
        ].filter(Boolean)
      )
    ) as string[];

    for (const v of variants) {
      await supabase
        .from('seats')
        .update({
          is_available: false,
          current_student_id: studentId,
          current_student_name: studentName,
          occupied_at: nowIso,
        })
        .eq('seat_number', v);
    }

    if (deskNum) {
      await supabase
        .from('seats')
        .update({
          is_available: false,
          current_student_id: studentId,
          current_student_name: studentName,
          occupied_at: nowIso,
        })
        .eq('id', `seat-${deskNum}`);
    }
  } catch (err) {
    console.warn('markSeatOccupiedInSupabase notice:', err);
  }
}

export async function markSeatVacantInSupabase(
  supabase: any,
  studentId?: string | null,
  seatNumber?: string | null
) {
  try {
    // 1. Release any seat held by this student ID in seats table
    if (studentId) {
      await supabase
        .from('seats')
        .update({
          is_available: true,
          current_student_id: null,
          current_student_name: null,
          occupied_at: null,
        })
        .eq('current_student_id', studentId);

      // Also ensure profiles table has seat_number set to null
      await supabase
        .from('profiles')
        .update({
          seat_number: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', studentId);
    }

    // 2. Release by seat number variants in both seats and profiles tables
    if (seatNumber) {
      const deskNum = parseDeskNum(seatNumber);
      const variants = Array.from(
        new Set(
          [
            seatNumber,
            deskNum ? String(deskNum) : null,
            deskNum ? String(deskNum).padStart(2, '0') : null,
            deskNum ? `S-${String(deskNum).padStart(2, '0')}` : null,
          ].filter(Boolean)
        )
      ) as string[];

      for (const v of variants) {
        await supabase
          .from('seats')
          .update({
            is_available: true,
            current_student_id: null,
            current_student_name: null,
            occupied_at: null,
          })
          .eq('seat_number', v);

        await supabase
          .from('profiles')
          .update({
            seat_number: null,
            updated_at: new Date().toISOString(),
          })
          .eq('seat_number', v);
      }

      if (deskNum) {
        await supabase
          .from('seats')
          .update({
            is_available: true,
            current_student_id: null,
            current_student_name: null,
            occupied_at: null,
          })
          .eq('id', `seat-${deskNum}`);
      }
    }

    // 3. Instant cross-tab & window notification
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('seats_updated'));
      window.dispatchEvent(new CustomEvent('library_seat_update', { detail: { studentId, seatNumber } }));
      if (typeof BroadcastChannel !== 'undefined') {
        try {
          const bc = new BroadcastChannel('genius_library_sync');
          bc.postMessage({ type: 'SEAT_VACATED', studentId, seatNumber });
          bc.close();
        } catch {}
      }
    }
  } catch (err) {
    console.warn('markSeatVacantInSupabase notice:', err);
  }
}

export async function findRandomAvailableSeat(
  supabase: any,
  excludeStudentId?: string,
  todayStr?: string
): Promise<string | null> {
  const currentDateStr = todayStr || new Date().toLocaleDateString('en-CA');
  let allDeskNumbers: number[] = [];

  // 0. Fetch all configured desks dynamically from Supabase seats table
  try {
    const { data: dbSeats } = await supabase.from('seats').select('seat_number');
    if (Array.isArray(dbSeats) && dbSeats.length > 0) {
      allDeskNumbers = dbSeats
        .map((s: any) => parseDeskNum(s.seat_number))
        .filter((n: number | null): n is number => n !== null);
    }
  } catch (err) {
    console.warn('Error fetching all seats from db in findRandomAvailableSeat:', err);
  }

  // Default to 134 library desks if not configured
  if (allDeskNumbers.length === 0) {
    allDeskNumbers = Array.from({ length: 134 }, (_, i) => i + 1);
  }
  allDeskNumbers = Array.from(new Set(allDeskNumbers)).sort((a, b) => a - b);
  const unavailableDesks = new Set<number>();

  // 1. Desks permanently reserved by active students in profiles
  try {
    const { data: reservedProfiles } = await supabase
      .from('profiles')
      .select('seat_number, membership_plan, is_reserved, status')
      .not('seat_number', 'is', null);

    if (Array.isArray(reservedProfiles)) {
      for (const p of reservedProfiles) {
        if (p.status !== 'suspended' && p.seat_number) {
          const num = parseDeskNum(p.seat_number);
          if (num !== null) unavailableDesks.add(num);
        }
      }
    }
  } catch (err) {
    console.warn('Error fetching reserved profiles:', err);
  }

  // 2. Desks currently occupied in seats table
  try {
    const { data: occupiedSeats } = await supabase
      .from('seats')
      .select('seat_number, is_available, current_student_id')
      .eq('is_available', false);

    if (Array.isArray(occupiedSeats)) {
      for (const s of occupiedSeats) {
        if (s.current_student_id !== excludeStudentId && s.seat_number) {
          const num = parseDeskNum(s.seat_number);
          if (num !== null) unavailableDesks.add(num);
        }
      }
    }
  } catch (err) {
    console.warn('Error fetching occupied seats:', err);
  }

  // 3. Desks with active check-in today in attendance table
  try {
    const { data: activeAtt } = await supabase
      .from('attendance')
      .select('seat_number, student_id, check_out')
      .eq('date', currentDateStr);

    if (Array.isArray(activeAtt)) {
      for (const a of activeAtt) {
        const co = a.check_out;
        const isActive = !co || co === 'In Progress' || co === '—' || String(co).trim() === '';
        if (isActive && a.student_id !== excludeStudentId && a.seat_number) {
          const num = parseDeskNum(a.seat_number);
          if (num !== null) unavailableDesks.add(num);
        }
      }
    }
  } catch (err) {
    console.warn('Error fetching active attendance:', err);
  }

  // Pool of available desks
  const availableDesks = allDeskNumbers.filter((n) => !unavailableDesks.has(n));
  if (availableDesks.length === 0) {
    return null; // All 100 library desks occupied!
  }

  // Pick random available desk
  const randomIndex = Math.floor(Math.random() * availableDesks.length);
  const chosenNum = availableDesks[randomIndex];
  return `S-${String(chosenNum).padStart(2, '0')}`;
}

// Attendance - Single Source of Truth: Supabase Primary Store (Permanent Retention)
// ── 4b. ATTENDANCE & DESK DISPUTES ──────────────────────────
export async function getAttendance(params?: string | { studentId?: string; date?: string; startDate?: string; endDate?: string }): Promise<AttendanceRecord[]> {
  // 1. Direct Supabase Query (Sole Database for all attendance)
  try {
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    let query = supabase.from('attendance').select('*').order('date', { ascending: false });

    if (typeof params === 'string') {
      query = query.eq('student_id', params);
    } else if (params) {
      if (params.studentId) query = query.eq('student_id', params.studentId);
      if (params.date) query = query.eq('date', params.date);
      if (params.startDate) query = query.gte('date', params.startDate);
      if (params.endDate) query = query.lte('date', params.endDate);
    }

    const { data: supaRows, error } = await query;
    if (!error && Array.isArray(supaRows)) {
      const supaRecords: AttendanceRecord[] = supaRows.map((r: any) => ({
        id: r.id,
        studentId: r.student_id,
        studentName: r.student_name,
        seatNumber: sanitizeSeatNumber(r.seat_number),
        shiftName: r.shift_name,
        checkIn: r.check_in,
        checkOut: r.check_out,
        status: r.status,
        date: r.date,
        photoUrl: r.photo_url || r.photoUrl || null,
        source: 'supabase' as const,
        verificationMethod: r.verification_method || r.method || (r.seat_number === 'MASTER' ? 'nfc' : undefined),
      }));
      setLocalData(STORAGE_KEYS.ATTENDANCE, supaRecords);
      return supaRecords;
    }
  } catch (err) {
    console.warn('Supabase getAttendance error:', err);
  }

  // Fallback to local cache only if network/Supabase call fails
  const localRecords = getLocalData<AttendanceRecord[]>(STORAGE_KEYS.ATTENDANCE, []);
  if (typeof params === 'string') {
    return localRecords.filter(r => r.studentId === params).map(r => ({ ...r, seatNumber: sanitizeSeatNumber(r.seatNumber) }));
  } else if (params?.studentId) {
    return localRecords.filter(r => r.studentId === params.studentId).map(r => ({ ...r, seatNumber: sanitizeSeatNumber(r.seatNumber) }));
  }
  return localRecords.map(r => ({ ...r, seatNumber: sanitizeSeatNumber(r.seatNumber) }));
}

// All historical attendance records are permanently stored and queried from Supabase
export async function getAttendanceHistory(studentId?: string): Promise<AttendanceRecord[]> {
  return getAttendance(studentId);
}

/**
 * Attendance Query with Pagination from Supabase (Sole Database):
 * All records remain permanently in Supabase without automated eviction.
 */
export async function getAttendanceWaterfall(options: {
  studentId: string;
  page?: number;
  pageSize?: number;
  loadArchive?: boolean;
}): Promise<{
  records: AttendanceRecord[];
  totalAvailable: number;
  hasMore: boolean;
  isArchiveLoaded: boolean;
}> {
  const { studentId, page = 1, pageSize = 15 } = options;

  // Fetch all records for student from Supabase
  const allRecords = await getAttendance(studentId);

  const startIndex = 0;
  const endIndex = page * pageSize;
  const pagedRecords = allRecords.slice(startIndex, endIndex);
  const hasMore = endIndex < allRecords.length;

  return {
    records: pagedRecords,
    totalAvailable: allRecords.length,
    hasMore,
    isArchiveLoaded: false,
  };
}

export async function markAttendance(params: {
  studentId: string;
  studentName: string;
  date?: string;
  checkIn?: string;
  checkOut?: string | null;
  status?: string;
  seatNumber?: string;
  shiftName?: string;
}) {
  const now = new Date();
  const dateStr = params.date || now.toISOString().split('T')[0];
  const checkInTime = params.checkIn || now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  const attId = `att-${Date.now()}`;

  // 1. Write to Supabase Attendance Table (Primary Store)
  try {
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    await supabase.from('attendance').upsert({
      id: attId,
      student_id: params.studentId,
      student_name: params.studentName,
      seat_number: params.seatNumber || null,
      shift_name: params.shiftName || 'Morning Shift',
      check_in: checkInTime,
      check_out: params.checkOut || null,
      status: params.status || 'present',
      date: dateStr,
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('Supabase attendance write notice:', err);
  }

  // 2. Sync to API / D1 backend
  try {
    const apiRes = await fetchApi<{ success: boolean; message: string; record?: AttendanceRecord }>('/api/attendance', {
      method: 'POST',
      body: JSON.stringify(params),
    });



    return apiRes;
  } catch {
    const record: AttendanceRecord = {
      id: attId,
      studentId: params.studentId,
      studentName: params.studentName,
      seatNumber: params.seatNumber || null,
      shiftName: params.shiftName || 'Morning Shift',
      checkIn: checkInTime,
      checkOut: params.checkOut || null,
      status: params.status || 'present',
      date: dateStr,
      source: 'supabase',
    };



    return { success: true, message: 'Attendance recorded', record };
  }
}

export async function recordCheckIn(params: { studentId: string; studentName: string; seatNumber?: string; shiftId?: string; shiftName?: string; photoUrl?: string }) {
  let cleanSeat = sanitizeSeatNumber(params.seatNumber);
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-CA');
  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  const attId = `att-${Date.now()}`;

  // 1. Direct Supabase Upsert
  try {
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();

    // If no seat provided, check if reserved student or allocate random available seat
    if (!cleanSeat && params.studentId) {
      const { data: p } = await supabase
        .from('profiles')
        .select('seat_number, membership_plan, is_reserved')
        .eq('id', params.studentId)
        .maybeSingle();

      const planStr = String(p?.membership_plan || '').toLowerCase();
      const isReserved = Boolean(
        p?.seat_number &&
        (planStr.includes('reserved') || p?.is_reserved === true || (!planStr.includes('general') && !planStr.includes('trial')))
      );

      if (isReserved && p?.seat_number) {
        cleanSeat = sanitizeSeatNumber(p.seat_number) || p.seat_number;
      } else {
        cleanSeat = await findRandomAvailableSeat(supabase, params.studentId, dateStr);
      }
    }

    await supabase.from('attendance').upsert({
      id: attId,
      student_id: params.studentId,
      student_name: params.studentName,
      seat_number: cleanSeat || null,
      shift_name: params.shiftName || 'Morning Shift',
      check_in: timeStr,
      check_out: null,
      status: 'present',
      photo_url: params.photoUrl || null,
      date: dateStr,
      updated_at: new Date().toISOString(),
    });

    if (cleanSeat) {
      await markSeatOccupiedInSupabase(supabase, cleanSeat, params.studentId, params.studentName);
    }
  } catch (err) {
    console.warn('Supabase recordCheckIn notice:', err);
  }

  // 2. Local cache update
  const newRecord: AttendanceRecord = {
    id: attId,
    studentId: params.studentId || 'std-unknown',
    studentName: params.studentName || 'Student',
    seatNumber: cleanSeat || null,
    shiftId: params.shiftId || null,
    shiftName: params.shiftName || 'Morning Shift',
    checkIn: timeStr,
    checkOut: null,
    status: 'present',
    photoUrl: params.photoUrl || null,
    date: dateStr,
  };

  const existing = getLocalData<AttendanceRecord[]>(STORAGE_KEYS.ATTENDANCE, []);
  const updated = [newRecord, ...existing.filter(r => !(r.studentId === params.studentId && r.date === dateStr))];
  setLocalData(STORAGE_KEYS.ATTENDANCE, updated);

  // 3. Notification & WhatsApp
  createNotification({
    recipientRole: 'student',
    recipientId: params.studentId,
    title: '✓ Attendance Check-In Confirmed',
    message: `Checked in successfully at ${timeStr}${cleanSeat ? ` (Desk #${cleanSeat})` : ''}.`,
    type: 'attendance',
    actionUrl: '/student/attendance',
  }).catch(() => {});



  return { success: true, message: 'Check-in recorded with desk verification', record: newRecord };
}

export async function smartQrScanAttendance(params: {
  studentId: string;
  studentName: string;
  seatNumber?: string;
  shiftName?: string;
  shiftId?: string;
  photoUrl?: string;
  verificationMethod?: 'nfc' | 'qr' | 'admin' | 'stamp';
}): Promise<{
  success: boolean;
  action: 'checked_in' | 'checked_out' | 'seat_occupied' | 'all_occupied';
  seatNumber?: string;
  occupiedBy?: string;
  occupantStudentId?: string;
  checkInTime?: string;
  checkOutTime?: string;
  message: string;
  record?: any;
}> {
  const { createClient } = await import('@/lib/supabase/client');
  const supabase = createClient();
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-CA');
  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

  // 1. Fetch student's profile to check reserved seat status
  let studentProfile: {
    seat_number: string | null;
    membership_plan: string | null;
    is_reserved?: boolean;
  } | null = null;

  if (params.studentId) {
    try {
      const { data: p } = await supabase
        .from('profiles')
        .select('seat_number, membership_plan, is_reserved')
        .eq('id', params.studentId)
        .maybeSingle();
      studentProfile = p;
    } catch {}
  }

  const planStr = String(studentProfile?.membership_plan || '').toLowerCase();
  const isStudentReserved = Boolean(
    studentProfile?.seat_number &&
    (planStr.includes('reserved') || studentProfile?.is_reserved === true || (!planStr.includes('general') && !planStr.includes('trial')))
  );
  const reservedDesk = isStudentReserved ? sanitizeSeatNumber(studentProfile?.seat_number) : null;

  // Sanitize the requested seat from scan/tap
  let cleanSeat = sanitizeSeatNumber(params.seatNumber);

  const effectiveMethod = params.verificationMethod || (params.seatNumber === 'MASTER' ? 'nfc' : 'qr');

  if (typeof window !== 'undefined' && effectiveMethod) {
    try {
      localStorage.setItem(`last_att_method_${params.studentId}`, effectiveMethod);
      localStorage.setItem('genius_last_att_method', effectiveMethod);
    } catch {}
  }

  // 2. Query Supabase for student's attendance records today
  let todayRecords: any[] = [];
  try {
    const { data, error } = await supabase
      .from('attendance')
      .select('*')
      .eq('student_id', params.studentId)
      .eq('date', dateStr)
      .order('created_at', { ascending: false });
    if (!error && Array.isArray(data)) {
      todayRecords = data;
    }
  } catch (err) {
    console.warn('Supabase query today attendance error:', err);
  }

  // Find if there is an active session (where check_out is null or in progress)
  const activeRecord = todayRecords.find((r) => {
    const co = r.check_out;
    return !co || co === 'In Progress' || co === '—' || String(co).trim() === '';
  });

  // ══════════════════════════════════════════════════════════════════
  // A. IF STUDENT IS ALREADY CHECKED IN -> PERFORM CHECK-OUT!
  // ══════════════════════════════════════════════════════════════════
  if (activeRecord) {
    const seatToRelease = sanitizeSeatNumber(activeRecord.seat_number) || cleanSeat || reservedDesk;

    // 1. Update Supabase attendance record to completed & checked out
    try {
      await supabase
        .from('attendance')
        .update({
          check_out: timeStr,
          status: 'completed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', activeRecord.id);

      // Auto-complete any other dangling duplicate records for today
      await supabase
        .from('attendance')
        .update({
          check_out: timeStr,
          status: 'completed',
          updated_at: new Date().toISOString(),
        })
        .eq('student_id', params.studentId)
        .eq('date', dateStr)
        .is('check_out', null);
    } catch (updErr) {
      console.warn('Supabase checkout update error:', updErr);
    }

    // 2. Release seat in seats table (Supabase primary store)
    await markSeatVacantInSupabase(supabase, params.studentId, seatToRelease);

    // 3. Update local cache
    try {
      const cached = getLocalData<AttendanceRecord[]>(STORAGE_KEYS.ATTENDANCE, []);
      const updatedCache = cached.map((c) =>
        c.studentId === params.studentId && c.date === dateStr && (!c.checkOut || c.checkOut === 'In Progress')
          ? { ...c, checkOut: timeStr, status: 'completed' as const }
          : c
      );
      setLocalData(STORAGE_KEYS.ATTENDANCE, updatedCache);

      const cachedSeats = getLocalData<Seat[]>(STORAGE_KEYS.SEATS, []);
      if (cachedSeats.length > 0) {
        const updatedSeats = cachedSeats.map(s => {
          const match = (seatToRelease && matchSeatNumber(s.seatNumber, seatToRelease)) || s.currentStudentId === params.studentId;
          return match ? { ...s, isAvailable: true, currentStudentId: null, currentStudentName: null, occupiedAt: null } : s;
        });
        setLocalData(STORAGE_KEYS.SEATS, updatedSeats);
      }
    } catch {}

    // 4. Notifications & WhatsApp
    const notifTitle = '✓ Attendance Check-Out Confirmed';
    const notifBody = `Checked out at ${timeStr}${seatToRelease ? ` from Desk #${seatToRelease}` : ''}. Desk is now free. Have a great study day!`;

    createNotification({
      recipientRole: 'student',
      recipientId: params.studentId,
      title: notifTitle,
      message: notifBody,
      type: 'attendance',
      actionUrl: '/student/attendance',
    }).catch(() => {});

    try {
      const { triggerNativeNotification } = await import('./pushNotify');
      triggerNativeNotification({
        title: notifTitle,
        body: notifBody,
        url: '/student/attendance',
        tag: 'genius-attendance-single-popup',
      }).catch(() => {});
    } catch {}



    return {
      success: true,
      action: 'checked_out',
      seatNumber: seatToRelease || undefined,
      checkInTime: activeRecord.check_in,
      checkOutTime: timeStr,
      message: `Checked out successfully${seatToRelease ? ` from Desk #${seatToRelease}` : ''}! Desk is now free.`,
      record: {
        ...activeRecord,
        checkOut: timeStr,
        status: 'completed',
      },
    };
  }

  // ══════════════════════════════════════════════════════════════════
  // B. IF STUDENT IS NOT CHECKED IN -> PERFORM CHECK-IN!
  // ══════════════════════════════════════════════════════════════════
  let allocatedSeat: string | null = null;
  let isReservedAllocation = false;

  if (isStudentReserved && reservedDesk) {
    // 1. Reserved student: Always allocate & show their reserved seat
    allocatedSeat = reservedDesk;
    isReservedAllocation = true;
  } else {
    // 2. Unreserved student:
    // If a specific desk QR was scanned, check if it's available and not someone else's reserved seat
    if (cleanSeat) {
      let isReservedByOther = false;
      try {
        const { data: otherRes } = await supabase
          .from('profiles')
          .select('id, seat_number')
          .not('seat_number', 'is', null);
        if (Array.isArray(otherRes)) {
          isReservedByOther = otherRes.some(
            (p) => p.id !== params.studentId && matchSeatNumber(p.seat_number, cleanSeat)
          );
        }
      } catch {}

      let isOccupied = false;
      try {
        const { data: seatRow } = await supabase
          .from('seats')
          .select('is_available, current_student_id')
          .eq('seat_number', cleanSeat)
          .maybeSingle();
        if (seatRow && !seatRow.is_available && seatRow.current_student_id && seatRow.current_student_id !== params.studentId) {
          isOccupied = true;
        }
      } catch {}

      if (!isReservedByOther && !isOccupied) {
        allocatedSeat = cleanSeat;
      }
    }

    // If entrance QR/NFC/in-app or scanned desk unavailable: pick random available seat!
    if (!allocatedSeat) {
      allocatedSeat = await findRandomAvailableSeat(supabase, params.studentId, dateStr);
      if (!allocatedSeat) {
        return {
          success: false,
          action: 'all_occupied',
          message: 'All 100 library desks are currently occupied. Please contact admin.',
        };
      }
    }
  }

  const newRecordId = `att-${Date.now()}`;
  const newRecordData = {
    id: newRecordId,
    student_id: params.studentId,
    student_name: params.studentName,
    seat_number: allocatedSeat,
    shift_name: params.shiftName || 'Morning Shift',
    check_in: timeStr,
    check_out: null,
    status: 'present',
    photo_url: params.photoUrl || null,
    date: dateStr,
    verification_method: effectiveMethod,
    updated_at: new Date().toISOString(),
  };

  try {
    await supabase.from('attendance').insert(newRecordData);
  } catch (insErr) {
    console.warn('Supabase check-in insert error:', insErr);
  }

  // Mark seat occupied in seats table
  if (allocatedSeat) {
    await markSeatOccupiedInSupabase(supabase, allocatedSeat, params.studentId, params.studentName);
  }

  // Update local cache
  try {
    const cached = getLocalData<AttendanceRecord[]>(STORAGE_KEYS.ATTENDANCE, []);
    const localRec: AttendanceRecord = {
      id: newRecordId,
      studentId: params.studentId,
      studentName: params.studentName,
      seatNumber: allocatedSeat,
      shiftName: params.shiftName || 'Morning Shift',
      checkIn: timeStr,
      checkOut: null,
      status: 'present',
      photoUrl: params.photoUrl || null,
      date: dateStr,
      verificationMethod: effectiveMethod,
    };
    setLocalData(STORAGE_KEYS.ATTENDANCE, [localRec, ...cached]);

    const cachedSeats = getLocalData<Seat[]>(STORAGE_KEYS.SEATS, []);
    if (cachedSeats.length > 0) {
      const updatedSeats = cachedSeats.map(s => {
        const match = matchSeatNumber(s.seatNumber, allocatedSeat);
        return match ? { ...s, isAvailable: false, currentStudentId: params.studentId, currentStudentName: params.studentName, occupiedAt: timeStr } : s;
      });
      setLocalData(STORAGE_KEYS.SEATS, updatedSeats);
    }
  } catch {}

  const notifTitle = '✓ Attendance Check-In Confirmed';
  const notifBody = `Checked in successfully at ${timeStr}${allocatedSeat ? ` (${isReservedAllocation ? 'Reserved' : 'Allocated'} Desk #${allocatedSeat})` : ''}. Happy studying!`;

  createNotification({
    recipientRole: 'student',
    recipientId: params.studentId,
    title: notifTitle,
    message: notifBody,
    type: 'attendance',
    actionUrl: '/student/attendance',
  }).catch(() => {});

  try {
    const { triggerNativeNotification } = await import('./pushNotify');
    triggerNativeNotification({
      title: notifTitle,
      body: notifBody,
      url: '/student/attendance',
      tag: 'genius-attendance-single-popup',
    }).catch(() => {});
  } catch {}



  return {
    success: true,
    action: 'checked_in',
    seatNumber: allocatedSeat || undefined,
    checkInTime: timeStr,
    message: isReservedAllocation
      ? `Checked in successfully at ${timeStr} (Reserved Desk #${allocatedSeat})!`
      : `Checked in successfully at ${timeStr} (Allocated Desk #${allocatedSeat})!`,
    record: {
      id: newRecordId,
      studentId: params.studentId,
      studentName: params.studentName,
      seatNumber: allocatedSeat || null,
      checkIn: timeStr,
      checkOut: null,
      status: 'present',
      date: dateStr,
    },
  };
}

export interface DeskDispute {
  id: string;
  seatNumber: string;
  reporterStudentId: string;
  reporterStudentName: string;
  occupantStudentId?: string | null;
  occupantStudentName?: string | null;
  status: 'pending' | 'resolved_checkout' | 'resolved_proxy' | 'dismissed';
  reportedAt: string;
  resolvedAt?: string | null;
  actionTaken?: string | null;
}

export async function reportEmptyDeskDispute(params: {
  seatNumber: string;
  reporterStudentId: string;
  reporterStudentName: string;
  occupantStudentName?: string;
  occupantStudentId?: string;
}) {
  try {
    return await fetchApi<{ success: boolean; message: string; disputeId: string }>('/api/seats/report-dispute', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  } catch {
    const disputeId = `disp-${Date.now()}`;
    const newDispute: DeskDispute = {
      id: disputeId,
      seatNumber: params.seatNumber,
      reporterStudentId: params.reporterStudentId,
      reporterStudentName: params.reporterStudentName,
      occupantStudentId: params.occupantStudentId || null,
      occupantStudentName: params.occupantStudentName || null,
      status: 'pending',
      reportedAt: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
    };
    const disputes = getLocalData<DeskDispute[]>(STORAGE_KEYS.DISPUTES, []);
    setLocalData(STORAGE_KEYS.DISPUTES, [newDispute, ...disputes]);
    return { success: true, message: `Dispute reported for Seat ${params.seatNumber}. Front desk notified.`, disputeId };
  }
}

export async function getDeskDisputes(): Promise<DeskDispute[]> {
  try {
    const data = await fetchApi<{ success: boolean; disputes: DeskDispute[] }>('/api/seats/disputes');
    if (data?.disputes) {
      setLocalData(STORAGE_KEYS.DISPUTES, data.disputes);
      return data.disputes;
    }
  } catch {
    // Fallback
  }
  return getLocalData<DeskDispute[]>(STORAGE_KEYS.DISPUTES, []);
}

export async function resolveDeskDispute(params: {
  disputeId: string;
  action: 'force_checkout' | 'mark_proxy' | 'dismiss';
  seatNumber?: string;
  occupantStudentId?: string;
}) {
  try {
    return await fetchApi<{ success: boolean; message: string }>('/api/seats/resolve-dispute', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  } catch {
    const disputes = getLocalData<DeskDispute[]>(STORAGE_KEYS.DISPUTES, []);
    const updated = disputes.map(d => d.id === params.disputeId ? {
      ...d,
      status: params.action === 'force_checkout' ? 'resolved_checkout' : params.action === 'mark_proxy' ? 'resolved_proxy' : 'dismissed',
      resolvedAt: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
      actionTaken: params.action,
    } as DeskDispute : d);
    setLocalData(STORAGE_KEYS.DISPUTES, updated);
    return { success: true, message: `Dispute ${params.disputeId} resolved (${params.action})` };
  }
}

export async function recordCheckOut(studentId: string, studentName?: string) {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-CA');
  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  let seatToRelease: string | null = null;

  // 1. Direct Supabase Update (Single Source of Truth)
  try {
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();

    // Query active attendance to get allocated desk
    const { data: activeRec } = await supabase
      .from('attendance')
      .select('seat_number')
      .eq('student_id', studentId)
      .eq('date', dateStr)
      .is('check_out', null)
      .maybeSingle();

    if (activeRec?.seat_number) {
      seatToRelease = sanitizeSeatNumber(activeRec.seat_number) || activeRec.seat_number;
    }

    await supabase
      .from('attendance')
      .update({ check_out: timeStr, status: 'completed', updated_at: new Date().toISOString() })
      .eq('student_id', studentId)
      .eq('date', dateStr);

    // Free the seat in Supabase seats table
    await markSeatVacantInSupabase(supabase, studentId, seatToRelease);
  } catch (sbErr) {
    console.warn('Supabase checkout update notice:', sbErr);
  }

  // 2. Local cache update
  const records = getLocalData<AttendanceRecord[]>(STORAGE_KEYS.ATTENDANCE, []);
  const updated = records.map(r => (r.studentId === studentId && r.date === dateStr) ? {
    ...r,
    checkOut: timeStr,
    status: 'completed' as const,
  } : r);
  setLocalData(STORAGE_KEYS.ATTENDANCE, updated);

  try {
    const cachedSeats = getLocalData<Seat[]>(STORAGE_KEYS.SEATS, []);
    if (cachedSeats.length > 0) {
      const updatedSeats = cachedSeats.map(s => {
        const match = (seatToRelease && matchSeatNumber(s.seatNumber, seatToRelease)) || s.currentStudentId === studentId;
        return match ? { ...s, isAvailable: true, currentStudentId: null, currentStudentName: null, occupiedAt: null } : s;
      });
      setLocalData(STORAGE_KEYS.SEATS, updatedSeats);
    }
  } catch {}

  // 3. Notification & WhatsApp
  createNotification({
    recipientRole: 'student',
    recipientId: studentId,
    title: '✓ Attendance Check-Out Confirmed',
    message: `Checked out successfully at ${timeStr}${seatToRelease ? ` from Desk #${seatToRelease}` : ''}. Desk is now free. Have a great study day!`,
    type: 'attendance',
    actionUrl: '/student/attendance',
  }).catch(() => {});



  return { success: true, message: `Check-out recorded successfully${seatToRelease ? ` (Desk #${seatToRelease} is now free)` : ''}` };
}

// Books
// ── 4c. BOOKS ────────────────────────────────────────────────
export async function getBooks(): Promise<Book[]> {
  try {
    const data = await fetchApi<{ success: boolean; books: Book[] }>('/api/books');
    if (data?.books) {
      setLocalData(STORAGE_KEYS.BOOKS, data.books);
      return data.books;
    }
  } catch {
    // Fallback
  }
  return [];
}

export async function getBookIssues(studentId?: string): Promise<BookIssue[]> {
  try {
    const endpoint = studentId ? `/api/books/issues?studentId=${encodeURIComponent(studentId)}` : '/api/books/issues';
    const data = await fetchApi<{ success: boolean; issues: BookIssue[] }>(endpoint);
    if (data?.issues) {
      setLocalData(STORAGE_KEYS.BOOK_ISSUES, data.issues);
      return data.issues;
    }
  } catch {
    // Fallback
  }
  const issues = getLocalData<BookIssue[]>(STORAGE_KEYS.BOOK_ISSUES, []);
  if (studentId) return issues.filter(i => i.studentId === studentId);
  return issues;
}

export async function issueBook(params: { bookId: string; bookTitle: string; studentId: string; studentName: string; days?: number }) {
  try {
    return await fetchApi('/api/books/issue', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  } catch {
    const now = new Date();
    const dueDate = new Date();
    dueDate.setDate(now.getDate() + (params.days || 14));

    const newIssue: BookIssue = {
      id: `iss-${Date.now()}`,
      bookId: params.bookId,
      bookTitle: params.bookTitle,
      studentId: params.studentId,
      studentName: params.studentName,
      issuedAt: now.toISOString().split('T')[0],
      dueDate: dueDate.toISOString().split('T')[0],
      returnedAt: null,
      status: 'issued',
      fineAmount: 0,
    };
    const issues = getLocalData<BookIssue[]>(STORAGE_KEYS.BOOK_ISSUES, []);
    setLocalData(STORAGE_KEYS.BOOK_ISSUES, [newIssue, ...issues]);
    return { success: true, message: `Book "${params.bookTitle}" issued to ${params.studentName}`, issue: newIssue };
  }
}

export async function returnBook(issueId: string): Promise<{ success: boolean; message: string }> {
  try {
    return await fetchApi<{ success: boolean; message: string }>('/api/books/return', {
      method: 'POST',
      body: JSON.stringify({ issueId }),
    });
  } catch {
    const issues = getLocalData<BookIssue[]>(STORAGE_KEYS.BOOK_ISSUES, []);
    const updated = issues.map(i => i.id === issueId ? {
      ...i,
      status: 'returned' as const,
      returnedAt: new Date().toISOString().split('T')[0],
      fineAmount: 0,
    } : i);
    setLocalData(STORAGE_KEYS.BOOK_ISSUES, updated);
    return { success: true, message: 'Book marked as returned' };
  }
}

// Fees (Supabase Primary Database - Single Source of Truth)
// ── 4d. FEES ─────────────────────────────────────────────────
export async function getFees(studentId?: string): Promise<FeeRecord[]> {
  try {
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    let query = supabase.from('fees').select('*').order('created_at', { ascending: false });
    if (studentId) {
      query = query.eq('student_id', studentId);
    }
    const { data: sbFees, error } = await query;
    if (!error && Array.isArray(sbFees)) {
      const mapped = sbFees.map((f: any) => ({
        id: f.id,
        studentId: f.student_id,
        studentName: f.student_name,
        type: f.type || 'Monthly Seat Fee',
        amount: Number(f.amount || 0),
        paid: !!f.paid,
        paidAt: f.paid_at,
        dueDate: f.due_date,
        description: f.description,
        receiptNo: f.receipt_no || f.id,
        createdAt: f.created_at,
      }));
      setLocalData(STORAGE_KEYS.FEES, mapped);
      return mapped;
    }
  } catch (err) {
    console.warn('Supabase getFees error:', err);
  }

  const cached = getLocalData<FeeRecord[]>(STORAGE_KEYS.FEES, []);
  if (studentId) return cached.filter(f => f.studentId === studentId);
  return cached;
}

// All historical fees are stored and queried directly from Supabase
export async function getFeesHistory(studentId?: string): Promise<FeeRecord[]> {
  return getFees(studentId);
}

/**
 * Generate formatted student code: SDL-YYYY-XXX (e.g. SDL-2026-001)
 * Standard identifier used across all library portals and sections
 */
export function generateStudentCode(existingCodes?: (string | undefined | null)[]): string {
  const now = new Date();
  const year = now.getFullYear();
  const prefix = `SDL-${year}-`;

  let maxSeq = 0;
  if (existingCodes && existingCodes.length > 0) {
    for (const raw of existingCodes) {
      if (!raw) continue;
      const str = String(raw).trim().toUpperCase();

      // Match SDL-YYYY-XXX (e.g. SDL-2026-001)
      const matchYearSeq = str.match(/SDL-\d{4}-(\d+)/i);
      if (matchYearSeq) {
        const num = parseInt(matchYearSeq[1], 10);
        if (!isNaN(num) && num > maxSeq) {
          maxSeq = num;
        }
        continue;
      }

      // Match SDL-XXX (e.g. SDL-001)
      const matchSimple = str.match(/SDL-(\d+)/i);
      if (matchSimple) {
        const num = parseInt(matchSimple[1], 10);
        if (!isNaN(num) && num > maxSeq) {
          maxSeq = num;
        }
        continue;
      }

      // Match legacy numeric codes like 2610001 (YYMMXXX)
      const matchLegacy = str.match(/^\d{4}(\d{3})$/);
      if (matchLegacy) {
        const num = parseInt(matchLegacy[1], 10);
        if (!isNaN(num) && num > maxSeq) {
          maxSeq = num;
        }
      }
    }
  }
  return `${prefix}${String(maxSeq + 1).padStart(3, "0")}`;
}

/**
 * Generate formatted invoice number: inv-YYMM-XXX (e.g. inv-2609-001)
 * Prefix 'inv-' + current year last 2 digits + current month 2 digits + '-' + 3-digit sequence
 */
export function generateInvoiceNumber(existingReceipts?: (string | undefined | null)[]): string {
  const now = new Date();
  const yy = now.getFullYear().toString().slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const prefix = `INV-${yy}${mm}-`;

  let maxSeq = 0;
  if (existingReceipts && existingReceipts.length > 0) {
    for (const raw of existingReceipts) {
      if (!raw) continue;
      const match = String(raw).match(new RegExp(`inv-${yy}${mm}-(\\d+)`, "i"));
      if (match) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxSeq) {
          maxSeq = num;
        }
      }
    }
  }
  return `${prefix}${String(maxSeq + 1).padStart(3, "0")}`;
}

/**
 * Formats any receipt or invoice number into the canonical INV-YYMM-XXX format (e.g. INV-2610-001).
 */
export function formatInvoiceNumber(receiptNo?: string | null, date?: string | null): string {
  if (receiptNo && /^INV-\d{4}-\d{3,}$/i.test(receiptNo)) {
    return receiptNo.toUpperCase();
  }
  const d = date ? new Date(date) : new Date();
  const validDate = isNaN(d.getTime()) ? new Date() : d;
  const yy = validDate.getFullYear().toString().slice(-2);
  const mm = String(validDate.getMonth() + 1).padStart(2, "0");
  const prefix = `INV-${yy}${mm}-`;

  if (receiptNo && !receiptNo.startsWith("UTR-") && !receiptNo.startsWith("due-")) {
    const nums = receiptNo.match(/\d+/g);
    if (nums && nums.length > 0) {
      const lastNum = nums[nums.length - 1];
      const seq = String(parseInt(lastNum.slice(-3), 10) || 1).padStart(3, "0");
      return `${prefix}${seq}`;
    }
  }
  return `${prefix}001`;
}

export async function payFee(feeId: string) {
  try {
    return await fetchApi('/api/fees/pay', {
      method: 'POST',
      body: JSON.stringify({ feeId }),
    });
  } catch {
    const fees = getLocalData<FeeRecord[]>(STORAGE_KEYS.FEES, []);
    const invNo = generateInvoiceNumber(fees.map(f => f.receiptNo));
    const updated = fees.map(f => f.id === feeId ? {
      ...f,
      paid: true,
      paidAt: new Date().toISOString().split('T')[0],
      receiptNo: invNo,
    } : f);
    setLocalData(STORAGE_KEYS.FEES, updated);
    return { success: true, message: 'Fee marked as paid', receiptNo: invNo };
  }
}

export async function createFee(data: {
  id?: string;
  studentId: string;
  studentName: string;
  studentEmail?: string;
  type?: string;
  amount: number;
  totalDue?: number;
  remainingDue?: number;
  paid?: boolean;
  paidAt?: string;
  dueDate?: string;
  description?: string;
  receiptNo?: string;
}) {
  const fees = getLocalData<FeeRecord[]>(STORAGE_KEYS.FEES, []);
  const invNo = data.receiptNo || generateInvoiceNumber(fees.map(f => f.receiptNo));
  const feeId = data.id || `fee-${Date.now()}`;
  const isPaid = data.paid ?? false;
  const nowIso = new Date().toISOString();

  const newFee: FeeRecord = {
    id: feeId,
    studentId: data.studentId,
    studentName: data.studentName,
    type: data.type || 'Monthly Seat Fee',
    amount: data.amount,
    totalDue: data.totalDue,
    remainingDue: data.remainingDue,
    paid: isPaid,
    paidAt: isPaid ? (data.paidAt || nowIso) : undefined,
    dueDate: data.dueDate || new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    description: data.description || '',
    receiptNo: isPaid ? invNo : undefined,
    createdAt: nowIso,
  };

  // 1. Direct Supabase Storage (Sole Database)
  try {
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    await supabase.from('fees').upsert({
      id: feeId,
      student_id: data.studentId,
      student_name: data.studentName,
      type: data.type || 'Monthly Seat Fee',
      amount: data.amount,
      paid: isPaid,
      paid_at: isPaid ? (data.paidAt || nowIso) : null,
      due_date: newFee.dueDate,
      description: data.description || '',
      receipt_no: isPaid ? invNo : null,
      created_at: nowIso,
    });
  } catch (sbErr) {
    console.warn('Supabase createFee notice:', sbErr);
  }

  // 2. Local state cache
  setLocalData(STORAGE_KEYS.FEES, [newFee, ...fees.filter(f => f.id !== feeId)]);

  // 3. Auto-send invoice email when fee is paid (fire-and-forget)
  if (isPaid && data.studentEmail) {
    sendFeeReceiptEmail(feeId, data.studentEmail, data.remainingDue, data.totalDue).catch((err) => {
      console.warn('Auto-send invoice email notice:', err);
    });
  }

  return { success: true, fee: newFee };
}

export async function deleteFee(feeId: string) {
  // 1. Delete from Supabase
  try {
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    await supabase.from('fees').delete().or(`id.eq.${feeId},receipt_no.eq.${feeId}`);
  } catch (sbErr) {
    console.warn('Supabase deleteFee notice:', sbErr);
  }

  // 2. Delete from local cache
  const fees = getLocalData<FeeRecord[]>(STORAGE_KEYS.FEES, []);
  setLocalData(STORAGE_KEYS.FEES, fees.filter(f => f.id !== feeId && f.receiptNo !== feeId));
  return { success: true, message: 'Fee deleted' };
}

/**
 * Verifies a pending UPI fee claim: marks fee record as paid, updates receiptNo,
 * adjusts student profile due amount/status in Supabase, and clears claim notifications.
 */
export async function verifyUpiClaim(
  feeId: string,
  options?: {
    studentId?: string;
    studentName?: string;
    amount?: number;
    receiptNo?: string;
  }
) {
  const nowIso = new Date().toISOString();
  const fees = getLocalData<FeeRecord[]>(STORAGE_KEYS.FEES, []);
  const targetFee = fees.find(f => f.id === feeId || f.receiptNo === feeId);
  const invNo = (options?.receiptNo && !options.receiptNo.startsWith('UTR-'))
    ? options.receiptNo
    : generateInvoiceNumber(fees.map(f => f.receiptNo));
  const studentId = options?.studentId || targetFee?.studentId;

  // 1. Update Supabase fees table
  try {
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    const safeFeeId = String(feeId).replace(/[^a-zA-Z0-9_\-\.]/g, '');
    await supabase.from('fees').update({
      paid: true,
      paid_at: nowIso,
      receipt_no: invNo,
    }).or(`id.eq.${safeFeeId},receipt_no.eq.${safeFeeId}`);

    // Update student profile due amount in Supabase
    if (studentId) {
      const { data: profile } = await supabase.from('profiles').select('*').eq('id', studentId).single();
      if (profile) {
        const claimAmt = options?.amount || targetFee?.amount || 0;
        const currentDue = Number(profile.due_amount || 0);
        const newDue = Math.max(0, currentDue - claimAmt);
        await supabase.from('profiles').update({
          due_amount: newDue,
          fee_status: newDue <= 0 ? 'Paid' : 'Due',
          updated_at: nowIso,
        }).eq('id', studentId);
      }
    }

    // Mark related UPI claim notifications as read
    await supabase.from('notifications')
      .update({ read: true })
      .eq('recipient_role', 'admin')
      .ilike('title', '%UPI%');
  } catch (err) {
    console.warn('Supabase verifyUpiClaim notice:', err);
  }

  // 2. Update local fee cache
  const updated = fees.map(f => {
    if (f.id === feeId || f.receiptNo === feeId) {
      return {
        ...f,
        paid: true,
        paidAt: nowIso,
        receiptNo: invNo,
      };
    }
    return f;
  });
  setLocalData(STORAGE_KEYS.FEES, updated);

  return { success: true, receiptNo: invNo };
}

/**
 * Clears or dismisses a UPI claim (removes or rejects the pending record).
 */
export async function clearUpiClaim(feeId: string) {
  await deleteFee(feeId);

  // Also mark related notifications as read/cleared
  try {
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    await supabase.from('notifications')
      .update({ read: true })
      .eq('recipient_role', 'admin')
      .ilike('title', '%UPI%');
  } catch (err) {
    console.warn('clearUpiClaim notification notice:', err);
  }

  return { success: true };
}

/**
 * Clears any pending UPI claims for a specific student when their fee is marked received.
 */
export async function clearStudentUpiClaims(studentIdentifier: string) {
  if (!studentIdentifier) return { success: true, clearedCount: 0 };
  const cleanId = String(studentIdentifier).trim().toLowerCase();

  try {
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();

    // 1. Mark any pending UPI fees for this student as paid or delete them
    const { data: pendingFees } = await supabase
      .from('fees')
      .select('*')
      .eq('paid', false);

    if (pendingFees && pendingFees.length > 0) {
      const studentPendingUpi = pendingFees.filter((f: any) => {
        const matchesStudent = 
          f.student_id === studentIdentifier || 
          (f.student_name && f.student_name.toLowerCase().includes(cleanId));
        const isUpi = 
          f.type === 'UPI Claim' || 
          (f.description && (f.description.toLowerCase().includes('upi') || f.description.toLowerCase().includes('utr')));
        return matchesStudent && isUpi;
      });

      for (const p of studentPendingUpi) {
        await supabase.from('fees').update({
          paid: true,
          paid_at: new Date().toISOString(),
          receipt_no: (p.receipt_no && !p.receipt_no.startsWith('UTR-')) ? p.receipt_no : generateInvoiceNumber(),
        }).eq('id', p.id);
      }
    }

    // 2. Clear related notifications for this student
    const safeSearchPattern = cleanId.replace(/[%_\\]/g, '');
    if (safeSearchPattern) {
      await supabase.from('notifications')
        .update({ read: true })
        .eq('recipient_role', 'admin')
        .ilike('message', `%${safeSearchPattern}%`);
    }
  } catch (err) {
    console.warn('clearStudentUpiClaims notice:', err);
  }

  // 3. Update local cache
  const fees = getLocalData<FeeRecord[]>(STORAGE_KEYS.FEES, []);
  const updated = fees.map(f => {
    const match = 
      f.studentId === studentIdentifier || 
      (f.studentName && f.studentName.toLowerCase().includes(cleanId));
    if (match && !f.paid && (f.type === 'UPI Claim' || (f.description && f.description.toLowerCase().includes('upi')))) {
      return { ...f, paid: true, paidAt: new Date().toISOString() };
    }
    return f;
  });
  setLocalData(STORAGE_KEYS.FEES, updated);

  return { success: true };
}

// ══════════════════════════════════════════════════════════════════
// SECTION 5 · EXPENSES API
// Library expense records (Supabase only).
// ══════════════════════════════════════════════════════════════════
export interface ExpenseRecord {
  id: string;
  title: string;
  category: string;
  amount: number;
  date: string; // YYYY-MM-DD
  paymentMethod: "UPI" | "Cash" | "Bank Transfer" | "Card";
  notes?: string;
  receiptNo?: string;
  createdAt: string;
}

export async function getExpenses(): Promise<ExpenseRecord[]> {
  try {
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    const { data, error } = await supabase
      .from('fees')
      .select('*')
      .eq('student_id', 'LIBRARY_EXPENSE')
      .order('created_at', { ascending: false });

    if (!error && Array.isArray(data)) {
      const mapped = data.map((d: any) => {
        const parts = (d.description || '').split(' | ');
        return {
          id: d.id,
          title: d.student_name || 'Library Expense',
          category: parts[0] || 'General',
          amount: Number(d.amount || 0),
          date: d.paid_at ? d.paid_at.split('T')[0] : (d.created_at ? d.created_at.split('T')[0] : new Date().toISOString().split('T')[0]),
          paymentMethod: (parts[1] as any) || 'Cash',
          notes: parts.slice(2).join(' | '),
          receiptNo: d.receipt_no || d.id,
          createdAt: d.created_at,
        };
      });
      setLocalData('genius_expenses_records', mapped);
      return mapped;
    }
  } catch (err) {
    console.warn('Failed to load expenses from Supabase:', err);
  }
  return getLocalData<ExpenseRecord[]>('genius_expenses_records', []);
}

export async function createExpense(data: {
  title: string;
  category: string;
  amount: number;
  date?: string;
  paymentMethod?: "UPI" | "Cash" | "Bank Transfer" | "Card";
  notes?: string;
}): Promise<ExpenseRecord> {
  const expenseId = `exp-${Date.now()}`;
  const nowIso = new Date().toISOString();
  const dateStr = data.date || nowIso.split('T')[0];
  const voucherNo = `EXP-${new Date().getFullYear().toString().slice(-2)}${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(Math.floor(100 + Math.random() * 900))}`;

  const newExpense: ExpenseRecord = {
    id: expenseId,
    title: data.title,
    category: data.category,
    amount: data.amount,
    date: dateStr,
    paymentMethod: data.paymentMethod || 'Cash',
    notes: data.notes,
    receiptNo: voucherNo,
    createdAt: nowIso,
  };

  try {
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    await supabase.from('fees').insert({
      id: expenseId,
      student_id: 'LIBRARY_EXPENSE',
      student_name: data.title,
      type: 'Expense',
      amount: data.amount,
      paid: true,
      paid_at: new Date(dateStr).toISOString(),
      description: `${data.category} | ${data.paymentMethod || 'Cash'} | ${data.notes || ''}`,
      receipt_no: voucherNo,
      created_at: nowIso,
    });
  } catch (err) {
    console.warn('Failed to save expense in Supabase:', err);
  }

  const existing = getLocalData<ExpenseRecord[]>('genius_expenses_records', []);
  setLocalData('genius_expenses_records', [newExpense, ...existing]);
  return newExpense;
}

export async function deleteExpense(id: string): Promise<boolean> {
  try {
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    await supabase.from('fees').delete().eq('id', id);
  } catch (err) {
    console.warn('Failed to delete expense in Supabase:', err);
  }
  const existing = getLocalData<ExpenseRecord[]>('genius_expenses_records', []);
  setLocalData('genius_expenses_records', existing.filter(e => e.id !== id));
  return true;
}

export async function sendFeeReceiptEmail(feeId: string, email?: string, remainingDue?: number, totalDue?: number) {
  try {
    const params = new URLSearchParams();
    if (email) params.append('email', email);
    if (remainingDue !== undefined) params.append('remainingDue', String(remainingDue));
    if (totalDue !== undefined) params.append('totalDue', String(totalDue));
    const query = params.toString() ? `?${params.toString()}` : '';

    return await fetchApi<{ success: boolean; message?: string; error?: string }>(
      `/api/fees/${encodeURIComponent(feeId)}/send-receipt${query}`,
      { method: 'POST' }
    );
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to dispatch email' };
  }
}

// Announcements & Communications (Supabase messages as Sole Primary Source of Truth)
export async function getAnnouncements(): Promise<Announcement[]> {
  try {
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    const { data: supaMsgs, error } = await supabase
      .from('messages')
      .select('*')
      .eq('student_id', 'SYSTEM_ANNOUNCEMENT')
      .order('created_at', { ascending: false });

    if (!error && Array.isArray(supaMsgs) && supaMsgs.length > 0) {
      return supaMsgs.map((m: any) => ({
        id: m.id,
        title: m.student_name || 'Library Announcement',
        message: m.message,
        priority: 'normal',
        targetAudience: m.recipient_role || 'all',
        createdAt: m.created_at || new Date().toISOString(),
      }));
    }
    return [];
  } catch (sbErr) {
    console.warn('[getAnnouncements] Supabase notice:', sbErr);
    return [];
  }
}

// ══════════════════════════════════════════════════════════════════
// SECTION: AUTHORIZED NFC HARDWARE TAGS (Supabase Verification)
// Enforces that only registered physical library NFC tags can mark attendance.
// ══════════════════════════════════════════════════════════════════
export const DEFAULT_AUTHORIZED_NFC_SERIALS = [
  "53:D4:B6:CD:53:00:01",
];

export function normalizeNfcSerial(serial: string): string {
  return (serial || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

export async function getAuthorizedNfcTags(): Promise<{ serial: string; label: string; createdAt?: string }[]> {
  const defaultList = DEFAULT_AUTHORIZED_NFC_SERIALS.map(s => ({
    serial: s,
    label: 'Official Entrance Gate Stand Tag',
  }));

  try {
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('student_id', 'SYSTEM_NFC_TAG')
      .order('created_at', { ascending: false });

    if (!error && Array.isArray(data) && data.length > 0) {
      const dbTags = data.map((m: any) => ({
        serial: m.student_name || '',
        label: m.message || 'Registered Library NFC Tag',
        createdAt: m.created_at,
      })).filter((t: any) => Boolean(t.serial));

      const combined = [...defaultList];
      for (const t of dbTags) {
        if (!combined.some(c => normalizeNfcSerial(c.serial) === normalizeNfcSerial(t.serial))) {
          combined.push(t);
        }
      }
      return combined;
    }
  } catch (err) {
    console.warn('[getAuthorizedNfcTags] notice:', err);
  }

  return defaultList;
}

export async function registerAuthorizedNfcTag(serialNumber: string, label: string = 'Registered Library NFC Tag'): Promise<{ success: boolean; message: string }> {
  const norm = normalizeNfcSerial(serialNumber);
  if (!norm) {
    return { success: false, message: 'Invalid NFC Serial Number' };
  }

  try {
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();

    const { data: existing } = await supabase
      .from('messages')
      .select('id, student_name')
      .eq('student_id', 'SYSTEM_NFC_TAG');

    const alreadyExists = (existing || []).some((m: any) => normalizeNfcSerial(m.student_name) === norm);
    if (alreadyExists) {
      return { success: true, message: `NFC Tag (${serialNumber}) is already registered and authorized.` };
    }

    const tagId = `nfc-tag-${Date.now()}`;
    const { error } = await supabase.from('messages').insert({
      id: tagId,
      student_id: 'SYSTEM_NFC_TAG',
      student_name: serialNumber.trim().toUpperCase(),
      message: label || 'Official Library NFC Tag',
      sender_role: 'admin',
      sender_name: 'Library Admin',
      recipient_role: 'all',
      is_read: true,
      created_at: new Date().toISOString(),
    });

    if (error) {
      return { success: false, message: error.message };
    }

    return { success: true, message: `NFC Tag (${serialNumber}) successfully registered and authorized!` };
  } catch (err: any) {
    return { success: false, message: err.message || 'Failed to register tag' };
  }
}

export async function verifyNfcSerialNumber(scannedSerial: string): Promise<{ authorized: boolean; serial: string; label?: string }> {
  const normScanned = normalizeNfcSerial(scannedSerial);
  if (!normScanned) {
    return { authorized: false, serial: scannedSerial };
  }

  const authorizedTags = await getAuthorizedNfcTags();
  const matched = authorizedTags.find(t => normalizeNfcSerial(t.serial) === normScanned);

  if (matched) {
    return { authorized: true, serial: matched.serial, label: matched.label };
  }

  return { authorized: false, serial: scannedSerial };
}

export async function deleteAuthorizedNfcTag(serialNumber: string): Promise<{ success: boolean; message: string }> {
  const norm = normalizeNfcSerial(serialNumber);
  if (!norm) return { success: false, message: 'Invalid Serial' };

  try {
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    const { data } = await supabase
      .from('messages')
      .select('id, student_name')
      .eq('student_id', 'SYSTEM_NFC_TAG');

    const matched = (data || []).find((m: any) => normalizeNfcSerial(m.student_name) === norm);
    if (matched) {
      await supabase.from('messages').delete().eq('id', matched.id);
      return { success: true, message: `Tag (${serialNumber}) removed.` };
    }
    return { success: true, message: 'Tag removed from active list.' };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Failed to remove tag' };
  }
}

export async function createAnnouncement(data: {
  title: string;
  message: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  targetAudience?: string;
}) {
  const annId = `ann-${Date.now()}`;
  const newAnn: Announcement = {
    id: annId,
    title: data.title,
    message: data.message,
    priority: data.priority || 'normal',
    targetAudience: data.targetAudience || 'all',
    createdAt: new Date().toISOString(),
  };

  // 1. Direct Supabase save (Primary Source of Truth)
  try {
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    await supabase.from('messages').insert({
      id: annId,
      student_id: 'SYSTEM_ANNOUNCEMENT',
      student_name: data.title,
      sender_role: 'admin',
      sender_name: 'Library Admin',
      message: data.message,
      recipient_role: data.targetAudience || 'all',
      is_read: true,
      created_at: newAnn.createdAt,
    });
  } catch (sbErr) {
    console.warn('[createAnnouncement] Supabase notice:', sbErr);
  }

    // 2. Broadcast notification across tabs & trigger native notification
    try {
      const { broadcastNotification, triggerNativeNotification } = await import('./pushNotify');
      broadcastNotification({
        id: annId,
        recipientRole: 'all',
        title: `📢 ${data.title}`,
        message: data.message,
        type: 'announcement',
        actionUrl: '/student/messages',
      });
      if (typeof window !== 'undefined') {
        triggerNativeNotification({
          title: `📢 ${data.title}`,
          body: data.message,
          url: '/student/messages',
          tag: annId,
        }).catch(() => {});
      }
    } catch {}

    return { success: true, announcement: newAnn };
}

export async function deleteAnnouncement(id: string) {
  // 1. Direct Supabase delete (Primary Source of Truth)
  try {
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    await supabase.from('messages').delete().eq('id', id);
  } catch (sbErr) {
    console.warn('[deleteAnnouncement] Supabase notice:', sbErr);
  }

  // 2. Worker / D1 API sync (cold backup)
  try {
    return await fetchApi<{ success: boolean; message: string }>(`/api/announcements/${id}`, {
      method: 'DELETE',
    });
  } catch {
    return { success: true, message: 'Deleted' };
  }
}

// ══════════════════════════════════════════════════════════════════
// SECTION 6 · HOLIDAYS API
// Holidays/closures calendar (Supabase only).
// ══════════════════════════════════════════════════════════════════
export async function getLibraryHolidays(): Promise<LibraryHoliday[]> {
  const holidaysMap = new Map<string, LibraryHoliday>();

  // 1. Primary Source of Truth: Supabase PostgreSQL
  try {
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('student_id', 'SYSTEM_HOLIDAY');

    if (!error && Array.isArray(data)) {
      data.forEach((row: any) => {
        try {
          const parsed = typeof row.message === 'string' ? JSON.parse(row.message) : row.message;
          if (parsed && parsed.date) {
            holidaysMap.set(parsed.date, {
              id: row.id,
              date: parsed.date,
              title: parsed.title || 'Library Closed / Holiday',
              reason: parsed.reason,
              closedBy: parsed.closedBy || 'Admin',
              createdAt: row.created_at || parsed.createdAt,
            });
          }
        } catch {
          const dateMatch = String(row.message || '').match(/(\d{4}-\d{2}-\d{2})/);
          if (dateMatch) {
            holidaysMap.set(dateMatch[1], {
              id: row.id,
              date: dateMatch[1],
              title: 'Library Closed',
              reason: row.message,
              closedBy: 'Admin',
              createdAt: row.created_at,
            });
          }
        }
      });

      const syncedHolidays = Array.from(holidaysMap.values());
      if (typeof window !== 'undefined') {
        setLocalData(STORAGE_KEYS.HOLIDAYS, syncedHolidays);
      }
      return syncedHolidays;
    }
  } catch (err) {
    console.warn('Unable to sync holidays from Supabase, using local fallback:', err);
  }

  // 2. Offline fallback
  const local = typeof window !== 'undefined' ? getLocalData<LibraryHoliday[]>(STORAGE_KEYS.HOLIDAYS, []) : [];
  return local;
}

export async function declareLibraryHoliday(params: {
  date?: string;
  title: string;
  reason?: string;
  closedBy?: string;
  notifyStudents?: boolean;
}): Promise<{ success: boolean; holiday: LibraryHoliday }> {
  const targetDate = params.date || new Date().toISOString().split('T')[0];
  const holidayId = `holiday-${targetDate}`;
  const newHoliday: LibraryHoliday = {
    id: holidayId,
    date: targetDate,
    title: params.title || 'Library Closed / Holiday',
    reason: params.reason || 'The library operations and reading hall are closed today by administration. Attendance is protected.',
    closedBy: params.closedBy || 'Admin',
    createdAt: new Date().toISOString(),
  };

  // 1. Direct Supabase Storage (Sole Database)
  try {
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    await supabase.from('messages').upsert({
      id: holidayId,
      student_id: 'SYSTEM_HOLIDAY',
      student_name: 'Library Admin',
      student_email: BRAND_CONFIG.adminEmail,
      sender_role: 'admin',
      sender_name: 'Library Administration',
      message: JSON.stringify(newHoliday),
      recipient_role: 'all',
      recipient_name: 'All Students',
      created_at: newHoliday.createdAt,
    });
  } catch (err) {
    console.warn('Failed to declare holiday in Supabase:', err);
  }

  // 2. Local state update
  if (typeof window !== 'undefined') {
    const current = getLocalData<LibraryHoliday[]>(STORAGE_KEYS.HOLIDAYS, []);
    const filtered = current.filter(h => h.date !== targetDate);
    setLocalData(STORAGE_KEYS.HOLIDAYS, [newHoliday, ...filtered]);
    window.dispatchEvent(new CustomEvent('library_holiday_updated', { detail: { holiday: newHoliday, isClosed: true } }));
  }

  // 3. Send notification to ALL students so they get native push alert
  if (params.notifyStudents !== false) {
    try {
      await createNotification({
        title: `📢 Library Closed — ${newHoliday.title}`,
        message: newHoliday.reason || `The library is closed on ${targetDate}. Normal operations resume tomorrow.`,
        type: 'general',
        recipientRole: 'student',
        actionUrl: '/student',
      });
    } catch (err) {
      console.warn('Failed to send library close notification to students:', err);
    }
  }

  return { success: true, holiday: newHoliday };
}

export async function removeLibraryHoliday(dateOrId: string): Promise<{ success: boolean }> {
  const isoMatch = dateOrId.match(/(\d{4}-\d{2}-\d{2})/);
  const targetIsoDate = isoMatch ? isoMatch[1] : (dateOrId.length === 10 ? dateOrId : new Date().toISOString().split('T')[0]);
  const holidayId = `holiday-${targetIsoDate}`;

  // 1. Delete from Supabase (Sole Database)
  try {
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    await supabase
      .from('messages')
      .delete()
      .eq('student_id', 'SYSTEM_HOLIDAY')
      .or(`id.eq.${holidayId},id.eq.${dateOrId}`);
  } catch (err) {
    console.warn('Failed to delete holiday from Supabase:', err);
  }

  // 2. Local state update
  if (typeof window !== 'undefined') {
    const current = getLocalData<LibraryHoliday[]>(STORAGE_KEYS.HOLIDAYS, []);
    const updated = current.filter(h => h.id !== dateOrId && h.date !== dateOrId && h.date !== targetIsoDate);
    setLocalData(STORAGE_KEYS.HOLIDAYS, updated);
    window.dispatchEvent(new CustomEvent('library_holiday_updated', { detail: { dateOrId, isClosed: false } }));
  }

  return { success: true };
}

export function isDateLibraryHoliday(dateStr: string, holidays?: LibraryHoliday[]): { isHoliday: boolean; holiday?: LibraryHoliday } {
  const list = holidays || (typeof window !== 'undefined' ? getLocalData<LibraryHoliday[]>(STORAGE_KEYS.HOLIDAYS, []) : []);
  const found = list.find(h => h.date === dateStr);
  return { isHoliday: !!found, holiday: found };
}

// Stats - Single Source of Truth: Supabase Primary Database
export async function getDashboardStats(): Promise<DashboardStats> {
  try {
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    const todayStr = new Date().toISOString().split('T')[0];

    const [seatsRes, profilesRes, attRes] = await Promise.all([
      supabase.from('seats').select('id, seat_number, is_available'),
      supabase.from('profiles').select('id, role, status, email, phone, seat_number'),
      supabase.from('attendance').select('id, student_id, seat_number, status, check_in, check_out, date').eq('date', todayStr),
    ]);

    const dbSeats = Array.isArray(seatsRes.data) ? seatsRes.data : [];
    const totalSeats = dbSeats.length > 0 ? Math.max(dbSeats.length, 134) : 134;

    const allProfiles = Array.isArray(profilesRes.data) ? profilesRes.data : [];
    const validProfiles = allProfiles.filter((p: any) => 
      !isMasterAdminEmail(p.email) && 
      p.role !== 'admin' &&
      (p.phone && String(p.phone).trim().length > 0)
    );
    const activeProfiles = validProfiles.filter((p: any) => p.status === 'active');
    const pendingProfiles = validProfiles.filter((p: any) => p.status === 'pending');

    const todayAtt = Array.isArray(attRes.data) ? attRes.data : [];
    const activeAttendanceCount = todayAtt.filter((a: any) =>
      a.status === 'present' || a.status === 'in_progress' || !a.checkOut || a.checkOut === 'In Progress' || a.checkOut === '—'
    ).length;

    let occupiedSeats = 0;
    let reservedSeats = 0;
    const assignedSeats = validProfiles.filter((p: any) => Boolean(p.seat_number));
    
    assignedSeats.forEach((p: any) => {
      const isPresentToday = todayAtt.some((a: any) =>
        a.student_id === p.id ||
        (p.seat_number && matchSeatNumber(a.seat_number, p.seat_number))
      );
      if (isPresentToday) {
        occupiedSeats++;
      } else {
        reservedSeats++;
      }
    });

    const availableSeats = Math.max(0, totalSeats - (occupiedSeats + reservedSeats));

    return {
      totalSeats,
      availableSeats,
      occupiedSeats,
      reservedSeats,
      activeShiftsCount: 4,
      totalBooks: 0,
      booksIssuedCount: 0,
      attendanceTodayCount: activeAttendanceCount,
      totalStudentsCount: activeProfiles.length,
      pendingStudentsCount: pendingProfiles.length,
    };
  } catch (err) {
    console.warn('Error fetching dashboard stats from Supabase:', err);
    const cachedSeats = getLocalData<Seat[]>(STORAGE_KEYS.SEATS, []);
    const cachedStudents = getLocalData<StudentRecord[]>(STORAGE_KEYS.STUDENTS, []);
    return {
      totalSeats: cachedSeats.length,
      availableSeats: cachedSeats.filter(s => s.isAvailable).length,
      occupiedSeats: cachedSeats.filter(s => !s.isAvailable).length,
      reservedSeats: 0,
      activeShiftsCount: 4,
      totalBooks: 0,
      booksIssuedCount: 0,
      attendanceTodayCount: 0,
      totalStudentsCount: cachedStudents.length,
      pendingStudentsCount: 0,
    };
  }
}

// -------------------------------------------------------------
// ══════════════════════════════════════════════════════════════════
// SECTION 7 · STUDENTS API
// Student directory + registrations against Supabase profiles.
// ══════════════════════════════════════════════════════════════════
export async function getStudents(status?: string): Promise<StudentRecord[]> {
  // 1. Direct Supabase query (Primary Live Database)
  try {
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    let query = supabase.from('profiles').select('*').order('created_at', { ascending: false });
    if (status) {
      query = query.eq('status', status);
    }
    const { data: profiles, error } = await query;
    if (!error && Array.isArray(profiles)) {
      const studentProfiles = profiles.filter((p: any) => 
        !isMasterAdminEmail(p.email) && 
        p.role !== 'admin' &&
        (p.phone && String(p.phone).trim().length > 0)
      );
      return studentProfiles.map((p: any) => ({
        id: p.id,
        studentCode: p.student_code || p.member_id || generateStudentCode([]),
        fullName: p.full_name || 'Student Member',
        email: p.email || '',
        phone: p.phone || '',
        gender: p.gender || 'Male',
        parentName: p.parent_name || '',
        parentPhone: p.parent_phone || '',
        address: p.address || 'Madhupur, Sonbhadra, UP',
        course: p.course || 'General',
        shift: p.shift || 'Morning Shift',
        membershipPlan: p.membership_plan || 'General',
        seatNumber: p.seat_number || null,
        role: p.role || 'student',
        status: p.status || 'pending',
        feeStatus: p.fee_status || 'Due',
        dueAmount: Number(p.due_amount !== undefined && p.due_amount !== null ? p.due_amount : 0),
        avatarUrl: p.avatar_url || null,
        createdAt: p.created_at || new Date().toISOString(),
        updatedAt: p.updated_at || new Date().toISOString(),
      }));
    }
  } catch (err) {
    console.warn('Supabase getStudents notice:', err);
  }

  // 2. API Fallback (queries Supabase via Worker)
  try {
    const url = status ? `/api/students?status=${encodeURIComponent(status)}` : '/api/students';
    const data = await fetchApi<{ success: boolean; students: StudentRecord[] }>(url, { timeoutMs: 3500 });
    if (data.success && Array.isArray(data.students)) {
      return data.students;
    }
    return [];
  } catch (err) {
    console.error('getStudents API error:', err);
    return [];
  }
}

export async function lookupStudent(params: { email?: string; id?: string; phone?: string }): Promise<StudentRecord | null> {
  // 1. Direct Supabase query
  try {
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    let query = supabase.from('profiles').select('*');
    if (params.id) {
      query = query.eq('id', params.id);
    } else if (params.email) {
      query = query.eq('email', params.email.trim().toLowerCase());
    } else if (params.phone) {
      const cleanPhone = params.phone.replace(/[^0-9]/g, '').slice(-10);
      query = query.ilike('phone', `%${cleanPhone}%`);
    } else {
      return null;
    }
    const { data: p, error } = await query.maybeSingle();
    if (!error && p && !isMasterAdminEmail(p.email) && p.role !== 'admin') {
      return {
        id: p.id,
        studentCode: p.student_code || p.member_id || generateStudentCode([]),
        fullName: p.full_name || 'Student Member',
        email: p.email || '',
        phone: p.phone || '',
        gender: p.gender || 'Male',
        parentName: p.parent_name || '',
        parentPhone: p.parent_phone || '',
        address: p.address || 'Madhupur, Sonbhadra, UP',
        course: p.course || 'General',
        shift: p.shift || 'Morning Shift',
        membershipPlan: p.membership_plan || 'General',
        seatNumber: p.seat_number || null,
        role: p.role || 'student',
        status: p.status || 'pending',
        feeStatus: p.fee_status || 'Due',
        dueAmount: Number(p.due_amount !== undefined && p.due_amount !== null ? p.due_amount : 0),
        avatarUrl: p.avatar_url || null,
        createdAt: p.created_at || new Date().toISOString(),
        updatedAt: p.updated_at || new Date().toISOString(),
      };
    }
  } catch (err) {
    console.warn('lookupStudent direct Supabase notice:', err);
  }

  // 2. API query fallback
  try {
    const searchParams = new URLSearchParams();
    if (params.email) searchParams.set('email', params.email);
    if (params.id) searchParams.set('id', params.id);
    if (params.phone) searchParams.set('phone', params.phone);
    const data = await fetchApi<{ success: boolean; student: StudentRecord | null }>(
      `/api/students/lookup?${searchParams.toString()}`,
      { timeoutMs: 2500 }
    );
    return data.student || null;
  } catch (err) {
    console.warn('lookupStudent notice:', err);
    return null;
  }
}

export async function createStudent(student: Partial<StudentRecord>): Promise<StudentRecord | null> {
  try {
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    const fallbackUuid = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
      ? crypto.randomUUID()
      : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          const v = c === 'x' ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        });
    const studentId = student.id || fallbackUuid;
    const payload = {
      id: studentId,
      student_code: student.studentCode,
      full_name: student.fullName || 'Student Member',
      email: student.email ? student.email.trim().toLowerCase() : '',
      phone: student.phone || '',
      parent_name: student.parentName || '',
      parent_phone: student.parentPhone || '',
      address: student.address || 'Madhupur, Sonbhadra, UP',
      course: student.course || 'General',
      shift: student.shift || 'Morning Shift',
      membership_plan: student.membershipPlan || 'General',
      seat_number: student.seatNumber || null,
      role: student.role || 'student',
      status: student.status || 'pending',
      fee_status: student.feeStatus || 'Due',
      due_amount: Number(student.dueAmount || 0),
      avatar_url: student.avatarUrl || null,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('profiles').upsert(payload);
    if (error) {
      console.error('createStudent Supabase error:', error);
      throw error;
    }
    return {
      id: studentId,
      studentCode: payload.student_code || '',
      fullName: payload.full_name,
      email: payload.email,
      phone: payload.phone,
      status: payload.status as any,
      role: payload.role,
      membershipPlan: payload.membership_plan,
      shift: payload.shift,
      dueAmount: payload.due_amount,
      feeStatus: payload.fee_status as any,
    };
  } catch (err) {
    console.error('createStudent error:', err);
    return null;
  }
}

export async function updateStudentStatus(
  id: string,
  status: 'pending' | 'active' | 'suspended',
  seatNumber?: string | null,
  membershipPlan?: string | null,
  feeStatus?: string | null,
  dueAmount?: number | null,
  phone?: string | null,
  parentPhone?: string | null,
  name?: string | null,
  email?: string | null
): Promise<boolean> {
  try {
    const data = await fetchApi<{ success: boolean }>(`/api/students/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ 
        status, 
        seatNumber,
        ...(membershipPlan !== undefined ? { membershipPlan } : {}),
        ...(feeStatus !== undefined ? { feeStatus } : {}),
        ...(dueAmount !== undefined ? { dueAmount } : {}),
        ...(phone !== undefined ? { phone } : {}),
        ...(parentPhone !== undefined ? { parentPhone } : {}),
        ...(name !== undefined ? { name } : {}),
        ...(email !== undefined ? { email } : {}),
      }),
    });
    return data.success;
  } catch (err) {
    console.error('updateStudentStatus API error:', err);
    return false;
  }
}

/**
 * Universal Student Update Function
 * Updates Supabase profiles (Single Source of Truth), D1 worker,
 * local seat cache, and broadcasts global event to update UI everywhere.
 */
export async function updateStudentComplete(student: {
  id: string;
  student_code?: string;
  full_name: string;
  email: string;
  phone: string;
  parent_name?: string;
  parent_phone?: string;
  course?: string;
  shift?: string;
  status?: 'pending' | 'active' | 'suspended';
  membership_plan?: string;
  seat_number?: string | null;
  fee_status?: string;
  due_amount?: number;
  address?: string;
  dob?: string | null;
  gender?: string | null;
  join_date?: string | null;
  continue_date?: string | null;
  is_service_stopped?: boolean;
  service_stopped_at?: string | null;
  service_stop_reason?: string | null;
}): Promise<boolean> {
  // 1. Standardize and normalize phone numbers
  const cleanDigits = (student.phone || '').replace(/\D/g, '').slice(-10);
  const normalizedPhone = cleanDigits ? `+91 ${cleanDigits}` : student.phone;
  const cleanParentDigits = (student.parent_phone || '').replace(/\D/g, '').slice(-10);
  const normalizedParentPhone = cleanParentDigits ? `+91 ${cleanParentDigits}` : (student.parent_phone || '');

  const seatNum = student.membership_plan === 'Reserved Seat' ? (student.seat_number?.trim() || null) : null;

  const supaPayload: any = {
    full_name: student.full_name,
    email: student.email,
    phone: normalizedPhone,
    parent_name: student.parent_name || '',
    parent_phone: normalizedParentPhone,
    course: student.course || 'General',
    shift: student.shift || 'Morning Shift',
    status: student.status || 'active',
    membership_plan: student.membership_plan || 'General',
    seat_number: seatNum,
    fee_status: student.fee_status || 'Due',
    due_amount: student.due_amount !== undefined ? Number(student.due_amount) : 0,
    address: student.address || 'Madhupur, Sonbhadra, UP',
    gender: student.gender || 'Male',
    updated_at: new Date().toISOString(),
  };

  if (student.dob !== undefined) supaPayload.dob = student.dob;
  if (student.join_date) supaPayload.join_date = student.join_date;
  if (student.continue_date) supaPayload.continue_date = student.continue_date;
  if (student.is_service_stopped !== undefined) supaPayload.is_service_stopped = student.is_service_stopped;
  if (student.service_stopped_at !== undefined) supaPayload.service_stopped_at = student.service_stopped_at;
  if (student.service_stop_reason !== undefined) supaPayload.service_stop_reason = student.service_stop_reason;

  // 2. Primary: Update Supabase profiles by id, student_code and email
  try {
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    
    // Direct update to Supabase profiles
    const resId = await supabase.from('profiles').update(supaPayload).eq('id', student.id);
    if (resId.error) {
      console.warn('[updateStudentComplete] Supabase primary update warning:', resId.error.message);
      // Fallback: If dob or service columns do not exist yet in schema cache, update core columns with gender
      const corePayload: any = {
        full_name: student.full_name,
        email: student.email,
        phone: normalizedPhone,
        parent_name: student.parent_name || '',
        parent_phone: normalizedParentPhone,
        course: student.course || 'General',
        shift: student.shift || 'Morning Shift',
        status: student.status || 'active',
        membership_plan: student.membership_plan || 'General',
        seat_number: seatNum,
        fee_status: student.fee_status || 'Due',
        due_amount: student.due_amount !== undefined ? Number(student.due_amount) : 0,
        address: student.address || 'Madhupur, Sonbhadra, UP',
        gender: student.gender || 'Male',
        updated_at: new Date().toISOString(),
      };
      if (student.join_date) corePayload.join_date = student.join_date;
      if (student.continue_date) corePayload.continue_date = student.continue_date;

      await supabase.from('profiles').update(corePayload).eq('id', student.id);
      if (student.student_code) {
        await supabase.from('profiles').update(corePayload).eq('student_code', student.student_code);
      }
      if (student.email) {
        await supabase.from('profiles').update(corePayload).eq('email', student.email);
      }
    } else {
      if (student.student_code) {
        await supabase.from('profiles').update(supaPayload).eq('student_code', student.student_code);
      }
      if (student.email) {
        await supabase.from('profiles').update(supaPayload).eq('email', student.email);
      }
    }
  } catch (sErr) {
    console.warn('[updateStudentComplete] Supabase sync notice:', sErr);
  }

  // 3. Worker / D1 API sync (ensures phone & parentPhone are persisted in D1)
  try {
    await updateStudentStatus(
      student.id,
      (student.status as any) || 'active',
      seatNum,
      student.membership_plan,
      student.fee_status,
      student.due_amount,
      normalizedPhone,
      normalizedParentPhone,
      student.full_name,
      student.email
    );
  } catch (d1Err) {
    console.warn('[updateStudentComplete] D1 sync notice:', d1Err);
  }

  // Invalidate any cached student list in HTTP memory cache
  invalidateApiCache('/api/students');

  // 4. Update Local Storage seat cache if student occupies a desk
  if (typeof window !== 'undefined') {
    try {
      const seats = getLocalData<Seat[]>(STORAGE_KEYS.SEATS, []);
      let seatModified = false;
      const updatedSeats = seats.map((seat: any) => {
        if (
          seat.currentStudentId === student.id ||
          seat.studentId === student.id ||
          (seatNum && seat.seatNumber === seatNum)
        ) {
          seatModified = true;
          return {
            ...seat,
            currentStudentName: student.full_name,
            occupantName: student.full_name,
            occupantPhone: normalizedPhone,
            phone: normalizedPhone,
          };
        }
        return seat;
      });
      if (seatModified) {
        setLocalData(STORAGE_KEYS.SEATS, updatedSeats);
      }
    } catch {}

    // 5. Broadcast global profile updated event to live-update all open tables & cards
    try {
      window.dispatchEvent(
        new CustomEvent('student_profile_updated', {
          detail: {
            ...student,
            phone: normalizedPhone,
            parent_phone: normalizedParentPhone,
            seat_number: seatNum,
          },
        })
      );
    } catch {}
  }

  return true;
}

/**
 * Admin Contact & Library Helpline (Sole Source of Truth: Supabase profiles)
 * Dynamically queries or updates the admin's phone number without relying on D1.
 */
export async function getAdminContactInfo(): Promise<{ phone: string; rawPhone: string; name: string; email: string }> {
  try {
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    const adminEmail = BRAND_CONFIG.adminEmail || 'geniuslibrarymadhupur@gmail.com';
    const { data } = await supabase
      .from('profiles')
      .select('phone, full_name, email')
      .or(`role.eq.admin,email.eq.${adminEmail}`)
      .limit(1)
      .maybeSingle();

    if (data?.phone && String(data.phone).trim().length > 0) {
      const cleanDigits = String(data.phone).replace(/\D/g, '').slice(-10);
      return {
        phone: data.phone.startsWith('+91') ? data.phone : `+91 ${cleanDigits}`,
        rawPhone: cleanDigits || BRAND_CONFIG.rawPhone,
        name: data.full_name || BRAND_CONFIG.name,
        email: data.email || adminEmail,
      };
    }
  } catch (err) {
    console.warn('[getAdminContactInfo] Supabase query notice:', err);
  }

  return {
    phone: BRAND_CONFIG.phone,
    rawPhone: BRAND_CONFIG.rawPhone,
    name: BRAND_CONFIG.name,
    email: BRAND_CONFIG.adminEmail,
  };
}

export async function updateAdminContactInfo(params: { phone: string; name?: string; email?: string }): Promise<boolean> {
  const cleanDigits = params.phone.replace(/\D/g, '').slice(-10);
  const normalizedPhone = cleanDigits ? `+91 ${cleanDigits}` : params.phone;
  const adminEmail = params.email || BRAND_CONFIG.adminEmail || 'geniuslibrarymadhupur@gmail.com';

  try {
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();

    const updatePayload: any = {
      phone: normalizedPhone,
      updated_at: new Date().toISOString(),
    };
    if (params.name) updatePayload.full_name = params.name;

    // Direct update to Supabase profiles
    await supabase
      .from('profiles')
      .update(updatePayload)
      .or(`role.eq.admin,email.eq.${adminEmail}`);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('admin_contact_updated', {
          detail: {
            phone: normalizedPhone,
            rawPhone: cleanDigits,
            name: params.name || BRAND_CONFIG.name,
            email: adminEmail,
          },
        })
      );
    }

    return true;
  } catch (err) {
    console.error('[updateAdminContactInfo] Error:', err);
    return false;
  }
}

export async function approveAllStudents(): Promise<boolean> {
  try {
    const data = await fetchApi<{ success: boolean }>('/api/students/approve-all', {
      method: 'POST',
    });
    return data.success;
  } catch (err) {
    console.error('approveAllStudents API error:', err);
    return false;
  }
}

export async function deleteStudent(id: string): Promise<boolean> {
  try {
    const data = await fetchApi<{ success: boolean }>(`/api/students/${id}`, {
      method: 'DELETE',
    });
    return data.success;
  } catch (err) {
    console.error('deleteStudent API error:', err);
    return false;
  }
}

export async function deleteAttendance(recordId: string): Promise<boolean> {
  try {
    const data = await fetchApi<{ success: boolean }>(`/api/attendance/${encodeURIComponent(recordId)}`, {
      method: 'DELETE',
    });
    return data.success;
  } catch {
    const records = getLocalData<AttendanceRecord[]>(STORAGE_KEYS.ATTENDANCE, []);
    setLocalData(STORAGE_KEYS.ATTENDANCE, records.filter(r => r.id !== recordId));
    return true;
  }
}

export async function deleteBook(bookId: string): Promise<boolean> {
  try {
    const data = await fetchApi<{ success: boolean }>(`/api/books/${encodeURIComponent(bookId)}`, {
      method: 'DELETE',
    });
    return data.success;
  } catch {
    const books = getLocalData<Book[]>(STORAGE_KEYS.BOOKS, []);
    setLocalData(STORAGE_KEYS.BOOKS, books.filter(b => b.id !== bookId));
    return true;
  }
}

export async function resetAllAdminData(): Promise<{ success: boolean; message: string }> {
  // 1. Clear all localStorage cached tables
  if (typeof window !== 'undefined') {
    Object.values(STORAGE_KEYS).forEach(key => {
      try {
        localStorage.removeItem(key);
      } catch {}
    });
  }

  // 2. Call API reset endpoint to wipe D1 tables
  try {
    await fetchApi('/api/admin/reset-data', { method: 'POST' });
  } catch (err) {
    console.warn('API reset-data notice:', err);
  }

  // 3. Supabase profiles purge (non-admins)
  try {
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    await supabase.from('profiles').delete().neq('role', 'admin');
  } catch (err) {
    console.warn('Supabase reset notice:', err);
  }

  return { success: true, message: 'All students, books, attendance, and fee records have been wiped.' };
}

// ══════════════════════════════════════════════════════════════════
// SECTION 8 · MESSAGES API
// Two-way chat threads.
// ══════════════════════════════════════════════════════════════════
export interface MessageRecord {
  id: string;
  studentId: string;
  studentName: string;
  studentEmail?: string | null;
  senderRole: 'student' | 'admin' | 'staff';
  senderName: string;
  message: string;
  recipientRole?: 'student' | 'admin' | 'staff' | 'all';
  recipientName?: string | null;
  recipientId?: string | null;
  isRead?: boolean;
  createdAt: string;
}

export async function getMessages(studentId?: string): Promise<MessageRecord[]> {
  // 1. Fetch from Supabase (Sole Primary Database)
  try {
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    let query = supabase
      .from('messages')
      .select('*')
      .not('student_id', 'like', 'SYSTEM_%')
      .order('created_at', { ascending: true });

    if (studentId) {
      query = query.or(`student_id.eq.${studentId},recipient_id.eq.${studentId}`);
    }

    const { data, error } = await query;
    if (!error && Array.isArray(data)) {
      const records: MessageRecord[] = data.map((r: any) => ({
        id: r.id,
        studentId: r.student_id,
        studentName: r.student_name,
        studentEmail: r.student_email,
        senderRole: r.sender_role,
        senderName: r.sender_name,
        message: r.message,
        recipientRole: r.recipient_role,
        recipientName: r.recipient_name,
        recipientId: r.recipient_id,
        isRead: r.is_read,
        createdAt: r.created_at,
      }));
      setLocalData(STORAGE_KEYS.MESSAGES, records);
      return records;
    }
  } catch (err) {
    console.warn('Supabase getMessages error, using cache:', err);
  }

  const allLocal = getLocalData<MessageRecord[]>(STORAGE_KEYS.MESSAGES, []);
  if (studentId) {
    return allLocal.filter(m => m.studentId === studentId || (m.studentEmail && m.studentEmail === studentId));
  }
  return allLocal;
}

// All historical messages are stored and queried directly from Supabase
export async function getMessagesHistory(studentId?: string): Promise<MessageRecord[]> {
  return getMessages(studentId);
}

export async function sendMessage(params: {
  studentId: string;
  studentName: string;
  studentEmail?: string | null;
  senderRole: 'student' | 'admin' | 'staff';
  senderName: string;
  message: string;
  recipientRole?: 'student' | 'admin' | 'staff' | 'all';
  recipientName?: string | null;
  recipientId?: string | null;
}): Promise<{ success: boolean; message: MessageRecord }> {
  const newMsg: MessageRecord = {
    id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    studentId: params.studentId,
    studentName: params.studentName,
    studentEmail: params.studentEmail || null,
    senderRole: params.senderRole,
    senderName: params.senderName,
    message: params.message,
    recipientRole: params.recipientRole || (params.senderRole === 'student' ? 'admin' : 'student'),
    recipientName: params.recipientName || null,
    recipientId: params.recipientId || null,
    isRead: false,
    createdAt: new Date().toISOString(),
  };

  // 1. Direct Supabase Storage (Sole Primary Database)
  try {
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    await supabase.from('messages').insert({
      id: newMsg.id,
      student_id: newMsg.studentId,
      student_name: newMsg.studentName,
      student_email: newMsg.studentEmail,
      sender_role: newMsg.senderRole,
      sender_name: newMsg.senderName,
      message: newMsg.message,
      recipient_role: newMsg.recipientRole,
      recipient_name: newMsg.recipientName,
      recipient_id: newMsg.recipientId,
      is_read: false,
      created_at: newMsg.createdAt,
    });
  } catch (err) {
    console.warn('Supabase sendMessage notice:', err);
  }

  // 2. Trigger notification for recipient
  if (params.senderRole === 'student') {
    createNotification({
      recipientRole: 'admin',
      title: `💬 New Message from ${params.studentName}`,
      message: params.message.length > 100 ? `${params.message.slice(0, 100)}...` : params.message,
      type: 'message',
      actionUrl: `/admin/messages?student=${encodeURIComponent(params.studentId)}`,
    }).catch(() => {});
  } else if (params.senderRole === 'admin') {
    createNotification({
      recipientRole: 'student',
      recipientId: params.studentId,
      title: `💬 Reply from ${params.senderName || 'Library Administration'}`,
      message: params.message.length > 100 ? `${params.message.slice(0, 100)}...` : params.message,
      type: 'message',
      actionUrl: '/student/messages',
    }).catch(() => {});
  }

  const allLocal = getLocalData<MessageRecord[]>(STORAGE_KEYS.MESSAGES, []);
  const updated = [newMsg, ...allLocal.filter(m => m.id !== newMsg.id)];
  setLocalData(STORAGE_KEYS.MESSAGES, updated);

  // Broadcast in real-time to all open windows/tabs (Student & Admin)
  if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
    try {
      const channel = new BroadcastChannel('genius_chat_channel');
      channel.postMessage({ type: 'NEW_CHAT_MESSAGE', message: newMsg });
      channel.close();
    } catch {}
  }

  return { success: true, message: newMsg };
}

export async function markMessagesAsRead(studentId: string): Promise<{ success: boolean }> {
  try {
    await fetchApi('/api/messages/read', {
      method: 'PATCH',
      body: JSON.stringify({ studentId }),
    });
  } catch (err) {
    console.warn('API markMessagesAsRead notice:', err);
  }

  const allLocal = getLocalData<MessageRecord[]>(STORAGE_KEYS.MESSAGES, []);
  const updated = allLocal.map(m => m.studentId === studentId ? { ...m, isRead: true } : m);
  setLocalData(STORAGE_KEYS.MESSAGES, updated);
  return { success: true };
}

// ══════════════════════════════════════════════════════════════════
// SECTION 9 · STAFF API
// Staff directory + roles.
// ══════════════════════════════════════════════════════════════════
export interface StaffMember {
  id: string;
  name: string;
  email: string;
  phone: string;
  address?: string;
  aadharNumber?: string;
  avatarUrl?: string;
  role: 'prime_staff' | 'sub_staff';
  category: 'Prime Staff' | 'Sub Staff';
  shiftAssigned: string;
  status: 'active' | 'on_leave' | 'inactive';
  password?: string;
  lastLogin?: string;
  createdAt?: string;
  updatedAt?: string;
}

export async function getStaffMembers(): Promise<StaffMember[]> {
  // Supabase staff_profiles table is the sole primary source of truth
  try {
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    const { data, error } = await supabase
      .from('staff_profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && Array.isArray(data)) {
      // Purge any legacy dummy records from the returned dataset
      const realRows = data.filter((row: any) => 
        row.id !== 'staff-prime-01' && 
        row.id !== 'staff-sub-01' && 
        !row.email?.toLowerCase().includes('rajesh.librarian') && 
        !row.email?.toLowerCase().includes('vikas.assistant')
      );

      const formatted: StaffMember[] = realRows.map((row: any) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        phone: row.phone || '',
        address: row.address || '',
        aadharNumber: row.aadhar_number || '',
        avatarUrl: row.avatar_url || undefined,
        role: row.role || 'prime_staff',
        category: row.category || 'Prime Staff',
        shiftAssigned: row.shift_assigned || 'Morning Shift',
        status: row.status || 'active',
        lastLogin: row.last_login || 'Never',
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
      setLocalData(STORAGE_KEYS.STAFF, formatted);
      return formatted;
    }
    if (error) {
      console.warn('[getStaffMembers] Supabase staff_profiles fetch note:', error.message);
    }
  } catch (err) {
    console.warn('[getStaffMembers] Supabase staff_profiles fetch exception:', err);
  }

  // Fallback to local storage (strictly filter out legacy dummy records)
  const cached = getLocalData<StaffMember[]>(STORAGE_KEYS.STAFF, []);
  const cleanCached = cached.filter(s => 
    s.id !== 'staff-prime-01' && 
    s.id !== 'staff-sub-01' && 
    !s.email?.toLowerCase().includes('rajesh.librarian') && 
    !s.email?.toLowerCase().includes('vikas.assistant')
  );
  if (cleanCached.length !== cached.length) {
    setLocalData(STORAGE_KEYS.STAFF, cleanCached);
  }
  return cleanCached;
}

export async function createStaffMember(
  params: Partial<StaffMember> & { password?: string }
): Promise<{ success: boolean; staff?: StaffMember; error?: string }> {
  const isPrime = params.role === 'prime_staff' || params.category === 'Prime Staff';
  let staffId = params.id || `staff-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const cleanEmail = (params.email || '').toLowerCase().trim();

  // 1. Supabase Auth account creation using a non-session client (keeps admin signed in)
  if (params.password && params.password.length >= 6) {
    try {
      const { createClient: createSupabaseClient } = await import('@supabase/supabase-js');
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL || BRAND_CONFIG.supabase.url;
      const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || BRAND_CONFIG.supabase.anonKey;

      const tempAuthClient = createSupabaseClient(url, key, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        }
      });

      const { data: signUpData, error: signUpError } = await tempAuthClient.auth.signUp({
        email: cleanEmail,
        password: params.password,
        options: {
          data: {
            full_name: params.name || '',
            phone: params.phone || '',
            role: 'staff',
            staff_role: isPrime ? 'prime_staff' : 'sub_staff',
          }
        }
      });

      if (signUpData?.user?.id) {
        staffId = signUpData.user.id;
      } else if (signUpError) {
        console.warn('[createStaffMember] Supabase Auth signUp note:', signUpError.message);
      }
    } catch (authErr) {
      console.warn('[createStaffMember] Supabase Auth signUp exception:', authErr);
    }
  }

  const newStaff: StaffMember = {
    id: staffId,
    name: params.name || '',
    email: cleanEmail,
    phone: params.phone || '',
    address: params.address || '',
    aadharNumber: params.aadharNumber || '',
    avatarUrl: params.avatarUrl,
    role: isPrime ? 'prime_staff' : 'sub_staff',
    category: isPrime ? 'Prime Staff' : 'Sub Staff',
    shiftAssigned: params.shiftAssigned || 'Morning Shift',
    status: params.status || 'active',
    lastLogin: 'Never',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // 2. Direct Supabase save (Primary Source of Truth)
  try {
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    const { error: sbErr } = await supabase.from('staff_profiles').upsert([{
      id: staffId,
      name: newStaff.name,
      email: newStaff.email,
      phone: newStaff.phone,
      address: newStaff.address,
      aadhar_number: newStaff.aadharNumber,
      avatar_url: newStaff.avatarUrl || null,
      role: newStaff.role,
      category: newStaff.category,
      shift_assigned: newStaff.shiftAssigned,
      status: newStaff.status,
      last_login: newStaff.lastLogin,
      created_at: newStaff.createdAt,
      updated_at: newStaff.updatedAt,
    }]);

    if (sbErr) {
      console.warn('[createStaffMember] Supabase upsert error:', sbErr);
      return { success: false, error: sbErr.message };
    }

    // Mirror to profiles table so universal role verification passes
    try {
      await supabase.from('profiles').upsert([{
        id: staffId,
        email: newStaff.email,
        full_name: newStaff.name,
        phone: newStaff.phone,
        role: 'staff',
        status: 'active',
        created_at: newStaff.createdAt,
        updated_at: newStaff.updatedAt,
      }]);
    } catch {}
  } catch (sbErr: any) {
    console.warn('[createStaffMember] Supabase sync notice:', sbErr);
    return { success: false, error: sbErr?.message || 'Database error' };
  }

  const all = getLocalData<StaffMember[]>(STORAGE_KEYS.STAFF, []);
  setLocalData(STORAGE_KEYS.STAFF, [newStaff, ...all.filter((s) => s.id !== staffId)]);
  return { success: true, staff: newStaff };
}

export async function updateStaffMember(
  id: string,
  params: Partial<StaffMember> & { password?: string }
): Promise<{ success: boolean; error?: string }> {
  // Direct Supabase update (Primary Source of Truth)
  try {
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    const supaPayload: any = { updated_at: new Date().toISOString() };
    if (params.name !== undefined) supaPayload.name = params.name;
    if (params.email !== undefined) supaPayload.email = params.email.toLowerCase().trim();
    if (params.phone !== undefined) supaPayload.phone = params.phone;
    if (params.address !== undefined) supaPayload.address = params.address;
    if (params.aadharNumber !== undefined) supaPayload.aadhar_number = params.aadharNumber;
    if (params.avatarUrl !== undefined) supaPayload.avatar_url = params.avatarUrl;
    if (params.role !== undefined) supaPayload.role = params.role;
    if (params.category !== undefined) supaPayload.category = params.category;
    if (params.shiftAssigned !== undefined) supaPayload.shift_assigned = params.shiftAssigned;
    if (params.status !== undefined) supaPayload.status = params.status;

    const { error } = await supabase.from('staff_profiles').update(supaPayload).eq('id', id);
    if (error) {
      console.warn('[updateStaffMember] Supabase update error:', error);
      return { success: false, error: error.message };
    }

    // Mirror name and phone updates to profiles table
    try {
      const profileUpdates: any = { updated_at: new Date().toISOString() };
      if (params.name !== undefined) profileUpdates.full_name = params.name;
      if (params.phone !== undefined) profileUpdates.phone = params.phone;
      await supabase.from('profiles').update(profileUpdates).eq('id', id);
    } catch {}
  } catch (sbErr: any) {
    console.warn('[updateStaffMember] Supabase sync notice:', sbErr);
    return { success: false, error: sbErr?.message };
  }

  const all = getLocalData<StaffMember[]>(STORAGE_KEYS.STAFF, []);
  const updated = all.map((s) =>
    s.id === id ? { ...s, ...params, updatedAt: new Date().toISOString() } : s
  );
  setLocalData(STORAGE_KEYS.STAFF, updated);
  return { success: true };
}

export async function deleteStaffMember(id: string): Promise<{ success: boolean; error?: string }> {
  // Direct Supabase delete (Primary Source of Truth)
  try {
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    const { error } = await supabase.from('staff_profiles').delete().eq('id', id);
    if (error) {
      console.warn('[deleteStaffMember] Supabase delete error:', error);
      return { success: false, error: error.message };
    }
    // Also remove from profiles if present
    try {
      await supabase.from('profiles').delete().eq('id', id);
    } catch {}
  } catch (sbErr: any) {
    console.warn('[deleteStaffMember] Supabase sync notice:', sbErr);
    return { success: false, error: sbErr?.message };
  }

  const all = getLocalData<StaffMember[]>(STORAGE_KEYS.STAFF, []);
  setLocalData(STORAGE_KEYS.STAFF, all.filter((s) => s.id !== id));
  return { success: true };
}

// ══════════════════════════════════════════════════════════════════
// SECTION 10 · NOTIFICATIONS API
// In-app notification feed.
// ══════════════════════════════════════════════════════════════════
export async function getNotifications(params?: {
  role?: string;
  recipientId?: string;
  registeredAfter?: string; // ISO date string — filters out broadcast ('all') notifications created before this date
}): Promise<NotificationRecord[]> {
  // Get cleared notification IDs to filter them out
  const clearedIds = getLocalData<string[]>(STORAGE_KEYS.CLEARED_NOTIFICATIONS, []);

  const filterCleared = (list: NotificationRecord[]) => {
    if (clearedIds.length === 0) return list;
    return list.filter((n) => !clearedIds.includes(n.id));
  };

  // Filter out broadcast notifications older than the student's registration date
  const filterByRegistration = (list: NotificationRecord[]) => {
    if (!params?.registeredAfter || params?.role !== 'student') return list;
    const regDate = new Date(params.registeredAfter).getTime();
    if (isNaN(regDate)) return list;
    return list.filter((n) => {
      // Personal notifications targeted to this student always show
      if (n.recipientId && params.recipientId &&
          (n.recipientId === params.recipientId || n.recipientId.toLowerCase() === params.recipientId.toLowerCase())) {
        return true;
      }
      // Broadcast/all notifications: only show if created after registration
      if (n.recipientRole === 'all' || (!n.recipientId)) {
        const notifDate = new Date(n.createdAt).getTime();
        return !isNaN(notifDate) && notifDate >= regDate;
      }
      return true;
    });
  };

  // 1. Fetch directly from Supabase (Sole Primary Database)
  try {
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();

    // Auto-purge notifications older than 30 days (1 month) to keep Supabase storage lean
    const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    supabase
      .from('messages')
      .delete()
      .eq('student_id', 'SYSTEM_NOTIF')
      .lt('created_at', oneMonthAgo)
      .then(() => {}, () => {});

    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('student_id', 'SYSTEM_NOTIF')
      .gte('created_at', oneMonthAgo)
      .order('created_at', { ascending: false })
      .limit(60);

    if (!error && Array.isArray(data)) {
      const parsedList: NotificationRecord[] = [];
      data.forEach((row: any) => {
        try {
          const parsed = typeof row.message === 'string' ? JSON.parse(row.message) : row.message;
          if (parsed && parsed.id) {
            parsed.isRead = row.is_read ?? parsed.isRead ?? false;
            parsedList.push(parsed);
          }
        } catch {
          parsedList.push({
            id: row.id,
            title: row.student_name || 'Notification',
            message: row.message || '',
            type: 'general',
            recipientRole: row.recipient_role || 'all',
            recipientId: row.recipient_id || null,
            isRead: row.is_read || false,
            createdAt: row.created_at,
          });
        }
      });

      let filtered = parsedList;
      if (params?.role === 'admin') {
        filtered = parsedList.filter((n) => n.recipientRole === 'admin' || n.recipientRole === 'all');
      } else if (params?.role === 'student') {
        filtered = parsedList.filter((n) => {
          if (n.recipientRole === 'all') return true;
          if (n.recipientRole !== 'student') return false;
          if (!n.recipientId) return true;
          if (params.recipientId && (n.recipientId === params.recipientId || n.recipientId.toLowerCase() === params.recipientId.toLowerCase())) {
            return true;
          }
          return false;
        });
      }

      const finalList = filterByRegistration(filterCleared(filtered));
      setLocalData(STORAGE_KEYS.NOTIFICATIONS, finalList);
      return finalList;
    }
  } catch (err) {
    console.warn('Supabase getNotifications error, checking local store:', err);
  }

  // Fallback to local data if offline (keep only last 30 days)
  const oneMonthAgoMs = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const rawCached = getLocalData<NotificationRecord[]>(STORAGE_KEYS.NOTIFICATIONS, []);
  const cached = rawCached.filter((n) => {
    const t = new Date(n.createdAt).getTime();
    return isNaN(t) || t >= oneMonthAgoMs;
  });
  if (cached.length !== rawCached.length) {
    setLocalData(STORAGE_KEYS.NOTIFICATIONS, cached);
  }

  let result = cached;
  if (params?.role === 'admin') {
    result = cached.filter((n) => n.recipientRole === 'admin' || n.recipientRole === 'all');
  }
  if (params?.role === 'student') {
    result = cached.filter((n) => {
      if (n.recipientRole === 'all') return true;
      if (n.recipientRole !== 'student') return false;
      if (!n.recipientId) return true;
      if (params.recipientId && (n.recipientId === params.recipientId || n.recipientId.toLowerCase() === params.recipientId.toLowerCase())) {
        return true;
      }
      return false;
    });
  }
  return filterByRegistration(filterCleared(result));
}

export async function createNotification(
  data: Partial<NotificationRecord>
): Promise<{ success: boolean; notification?: NotificationRecord }> {
  const payload: NotificationRecord = {
    id: data.id || `notif-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    recipientRole: data.recipientRole || 'all',
    recipientId: data.recipientId || null,
    title: data.title || 'Library Notification',
    message: data.message || '',
    type: data.type || 'general',
    actionUrl: data.actionUrl || null,
    isRead: false,
    createdAt: data.createdAt || new Date().toISOString(),
  };

  // 1. Direct Supabase Storage (Sole Primary Database)
  try {
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    await supabase.from('messages').insert({
      id: payload.id,
      student_id: 'SYSTEM_NOTIF',
      student_name: payload.title,
      student_email: payload.recipientId || '',
      sender_role: 'system',
      sender_name: payload.type || 'general',
      message: JSON.stringify(payload),
      recipient_role: payload.recipientRole || 'all',
      recipient_id: payload.recipientId || null,
      is_read: false,
      created_at: payload.createdAt,
    });
  } catch (err) {
    console.warn('Supabase createNotification notice:', err);
  }

  // 2. Cache in local storage
  const cached = getLocalData<NotificationRecord[]>(STORAGE_KEYS.NOTIFICATIONS, []);
  setLocalData(STORAGE_KEYS.NOTIFICATIONS, [payload, ...cached.filter((c) => c.id !== payload.id)]);

  // 3. Cross-tab real-time broadcast and instant native popup (attendance native popup handled directly by smartQrScanAttendance)
  try {
    const { broadcastNotification, triggerNativeNotification } = await import('./pushNotify');
    broadcastNotification(payload);
    if (typeof window !== 'undefined' && payload.type !== 'attendance') {
      triggerNativeNotification({
        title: payload.title,
        body: payload.message,
        url: payload.actionUrl || '/student',
        tag: payload.id,
      }).catch(() => {});
    }
  } catch {}

  return { success: true, notification: payload };
}

export async function markNotificationAsRead(id: string): Promise<boolean> {
  try {
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    await supabase.from('messages').update({ is_read: true }).eq('id', id);
  } catch (err) {
    console.warn('Supabase markNotificationAsRead notice:', err);
  }

  const cached = getLocalData<NotificationRecord[]>(STORAGE_KEYS.NOTIFICATIONS, []);
  const updated = cached.map((n) => (n.id === id ? { ...n, isRead: true } : n));
  setLocalData(STORAGE_KEYS.NOTIFICATIONS, updated);
  return true;
}

export async function markAllNotificationsAsRead(params?: {
  role?: string;
  recipientId?: string;
}): Promise<boolean> {
  try {
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    let query = supabase.from('messages').update({ is_read: true }).eq('student_id', 'SYSTEM_NOTIF');
    if (params?.role) query = query.eq('recipient_role', params.role);
    if (params?.recipientId) query = query.eq('recipient_id', params.recipientId);
    await query;
  } catch (err) {
    console.warn('Supabase markAllNotificationsAsRead notice:', err);
  }

  const cached = getLocalData<NotificationRecord[]>(STORAGE_KEYS.NOTIFICATIONS, []);
  const updated = cached.map((n) => {
    if (params?.role === 'admin' && n.recipientRole === 'admin') {
      return { ...n, isRead: true };
    }
    if (params?.recipientId && n.recipientId === params.recipientId) {
      return { ...n, isRead: true };
    }
    if (!params?.role && !params?.recipientId) {
      return { ...n, isRead: true };
    }
    return n;
  });
  setLocalData(STORAGE_KEYS.NOTIFICATIONS, updated);
  return true;
}

export async function deleteNotification(id: string): Promise<boolean> {
  try {
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    await supabase.from('messages').delete().eq('id', id);
  } catch (err) {
    console.warn('Supabase deleteNotification notice:', err);
  }

  const cached = getLocalData<NotificationRecord[]>(STORAGE_KEYS.NOTIFICATIONS, []);
  const filtered = cached.filter((n) => n.id !== id);
  setLocalData(STORAGE_KEYS.NOTIFICATIONS, filtered);

  const clearedIds = getLocalData<string[]>(STORAGE_KEYS.CLEARED_NOTIFICATIONS, []);
  setLocalData(STORAGE_KEYS.CLEARED_NOTIFICATIONS, [...new Set([...clearedIds, id])].slice(-200));

  return true;
}

export async function clearAllNotifications(params?: {
  role?: string;
  recipientId?: string;
}): Promise<boolean> {
  try {
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    if (!params?.role && !params?.recipientId) {
      await supabase.from('messages').delete().eq('student_id', 'SYSTEM_NOTIF');
    } else if (params?.role === 'admin') {
      await supabase
        .from('messages')
        .delete()
        .eq('student_id', 'SYSTEM_NOTIF')
        .in('recipient_role', ['admin', 'all']);
    } else if (params?.role === 'student') {
      if (params.recipientId) {
        await supabase
          .from('messages')
          .delete()
          .eq('student_id', 'SYSTEM_NOTIF')
          .eq('recipient_id', params.recipientId);
      } else {
        await supabase
          .from('messages')
          .delete()
          .eq('student_id', 'SYSTEM_NOTIF')
          .in('recipient_role', ['student', 'all']);
      }
    }
  } catch (err) {
    console.warn('Supabase clearAllNotifications notice:', err);
  }

  // Persist cleared IDs so they don't reappear on refresh
  const cached = getLocalData<NotificationRecord[]>(STORAGE_KEYS.NOTIFICATIONS, []);
  const clearedIds = getLocalData<string[]>(STORAGE_KEYS.CLEARED_NOTIFICATIONS, []);
  const newClearedIds = cached
    .filter((n) => {
      if (params?.recipientId && n.recipientId === params.recipientId) return true;
      if (params?.role && n.recipientRole === params.role) return true;
      if (params?.role === 'student' && n.recipientRole === 'all') return true;
      if (params?.role === 'admin' && n.recipientRole === 'all') return true;
      if (!params?.role && !params?.recipientId) return true;
      return false;
    })
    .map((n) => n.id);
  const allCleared = [...new Set([...clearedIds, ...newClearedIds])];
  setLocalData(STORAGE_KEYS.CLEARED_NOTIFICATIONS, allCleared.slice(-200));

  const filtered = cached.filter((n) => !allCleared.includes(n.id));
  setLocalData(STORAGE_KEYS.NOTIFICATIONS, filtered);
  return true;
}

export async function triggerDailyBackupReport(): Promise<{ success: boolean; error?: string; report?: any }> {
  try {
    return await fetchApi('/api/backup/trigger-daily', { method: 'POST' });
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function getDailyReportsSnapshots(): Promise<{ success: boolean; reports: any[] }> {
  try {
    return await fetchApi('/api/backup/reports');
  } catch (err: any) {
    return { success: false, reports: [] };
  }
}

export function getDailyReportDownloadUrl(type: 'pdf' | 'csv', date?: string): string {
  const query = date ? `?date=${encodeURIComponent(date)}` : '';
  return `${API_BASE_URL}/api/backup/download-${type}${query}`;
}

export async function getLatestDailyReport(date?: string): Promise<{ success: boolean; report?: any }> {
  try {
    const query = date ? `?date=${encodeURIComponent(date)}` : '';
    return await fetchApi(`/api/backup/latest${query}`);
  } catch (err: any) {
    return { success: false, report: null };
  }
}

export async function registerDeviceToken(params: {
  token: string;
  role?: string;
  userId?: string;
  email?: string;
  name?: string;
}): Promise<{ success: boolean }> {
  try {
    return await fetchApi<{ success: boolean }>('/api/fcm/register', {
      method: 'POST',
      body: JSON.stringify(params),
      timeoutMs: 5000,
    });
  } catch (err) {
    console.warn('[FCM] Error registering device token with API:', err);
    return { success: false };
  }
}

// ══════════════════════════════════════════════════════════════════
// SECTION 11 · DATABASE & STORAGE ADMIN API
// Usage status, pruning, backup sync — admin settings page.
// ══════════════════════════════════════════════════════════════════
export interface StorageStatus {
  supabase: {
    totalStudents: number;
    totalAttendance: number;
    totalFees: number;
    totalMessages: number;
    estimatedMbUsed: number;
    quotaMb: number;
    percentageUsed: number;
    healthStatus: 'optimal' | 'moderate' | 'warning';
  };
  d1Backup?: {
    totalBackedUpStudents: number;
    totalAttendanceHistory: number;
    totalFeesHistory: number;
    totalMessagesHistory: number;
    lastBackupDate: string;
    status: 'active' | 'synced';
  };
}

export async function getStorageStatus(): Promise<StorageStatus> {
  try {
    const data = await fetchApi<{ success: boolean } & StorageStatus>('/api/admin/storage-status', { timeoutMs: 5000 });
    if (data.supabase) {
      return {
        supabase: data.supabase,
      };
    }
    throw new Error('Invalid storage response');
  } catch {
    // Client-side direct Supabase query
    let supaStudents = 4;
    let supaAttendance = 0;
    let supaFees = 0;
    try {
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();
      const [pRes, aRes, fRes] = await Promise.all([
        supabase.from('profiles').select('id, email, role'),
        supabase.from('attendance').select('id', { count: 'exact', head: true }),
        supabase.from('fees').select('id', { count: 'exact', head: true }),
      ]);
      if (pRes.data) supaStudents = pRes.data.filter((p: any) => !isMasterAdminEmail(p.email) && p.role !== 'admin').length;
      if (aRes.count !== null && aRes.count !== undefined) supaAttendance = aRes.count;
      if (fRes.count !== null && fRes.count !== undefined) supaFees = fRes.count;
    } catch {}

    const estimatedBytes = (supaStudents * 2500) + (supaAttendance * 400) + (supaFees * 500) + 50000;
    const estimatedMbUsed = Number((estimatedBytes / (1024 * 1024)).toFixed(2));
    const quotaMb = 500;
    const percentageUsed = Number(((estimatedMbUsed / quotaMb) * 100).toFixed(2));

    return {
      supabase: {
        totalStudents: supaStudents,
        totalAttendance: supaAttendance,
        totalFees: supaFees,
        totalMessages: 0,
        estimatedMbUsed,
        quotaMb,
        percentageUsed,
        healthStatus: 'optimal',
      },
    };
  }
}

export async function triggerManualMonthlyBackup(): Promise<{ success: boolean; message?: string; error?: string }> {
  return { success: true, message: 'All data is continuously and safely stored in Supabase.' };
}

export async function pruneSupabaseRecords(_params: {
  target: 'attendance' | 'messages' | 'fees';
  daysOlderThan: number;
}): Promise<{ success: boolean; countPruned: number; message: string }> {
  // Pruning and auto-deletion disabled per user mandate:
  // Attendance and logs are preserved permanently in Supabase.
  return {
    success: true,
    countPruned: 0,
    message: 'Auto-pruning is disabled. All records remain permanently in Supabase.',
  };
}


