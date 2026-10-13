/**
 * [WEB • LIB • WHATSAPP] WhatsApp Bot Automated Queue Service
 *
 * STRICT PROJECT RULES:
 * 1. ONLY 2 TYPES OF WHATSAPP MESSAGES ARE ALLOWED IN THE ENTIRE PROJECT:
 *    - Type 1: Library Closed / Holiday Notification (action: "library_closed")
 *    - Type 2: Pending Fee Due Reminder (action: "due_fee_reminder")
 *    (All attendance WhatsApp messages have been permanently removed).
 *
 * 2. ANTI-BAN THROTTLE & RATE LIMITING RULES:
 *    - Random delay between 5 seconds (5000ms) and 20 seconds (20000ms) between consecutive messages.
 *    - Maximum 100 messages in rolling 30 minutes window.
 */

import { BRAND_CONFIG } from "@/lib/config";
import { createClient } from "@/lib/supabase/client";

export const BOT_CONFIG = {
  DEFAULT_URL: "https://whatsapp-bot-9h4k.onrender.com",
  DEFAULT_API_KEY: "genius123",
  MAX_MESSAGES_PER_30_MINS: 100, // Maximum 100 messages in 30 minutes
  WINDOW_30_MINS_MS: 30 * 60 * 1000, // 30 minutes in milliseconds (1,800,000 ms)
  MIN_DELAY_MS: 5000, // Minimum 5 seconds gap
  MAX_DELAY_MS: 20000, // Maximum 20 seconds gap
  QUEUE_STORAGE_KEY: "genius_whatsapp_queue",
  HISTORY_STORAGE_KEY: "genius_whatsapp_history",
  SETTINGS_STORAGE_KEY: "genius_whatsapp_bot_settings",
};

export type PermittedWhatsAppAction = "due_fee_reminder" | "library_closed" | "custom";

export interface WhatsAppQueueItem {
  id: string;
  studentId: string;
  studentName: string;
  phone: string;
  action: PermittedWhatsAppAction;
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
  messagesSentLast30Mins: number;
  recentLogs: WhatsAppQueueItem[];
}

let inMemoryQueue: WhatsAppQueueItem[] = [];
let sentTimestamps: number[] = [];
let isQueueWorkerRunning = false;

// Random delay helper: 5 seconds to 20 seconds
export function getRandomDelayMs(): number {
  return Math.floor(Math.random() * (BOT_CONFIG.MAX_DELAY_MS - BOT_CONFIG.MIN_DELAY_MS + 1)) + BOT_CONFIG.MIN_DELAY_MS;
}

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
// Rate Limiter & Dispatcher Worker (Strict 5s-20s Random Delay, Max 100 in 30 mins)
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
      const item = inMemoryQueue[0];

      // STRICT VALIDATION: Only 2 message types allowed in whole project
      if (item.action !== "due_fee_reminder" && item.action !== "library_closed") {
        console.warn(`[WhatsApp Queue] Blocked item with action "${item.action}". Only "due_fee_reminder" and "library_closed" are permitted.`);
        inMemoryQueue.shift();
        saveQueue(inMemoryQueue);
        continue;
      }

      // 1. Sliding 30-minute window rate limit check (max 100 msgs in 30 mins)
      const now = Date.now();
      sentTimestamps = sentTimestamps.filter((t) => now - t < BOT_CONFIG.WINDOW_30_MINS_MS);

      if (sentTimestamps.length >= BOT_CONFIG.MAX_MESSAGES_PER_30_MINS) {
        // Wait until oldest message expires from the 30-minute window
        const oldest = sentTimestamps[0];
        const waitTime = Math.max(1000, BOT_CONFIG.WINDOW_30_MINS_MS - (now - oldest) + 1000);
        console.log(`[WhatsApp Queue] Safe limit (100 msgs/30 mins) reached. Throttling for ${Math.ceil(waitTime / 1000)}s.`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        continue;
      }

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
        const timeoutId = setTimeout(() => controller.abort(), 15000);

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
          const timeoutId = setTimeout(() => controller.abort(), 12000);

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

      // Mandatory Anti-Ban Delay: Random gap between 5 seconds (5000ms) and 20 seconds (20000ms)
      if (inMemoryQueue.length > 0) {
        const randomDelay = getRandomDelayMs();
        console.log(`[WhatsApp Queue] Safe anti-ban delay before next message: ${(randomDelay / 1000).toFixed(1)}s (Range: 5s - 20s)`);
        await new Promise((resolve) => setTimeout(resolve, randomDelay));
      }
    }
  } finally {
    isQueueWorkerRunning = false;
  }
}

// ---------------------------------------------------------------------------
// Attendance WhatsApp (Permanently disabled as requested)
// ---------------------------------------------------------------------------
export async function enqueueAttendanceWhatsApp(_params: any): Promise<boolean> {
  // Permanently disabled: Attendance marking does NOT send WhatsApp messages
  return false;
}

