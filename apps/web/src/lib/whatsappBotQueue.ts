/**
 * [WEB • LIB • WHATSAPP] WhatsApp Bot Automated Queue Service
 *
 * Dispatches automated check-in / check-out messages to the Render WhatsApp Bot:
 * Endpoint: https://whatsapp-bot-9h4k.onrender.com/send-message
 *
 * STRICT RATE LIMITING RULE:
 * Maximum 15 messages per minute (minimum 4000ms delay between dispatches +
 * rolling 60-second throttle window).
 */

import { BRAND_CONFIG } from "@/lib/config";
import { createClient } from "@/lib/supabase/client";

export const BOT_CONFIG = {
  DEFAULT_URL: "https://whatsapp-bot-9h4k.onrender.com",
  DEFAULT_API_KEY: "genius123",
  MAX_MESSAGES_PER_MINUTE: 15,
  MIN_DELAY_MS: 4000, // 60,000ms / 15 = 4,000ms
  QUEUE_STORAGE_KEY: "genius_whatsapp_queue",
  HISTORY_STORAGE_KEY: "genius_whatsapp_history",
  SETTINGS_STORAGE_KEY: "genius_whatsapp_bot_settings",
};

export interface WhatsAppQueueItem {
  id: string;
  studentId: string;
  studentName: string;
  phone: string;
  action: "checked_in" | "checked_out" | "custom";
  message: string;
  createdAt: string;
  status: "pending" | "processing" | "sent" | "failed";
  attempts: number;
  lastAttemptAt?: string;
  error?: string;
}

export interface WhatsAppQueueStats {
  pendingCount: number;
  sentTodayCount: number;
  failedCount: number;
  isProcessing: boolean;
  messagesSentLastMinute: number;
  recentLogs: WhatsAppQueueItem[];
}

let inMemoryQueue: WhatsAppQueueItem[] = [];
let sentTimestamps: number[] = [];
let isQueueWorkerRunning = false;

// ---------------------------------------------------------------------------
// Helpers: Storage & Config
// ---------------------------------------------------------------------------
function getBotSettings(): { botUrl: string; apiKey: string } {
  if (typeof window === "undefined") {
    return { botUrl: BOT_CONFIG.DEFAULT_URL, apiKey: BOT_CONFIG.DEFAULT_API_KEY };
  }
  try {
    const raw = localStorage.getItem(BOT_CONFIG.SETTINGS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        botUrl: (parsed.customUrl || parsed.botUrl || BOT_CONFIG.DEFAULT_URL).trim().replace(/\/+$/, ""),
        apiKey: (parsed.apiKey || BOT_CONFIG.DEFAULT_API_KEY).trim(),
      };
    }
  } catch {}
  return { botUrl: BOT_CONFIG.DEFAULT_URL, apiKey: BOT_CONFIG.DEFAULT_API_KEY };
}

function loadSavedQueue(): WhatsAppQueueItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(BOT_CONFIG.QUEUE_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

function saveQueue(queue: WhatsAppQueueItem[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(BOT_CONFIG.QUEUE_STORAGE_KEY, JSON.stringify(queue));
    notifyQueueStateChanged();
  } catch {}
}

function appendHistory(item: WhatsAppQueueItem) {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(BOT_CONFIG.HISTORY_STORAGE_KEY);
    const history: WhatsAppQueueItem[] = raw ? JSON.parse(raw) : [];
    history.unshift(item);
    // Keep last 100 entries
    localStorage.setItem(BOT_CONFIG.HISTORY_STORAGE_KEY, JSON.stringify(history.slice(0, 100)));
  } catch {}
}

function notifyQueueStateChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("whatsapp_queue_updated"));
  }
}

