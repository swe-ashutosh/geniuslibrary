"use client";

/**
 * [WEB • PAGE] Messages Inbox
 *
 * 2-way live chat with students/staff (Supabase messages tables).
 */
import { useState, useRef, useEffect } from "react";
import { 
  MessageSquare, 
  Users, 
  Send, 
  Clock, 
  User, 
  Search, 
  ChevronDown, 
  Bell,
  CheckCircle2,
  Sparkles,
  ExternalLink,
  ChevronLeft,
  Bold,
  Italic,
  List,
  RefreshCw,
  CheckCheck,
  Phone,
  Mail,
  Shield,
  Radio,
  AlertTriangle,
  Sun,
  Sunset,
  Moon,
  CreditCard,
  Armchair
} from "lucide-react";
import { 
  getAnnouncements, 
  createAnnouncement, 
  getStudents, 
  getShifts, 
  getMessages, 
  sendMessage, 
  markMessagesAsRead, 
  createNotification,
  MessageRecord, 
  Student, 
  Shift, 
  Announcement 
} from "@/lib/api";
import { createClient } from "@/lib/supabase/client";
import { isMasterAdminEmail } from "@/lib/config";

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

interface BroadcastGroup {
  id: string;
  name: string;
  subtitle: string;
  icon: any;
  targetAudience: string;
  colorClass: string;
}

const BROADCAST_GROUPS: BroadcastGroup[] = [
  {
    id: "group-all",
    name: "All Registered Students",
    subtitle: "Library-wide broadcast to all members",
    icon: Users,
    targetAudience: "All Active Students",
    colorClass: "bg-blue-600 text-white",
  },
  {
    id: "group-morning",
    name: "Morning Shift Students",
    subtitle: "06:00 AM - 12:00 PM slot members",
    icon: Sun,
    targetAudience: "Morning Shift Students",
    colorClass: "bg-amber-600 text-white",
  },
  {
    id: "group-afternoon",
    name: "Afternoon Shift Students",
    subtitle: "12:00 PM - 06:00 PM slot members",
    icon: Sunset,
    targetAudience: "Afternoon Shift Students",
    colorClass: "bg-orange-600 text-white",
  },
  {
    id: "group-evening",
    name: "Evening Shift Students",
    subtitle: "06:00 PM - 10:00 PM slot members",
    icon: Moon,
    targetAudience: "Evening Shift Students",
    colorClass: "bg-indigo-600 text-white",
  },
  {
    id: "group-dues",
    name: "Students with Due Fees",
    subtitle: "Members with unpaid monthly library fee",
    icon: CreditCard,
    targetAudience: "Students with Due Fees",
    colorClass: "bg-rose-600 text-white",
  },
  {
    id: "group-unassigned",
    name: "Unassigned Desk Students",
    subtitle: "Students pending permanent seat allocation",
    icon: Armchair,
    targetAudience: "Unassigned Desk Students",
    colorClass: "bg-purple-600 text-white",
  },
];

const QUICK_REPLIES = [
  "**Attendance Confirmed**: Your gate entry has been updated in central records.",
  "**Payment Received**: Monthly library fee verified. Pass active.",
  "**Seat Confirmed**: Please check your allotted desk at the entrance board.",
  "**Front Desk Visit**: Please meet the reception desk for document verification.",
  "**Wi-Fi Restarted**: 2nd floor network router has been refreshed.",
];

