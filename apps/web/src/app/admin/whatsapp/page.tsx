"use client";

/**
 * [WEB • PAGE] WhatsApp Bot Manager & Broadcast Console
 *
 * Streamlined UI for:
 * 1. One-click Launch WhatsApp Bot on Render (for scanning QR / web session)
 * 2. Close Library Broadcast with per-student customized anti-ban messages
 * 3. Due Fee Reminder alerts directly to students
 * 4. Direct custom WhatsApp messages & queue monitor
 *
 * Database: Exclusively Supabase (profiles)
 */
import { useState, useEffect, useId } from "react";
import { 
  Bot, 
  ExternalLink, 
  RefreshCw, 
  Send, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  IndianRupee, 
  AlertOctagon, 
  Users, 
  ShieldCheck, 
  Sparkles, 
  MessageSquare, 
  Smartphone,
  Trash2,
  Calendar,
  Check
} from "lucide-react";
import { BRAND_CONFIG } from "@/lib/config";
import { createClient } from "@/lib/supabase/client";
import { 
  getWhatsAppQueueStats, 
  clearWhatsAppQueue, 
  enqueueCloseLibraryBroadcast,
  enqueueDueFeeReminder,
  enqueueCustomWhatsApp,
  WhatsAppQueueStats,
  BOT_CONFIG,
  sanitizeWhatsAppPhone 
} from "@/lib/whatsappBotQueue";

function WhatsAppIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
    </svg>
  );
}

interface StudentOption {
  id: string;
  name: string;
  phone: string;
  code?: string;
  dueAmount: number;
  feeStatus: string;
  shift: string;
}

const COMMON_CLOSE_REASONS = [
  "Festival Holiday (Diwali / Chhath Puja / Eid)",
  "Sunday Maintenance & Deep Cleaning",
  "Severe Weather & Heavy Rain Alert",
  "Electricity & Power Grid Maintenance",
  "National / State Public Holiday",
];