// Format phone to WhatsApp international format (e.g. 919876543210)
export function sanitizeWhatsAppPhone(phone: string): string {
  const digits = (phone || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  if (digits.length > 10) return digits.slice(-10).padStart(12, "91");
  return digits;
}

// ---------------------------------------------------------------------------
// Rate Limiter & Dispatcher Worker
// ---------------------------------------------------------------------------
async function processQueue() {
  if (isQueueWorkerRunning) return;
  if (typeof window === "undefined") return;

  // Sync memory queue with storage
  if (inMemoryQueue.length === 0) {
    inMemoryQueue = loadSavedQueue();
  }

  if (inMemoryQueue.length === 0) return;

  isQueueWorkerRunning = true;

  try {
    while (inMemoryQueue.length > 0) {
      // 1. Sliding 60-second window rate limit check (max 15 msgs/min)
      const now = Date.now();
      sentTimestamps = sentTimestamps.filter((t) => now - t < 60000);

      if (sentTimestamps.length >= BOT_CONFIG.MAX_MESSAGES_PER_MINUTE) {
        // Wait until oldest message expires from the 60s window
        const oldest = sentTimestamps[0];
        const waitTime = Math.max(1000, 60000 - (now - oldest) + 200);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        continue;
      }

      const item = inMemoryQueue[0];
      item.status = "processing";
      item.attempts += 1;
      item.lastAttemptAt = new Date().toISOString();
      saveQueue(inMemoryQueue);

      const { botUrl, apiKey } = getBotSettings();
      // Primary: Route through Cloudflare Worker proxy to bypass browser CORS preflight blocks
      const proxyEndpoint = `${BRAND_CONFIG.apiUrl}/api/whatsapp/send`;

      let isSuccess = false;
      let errorMsg = "";

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 14000);

        const response = await fetch(proxyEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            number: item.phone,
            message: item.message,
            studentName: item.studentName,
            action: item.action,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const data = await response.json().catch(() => ({}));

        if (response.ok && data.success !== false) {
          isSuccess = true;
        } else {
          errorMsg = data.error || `HTTP ${response.status}: ${response.statusText}`;
        }
      } catch (proxyErr: any) {
        errorMsg = proxyErr.name === "AbortError" ? "Request timed out (Bot waking up)" : proxyErr.message;
      }

      // Secondary fallback: Try direct dispatch if custom bot URL is configured
      if (!isSuccess && botUrl && botUrl !== BOT_CONFIG.DEFAULT_URL) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000);

          const directRes = await fetch(`${botUrl}/send-message`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": apiKey,
            },
            body: JSON.stringify({
              number: item.phone,
              message: item.message,
            }),
            signal: controller.signal,
          });

          clearTimeout(timeoutId);
          const directData = await directRes.json().catch(() => ({}));
          if (directRes.ok && directData.success !== false) {
            isSuccess = true;
            errorMsg = "";
          }
        } catch (directErr: any) {
          console.warn("[WhatsApp Queue] Direct fallback notice:", directErr);
        }
      }

      if (isSuccess) {
        item.status = "sent";
        sentTimestamps.push(Date.now());
        appendHistory({ ...item });

        // Log to Supabase messages (Primary Source of Truth)
        try {
          const supabase = createClient();
          supabase.from("messages").insert({
            id: `msg-wa-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            student_id: item.studentId || "WHATSAPP_BOT",
            student_name: item.studentName || "Student",
            student_email: item.phone,
            sender_role: "admin",
            sender_name: "WhatsApp Bot",
            message: `[WhatsApp ${item.action.toUpperCase()}] ${item.message}`,
            recipient_role: "student",
            is_read: true,
          }).then();
        } catch (sbMsgErr) {
          console.warn("[WhatsApp Queue] Supabase message log notice:", sbMsgErr);
        }

        // Remove from pending queue
        inMemoryQueue.shift();
        saveQueue(inMemoryQueue);
      } else {
        item.error = errorMsg;
        if (item.attempts >= 3) {
          item.status = "failed";
          appendHistory({ ...item });
          inMemoryQueue.shift();
          saveQueue(inMemoryQueue);
        } else {
          item.status = "pending";
          saveQueue(inMemoryQueue);
          // Wait extra before retrying failed attempt
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }
      }

      // Mandatory throttle delay with randomized organic jitter (4000ms - 4800ms)
      if (inMemoryQueue.length > 0) {
        const organicJitter = Math.floor(Math.random() * 800);
        await new Promise((resolve) => setTimeout(resolve, BOT_CONFIG.MIN_DELAY_MS + organicJitter));
      }
    }
  } finally {
    isQueueWorkerRunning = false;
  }
}

// ---------------------------------------------------------------------------
// Enqueue Attendance Notification
// ---------------------------------------------------------------------------
export async function enqueueAttendanceWhatsApp(params: {
  studentId: string;
  studentName: string;
  phone?: string;
  action: "checked_in" | "checked_out";
  seatNumber?: string;
  shiftName?: string;
  checkInTime?: string;
  checkOutTime?: string;
}): Promise<boolean> {
  if (typeof window === "undefined") return false;

  let targetPhone = params.phone?.trim() || "";
  let targetName = params.studentName?.trim() || "";
  let targetSeat = params.seatNumber?.trim() || "";
  let targetShift = params.shiftName?.trim() || "";

  // 1. Lookup missing phone, name, seat or shift from Supabase profiles
  if ((!targetPhone || !targetName || !targetSeat || !targetShift) && params.studentId) {
    try {
      const supabase = createClient();
      const { data: profile } = await supabase
        .from("profiles")
        .select("phone, full_name, seat_number, shift, parent_phone")
        .or(`id.eq.${params.studentId},student_code.eq.${params.studentId}`)
        .maybeSingle();

      if (profile) {
        if (!targetPhone && profile.phone) targetPhone = profile.phone;
        if (!targetName && profile.full_name) targetName = profile.full_name;
        if (!targetSeat && profile.seat_number) targetSeat = profile.seat_number;
        if (!targetShift && profile.shift) targetShift = profile.shift;
      }
    } catch (lookupErr) {
      console.warn("[WhatsApp Queue] Profile lookup notice:", lookupErr);
    }
  }

  const cleanPhone = sanitizeWhatsAppPhone(targetPhone);
  const displayName = targetName || "Student Member";
  if (!cleanPhone || cleanPhone.length < 10) {
    console.warn("[WhatsApp Queue] Cannot dispatch: No valid phone for student:", displayName);
    return false;
  }

  // 2. Prevent duplicate check-in/out messages within 2 minutes for the same student
  const savedQueue = loadSavedQueue();
  const recentDuplicate = savedQueue.find(
    (q) =>
      q.studentId === params.studentId &&
      q.action === params.action &&
      Date.now() - new Date(q.createdAt).getTime() < 120000
  );
  if (recentDuplicate) {
    console.warn("[WhatsApp Queue] Skipped duplicate attendance alert for:", displayName);
    return false;
  }

  // 3. Format dynamic anti-ban notification text (Maximum text entropy)
  const now = new Date();
  const dateFormatted = now.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  
  // High-precision time with seconds to guarantee per-message timestamp uniqueness
  const timeFormatted =
    params.checkInTime ||
    params.checkOutTime ||
    now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });

  const libraryName = BRAND_CONFIG.fullName || "Genius Library";
  const seatText = targetSeat ? `#${targetSeat}` : "General Study Desk";
  const shiftText = targetShift || "Regular Shift";
  const isMorning = now.getHours() < 12;

  // Rotating greetings for anti-spam variability
  const checkInGreetings = [
    `Namaste *${displayName}* ji,`,
    `Hello *${displayName}*,`,
    `${isMorning ? "Shubh Prabhat" : "Shubh Din"} *${displayName}*,`,
    `Welcome *${displayName}*,`,
    `Priya *${displayName}*,`,
  ];
  const checkOutGreetings = [
    `Namaste *${displayName}* ji,`,
    `Hello *${displayName}*,`,
    `Shubh Sandhya *${displayName}*,`,
    `Dhanyawad *${displayName}*,`,
  ];

  // Rotating positive study quotes
  const checkInWishes = [
    `🎯 Focus on your goals & study well today!`,
    `✨ May today be your most productive study session!`,
    `📖 Consistency is your superpower. Keep pushing forward!`,
    `💡 Maintain silence and make every minute count!`,
    `🚀 Hard work always pays off. Stay dedicated!`,
    `🌟 Wishing you deep focus and high retention today!`,
  ];

  const checkOutWishes = [
    `👏 Great dedication today! Rest well and see you tomorrow.`,
    `🌙 Another productive study day completed toward your goal!`,
    `🎯 Daily consistency brings top ranks. Keep it up!`,
    `📚 Relax tonight. Kal naye josh ke sath fir milte hain!`,
    `✨ Make sure to review your day's notes before sleeping.`,
  ];

  // Pick pseudo-random variations based on timestamp & student ID
  const seed = now.getTime() + displayName.length;
  const pickedGreetingIn = checkInGreetings[seed % checkInGreetings.length];
  const pickedGreetingOut = checkOutGreetings[seed % checkOutGreetings.length];
  const pickedWishIn = checkInWishes[seed % checkInWishes.length];
  const pickedWishOut = checkOutWishes[seed % checkOutWishes.length];

  // Unique Anti-Ban Verification Code (ensures every hash is 100% distinct)
  const uniqueToken = `#SDL-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;

  let messageText = "";
  if (params.action === "checked_in") {
    messageText = 
      `*🏛️ ${libraryName}*\n\n` +
      `${pickedGreetingIn}\n` +
      `Aapka *Check-In* safaltapoorvak darj ho gaya hai.\n\n` +
      `📅 *Date:* ${dateFormatted}\n` +
      `⏰ *Entry Time:* ${timeFormatted}\n` +
      `🪑 *Desk Allotted:* ${seatText}\n` +
      `📖 *Shift:* ${shiftText}\n` +
      `🔖 *Ref ID:* ${uniqueToken}\n\n` +
      `${pickedWishIn}`;
  } else {
    messageText = 
      `*🏛️ ${libraryName}*\n\n` +
      `${pickedGreetingOut}\n` +
      `Aapka *Check-Out* safaltapoorvak darj ho gaya hai.\n\n` +
      `📅 *Date:* ${dateFormatted}\n` +
      `⏰ *Exit Time:* ${timeFormatted}\n` +
      `🪑 *Desk Released:* ${seatText}\n` +
      `🔖 *Ref ID:* ${uniqueToken}\n\n` +
      `${pickedWishOut}`;
  }

  const newItem: WhatsAppQueueItem = {
    id: `wa-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    studentId: params.studentId,
    studentName: displayName,
    phone: cleanPhone,
    action: params.action,
    message: messageText,
    createdAt: new Date().toISOString(),
    status: "pending",
    attempts: 0,
  };

  inMemoryQueue = [...savedQueue, newItem];
  saveQueue(inMemoryQueue);

  // Trigger queue processor (asynchronous, non-blocking)
  processQueue().catch((err) => console.error("[WhatsApp Queue Worker Error]:", err));

  return true;
}

// ---------------------------------------------------------------------------
// Enqueue Direct Custom Message
// ---------------------------------------------------------------------------
export function enqueueCustomWhatsApp(params: {
  phone: string;
  studentName?: string;
  message: string;
}): boolean {
  if (typeof window === "undefined") return false;

  const cleanPhone = sanitizeWhatsAppPhone(params.phone);
  if (!cleanPhone || cleanPhone.length < 10) return false;

  const savedQueue = loadSavedQueue();
  const newItem: WhatsAppQueueItem = {
    id: `wa-custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    studentId: "DIRECT",
    studentName: params.studentName || "Student",
    phone: cleanPhone,
    action: "custom",
    message: params.message,
    createdAt: new Date().toISOString(),
    status: "pending",
    attempts: 0,
  };

  inMemoryQueue = [...savedQueue, newItem];
  saveQueue(inMemoryQueue);

  processQueue().catch((err) => console.error("[WhatsApp Queue Worker Error]:", err));
  return true;
}

// ---------------------------------------------------------------------------
// Enqueue Close Library Broadcast (Anti-Ban Randomized per student)
// ---------------------------------------------------------------------------
export function enqueueCloseLibraryBroadcast(params: {
  reason: string;
  reopenTime?: string;
  customNote?: string;
  students: Array<{ id: string; name: string; phone: string }>;
}): number {
  if (typeof window === "undefined" || !params.students || params.students.length === 0) return 0;

  const libraryName = BRAND_CONFIG.fullName || "Genius Library";
  const hotline = BRAND_CONFIG.phone || "+91 8423448899";
  const now = new Date();
  const dateFormatted = now.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  const greetings = [
    (name: string) => `Namaste *${name}* ji,`,
    (name: string) => `Priya Vidyarthi *${name}*,`,
    (name: string) => `Hello *${name}*,`,
    (name: string) => `Aadarniya *${name}* ji,`,
    (name: string) => `Shubh Prabhat *${name}* ji,`,
  ];

  const closingWishes = [
    "📖 Ghar par apni padhai nirantar jari rakhein. Best of luck for your goals!",
    "🎯 Aaj ke din ka pura sadupayog self-study aur notes revision me karein.",
    "💡 Consistency is key. Kal naye josh ke sath library me milte hain!",
    "✨ Stay safe and study well at home. We wish you high focus!",
    "🌟 Apne upcoming exams ki taiyari lagan se karein. Good luck!",
  ];

  const savedQueue = loadSavedQueue();
  const newItems: WhatsAppQueueItem[] = [];

  params.students.forEach((std, idx) => {
    const cleanPhone = sanitizeWhatsAppPhone(std.phone);
    if (!cleanPhone || cleanPhone.length < 10) return;

    const studentName = std.name || "Student Member";
    const pickedGreeting = greetings[(idx + now.getSeconds()) % greetings.length](studentName);
    const pickedWish = closingWishes[(idx + now.getMinutes()) % closingWishes.length];
    const uniqueRef = `#SDL-OFF-${Date.now().toString(36).toUpperCase()}-${idx + 1}-${Math.floor(100 + Math.random() * 900)}`;

    const messageText =
      `*🏛️ ${libraryName} • Zaruri Suchna*\n\n` +
      `${pickedGreeting}\n` +
      `Kripya dhyan dein: Library aaj / aane wale samay ke liye *Band (Closed)* rahegi.\n\n` +
      `📌 *Karan (Reason):* ${params.reason}\n` +
      (params.reopenTime ? `⏰ *Kab Khulegi (Reopen):* ${params.reopenTime}\n` : "") +
      (params.customNote ? `📝 *Vishesh Note:* ${params.customNote}\n` : "") +
      `📅 *Date:* ${dateFormatted}\n` +
      `📞 *Helpdesk:* ${hotline}\n` +
      `🔖 *Ref Token:* ${uniqueRef}\n\n` +
      `${pickedWish}`;

    newItems.push({
      id: `wa-close-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
      studentId: std.id,
      studentName,
      phone: cleanPhone,
      action: "custom",
      message: messageText,
      createdAt: new Date().toISOString(),
      status: "pending",
      attempts: 0,
    });
  });

  if (newItems.length > 0) {
    inMemoryQueue = [...savedQueue, ...newItems];
    saveQueue(inMemoryQueue);
    processQueue().catch((err) => console.error("[WhatsApp Queue Worker Error]:", err));
  }

  return newItems.length;
}

// ---------------------------------------------------------------------------
// Enqueue Due Fee Reminder Alert (Anti-Ban Unique Token & Variables)
// ---------------------------------------------------------------------------
export function enqueueDueFeeReminder(params: {
  studentId: string;
  studentName: string;
  phone: string;
  dueAmount: number;
  dueDate?: string;
}): boolean {
  if (typeof window === "undefined") return false;

  const cleanPhone = sanitizeWhatsAppPhone(params.phone);
  if (!cleanPhone || cleanPhone.length < 10) return false;

  const libraryName = BRAND_CONFIG.fullName || "Genius Library";
  const studentName = params.studentName || "Student";
  const upiId = BRAND_CONFIG.payment?.upiId || "genius.library@upi";
  const uniqueRef = `#FEE-DUE-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;

  const messageText =
    `*🏛️ ${libraryName} • Monthly Fee Reminder*\n\n` +
    `Namaste *${studentName}* ji,\n` +
    `Aapki monthly library study seat fee ka baki amount darj hai.\n\n` +
    `💰 *Due Amount:* ₹${params.dueAmount}\n` +
    (params.dueDate ? `📅 *Due Date:* ${params.dueDate}\n` : "") +
    `💳 *Library UPI ID:* \`${upiId}\`\n` +
    `🔖 *Ref Token:* ${uniqueRef}\n\n` +
    `Kripya samay par fee jama karke front desk par receipt confirm karein taaki aapki reserved study seat nirantar surakshit rahe.\n\n` +
    `_Dhanyawad & Best Wishes for your exams!_`;

  return enqueueCustomWhatsApp({
    phone: cleanPhone,
    studentName,
    message: messageText,
  });
}

// ---------------------------------------------------------------------------
// Queue State Inspection for Admin Console
// ---------------------------------------------------------------------------
export function getWhatsAppQueueStats(): WhatsAppQueueStats {
  if (typeof window === "undefined") {
    return {
      pendingCount: 0,
      sentTodayCount: 0,
      failedCount: 0,
      isProcessing: false,
      messagesSentLastMinute: 0,
      recentLogs: [],
    };
  }

  const queue = loadSavedQueue();
  let history: WhatsAppQueueItem[] = [];
  try {
    const rawHist = localStorage.getItem(BOT_CONFIG.HISTORY_STORAGE_KEY);
    if (rawHist) history = JSON.parse(rawHist);
  } catch {}

  const now = Date.now();
  const sentLastMin = sentTimestamps.filter((t) => now - t < 60000).length;

  const todayStr = new Date().toISOString().slice(0, 10);
  const sentToday = history.filter(
    (h) => h.status === "sent" && h.createdAt && h.createdAt.startsWith(todayStr)
  ).length;

  const failedCount = history.filter((h) => h.status === "failed").length;

  return {
    pendingCount: queue.length,
    sentTodayCount: sentToday,
    failedCount,
    isProcessing: isQueueWorkerRunning,
    messagesSentLastMinute: sentLastMin,
    recentLogs: [...queue, ...history].slice(0, 20),
  };
}

export function clearWhatsAppQueue(): void {
  if (typeof window === "undefined") return;
  inMemoryQueue = [];
  saveQueue([]);
}