export default function CommunicationsPortalPage() {
  const [leftTab, setLeftTab] = useState<"students" | "groups" | "unread">("students");
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileView, setMobileView] = useState<"list" | "chat">("chat");

  // Selection: either a student or a broadcast group
  const [selectedType, setSelectedType] = useState<"student" | "group">("student");
  const [activeStudentId, setActiveStudentId] = useState<string>("");
  const [activeGroupId, setActiveGroupId] = useState<string>("group-all");

  // Data
  const [students, setStudents] = useState<Student[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [allChatMessages, setAllChatMessages] = useState<MessageRecord[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  // Input states
  const [replyText, setReplyText] = useState("");
  const [isReplying, setIsReplying] = useState(false);
  const [replySenderTitle, setReplySenderTitle] = useState<string>("Library Administration");
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Group broadcast form states
  const [broadcastTitle, setBroadcastTitle] = useState("");
  const [broadcastBody, setBroadcastBody] = useState("");
  const [broadcastPriority, setBroadcastPriority] = useState<"normal" | "high" | "urgent">("normal");
  const [isBroadcasting, setIsBroadcasting] = useState(false);

  const chatBottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const loadData = async () => {
    try {
      const [annData, stdData, shiftData, msgData] = await Promise.all([
        getAnnouncements().catch(() => []),
        getStudents().catch(() => []),
        getShifts().catch(() => []),
        getMessages().catch(() => []),
      ]);

      // Combine D1 students with Supabase profiles to ensure 100% of students appear
      let combinedStudents: Student[] = [...(stdData || [])];
      try {
        const supabase = createClient();
        const { data: profiles, error: pErr } = await supabase
          .from("profiles")
          .select("*")
          .order("created_at", { ascending: false });

        if (profiles && profiles.length > 0) {
          const map = new Map<string, Student>();
          // Index existing students by id and email
          combinedStudents.forEach(s => {
            if (s.id) map.set(s.id, s);
            if (s.email) map.set(s.email.trim().toLowerCase(), s);
          });

          profiles.forEach((p: any) => {
            if (isMasterAdminEmail(p.email) || p.role === "admin") return;
            const emailKey = p.email ? p.email.trim().toLowerCase() : "";
            const idKey = p.id || "";
            const existing = (idKey && map.get(idKey)) || (emailKey && map.get(emailKey));

            if (!existing) {
              const newStd: Student = {
                id: p.id,
                studentCode: p.member_id || p.student_code || `SDL-2026-${String(p.id).slice(-4).toUpperCase()}`,
                fullName: p.full_name || p.fullName || "Student Member",
                email: p.email || "",
                phone: p.phone || "",
                course: p.course || "General",
                shift: p.shift || "Morning Shift",
                status: p.status || "active",
                membershipPlan: p.membership_plan || "General",
                seatNumber: p.seat_number || undefined,
                createdAt: p.created_at || new Date().toISOString(),
              };
              if (idKey) map.set(idKey, newStd);
              if (emailKey) map.set(emailKey, newStd);
            } else {
              const updated: Student = {
                ...existing,
                fullName: p.full_name || existing.fullName || "Student Member",
                phone: p.phone || existing.phone,
                shift: p.shift || existing.shift,
                seatNumber: p.seat_number || existing.seatNumber,
              };
              if (idKey) map.set(idKey, updated);
              if (emailKey) map.set(emailKey, updated);
            }
          });
          // Unique by id
          const uniqueById = new Map<string, Student>();
          Array.from(map.values()).forEach(s => {
            if (s?.id) uniqueById.set(s.id, s);
          });
          combinedStudents = Array.from(uniqueById.values());
        }
      } catch (err) {
        console.warn("Supabase profiles in messages portal note:", err);
      }

      // Also ensure any student who sent a chat message appears in the conversation list
      const studentMap = new Map<string, Student>();
      combinedStudents.forEach(s => studentMap.set(s.id, s));
      (msgData || []).forEach(m => {
        if (m.studentId && !studentMap.has(m.studentId)) {
          studentMap.set(m.studentId, {
            id: m.studentId,
            studentCode: `SDL-${m.studentId.slice(-4).toUpperCase()}`,
            fullName: m.studentName || "Student Member",
            email: m.studentEmail || "",
            phone: "",
            course: "General",
            shift: "General",
            status: "active",
            membershipPlan: "General",
            createdAt: m.createdAt,
          });
        }
      });
      combinedStudents = Array.from(studentMap.values());

      setStudents(combinedStudents);
      setShifts(shiftData || []);
      setAllChatMessages(msgData || []);
      setAnnouncements(annData || []);

      if (combinedStudents.length > 0 && !activeStudentId) {
        setActiveStudentId(combinedStudents[0].id);
      }
    } catch (e) {
      console.error("Error loading communications:", e);
    }
  };

  useEffect(() => {
    loadData();

    // Ensure Admin device is registered for FCM native push popups
    try {
      import("@/lib/firebase").then(({ requestFCMToken, syncFCMTokenWithUser }) => {
        requestFCMToken().then((token) => {
          if (token) syncFCMTokenWithUser(token, "admin");
        }).catch(() => {});
      });
    } catch {}

    // 1. Instant cross-tab real-time sync for chat messages
    let channel: BroadcastChannel | null = null;
    try {
      if (typeof window !== "undefined" && typeof BroadcastChannel !== "undefined") {
        channel = new BroadcastChannel("genius_chat_channel");
        channel.onmessage = (event) => {
          if (event.data?.type === "NEW_CHAT_MESSAGE" && event.data?.message) {
            const incoming = event.data.message as MessageRecord;
            setAllChatMessages(prev => {
              if (prev.some(m => m.id === incoming.id)) return prev;
              return [...prev, incoming];
            });
          }
        };
      }
    } catch {}

    // 2. Periodic sync
    const interval = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const msgs = await getMessages();
        if (msgs && Array.isArray(msgs)) {
          setAllChatMessages(msgs);
        }
      } catch (err) {}
    }, 60000);

    return () => {
      clearInterval(interval);
      if (channel) channel.close();
    };
  }, []);

  const handleSelectStudent = async (sId: string) => {
    setSelectedType("student");
    setActiveStudentId(sId);
    setMobileView("chat");
    try {
      await markMessagesAsRead(sId);
      setAllChatMessages(prev =>
        prev.map(m => (m.studentId === sId && m.senderRole === "student" ? { ...m, isRead: true } : m))
      );
    } catch (e) {
      console.error("Failed to mark messages as read:", e);
    }
  };

  const handleSelectGroup = (gId: string) => {
    setSelectedType("group");
    setActiveGroupId(gId);
    setMobileView("chat");
  };

  // Text formatting tool
  const insertFormatting = (prefix: string, suffix: string = prefix) => {
    const el = inputRef.current;
    if (!el) {
      setReplyText(prev => prev + `${prefix}text${suffix}`);
      return;
    }
    const start = el.selectionStart || 0;
    const end = el.selectionEnd || 0;
    const selected = replyText.slice(start, end);
    const replacement = selected ? `${prefix}${selected}${suffix}` : `${prefix}text${suffix}`;
    const next = replyText.slice(0, start) + replacement + replyText.slice(end);
    setReplyText(next);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + prefix.length, start + replacement.length - suffix.length);
    }, 50);
  };

  // Send Direct Message to Student
  const handleSendReply = async () => {
    if (!activeStudentId || !replyText.trim() || isReplying) return;
    const targetStudent = students.find(s => s.id === activeStudentId);
    const sName = targetStudent?.fullName || "Student Member";
    const sEmail = targetStudent?.email || "";
    const msgContent = replyText.trim();

    setIsReplying(true);
    try {
      const res = await sendMessage({
        studentId: activeStudentId,
        studentName: sName,
        studentEmail: sEmail,
        senderRole: "admin",
        senderName: replySenderTitle || "Library Administration",
        recipientRole: "student",
        recipientId: activeStudentId,
        recipientName: sName,
        message: msgContent,
      });

      if (res.success && res.message) {
        setAllChatMessages(prev => [...prev, res.message!]);
      } else {
        const refreshed = await getMessages();
        if (refreshed) setAllChatMessages(refreshed);
      }
      setReplyText("");
      setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);

      // Trigger real-time in-app notification & push for the student
      createNotification({
        recipientRole: "student",
        recipientId: activeStudentId,
        title: `💬 Reply from ${replySenderTitle || "Library Administration"}`,
        message: msgContent.slice(0, 100),
        type: "message",
        actionUrl: "/student/messages",
      }).catch(() => {});
    } catch (err: any) {
      alert("Error sending reply: " + (err?.message || "Check network"));
    } finally {
      setIsReplying(false);
    }
  };

  // Send Broadcast Message to Group
  const handleSendBroadcast = async () => {
    if (!broadcastTitle.trim() || !broadcastBody.trim() || isBroadcasting) {
      alert("Please enter both a title and message content for the broadcast.");
      return;
    }
    const group = BROADCAST_GROUPS.find(g => g.id === activeGroupId) || BROADCAST_GROUPS[0];

    setIsBroadcasting(true);
    try {
      await createAnnouncement({
        title: broadcastTitle.trim(),
        message: broadcastBody.trim(),
        priority: broadcastPriority,
        targetAudience: group.targetAudience,
      });

      setBroadcastTitle("");
      setBroadcastBody("");
      setToastMsg(`✓ Broadcast successfully sent to "${group.name}"!`);
      setTimeout(() => setToastMsg(null), 4000);
      await loadData();
    } catch (err: any) {
      alert("Error sending broadcast: " + err.message);
    } finally {
      setIsBroadcasting(false);
    }
  };

  // Student conversations mapping
  const studentConversations = students.map((std) => {
    const studentMsgs = allChatMessages.filter(m => m.studentId === std.id);
    const lastMsg = studentMsgs[studentMsgs.length - 1];
    const unreadCount = studentMsgs.filter(m => m.senderRole === "student" && !m.isRead).length;
    return {
      student: std,
      lastMsg,
      unreadCount,
      lastTimestamp: lastMsg ? new Date(lastMsg.createdAt).getTime() : 0,
    };
  }).sort((a, b) => {
    if (a.unreadCount !== b.unreadCount) return b.unreadCount - a.unreadCount;
    return b.lastTimestamp - a.lastTimestamp;
  });

  const filteredStudents = studentConversations.filter(c => {
    if (leftTab === "unread" && c.unreadCount === 0) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase().trim();
    const name = (c.student.fullName || (c.student as any).full_name || "").toLowerCase();
    const phone = (c.student.phone || "").toLowerCase();
    const code = (c.student.studentCode || (c.student as any).member_id || "").toLowerCase();
    const email = (c.student.email || "").toLowerCase();
    return name.includes(q) || phone.includes(q) || code.includes(q) || email.includes(q);
  });

  const totalUnread = allChatMessages.filter(m => m.senderRole === "student" && !m.isRead).length;

  const currentStudent = students.find(s => s.id === activeStudentId) || students[0];
  const currentStudentMsgs = allChatMessages.filter(m => m.studentId === (currentStudent?.id || activeStudentId));
  const currentGroup = BROADCAST_GROUPS.find(g => g.id === activeGroupId) || BROADCAST_GROUPS[0];
  const groupAnnouncements = announcements.filter(a => 
    !a.targetAudience || 
    a.targetAudience === "all" || 
    a.targetAudience === currentGroup.targetAudience ||
    currentGroup.id === "group-all"
  );

  return (
    <div className="space-y-4 max-w-7xl mx-auto pb-10">
      
      {/* Compact Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-[#0A2E5C] border border-[#E5E7EB] dark:border-zinc-800 p-4 rounded-3xl shadow-xs">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-[#0A2E5C] text-[#FFC107] flex items-center justify-center shrink-0">
            <MessageSquare className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-black text-[#0A2E5C] dark:text-white leading-tight">
              Library Communications & Messenger
            </h1>
            <p className="text-xs text-zinc-500">
              Direct student chat & instant WhatsApp direct messaging with library-wide broadcast channels.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs font-bold">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" /> Live Sync Active
          </span>
          <button
            onClick={loadData}
            className="p-2 rounded-xl border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 cursor-pointer"
            title="Refresh records"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Toast Feedback */}
      {toastMsg && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-300 text-emerald-900 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-200 text-xs font-bold flex items-center justify-between shadow-xs animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span>{toastMsg}</span>
          </div>
          <button onClick={() => setToastMsg(null)} className="hover:opacity-75 cursor-pointer">✕</button>
        </div>
      )}

      {/* Main Unified Messenger Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 rounded-3xl border border-[#E5E7EB] dark:border-zinc-800 bg-white dark:bg-[#0A2E5C] overflow-hidden shadow-sm min-h-[660px]">
        
        {/* ========================================================= */}
        {/* LEFT COLUMN: STUDENTS LIST & BROADCAST GROUPS FILTER     */}
        {/* ========================================================= */}
        <div className={`lg:col-span-4 border-b lg:border-b-0 lg:border-r border-zinc-200 dark:border-zinc-800 flex flex-col bg-[#FBFBFA] dark:bg-[#161D2A] max-h-[720px] ${
          mobileView === "chat" ? "hidden lg:flex" : "flex"
        }`}>
          {/* Left Panel Tabs */}
          <div className="p-3.5 border-b border-zinc-200 dark:border-zinc-800 space-y-2.5">
            <div className="flex items-center gap-1.5 bg-zinc-200/70 dark:bg-zinc-800/70 p-1 rounded-2xl">
              <button
                onClick={() => setLeftTab("students")}
                className={`flex-1 py-1.5 rounded-xl text-xs font-black transition cursor-pointer flex items-center justify-center gap-1.5 ${
                  leftTab === "students"
                    ? "bg-white dark:bg-[#0A2E5C] text-[#0A2E5C] dark:text-[#FFC107] shadow-xs"
                    : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900"
                }`}
              >
                <User className="h-3.5 w-3.5" />
                <span>Students</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-zinc-100 dark:bg-zinc-800 font-bold">
                  {students.length}
                </span>
              </button>

              <button
                onClick={() => setLeftTab("groups")}
                className={`flex-1 py-1.5 rounded-xl text-xs font-black transition cursor-pointer flex items-center justify-center gap-1.5 ${
                  leftTab === "groups"
                    ? "bg-white dark:bg-[#0A2E5C] text-[#0A2E5C] dark:text-[#FFC107] shadow-xs"
                    : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900"
                }`}
              >
                <Radio className="h-3.5 w-3.5" />
                <span>Broadcasts</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-zinc-100 dark:bg-zinc-800 font-bold">
                  {BROADCAST_GROUPS.length}
                </span>
              </button>

              <button
                onClick={() => setLeftTab("unread")}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-black transition cursor-pointer flex items-center gap-1 ${
                  leftTab === "unread"
                    ? "bg-rose-500 text-white shadow-xs"
                    : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900"
                }`}
                title="Unread Messages"
              >
                <span>Unread</span>
                {totalUnread > 0 && (
                  <span className="h-4 min-w-[16px] px-1 rounded-full bg-rose-600 text-white text-[9px] font-black flex items-center justify-center">
                    {totalUnread}
                  </span>
                )}
              </button>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="h-3.5 w-3.5 text-zinc-400 absolute left-3 top-1/2 -trangray-y-1/2" />
              <input
                type="text"
                placeholder={leftTab === "groups" ? "Filter broadcast groups..." : "Search student by name, roll, phone..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs bg-white dark:bg-[#0A2E5C] border border-zinc-200 dark:border-zinc-700 rounded-xl focus:outline-none focus:border-[#FFC107] text-[#0A2E5C] dark:text-white"
              />
            </div>
          </div>

          {/* Left Column Content Stream */}
          <div className="flex-1 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800/60">
            {/* View A: Broadcast Groups */}
            {leftTab === "groups" ? (
              <div className="p-2 space-y-1.5">
                {BROADCAST_GROUPS.filter(g => !searchQuery || g.name.toLowerCase().includes(searchQuery.toLowerCase())).map((group) => {
                  const isSelected = selectedType === "group" && activeGroupId === group.id;
                  const Icon = group.icon;
                  const count = group.id === "group-all" ? students.length :
                                group.id === "group-morning" ? students.filter(s => s.shift?.includes("Morning")).length :
                                group.id === "group-dues" ? students.filter(s => s.feeStatus === "Due" || (s.dueAmount && s.dueAmount > 0)).length :
                                group.id === "group-unassigned" ? students.filter(s => !s.seatNumber).length : 24;

                  return (
                    <button
                      key={group.id}
                      onClick={() => handleSelectGroup(group.id)}
                      className={`w-full text-left p-3 rounded-2xl transition flex items-center gap-3 cursor-pointer ${
                        isSelected
                          ? "bg-white dark:bg-[#0A2E5C] border-2 border-[#FFC107] shadow-sm"
                          : "hover:bg-white/70 dark:hover:bg-zinc-800/40 border border-transparent"
                      }`}
                    >
                      <div className={`h-10 w-10 rounded-2xl flex items-center justify-center shrink-0 shadow-xs ${group.colorClass}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-black text-[#0A2E5C] dark:text-white truncate">{group.name}</p>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-200/80 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                            {count} Students
                          </span>
                        </div>
                        <p className="text-[10px] text-zinc-500 truncate mt-0.5">{group.subtitle}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              /* View B: Students 1-on-1 Chats */
              filteredStudents.map((item) => {
                const isSelected = selectedType === "student" && item.student.id === activeStudentId;
                const displayName = item.student.fullName || (item.student as any).full_name || "Student Member";
                const initials = displayName
                  .split(" ")
                  .filter(Boolean)
                  .map((n: string) => n[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase() || "ST";

                return (
                  <button
                    key={item.student.id}
                    onClick={() => handleSelectStudent(item.student.id)}
                    className={`w-full text-left p-3.5 transition flex items-start gap-3 cursor-pointer ${
                      isSelected
                        ? "bg-white dark:bg-[#0A2E5C] border-l-4 border-l-[#FFC107] shadow-xs"
                        : "hover:bg-white/60 dark:hover:bg-zinc-800/50"
                    }`}
                  >
                    <div className="relative shrink-0">
                      <div className="h-10 w-10 rounded-2xl bg-[#0A2E5C] text-[#FFC107] font-bold flex items-center justify-center text-xs shadow-xs">
                        {initials}
                      </div>
                      {item.unreadCount > 0 && (
                        <span className="absolute -top-1 -right-1 h-4 min-w-[16px] px-1 bg-rose-500 text-white rounded-full text-[9px] font-black flex items-center justify-center border-2 border-white dark:border-[#0A2E5C]">
                          {item.unreadCount}
                        </span>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <p className="text-xs font-black text-[#0A2E5C] dark:text-white truncate">
                          {displayName}
                        </p>
                        {item.lastMsg && (
                          <span className="text-[10px] text-zinc-400 shrink-0">
                            {new Date(item.lastMsg.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-zinc-500">
                        <span className="font-semibold text-[#0B5ED7]">
                          {item.student.seatNumber || "Seat Assigned"}
                        </span>
                        <span>•</span>
                        <span className="truncate">{item.student.shift || "Morning Shift"}</span>
                      </div>

                      <p className={`text-[11px] mt-1 truncate ${
                        item.unreadCount > 0 ? "font-bold text-[#0A2E5C] dark:text-zinc-100" : "text-zinc-500 dark:text-zinc-400"
                      }`}>
                        {item.lastMsg ? (
                          <span>
                            {item.lastMsg.senderRole === "student" ? "Student: " : `${item.lastMsg.senderName || "Admin"}: `}
                            {item.lastMsg.message}
                          </span>
                        ) : (
                          <span className="italic text-zinc-400 text-[10px]">No messages yet</span>
                        )}
                      </p>
                    </div>
                  </button>
                );
              })
            )}

            {leftTab !== "groups" && filteredStudents.length === 0 && (
              <div className="p-8 text-center text-zinc-400 text-xs">
                No students found matching your criteria.
              </div>
            )}
          </div>
        </div>

        {/* ========================================================= */}
        {/* RIGHT COLUMN: CHAT WINDOW OR BROADCAST CONSOLE            */}
        {/* ========================================================= */}
        <div className={`lg:col-span-8 flex flex-col h-[720px] bg-white dark:bg-[#0A2E5C] ${
          mobileView === "list" ? "hidden lg:flex" : "flex"
        }`}>
          
          {/* ======================================================= */}
          {/* SCENARIO 1: INDIVIDUAL STUDENT 1-ON-1 CHAT              */}
          {/* ======================================================= */}
          {selectedType === "student" && currentStudent ? (
            <>
              {/* Upper Side Header with WhatsApp Direct Action */}
              <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3 bg-[#FBFBFA]/80 dark:bg-[#161D2A]/80 backdrop-blur-sm">
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    onClick={() => setMobileView("list")}
                    className="lg:hidden p-1.5 rounded-xl text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800 cursor-pointer"
                    title="Back to students list"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>

                  <div className="h-11 w-11 rounded-2xl bg-[#0A2E5C] text-[#FFC107] font-black flex items-center justify-center text-sm shadow-xs shrink-0">
                    {currentStudent.fullName.slice(0, 2).toUpperCase()}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-black text-[#0A2E5C] dark:text-white truncate">
                        {currentStudent.fullName}
                      </h3>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> Active Student
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-500 mt-0.5">
                      <span className="font-semibold text-[#0B5ED7]">{currentStudent.seatNumber || "Seat Unassigned"}</span>
                      <span>•</span>
                      <span>{currentStudent.shift || "Morning Shift"}</span>
                      {currentStudent.phone && (
                        <>
                          <span>•</span>
                          <span className="font-mono">{currentStudent.phone}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Upper Side: Prominent WhatsApp Direct Button */}
                <div className="flex items-center gap-2 shrink-0">
                  {currentStudent.phone ? (
                    <a
                      href={`https://wa.me/${currentStudent.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Hello ${currentStudent.fullName}, this is Genius Library Administration regarding your seat and library account.`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3.5 py-2 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xs flex items-center gap-2 shadow-sm transition transform hover:scale-[1.02] cursor-pointer"
                      title="Send Direct Message on WhatsApp"
                    >
                      <WhatsAppIcon className="h-4 w-4" />
                      <span className="hidden sm:inline">WhatsApp Direct</span>
                      <ExternalLink className="h-3 w-3 opacity-80" />
                    </a>
                  ) : (
                    <span className="text-[10px] text-zinc-400 italic">No phone registered</span>
                  )}
                </div>
              </div>

              {/* Message Bubble Thread with Formatted Text */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3.5 bg-[#FBFBFA]/60 dark:bg-[#121822]/60">
                {currentStudentMsgs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center p-8 space-y-3">
                    <div className="h-14 w-14 rounded-3xl bg-[#F8FAFC] dark:bg-zinc-800 flex items-center justify-center text-[#0B5ED7]">
                      <MessageSquare className="h-7 w-7" />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-[#0A2E5C] dark:text-white">
                        No previous messages with {currentStudent.fullName}
                      </h4>
                      <p className="text-xs text-zinc-500 max-w-sm mt-1">
                        Use the message console below with bold/italic formatting or click the green WhatsApp icon above.
                      </p>
                    </div>
                  </div>
                ) : (
                  currentStudentMsgs.map((msg) => {
                    const isStudent = msg.senderRole === "student";
                    const timeStr = msg.createdAt 
                      ? new Date(msg.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
                      : "Just now";

                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${isStudent ? "items-start" : "items-end"}`}
                      >
                        <div className="flex items-center gap-1.5 mb-1 px-1">
                          <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400">
                            {isStudent 
                              ? `${currentStudent.fullName} (Student)` 
                              : `${msg.senderName || "Library Administration"}`}
                          </span>
                          {msg.recipientName && isStudent && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 font-semibold">
                              To: {msg.recipientName}
                            </span>
                          )}
                          <span className="text-[10px] text-zinc-400">• {timeStr}</span>
                        </div>

                        <div
                          className={`p-3.5 rounded-2xl max-w-[85%] text-xs shadow-xs ${
                            isStudent
                              ? "bg-[#F8FAFC] dark:bg-zinc-800 text-[#0A2E5C] dark:text-zinc-100 rounded-tl-xs border border-zinc-200/60 dark:border-zinc-700/60"
                              : "bg-[#0A2E5C] text-white dark:bg-[#FFC107] dark:text-[#0A2E5C] rounded-tr-xs font-medium"
                          }`}
                        >
                          <FormattedMessage text={msg.message} />

                          {!isStudent && (
                            <div className="flex items-center justify-end gap-1 mt-1.5 text-[9px] text-zinc-300 dark:text-zinc-700">
                              <span>Delivered</span>
                              <CheckCheck className="h-3 w-3 text-emerald-400" />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={chatBottomRef} />
              </div>

              {/* Formatting Toolbar & Quick Chips */}
              <div className="px-4 py-2 bg-[#FBFBFA] dark:bg-[#161D2A] border-t border-zinc-200 dark:border-zinc-800 space-y-2">
                {/* Formatting Tools */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => insertFormatting("**")}
                      className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 cursor-pointer"
                      title="Bold (**text**)"
                    >
                      <Bold className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => insertFormatting("*")}
                      className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 cursor-pointer"
                      title="Italic (*text*)"
                    >
                      <Italic className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => insertFormatting("\n• ", "")}
                      className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 cursor-pointer"
                      title="Bullet list"
                    >
                      <List className="h-3.5 w-3.5" />
                    </button>
                    <span className="text-[10px] text-zinc-400 ml-1">Markdown formatting enabled</span>
                  </div>

                  <div className="flex items-center gap-1 text-[11px] text-zinc-500">
                    <span>Sender:</span>
                    <select
                      value={replySenderTitle}
                      onChange={(e) => setReplySenderTitle(e.target.value)}
                      className="bg-white dark:bg-[#0A2E5C] text-[10px] font-bold text-[#0A2E5C] dark:text-white px-2 py-0.5 rounded-lg border border-zinc-200 dark:border-zinc-700 cursor-pointer"
                    >
                      <option value="Library Administration">🛡️ Library Administration</option>
                      <option value="Front Desk Operations">👤 Front Desk Operations</option>
                      <option value="Chief Librarian">📚 Chief Librarian</option>
                    </select>
                  </div>
                </div>

                {/* Canned replies */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  <span className="text-[10px] font-bold text-zinc-400 shrink-0">Quick reply:</span>
                  {QUICK_REPLIES.map((chip, idx) => (
                    <button
                      key={idx}
                      onClick={() => setReplyText(chip)}
                      className="text-[10px] whitespace-nowrap px-2.5 py-1 rounded-lg bg-white dark:bg-[#0A2E5C] border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:border-[#FFC107] hover:text-[#FFC107] transition shrink-0 cursor-pointer"
                    >
                      {chip.slice(0, 30)}...
                    </button>
                  ))}
                </div>
              </div>

              {/* Chat Input Bar */}
              <div className="p-3 sm:p-4 bg-white dark:bg-[#0A2E5C] border-t border-zinc-200 dark:border-zinc-800">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendReply();
                  }}
                  className="flex items-center gap-2 sm:gap-3"
                >
                  <textarea
                    ref={inputRef}
                    rows={1}
                    placeholder={`Write message to ${currentStudent.fullName}... (Shift+Enter for new line)`}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSendReply();
                      }
                    }}
                    className="flex-1 px-4 py-3 bg-[#F8FAFC] dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-2xl text-xs text-[#0A2E5C] dark:text-white focus:outline-none focus:border-[#FFC107] resize-none"
                  />
                  <button
                    type="submit"
                    disabled={isReplying || !replyText.trim()}
                    className="px-5 py-3 rounded-2xl bg-[#0A2E5C] text-[#FFC107] text-xs font-black shadow-md hover:bg-[#141A24] disabled:opacity-50 flex items-center gap-2 cursor-pointer shrink-0"
                  >
                    <Send className="h-4 w-4" />
                    <span>Send</span>
                  </button>
                </form>
              </div>
            </>
          ) : (
            /* ======================================================= */
            /* SCENARIO 2: BROADCAST GROUP COMPOSER & HISTORY         */
            /* ======================================================= */
            <div className="flex flex-col h-full bg-white dark:bg-[#0A2E5C]">
              {/* Group Broadcast Header */}
              <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3 bg-[#FBFBFA]/80 dark:bg-[#161D2A]/80">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setMobileView("list")}
                    className="lg:hidden p-1.5 rounded-xl text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800 cursor-pointer"
                    title="Back to list"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>

                  <div className={`h-11 w-11 rounded-2xl flex items-center justify-center shrink-0 ${currentGroup.colorClass}`}>
                    <Radio className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-black text-[#0A2E5C] dark:text-white">
                        {currentGroup.name}
                      </h3>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                        Broadcast Group
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-500">{currentGroup.subtitle}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <a
                    href={`https://web.whatsapp.com`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3.5 py-2 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xs flex items-center gap-2 shadow-sm transition"
                    title="Open WhatsApp Web to send broadcast"
                  >
                    <WhatsAppIcon className="h-4 w-4" />
                    <span className="hidden sm:inline">WhatsApp Group Broadcast</span>
                  </a>
                </div>
              </div>

              {/* Broadcast Form & Sent History */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 bg-[#FBFBFA]/60 dark:bg-[#121822]/60">
                {/* Broadcast Composer Card */}
                <div className="p-5 rounded-3xl bg-white dark:bg-[#0A2E5C] border border-[#E5E7EB] dark:border-zinc-800 shadow-sm space-y-4">
                  <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
                    <h4 className="text-xs font-black uppercase tracking-wider text-[#0A2E5C] dark:text-white flex items-center gap-2">
                      <Send className="h-3.5 w-3.5 text-[#0B5ED7]" /> Compose Group Broadcast
                    </h4>
                    <span className="text-[11px] text-zinc-500">
                      Recipients: <strong>{currentGroup.targetAudience}</strong>
                    </span>
                  </div>

                  <div className="space-y-3">
                    <input
                      type="text"
                      placeholder="Broadcast Announcement Title (e.g. Library Schedule Notice / Holiday Announcement)..."
                      value={broadcastTitle}
                      onChange={(e) => setBroadcastTitle(e.target.value)}
                      className="w-full px-4 py-2.5 bg-[#F8FAFC] dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs font-bold text-[#0A2E5C] dark:text-white focus:outline-none focus:border-[#FFC107]"
                    />

                    {/* Formatting Toolbar */}
                    <div className="flex items-center gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() => setBroadcastBody(prev => prev + "**bold text** ")}
                        className="px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-bold text-zinc-700 dark:text-zinc-300 cursor-pointer"
                      >
                        <Bold className="h-3 w-3 inline mr-1" /> Bold
                      </button>
                      <button
                        type="button"
                        onClick={() => setBroadcastBody(prev => prev + "*italic text* ")}
                        className="px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-bold text-zinc-700 dark:text-zinc-300 cursor-pointer"
                      >
                        <Italic className="h-3 w-3 inline mr-1" /> Italic
                      </button>
                      <button
                        type="button"
                        onClick={() => setBroadcastBody(prev => prev + "\n• ")}
                        className="px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-bold text-zinc-700 dark:text-zinc-300 cursor-pointer"
                      >
                        <List className="h-3 w-3 inline mr-1" /> Bullet List
                      </button>

                      <div className="ml-auto flex items-center gap-1 text-xs">
                        <span className="text-zinc-400 text-[10px]">Priority:</span>
                        <select
                          value={broadcastPriority}
                          onChange={(e: any) => setBroadcastPriority(e.target.value)}
                          className="bg-[#F8FAFC] dark:bg-zinc-800 px-2 py-0.5 rounded-lg text-xs font-bold text-[#0A2E5C] dark:text-white border border-zinc-200 dark:border-zinc-700 cursor-pointer"
                        >
                          <option value="normal">Normal</option>
                          <option value="high">High Alert</option>
                          <option value="urgent">Urgent</option>
                        </select>
                      </div>
                    </div>

                    <textarea
                      rows={4}
                      placeholder="Write your broadcast message body here. Supports **bold**, *italic*, and bullet lists..."
                      value={broadcastBody}
                      onChange={(e) => setBroadcastBody(e.target.value)}
                      className="w-full px-4 py-3 bg-[#F8FAFC] dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-2xl text-xs text-[#0A2E5C] dark:text-white focus:outline-none focus:border-[#FFC107] resize-y"
                    />

                    <div className="flex items-center justify-between pt-1">
                      <p className="text-[11px] text-zinc-400">
                        This notice will appear in student dashboards and alerts in real-time.
                      </p>
                      <button
                        onClick={handleSendBroadcast}
                        disabled={isBroadcasting || !broadcastTitle.trim() || !broadcastBody.trim()}
                        className="px-6 py-2.5 rounded-2xl bg-[#0A2E5C] text-[#FFC107] text-xs font-black hover:bg-[#141A24] disabled:opacity-50 flex items-center gap-2 cursor-pointer shadow-sm"
                      >
                        <Send className="h-3.5 w-3.5" />
                        <span>{isBroadcasting ? "Broadcasting..." : `Send to ${currentGroup.name}`}</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Sent Broadcasts History to this Group */}
                <div className="space-y-3">
                  <h4 className="text-xs font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Recent Broadcasts to {currentGroup.name} ({groupAnnouncements.length})
                  </h4>

                  {groupAnnouncements.length === 0 ? (
                    <div className="p-6 text-center text-zinc-400 text-xs bg-white dark:bg-[#0A2E5C] rounded-3xl border border-[#E5E7EB]/70 dark:border-zinc-800">
                      No previous broadcasts logged for this group.
                    </div>
                  ) : (
                    groupAnnouncements.map((ann) => (
                      <div
                        key={ann.id}
                        className="p-4 rounded-3xl bg-white dark:bg-[#0A2E5C] border border-[#E5E7EB]/70 dark:border-zinc-800 shadow-xs space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${
                            ann.priority === "urgent" || ann.priority === "high"
                              ? "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300"
                              : "bg-[#F8FAFC] text-[#0B5ED7] dark:bg-zinc-800 dark:text-[#FFC107]"
                          }`}>
                            {ann.priority} Priority
                          </span>
                          <span className="text-[10px] text-zinc-400">
                            {ann.createdAt ? new Date(ann.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "Recent"}
                          </span>
                        </div>
                        <h5 className="text-xs font-black text-[#0A2E5C] dark:text-white">{ann.title}</h5>
                        <div className="text-xs text-zinc-600 dark:text-zinc-300">
                          <FormattedMessage text={ann.message} />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
}
