"use client";

/**
 * [WEB • PAGE] Student Chat
 *
 * Live messaging with admin/staff + WhatsApp handoff.
 */
import { useState, useEffect, useRef } from "react";
import { BRAND_CONFIG } from "@/lib/config";
import { 
  MessageSquare, 
  Bell, 
  Send, 
  Sparkles, 
  Clock, 
  User, 
  CheckCheck, 
  Phone, 
  Mail, 
  MapPin, 
  Search,
  Shield,
  ExternalLink,
  ChevronLeft,
  RefreshCw,
  Bold,
  Italic,
  List,
  Users,
  Calendar,
  Info
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { 
  getAnnouncements, 
  getMessages, 
  sendMessage, 
  getStaffMembers, 
  getNotifications,
  getAdminContactInfo,
  MessageRecord, 
  StaffMember,
  NotificationRecord
} from "@/lib/api";

function WhatsAppIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
    </svg>
  );
}

function FormattedMessage({ text }: { text: string }) {
  if (!text) return null;
  const lines = text.split("\n");

  return (
    <div className="whitespace-pre-wrap leading-relaxed">
      {lines.map((line, lIdx) => {
        const boldSplit = line.split(/(\*\*[^*]+\*\*)/g);
        return (
          <span key={lIdx}>
            {boldSplit.map((bChunk, bIdx) => {
              if (bChunk.startsWith("**") && bChunk.endsWith("**") && bChunk.length > 4) {
                return <strong key={bIdx} className="font-bold">{bChunk.slice(2, -2)}</strong>;
              }
              const italicSplit = bChunk.split(/(\*[^*]+\*)/g);
              return italicSplit.map((iChunk, iIdx) => {
                if (iChunk.startsWith("*") && iChunk.endsWith("*") && iChunk.length > 2) {
                  return <em key={iIdx} className="italic">{iChunk.slice(1, -1)}</em>;
                }
                return iChunk;
              });
            })}
            {lIdx < lines.length - 1 && <br />}
          </span>
        );
      })}
    </div>
  );
}

interface ChatContact {
  id: string;
  name: string;
  role: "admin" | "prime_staff" | "sub_staff";
  roleLabel: string;
  shiftInfo: string;
  avatarText: string;
  phone: string;
  description: string;
}

const DEFAULT_CONTACTS: ChatContact[] = [
  {
    id: "admin-desk",
    name: "Library Administration (Chief Admin)",
    role: "admin",
    roleLabel: "Chief Admin",
    shiftInfo: "06:00 AM - 11:00 PM (Daily)",
    avatarText: "AD",
    phone: "+91 9935066685",
    description: "Admissions, Monthly Fees, Verification & Policy Inquiries"
  },
  {
    id: "staff-prime-01",
    name: "Rajesh Sharma (Senior Librarian)",
    role: "prime_staff",
    roleLabel: "Prime Staff",
    shiftInfo: "Morning Shift (06:00 AM - 02:00 PM)",
    avatarText: "RS",
    phone: "+91 9935066685",
    description: "Gate Attendance, Book Circulation & Seat Allocation"
  },
  {
    id: "staff-sub-01",
    name: "Vikas Patel (Library Assistant)",
    role: "sub_staff",
    roleLabel: "Sub Staff",
    shiftInfo: "Evening Shift (02:00 PM - 10:00 PM)",
    avatarText: "VP",
    phone: "+91 9935066685",
    description: "Reading Room Help, Book Finding & Desk Assistance"
  }
];

const QUICK_INQUIRIES = [
  "I forgot to scan out yesterday. Can you please mark my attendance?",
  "Requesting to switch my seat to another cubicle if available.",
  "Issue with reading hall Wi-Fi connection on my desk.",
  "Need payment confirmation and tax receipt for monthly library fee.",
  "Inquiry regarding upcoming mock tests, answer keys or scorecards."
];