export default function AdminWhatsAppBotPage() {
  const [activeTab, setActiveTab] = useState<"close_library" | "due_fee" | "custom_msg">("close_library");
  const [toast, setToast] = useState<string | null>(null);

  // Live Bot Status
  const [botStatus, setBotStatus] = useState<{
    isConnected: boolean | null;
    userNumber: string;
    pingMs: number | null;
    isLoading: boolean;
  }>({
    isConnected: null,
    userNumber: "",
    pingMs: null,
    isLoading: true,
  });

  // Queue Monitor Stats
  const [queueStats, setQueueStats] = useState<WhatsAppQueueStats>({
    pendingCount: 0,
    sentTodayCount: 0,
    failedCount: 0,
    isProcessing: false,
    messagesSentLastMinute: 0,
    recentLogs: [],
  });

  // Students list from Supabase
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [isLoadingStudents, setIsLoadingStudents] = useState(false);

  // Form State: Close Library
  const [closeReason, setCloseReason] = useState(COMMON_CLOSE_REASONS[0]);
  const [reopenTime, setReopenTime] = useState("Kal Subah 06:00 AM Se Regular");
  const [closeCustomNote, setCloseCustomNote] = useState("Online study doubts and library app active rahenge.");
  const [isBroadcastingClose, setIsBroadcastingClose] = useState(false);

  // Form State: Due Fee Reminder
  const [selectedFeeStudentId, setSelectedFeeStudentId] = useState("");
  const [isSendingFeeReminder, setIsSendingFeeReminder] = useState(false);

  // Form State: Direct Message
  const [customPhone, setCustomPhone] = useState("");
  const [customStudentName, setCustomStudentName] = useState("");
  const [customMessageText, setCustomMessageText] = useState("");
  const [isSendingCustom, setIsSendingCustom] = useState(false);

  const directPhoneInputId = useId();
  const directNameInputId = useId();
  const directMsgInputId = useId();

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  // 1. Fetch live bot status
  const checkBotStatus = async () => {
    setBotStatus((prev) => ({ ...prev, isLoading: true }));
    const startTime = Date.now();
    try {
      let res = await fetch(`${BRAND_CONFIG.apiUrl}/api/whatsapp/status`, {
        cache: "no-store",
      }).catch(() => null);

      if (!res || !res.ok) {
        res = await fetch(`${BOT_CONFIG.DEFAULT_URL}/status`, {
          cache: "no-store",
        }).catch(() => null);
      }

      const ping = Date.now() - startTime;
      if (res && res.ok) {
        const data = await res.json().catch(() => ({}));
        setBotStatus({
          isConnected: Boolean(data.isConnected),
          userNumber: data.userNumber || "",
          pingMs: ping,
          isLoading: false,
        });
      } else {
        setBotStatus({
          isConnected: false,
          userNumber: "",
          pingMs: ping,
          isLoading: false,
        });
      }
    } catch {
      setBotStatus({
        isConnected: false,
        userNumber: "",
        pingMs: null,
        isLoading: false,
      });
    }
  };

  // 2. Fetch active students from Supabase (Sole Primary Database)
  const fetchStudents = async () => {
    setIsLoadingStudents(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, phone, student_code, due_amount, fee_status, shift, role")
        .eq("role", "student")
        .order("full_name", { ascending: true });

      if (error) {
        console.warn("Supabase students load notice:", error);
      }

      if (data && Array.isArray(data)) {
        const mapped: StudentOption[] = data
          .filter((p: any) => p.phone && String(p.phone).trim().length >= 10)
          .map((p: any) => ({
            id: p.id,
            name: p.full_name || "Student",
            phone: p.phone,
            code: p.student_code,
            dueAmount: Number(p.due_amount || 0),
            feeStatus: p.fee_status || "Due",
            shift: p.shift || "Regular Shift",
          }));
        setStudents(mapped);
        if (mapped.length > 0 && !selectedFeeStudentId) {
          const withDue = mapped.find((s) => s.dueAmount > 0) || mapped[0];
          setSelectedFeeStudentId(withDue.id);
        }
      }
    } catch (err) {
      console.warn("Error fetching students:", err);
    } finally {
      setIsLoadingStudents(false);
    }
  };

  // 3. Refresh Queue
  const refreshQueue = () => {
    setQueueStats(getWhatsAppQueueStats());
  };

  useEffect(() => {
    checkBotStatus();
    fetchStudents();
    refreshQueue();

    const handleQueueUpdate = () => refreshQueue();
    window.addEventListener("whatsapp_queue_updated", handleQueueUpdate);

    const interval = setInterval(() => {
      refreshQueue();
    }, 3000);

    return () => {
      window.removeEventListener("whatsapp_queue_updated", handleQueueUpdate);
      clearInterval(interval);
    };
  }, []);

  // 4. Handle Close Library Broadcast
  const handleBroadcastCloseLibrary = async () => {
    if (students.length === 0) {
      alert("No students with registered phone numbers found in Supabase.");
      return;
    }

    const confirmMsg = `Confirm Library Close Broadcast:\n\n• Target: ${students.length} students\n• Reason: ${closeReason}\n• Reopen: ${reopenTime}\n\nAnti-Ban Protection is ON: Har student ko personalized alag message jayega (15 messages/minute safe rate). Send karein?`;
    if (!window.confirm(confirmMsg)) return;

    setIsBroadcastingClose(true);
    try {
      const studentPayload = students.map((s) => ({
        id: s.id,
        name: s.name,
        phone: s.phone,
      }));

      const enqueuedCount = enqueueCloseLibraryBroadcast({
        reason: closeReason,
        reopenTime,
        customNote: closeCustomNote,
        students: studentPayload,
      });

      refreshQueue();
      showToast(`✓ Broadcast enqueued for ${enqueuedCount} students! Safe rate active.`);
    } catch (err: any) {
      alert("Broadcast error: " + err.message);
    } finally {
      setIsBroadcastingClose(false);
    }
  };

  // 5. Handle Due Fee Reminder
  const handleSendDueFeeReminder = async () => {
    const targetStudent = students.find((s) => s.id === selectedFeeStudentId);
    if (!targetStudent) {
      alert("Please select a student.");
      return;
    }

    setIsSendingFeeReminder(true);
    try {
      const success = enqueueDueFeeReminder({
        studentId: targetStudent.id,
        studentName: targetStudent.name,
        phone: targetStudent.phone,
        dueAmount: targetStudent.dueAmount > 0 ? targetStudent.dueAmount : 600,
        dueDate: "Within 3 days",
      });

      if (success) {
        refreshQueue();
        showToast(`✓ Due fee reminder enqueued for ${targetStudent.name}!`);
      } else {
        alert("Failed to enqueue fee reminder. Please check phone number.");
      }
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setIsSendingFeeReminder(false);
    }
  };

  // 6. Handle Direct Message
  const handleSendCustomMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customPhone.trim() || !customMessageText.trim()) {
      alert("Phone number and message text are required.");
      return;
    }

    setIsSendingCustom(true);
    try {
      const success = enqueueCustomWhatsApp({
        phone: customPhone,
        studentName: customStudentName || "Student",
        message: customMessageText,
      });

      if (success) {
        refreshQueue();
        showToast("✓ Custom WhatsApp message enqueued successfully!");
        setCustomMessageText("");
      } else {
        alert("Invalid phone number. Must be at least 10 digits.");
      }
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setIsSendingCustom(false);
    }
  };

  const selectedFeeStudent = students.find((s) => s.id === selectedFeeStudentId);

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-2xl bg-[#0A2E5C] px-4 py-3 text-xs font-bold text-white shadow-2xl border border-emerald-500/30 animate-fadeIn">
          <Check className="h-4 w-4 text-emerald-400" />
          <span>{toast}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black text-[#0A2E5C] dark:text-white flex items-center gap-2">
            <WhatsAppIcon className="h-7 w-7 text-emerald-600" />
            WhatsApp Bot Command Center
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            One-click Render bot session launch, automated anti-ban library close broadcasts, and fee reminders.
          </p>
        </div>

        {/* Live Bot Status Badge */}
        <div className="flex items-center gap-2">
          <div
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold border ${
              botStatus.isConnected
                ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800"
                : "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800"
            }`}
          >
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                botStatus.isConnected ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
              }`}
            />
            <span>
              {botStatus.isLoading
                ? "Checking..."
                : botStatus.isConnected
                ? `Bot Online (${botStatus.userNumber || "Ready"})`
                : "Bot Disconnected / QR Login Needed"}
            </span>
          </div>

          <button
            onClick={checkBotStatus}
            disabled={botStatus.isLoading}
            title="Refresh Status"
            className="p-2 rounded-xl border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 transition"
          >
            <RefreshCw className={`h-4 w-4 ${botStatus.isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Hero Banner: Single Click Launch WhatsApp Bot on Render */}
      <div className="relative overflow-hidden rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-600 via-teal-700 to-emerald-900 p-6 text-white shadow-lg dark:border-emerald-800/60">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-[11px] font-bold backdrop-blur-md">
              <Sparkles className="h-3.5 w-3.5 text-emerald-200" />
              <span>Dedicated Render WhatsApp Web Controller</span>
            </div>
            <h2 className="text-xl md:text-2xl font-black tracking-tight">
              Launch WhatsApp Bot Session
            </h2>
            <p className="text-xs text-emerald-100 leading-relaxed">
              Agar bot ka WhatsApp logout ho jaye ya naya QR code scan karna ho, to neeche button par click karein.
              Direct Render server dashboard khulega jahan se aap 1-click me QR scan karke session connect kar sakte hain.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
            <a
              href={BOT_CONFIG.DEFAULT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-white text-emerald-900 font-black text-sm shadow-xl hover:bg-emerald-50 active:scale-98 transition group"
            >
              <Bot className="h-5 w-5 text-emerald-600 group-hover:scale-110 transition" />
              <span>Launch WhatsApp Bot (Scan QR / Login)</span>
              <ExternalLink className="h-4 w-4 text-emerald-600" />
            </a>
          </div>
        </div>
      </div>

      {/* Action Modes Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-2">
        <button
          onClick={() => setActiveTab("close_library")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === "close_library"
              ? "bg-rose-500 text-white shadow-xs"
              : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          }`}
        >
          <AlertOctagon className="h-4 w-4" />
          <span>Close Library Broadcast</span>
        </button>

        <button
          onClick={() => setActiveTab("due_fee")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === "due_fee"
              ? "bg-amber-500 text-white shadow-xs"
              : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          }`}
        >
          <IndianRupee className="h-4 w-4" />
          <span>Due Fee Reminder</span>
        </button>

        <button
          onClick={() => setActiveTab("custom_msg")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === "custom_msg"
              ? "bg-[#0A2E5C] text-white dark:bg-zinc-700 shadow-xs"
              : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          }`}
        >
          <MessageSquare className="h-4 w-4" />
          <span>Direct / Custom Message</span>
        </button>
      </div>

      {/* TAB 1: CLOSE LIBRARY BROADCAST */}
      {activeTab === "close_library" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 rounded-3xl border border-rose-200 bg-white p-6 shadow-xs dark:border-rose-900/50 dark:bg-zinc-900 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400">
                  <AlertOctagon className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-zinc-900 dark:text-white">
                    Send Library Closed Alert (All Students)
                  </h3>
                  <p className="text-[11px] text-zinc-500">
                    Broadcast personalized closure notices to all registered students simultaneously.
                  </p>
                </div>
              </div>
              <span className="text-xs font-black px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/50 dark:text-rose-400">
                {students.length} Students Available
              </span>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">
                  Band Rehne Ka Karan (Reason):
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                  {COMMON_CLOSE_REASONS.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setCloseReason(r)}
                      className={`text-left p-2.5 rounded-xl text-xs font-medium border transition ${
                        closeReason === r
                          ? "bg-rose-50 text-rose-800 border-rose-300 font-bold dark:bg-rose-950/40 dark:text-rose-300"
                          : "border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={closeReason}
                  onChange={(e) => setCloseReason(e.target.value)}
                  placeholder="Ya custom karan yahan likhein..."
                  className="w-full p-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-xs text-zinc-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">
                    Kab Khulegi (Expected Reopening):
                  </label>
                  <input
                    type="text"
                    value={reopenTime}
                    onChange={(e) => setReopenTime(e.target.value)}
                    placeholder="e.g. Kal Subah 06:00 AM Se Regular"
                    className="w-full p-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-xs text-zinc-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">
                    Vishesh Note (Optional Instruction):
                  </label>
                  <input
                    type="text"
                    value={closeCustomNote}
                    onChange={(e) => setCloseCustomNote(e.target.value)}
                    placeholder="e.g. Online doubts aur helpline active rahenge"
                    className="w-full p-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-xs text-zinc-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Anti-Ban Guarantee Badge */}
              <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 text-emerald-800 dark:text-emerald-300 text-xs">
                <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-600 mt-0.5" />
                <div className="space-y-0.5">
                  <span className="font-bold">Anti-Ban Guarantee (Har Message Alag Hoga):</span>
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-400 leading-normal">
                    WhatsApp spam detection se bachne ke liye har student ko unke apne naam, randomized greetings,
                    alag IST time aur unique reference token ke sath message bheja jayega. Rate limit 15 msgs/min par surakshit chalegi.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleBroadcastCloseLibrary}
                disabled={isBroadcastingClose || students.length === 0}
                className="w-full py-3.5 px-4 rounded-2xl bg-rose-600 hover:bg-rose-700 active:scale-98 text-white font-black text-xs shadow-md transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <AlertOctagon className="h-4 w-4" />
                <span>
                  {isBroadcastingClose
                    ? "Enqueuing Broadcast..."
                    : `Send Library Closed Alert to All ${students.length} Students`}
                </span>
              </button>
            </div>
          </div>

          {/* Live Message Preview */}
          <div className="rounded-3xl border border-zinc-200 bg-zinc-50/70 p-5 dark:border-zinc-800 dark:bg-zinc-900/60 space-y-3">
            <h4 className="text-xs font-black text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
              <Smartphone className="h-4 w-4 text-emerald-600" />
              <span>Student WhatsApp Preview</span>
            </h4>
            <div className="rounded-2xl bg-white dark:bg-zinc-950 p-4 border border-zinc-200 dark:border-zinc-800 text-xs space-y-2 shadow-xs font-sans">
              <p className="font-bold text-zinc-900 dark:text-white">
                🏛️ {BRAND_CONFIG.fullName} • Zaruri Suchna
              </p>
              <p className="text-zinc-700 dark:text-zinc-300">
                Namaste *Aman Kumar* ji,
              </p>
              <p className="text-zinc-700 dark:text-zinc-300">
                Kripya dhyan dein: Library aaj / aane wale samay ke liye *Band (Closed)* rahegi.
              </p>
              <div className="space-y-1 text-zinc-600 dark:text-zinc-400 text-[11px] pt-1">
                <p>📌 *Karan (Reason):* {closeReason}</p>
                {reopenTime && <p>⏰ *Kab Khulegi:* {reopenTime}</p>}
                {closeCustomNote && <p>📝 *Note:* {closeCustomNote}</p>}
                <p>📅 *Date:* {new Date().toLocaleDateString("en-IN")}</p>
                <p>📞 *Helpdesk:* {BRAND_CONFIG.phone || "+91 8423448899"}</p>
                <p className="text-zinc-400 font-mono">🔖 *Ref Token:* #SDL-OFF-M93K-1-842</p>
              </div>
              <p className="text-zinc-500 italic text-[11px] pt-1">
                📖 Ghar par apni padhai nirantar jari rakhein. Best of luck!
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: DUE FEE REMINDER */}
      {activeTab === "due_fee" && (
        <div className="rounded-3xl border border-amber-200 bg-white p-6 shadow-xs dark:border-amber-900/40 dark:bg-zinc-900 space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400">
                <IndianRupee className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-zinc-900 dark:text-white">
                  Send Due Fee Reminder
                </h3>
                <p className="text-[11px] text-zinc-500">
                  Select a student with pending fee to send a polite automated WhatsApp payment alert.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">
                  Select Student:
                </label>
                <select
                  value={selectedFeeStudentId}
                  onChange={(e) => setSelectedFeeStudentId(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-xs text-zinc-900 dark:text-white"
                >
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.phone}) - {s.dueAmount > 0 ? `Due: ₹${s.dueAmount}` : "General Student"}
                    </option>
                  ))}
                </select>
              </div>

              {selectedFeeStudent && (
                <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/60 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Student Name:</span>
                    <strong className="text-zinc-900 dark:text-white">{selectedFeeStudent.name}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Registered Phone:</span>
                    <strong className="text-zinc-900 dark:text-white">{selectedFeeStudent.phone}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Shift Allotted:</span>
                    <span className="text-zinc-700 dark:text-zinc-300">{selectedFeeStudent.shift}</span>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-zinc-200 dark:border-zinc-700">
                    <span className="text-zinc-500 font-bold">Pending Due Amount:</span>
                    <strong className="text-rose-600 font-black">
                      ₹{selectedFeeStudent.dueAmount > 0 ? selectedFeeStudent.dueAmount : 600}
                    </strong>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={handleSendDueFeeReminder}
                disabled={isSendingFeeReminder || !selectedFeeStudentId}
                className="w-full py-3.5 px-4 rounded-2xl bg-amber-500 hover:bg-amber-600 active:scale-98 text-white font-black text-xs shadow-md transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                <span>
                  {isSendingFeeReminder
                    ? "Enqueuing Reminder..."
                    : `Send Fee Reminder to ${selectedFeeStudent?.name || "Student"}`}
                </span>
              </button>
            </div>

            {/* Preview */}
            <div className="rounded-2xl bg-zinc-50 dark:bg-zinc-950 p-4 border border-zinc-200 dark:border-zinc-800 text-xs space-y-2 font-sans">
              <span className="text-[10px] font-bold uppercase text-zinc-400 block mb-1">Preview</span>
              <p className="font-bold text-zinc-900 dark:text-white">
                🏛️ {BRAND_CONFIG.fullName} • Monthly Fee Reminder
              </p>
              <p className="text-zinc-700 dark:text-zinc-300">
                Namaste *{selectedFeeStudent?.name || "Student"}* ji,
              </p>
              <p className="text-zinc-700 dark:text-zinc-300">
                Aapki monthly library study seat fee ka baki amount darj hai.
              </p>
              <div className="space-y-0.5 text-zinc-600 dark:text-zinc-400 text-[11px] pt-1">
                <p>💰 *Due Amount:* ₹{selectedFeeStudent?.dueAmount || 600}</p>
                <p>📅 *Due Date:* Within 3 days</p>
                <p>💳 *UPI ID:* `{BRAND_CONFIG.payment?.upiId || "genius.library@upi"}`</p>
                <p className="text-zinc-400 font-mono">🔖 *Ref Token:* #FEE-DUE-X7B2-911</p>
              </div>
              <p className="text-zinc-500 text-[11px] pt-1">
                Kripya samay par fee jama karke front desk par receipt confirm karein taaki study seat surakshit rahe.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: DIRECT CUSTOM MESSAGE */}
      {activeTab === "custom_msg" && (
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-zinc-900 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-zinc-100 dark:border-zinc-800">
            <div className="p-2 rounded-xl bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
              <MessageSquare className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-zinc-900 dark:text-white">
                Direct Student WhatsApp Message
              </h3>
              <p className="text-[11px] text-zinc-500">
                Send any instant custom notification to a specific student or mobile number.
              </p>
            </div>
          </div>

          <form onSubmit={handleSendCustomMessage} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor={directPhoneInputId} className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                  Recipient Mobile Number:
                </label>
                <input
                  id={directPhoneInputId}
                  type="text"
                  value={customPhone}
                  onChange={(e) => setCustomPhone(e.target.value)}
                  placeholder={`e.g. ${BRAND_CONFIG.rawPhone || "8423448899"} ya ${BRAND_CONFIG.phone || "+91 8423448899"}`}
                  className="w-full p-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-xs text-zinc-900 dark:text-white"
                />
              </div>

              <div>
                <label htmlFor={directNameInputId} className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                  Student Name (Optional):
                </label>
                <input
                  id={directNameInputId}
                  type="text"
                  value={customStudentName}
                  onChange={(e) => setCustomStudentName(e.target.value)}
                  placeholder="e.g. Rahul Sharma"
                  className="w-full p-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-xs text-zinc-900 dark:text-white"
                />
              </div>
            </div>

            <div>
              <label htmlFor={directMsgInputId} className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                Message Text:
              </label>
              <textarea
                id={directMsgInputId}
                rows={4}
                value={customMessageText}
                onChange={(e) => setCustomMessageText(e.target.value)}
                placeholder="Yahan apna sandesh likhein..."
                className="w-full p-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-xs text-zinc-900 dark:text-white"
              />
            </div>

            <button
              type="submit"
              disabled={isSendingCustom}
              className="py-3 px-6 rounded-2xl bg-[#0A2E5C] hover:bg-black text-white font-black text-xs transition flex items-center gap-2 active:scale-98 disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              <span>{isSendingCustom ? "Sending..." : "Enqueue & Send WhatsApp Message"}</span>
            </button>
          </form>
        </div>
      )}

      {/* Queue Status & Live Delivery Log */}
      <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-zinc-900 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-zinc-100 dark:border-zinc-800">
          <div>
            <h3 className="text-sm font-black text-zinc-900 dark:text-white flex items-center gap-2">
              <Clock className="h-4 w-4 text-emerald-600" />
              <span>Live Delivery Queue & Anti-Ban Rate Limiter</span>
            </h3>
            <p className="text-[11px] text-zinc-500">
              Messages are throttled at a strict maximum of 15 per minute to prevent WhatsApp account restrictions.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                clearWhatsAppQueue();
                refreshQueue();
                showToast("Queue cleared!");
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 text-[11px] font-bold dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 transition"
            >
              <Trash2 className="h-3.5 w-3.5 text-rose-500" />
              <span>Clear Queue</span>
            </button>
          </div>
        </div>

        {/* 3 Stats Chips */}
        <div className="grid grid-cols-3 gap-3">
          <div className="p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/80 dark:border-zinc-700/60 text-center">
            <span className="text-[10px] uppercase font-bold text-zinc-500 block">Pending</span>
            <strong className="text-lg font-black text-amber-600">{queueStats.pendingCount}</strong>
          </div>

          <div className="p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/80 dark:border-zinc-700/60 text-center">
            <span className="text-[10px] uppercase font-bold text-zinc-500 block">Sent Today</span>
            <strong className="text-lg font-black text-emerald-600">{queueStats.sentTodayCount}</strong>
          </div>

          <div className="p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/80 dark:border-zinc-700/60 text-center">
            <span className="text-[10px] uppercase font-bold text-zinc-500 block">Safe Rate Limit</span>
            <strong className="text-lg font-black text-indigo-600">15 / Min</strong>
          </div>
        </div>

        {/* Recent Delivery Logs */}
        {queueStats.recentLogs.length > 0 ? (
          <div className="space-y-2 pt-2">
            <span className="text-[11px] font-bold text-zinc-500 block">Recent Dispatched Alerts:</span>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {queueStats.recentLogs.slice(0, 10).map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 text-xs border border-zinc-200/60 dark:border-zinc-700/40"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        log.status === "sent"
                          ? "bg-emerald-500"
                          : log.status === "failed"
                          ? "bg-rose-500"
                          : "bg-amber-500 animate-pulse"
                      }`}
                    />
                    <span className="font-bold text-zinc-900 dark:text-white">{log.studentName}</span>
                    <span className="text-zinc-500 font-mono text-[11px]">({log.phone})</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                        log.status === "sent"
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                          : log.status === "failed"
                          ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                          : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                      }`}
                    >
                      {log.status}
                    </span>
                    <span className="text-[10px] text-zinc-400">
                      {new Date(log.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-xs text-zinc-400 text-center py-4">No recent messages in log.</p>
        )}
      </div>
    </div>
  );
}
