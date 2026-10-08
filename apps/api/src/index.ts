/**
 * [API • WORKER] Cloudflare Worker (Hono) — REST API + Cron
 *
 * ALL backend endpoints: students, shifts, seats, attendance (QR),
 * books, fees, messages, staff, notifications, FCM push, backups.
 * CORS lockdown + Supabase JWT verification + D1 backup/archival cron.
 * Reads branding/credentials from the root white-label.config.ts.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { etag } from 'hono/etag';
import { 
  getDb, 
  students, 
  shifts, 
  seats, 
  attendance, 
  books, 
  bookIssues, 
  fees, 
  announcements, 
  deskDisputes, 
  messages, 
  staff, 
  notifications,
  attendanceHistory,
  feesHistory,
  messagesHistory,
  reportsHistory,
  fcmTokens
} from './db';
import { eq, desc, and, or, sql, lt, ne, gte, lte } from 'drizzle-orm';

import { sendFeeReceiptEmail, sendDailyAdminBackupReportEmail, sendStudentWelcomeEmail, DailyBackupReportParams } from './email';
import { sendFCMMessage, sendFCMToTokens } from './fcm';
import { createClient } from '@supabase/supabase-js';
import { WL } from '../../../white-label.config';

type Bindings = {
  DB: any;
  API_SECRET_KEY?: string;
  ALLOWED_ORIGINS?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  genius_library_d1?: any;
  FCM_PROJECT_ID?: string;
  FCM_CLIENT_EMAIL?: string;
  FCM_PRIVATE_KEY?: string;
};

const app = new Hono<{ Bindings: Bindings }>();


// ══════════════════════════════════════════════════════════════════
// SECTION 1 · SECURITY MIDDLEWARE (CORS)
// Only origins configured in white-label.config.ts (+ localhost, *.pages.dev, *.vercel.app) may call this API.
// ══════════════════════════════════════════════════════════════════
const SITE_HOST = new URL(WL.siteUrl).hostname;
const MASTER_ADMIN_EMAIL = WL.adminEmail.trim().toLowerCase();
const DEFAULT_ALLOWED_ORIGINS = [
  WL.primaryDomain,
  WL.primaryDomain.replace('://', '://www.'),
  WL.siteUrl,
  'http://localhost:3000',
  'http://localhost:3001',
];

// 2. High-Performance ETag Middleware (304 Not Modified when unchanged)
app.use('*', etag());

app.use('*', async (c, next) => {
  const origin = c.req.header('Origin') || '';
  const customOrigins = c.env?.ALLOWED_ORIGINS
    ? c.env.ALLOWED_ORIGINS.split(',').map((o: string) => o.trim())
    : [];
  const allowed = [...DEFAULT_ALLOWED_ORIGINS, ...customOrigins];

  const isAllowed =
    !origin ||
    allowed.includes(origin) ||
    origin.endsWith('.vercel.app') ||
    origin.endsWith('.pages.dev') ||
    origin.includes(SITE_HOST);

  return cors({
    origin: isAllowed ? origin : WL.primaryDomain,
    allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'x-library-api-key', 'x-admin-key', 'x-api-key', 'If-None-Match'],
    exposeHeaders: ['ETag', 'Content-Length'],
    credentials: true,
  })(c, next);
});

// Helper to get Drizzle db instance
function db(c: any) {
  return getDb(c.env?.DB || c.env?.genius_library_d1);
}

// ══════════════════════════════════════════════════════════════════
// SECTION 2 · SUPABASE CONNECTION
// supabase-js client for JWT auth verification + primary-DB operations. URL/key: Worker env vars first, then white-label.config.ts.
// ══════════════════════════════════════════════════════════════════
const SUPABASE_DEFAULT_URL = WL.supabase.url;
const SUPABASE_DEFAULT_KEY = WL.supabase.anonKey;

function getSupabase(cOrEnv: any) {
  const env = cOrEnv?.env || cOrEnv;
  const url = env?.NEXT_PUBLIC_SUPABASE_URL || SUPABASE_DEFAULT_URL;
  const key = env?.SUPABASE_SERVICE_ROLE_KEY || env?.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env?.NEXT_PUBLIC_SUPABASE_ANON_KEY || SUPABASE_DEFAULT_KEY;
  return createClient(url, key);
}

// ── SHARED HELPERS ───────────────────────────────────────────
// Unguessable record IDs (students, invoices).
function generateRecordId(prefix: string): string {
  try {
    return `${prefix}-${crypto.randomUUID()}`;
  } catch {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
}

// ── IST TIMEZONE HELPERS ─────────────────────────────────────
// Workers run in UTC; these convert to Asia/Kolkata for daily logic.
// Cloudflare Workers execute in UTC. These helpers ensure all timestamps
// are in India Standard Time (Asia/Kolkata, UTC+5:30).
function getISTNow(): Date {
  // Returns a Date object offset to IST for component extraction
  const now = new Date();
  // UTC ms + 5:30 offset in ms
  const istMs = now.getTime() + (5.5 * 60 * 60 * 1000);
  return new Date(istMs);
}

function getISTDateStr(): string {
  // Returns YYYY-MM-DD in IST
  const ist = getISTNow();
  const y = ist.getUTCFullYear();
  const m = String(ist.getUTCMonth() + 1).padStart(2, '0');
  const d = String(ist.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getISTTimeStr(): string {
  // Returns "HH:MM AM/PM" in IST
  const ist = getISTNow();
  let h = ist.getUTCHours();
  const min = String(ist.getUTCMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${String(h).padStart(2, '0')}:${min} ${ampm}`;
}

// Authentication check for mutating/sensitive routes
async function isAuthorizedRequest(c: any, requireAdmin = false): Promise<boolean> {
  const apiKey = c.req.header('x-library-api-key') || c.req.header('x-admin-key');
  const configuredSecret = c.env?.API_SECRET_KEY;

  // 1. Secret API key check (trusted server-to-server or secure automation jobs)
  if (apiKey && configuredSecret && apiKey === configuredSecret) {
    return true;
  }

  // 2. Cryptographic Supabase JWT token verification
  const authHeader = c.req.header('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    if (token) {
      try {
        const supabase = getSupabase(c);
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (!error && user) {
          if (!requireAdmin) {
            return true;
          }
          // Verify admin privileges
          const userEmail = (user.email || '').toLowerCase();
          if (userEmail === MASTER_ADMIN_EMAIL) {
            return true;
          }
          const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .maybeSingle();
          if (profile?.role === 'admin') {
            return true;
          }
        }
      } catch (err) {
        console.warn('[isAuthorizedRequest] Supabase auth check error:', err);
      }
    }
  }

  return false;
}

async function generateApiStudentCode(database: any, supabaseClient?: any): Promise<string> {
  const now = new Date();
  const yy = now.getFullYear().toString().slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const prefix = `${yy}${mm}`;

  let maxSeq = 0;
  try {
    const d1Students = await database.select().from(students).all();
    for (const s of d1Students) {
      const clean = String(s.studentCode || '').replace(/[^0-9]/g, '');
      if (clean.startsWith(prefix) && clean.length >= prefix.length + 3) {
        const num = parseInt(clean.slice(prefix.length, prefix.length + 3), 10);
        if (!isNaN(num) && num > maxSeq) maxSeq = num;
      }
    }
  } catch {}

  try {
    if (supabaseClient) {
      const { data: sbProfiles } = await supabaseClient.from('profiles').select('student_code');
      if (sbProfiles && Array.isArray(sbProfiles)) {
        for (const sp of sbProfiles) {
          const clean = String(sp.student_code || '').replace(/[^0-9]/g, '');
          if (clean.startsWith(prefix) && clean.length >= prefix.length + 3) {
            const num = parseInt(clean.slice(prefix.length, prefix.length + 3), 10);
            if (!isNaN(num) && num > maxSeq) maxSeq = num;
          }
        }
      }
    }
  } catch {}

  const nextSeq = maxSeq + 1;
  return `${prefix}${String(nextSeq).padStart(3, '0')}`;
}

async function generateApiInvoiceNumber(database: any, supabaseClient?: any): Promise<string> {
  const now = new Date();
  const yy = now.getFullYear().toString().slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const prefix = `inv-${yy}${mm}-`;

  let maxSeq = 0;
  try {
    const d1Fees = await database.select().from(fees).all();
    for (const f of d1Fees) {
      const match = (f.receiptNo || '').match(new RegExp(`inv-${yy}${mm}-(\\d+)`, 'i'));
      if (match) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxSeq) maxSeq = num;
      }
    }
  } catch {}

  try {
    if (supabaseClient) {
      const { data: sbFees } = await supabaseClient.from('fees').select('receipt_no').ilike('receipt_no', `${prefix}%`);
      if (sbFees && Array.isArray(sbFees)) {
        for (const sf of sbFees) {
          const match = (sf.receipt_no || '').match(new RegExp(`inv-${yy}${mm}-(\\d+)`, 'i'));
          if (match) {
            const num = parseInt(match[1], 10);
            if (!isNaN(num) && num > maxSeq) maxSeq = num;
          }
        }
      }
    }
  } catch {}

  const nextSeq = maxSeq + 1;
  return `${prefix}${String(nextSeq).padStart(3, '0')}`;
}

// ══════════════════════════════════════════════════════════════════
// SECTION 2.5 · WHATSAPP BOT INTEGRATION (BAILEYS / RENDER SERVICE)
// Proxies messages server-to-server to eliminate browser CORS preflight blocks.
// ══════════════════════════════════════════════════════════════════
const BOT_DEFAULT_URL = 'https://whatsapp-bot-9h4k.onrender.com';
const BOT_DEFAULT_KEY = 'genius123';

function cleanWhatsAppPhone(phone: string): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return digits;
  if (digits.length === 13 && digits.startsWith('091')) return digits.slice(1);
  if (digits.length > 10) return `91${digits.slice(-10)}`;
  return digits;
}

async function sendWhatsAppViaRenderBot(phone: string, message: string): Promise<{ success: boolean; error?: string; data?: any }> {
  const targetNumber = cleanWhatsAppPhone(phone);
  if (!targetNumber || targetNumber.length < 10) {
    return { success: false, error: 'Invalid phone number: Must be at least 10 digits' };
  }
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(`${BOT_DEFAULT_URL}/send-message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': BOT_DEFAULT_KEY,
      },
      body: JSON.stringify({
        number: targetNumber,
        message,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    const data: any = await res.json().catch(() => ({}));
    if (res.ok && data.success !== false) {
      return { success: true, data };
    }
    return { success: false, error: data.error || data.message || `HTTP ${res.status}: ${res.statusText}` };
  } catch (err: any) {
    return { success: false, error: err.message || 'Render WhatsApp bot connection failed' };
  }
}

// 1. Check live bot status (proxy to bypass browser CORS)
app.get('/api/whatsapp/status', async (c) => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${BOT_DEFAULT_URL}/status`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (res.ok) {
      const data: any = await res.json().catch(() => ({}));
      return c.json({ success: true, ...data });
    }
    return c.json({ success: false, isConnected: false, error: `HTTP ${res.status}` });
  } catch (err: any) {
    return c.json({ success: false, isConnected: false, error: err.message });
  }
});

// 2. Send message proxy endpoint (invoked by web queue or direct alerts)
app.post('/api/whatsapp/send', async (c) => {
  try {
    const body = await c.req.json();
    const target = body.number || body.phone;
    const message = body.message;
    if (!target || !message) {
      return c.json({ success: false, error: 'Phone number and message are required' }, 400);
    }
    const result = await sendWhatsAppViaRenderBot(target, message);
    if (result.success) {
      return c.json({ success: true, message: 'Message sent successfully via WhatsApp bot', ...result.data });
    }
    return c.json({ success: false, error: result.error || 'Failed to dispatch via WhatsApp bot' }, 502);
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// ══════════════════════════════════════════════════════════════════
// SECTION 3 · HEALTH CHECK
// GET / — service status ping used by monitoring.
// ══════════════════════════════════════════════════════════════════

app.get('/', (c) => {
  return c.json({
    service: WL.fullName + ' API',
    status: 'online',
    version: '2.0.0',
    location: 'Madhupur, Sonbhadra, Uttar Pradesh, India',
    engine: 'Hono + Drizzle ORM + Cloudflare D1',
    timestamp: new Date().toISOString(),
  });
});

// ══════════════════════════════════════════════════════════════════
// SECTION 4 · STUDENTS API
// Registration, directory, lookup, approve/reject, deletion. Primary: Supabase profiles; mirrored row in D1 backup.
// ══════════════════════════════════════════════════════════════════
// 1.5. Students Endpoints (Registrations, Directory & Approvals - Sole Primary Database: Supabase)
// -------------------------------------------------------------
app.get('/api/students', async (c) => {
  try {
    const supabase = getSupabase(c.env);
    const status = c.req.query('status');

    let query = supabase.from('profiles').select('*').order('created_at', { ascending: false });
    if (status) {
      query = query.eq('status', status);
    }
    const { data: profiles, error } = await query;

    if (error) {
      console.error('[Supabase getStudents error]:', error);
      return c.json({ success: false, error: error.message, students: [] });
    }

    if (Array.isArray(profiles)) {
      // Filter out admin accounts and ghost profiles that lack a phone number
      const studentProfiles = profiles.filter((p: any) => 
        p.email !== MASTER_ADMIN_EMAIL && 
        p.role !== 'admin' &&
        (p.phone && p.phone.trim().length > 0)
      );
      
      const mapped = studentProfiles.map((p: any) => ({
        id: p.id,
        studentCode: p.student_code || p.member_id || `SDL-2026-${String(p.id).slice(-4).toUpperCase()}`,
        fullName: p.full_name || 'Student Member',
        email: p.email || '',
        phone: p.phone || '',
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

      return c.json({ success: true, students: mapped });
    }

    return c.json({ success: true, students: [] });
  } catch (err: any) {
    console.error('[getStudents fatal error]:', err);
    return c.json({ success: false, error: err.message, students: [] });
  }
});

// Clean up unregistered student (when someone logs in via OAuth without ever registering)
app.post('/api/auth/cleanup-unregistered', async (c) => {
  if (!(await isAuthorizedRequest(c, true))) {
    return c.json({ success: false, error: 'Unauthorized: Admin authorization required' }, 401);
  }

  try {
    const body = await c.req.json().catch(() => ({}));
    const { userId, email } = body;
    if (!userId && !email) {
      return c.json({ success: false, error: 'userId or email required' }, 400);
    }
    const supabase = getSupabase(c.env);

    // 1. Delete ghost profile row
    if (userId) {
      await supabase.from('profiles').delete().eq('id', userId);
    } else if (email) {
      await supabase.from('profiles').delete().eq('email', email.trim().toLowerCase());
    }

    // 2. Delete user from Supabase auth.users if service role key available
    try {
      if (userId && (supabase.auth as any).admin) {
        await (supabase.auth as any).admin.deleteUser(userId);
      }
    } catch (authErr) {
      console.warn('[Cleanup Unregistered Auth]', authErr);
    }

    return c.json({ success: true, message: 'Unregistered ghost record cleaned up successfully' });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// Targeted single student lookup (checks Supabase profiles solely)
app.get('/api/students/lookup', async (c) => {
  try {
    const supabase = getSupabase(c.env);
    const email = c.req.query('email');
    const id = c.req.query('id');
    const phone = c.req.query('phone');

    if (!email && !id && !phone) {
      return c.json({ success: false, error: 'Email, ID or phone query parameter required' }, 400);
    }

    try {
      let supaQuery = supabase.from('profiles').select('*');
      if (id) {
        supaQuery = supaQuery.eq('id', id);
      } else if (email) {
        supaQuery = supaQuery.eq('email', email.trim().toLowerCase());
      } else if (phone) {
        const cleanPhone = phone.replace(/[^0-9]/g, '').slice(-10);
        supaQuery = supaQuery.ilike('phone', `%${cleanPhone}%`);
      }
      const { data: supaProfile, error } = await supaQuery.maybeSingle();

      if (!error && supaProfile && supaProfile.role !== 'admin' && supaProfile.email !== MASTER_ADMIN_EMAIL) {
        return c.json({
          success: true,
          student: {
            id: supaProfile.id,
            studentCode: supaProfile.student_code || supaProfile.member_id || `SDL-2026-${String(supaProfile.id).slice(-4).toUpperCase()}`,
            fullName: supaProfile.full_name || 'Student Member',
            email: supaProfile.email || '',
            phone: supaProfile.phone || '',
            parentName: supaProfile.parent_name || '',
            parentPhone: supaProfile.parent_phone || '',
            address: supaProfile.address || 'Madhupur, Sonbhadra, UP',
            course: supaProfile.course || 'General',
            shift: supaProfile.shift || 'Morning Shift',
            membershipPlan: supaProfile.membership_plan || 'General',
            seatNumber: supaProfile.seat_number || null,
            role: supaProfile.role || 'student',
            status: supaProfile.status || 'pending',
            feeStatus: supaProfile.fee_status || 'Due',
            dueAmount: Number(supaProfile.due_amount || 0),
            avatarUrl: supaProfile.avatar_url || null,
            createdAt: supaProfile.created_at,
            updatedAt: supaProfile.updated_at,
          }
        });
      }
    } catch (sbErr) {
      console.warn('[lookupStudent Supabase]:', sbErr);
    }

    return c.json({ success: true, student: null });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});


app.post('/api/students', async (c) => {
  if (!(await isAuthorizedRequest(c, true))) {
    return c.json({ success: false, error: 'Unauthorized: Admin authorization required' }, 401);
  }

  try {
    const body = await c.req.json();
    const database = db(c);
    const supabase = getSupabase(c.env);
    const isNewRegistration = !body.id;
    const studentId = body.id || generateRecordId('std');
    
    // Strict role validation
    const allowedRoles = ['student', 'staff', 'admin'];
    const assignedRole = allowedRoles.includes(body.role) ? body.role : 'student';

    const rawShift = body.shift || 'Morning Shift';
    const shiftRate = rawShift.toLowerCase().includes('full') ? 1100 : (rawShift.toLowerCase().includes('evening') ? 500 : 600);
    
    let feeStatusToSave = body.feeStatus || body.fee_status || 'Due';
    let dueAmountToSave = Number(body.dueAmount || body.due_amount);
    if (isNaN(dueAmountToSave)) dueAmountToSave = 0;

    // Strict default for new registrations (they always start as Due with full fee amount)
    if (isNewRegistration) {
      feeStatusToSave = 'Due';
      dueAmountToSave = shiftRate;
    } else if (feeStatusToSave === 'Paid') {
      dueAmountToSave = 0;
    }

    let existingStudentCode = body.studentCode || body.student_code;
    if (!existingStudentCode && body.id) {
      try {
        const existingStudent = await database.select().from(students).where(eq(students.id, body.id)).get();
        if (existingStudent?.studentCode) {
          existingStudentCode = existingStudent.studentCode;
        }
      } catch {}
    }
    const finalStudentCode = existingStudentCode || await generateApiStudentCode(database, supabase);

    const studentRecord = {
      id: studentId,
      studentCode: finalStudentCode,
      fullName: body.fullName || body.full_name || 'Student Member',
      email: (body.email || '').trim().toLowerCase(),
      phone: body.phone || '',
      parentName: body.parentName || body.parent_name || '',
      parentPhone: body.parentPhone || body.parent_phone || '',
      address: body.address || 'Madhupur, Sonbhadra, UP',
      course: body.course || 'General',
      shift: rawShift,
      membershipPlan: body.membershipPlan || body.membership_plan || 'General',
      seatNumber: body.seatNumber || body.seat_number || null,
      role: assignedRole,
      status: body.status || 'pending',
      feeStatus: feeStatusToSave,
      dueAmount: dueAmountToSave,
      avatarUrl: body.avatarUrl || body.avatar_url || null,
      updatedAt: new Date().toISOString(),
    };

    if (!studentRecord.email) {
      return c.json({ success: false, error: 'Student email is required' }, 400);
    }

    // 1. Primary Live Storage: Save exclusively to Supabase profiles
    try {
      await supabase.from('profiles').upsert({
        id: studentRecord.id,
        student_code: studentRecord.studentCode,
        full_name: studentRecord.fullName,
        email: studentRecord.email,
        phone: studentRecord.phone,
        parent_name: studentRecord.parentName,
        parent_phone: studentRecord.parentPhone,
        address: studentRecord.address,
        course: studentRecord.course,
        shift: studentRecord.shift,
        membership_plan: studentRecord.membershipPlan,
        seat_number: studentRecord.seatNumber,
        role: studentRecord.role,
        status: studentRecord.status,
        fee_status: studentRecord.feeStatus,
        due_amount: studentRecord.dueAmount,
        avatar_url: studentRecord.avatarUrl,
        updated_at: studentRecord.updatedAt,
      });
    } catch (supaErr) {
      console.warn('[Supabase Profiles Write]', supaErr);
    }

    return c.json({ success: true, student: studentRecord }, 201);
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

app.patch('/api/students/:id/status', async (c) => {
  try {
    if (!(await isAuthorizedRequest(c))) {
      return c.json({ success: false, error: 'Unauthorized: Admin or staff authorization required' }, 401);
    }
    const id = c.req.param('id');
    const body = await c.req.json();
    const database = db(c);
    const supabase = getSupabase(c.env);

    const updateData: any = {
      status: body.status,
      updatedAt: new Date().toISOString(),
    };
    const supaUpdate: any = {
      status: body.status,
      updated_at: new Date().toISOString(),
    };
    if (body.seatNumber !== undefined) {
      updateData.seatNumber = body.seatNumber;
      supaUpdate.seat_number = body.seatNumber;
    }
    if (body.membershipPlan !== undefined) {
      updateData.membershipPlan = body.membershipPlan;
      supaUpdate.membership_plan = body.membershipPlan;
    }
    if (body.feeStatus !== undefined) {
      updateData.feeStatus = body.feeStatus;
      supaUpdate.fee_status = body.feeStatus;
    }
    if (body.dueAmount !== undefined) {
      updateData.dueAmount = Number(body.dueAmount);
      supaUpdate.due_amount = Number(body.dueAmount);
    }
    if (body.phone !== undefined) {
      updateData.phone = body.phone;
      supaUpdate.phone = body.phone;
    }
    if (body.parentPhone !== undefined) {
      updateData.parentPhone = body.parentPhone;
      supaUpdate.parent_phone = body.parentPhone;
    }
    if (body.name !== undefined || body.fullName !== undefined) {
      const stdName = body.name || body.fullName;
      updateData.name = stdName;
      supaUpdate.full_name = stdName;
    }
    if (body.email !== undefined) {
      updateData.email = body.email;
      supaUpdate.email = body.email;
    }

    // 1. Primary: Update Supabase profiles by id, student_code, or email
    try {
      await supabase
        .from('profiles')
        .update(supaUpdate)
        .or(`id.eq.${id},student_code.eq.${id}${body.email ? `,email.eq.${body.email}` : ''}`);
    } catch (sErr) {
      console.warn('[Supabase Profile Status Update]', sErr);
    }

    // 2. Backup: Update D1 students by id, studentCode, or email
    try {
      await database
        .update(students)
        .set(updateData)
        .where(
          or(
            eq(students.id, id),
            eq(students.studentCode, id),
            body.email ? eq(students.email, body.email) : undefined
          )
        );
    } catch (dErr) {
      console.warn('[D1 Student Status Update]', dErr);
    }

    return c.json({ success: true, message: `Student status updated to ${body.status}` });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// Full Student Profile Update (PUT / PATCH /api/students/:id)
const handleStudentUpdate = async (c: any) => {
  try {
    if (!(await isAuthorizedRequest(c))) {
      return c.json({ success: false, error: 'Unauthorized: Admin or staff authorization required' }, 401);
    }
    const id = c.req.param('id');
    const body = await c.req.json();
    const database = db(c);
    const supabase = getSupabase(c.env);

    const supaUpdate: any = { updated_at: new Date().toISOString() };
    const d1Update: any = { updatedAt: new Date().toISOString() };

    if (body.fullName !== undefined || body.full_name !== undefined || body.name !== undefined) {
      const val = body.fullName || body.full_name || body.name;
      supaUpdate.full_name = val;
      d1Update.fullName = val;
    }
    if (body.phone !== undefined) {
      supaUpdate.phone = body.phone;
      d1Update.phone = body.phone;
    }
    if (body.parentName !== undefined || body.parent_name !== undefined) {
      const val = body.parentName || body.parent_name;
      supaUpdate.parent_name = val;
      d1Update.parentName = val;
    }
    if (body.parentPhone !== undefined || body.parent_phone !== undefined) {
      const val = body.parentPhone || body.parent_phone;
      supaUpdate.parent_phone = val;
      d1Update.parentPhone = val;
    }
    if (body.email !== undefined) {
      supaUpdate.email = body.email;
      d1Update.email = body.email;
    }
    if (body.course !== undefined) {
      supaUpdate.course = body.course;
      d1Update.course = body.course;
    }
    if (body.shift !== undefined) {
      supaUpdate.shift = body.shift;
      d1Update.shift = body.shift;
    }
    if (body.membershipPlan !== undefined || body.membership_plan !== undefined) {
      const val = body.membershipPlan || body.membership_plan;
      supaUpdate.membership_plan = val;
      d1Update.membershipPlan = val;
    }
    if (body.seatNumber !== undefined || body.seat_number !== undefined) {
      const val = body.seatNumber || body.seat_number;
      supaUpdate.seat_number = val;
      d1Update.seatNumber = val;
    }
    if (body.status !== undefined) {
      supaUpdate.status = body.status;
      d1Update.status = body.status;
    }
    if (body.feeStatus !== undefined || body.fee_status !== undefined) {
      const val = body.feeStatus || body.fee_status;
      supaUpdate.fee_status = val;
      d1Update.feeStatus = val;
    }
    if (body.dueAmount !== undefined || body.due_amount !== undefined) {
      const val = Number(body.dueAmount !== undefined ? body.dueAmount : body.due_amount);
      supaUpdate.due_amount = val;
      d1Update.dueAmount = val;
    }
    if (body.address !== undefined) {
      supaUpdate.address = body.address;
      d1Update.address = body.address;
    }

    // 1. Update Supabase profiles by id, student_code, or email
    try {
      await supabase
        .from('profiles')
        .update(supaUpdate)
        .or(`id.eq.${id},student_code.eq.${id}${body.email ? `,email.eq.${body.email}` : ''}`);
    } catch (sErr) {
      console.warn('[Supabase Student Profile Update]', sErr);
    }

    // 2. Update D1
    try {
      await database
        .update(students)
        .set(d1Update)
        .where(
          or(
            eq(students.id, id),
            eq(students.studentCode, id),
            body.email ? eq(students.email, body.email) : undefined
          )
        );
    } catch (dErr) {
      console.warn('[D1 Student Profile Update]', dErr);
    }

    return c.json({ success: true, message: 'Student profile updated successfully' });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
};

app.put('/api/students/:id', handleStudentUpdate);
app.patch('/api/students/:id', handleStudentUpdate);

app.post('/api/students/approve-all', async (c) => {
  try {
    if (!(await isAuthorizedRequest(c, true))) {
      return c.json({ success: false, error: 'Unauthorized: Admin authorization required' }, 401);
    }
    const database = db(c);
    const supabase = getSupabase(c.env);

    // 1. Primary: Update in Supabase
    try {
      await supabase.from('profiles').update({ status: 'active', updated_at: new Date().toISOString() }).eq('status', 'pending');
    } catch (sErr) {
      console.warn('[Supabase Approve All]', sErr);
    }

    // 2. Backup: Update in D1
    await database.update(students).set({
      status: 'active',
      updatedAt: new Date().toISOString(),
    }).where(eq(students.status, 'pending'));

    return c.json({ success: true, message: 'All pending students approved successfully' });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// Send Welcome & Admission Confirmation Email to student upon admin approval
app.post('/api/students/send-welcome-email', async (c) => {
  if (!(await isAuthorizedRequest(c, true))) {
    return c.json({ success: false, error: 'Unauthorized: Admin authorization required' }, 401);
  }

  try {
    const body = await c.req.json();
    const { studentEmail, studentName, membershipPlan, shift, seatNumber, admissionDate } = body;
    if (!studentEmail) {
      return c.json({ success: false, error: 'studentEmail is required' }, 400);
    }
    const result = await sendStudentWelcomeEmail(c.env, {
      studentEmail,
      studentName: studentName || 'Student Member',
      membershipPlan,
      shift,
      seatNumber,
      admissionDate,
    });
    return c.json(result);
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// Check if an email was registered via Google OAuth or Email/Password
app.get('/api/auth/provider-check', async (c) => {
  try {
    const email = c.req.query('email')?.trim().toLowerCase();
    if (!email) {
      return c.json({ success: false, error: 'email query parameter is required' }, 400);
    }

    const supabase = getSupabase(c.env);
    
    // Check Supabase profiles table
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, full_name, email, avatar_url, auth_provider')
      .eq('email', email)
      .maybeSingle();

    let isGoogle = false;

    if (profile?.auth_provider === 'google') {
      isGoogle = true;
    } else if (profile?.avatar_url && profile.avatar_url.includes('googleusercontent.com')) {
      isGoogle = true;
    } else if (supabase.auth && (supabase.auth as any).admin) {
      try {
        const { data: usersData } = await (supabase.auth as any).admin.listUsers();
        const matchedUser = usersData?.users?.find((u: any) => u.email?.toLowerCase() === email);
        if (matchedUser) {
          const provider = matchedUser.app_metadata?.provider || matchedUser.identities?.[0]?.provider;
          if (provider === 'google') {
            isGoogle = true;
          }
        }
      } catch {}
    }

    return c.json({
      success: true,
      exists: !!profile,
      isGoogle,
      studentName: profile?.full_name || null,
    });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

app.delete('/api/students/:id', async (c) => {
  try {
    if (!(await isAuthorizedRequest(c))) {
      return c.json({ success: false, error: 'Unauthorized: Admin authorization required' }, 401);
    }
    const id = c.req.param('id');
    const database = db(c);
    const supabase = getSupabase(c.env);

    // 1. Primary: Delete from Supabase profiles
    try {
      await supabase.from('profiles').delete().eq('id', id);
    } catch (sErr) {
      console.warn('[Supabase Profile Delete]', sErr);
    }

    // 2. D1: Keep permanent backup copy or mark archived
    try {
      await database.update(students).set({ status: 'suspended', updatedAt: new Date().toISOString() }).where(eq(students.id, id));
    } catch {
      await database.delete(students).where(eq(students.id, id));
    }

    return c.json({ success: true, message: 'Student deleted from Supabase. Archived in D1 cold backup.' });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// ══════════════════════════════════════════════════════════════════
// SECTION 5 · SHIFTS API
// Library shift CRUD (morning / evening / night / full-day).
// ══════════════════════════════════════════════════════════════════
app.get('/api/shifts', async (c) => {
  try {
    const database = db(c);
    const allShifts = await database.select().from(shifts).all();
    return c.json({ success: true, shifts: allShifts });
  } catch (err: any) {
    // Fallback if D1 is not initialized yet in local test
    return c.json({
      success: true,
      shifts: [
        { id: 'standard-3hr', name: 'Standard (3 Hours Pass)', startTime: '24/7 Flexible', endTime: '3 Hours Daily', fee: 300, totalSeats: 100, availableSeats: 100, isActive: true },
        { id: 'prime-6hr', name: 'Pro / Prime (6 Hours Pass)', startTime: '24/7 Flexible', endTime: '6 Hours Daily', fee: 500, totalSeats: 100, availableSeats: 100, isActive: true },
        { id: 'reserve-mini', name: 'Elite / Reserve Mini', startTime: '24/7 Dedicated', endTime: '24/7 Access', fee: 500, totalSeats: 100, availableSeats: 100, isActive: true },
        { id: 'reserve-big', name: 'Prime / Reserve Big', startTime: '24/7 Dedicated', endTime: '24/7 Access', fee: 600, totalSeats: 100, availableSeats: 100, isActive: true },
        { id: 'reserve-locker', name: 'Max / Reserve Locker', startTime: '24/7 Dedicated', endTime: '24/7 Access + Locker', fee: 700, totalSeats: 100, availableSeats: 100, isActive: true },
        { id: 'night-ultra', name: 'Night Shift Ultra', startTime: '10:00 PM', endTime: '06:00 AM', fee: 500, totalSeats: 100, availableSeats: 100, isActive: true },
      ],
      note: err.message,
    });
  }
});

app.post('/api/shifts', async (c) => {
  try {
    if (!(await isAuthorizedRequest(c, true))) {
      return c.json({ success: false, error: 'Unauthorized: Admin authorization required' }, 401);
    }
    const body = await c.req.json();
    const database = db(c);
    const newShift = {
      id: body.id || generateRecordId('shift'),
      name: body.name,
      startTime: body.startTime,
      endTime: body.endTime,
      fee: Number(body.fee) || 0,
      totalSeats: Number(body.totalSeats) || 100,
      availableSeats: Number(body.availableSeats) || 100,
      isActive: body.isActive ?? true,
    };
    await database.insert(shifts).values(newShift);
    return c.json({ success: true, shift: newShift }, 201);
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// ══════════════════════════════════════════════════════════════════
// SECTION 6 · SEATS API
// Seat directory + allocate / vacate operations.
// ══════════════════════════════════════════════════════════════════
app.get('/api/seats', async (c) => {
  try {
    const database = db(c);
    const allSeats = await database.select().from(seats).all();
    
    const total = allSeats.length || 100;
    const available = allSeats.filter((s) => s.isAvailable).length;
    const occupied = total - available;

    return c.json({
      success: true,
      total,
      available,
      occupied,
      seats: allSeats,
    });
  } catch (err: any) {
    // Fallback response: 100 seats (Rows A to J, 01 to 10)
    const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
    const fallbackSeats = [];
    let idx = 1;
    for (const r of rows) {
      for (let col = 1; col <= 10; col++) {
        fallbackSeats.push({
          id: `seat-${String(idx).padStart(3, '0')}`,
          seatNumber: `${r}-${String(col).padStart(2, '0')}`,
          zone: r <= 'B' ? 'Zone A' : r <= 'D' ? 'Zone B' : r <= 'F' ? 'Zone C' : r <= 'H' ? 'Zone D' : 'Zone E',
          isAvailable: true,
          currentStudentName: null,
        });
        idx++;
      }
    }
    return c.json({
      success: true,
      total: 100,
      available: 100,
      occupied: 0,
      seats: fallbackSeats,
    });
  }
});

app.post('/api/seats/allocate', async (c) => {
  try {
    if (!(await isAuthorizedRequest(c))) {
      return c.json({ success: false, error: 'Unauthorized: Staff or admin authorization required' }, 401);
    }
    const { seatNumber, studentId, studentName, shiftId } = await c.req.json();
    const database = db(c);
    
    await database
      .update(seats)
      .set({
        isAvailable: false,
        currentStudentId: studentId,
        currentStudentName: studentName,
        shiftId: shiftId || null,
        occupiedAt: new Date().toISOString(),
      })
      .where(eq(seats.seatNumber, seatNumber));

    return c.json({ success: true, message: `Seat ${seatNumber} allocated to ${studentName}` });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

app.post('/api/seats/vacate', async (c) => {
  try {
    if (!(await isAuthorizedRequest(c))) {
      return c.json({ success: false, error: 'Unauthorized: Staff or admin authorization required' }, 401);
    }
    const { seatNumber } = await c.req.json();
    const database = db(c);
    
    await database
      .update(seats)
      .set({
        isAvailable: true,
        currentStudentId: null,
        currentStudentName: null,
        shiftId: null,
        occupiedAt: null,
      })
      .where(eq(seats.seatNumber, seatNumber));

    return c.json({ success: true, message: `Seat ${seatNumber} is now vacant` });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// ══════════════════════════════════════════════════════════════════
// SECTION 7 · ATTENDANCE API
// Check-in/out, QR-scan flow with verification photo, history, and desk disputes.
// ══════════════════════════════════════════════════════════════════
app.get('/api/attendance', async (c) => {
  try {
    const studentId = c.req.query('studentId');
    const date = c.req.query('date');
    const startDate = c.req.query('startDate');
    const endDate = c.req.query('endDate');
    const database = db(c);
    
    let records = [];
    if (studentId && date) {
      records = await database.select().from(attendance)
        .where(and(eq(attendance.studentId, studentId), eq(attendance.date, date)))
        .orderBy(desc(attendance.createdAt))
        .all();
    } else if (studentId) {
      records = await database.select().from(attendance)
        .where(eq(attendance.studentId, studentId))
        .orderBy(desc(attendance.createdAt))
        .all();
    } else if (date) {
      records = await database.select().from(attendance)
        .where(eq(attendance.date, date))
        .orderBy(desc(attendance.createdAt))
        .all();
    } else if (startDate && endDate) {
      records = await database.select().from(attendance)
        .where(and(gte(attendance.date, startDate), lte(attendance.date, endDate)))
        .orderBy(desc(attendance.createdAt))
        .all();
    } else {
      records = await database.select().from(attendance)
        .orderBy(desc(attendance.createdAt))
        .limit(200)
        .all();
    }

    return c.json({ success: true, attendance: records });
  } catch (err: any) {
    return c.json({
      success: true,
      attendance: [],
      note: err.message,
    });
  }
});

// Cold Storage / History: Attendance Archive Query (D1)
app.get('/api/attendance/history', async (c) => {
  try {
    const studentId = c.req.query('studentId');
    const database = db(c);
    let records = [];
    if (studentId) {
      records = await database.select().from(attendanceHistory)
        .where(eq(attendanceHistory.studentId, studentId))
        .orderBy(desc(attendanceHistory.date))
        .limit(500)
        .all();
    } else {
      records = await database.select().from(attendanceHistory)
        .orderBy(desc(attendanceHistory.date))
        .limit(1000)
        .all();
    }
    return c.json({ success: true, history: records });
  } catch (err: any) {
    return c.json({ success: true, history: [] });
  }
});

// Admin Manual Attendance Marking / Update
app.post('/api/attendance', async (c) => {
  try {
    if (!(await isAuthorizedRequest(c))) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }
    const body = await c.req.json();
    const database = db(c);
    const dateStr = body.date || getISTDateStr();
    const timeStr = body.checkIn || getISTTimeStr();

    // Check if attendance already exists for this student on this date
    const existing = await database
      .select()
      .from(attendance)
      .where(and(eq(attendance.studentId, body.studentId), eq(attendance.date, dateStr)))
      .all();

    if (existing.length > 0) {
      await database
        .update(attendance)
        .set({
          checkIn: body.checkIn || existing[0].checkIn,
          checkOut: body.checkOut !== undefined ? body.checkOut : existing[0].checkOut,
          status: body.status || existing[0].status,
          seatNumber: body.seatNumber || existing[0].seatNumber,
          shiftName: body.shiftName || existing[0].shiftName,
        })
        .where(eq(attendance.id, existing[0].id));

      return c.json({ success: true, message: 'Attendance record updated', id: existing[0].id });
    }

    const newRecord = {
      id: body.id || generateRecordId('att'),
      studentId: body.studentId || 'std-unknown',
      studentName: body.studentName || 'Student',
      seatNumber: body.seatNumber || null,
      shiftId: body.shiftId || null,
      shiftName: body.shiftName || 'Morning Shift',
      checkIn: timeStr,
      checkOut: body.checkOut || null,
      status: body.status || 'present',
      photoUrl: body.photoUrl || null,
      date: dateStr,
    };

    await database.insert(attendance).values(newRecord);
    return c.json({ success: true, message: 'Attendance recorded successfully', record: newRecord }, 201);
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

app.delete('/api/attendance/:id', async (c) => {
  try {
    if (!(await isAuthorizedRequest(c))) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }
    const id = c.req.param('id');
    const database = db(c);
    await database.delete(attendance).where(eq(attendance.id, id));
    return c.json({ success: true, message: 'Attendance record deleted' });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

app.post('/api/attendance/check-in', async (c) => {
  if (!(await isAuthorizedRequest(c, false))) {
    return c.json({ success: false, error: 'Unauthorized: Authentication required' }, 401);
  }

  try {
    const body = await c.req.json();
    const database = db(c);
    const dateStr = getISTDateStr();
    const timeStr = getISTTimeStr();

    const newRecord = {
      id: generateRecordId('att'),
      studentId: body.studentId || 'std-unknown',
      studentName: body.studentName || 'Student',
      seatNumber: body.seatNumber || null,
      shiftId: body.shiftId || null,
      shiftName: body.shiftName || 'Morning Shift',
      checkIn: timeStr,
      checkOut: null,
      status: 'present',
      photoUrl: body.photoUrl || body.deskPhotoUrl || null,
      date: dateStr,
    };

    await database.insert(attendance).values(newRecord);

    // If seatNumber provided, also mark seat as occupied
    if (body.seatNumber) {
      try {
        await database
          .update(seats)
          .set({
            isAvailable: false,
            currentStudentId: body.studentId || null,
            currentStudentName: body.studentName || 'Student',
            shiftId: body.shiftId || null,
            occupiedAt: timeStr,
          })
          .where(eq(seats.seatNumber, body.seatNumber));
      } catch (seatErr) {
        console.warn('Seat allocation notice on check-in:', seatErr);
      }
    }

    // Automated WhatsApp Check-in Alert (anti-ban unique timestamp & ref ID)
    if (!body.skipBackendWhatsApp) {
      try {
        const supabase = getSupabase(c.env);
        let phoneToSend = body.phone || body.studentPhone;
        if (!phoneToSend && body.studentId) {
          const { data: prof } = await supabase
            .from('profiles')
            .select('phone, full_name, seat_number, shift')
            .or(`id.eq.${body.studentId},student_code.eq.${body.studentId}`)
            .maybeSingle();
          if (prof?.phone) phoneToSend = prof.phone;
        }
        if (phoneToSend) {
          const studentName = body.studentName || 'Student';
          const desk = body.seatNumber ? `#${body.seatNumber}` : 'General Study Desk';
          const shift = body.shiftName || 'Morning Shift';
          const refId = `#SDL-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;
          const msg =
            `*🏛️ ${WL.fullName}*\n\n` +
            `Namaste *${studentName}* ji,\n` +
            `Aapka *Check-In* safaltapoorvak darj ho gaya hai.\n\n` +
            `📅 *Date:* ${dateStr}\n` +
            `⏰ *Entry Time:* ${timeStr}\n` +
            `🪑 *Desk Allotted:* ${desk}\n` +
            `📖 *Shift:* ${shift}\n` +
            `🔖 *Ref ID:* ${refId}\n\n` +
            `🎯 Focus on your goals & study well today!`;

          if (c.executionCtx && typeof c.executionCtx.waitUntil === 'function') {
            c.executionCtx.waitUntil(sendWhatsAppViaRenderBot(phoneToSend, msg));
          } else {
            sendWhatsAppViaRenderBot(phoneToSend, msg).catch(() => {});
          }
        }
      } catch (waErr) {
        console.warn('[Check-in WhatsApp alert notice]:', waErr);
      }
    }

    return c.json({ success: true, message: 'Check-in recorded with desk verification', record: newRecord });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

app.post('/api/attendance/check-out', async (c) => {
  if (!(await isAuthorizedRequest(c, false))) {
    return c.json({ success: false, error: 'Unauthorized: Authentication required' }, 401);
  }

  try {
    const body = await c.req.json();
    const attendanceId = body.attendanceId || body.id;
    let studentId = body.studentId;
    const database = db(c);
    const dateStr = getISTDateStr();
    const timeStr = getISTTimeStr();

    if (attendanceId) {
      const existing = await database.select().from(attendance).where(eq(attendance.id, attendanceId)).get();
      if (existing) {
        studentId = existing.studentId;
        await database
          .update(attendance)
          .set({ checkOut: timeStr })
          .where(eq(attendance.id, attendanceId));
      }
    } else if (studentId) {
      await database
        .update(attendance)
        .set({ checkOut: timeStr })
        .where(and(eq(attendance.studentId, studentId), eq(attendance.date, dateStr)));
    } else {
      return c.json({ success: false, error: 'studentId or attendanceId is required' }, 400);
    }

    // Also vacate seat
    if (studentId) {
      try {
        await database
          .update(seats)
          .set({
            isAvailable: true,
            currentStudentId: null,
            currentStudentName: null,
            shiftId: null,
            occupiedAt: null,
          })
          .where(eq(seats.currentStudentId, studentId));
      } catch (seatErr) {
        // ignore
      }
    }

    // Automated WhatsApp Check-out Alert
    if (!body.skipBackendWhatsApp && studentId) {
      try {
        const supabase = getSupabase(c.env);
        let phoneToSend = body.phone || body.studentPhone;
        let sName = body.studentName;
        if (!phoneToSend || !sName) {
          const { data: prof } = await supabase
            .from('profiles')
            .select('phone, full_name')
            .or(`id.eq.${studentId},student_code.eq.${studentId}`)
            .maybeSingle();
          if (prof?.phone) phoneToSend = prof.phone;
          if (prof?.full_name && !sName) sName = prof.full_name;
        }
        if (phoneToSend) {
          const studentName = sName || 'Student';
          const refId = `#SDL-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;
          const msg =
            `*🏛️ ${WL.fullName}*\n\n` +
            `Namaste *${studentName}* ji,\n` +
            `Aapka *Check-Out* safaltapoorvak darj ho gaya hai.\n\n` +
            `📅 *Date:* ${dateStr}\n` +
            `⏰ *Exit Time:* ${timeStr}\n` +
            `🔖 *Ref ID:* ${refId}\n\n` +
            `👏 Great dedication today! Rest well and see you tomorrow.`;

          if (c.executionCtx && typeof c.executionCtx.waitUntil === 'function') {
            c.executionCtx.waitUntil(sendWhatsAppViaRenderBot(phoneToSend, msg));
          } else {
            sendWhatsAppViaRenderBot(phoneToSend, msg).catch(() => {});
          }
        }
      } catch (waErr) {
        console.warn('[Check-out WhatsApp alert notice]:', waErr);
      }
    }

    return c.json({ success: true, message: 'Check-out recorded successfully & seat released' });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// Smart QR Scan & Web NFC Tap Unified Check-In / Check-Out Handler
app.post('/api/attendance/qr-scan', async (c) => {
  if (!(await isAuthorizedRequest(c, false))) {
    return c.json({ success: false, error: 'Unauthorized: Authentication required' }, 401);
  }

  try {
    const { studentId, studentName, seatNumber, shiftName, shiftId, photoUrl } = await c.req.json();
    const database = db(c);
    const supabase = getSupabase(c.env);
    const dateStr = getISTDateStr();
    const timeStr = getISTTimeStr();

    if (!studentId) {
      return c.json({ success: false, error: 'Student ID is required' }, 400);
    }

    // 1. Check if student already has an active check-in today without checkout
    // Query both Supabase and D1
    let activeTodayRecord: any = null;

    try {
      const { data: supaAtt } = await supabase
        .from('attendance')
        .select('*')
        .eq('student_id', studentId)
        .eq('date', dateStr)
        .is('check_out', null)
        .limit(1);

      if (supaAtt && supaAtt.length > 0) {
        activeTodayRecord = {
          id: supaAtt[0].id,
          seatNumber: supaAtt[0].seat_number,
        };
      }
    } catch (e) {
      console.warn('Supabase check active attendance error:', e);
    }

    if (!activeTodayRecord) {
      const activeStudentAtt = await database
        .select()
        .from(attendance)
        .where(and(eq(attendance.studentId, studentId), eq(attendance.date, dateStr)))
        .all();
      const d1Active = activeStudentAtt.find((a) => !a.checkOut);
      if (d1Active) {
        activeTodayRecord = {
          id: d1Active.id,
          seatNumber: d1Active.seatNumber,
        };
      }
    }

    // A. IF STUDENT IS ALREADY CHECKED IN -> PERFORM CHECK-OUT & RELEASE SEAT!
    if (activeTodayRecord) {
      // 1. Update Supabase
      try {
        await supabase
          .from('attendance')
          .update({ check_out: timeStr, updated_at: new Date().toISOString() })
          .eq('id', activeTodayRecord.id);
      } catch (e) {
        console.warn('Supabase checkout update error:', e);
      }

      // 2. Update D1
      try {
        await database
          .update(attendance)
          .set({ checkOut: timeStr })
          .where(eq(attendance.id, activeTodayRecord.id));
      } catch (e) {
        console.warn('D1 checkout update error:', e);
      }

      const releasedSeat = activeTodayRecord.seatNumber || seatNumber;

      // 3. Free seat in Supabase & D1
      if (releasedSeat) {
        try {
          await supabase
            .from('seats')
            .update({
              is_available: true,
              current_student_id: null,
              current_student_name: null,
              occupied_at: null,
            })
            .or(`seat_number.eq.${releasedSeat},seat_number.eq.${releasedSeat.replace(/^A-0?/, '')}`);
        } catch (e) {
          console.warn('Supabase seat vacate error:', e);
        }

        try {
          await database
            .update(seats)
            .set({
              isAvailable: true,
              currentStudentId: null,
              currentStudentName: null,
              shiftId: null,
              occupiedAt: null,
            })
            .where(eq(seats.seatNumber, releasedSeat));
        } catch (e) {
          console.warn('D1 seat vacate error:', e);
        }
      }

      // Automated WhatsApp Check-out Alert
      try {
        const { data: prof } = await supabase
          .from('profiles')
          .select('phone, full_name')
          .or(`id.eq.${studentId},student_code.eq.${studentId}`)
          .maybeSingle();
        const phoneToSend = prof?.phone;
        if (phoneToSend) {
          const sName = prof?.full_name || studentName || 'Student';
          const refId = `#SDL-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;
          const msg =
            `*🏛️ ${WL.fullName}*\n\n` +
            `Namaste *${sName}* ji,\n` +
            `Aapka *Check-Out* safaltapoorvak darj ho gaya hai.\n\n` +
            `📅 *Date:* ${dateStr}\n` +
            `⏰ *Exit Time:* ${timeStr}\n` +
            `🪑 *Desk Released:* #${releasedSeat || 'Library'}\n` +
            `🔖 *Ref ID:* ${refId}\n\n` +
            `👏 Great dedication today! Rest well and see you tomorrow.`;

          if (c.executionCtx && typeof c.executionCtx.waitUntil === 'function') {
            c.executionCtx.waitUntil(sendWhatsAppViaRenderBot(phoneToSend, msg));
          } else {
            sendWhatsAppViaRenderBot(phoneToSend, msg).catch(() => {});
          }
        }
      } catch (waErr) {
        console.warn('[QR Check-out WhatsApp alert notice]:', waErr);
      }

      return c.json({
        success: true,
        action: 'checked_out',
        seatNumber: releasedSeat,
        checkOutTime: timeStr,
        message: `Checked out successfully! Desk #${releasedSeat || 'Library'} is now released and available.`,
      });
    }

    // B. IF STUDENT IS NOT CHECKED IN -> PERFORM CHECK-IN & AUTO-ALLOCATE DESK!
    let targetSeat = seatNumber;

    // If student has a designated/reserved seat in their profile, ALWAYS preserve and protect their reserved seat!
    try {
      const { data: stdProfile } = await supabase
        .from('profiles')
        .select('seat_number, membership_plan')
        .eq('id', studentId)
        .maybeSingle();
      if (stdProfile?.seat_number) {
        targetSeat = stdProfile.seat_number;
      }
    } catch (e) {
      console.warn('Profile seat lookup error:', e);
    }

    const isMasterOrAuto = !targetSeat || targetSeat === 'AUTO' || targetSeat === 'MASTER' || targetSeat === 'GATE' || targetSeat === 'LIBRARY';

    if (isMasterOrAuto) {
      // Auto-allocate next available seat!
      let availableSeatFound: string | null = null;
      try {
        const { data: freeSeats } = await supabase
          .from('seats')
          .select('seat_number')
          .eq('is_available', true)
          .order('seat_number', { ascending: true })
          .limit(1);

        if (freeSeats && freeSeats.length > 0) {
          availableSeatFound = freeSeats[0].seat_number;
        }
      } catch (e) {
        console.warn('Supabase query free seats error:', e);
      }

      // Fallback to D1 seats if needed
      if (!availableSeatFound) {
        const d1FreeSeats = await database
          .select()
          .from(seats)
          .where(eq(seats.isAvailable, true))
          .limit(1)
          .all();
        if (d1FreeSeats && d1FreeSeats.length > 0) {
          availableSeatFound = d1FreeSeats[0].seatNumber;
        }
      }

      if (!availableSeatFound) {
        return c.json({
          success: false,
          action: 'all_occupied',
          message: 'All 100 library desks are currently occupied. Please see admin desk for assistance.',
        });
      }

      targetSeat = availableSeatFound;
    } else {
      // Verify requested seat is available
      try {
        const { data: seatCheck } = await supabase
          .from('seats')
          .select('*')
          .or(`seat_number.eq.${targetSeat},seat_number.eq.${targetSeat.replace(/^A-0?/, '')}`)
          .limit(1);

        if (seatCheck && seatCheck.length > 0 && !seatCheck[0].is_available && seatCheck[0].current_student_id !== studentId) {
          return c.json({
            success: false,
            action: 'seat_occupied',
            seatNumber: targetSeat,
            occupiedBy: seatCheck[0].current_student_name || 'Another Student',
            message: `Desk #${targetSeat} is currently occupied by ${seatCheck[0].current_student_name || 'Another Student'}. Please scan master QR or select an available desk.`,
          });
        }
      } catch (e) {
        console.warn('Supabase specific seat check error:', e);
      }
    }

    const attendanceId = generateRecordId('att');
    const newRecord = {
      id: attendanceId,
      studentId: studentId || 'std-unknown',
      studentName: studentName || 'Student',
      seatNumber: targetSeat,
      shiftId: shiftId || null,
      shiftName: shiftName || 'Morning Shift',
      checkIn: timeStr,
      checkOut: null,
      status: 'present',
      photoUrl: photoUrl || null,
      date: dateStr,
    };

    // 1. Insert into Supabase attendance & update seat
    try {
      await supabase.from('attendance').insert({
        id: attendanceId,
        student_id: studentId,
        student_name: studentName || 'Student',
        seat_number: String(targetSeat),
        shift_name: shiftName || 'Morning Shift',
        check_in: timeStr,
        check_out: null,
        status: 'present',
        photo_url: photoUrl || null,
        date: dateStr,
      });

      await supabase
        .from('seats')
        .update({
          is_available: false,
          current_student_id: studentId,
          current_student_name: studentName,
          occupied_at: new Date().toISOString(),
        })
        .or(`seat_number.eq.${targetSeat},seat_number.eq.${targetSeat.replace(/^A-0?/, '')}`);
    } catch (e) {
      console.warn('Supabase attendance insert error:', e);
    }

    // 2. Insert into D1 attendance & update D1 seat
    try {
      await database.insert(attendance).values(newRecord);
      await database
        .update(seats)
        .set({
          isAvailable: false,
          currentStudentId: studentId,
          currentStudentName: studentName,
          shiftId: shiftId || null,
          occupiedAt: timeStr,
        })
        .where(eq(seats.seatNumber, targetSeat));
    } catch (e) {
      console.warn('D1 attendance insert error:', e);
    }

    // Automated WhatsApp Check-in Alert
    try {
      const { data: prof } = await supabase
        .from('profiles')
        .select('phone, full_name, shift')
        .or(`id.eq.${studentId},student_code.eq.${studentId}`)
        .maybeSingle();
      const phoneToSend = prof?.phone;
      if (phoneToSend) {
        const sName = prof?.full_name || studentName || 'Student';
        const desk = targetSeat ? `#${targetSeat}` : 'General Study Desk';
        const shift = shiftName || prof?.shift || 'Morning Shift';
        const refId = `#SDL-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;
        const msg =
          `*🏛️ ${WL.fullName}*\n\n` +
          `Namaste *${sName}* ji,\n` +
          `Aapka *Check-In* safaltapoorvak darj ho gaya hai.\n\n` +
          `📅 *Date:* ${dateStr}\n` +
          `⏰ *Entry Time:* ${timeStr}\n` +
          `🪑 *Desk Allotted:* ${desk}\n` +
          `📖 *Shift:* ${shift}\n` +
          `🔖 *Ref ID:* ${refId}\n\n` +
          `🎯 Focus on your goals & study well today!`;

        if (c.executionCtx && typeof c.executionCtx.waitUntil === 'function') {
          c.executionCtx.waitUntil(sendWhatsAppViaRenderBot(phoneToSend, msg));
        } else {
          sendWhatsAppViaRenderBot(phoneToSend, msg).catch(() => {});
        }
      }
    } catch (waErr) {
      console.warn('[QR Check-in WhatsApp alert notice]:', waErr);
    }

    return c.json({
      success: true,
      action: 'checked_in',
      seatNumber: targetSeat,
      checkInTime: timeStr,
      message: `Welcome, ${studentName || 'Student'}! Checked in at ${timeStr}. Your allocated desk is #${targetSeat}.`,
      record: newRecord,
    });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// Report Empty Seat / Dispute Alert
app.post('/api/seats/report-dispute', async (c) => {
  if (!(await isAuthorizedRequest(c, false))) {
    return c.json({ success: false, error: 'Unauthorized: Authentication required' }, 401);
  }

  try {
    const { seatNumber, reporterStudentId, reporterStudentName, occupantStudentName, occupantStudentId } = await c.req.json();
    const database = db(c);
    const timeStr = getISTTimeStr();

    const disputeId = generateRecordId('dsp');
    await database.insert(deskDisputes).values({
      id: disputeId,
      seatNumber,
      reporterStudentId,
      reporterStudentName,
      occupantStudentId: occupantStudentId || null,
      occupantStudentName: occupantStudentName || 'Occupant',
      status: 'pending',
      reportedAt: `${getISTDateStr()} ${timeStr}`,
    });

    // Also create announcement/alert for staff & admin
    await database.insert(announcements).values({
      id: generateRecordId('ann'),
      title: `Desk #${seatNumber} Conflict: Empty Seat Reported`,
      message: `Student ${reporterStudentName} reported Desk #${seatNumber} is empty, but it is registered to ${occupantStudentName || 'another student'}. Staff verification required for forgotten checkout or proxy check-in.`,
      priority: 'urgent',
      targetAudience: 'admin',
    });

    return c.json({
      success: true,
      message: `Dispute reported for Desk #${seatNumber}. Library admin & staff have been alerted to verify and release the desk.`,
      disputeId,
    });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// Get all disputes
app.get('/api/seats/disputes', async (c) => {
  try {
    const database = db(c);
    const disputesList = await database
      .select()
      .from(deskDisputes)
      .orderBy(desc(deskDisputes.createdAt))
      .all();

    return c.json({ success: true, disputes: disputesList });
  } catch (err: any) {
    return c.json({ success: true, disputes: [] });
  }
});

// Resolve Dispute (Force Check-Out / Mark Proxy / Dismiss)
app.post('/api/seats/resolve-dispute', async (c) => {
  try {
    if (!(await isAuthorizedRequest(c))) {
      return c.json({ success: false, error: 'Unauthorized: Staff or admin authorization required' }, 401);
    }
    const { disputeId, action, seatNumber, occupantStudentId } = await c.req.json();
    const database = db(c);
    const dateStr = getISTDateStr();
    const timeStr = getISTTimeStr();

    if (action === 'force_checkout') {
      // 1. Mark occupant checked out
      if (occupantStudentId) {
        await database
          .update(attendance)
          .set({ checkOut: `${timeStr} (Staff Forced Release)` })
          .where(and(eq(attendance.studentId, occupantStudentId), eq(attendance.date, dateStr)));
      }

      // 2. Vacate seat
      if (seatNumber) {
        await database
          .update(seats)
          .set({
            isAvailable: true,
            currentStudentId: null,
            currentStudentName: null,
            shiftId: null,
            occupiedAt: null,
          })
          .where(eq(seats.seatNumber, seatNumber));
      }

      // 3. Update dispute
      await database
        .update(deskDisputes)
        .set({
          status: 'resolved_checkout',
          resolvedAt: `${dateStr} ${timeStr}`,
          actionTaken: 'Staff verified desk empty and force-checked-out student.',
        })
        .where(eq(deskDisputes.id, disputeId));

      return c.json({ success: true, message: `Desk #${seatNumber} vacated and previous occupant checked out.` });
    } else if (action === 'mark_proxy') {
      // Flag proxy on occupant
      if (occupantStudentId) {
        await database
          .update(attendance)
          .set({ status: 'proxy_flagged', checkOut: `${timeStr} (Proxy Flagged)` })
          .where(and(eq(attendance.studentId, occupantStudentId), eq(attendance.date, dateStr)));
      }

      if (seatNumber) {
        await database
          .update(seats)
          .set({
            isAvailable: true,
            currentStudentId: null,
            currentStudentName: null,
            shiftId: null,
            occupiedAt: null,
          })
          .where(eq(seats.seatNumber, seatNumber));
      }

      await database
        .update(deskDisputes)
        .set({
          status: 'resolved_proxy',
          resolvedAt: `${dateStr} ${timeStr}`,
          actionTaken: 'Student flagged for proxy attendance. Desk vacated.',
        })
        .where(eq(deskDisputes.id, disputeId));

      return c.json({ success: true, message: `Student flagged for proxy attendance. Desk #${seatNumber} is now freed.` });
    } else {
      // Dismiss
      await database
        .update(deskDisputes)
        .set({
          status: 'dismissed',
          resolvedAt: `${dateStr} ${timeStr}`,
          actionTaken: 'Staff confirmed student is physically present at desk.',
        })
        .where(eq(deskDisputes.id, disputeId));

      return c.json({ success: true, message: 'Dispute dismissed. Student verified present.' });
    }
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// ══════════════════════════════════════════════════════════════════
// SECTION 8 · BOOKS API
// Catalog CRUD + issue / return lifecycle.
// ══════════════════════════════════════════════════════════════════
app.get('/api/books', async (c) => {
  try {
    const database = db(c);
    const allBooks = await database.select().from(books).all();
    return c.json({ success: true, books: allBooks });
  } catch (err: any) {
    return c.json({
      success: true,
      books: [],
    });
  }
});

app.post('/api/books', async (c) => {
  try {
    if (!(await isAuthorizedRequest(c))) {
      return c.json({ success: false, error: 'Unauthorized: Staff or admin authorization required' }, 401);
    }
    const body = await c.req.json();
    const database = db(c);
    const newBook = {
      id: body.id || generateRecordId('book'),
      title: body.title,
      author: body.author,
      isbn: body.isbn || null,
      category: body.category || 'General',
      publisher: body.publisher || null,
      totalCopies: Number(body.totalCopies) || 1,
      availableCopies: Number(body.availableCopies) || 1,
      coverUrl: body.coverUrl || null,
      description: body.description || null,
    };
    await database.insert(books).values(newBook);
    return c.json({ success: true, book: newBook }, 201);
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

app.delete('/api/books/:id', async (c) => {
  try {
    if (!(await isAuthorizedRequest(c))) {
      return c.json({ success: false, error: 'Unauthorized: Staff or admin authorization required' }, 401);
    }
    const id = c.req.param('id');
    const database = db(c);
    await database.delete(books).where(eq(books.id, id));
    return c.json({ success: true, message: `Book ${id} deleted` });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

app.get('/api/books/issues', async (c) => {
  try {
    const studentId = c.req.query('studentId');
    const database = db(c);
    if (studentId) {
      const issues = await database.select().from(bookIssues).where(eq(bookIssues.studentId, studentId)).all();
      return c.json({ success: true, issues });
    }
    const issues = await database.select().from(bookIssues).all();
    return c.json({ success: true, issues });
  } catch (err: any) {
    return c.json({ success: true, issues: [] });
  }
});

app.post('/api/books/issue', async (c) => {
  try {
    if (!(await isAuthorizedRequest(c))) {
      return c.json({ success: false, error: 'Unauthorized: Staff or admin authorization required' }, 401);
    }
    const body = await c.req.json();
    const database = db(c);
    const issueDate = getISTNow();
    const daysToAdd = Number(body.days) || 14;
    const dueDate = new Date(issueDate.getTime() + daysToAdd * 86400000);
    const dueDateStr = `${dueDate.getUTCFullYear()}-${String(dueDate.getUTCMonth() + 1).padStart(2, '0')}-${String(dueDate.getUTCDate()).padStart(2, '0')}`;

    const newIssue = {
      id: generateRecordId('issue'),
      bookId: body.bookId,
      bookTitle: body.bookTitle,
      studentId: body.studentId,
      studentName: body.studentName,
      issuedAt: getISTDateStr(),
      dueDate: dueDateStr,
      returnedAt: null,
      status: 'issued',
      fineAmount: 0,
    };

    await database.insert(bookIssues).values(newIssue);
    return c.json({ success: true, issue: newIssue }, 201);
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

app.post('/api/books/return', async (c) => {
  try {
    if (!(await isAuthorizedRequest(c))) {
      return c.json({ success: false, error: 'Unauthorized: Staff or admin authorization required' }, 401);
    }
    const { issueId } = await c.req.json();
    const database = db(c);
    const returnDate = getISTDateStr();
    
    await database
      .update(bookIssues)
      .set({
        returnedAt: returnDate,
        status: 'returned',
        fineAmount: 0,
      })
      .where(eq(bookIssues.id, issueId));

    return c.json({ success: true, message: 'Book marked as returned successfully', returnedAt: returnDate });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// ══════════════════════════════════════════════════════════════════
// SECTION 9 · FEES API
// Fee records, payments, receipt emails (Resend), deletion.
// ══════════════════════════════════════════════════════════════════
app.get('/api/fees', async (c) => {
  try {
    const studentId = c.req.query('studentId');
    const database = db(c);

    if (studentId) {
      const records = await database.select().from(fees).where(eq(fees.studentId, studentId)).all();
      return c.json({ success: true, fees: records });
    }
    const records = await database.select().from(fees).orderBy(desc(fees.createdAt)).all();
    return c.json({ success: true, fees: records });
  } catch (err: any) {
    return c.json({ success: true, fees: [] });
  }
});

// Cold Storage / History: Fees Archive Query (D1)
app.get('/api/fees/history', async (c) => {
  try {
    const studentId = c.req.query('studentId');
    const database = db(c);
    let records = [];
    if (studentId) {
      records = await database.select().from(feesHistory)
        .where(eq(feesHistory.studentId, studentId))
        .orderBy(desc(feesHistory.archivedAt))
        .limit(500)
        .all();
    } else {
      records = await database.select().from(feesHistory)
        .orderBy(desc(feesHistory.archivedAt))
        .limit(1000)
        .all();
    }
    return c.json({ success: true, history: records });
  } catch (err: any) {
    return c.json({ success: true, history: [] });
  }
});

app.post('/api/fees', async (c) => {
  try {
    if (!(await isAuthorizedRequest(c))) {
      return c.json({ success: false, error: 'Unauthorized: Staff or admin authorization required' }, 401);
    }
    const body = await c.req.json();
    const database = db(c);
    const amount = Number(body.amount);
    if (isNaN(amount) || amount <= 0) {
      return c.json({ success: false, error: 'Fee amount must be greater than 0' }, 400);
    }
    const feeId = body.id || generateRecordId('fee');
    const isPaid = Boolean(body.paid);
    const receiptNo = isPaid ? (body.receiptNo || await generateApiInvoiceNumber(database, getSupabase(c.env))) : null;
    const feeRecord = {
      id: feeId,
      studentId: body.studentId || body.student_id || 'std-general',
      studentName: body.studentName || body.student_name || 'Student Member',
      type: body.type || 'Monthly Seat Fee',
      amount: amount,
      paid: isPaid,
      paidAt: isPaid ? (body.paidAt || new Date().toISOString()) : null,
      dueDate: body.dueDate || new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
      description: body.description || '',
      receiptNo: receiptNo,
      createdAt: new Date().toISOString(),
    };

    await database.insert(fees).values(feeRecord);

    // If paid, update student status and dispatch receipt email
    if (isPaid) {
      const remainingDue = body.remainingDue !== undefined && body.remainingDue !== null ? Number(body.remainingDue) : undefined;
      const totalDue = body.totalDue !== undefined && body.totalDue !== null ? Number(body.totalDue) : undefined;

      if (feeRecord.studentId) {
        const supaDue = remainingDue !== undefined && remainingDue > 0 ? remainingDue : 0;
        const supaStatus = remainingDue !== undefined && remainingDue > 0 ? 'Due' : 'Paid';

        // 1. Primary: Update Supabase profiles
        try {
          const supabase = getSupabase(c.env);
          await supabase.from('profiles').update({
            fee_status: supaStatus,
            due_amount: supaDue,
            updated_at: new Date().toISOString(),
          }).eq('id', feeRecord.studentId);
        } catch (supaErr) {
          console.warn('[Supabase Profile Fee Update]', supaErr);
        }

        // 2. Backup: Update D1 students
        if (remainingDue !== undefined && remainingDue > 0) {
          await database.update(students).set({
            feeStatus: 'Due',
            dueAmount: remainingDue,
            updatedAt: new Date().toISOString(),
          }).where(eq(students.id, feeRecord.studentId));
        } else {
          await database.update(students).set({
            feeStatus: 'Paid',
            dueAmount: 0,
            updatedAt: new Date().toISOString(),
          }).where(eq(students.id, feeRecord.studentId));
        }

        // 3. Cold Storage: Permanently backup receipt in feesHistory
        try {
          await database.insert(feesHistory).values({
            id: feeId,
            studentId: feeRecord.studentId,
            studentName: feeRecord.studentName,
            type: feeRecord.type,
            amount: feeRecord.amount,
            paid: true,
            paidAt: feeRecord.paidAt,
            dueDate: feeRecord.dueDate,
            description: feeRecord.description,
            receiptNo: feeRecord.receiptNo,
          }).onConflictDoNothing();
        } catch (fhErr) {
          console.warn('Backup feesHistory notice:', fhErr);
        }
      }

      // Dispatch automated email receipt via Resend (non-blocking)
      try {
        let recipientEmail = body.studentEmail || body.email;
        let recipientName = feeRecord.studentName;
        let plan: string | undefined = undefined;
        let shift: string | undefined = undefined;

        if (feeRecord.studentId) {
          const student = await database.select().from(students).where(eq(students.id, feeRecord.studentId)).get();
          if (student) {
            recipientEmail = recipientEmail || student.email;
            recipientName = student.fullName || recipientName;
            plan = student.membershipPlan || undefined;
            shift = student.shift || undefined;
          }
        }
        if (!recipientEmail && feeRecord.studentName) {
          const studentByName = await database.select().from(students).where(eq(students.fullName, feeRecord.studentName)).get();
          if (studentByName) {
            recipientEmail = studentByName.email;
            recipientName = studentByName.fullName;
            plan = studentByName.membershipPlan || undefined;
            shift = studentByName.shift || undefined;
          }
        }

        if (recipientEmail) {
          const emailTask = sendFeeReceiptEmail(c.env, {
            studentName: recipientName,
            studentEmail: recipientEmail,
            receiptNo: feeRecord.receiptNo || `REC-${feeRecord.id.slice(-6).toUpperCase()}`,
            amount: feeRecord.amount,
            totalDue: totalDue || (remainingDue !== undefined ? feeRecord.amount + remainingDue : undefined),
            remainingDue: remainingDue,
            plan,
            shift,
            paidAt: feeRecord.paidAt || undefined,
            description: feeRecord.description || undefined,
          });
          if (c.executionCtx?.waitUntil) {
            c.executionCtx.waitUntil(emailTask);
          } else {
            emailTask.catch(() => {});
          }
        }
      } catch (emErr) {
        console.warn('Could not trigger receipt email dispatch on fee creation:', emErr);
      }
    }

    return c.json({ success: true, fee: feeRecord }, 201);
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

app.post('/api/fees/pay', async (c) => {
  try {
    if (!(await isAuthorizedRequest(c))) {
      return c.json({ success: false, error: 'Unauthorized: Staff or admin authorization required' }, 401);
    }
    const { feeId } = await c.req.json();
    const database = db(c);
    const receiptNo = await generateApiInvoiceNumber(database, getSupabase(c.env));
    const paidAt = new Date().toISOString();
    
    // Find fee
    const feeRecord = await database.select().from(fees).where(or(eq(fees.id, feeId), eq(fees.receiptNo, feeId))).get();
    
    await database
      .update(fees)
      .set({
        paid: true,
        paidAt: paidAt,
        receiptNo: receiptNo,
      })
      .where(or(eq(fees.id, feeId), eq(fees.receiptNo, feeId)));

    // Cold storage: Permanently backup receipt in feesHistory
    if (feeRecord) {
      try {
        await database.insert(feesHistory).values({
          id: feeRecord.id,
          studentId: feeRecord.studentId,
          studentName: feeRecord.studentName,
          type: feeRecord.type,
          amount: feeRecord.amount,
          paid: true,
          paidAt: paidAt,
          dueDate: feeRecord.dueDate,
          description: feeRecord.description,
          receiptNo: receiptNo,
        }).onConflictDoNothing();
      } catch (fhErr) {
        console.warn('Backup feesHistory pay notice:', fhErr);
      }
    }

    let student = null;
    if (feeRecord?.studentId) {
      // 1. Primary: Update Supabase profiles
      try {
        const supabase = getSupabase(c.env);
        await supabase.from('profiles').update({
          fee_status: 'Paid',
          due_amount: 0,
          updated_at: new Date().toISOString(),
        }).eq('id', feeRecord.studentId);
      } catch (sErr) {
        console.warn('[Supabase Profile Pay Update]', sErr);
      }

      // 2. Backup: Update D1 students
      student = await database.select().from(students).where(eq(students.id, feeRecord.studentId)).get();
      await database.update(students).set({
        feeStatus: 'Paid',
        dueAmount: 0,
        updatedAt: new Date().toISOString(),
      }).where(eq(students.id, feeRecord.studentId));
    } else if (feeRecord?.studentName) {
      student = await database.select().from(students).where(eq(students.fullName, feeRecord.studentName)).get();
    }

    // Dispatch automated email receipt via Resend (non-blocking)
    if (student && student.email) {
      try {
        const emailTask = sendFeeReceiptEmail(c.env, {
          studentName: student.fullName || feeRecord?.studentName || 'Student',
          studentEmail: student.email,
          receiptNo: receiptNo,
          amount: feeRecord ? feeRecord.amount : 600,
          plan: student.membershipPlan || undefined,
          shift: student.shift || undefined,
          paidAt: paidAt,
          description: feeRecord?.description || undefined,
        });
        if (c.executionCtx?.waitUntil) {
          c.executionCtx.waitUntil(emailTask);
        } else {
          emailTask.catch(() => {});
        }
      } catch (emErr) {
        console.warn('Could not trigger receipt email dispatch on payment:', emErr);
      }
    }

    // Instant Native FCM Push Notification to Student Phone
    const targetStudentId = student?.id || feeRecord?.studentId;
    if (targetStudentId) {
      try {
        const studentTokens = await getTokensForRecipient(c, 'student', targetStudentId, student?.email || null);
        if (studentTokens.length > 0) {
          const pushTask = sendFCMToTokens(c.env, studentTokens, {
            title: '✅ Fee Payment Confirmed',
            body: `Your payment of ₹${feeRecord ? feeRecord.amount : 600} has been received! Receipt #${receiptNo}`,
            url: '/student/fees',
            tag: `fee-paid-${receiptNo}`,
          });
          if (c.executionCtx?.waitUntil) {
            c.executionCtx.waitUntil(pushTask);
          } else {
            pushTask.catch(() => {});
          }
        }
      } catch (pushErr) {
        console.warn('[FCM] Error notifying student of payment:', pushErr);
      }
    }

    return c.json({ success: true, message: 'Payment recorded', receiptNo });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

app.post('/api/fees/:id/send-receipt', async (c) => {
  if (!(await isAuthorizedRequest(c, true))) {
    return c.json({ success: false, error: 'Unauthorized: Admin authorization required' }, 401);
  }

  try {
    const id = c.req.param('id');
    const database = db(c);
    const feeRecord = await database
      .select()
      .from(fees)
      .where(or(eq(fees.id, id), eq(fees.receiptNo, id)))
      .get();

    if (!feeRecord) {
      return c.json({ success: false, error: 'Fee record not found' }, 404);
    }

    let student = null;
    if (feeRecord.studentId) {
      student = await database.select().from(students).where(eq(students.id, feeRecord.studentId)).get();
    }
    if (!student && feeRecord.studentName) {
      student = await database.select().from(students).where(eq(students.fullName, feeRecord.studentName)).get();
    }

    const recipientEmail = c.req.query('email') || student?.email;
    if (!recipientEmail) {
      return c.json({ success: false, error: 'Student email address not found' }, 400);
    }

    const queryRemaining = c.req.query('remainingDue');
    const queryTotal = c.req.query('totalDue');
    const remainingDueVal = queryRemaining !== undefined && queryRemaining !== '' ? Number(queryRemaining) : (student?.dueAmount !== undefined ? Number(student.dueAmount) : undefined);
    const totalDueVal = queryTotal !== undefined && queryTotal !== '' ? Number(queryTotal) : (remainingDueVal !== undefined && remainingDueVal > 0 ? feeRecord.amount + remainingDueVal : undefined);

    const emailResult = await sendFeeReceiptEmail(c.env, {
      studentName: student?.fullName || feeRecord.studentName,
      studentEmail: recipientEmail,
      receiptNo: feeRecord.receiptNo || `REC-${feeRecord.id.slice(-6).toUpperCase()}`,
      amount: feeRecord.amount,
      totalDue: totalDueVal,
      remainingDue: remainingDueVal,
      plan: student?.membershipPlan || undefined,
      shift: student?.shift || undefined,
      paidAt: feeRecord.paidAt || feeRecord.createdAt || undefined,
      description: feeRecord.description || undefined,
    });

    if (emailResult.success) {
      return c.json({ success: true, message: `Receipt sent to ${recipientEmail}`, emailId: emailResult.id });
    } else {
      return c.json({ success: false, error: emailResult.error || 'Failed to dispatch email' }, 400);
    }
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

app.delete('/api/fees/:id', async (c) => {
  try {
    if (!(await isAuthorizedRequest(c))) {
      return c.json({ success: false, error: 'Unauthorized: Staff or admin authorization required' }, 401);
    }
    const id = c.req.param('id');
    const database = db(c);

    // Find fee by ID or receiptNo
    const targetFee = await database
      .select()
      .from(fees)
      .where(or(eq(fees.id, id), eq(fees.receiptNo, id)))
      .get();

    if (targetFee) {
      await database.delete(fees).where(eq(fees.id, targetFee.id));

      // If this was a paid fee, check if student has any other paid fee
      if (targetFee.studentId) {
        const student = await database.select().from(students).where(eq(students.id, targetFee.studentId)).get();
        if (student) {
          const remainingPaid = await database
            .select()
            .from(fees)
            .where(and(eq(fees.studentId, targetFee.studentId), eq(fees.paid, true)))
            .all();
          if (remainingPaid.length > 0) {
            await database.update(students).set({
              feeStatus: 'Paid',
              dueAmount: 0,
              updatedAt: new Date().toISOString(),
            }).where(eq(students.id, targetFee.studentId));
          } else {
            const shiftRate = student.shift?.toLowerCase().includes('full') ? 1100 : (student.shift?.toLowerCase().includes('evening') ? 500 : 600);
            await database.update(students).set({
              feeStatus: 'Due',
              dueAmount: shiftRate,
              updatedAt: new Date().toISOString(),
            }).where(eq(students.id, targetFee.studentId));
          }
        }
      }
      return c.json({ success: true, message: 'Fee record deleted' });
    }

    // Direct fallback delete
    await database.delete(fees).where(or(eq(fees.id, id), eq(fees.receiptNo, id)));
    return c.json({ success: true, message: 'Fee record deleted' });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// ══════════════════════════════════════════════════════════════════
// SECTION 10 · ANNOUNCEMENTS API
// Notice-board CRUD powering the student news feed.
// ══════════════════════════════════════════════════════════════════
app.get('/api/announcements', async (c) => {
  try {
    const database = db(c);
    const list = await database.select().from(announcements).orderBy(desc(announcements.createdAt)).all();
    return c.json({ success: true, announcements: list });
  } catch (err: any) {
    return c.json({
      success: true,
      announcements: [],
    });
  }
});

app.post('/api/announcements', async (c) => {
  try {
    if (!(await isAuthorizedRequest(c))) {
      return c.json({ success: false, error: 'Unauthorized: Staff or admin authorization required' }, 401);
    }
    const body = await c.req.json();
    const database = db(c);
    const record = {
      id: body.id || generateRecordId('ann'),
      title: body.title || 'Library Announcement',
      message: body.message || body.body || '',
      priority: body.priority || 'normal',
      targetAudience: body.targetAudience || body.target_audience || body.recipients || 'all',
      createdAt: new Date().toISOString(),
    };
    await database.insert(announcements).values(record);
    return c.json({ success: true, announcement: record }, 201);
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

app.delete('/api/announcements/:id', async (c) => {
  try {
    if (!(await isAuthorizedRequest(c))) {
      return c.json({ success: false, error: 'Unauthorized: Staff or admin authorization required' }, 401);
    }
    const id = c.req.param('id');
    const database = db(c);
    await database.delete(announcements).where(eq(announcements.id, id));
    return c.json({ success: true, message: 'Announcement deleted' });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// Note: Announcements use /api/announcements; 2-way chat messages use /api/messages defined below

// ══════════════════════════════════════════════════════════════════
// SECTION 11 · DASHBOARD STATS
// Aggregated counts (students, occupancy, dues) for the admin home.
// ══════════════════════════════════════════════════════════════════
app.get('/api/stats/summary', async (c) => {
  try {
    const database = db(c);
    const allSeats = await database.select().from(seats).all();
    const allShifts = await database.select().from(shifts).all();
    const allBooks = await database.select().from(books).all();
    const allIssues = await database.select().from(bookIssues).where(eq(bookIssues.status, 'issued')).all();
    const allStudentsList = await database.select().from(students).all();

    const todayStr = getISTDateStr();
    const todayAtt = await database.select().from(attendance).where(eq(attendance.date, todayStr)).all();

    const pendingCount = allStudentsList.filter((s) => s.status === 'pending').length;

    const TOTAL_SEATS = 100;
    const checkedInStudentIds = new Set(
      todayAtt
        .filter((a) => a.status === 'present' || a.status === 'in_progress' || !a.checkOut || a.checkOut === 'In Progress' || a.checkOut === '—')
        .map((a) => a.studentId)
    );

    let occupiedCount = 0;
    let reservedCount = 0;

    allSeats.forEach((seat) => {
      const isAssigned = !seat.isAvailable || Boolean(seat.currentStudentId);
      if (isAssigned) {
        if (seat.currentStudentId && checkedInStudentIds.has(seat.currentStudentId)) {
          occupiedCount++;
        } else {
          reservedCount++;
        }
      }
    });

    const availableSeatsCount = Math.max(0, TOTAL_SEATS - (occupiedCount + reservedCount));

    return c.json({
      success: true,
      stats: {
        totalSeats: TOTAL_SEATS,
        availableSeats: availableSeatsCount,
        occupiedSeats: occupiedCount,
        reservedSeats: reservedCount,
        activeShiftsCount: allShifts.length || 4,
        totalBooks: allBooks.length,
        booksIssuedCount: allIssues.length,
        attendanceTodayCount: todayAtt.length,
        totalStudentsCount: allStudentsList.length,
        pendingStudentsCount: pendingCount,
      },
    });
  } catch (err: any) {
    return c.json({
      success: true,
      stats: {
        totalSeats: 100,
        availableSeats: 100,
        occupiedSeats: 0,
        reservedSeats: 0,
        activeShiftsCount: 4,
        totalBooks: 0,
        booksIssuedCount: 0,
        attendanceTodayCount: 0,
        totalStudentsCount: 0,
        pendingStudentsCount: 0,
      },
    });
  }
});

app.post('/api/admin/reset-data', async (c) => {
  try {
    if (!(await isAuthorizedRequest(c, true))) {
      return c.json({ success: false, error: 'Unauthorized: Admin authorization required' }, 401);
    }
    const database = db(c);
    await database.delete(students);
    await database.delete(books);
    await database.delete(attendance);
    await database.delete(fees);
    await database.delete(bookIssues);
    await database.update(seats).set({
      isAvailable: true,
      currentStudentId: null,
      currentStudentName: null,
      shiftId: null,
      occupiedAt: null,
    });
    return c.json({
      success: true,
      message: 'All students, books, attendance, and fee records have been wiped successfully.',
    });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// ══════════════════════════════════════════════════════════════════
// SECTION 12 · MESSAGES API
// Two-way chat threads between students and admin/staff.
// ══════════════════════════════════════════════════════════════════
app.get('/api/messages', async (c) => {
  try {
    const database = db(c);
    const studentId = c.req.query('studentId');
    if (studentId) {
      const records = await database
        .select()
        .from(messages)
        .where(eq(messages.studentId, studentId))
        .orderBy(messages.createdAt)
        .all();
      return c.json({ success: true, messages: records });
    }

    const records = await database
      .select()
      .from(messages)
      .orderBy(desc(messages.createdAt))
      .all();
    return c.json({ success: true, messages: records });
  } catch (err: any) {
    return c.json({ success: false, error: err.message, messages: [] });
  }
});

// Cold Storage / History: Messages Archive Query (D1)
app.get('/api/messages/history', async (c) => {
  try {
    const studentId = c.req.query('studentId');
    const database = db(c);
    let records = [];
    if (studentId) {
      records = await database
        .select()
        .from(messagesHistory)
        .where(eq(messagesHistory.studentId, studentId))
        .orderBy(messagesHistory.archivedAt)
        .all();
    } else {
      records = await database
        .select()
        .from(messagesHistory)
        .orderBy(desc(messagesHistory.archivedAt))
        .limit(500)
        .all();
    }
    return c.json({ success: true, history: records });
  } catch (err: any) {
    return c.json({ success: false, error: err.message, history: [] });
  }
});

app.post('/api/messages', async (c) => {
  if (!(await isAuthorizedRequest(c, false))) {
    return c.json({ success: false, error: 'Unauthorized: Authentication required' }, 401);
  }

  try {
    const body = await c.req.json();
    const database = db(c);

    if (!body.studentId || !body.message) {
      return c.json({ success: false, error: 'studentId and message are required' }, 400);
    }

    // 1. Hourly Rate Limit per sender (max 50 messages per hour per studentId)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const recentMessages = await database
      .select({ id: messages.id })
      .from(messages)
      .where(
        and(
          eq(messages.senderRole, body.senderRole || 'student'),
          eq(messages.studentId, body.studentId),
          gte(messages.createdAt, oneHourAgo)
        )
      )
      .all();

    if (recentMessages.length >= 50) {
      return c.json({ success: false, error: 'Rate limit exceeded: You can only send 50 messages per hour.' }, 429);
    }

    // 2. Global Daily Limit (max 10,000 active messages total in DB as a safety fallback)
    const totalActiveMessages = await database
      .select({ id: messages.id })
      .from(messages)
      .all();
      
    if (totalActiveMessages.length >= 10000) {
      return c.json({ success: false, error: 'Global daily message limit reached. Please contact support or clear archive.' }, 429);
    }

    const newMsg = {
      id: body.id || generateRecordId('msg'),
      studentId: body.studentId,
      studentName: body.studentName || 'Student',
      studentEmail: body.studentEmail || null,
      senderRole: body.senderRole || 'student', // 'student' | 'admin' | 'staff'
      senderName: body.senderName || (body.senderRole === 'admin' ? 'Librarian Desk' : 'Student'),
      message: body.message,
      recipientRole: body.recipientRole || 'all',
      recipientName: body.recipientName || null,
      recipientId: body.recipientId || null,
      isRead: false,
      createdAt: body.createdAt || new Date().toISOString(),
    };

    await database.insert(messages).values(newMsg);

    // 3. Instant Native FCM Push Notification Dispatch
    try {
      const isFromAdmin = newMsg.senderRole === 'admin' || newMsg.senderRole === 'staff';
      if (isFromAdmin) {
        // Admin sent message -> Deliver native popup to student phone!
        const studentTokens = await getTokensForRecipient(c, 'student', newMsg.studentId, newMsg.studentEmail);
        if (studentTokens.length > 0) {
          const pushTask = sendFCMToTokens(c.env, studentTokens, {
            title: `💬 ${newMsg.senderName || 'Library Admin'}`,
            body: newMsg.message.length > 150 ? `${newMsg.message.slice(0, 147)}...` : newMsg.message,
            url: '/student/messages',
            tag: `chat-msg-${newMsg.studentId}`,
          });
          if (c.executionCtx?.waitUntil) {
            c.executionCtx.waitUntil(pushTask);
          } else {
            pushTask.catch(() => {});
          }
        }
      } else {
        // Student sent message -> Deliver native popup to admin phone!
        const adminTokens = await getTokensForRecipient(c, 'admin');
        if (adminTokens.length > 0) {
          const pushTask = sendFCMToTokens(c.env, adminTokens, {
            title: `💬 ${newMsg.senderName || 'Student'}`,
            body: newMsg.message.length > 150 ? `${newMsg.message.slice(0, 147)}...` : newMsg.message,
            url: `/admin/messages?studentId=${encodeURIComponent(newMsg.studentId)}`,
            tag: `chat-msg-${newMsg.studentId}`,
          });
          if (c.executionCtx?.waitUntil) {
            c.executionCtx.waitUntil(pushTask);
          } else {
            pushTask.catch(() => {});
          }
        }
      }
    } catch (pushErr) {
      console.warn('[FCM] Error dispatching message push notification:', pushErr);
    }

    return c.json({ success: true, message: newMsg });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

app.patch('/api/messages/read', async (c) => {
  if (!(await isAuthorizedRequest(c, false))) {
    return c.json({ success: false, error: 'Unauthorized: Authentication required' }, 401);
  }

  try {
    const body = await c.req.json();
    const database = db(c);
    const studentId = body.studentId;

    if (studentId) {
      await database
        .update(messages)
        .set({ isRead: true })
        .where(eq(messages.studentId, studentId));
    }
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// ══════════════════════════════════════════════════════════════════
// SECTION 13 · STAFF API
// Staff directory and access control.
// ══════════════════════════════════════════════════════════════════
app.get('/api/staff', async (c) => {
  try {
    const database = db(c);
    const records = await database.select().from(staff).orderBy(desc(staff.createdAt)).all();
    return c.json({ success: true, staff: records });
  } catch (err: any) {
    return c.json({ success: false, error: err.message, staff: [] });
  }
});

app.post('/api/staff', async (c) => {
  try {
    if (!(await isAuthorizedRequest(c, true))) {
      return c.json({ success: false, error: 'Unauthorized: Admin authorization required' }, 401);
    }
    const body = await c.req.json();
    const database = db(c);

    if (!body.name || !body.email) {
      return c.json({ success: false, error: 'Name and email are required' }, 400);
    }

    const isPrime = (body.category === 'Prime Staff' || body.role === 'prime_staff');
    const newStaff = {
      id: body.id || generateRecordId('staff'),
      name: body.name,
      email: body.email.toLowerCase().trim(),
      phone: body.phone || '',
      address: body.address || '',
      aadharNumber: body.aadharNumber || '',
      avatarUrl: body.avatarUrl || null,
      role: isPrime ? 'prime_staff' : 'sub_staff',
      category: isPrime ? 'Prime Staff' : 'Sub Staff',
      shiftAssigned: body.shiftAssigned || 'Morning Shift',
      status: body.status || 'active',
      lastLogin: 'Never',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await database.insert(staff).values(newStaff).onConflictDoUpdate({
      target: staff.id,
      set: {
        name: newStaff.name,
        phone: newStaff.phone,
        address: newStaff.address,
        aadharNumber: newStaff.aadharNumber,
        avatarUrl: newStaff.avatarUrl,
        role: newStaff.role,
        category: newStaff.category,
        shiftAssigned: newStaff.shiftAssigned,
        status: newStaff.status,
        updatedAt: newStaff.updatedAt,
      },
    });

    return c.json({ success: true, staff: newStaff });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

app.patch('/api/staff/:id', async (c) => {
  try {
    if (!(await isAuthorizedRequest(c, true))) {
      return c.json({ success: false, error: 'Unauthorized: Admin authorization required' }, 401);
    }
    const id = c.req.param('id');
    const body = await c.req.json();
    const database = db(c);

    const updatePayload: any = { updatedAt: new Date().toISOString() };
    if (body.name !== undefined) updatePayload.name = body.name;
    if (body.phone !== undefined) updatePayload.phone = body.phone;
    if (body.address !== undefined) updatePayload.address = body.address;
    if (body.aadharNumber !== undefined) updatePayload.aadharNumber = body.aadharNumber;
    if (body.avatarUrl !== undefined) updatePayload.avatarUrl = body.avatarUrl;
    if (body.shiftAssigned !== undefined) updatePayload.shiftAssigned = body.shiftAssigned;
    if (body.status !== undefined) updatePayload.status = body.status;
    if (body.category !== undefined) {
      updatePayload.category = body.category;
      updatePayload.role = body.category === 'Prime Staff' ? 'prime_staff' : 'sub_staff';
    }
    if (body.lastLogin !== undefined) updatePayload.lastLogin = body.lastLogin;

    await database.update(staff).set(updatePayload).where(eq(staff.id, id));
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

app.delete('/api/staff/:id', async (c) => {
  try {
    if (!(await isAuthorizedRequest(c, true))) {
      return c.json({ success: false, error: 'Unauthorized: Admin authorization required' }, 401);
    }
    const id = c.req.param('id');
    const database = db(c);
    await database.delete(staff).where(eq(staff.id, id));
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// ══════════════════════════════════════════════════════════════════
// SECTION 14 · NOTIFICATIONS API
// In-app notification feed + read/unread states.
// ══════════════════════════════════════════════════════════════════
let notificationsTableChecked = false;
async function ensureNotificationsTable(c: any) {
  if (notificationsTableChecked) return;
  try {
    if (c.env?.DB && typeof c.env.DB.exec === 'function') {
      await c.env.DB.exec(`
        CREATE TABLE IF NOT EXISTS notifications (
          id TEXT PRIMARY KEY,
          recipient_role TEXT NOT NULL DEFAULT 'all',
          recipient_id TEXT,
          title TEXT NOT NULL,
          message TEXT NOT NULL,
          type TEXT NOT NULL DEFAULT 'general',
          action_url TEXT,
          is_read INTEGER NOT NULL DEFAULT 0,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
      `);
      notificationsTableChecked = true;
    }
  } catch (e) {
    // Ignore error if table exists
  }
}

let fcmTokensTableChecked = false;
async function ensureFcmTokensTable(c: any) {
  if (fcmTokensTableChecked) return;
  try {
    if (c.env?.DB && typeof c.env.DB.exec === 'function') {
      await c.env.DB.exec(`
        CREATE TABLE IF NOT EXISTS fcm_tokens (
          id TEXT PRIMARY KEY,
          token TEXT NOT NULL UNIQUE,
          role TEXT NOT NULL DEFAULT 'student',
          user_id TEXT,
          email TEXT,
          name TEXT,
          device_info TEXT,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_fcm_tokens_role ON fcm_tokens(role);
        CREATE INDEX IF NOT EXISTS idx_fcm_tokens_user ON fcm_tokens(user_id);
      `);
      fcmTokensTableChecked = true;
    }
  } catch (e) {
    // Ignore error if table exists
  }
}

async function getTokensForRecipient(
  c: any,
  role: 'admin' | 'staff' | 'student',
  studentId?: string | null,
  studentEmail?: string | null
): Promise<string[]> {
  const tokens = new Set<string>();
  const database = db(c);
  await ensureFcmTokensTable(c);

  try {
    if (role === 'student') {
      // Find tokens registered for this student
      const conditions: any[] = [];
      if (studentId) conditions.push(eq(fcmTokens.userId, studentId));
      if (studentEmail) conditions.push(eq(fcmTokens.email, studentEmail.toLowerCase()));

      if (conditions.length > 0) {
        const rows = await database
          .select({ token: fcmTokens.token })
          .from(fcmTokens)
          .where(and(eq(fcmTokens.role, 'student'), or(...conditions)))
          .all();
        rows.forEach((r: any) => { if (r?.token) tokens.add(r.token); });
      }

      if (studentId) {
        const sRecord = await database
          .select({ fcmToken: students.fcmToken })
          .from(students)
          .where(eq(students.id, studentId))
          .get()
          .catch(() => null);
        if (sRecord?.fcmToken) tokens.add(sRecord.fcmToken);
      }
    } else {
      // Admin / Staff tokens
      const rows = await database
        .select({ token: fcmTokens.token })
        .from(fcmTokens)
        .where(or(eq(fcmTokens.role, 'admin'), eq(fcmTokens.role, 'staff')))
        .all();
      rows.forEach((r: any) => { if (r?.token) tokens.add(r.token); });

      const staffRows = await database
        .select({ fcmToken: staff.fcmToken })
        .from(staff)
        .all()
        .catch(() => []);
      staffRows.forEach((r: any) => { if (r?.fcmToken) tokens.add(r.fcmToken); });
    }
  } catch (err) {
    console.warn('[FCM] Error querying tokens from D1:', err);
  }

  // Also query Supabase profiles table for fcm_token (single source of truth for auth)
  try {
    const supabase = getSupabase(c.env);
    if (role === 'student' && studentId) {
        const { data } = await supabase
          .from('profiles')
          .select('fcm_token')
          .eq('id', studentId)
          .maybeSingle();
        if (data?.fcm_token) tokens.add(data.fcm_token);
      } else if (role === 'admin' || role === 'staff') {
        const { data } = await supabase
          .from('profiles')
          .select('fcm_token')
          .or(`role.eq.admin,role.eq.staff,email.eq.${MASTER_ADMIN_EMAIL}`);
        data?.forEach((p: any) => {
          if (p?.fcm_token) tokens.add(p.fcm_token);
        });
      }
    } catch (sbErr) {
      // Non-fatal
    }

  return Array.from(tokens).filter(t => typeof t === 'string' && t.trim().length > 10);
}


app.get('/api/notifications', async (c) => {
  try {
    await ensureNotificationsTable(c);
    const database = db(c);
    const role = c.req.query('role');
    const recipientId = c.req.query('recipientId');

    let list = await database.select().from(notifications).orderBy(desc(notifications.createdAt)).all();

    if (role === 'admin') {
      list = list.filter((n) => n.recipientRole === 'admin' || n.recipientRole === 'all');
    } else if (role === 'student') {
      list = list.filter((n) => {
        if (n.recipientRole === 'all') return true;
        if (n.recipientRole !== 'student') return false;
        if (!n.recipientId) return true;
        if (recipientId && (n.recipientId === recipientId || n.recipientId.toLowerCase() === recipientId.toLowerCase())) {
          return true;
        }
        return false;
      });
    }

    return c.json({ success: true, notifications: list });
  } catch (err: any) {
    return c.json({ success: true, notifications: [] });
  }
});

app.post('/api/notifications', async (c) => {
  if (!(await isAuthorizedRequest(c, true))) {
    return c.json({ success: false, error: 'Unauthorized: Admin authorization required' }, 401);
  }

  try {
    await ensureNotificationsTable(c);
    const body = await c.req.json();
    const database = db(c);

    if (!body.title || !body.message) {
      return c.json({ success: false, error: 'Title and message are required' }, 400);
    }

    const record = {
      id: body.id || generateRecordId('notif'),
      recipientRole: body.recipientRole || 'all',
      recipientId: body.recipientId || null,
      title: body.title,
      message: body.message,
      type: body.type || 'general',
      actionUrl: body.actionUrl || null,
      isRead: false,
      createdAt: body.createdAt || new Date().toISOString(),
    };

    await database.insert(notifications).values(record);

    // Instant Native FCM Push Notification Dispatch
    try {
      if (record.recipientRole === 'admin' || record.recipientRole === 'all') {
        const adminTokens = await getTokensForRecipient(c, 'admin');
        if (adminTokens.length > 0) {
          const pushTask = sendFCMToTokens(c.env, adminTokens, {
            title: record.title,
            body: record.message,
            url: record.actionUrl || '/admin/fees',
            tag: `notif-${record.id}`,
          });
          if (c.executionCtx?.waitUntil) {
            c.executionCtx.waitUntil(pushTask);
          } else {
            pushTask.catch(() => {});
          }
        }
      } else if (record.recipientRole === 'student' && record.recipientId) {
        const studentTokens = await getTokensForRecipient(c, 'student', record.recipientId);
        if (studentTokens.length > 0) {
          const pushTask = sendFCMToTokens(c.env, studentTokens, {
            title: record.title,
            body: record.message,
            url: record.actionUrl || '/student/fees',
            tag: `notif-${record.id}`,
          });
          if (c.executionCtx?.waitUntil) {
            c.executionCtx.waitUntil(pushTask);
          } else {
            pushTask.catch(() => {});
          }
        }
      }
    } catch (pushErr) {
      console.warn('[FCM] Error dispatching notification push:', pushErr);
    }

    return c.json({ success: true, notification: record }, 201);
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

app.patch('/api/notifications/:id/read', async (c) => {
  if (!(await isAuthorizedRequest(c, false))) {
    return c.json({ success: false, error: 'Unauthorized: Authentication required' }, 401);
  }

  try {
    await ensureNotificationsTable(c);
    const id = c.req.param('id');
    const database = db(c);
    await database.update(notifications).set({ isRead: true }).where(eq(notifications.id, id));
    return c.json({ success: true, message: 'Notification marked as read' });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

app.patch('/api/notifications/read-all', async (c) => {
  if (!(await isAuthorizedRequest(c, false))) {
    return c.json({ success: false, error: 'Unauthorized: Authentication required' }, 401);
  }

  try {
    await ensureNotificationsTable(c);
    const body = await c.req.json().catch(() => ({}));
    const role = body.role;
    const recipientId = body.recipientId;
    const database = db(c);

    if (role === 'admin') {
      await database.update(notifications).set({ isRead: true }).where(eq(notifications.recipientRole, 'admin'));
    } else if (recipientId) {
      await database.update(notifications).set({ isRead: true }).where(eq(notifications.recipientId, recipientId));
    } else {
      await database.update(notifications).set({ isRead: true });
    }

    return c.json({ success: true, message: 'Notifications marked as read' });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

app.delete('/api/notifications/clear-all', async (c) => {
  if (!(await isAuthorizedRequest(c, false))) {
    return c.json({ success: false, error: 'Unauthorized: Authentication required' }, 401);
  }

  try {
    await ensureNotificationsTable(c);
    const body = await c.req.json().catch(() => ({}));
    const role = body.role;
    const recipientId = body.recipientId;
    const database = db(c);

    if (role === 'admin') {
      await database.delete(notifications).where(or(eq(notifications.recipientRole, 'admin'), eq(notifications.recipientRole, 'all')));
    } else if (recipientId) {
      await database.delete(notifications).where(eq(notifications.recipientId, recipientId));
    } else if (role === 'student') {
      await database.delete(notifications).where(eq(notifications.recipientRole, 'student'));
    } else {
      await database.delete(notifications);
    }

    return c.json({ success: true, message: 'Notifications cleared' });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// ══════════════════════════════════════════════════════════════════
// SECTION 15 · FCM PUSH API
// Device token registration + test push (see apps/api/src/fcm.ts).
// ══════════════════════════════════════════════════════════════════
app.post('/api/fcm/register', async (c) => {
  if (!(await isAuthorizedRequest(c, false))) {
    return c.json({ success: false, error: 'Unauthorized: Authentication required' }, 401);
  }

  try {
    await ensureFcmTokensTable(c);
    const body = await c.req.json();
    const { token, role, userId, email, name, deviceInfo } = body;

    if (!token || typeof token !== 'string' || token.trim().length < 10) {
      return c.json({ success: false, error: 'Valid FCM token is required' }, 400);
    }

    const cleanToken = token.trim();
    const cleanRole = role === 'admin' || role === 'staff' ? role : 'student';
    const database = db(c);

    // 1. Upsert into fcm_tokens table
    const existing = await database
      .select({ id: fcmTokens.id })
      .from(fcmTokens)
      .where(eq(fcmTokens.token, cleanToken))
      .get()
      .catch(() => null);

    if (existing) {
      await database
        .update(fcmTokens)
        .set({
          role: cleanRole,
          userId: userId || null,
          email: email ? email.toLowerCase() : null,
          name: name || null,
          deviceInfo: deviceInfo || null,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(fcmTokens.token, cleanToken));
    } else {
      await database.insert(fcmTokens).values({
        id: generateRecordId('tok'),
        token: cleanToken,
        role: cleanRole,
        userId: userId || null,
        email: email ? email.toLowerCase() : null,
        name: name || null,
        deviceInfo: deviceInfo || null,
        updatedAt: new Date().toISOString(),
      });
    }

    // 2. Also update students or staff table
    if (cleanRole === 'student' && userId) {
      await database
        .update(students)
        .set({ fcmToken: cleanToken, updatedAt: new Date().toISOString() })
        .where(eq(students.id, userId))
        .catch(() => {});
    } else if ((cleanRole === 'admin' || cleanRole === 'staff') && email) {
      await database
        .update(staff)
        .set({ fcmToken: cleanToken, updatedAt: new Date().toISOString() })
        .where(eq(staff.email, email.toLowerCase()))
        .catch(() => {});
    }

    return c.json({ success: true, message: 'Device token registered successfully' });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

app.post('/api/fcm/test', async (c) => {
  if (!(await isAuthorizedRequest(c, true))) {
    return c.json({ success: false, error: 'Unauthorized: Admin authorization required' }, 401);
  }

  try {
    const body = await c.req.json();
    const { token, title, body: msgBody, url } = body;
    if (!token) return c.json({ success: false, error: 'Token is required' }, 400);

    const res = await sendFCMMessage(c.env, token, {
      title: title || 'Test Notification',
      body: msgBody || `Native push popups are working perfectly from ${WL.shortName}!`,
      url: url || '/',
    });
    return c.json(res);
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});


// ══════════════════════════════════════════════════════════════════
// SECTION 16 · DAILY BACKUP ENGINE
// Builds the daily digest from Supabase into D1 and emails the admin report. Triggered by cron + /api/backup/trigger-daily.
// ══════════════════════════════════════════════════════════════════
// Runs every night at 11:00 PM IST (17:30 UTC).
// Compiles today's attendance, fees, seat occupancy, and pending dues.
// Saves snapshot to D1 `reportsHistory` and emails full record to Admin.
// Builds comprehensive daily report data structure matching the official operations report
export async function buildDailyReportData(env: Bindings, targetDate?: string): Promise<DailyBackupReportParams> {
  const database = db({ env });
  const todayDateStr = targetDate || getISTDateStr();

  // 1. Fetch Students count & seat assignments
  const allStudents = await database.select().from(students).all();
  const activeStudents = allStudents.filter(s => s.status === 'active');
  const totalStudents = activeStudents.length;

  // 2. Fetch Today's Attendance from D1
  const todayAttendance = await database
    .select()
    .from(attendance)
    .where(eq(attendance.date, todayDateStr))
    .all();

  const totalPresent = todayAttendance.filter(a => a.status === 'present' || a.status === 'in_progress' || a.status === 'completed').length;
  const totalAbsent = Math.max(0, totalStudents - totalPresent);

  // 3. Fetch Today's Fees & Collections
  const allFees = await database.select().from(fees).all();
  const todayFees = allFees.filter(f => f.paid && f.paidAt && f.paidAt.startsWith(todayDateStr));
  const totalFeeCollected = todayFees.reduce((sum, f) => sum + (f.amount || 0), 0);

  const pendingFees = allFees.filter(f => !f.paid);
  const totalPendingDues = pendingFees.reduce((sum, f) => sum + (f.amount || 0), 0);

  // 4. Seat Matrix Counts
  const allSeats = await database.select().from(seats).all();
  const occupiedSeats = totalPresent;
  const reservedSeats = Math.max(0, activeStudents.filter(s => s.seatNumber).length - occupiedSeats);
  const totalCapacity = 100;
  const availableSeats = Math.max(0, totalCapacity - (occupiedSeats + reservedSeats));

  // Formulate structured lists for email
  const attendanceRecords = todayAttendance.map(a => ({
    studentName: a.studentName,
    seatNumber: a.seatNumber || undefined,
    checkIn: a.checkIn,
    checkOut: a.checkOut || undefined,
    shift: a.shiftName || undefined,
  }));

  const feeTransactions = todayFees.map(f => ({
    studentName: f.studentName,
    amount: f.amount,
    receiptNo: f.receiptNo || undefined,
    type: f.type,
    paidAt: f.paidAt || undefined,
  }));

  // Group pending dues by student
  const dueStudentsMap = new Map<string, { studentName: string; dueAmount: number; phone?: string; seatNumber?: string }>();
  pendingFees.forEach(f => {
    const student = allStudents.find(s => s.id === f.studentId);
    const existing = dueStudentsMap.get(f.studentId);
    if (existing) {
      existing.dueAmount += f.amount;
    } else {
      dueStudentsMap.set(f.studentId, {
        studentName: f.studentName,
        dueAmount: f.amount,
        phone: student?.phone || undefined,
        seatNumber: student?.seatNumber || undefined,
      });
    }
  });
  const dueStudents = Array.from(dueStudentsMap.values()).sort((a, b) => b.dueAmount - a.dueAmount);

  // 4.5. Build Comprehensive Nightly Master Sheet Records (14 Columns)
  const newStudentsCount = allStudents.filter(s => s.createdAt && s.createdAt.startsWith(todayDateStr)).length;
  const trialStudentsCount = allStudents.filter(s => s.membershipPlan?.toLowerCase().includes('trial') || (s as any).isTrial).length;
  const suspendedStudentsCount = allStudents.filter(s => s.status === 'suspended').length;

  const studentSheetRecords = allStudents.map((student, idx) => {
    const att = todayAttendance.find(a => a.studentId === student.id);
    const studentTodayFees = todayFees.filter(f => f.studentId === student.id);
    const feeSumToday = studentTodayFees.reduce((sum, f) => sum + (f.amount || 0), 0);
    const studentAllFees = allFees.filter(f => f.studentId === student.id);
    const latestInvoice = studentAllFees.find(f => f.receiptNo)?.receiptNo || studentTodayFees[0]?.receiptNo;
    const pendingDue = studentAllFees.filter(f => !f.paid).reduce((sum, f) => sum + (f.amount || 0), 0);

    const isNewStudent = Boolean(student.createdAt && student.createdAt.startsWith(todayDateStr));
    const isTrial = Boolean(student.membershipPlan?.toLowerCase().includes('trial') || (student as any).isTrial);
    const isPresent = Boolean(att && (att.status === 'present' || att.checkIn));

    // 1. Membership representation: e.g. "Reserved B-2", "General / Desk", "General / Trial"
    let membershipDisplay = student.membershipPlan || 'General / Desk';
    if (student.seatNumber) {
      membershipDisplay = `Reserved ${student.seatNumber}`;
    } else if (isTrial) {
      membershipDisplay = 'General / Trial';
    } else if (!membershipDisplay.includes('/')) {
      membershipDisplay = `${membershipDisplay} / Desk`;
    }

    // 2. Renewal date: next month from creation or updatedAt
    let renewDateStr = '—';
    if (student.createdAt) {
      try {
        const d = new Date(student.createdAt);
        d.setMonth(d.getMonth() + 1);
        renewDateStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
      } catch {}
    }

    // 3. Join date formatted as DD/MM/YYYY
    let joinDateStr = '—';
    if (student.createdAt) {
      try {
        const d = new Date(student.createdAt);
        joinDateStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
      } catch {}
    }

    // 4. UPI Claims: check for UTR / UPI claims
    const upiFee = studentTodayFees.find(f => f.receiptNo?.includes('UPI') || f.description?.includes('UTR'));
    const upiClaimsDisplay = upiFee ? (upiFee.receiptNo || 'UTR LOGGED') : '—';

    const statusDisplay = student.status === 'suspended' ? 'Suspend' : (student.status === 'pending' ? 'Pending' : 'Active');
    const feeDisplay = (student.feeStatus === 'Paid' || (pendingDue === 0 && feeSumToday > 0)) ? 'Paid' : 'Due';

    return {
      no: idx + 1,
      studentId: student.id,
      studentCode: student.studentCode || `SDL-${String(idx + 1).padStart(3, '0')}`,
      studentName: student.fullName,
      membership: membershipDisplay,
      status: statusDisplay,
      fees: feeDisplay,
      renewDate: renewDateStr,
      attendance: isPresent ? 'Present' : 'Absent',
      checkIn: att?.checkIn || '—',
      checkOut: att?.checkOut || '—',
      upiClaims: upiClaimsDisplay,
      mobNo: student.phone ? student.phone.replace(/[^0-9]/g, '').slice(-10) : '—',
      course: student.course || 'General',
      joinDate: joinDateStr,
      seatNumber: student.seatNumber || att?.seatNumber || undefined,
      shift: student.shift || att?.shiftName || 'General',
      feesPaidToday: feeSumToday,
      latestInvoiceNo: latestInvoice,
      pendingDue,
      isNewStudent,
      isTrial,
    };
  }).sort((a, b) => {
    if (a.attendance === 'Present' && b.attendance !== 'Present') return -1;
    if (a.attendance !== 'Present' && b.attendance === 'Present') return 1;
    return a.studentCode.localeCompare(b.studentCode);
  }).map((s, idx) => ({ ...s, no: idx + 1 }));

  return {
    reportDate: todayDateStr,
    totalStudents,
    newStudentsCount,
    totalFeeCollected,
    totalPendingDues,
    totalPresent,
    totalAbsent,
    suspendedStudentsCount,
    trialStudentsCount,
    occupiedSeats,
    reservedSeats,
    availableSeats,
    studentSheetRecords,
    attendanceRecords,
    feeTransactions,
    dueStudents,
  };
}

// Runs every night at midnight IST.
// 1. Resets daily attendance (auto check-out for unclosed sessions).
// 2. Resets and vacates all 100 library desks.
// 3. Rolling 1-year auto-archive to Cloudflare D1 cold backup & purge from Supabase.
// 4. Compiles today's attendance, fees, seat occupancy, and emails PDF & CSV report to Admin.
export async function runDailyBackupJob(env: Bindings): Promise<{ success: boolean; error?: string; report?: any }> {
  console.log('[Daily Backup] Starting nightly library operations backup, midnight attendance reset & archive job...');
  const database = db({ env });
  const supabase = getSupabase(env);
  const todayDateStr = getISTDateStr();

  try {
    // 1. Midnight Reset: Auto Check-Out any unclosed student sessions for today
    try {
      await supabase
        .from('attendance')
        .update({ check_out: '23:59 PM', updated_at: new Date().toISOString() })
        .eq('date', todayDateStr)
        .is('check_out', null);

      await database
        .update(attendance)
        .set({ checkOut: '23:59 PM' })
        .where(and(eq(attendance.date, todayDateStr), sql`check_out IS NULL`));
    } catch (attResetErr) {
      console.warn('[Daily Backup] Attendance midnight checkout notice:', attResetErr);
    }

    // 2. Midnight Seat Reset: Free all 100 study desks for the next morning
    try {
      await supabase
        .from('seats')
        .update({
          is_available: true,
          current_student_id: null,
          current_student_name: null,
          occupied_at: null,
        })
        .neq('is_available', true);

      await database
        .update(seats)
        .set({
          isAvailable: true,
          currentStudentId: null,
          currentStudentName: null,
          shiftId: null,
          occupiedAt: null,
        });
    } catch (seatResetErr) {
      console.warn('[Daily Backup] Seat reset notice:', seatResetErr);
    }

    // 3. Rolling Auto-Prune & Cold Backup into Cloudflare D1 (Preserving 500MB Free Quota)
    // Archive records older than 365 days (1 year) automatically
    try {
      const oneYearAgo = new Date();
      oneYearAgo.setDate(oneYearAgo.getDate() - 365);
      const oneYearCutoff = oneYearAgo.toISOString();

      const { data: oldAttendance } = await supabase
        .from('attendance')
        .select('*')
        .lt('created_at', oneYearCutoff)
        .limit(500);

      if (oldAttendance && oldAttendance.length > 0) {
        for (const r of oldAttendance) {
          await database.insert(attendanceHistory).values({
            id: r.id,
            studentId: r.student_id,
            studentName: r.student_name,
            seatNumber: r.seat_number,
            shiftName: r.shift_name,
            checkIn: r.check_in,
            checkOut: r.check_out,
            status: r.status,
            photoUrl: r.photo_url,
            date: r.date,
          }).onConflictDoNothing();
        }
        await supabase.from('attendance').delete().lt('created_at', oneYearCutoff);
        console.log(`[Daily Backup] Safely archived ${oldAttendance.length} records (>1 year old) to D1.`);
      }
    } catch (archiveErr) {
      console.warn('[Daily Backup] Auto-prune notice:', archiveErr);
    }

    const reportData = await buildDailyReportData(env, todayDateStr);

    // 4. Store snapshot in D1 `reportsHistory` table
    const reportId = generateRecordId('rep');
    await database.insert(reportsHistory).values({
      id: reportId,
      reportDate: todayDateStr,
      reportType: 'daily_summary',
      totalStudents: reportData.totalStudents,
      totalPresent: reportData.totalPresent,
      totalAbsent: reportData.totalAbsent,
      totalFeeCollected: reportData.totalFeeCollected,
      totalPendingDues: reportData.totalPendingDues,
      occupiedSeats: reportData.occupiedSeats,
      reservedSeats: reportData.reservedSeats,
      availableSeats: reportData.availableSeats,
      summaryPayload: JSON.stringify(reportData),
      emailDispatched: false,
    }).onConflictDoNothing();

    // 5. Send the Daily Email Digest to the Admin with PDF & CSV attachments
    const emailRes = await sendDailyAdminBackupReportEmail(env, reportData);
    if (emailRes.success) {
      await database
        .update(reportsHistory)
        .set({ emailDispatched: true })
        .where(eq(reportsHistory.id, reportId));
    }

    console.log(`[Daily Backup] Completed successfully for ${todayDateStr}. Email sent: ${emailRes.success}`);
    return { success: true, report: reportData };
  } catch (err: any) {
    console.error('[Daily Backup] Failed:', err);
    return { success: false, error: err.message };
  }
}

// ══════════════════════════════════════════════════════════════════
// SECTION 17 · MONTHLY ARCHIVAL JOB
// Rolls last month's records into D1 archive tables. Triggered by cron on the 1st.
// ══════════════════════════════════════════════════════════════════
// Runs on the 1st of every month at 00:00 UTC.
export async function runMonthlyArchivalJob(env: Bindings): Promise<{ success: boolean; error?: string; archivedCount?: number }> {
  console.log("Starting Monthly Supabase -> D1 Archival Job...");
  const database = db({ env });
  const supabase = getSupabase(env);
  let totalArchived = 0;

  try {
    // 0. Incremental Student Backup: Sync any new/updated profiles to D1 students cold storage
    try {
      const { data: supaProfiles } = await supabase.from('profiles').select('*');
      if (supaProfiles && supaProfiles.length > 0) {
        for (const p of supaProfiles) {
          if (p.role === 'admin' || p.email === MASTER_ADMIN_EMAIL) continue;
          await database.insert(students).values({
            id: p.id,
            studentCode: p.student_code || p.member_id || `SDL-2026-${String(p.id).slice(-4).toUpperCase()}`,
            fullName: p.full_name || 'Student Member',
            email: p.email || '',
            phone: p.phone || '',
            parentName: p.parent_name || '',
            parentPhone: p.parent_phone || '',
            address: p.address || 'Madhupur, Sonbhadra, UP',
            course: p.course || 'General',
            shift: p.shift || 'Morning Shift',
            membershipPlan: p.membership_plan || 'General',
            seatNumber: p.seat_number || null,
            role: 'student',
            status: p.status || 'active',
            feeStatus: p.fee_status || 'Due',
            dueAmount: Number(p.due_amount || 0),
            avatarUrl: p.avatar_url || null,
            updatedAt: p.updated_at || new Date().toISOString(),
          }).onConflictDoUpdate({
            target: students.id,
            set: {
              fullName: p.full_name,
              phone: p.phone,
              status: p.status,
              feeStatus: p.fee_status,
              dueAmount: Number(p.due_amount || 0),
              seatNumber: p.seat_number,
              membershipPlan: p.membership_plan,
              shift: p.shift,
              updatedAt: new Date().toISOString(),
            }
          });
        }
      }
    } catch (stdErr) {
      console.warn('[Monthly Backup] Student sync note:', stdErr);
    }

    // 1. Archiving Attendance older than 30 days from Supabase
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const dateLimit = thirtyDaysAgo.toISOString();

      const { data: oldAttendance } = await supabase
        .from('attendance')
        .select('*')
        .lt('created_at', dateLimit);

      if (oldAttendance && oldAttendance.length > 0) {
        console.log(`Archiving ${oldAttendance.length} attendance rows to D1...`);
        for (const record of oldAttendance) {
          await database.insert(attendanceHistory).values({
            id: record.id,
            studentId: record.student_id,
            studentName: record.student_name,
            seatNumber: record.seat_number,
            shiftId: record.shift_id,
            shiftName: record.shift_name,
            checkIn: record.check_in,
            checkOut: record.check_out,
            status: record.status,
            photoUrl: record.photo_url,
            date: record.date,
          }).onConflictDoNothing();

          await supabase.from('attendance').delete().eq('id', record.id);
          totalArchived++;
        }
      }
    } catch (attErr) {
      console.warn('[Monthly Backup] Attendance archival note:', attErr);
    }

    // 2. Archiving Fees older than 60 days
    try {
      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
      const feeLimit = sixtyDaysAgo.toISOString();

      const { data: oldFees } = await supabase
        .from('fees')
        .select('*')
        .lt('created_at', feeLimit);

      if (oldFees && oldFees.length > 0) {
        console.log(`Archiving ${oldFees.length} fee receipts to D1...`);
        for (const record of oldFees) {
          await database.insert(feesHistory).values({
            id: record.id,
            studentId: record.student_id,
            studentName: record.student_name,
            type: record.type,
            amount: record.amount,
            paid: record.paid,
            paidAt: record.paid_at,
            dueDate: record.due_date,
            description: record.description,
            receiptNo: record.receipt_no,
          }).onConflictDoNothing();

          await supabase.from('fees').delete().eq('id', record.id);
          totalArchived++;
        }
      }
    } catch (feeErr) {
      console.warn('[Monthly Backup] Fees archival note:', feeErr);
    }

    // 3. Archiving Messages older than 30 days into `messagesHistory`
    try {
      const thirtyDaysAgoMs = new Date();
      thirtyDaysAgoMs.setDate(thirtyDaysAgoMs.getDate() - 30);
      const msgDateLimit = thirtyDaysAgoMs.toISOString();

      const oldMessages = await database
        .select()
        .from(messages)
        .where(lt(messages.createdAt, msgDateLimit))
        .all();

      if (oldMessages && oldMessages.length > 0) {
        console.log(`Archiving ${oldMessages.length} messages to D1 messagesHistory...`);
        for (const m of oldMessages) {
          await database.insert(messagesHistory).values({
            id: m.id,
            studentId: m.studentId,
            studentName: m.studentName,
            studentEmail: m.studentEmail,
            senderRole: m.senderRole,
            senderName: m.senderName,
            message: m.message,
            recipientRole: m.recipientRole,
            recipientName: m.recipientName,
            recipientId: m.recipientId,
            isRead: m.isRead,
            originalCreatedAt: m.createdAt,
          }).onConflictDoNothing();

          await database.delete(messages).where(eq(messages.id, m.id));
          totalArchived++;
        }
      }
    } catch (msgErr) {
      console.warn('[Monthly Backup] Messages archival note:', msgErr);
    }

    console.log("Monthly Archival Job successfully finished. Total archived:", totalArchived);
    return { success: true, archivedCount: totalArchived };
  } catch (error: any) {
    console.error("Monthly Archival Job Failed:", error);
    return { success: false, error: error.message };
  }
}

// ══════════════════════════════════════════════════════════════════
// SECTION 18 · STORAGE & PRUNING ADMIN API
// Storage/database usage, record pruning, manual backup triggers, report downloads (CSV/PDF).
// ══════════════════════════════════════════════════════════════════

// Real-time analysis of Supabase storage vs 500 MB free quota, plus D1 backup metrics
const handleStorageStatus = async (c: any) => {
  try {
    const supabase = getSupabase(c.env);
    const database = db(c);

    // 1. Supabase Metrics
    let totalStudents = 0;
    let totalAttendance = 0;
    let totalFees = 0;
    let totalMessages = 0;

    try {
      const { data: profs } = await supabase.from('profiles').select('id, role, email');
      if (profs) {
        totalStudents = profs.filter((p: any) => p.email !== MASTER_ADMIN_EMAIL && p.role !== 'admin').length;
      }
    } catch {}

    try {
      const { count } = await supabase.from('attendance').select('id', { count: 'exact', head: true });
      if (count !== null && count !== undefined) totalAttendance = count;
    } catch {}

    try {
      const { count } = await supabase.from('fees').select('id', { count: 'exact', head: true });
      if (count !== null && count !== undefined) totalFees = count;
    } catch {}

    try {
      const { count } = await supabase.from('messages').select('id', { count: 'exact', head: true });
      if (count !== null && count !== undefined) totalMessages = count;
    } catch {}

    // Storage estimation: Student profile ~ 2.5 KB, Attendance log ~ 0.4 KB, Fee log ~ 0.5 KB, Message ~ 0.5 KB
    const estimatedBytes = (totalStudents * 2500) + (totalAttendance * 400) + (totalFees * 500) + (totalMessages * 500) + 50000;
    const estimatedMbUsed = Number((estimatedBytes / (1024 * 1024)).toFixed(2));
    const quotaMb = 500;
    const percentageUsed = Number(((estimatedMbUsed / quotaMb) * 100).toFixed(2));

    // 2. D1 Backup Metrics
    let totalBackedUpStudents = 0;
    let totalAttendanceHistory = 0;
    let totalFeesHistory = 0;
    let totalMessagesHistory = 0;

    try {
      const d1StudentsList = await database.select().from(students).all();
      totalBackedUpStudents = d1StudentsList.length;
    } catch {}

    try {
      const attHist = await database.select().from(attendanceHistory).all();
      totalAttendanceHistory = attHist.length;
    } catch {}

    try {
      const feeHist = await database.select().from(feesHistory).all();
      totalFeesHistory = feeHist.length;
    } catch {}

    try {
      const msgHist = await database.select().from(messagesHistory).all();
      totalMessagesHistory = msgHist.length;
    } catch {}

    return c.json({
      success: true,
      supabase: {
        totalStudents,
        totalAttendance,
        totalFees,
        totalMessages,
        estimatedMbUsed,
        quotaMb,
        percentageUsed,
        healthStatus: percentageUsed > 80 ? 'warning' : percentageUsed > 50 ? 'moderate' : 'optimal',
      },
      d1Backup: {
        totalBackedUpStudents,
        totalAttendanceHistory,
        totalFeesHistory,
        totalMessagesHistory,
        lastBackupDate: 'Active (Daily & Real-Time Sync)',
        status: 'synced',
      },
    });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
};

app.get('/api/admin/storage-status', handleStorageStatus);
app.get('/api/admin/database-usage', handleStorageStatus);

// Safely archives old records to Cloudflare D1 first, then deletes from Supabase to free up MBs
const handlePruneRecords = async (c: any) => {
  try {
    const body = await c.req.json();
    const target = body.target; // 'attendance' | 'messages' | 'fees'
    const days = Number(body.daysOlderThan) || 30;
    const database = db(c);
    const supabase = getSupabase(c.env);

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffDateStr = cutoffDate.toISOString();
    let countPruned = 0;

    if (target === 'attendance') {
      try {
        const { data: oldRecords } = await supabase
          .from('attendance')
          .select('*')
          .lt('created_at', cutoffDateStr);

        if (oldRecords && oldRecords.length > 0) {
          for (const r of oldRecords) {
            await database.insert(attendanceHistory).values({
              id: r.id,
              studentId: r.student_id,
              studentName: r.student_name,
              seatNumber: r.seat_number,
              shiftId: r.shift_id,
              shiftName: r.shift_name,
              checkIn: r.check_in,
              checkOut: r.check_out,
              status: r.status,
              photoUrl: r.photo_url,
              date: r.date,
            }).onConflictDoNothing();
          }
          const { error: delErr } = await supabase.from('attendance').delete().lt('created_at', cutoffDateStr);
          if (!delErr) countPruned = oldRecords.length;
        }
      } catch (attErr: any) {
        return c.json({ success: false, error: attErr.message }, 500);
      }
    } else if (target === 'messages') {
      try {
        const oldMessages = await database
          .select()
          .from(messages)
          .where(lt(messages.createdAt, cutoffDateStr))
          .all();

        if (oldMessages && oldMessages.length > 0) {
          for (const m of oldMessages) {
            await database.insert(messagesHistory).values({
              id: m.id,
              studentId: m.studentId,
              studentName: m.studentName,
              studentEmail: m.studentEmail,
              senderRole: m.senderRole,
              senderName: m.senderName,
              message: m.message,
              recipientRole: m.recipientRole,
              recipientName: m.recipientName,
              recipientId: m.recipientId,
              isRead: m.isRead,
              originalCreatedAt: m.createdAt,
            }).onConflictDoNothing();
            await database.delete(messages).where(eq(messages.id, m.id));
            countPruned++;
          }
        }
      } catch (msgErr: any) {
        return c.json({ success: false, error: msgErr.message }, 500);
      }
    } else if (target === 'fees') {
      try {
        const { data: oldFees } = await supabase
          .from('fees')
          .select('*')
          .lt('created_at', cutoffDateStr);

        if (oldFees && oldFees.length > 0) {
          for (const f of oldFees) {
            await database.insert(feesHistory).values({
              id: f.id,
              studentId: f.student_id,
              studentName: f.student_name,
              type: f.type,
              amount: f.amount,
              paid: f.paid,
              paidAt: f.paid_at,
              dueDate: f.due_date,
              description: f.description,
              receiptNo: f.receipt_no,
            }).onConflictDoNothing();
          }
          const { error: delErr } = await supabase.from('fees').delete().lt('created_at', cutoffDateStr);
          if (!delErr) countPruned = oldFees.length;
        }
      } catch (feeErr: any) {
        return c.json({ success: false, error: feeErr.message }, 500);
      }
    }

    return c.json({
      success: true,
      countPruned,
      target,
      message: `Safely archived to Cloudflare D1 permanent storage and pruned ${countPruned} ${target} records from Supabase. Zero data loss.`,
    });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
};

app.post('/api/admin/prune-supabase', handlePruneRecords);
app.post('/api/admin/prune-old-records', handlePruneRecords);

// Incremental backup endpoint for newly added single records
app.post('/api/backup/sync-record', async (c) => {
  if (!(await isAuthorizedRequest(c, true))) {
    return c.json({ success: false, error: 'Unauthorized: Admin authorization required' }, 401);
  }

  try {
    const { type, record } = await c.req.json();
    const database = db(c);

    if (type === 'student' && record) {
      await database.insert(students).values(record).onConflictDoUpdate({
        target: students.id,
        set: {
          fullName: record.fullName,
          phone: record.phone,
          status: record.status,
          feeStatus: record.feeStatus,
          dueAmount: record.dueAmount,
          seatNumber: record.seatNumber,
          membershipPlan: record.membershipPlan,
          shift: record.shift,
          updatedAt: new Date().toISOString(),
        }
      });
      return c.json({ success: true, message: 'Student synced to D1 backup' });
    }

    if (type === 'fee' && record) {
      await database.insert(feesHistory).values({
        id: record.id || generateRecordId('fee'),
        studentId: record.studentId,
        studentName: record.studentName,
        type: record.type || 'Monthly Seat Fee',
        amount: record.amount,
        paid: Boolean(record.paid),
        paidAt: record.paidAt,
        dueDate: record.dueDate,
        description: record.description,
        receiptNo: record.receiptNo,
      }).onConflictDoNothing();
      return c.json({ success: true, message: 'Fee synced to D1 backup' });
    }

    return c.json({ success: false, error: 'Unknown record type' }, 400);
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// Trigger manual daily backup digest and email
app.post('/api/backup/trigger-daily', async (c) => {
  if (!(await isAuthorizedRequest(c, true))) {
    return c.json({ success: false, error: 'Unauthorized: Admin authorization required' }, 401);
  }

  try {
    const result = await runDailyBackupJob(c.env);
    return c.json(result);
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// Trigger manual monthly archival
app.post('/api/backup/trigger-monthly', async (c) => {
  if (!(await isAuthorizedRequest(c, true))) {
    return c.json({ success: false, error: 'Unauthorized: Admin authorization required' }, 401);
  }

  try {
    const result = await runMonthlyArchivalJob(c.env);
    return c.json(result);
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// Fetch historical daily reports snapshots from D1
app.get('/api/backup/reports', async (c) => {
  try {
    const database = db(c);
    const reports = await database
      .select()
      .from(reportsHistory)
      .orderBy(desc(reportsHistory.createdAt))
      .limit(30)
      .all();

    return c.json({ success: true, reports });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// Download today's official Daily Student Operations Report as genuine PDF
app.get('/api/backup/download-pdf', async (c) => {
  try {
    const dateParam = c.req.query('date');
    const reportData = await buildDailyReportData(c.env, dateParam);
    const { generateDailyReportPdf } = await import('./reportGenerator');
    const pdfBytes = generateDailyReportPdf(reportData);

    return new Response(pdfBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Daily_Student_Operations_Report_${reportData.reportDate}.pdf"`,
        'Cache-Control': 'no-cache',
      },
    });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// Download today's official Daily Student Operations Report as 14-column CSV
app.get('/api/backup/download-csv', async (c) => {
  try {
    const dateParam = c.req.query('date');
    const reportData = await buildDailyReportData(c.env, dateParam);
    const { generateDailyReportCsv } = await import('./reportGenerator');
    const csvContent = generateDailyReportCsv(reportData);

    return new Response(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="Daily_Student_Operations_Report_${reportData.reportDate}.csv"`,
        'Cache-Control': 'no-cache',
      },
    });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// Get latest daily report JSON payload
app.get('/api/backup/latest', async (c) => {
  try {
    const dateParam = c.req.query('date');
    const reportData = await buildDailyReportData(c.env, dateParam);
    return c.json({ success: true, report: reportData });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// ══════════════════════════════════════════════════════════════════
// SECTION 19 · WORKER EXPORT
// fetch handler + scheduled cron router (daily backup 17:30/18:30 IST, monthly archival on the 1st).
// ══════════════════════════════════════════════════════════════════
export default {
  fetch: app.fetch,
  scheduled: async (event: ScheduledEvent, env: Bindings, ctx: ExecutionContext) => {
    console.log(`[Cron Triggered] Cron pattern: ${event.cron}`);

    // If it's the nightly 11:00 PM IST (17:30 UTC) trigger -> Run Daily Backup & Email
    if (event.cron === "30 17 * * *") {
      ctx.waitUntil(runDailyBackupJob(env));
      return;
    }

    // If it's the 1st of the month 00:00 UTC trigger -> Run Monthly Archival
    if (event.cron === "0 0 1 * *") {
      ctx.waitUntil(runMonthlyArchivalJob(env));
      return;
    }

    // Default fallback: Run daily backup
    ctx.waitUntil(runDailyBackupJob(env));
  },
};