export default function StudentMessagesPage() {
  const [mobileTab, setMobileTab] = useState<"chat" | "recipients">("chat");
  const [viewMode, setViewMode] = useState<"chat" | "notices">("chat");

  // Auth User
  const [studentId, setStudentId] = useState("");
  const [studentName, setStudentName] = useState("Student");
  const [studentEmail, setStudentEmail] = useState("");

  // Contacts
  const [contacts, setContacts] = useState<ChatContact[]>(DEFAULT_CONTACTS);
  const [selectedContactId, setSelectedContactId] = useState<string>("admin-desk");

  // Messages
  const [allMessages, setAllMessages] = useState<MessageRecord[]>([]);
  const [newMessageText, setNewMessageText] = useState("");
  const [isSending, setIsSending] = useState(false);

  // Announcements & Notifications
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [personalNotifs, setPersonalNotifs] = useState<NotificationRecord[]>([]);

  const chatScrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const activeContact = contacts.find(c => c.id === selectedContactId) || contacts[0];

  useEffect(() => {
    async function init() {
      let currentUid = "";
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          currentUid = user.id;
          let sName = user.user_metadata?.full_name || user.email?.split("@")[0] || "Student";
          const sEmail = user.email || "";

          // Fetch authentic student profile details from Supabase
          try {
            const { data: prof } = await supabase
              .from("profiles")
              .select("full_name, phone, student_code")
              .eq("id", user.id)
              .maybeSingle();

            if (prof?.full_name) {
              sName = prof.full_name;
            }
          } catch {}

          setStudentId(currentUid);
          setStudentName(sName);
          setStudentEmail(sEmail);
          fetchMessages(currentUid);

          // Ensure student FCM device push notifications are active
          try {
            const { requestFCMToken, syncFCMTokenWithUser } = await import("@/lib/firebase");
            requestFCMToken().then((tok) => {
              if (tok) syncFCMTokenWithUser(tok, "student");
            }).catch(() => {});
          } catch {}
        }
      } catch (err) {
        console.warn("Auth check in student messenger:", err);
      }

      // Load dynamic Admin Helpline from Supabase profiles
      let adminContact = { ...DEFAULT_CONTACTS[0] };
      try {
        const adminInfo = await getAdminContactInfo();
        if (adminInfo.phone) {
          adminContact = {
            ...DEFAULT_CONTACTS[0],
            phone: adminInfo.phone,
            name: `${adminInfo.name} (Chief Admin)`,
          };
        }
      } catch (adminErr) {
        console.warn("Admin contact load notice:", adminErr);
      }

      // Load staff
      try {
        const staffList = await getStaffMembers();
        if (staffList && staffList.length > 0) {
          const mappedStaff: ChatContact[] = staffList.map(s => ({
            id: s.id,
            name: s.name,
            role: s.role === "prime_staff" ? "prime_staff" : "sub_staff",
            roleLabel: s.category || (s.role === "prime_staff" ? "Prime Staff" : "Sub Staff"),
            shiftInfo: s.shiftAssigned || "General Shift",
            avatarText: s.name.slice(0, 2).toUpperCase(),
            phone: s.phone || adminContact.phone,
            description: s.role === "prime_staff" 
              ? "Attendance, Exam Results & Seat Management" 
              : "Desk Inquiries & Hall Assistance"
          }));

          setContacts([adminContact, ...mappedStaff]);
        } else {
          setContacts([adminContact]);
        }
      } catch (e) {
        console.warn("Staff load error:", e);
        setContacts([adminContact]);
      }

      // Load Announcements & Notifications
      try {
        const [d1Announcements, studentNotifs] = await Promise.all([
          getAnnouncements().catch(() => []),
          currentUid ? getNotifications({ role: "student", recipientId: currentUid }).catch(() => []) : Promise.resolve([]),
        ]);
        if (d1Announcements) setAnnouncements(d1Announcements);
        if (studentNotifs) setPersonalNotifs(studentNotifs);
      } catch (e) {
        // quiet
      }
    }

    init();

    // Live update when admin phone changes
    const handleAdminPhoneUpdate = (e: any) => {
      const newPhone = e.detail?.phone;
      if (newPhone) {
        setContacts((prev) =>
          prev.map((c) => (c.role === "admin" ? { ...c, phone: newPhone } : c))
        );
      }
    };
    window.addEventListener("admin_contact_updated", handleAdminPhoneUpdate);
    return () => {
      window.removeEventListener("admin_contact_updated", handleAdminPhoneUpdate);
    };
  }, []);

  const fetchMessages = async (sId?: string) => {
    const targetId = sId || studentId;
    if (!targetId) return;
    try {
      const msgs = await getMessages(targetId);
      if (msgs && Array.isArray(msgs)) {
        setAllMessages(msgs);
      }
    } catch (e) {
      console.warn("Polling notice:", e);
    }
  };

  useEffect(() => {
    if (!studentId) return;

    // 1. Instant cross-tab real-time sync for chat replies
    let channel: BroadcastChannel | null = null;
    try {
      if (typeof window !== "undefined" && typeof BroadcastChannel !== "undefined") {
        channel = new BroadcastChannel("genius_chat_channel");
        channel.onmessage = (event) => {
          if (event.data?.type === "NEW_CHAT_MESSAGE" && event.data?.message) {
            const incoming = event.data.message as MessageRecord;
            if (incoming.studentId === studentId || incoming.recipientId === studentId) {
              setAllMessages(prev => {
                if (prev.some(m => m.id === incoming.id)) return prev;
                return [...prev, incoming];
              });
            }
          }
        };
      }
    } catch {}

    // 2. Periodic polling (Optimized to save API limits)
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        fetchMessages(studentId);
      }
    }, 60000);
    return () => {
      clearInterval(interval);
      if (channel) channel.close();
    };
  }, [studentId]);

  useEffect(() => {
    chatScrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [allMessages, selectedContactId]);

  // Insert formatting
  const insertFormatting = (prefix: string, suffix: string = prefix) => {
    const el = inputRef.current;
    if (!el) {
      setNewMessageText(prev => prev + `${prefix}text${suffix}`);
      return;
    }
    const start = el.selectionStart || 0;
    const end = el.selectionEnd || 0;
    const selected = newMessageText.slice(start, end);
    const replacement = selected ? `${prefix}${selected}${suffix}` : `${prefix}text${suffix}`;
    const next = newMessageText.slice(0, start) + replacement + newMessageText.slice(end);
    setNewMessageText(next);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + prefix.length, start + replacement.length - suffix.length);
    }, 50);
  };

  const handleSendMessage = async (customText?: string) => {
    const text = (customText || newMessageText).trim();
    if (!text || !studentId) return;

    setIsSending(true);
    const optimistic: MessageRecord = {
      id: `msg-opt-${Date.now()}`,
      studentId,
      studentName,
      studentEmail,
      senderRole: "student",
      senderName: studentName,
      message: text,
      recipientRole: activeContact.role === "admin" ? "admin" : "staff",
      recipientName: activeContact.name,
      recipientId: activeContact.id,
      isRead: false,
      createdAt: new Date().toISOString(),
    };

    setAllMessages(prev => [...prev, optimistic]);
    setNewMessageText("");

    try {
      await sendMessage({
        studentId,
        studentName,
        studentEmail,
        senderRole: "student",
        senderName: studentName,
        message: text,
        recipientRole: activeContact.role === "admin" ? "admin" : "staff",
        recipientName: activeContact.name,
        recipientId: activeContact.id,
      });
      await fetchMessages(studentId);
    } catch (err) {
      console.error("Error sending message:", err);
    } finally {
      setIsSending(false);
    }
  };

  // Filter messages for this contact
  const currentMessages = allMessages.filter(m => {
    if (activeContact.role === "admin") {
      return m.recipientRole === "admin" || m.senderRole === "admin" || !m.recipientId || m.recipientId === "admin-desk";
    }
    return m.recipientId === activeContact.id || m.senderName === activeContact.name;
  });

  return (
    <div className="space-y-4 max-w-7xl mx-auto pb-10">
      
      {/* Top Header Card */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-[#0A2E5C] border border-[#E5E7EB] dark:border-zinc-800 p-4 sm:p-5 rounded-3xl shadow-xs">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl bg-[#0A2E5C] text-[#FFC107] flex items-center justify-center shrink-0">
            <MessageSquare className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-black text-[#0A2E5C] dark:text-white leading-tight">
              Student Helpdesk & Messenger
            </h1>
            <p className="text-xs text-zinc-500">
              Select who you want to message on the right side, chat in real-time, or tap WhatsApp for instant direct messaging.
            </p>
          </div>
        </div>

        {/* View Switcher: Chat vs Library Notices */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode("chat")}
            className={`px-3.5 py-2 rounded-xl text-xs font-black transition cursor-pointer flex items-center gap-1.5 ${
              viewMode === "chat"
                ? "bg-[#0A2E5C] text-[#FFC107] shadow-sm dark:bg-zinc-800 dark:text-[#FFC107]"
                : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            }`}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            <span>Chat Desk</span>
          </button>

          <button
            onClick={() => setViewMode("notices")}
            className={`px-3.5 py-2 rounded-xl text-xs font-black transition cursor-pointer flex items-center gap-1.5 ${
              viewMode === "notices"
                ? "bg-[#0A2E5C] text-[#FFC107] shadow-sm dark:bg-zinc-800 dark:text-[#FFC107]"
                : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            }`}
          >
            <Bell className="h-3.5 w-3.5" />
            <span>Notices & Notifications ({announcements.length + personalNotifs.length})</span>
          </button>
        </div>
      </div>

      {viewMode === "chat" ? (
        /* ========================================================= */
        /* TWO-COLUMN LAYOUT:                                        */
        /* LEFT: OPEN CHAT CONSOLE | RIGHT: CHOOSE WHO TO MESSAGE    */
        /* ========================================================= */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          
          {/* ======================================================= */}
          {/* LEFT (Col 8): ACTIVE OPEN CHAT OPTION                   */}
          {/* ======================================================= */}
          <div className={`lg:col-span-8 flex flex-col h-[680px] bg-white dark:bg-[#0A2E5C] rounded-3xl border border-[#E5E7EB] dark:border-zinc-800 overflow-hidden shadow-sm ${
            mobileTab === "recipients" ? "hidden lg:flex" : "flex"
          }`}>
            {/* Upper Side Header with WhatsApp Direct Action */}
            <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3 bg-[#FBFBFA]/80 dark:bg-[#161D2A]/80 backdrop-blur-sm">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  onClick={() => setMobileTab("recipients")}
                  className="lg:hidden p-1.5 rounded-xl text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800 cursor-pointer"
                  title="Choose another person"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>

                <div className={`h-11 w-11 rounded-2xl flex items-center justify-center text-xs font-black shadow-xs shrink-0 ${
                  activeContact.role === "admin"
                    ? "bg-[#0A2E5C] text-[#FFC107]"
                    : "bg-[#0B5ED7] text-white"
                }`}>
                  {activeContact.role === "admin" ? <Shield className="h-5 w-5" /> : activeContact.avatarText}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-black text-[#0A2E5C] dark:text-white truncate">
                      {activeContact.name}
                    </h3>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      activeContact.role === "admin"
                        ? "bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300"
                        : "bg-blue-100 text-blue-900 dark:bg-blue-950/60 dark:text-blue-300"
                    }`}>
                      {activeContact.roleLabel}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-[11px] text-zinc-500 mt-0.5">
                    <span className="text-emerald-600 font-semibold flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
                      Active On Duty
                    </span>
                    <span>•</span>
                    <span className="truncate">{activeContact.shiftInfo}</span>
                  </div>
                </div>
              </div>

              {/* UPPERSIDE: PROMINENT DIRECT WHATSAPP BUTTON */}
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={`https://wa.me/${activeContact.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Hello ${activeContact.name}, I am ${studentName} from ${BRAND_CONFIG.fullName}.`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3.5 py-2 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xs flex items-center gap-2 shadow-sm transition transform hover:scale-[1.02] cursor-pointer"
                  title="Direct Message on WhatsApp"
                >
                  <WhatsAppIcon className="h-4 w-4" />
                  <span className="hidden sm:inline">WhatsApp Direct</span>
                  <ExternalLink className="h-3 w-3 opacity-80" />
                </a>
              </div>
            </div>

            {/* Chat Body Stream */}
            <div className="flex-1 p-4 sm:p-5 overflow-y-auto space-y-3 bg-[#FBFBFA]/60 dark:bg-[#121822]/60">
              <div className="text-center my-1">
                <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-[#0A2E5C]/5 dark:bg-white/5 text-[10px] text-zinc-400">
                  <Shield className="h-3 w-3 text-[#0B5ED7]" /> Official secure record with {activeContact.name}
                </span>
              </div>

              {currentMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center p-8 space-y-3">
                  <div className="h-14 w-14 rounded-3xl bg-[#F8FAFC] dark:bg-zinc-800 flex items-center justify-center text-[#0B5ED7]">
                    <MessageSquare className="h-7 w-7" />
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-[#0A2E5C] dark:text-white">
                      Start your inquiry with {activeContact.name}
                    </h4>
                    <p className="text-xs text-zinc-500 max-w-sm mt-1">
                      Type your message below with bold/italic text, choose a quick inquiry, or message directly on WhatsApp.
                    </p>
                  </div>
                </div>
              ) : (
                [...currentMessages].reverse().map((msg) => {
                  const isStudent = msg.senderRole === "student";
                  const timeStr = msg.createdAt 
                    ? new Date(msg.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
                    : "Just now";

                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${isStudent ? "items-end" : "items-start"}`}
                    >
                      <div className="flex items-center gap-1.5 mb-1 px-1">
                        <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400">
                          {isStudent ? "You (Student)" : `${msg.senderName} (${msg.senderRole === "admin" ? "Chief Admin" : "Staff On Duty"})`}
                        </span>
                        <span className="text-[9px] text-zinc-400">• {timeStr}</span>
                      </div>

                      <div
                        className={`p-3.5 rounded-2xl max-w-[85%] text-xs shadow-xs ${
                          isStudent
                            ? "bg-[#0A2E5C] text-white dark:bg-[#FFC107] dark:text-[#0A2E5C] rounded-tr-xs"
                            : "bg-white dark:bg-[#0A2E5C] text-[#0A2E5C] dark:text-white border border-[#E5E7EB]/80 dark:border-zinc-700 rounded-tl-xs"
                        }`}
                      >
                        <FormattedMessage text={msg.message} />

                        {isStudent && (
                          <div className="flex items-center justify-end gap-1 mt-1 text-[9px] text-zinc-300 dark:text-zinc-700">
                            <span>Sent</span>
                            <CheckCheck className="h-3 w-3 text-emerald-400" />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={chatScrollRef} />
            </div>

            {/* Text Formatting Bar & Quick Inquiry Pills */}
            <div className="px-4 py-2 bg-white dark:bg-[#0A2E5C] border-t border-zinc-200 dark:border-zinc-800 space-y-2">
              {/* Formatting buttons */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => insertFormatting("**")}
                    className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 cursor-pointer"
                    title="Bold"
                  >
                    <Bold className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => insertFormatting("*")}
                    className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 cursor-pointer"
                    title="Italic"
                  >
                    <Italic className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => insertFormatting("\n• ", "")}
                    className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 cursor-pointer"
                    title="Bullet point"
                  >
                    <List className="h-3.5 w-3.5" />
                  </button>
                  <span className="text-[10px] text-zinc-400 ml-1">Supports **bold** & *italic*</span>
                </div>

                <span className="text-[10px] text-zinc-400">
                  Sending to: <strong className="text-[#0B5ED7] dark:text-[#FFC107]">{activeContact.name}</strong>
                </span>
              </div>

              {/* Quick Inquiry Chips */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                <span className="text-[10px] font-bold text-zinc-400 shrink-0 flex items-center gap-1">
                  <Sparkles className="h-3 w-3 text-[#0B5ED7]" /> Quick:
                </span>
                {QUICK_INQUIRIES.map((q, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSendMessage(q)}
                    className="px-3 py-1 rounded-xl bg-[#F8FAFC] hover:bg-[#EBE7DF] dark:bg-zinc-800 dark:hover:bg-zinc-700 text-[10px] font-semibold text-[#0A2E5C] dark:text-zinc-200 transition shrink-0 border border-transparent hover:border-[#E5E7EB] cursor-pointer"
                  >
                    {q.length > 30 ? q.slice(0, 30) + "..." : q}
                  </button>
                ))}
              </div>
            </div>

            {/* Chat Input Bar */}
            <div className="p-3 sm:p-4 bg-white dark:bg-[#0A2E5C] border-t border-zinc-200 dark:border-zinc-800">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMessage();
                }}
                className="flex items-center gap-2 sm:gap-3"
              >
                <textarea
                  ref={inputRef}
                  rows={1}
                  placeholder={`Write your message to ${activeContact.name}... (Press Enter to send)`}
                  value={newMessageText}
                  onChange={(e) => setNewMessageText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  className="flex-1 px-4 py-3 bg-[#F8FAFC] dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-2xl text-xs text-[#0A2E5C] dark:text-white focus:outline-none focus:border-[#FFC107] resize-none"
                />
                <button
                  type="submit"
                  disabled={!newMessageText.trim() || isSending}
                  className="h-11 px-5 rounded-2xl bg-[#0A2E5C] text-[#FFC107] hover:bg-[#141A24] dark:bg-[#FFC107] dark:text-[#0A2E5C] font-black text-xs transition cursor-pointer disabled:opacity-50 flex items-center gap-2 shrink-0 shadow-sm"
                >
                  <Send className="h-4 w-4" />
                  <span className="hidden sm:inline">Send</span>
                </button>
              </form>
            </div>

          </div>

          {/* ======================================================= */}
          {/* RIGHT (Col 4): CHOOSE WHO YOU SEND MESSAGE TO          */}
          {/* ======================================================= */}
          <div className={`lg:col-span-4 flex flex-col h-[680px] bg-white dark:bg-[#0A2E5C] rounded-3xl border border-[#E5E7EB] dark:border-zinc-800 overflow-hidden shadow-sm ${
            mobileTab === "chat" ? "hidden lg:flex" : "flex"
          }`}>
            <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
              <h3 className="text-xs font-black uppercase tracking-wider text-[#0A2E5C] dark:text-white flex items-center gap-2">
                <Users className="h-4 w-4 text-[#0B5ED7]" /> Choose Who to Message
              </h3>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                Select an admin or staff member below to open the chat:
              </p>
            </div>

            {/* Recipient Cards List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
              {contacts.map((contact) => {
                const isSelected = contact.id === selectedContactId;
                const msgsWithContact = allMessages.filter(
                  m => m.recipientId === contact.id || m.senderName === contact.name
                );
                const lastMsg = msgsWithContact[msgsWithContact.length - 1];

                return (
                  <div
                    key={contact.id}
                    onClick={() => {
                      setSelectedContactId(contact.id);
                      setMobileTab("chat");
                    }}
                    className={`p-3.5 rounded-2xl transition cursor-pointer border ${
                      isSelected
                        ? "bg-[#F8FAFC] dark:bg-zinc-800/80 border-[#0B5ED7] dark:border-[#FFC107] shadow-sm ring-1 ring-[#0B5ED7]/20"
                        : "bg-white dark:bg-[#161D2A] border-zinc-200/80 dark:border-zinc-700/80 hover:border-zinc-400"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className={`h-10 w-10 rounded-2xl flex items-center justify-center font-black text-xs shrink-0 ${
                          contact.role === "admin"
                            ? "bg-[#0A2E5C] text-[#FFC107]"
                            : "bg-[#0B5ED7] text-white"
                        }`}>
                          {contact.role === "admin" ? <Shield className="h-5 w-5" /> : contact.avatarText}
                        </div>

                        <div>
                          <p className="text-xs font-black text-[#0A2E5C] dark:text-white">
                            {contact.name}
                          </p>
                          <span className={`text-[9px] font-black px-2 py-0.5 rounded-full inline-block mt-0.5 ${
                            contact.role === "admin"
                              ? "bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300"
                              : "bg-blue-100 text-blue-900 dark:bg-blue-950/60 dark:text-blue-300"
                          }`}>
                            {contact.roleLabel}
                          </span>
                        </div>
                      </div>

                      {/* 1-Click WhatsApp Shortcut on Card */}
                      <a
                        href={`https://wa.me/${contact.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Hello ${contact.name}, I am ${studentName} from ${BRAND_CONFIG.fullName}.`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="p-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 transition shrink-0"
                        title="Open in WhatsApp"
                      >
                        <WhatsAppIcon className="h-3.5 w-3.5" />
                      </a>
                    </div>

                    <p className="text-[10px] text-zinc-500 mt-2 line-clamp-1">
                      {contact.shiftInfo} • {contact.description}
                    </p>

                    {lastMsg && (
                      <p className="text-[10px] font-semibold text-[#0B5ED7] dark:text-[#FFC107] mt-1 truncate">
                        {lastMsg.senderRole === "student" ? "You: " : `${lastMsg.senderName}: `}
                        {lastMsg.message}
                      </p>
                    )}

                    <div className="mt-2.5 flex items-center justify-between text-[10px] font-bold text-zinc-400 pt-1.5 border-t border-zinc-100 dark:border-zinc-800/60">
                      <span>{isSelected ? "● Current Chat Open" : "Tap to open chat"}</span>
                      <span className="text-[#0B5ED7] dark:text-[#FFC107]">
                        {isSelected ? "Active ✓" : "Select →"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bottom Support Information Card */}
            <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-[#FBFBFA] dark:bg-[#161D2A] text-xs space-y-1.5">
              <p className="font-bold text-[#0A2E5C] dark:text-white flex items-center gap-1.5 text-[11px]">
                <Clock className="h-3.5 w-3.5 text-[#0B5ED7]" /> Desk Active Hours
              </p>
              <p className="text-[10px] text-zinc-500">
                Staff and Admin monitor messages daily from 06:00 AM to 11:00 PM. Urgent seat disputes can also be resolved at the front desk.
              </p>
            </div>
          </div>

        </div>
      ) : (
        /* ========================================================= */
        /* LIBRARY NOTICES / ANNOUNCEMENTS & NOTIFICATIONS TAB       */
        /* ========================================================= */
        <div className="space-y-4">
          {/* Personal Direct Alerts & Notifications */}
          {personalNotifs.length > 0 && (
            <div className="space-y-2.5">
              <h4 className="text-xs font-black uppercase text-zinc-500 tracking-wider flex items-center gap-1.5">
                <Bell className="h-3.5 w-3.5 text-blue-500" /> Direct Library Alerts & Reminders
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {personalNotifs.map((notif) => (
                  <div
                    key={notif.id}
                    className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200/80 dark:bg-amber-950/20 dark:border-amber-900/50 shadow-2xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-amber-200/80 text-amber-900 dark:bg-amber-900 dark:text-amber-200">
                        {notif.type || "Alert"}
                      </span>
                      <span className="text-[10px] text-zinc-400">
                        {notif.createdAt ? new Date(notif.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "Recent"}
                      </span>
                    </div>
                    <h5 className="text-xs font-bold text-[#0A2E5C] dark:text-white">{notif.title}</h5>
                    <p className="text-[11px] text-zinc-600 dark:text-zinc-300 leading-relaxed">{notif.message}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Official Campus Announcements */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-black uppercase text-zinc-500 tracking-wider flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-[#0B5ED7]" /> Official Campus Announcements
            </h4>
            {announcements.length === 0 && personalNotifs.length === 0 ? (
              <div className="p-8 text-center bg-white dark:bg-[#0A2E5C] rounded-3xl border border-[#E5E7EB] dark:border-zinc-800 text-xs text-zinc-400">
                No notices or alerts published right now.
              </div>
            ) : (
              announcements.map((ann) => (
                <div
                  key={ann.id}
                  className="p-5 rounded-3xl bg-white dark:bg-[#0A2E5C] border border-[#E5E7EB] dark:border-zinc-800 shadow-xs space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-md ${
                      ann.priority === "urgent" || ann.priority === "high"
                        ? "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300"
                        : "bg-[#F8FAFC] text-[#0B5ED7] dark:bg-zinc-800 dark:text-[#FFC107]"
                    }`}>
                      {ann.priority || "Normal"} Notice
                    </span>
                    <span className="text-[10px] text-zinc-400">
                      {ann.createdAt ? new Date(ann.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "Recent"}
                    </span>
                  </div>
                  <h3 className="text-sm font-black text-[#0A2E5C] dark:text-white">{ann.title}</h3>
                  <div className="text-xs text-zinc-600 dark:text-zinc-300">
                    <FormattedMessage text={ann.message} />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

    </div>
  );
}