// ---------------------------------------------------------------------------
// Enqueue Direct Custom Message (Only allowed if action is permitted)
// ---------------------------------------------------------------------------
export function enqueueCustomWhatsApp(params: {
  phone: string;
  studentName?: string;
  message: string;
  action?: PermittedWhatsAppAction;
}): boolean {
  if (typeof window === "undefined") return false;

  const cleanPhone = sanitizeWhatsAppPhone(params.phone);
  if (!cleanPhone || cleanPhone.length < 10) return false;

  const permittedAction: PermittedWhatsAppAction =
    params.action === "library_closed" ? "library_closed" : "due_fee_reminder";

  const savedQueue = loadSavedQueue();
  const newItem: WhatsAppQueueItem = {
    id: `wa-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    studentId: "DIRECT",
    studentName: params.studentName || "Student",
    phone: cleanPhone,
    action: permittedAction,
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
// Message Type 1: Close Library Broadcast (Anti-Ban Randomized per student)
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
      action: "library_closed",
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
// Message Type 2: Single Student Due Fee Reminder Alert
// ---------------------------------------------------------------------------
export function enqueueDueFeeReminder(params: {
  studentId: string;
  studentName: string;
  phone: string;
  dueAmount: number;
  dueDate?: string;
  feeType?: string;
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
    (params.feeType ? `📋 *Fee Type:* ${params.feeType}\n` : "") +
    (params.dueDate ? `📅 *Due Date:* ${params.dueDate}\n` : "") +
    `💳 *Library UPI ID:* \`${upiId}\`\n` +
    `🔖 *Ref Token:* ${uniqueRef}\n\n` +
    `Kripya samay par fee jama karke front desk par receipt confirm karein taaki aapki reserved study seat nirantar surakshit rahe.\n\n` +
    `_Dhanyawad & Best Wishes for your exams!_`;

  const savedQueue = loadSavedQueue();
  const newItem: WhatsAppQueueItem = {
    id: `wa-fee-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    studentId: params.studentId,
    studentName,
    phone: cleanPhone,
    action: "due_fee_reminder",
    message: messageText,
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
// Message Type 2 (Bulk): Send Reminder to ALL Due Students with 5s-20s Random Delay
// ---------------------------------------------------------------------------
export function enqueueBulkDueFeeReminders(dueList: Array<{
  studentId: string;
  studentName: string;
  phone: string;
  dueAmount: number;
  dueDate?: string;
  feeType?: string;
}>): number {
  if (typeof window === "undefined" || !dueList || dueList.length === 0) return 0;

  const libraryName = BRAND_CONFIG.fullName || "Genius Library";
  const upiId = BRAND_CONFIG.payment?.upiId || "genius.library@upi";
  const savedQueue = loadSavedQueue();
  const newItems: WhatsAppQueueItem[] = [];

  dueList.forEach((due, idx) => {
    const cleanPhone = sanitizeWhatsAppPhone(due.phone);
    if (!cleanPhone || cleanPhone.length < 10) return;

    const studentName = due.studentName || "Student";
    const uniqueRef = `#FEE-DUE-${Date.now().toString(36).toUpperCase()}-${idx + 1}-${Math.floor(100 + Math.random() * 900)}`;

    const messageText =
      `*🏛️ ${libraryName} • Monthly Fee Reminder*\n\n` +
      `Namaste *${studentName}* ji,\n` +
      `Aapki monthly library study seat fee ka baki amount darj hai.\n\n` +
      `💰 *Due Amount:* ₹${due.dueAmount}\n` +
      (due.feeType ? `📋 *Fee Type:* ${due.feeType}\n` : "") +
      (due.dueDate ? `📅 *Due Date:* ${due.dueDate}\n` : "") +
      `💳 *Library UPI ID:* \`${upiId}\`\n` +
      `🔖 *Ref Token:* ${uniqueRef}\n\n` +
      `Kripya samay par fee jama karke front desk par receipt confirm karein taaki aapki reserved study seat nirantar surakshit rahe.\n\n` +
      `_Dhanyawad & Best Wishes for your exams!_`;

    newItems.push({
      id: `wa-bulk-fee-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
      studentId: due.studentId,
      studentName,
      phone: cleanPhone,
      action: "due_fee_reminder",
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
// Queue State Inspection for Admin Console
// ---------------------------------------------------------------------------
export function getWhatsAppQueueStats(): WhatsAppQueueStats {
  if (typeof window === "undefined") {
    return {
      pendingCount: 0,
      sentTodayCount: 0,
      failedCount: 0,
      isProcessing: false,
      messagesSentLast30Mins: 0,
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
  const sentLast30Mins = sentTimestamps.filter((t) => now - t < BOT_CONFIG.WINDOW_30_MINS_MS).length;

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
    messagesSentLast30Mins: sentLast30Mins,
    recentLogs: [...queue, ...history].slice(0, 20),
  };
}

export function clearWhatsAppQueue(): void {
  if (typeof window === "undefined") return;
  inMemoryQueue = [];
  saveQueue([]);
}
