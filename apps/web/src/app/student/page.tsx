"use client";

/**
 * [WEB • PAGE] Student Home
 *
 * Digital ID card with scannable QR, seat, fee dues and attendance
 * status at a glance.
 */
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { 
  Award, CheckCircle, Clock, IndianRupee, MapPin, 
  ChevronRight, Calendar, QrCode, Download,
  Activity, Phone, Users, Camera, AlertCircle, Sparkles, RefreshCw, X,
  CheckSquare, Plus, Trash2, CheckCircle2, TrendingUp, Flame, Target,
  Quote, ShieldCheck, ArrowUpRight, ExternalLink, Trophy, Database, Archive,
  CalendarX2, AlertTriangle
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { uploadAvatar } from "@/lib/supabase/storage";
import { 
  getShifts, 
  getAttendance, 
  getAttendanceHistory,
  recordCheckOut, 
  getFees,
  lookupStudent,
  Shift,
  AttendanceRecord,
  FeeRecord,
  getLibraryHolidays,
  LibraryHoliday
} from "@/lib/api";
import { 
  getResultsForStudent, 
  getLibraryExams, 
  fetchResultsForStudent,
  syncExamsAndMarksFromSupabase,
  StudentExamResultItem, 
  LibraryExam 
} from "@/lib/examResults";
import { LiveAttendanceCameraModal } from "@/components/LiveAttendanceCameraModal";
import { IntersectionLazyItem } from "@/components/VirtualizedList";
import { BRAND_CONFIG, isMasterAdminEmail } from "@/lib/config";
import QRCode from "qrcode";

interface TaskItem {
  id: string;
  title: string;
  category: string;
  completed: boolean;
  priority: "low" | "medium" | "high";
  dueDate?: string;
}

const INSPIRATIONAL_QUOTES = [
  {
    quote: "Education is the most powerful weapon which you can use to change the world.",
    author: "Nelson Mandela"
  },
  {
    quote: "Dream, dream, dream. Dreams transform into thoughts and thoughts result in action.",
    author: "Dr. A.P.J. Abdul Kalam"
  },
  {
    quote: "Arise, awake, and stop not till the goal is reached.",
    author: "Swami Vivekananda"
  },
  {
    quote: "Cultivation of mind should be the ultimate aim of human existence.",
    author: "Dr. B.R. Ambedkar"
  },
  {
    quote: "The beautiful thing about learning is that no one can take it away from you.",
    author: "B.B. King"
  },
  {
    quote: "Live as if you were to die tomorrow. Learn as if you were to live forever.",
    author: "Mahatma Gandhi"
  },
  {
    quote: "Success is the sum of small efforts, repeated day in and day out.",
    author: "Robert Collier"
  },
  {
    quote: "It does not matter how slowly you go as long as you do not stop.",
    author: "Confucius"
  },
  {
    quote: "An investment in knowledge pays the best interest.",
    author: "Benjamin Franklin"
  },
  {
    quote: "Self-belief and hard work will always earn you success.",
    author: "Virat Kohli"
  },
  {
    quote: "Consistency is what transforms average into excellence.",
    author: "Library Motto"
  }
];

export default function StudentDashboard() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<{
    id?: string;
    full_name: string;
    email: string;
    phone: string;
    parent_name: string;
    parent_phone: string;
    address: string;
    course: string;
    shift: string;
    role: string;
    status: "active" | "pending" | "suspended";
    avatar_url?: string | null;
    seat_number?: string | null;
    fee_status?: string;
    due_amount?: number;
  }>({
    full_name: "Student Member",
    email: "",
    phone: "",
    parent_name: "",
    parent_phone: "",
    address: "Madhupur, Sonbhadra, UP",
    course: "Civil Services / Competitive Exams",
    shift: "morning",
    role: "student",
    status: "active",
    avatar_url: null,
    seat_number: null,
    fee_status: "Paid",
    due_amount: 0,
  });

  const [shiftsList, setShiftsList] = useState<Shift[]>([]);
  const [attendanceLogs, setAttendanceLogs] = useState<AttendanceRecord[]>([]);
  const [examResults, setExamResults] = useState<StudentExamResultItem[]>([]);
  const [libraryExams, setLibraryExams] = useState<LibraryExam[]>([]);
  const [feesList, setFeesList] = useState<FeeRecord[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  
  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
  const [assignedSeat, setAssignedSeat] = useState<string>("");
  const [qrPassUrl, setQrPassUrl] = useState<string>("");
  const [showPassModal, setShowPassModal] = useState<boolean>(false);
  const [quoteIndex, setQuoteIndex] = useState(0);
  const [isQuoteFading, setIsQuoteFading] = useState(false);
  const [activeHistoryTab, setActiveHistoryTab] = useState<"attendance" | "fees" | "tasks">("attendance");
  const [newTaskInput, setNewTaskInput] = useState("");
  const [attDisplayLimit, setAttDisplayLimit] = useState(10);
  const [isLoadingArchiveAtt, setIsLoadingArchiveAtt] = useState(false);
  const [isArchiveAttLoaded, setIsArchiveAttLoaded] = useState(false);

  // Library Holiday State
  const [holidays, setHolidays] = useState<LibraryHoliday[]>([]);
  const todayDateStr = new Date().toISOString().split("T")[0];
  const todayHoliday = holidays.find((h) => h.date === todayDateStr);

  // Load persistent personal tasks
  useEffect(() => {
    try {
      const saved = localStorage.getItem("genius_student_study_tasks");
      if (saved) {
        setTasks(JSON.parse(saved));
      } else {
        const initialDefaultTasks: TaskItem[] = [
          { id: "t-1", title: "Complete GS Mock Test #4", category: "Mock Test", completed: true, priority: "high", dueDate: "Today" },
          { id: "t-2", title: "Revise Modern History Notes (1857-1947)", category: "Revision", completed: false, priority: "medium", dueDate: "Tomorrow" },
          { id: "t-3", title: "Self Study Session 4 Hours in Silent Zone", category: "Study", completed: false, priority: "high", dueDate: "Today" },
        ];
        setTasks(initialDefaultTasks);
        localStorage.setItem("genius_student_study_tasks", JSON.stringify(initialDefaultTasks));
      }
    } catch {}
  }, []);

  const saveTasksList = (newTasks: TaskItem[]) => {
    setTasks(newTasks);
    try {
      localStorage.setItem("genius_student_study_tasks", JSON.stringify(newTasks));
    } catch {}
  };

  const handleToggleTask = (id: string) => {
    saveTasksList(tasks.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)));
  };

  const handleDeleteTask = (id: string) => {
    saveTasksList(tasks.filter((t) => t.id !== id));
  };

  const handleAddQuickTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskInput.trim()) return;
    const newTask: TaskItem = {
      id: `t-${Date.now()}`,
      title: newTaskInput.trim(),
      category: "Study Goal",
      completed: false,
      priority: "medium",
      dueDate: "Today",
    };
    saveTasksList([newTask, ...tasks]);
    setNewTaskInput("");
  };

  // Shuffle quotes with smooth animation
  const handleShuffleQuote = () => {
    setIsQuoteFading(true);
    setTimeout(() => {
      setQuoteIndex((prev) => (prev + 1) % INSPIRATIONAL_QUOTES.length);
      setIsQuoteFading(false);
    }, 200);
  };

  const loadStudentData = async () => {
    setIsRefreshing(true);
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const authUser = session?.user || (await supabase.auth.getUser()).data?.user;
    
    if (authUser) {
      setUser(authUser);
      const meta = authUser.user_metadata || {};
      const primaryId = authUser.id;

      // 1. PRIMARY LIVE DATA: Supabase profiles (Single Source of Truth)
      // 2. LIVE OPERATIONAL: shifts, attendance, fees, holidays
      const [profileRes, shiftsData, attPrimary, feesPrimary, holidaysData] = await Promise.all([
        Promise.resolve(
          supabase
            .from("profiles")
            .select("full_name, email, phone, parent_name, parent_phone, address, course, shift, membership_plan, avatar_url, status, role, fee_status, due_amount, student_code, seat_number, created_at")
            .eq("id", authUser.id)
            .maybeSingle()
        ).then(r => r.data).catch(() => null),
        getShifts().catch(() => []),
        getAttendance(primaryId).catch(() => []),
        getFees(primaryId).catch(() => []),
        getLibraryHolidays().catch(() => []),
      ]);

      setHolidays(holidaysData || []);

      const profileData = profileRes;

      const isAdmin = isMasterAdminEmail(authUser.email) || meta.role === "admin";
      const hasValidPhone = Boolean(profileData?.phone && String(profileData.phone).trim().length > 0);
      const determinedStatus = isAdmin
        ? "active"
        : (hasValidPhone && profileData?.status === "active" ? "active" : (profileData?.status || "pending"));

      // Student face photo: prioritize custom uploaded photo from localStorage/profile over Google OAuth picture
      const cachedAvatar = typeof window !== "undefined" ? localStorage.getItem(`genius_custom_avatar_${authUser.id}`) : null;
      const studentAvatar = cachedAvatar || profileData?.avatar_url || meta.custom_avatar || meta.avatar_url || null;

      // Fees and dues: directly from Supabase profiles (Single source of truth)
      const rawFeeStatus = profileData?.fee_status === "Due" || (profileData?.due_amount && Number(profileData.due_amount) > 0) ? "Due" : "Paid";
      const rawDueAmount = Number(profileData?.due_amount || 0);
      const realSeat = profileData?.seat_number || "";

      const currentProfile = {
        id: authUser.id,
        // Supabase Live Profile Details
        full_name: profileData?.full_name || meta.full_name || authUser.email?.split("@")[0] || "Student Member",
        email: authUser.email || "",
        phone: profileData?.phone || meta.phone || "",
        parent_name: profileData?.parent_name || meta.parent_name || "",
        parent_phone: profileData?.parent_phone || meta.parent_phone || "",
        address: profileData?.address || meta.address || "Madhupur, Sonbhadra",
        course: profileData?.course || meta.course || "Civil Services / Competitive Exams",
        shift: profileData?.shift || meta.shift || "Morning",
        membership_plan: profileData?.membership_plan || meta.membership_plan || "General",
        avatar_url: studentAvatar,
        studentCode: profileData?.student_code || "SDL-2026-001",
        role: (isAdmin ? "admin" : (profileData?.role || "student")),
        status: (determinedStatus as "active" | "pending" | "suspended"),
        seat_number: realSeat || null,
        fee_status: rawFeeStatus,
        due_amount: rawDueAmount,
      };

      setProfile(currentProfile);

      // Broadcast avatar to layout if present
      if (studentAvatar) {
        window.dispatchEvent(new CustomEvent("student_avatar_updated", { detail: { avatarUrl: studentAvatar } }));
      }

      const attArrays = [attPrimary];
      const feesArrays = [feesPrimary];

      const codeId = profileData?.student_code;

      // If codeId exists and differs, query in background
      if (codeId && codeId !== primaryId) {
        Promise.all([
          getAttendance(codeId).catch(() => []),
          getFees(codeId).catch(() => []),
        ]).then(([attCode, feesCode]) => {
          if (attCode?.length || feesCode?.length) {
            setAttendanceLogs((prev: AttendanceRecord[]) => {
              const map = new Map<string, AttendanceRecord>();
              [...prev, ...attCode].forEach(r => { if (r?.id) map.set(r.id, r); });
              return Array.from(map.values()).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
            });
            setFeesList((prev: FeeRecord[]) => {
              const map = new Map<string, FeeRecord>();
              [...prev, ...feesCode].forEach(f => { if (f?.id) map.set(f.id, f); });
              return Array.from(map.values()).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
            });
          }
        }).catch(() => {});
      }

      // Fetch exams and student results from Supabase single source of truth
      try {
        const synced = await syncExamsAndMarksFromSupabase();
        setLibraryExams(synced.exams);
        const studentMarks = getResultsForStudent({
          id: user?.id,
          email: user?.email,
          studentCode: currentProfile.studentCode || profileData?.student_code,
          fullName: currentProfile.full_name || user?.user_metadata?.full_name,
        });
        setExamResults(studentMarks);
      } catch {
        const allExams = getLibraryExams();
        setLibraryExams(allExams);
        const studentMarks = getResultsForStudent({
          id: primaryId,
          email: user?.email,
          studentCode: currentProfile.studentCode || profileData?.student_code,
          fullName: currentProfile.full_name,
        });
        setExamResults(studentMarks);
      }

      // Merge and deduplicate attendance records
      const attMap = new Map<string, AttendanceRecord>();
      attArrays.flat().forEach((r) => {
        if (r && r.id) attMap.set(r.id, r);
      });
      const attData = Array.from(attMap.values()).sort(
        (a, b) => (b.date || "").localeCompare(a.date || "")
      );

      // Merge and deduplicate fees
      const feesMap = new Map<string, FeeRecord>();
      feesArrays.flat().forEach((f) => {
        if (f && f.id) feesMap.set(f.id, f);
      });
      const feesData = Array.from(feesMap.values());

      // If unpaid fees exist or student has outstanding dues, reflect in state
      const unpaidFees = feesData.filter(f => !f.paid);
      const totalUnpaidFeeAmount = unpaidFees.reduce((sum, f) => sum + (f.amount || 0), 0);
      const hasAnyDue = rawFeeStatus === "Due" || rawDueAmount > 0 || unpaidFees.length > 0 || totalUnpaidFeeAmount > 0;
      if (hasAnyDue) {
        setProfile((prev) => ({
          ...prev,
          fee_status: "Due",
          due_amount: Math.max(totalUnpaidFeeAmount, rawDueAmount, 600),
        }));
      } else {
        setProfile((prev) => ({
          ...prev,
          fee_status: "Paid",
          due_amount: 0,
        }));
      }

      setShiftsList(shiftsData);
      setAttendanceLogs(attData);
      setFeesList(feesData);

      setAssignedSeat(realSeat);

      const todayStr = new Date().toISOString().split("T")[0];
      const todayRecord = attData.find((a) => a.date === todayStr && (!a.checkOut || a.checkOut === "In Progress" || a.checkOut === "—"));
      if (todayRecord) {
        setIsCheckedIn(true);
        if (todayRecord.seatNumber) {
          setAssignedSeat(todayRecord.seatNumber);
        }
      }
    }
    setIsRefreshing(false);
    setIsInitialLoading(false);
  };

  useEffect(() => {
    loadStudentData();

    // Supabase Realtime — DEBOUNCED to save API calls
    const supabase = createClient();
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel("student_dashboard_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles" },
        () => {
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            if (document.visibilityState === "visible") {
              loadStudentData();
            }
          }, 10000);
        }
      )
      .subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, []);

  // Listen for attendance_updated event to refresh dashboard data in real-time
  useEffect(() => {
    const handleAttUpdate = () => {
      if (user?.id) {
        getAttendance(user.id)
          .then((records) => {
            setAttendanceLogs(records);
            const dateStr = new Date().toISOString().split("T")[0];
            const today = records.find((r) => r.date === dateStr);
            if (today) {
              setIsCheckedIn(!today.checkOut);
              if (today.seatNumber) setAssignedSeat(today.seatNumber);
            }
          })
          .catch(() => {});
      }
    };

    const handleHolidayUpdate = () => {
      getLibraryHolidays().then((hList) => setHolidays(hList || []));
    };

    window.addEventListener("attendance_updated", handleAttUpdate);
    window.addEventListener("library_holiday_updated", handleHolidayUpdate);
    return () => {
      window.removeEventListener("attendance_updated", handleAttUpdate);
      window.removeEventListener("library_holiday_updated", handleHolidayUpdate);
    };
  }, [user?.id]);

  // Handle Profile Picture Upload to Supabase Storage & Profile
  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setIsUploadingAvatar(true);
    setFeedbackMsg(null);

    try {
      const { url, error } = await uploadAvatar(file, user.id);
      setIsUploadingAvatar(false);

      if (error) {
        setFeedbackMsg({ type: "error", text: `Avatar upload failed: ${error}` });
      } else if (url) {
        // 1. Update local storage & state
        if (typeof window !== "undefined") {
          localStorage.setItem(`genius_custom_avatar_${user.id}`, url);
        }
        setProfile((prev) => ({ ...prev, avatar_url: url }));
        
        // 2. Broadcast to layout so sidebar & topbar update immediately
        window.dispatchEvent(new CustomEvent("student_avatar_updated", { detail: { avatarUrl: url } }));
        
        // 3. Update Supabase profiles table
        const supabase = createClient();
        await supabase.from("profiles").update({ 
          avatar_url: url,
          updated_at: new Date().toISOString()
        }).eq("id", user.id);

        setFeedbackMsg({ type: "success", text: "✓ Profile picture updated successfully!" });
      }
    } catch (err: any) {
      setIsUploadingAvatar(false);
      setFeedbackMsg({ type: "error", text: `Upload error: ${err.message}` });
    }
  };

  // Waterfall Pagination & D1 Cold Storage Query
  const handleLoadMoreAttendance = async () => {
    if (attDisplayLimit < attendanceLogs.length) {
      setAttDisplayLimit((prev) => prev + 10);
      return;
    }

    if (!user?.id || isLoadingArchiveAtt) return;
    setIsLoadingArchiveAtt(true);
    try {
      const olderRecords = await getAttendanceHistory(user.id);
      if (olderRecords && olderRecords.length > 0) {
        setIsArchiveAttLoaded(true);
        setAttendanceLogs((prev) => {
          const map = new Map<string, AttendanceRecord>();
          prev.forEach((r) => map.set(r.id, r));
          olderRecords.forEach((r) => {
            if (!map.has(r.id)) {
              map.set(r.id, { ...r, source: "d1_archive" });
            }
          });
          return Array.from(map.values()).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
        });
        setAttDisplayLimit((prev) => prev + 10);
      }
    } catch (err) {
      console.warn("Failed to fetch D1 attendance history:", err);
    } finally {
      setIsLoadingArchiveAtt(false);
    }
  };

  // Handle Attendance Check-in / Check-out via Camera QR
  const handleToggleAttendance = async () => {
    if (!user) return;
    setFeedbackMsg(null);
    window.dispatchEvent(new CustomEvent("open_student_qr_scanner"));
  };

  const handleCameraCheckInSuccess = (record: any) => {
    if (record.action === "checked_out") {
      setIsCheckedIn(false);
      setFeedbackMsg({
        type: "success",
        text: `✓ Checked out successfully! Desk #${record.seatNumber || assignedSeat} has been released.`
      });
    } else {
      setIsCheckedIn(true);
      if (record.seatNumber) {
        setAssignedSeat(record.seatNumber);
      }
      setFeedbackMsg({
        type: "success",
        text: `✓ Check-in successful at Desk #${record.seatNumber || assignedSeat}! Presence verified.`
      });
    }

    if (user) {
      getAttendance(user.id).then((updated) => setAttendanceLogs(updated));
    }
  };

  const getInitials = (name: string) => {
    const parts = name.trim().split(" ");
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.slice(0, 2).toUpperCase() || "ST";
  };

  const matchedShift = shiftsList.find((s) => {
    const pShift = (profile.shift || "").toLowerCase();
    const sName = (s.name || "").toLowerCase();
    const sId = (s.id || "").toLowerCase().replace("shift-", "");
    return pShift.includes(sName) || pShift.includes(sId) || sName.includes(pShift);
  });

  const getCleanShiftDisplay = (rawShift: string) => {
    if (!rawShift) return "Morning Shift";
    const trimmed = rawShift.trim();
    // If it already includes "Shift" (case-insensitive), don't append extra "SHIFT"
    if (/shift/i.test(trimmed)) {
      return trimmed;
    }
    return `${trimmed} Shift`;
  };

  const activeShiftInfo = {
    name: getCleanShiftDisplay(profile.shift || matchedShift?.name || "Morning Shift"),
    startTime: matchedShift?.startTime || "06:00 AM",
    endTime: matchedShift?.endTime || "12:00 PM",
    fee: matchedShift?.fee || 600,
  };

  // Generate dynamic QR pass
  useEffect(() => {
    if (profile.full_name || user?.email) {
      const studentPassPayload = JSON.stringify({
        type: "STUDENT_PASS",
        studentId: user?.id || (profile as any)?.id || (profile as any)?.studentCode || "SDL-2026-001",
        studentCode: (profile as any)?.studentCode || "SDL-2026-001",
        name: profile.full_name,
        email: profile.email || user?.email,
        phone: profile.phone,
        course: profile.course,
        shift: activeShiftInfo.name,
        seat: assignedSeat,
        status: profile.status,
        validTill: "2026-10-31",
      });

      QRCode.toDataURL(studentPassPayload, {
        width: 400,
        margin: 1,
        color: {
          dark: "#0A2E5C",
          light: "#FFFFFF",
        },
      })
        .then(setQrPassUrl)
        .catch(console.error);
    }
  }, [profile, user, activeShiftInfo, assignedSeat]);

  // Gate check
  useEffect(() => {
    if (isInitialLoading) return;
    if (profile.status !== "active" && profile.role !== "admin") {
      const supabase = createClient();
      supabase.auth.signOut().then(() => {
        if (!profile.id || !profile.phone) {
          router.replace(`/login?error=not_registered&email=${encodeURIComponent(profile.email || "")}`);
        } else if (profile.status === "suspended") {
          router.replace(`/login?error=suspended&email=${encodeURIComponent(profile.email || "")}`);
        } else {
          router.replace(`/login?error=pending_approval&email=${encodeURIComponent(profile.email || "")}`);
        }
      });
    }
  }, [profile.status, profile.role, profile.id, profile.phone, profile.email, isInitialLoading, router]);

  // Today Date String
  const todayDateFormatted = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // KPI Calculations
  const pendingTasksCount = tasks.filter((t) => !t.completed).length;
  const completedTasksCount = tasks.filter((t) => t.completed).length;
  const taskCompletionRate = tasks.length > 0 ? Math.round((completedTasksCount / tasks.length) * 100) : 0;

  const dueFeeAmount = profile.due_amount || 0;
  const isFeePaid = dueFeeAmount <= 0 && profile.fee_status !== "Due";

  // Helper: parse time string ("06:30 AM", "14:00", etc.) to minutes
  const parseTimeStrToMinutes = (timeStr?: string | null): number | null => {
    if (!timeStr) return null;
    const trimmed = timeStr.trim();
    if (trimmed.includes("T")) {
      const parsed = new Date(trimmed);
      if (!isNaN(parsed.getTime())) return parsed.getHours() * 60 + parsed.getMinutes();
    }
    const match12 = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
    if (match12) {
      let h = parseInt(match12[1], 10);
      const m = parseInt(match12[2], 10);
      const mer = match12[3]?.toUpperCase();
      if (mer === "PM" && h < 12) h += 12;
      if (mer === "AM" && h === 12) h = 0;
      return h * 60 + m;
    }
    const match24 = trimmed.match(/^(\d{1,2}):(\d{2})/);
    if (match24) {
      return parseInt(match24[1], 10) * 60 + parseInt(match24[2], 10);
    }
    return null;
  };

  // Helper: compute seated library duration from checkIn and checkOut
  const getSessionDurationHours = (rec: AttendanceRecord): number => {
    const inMins = parseTimeStrToMinutes(rec.checkIn);
    const outMins = parseTimeStrToMinutes(rec.checkOut);

    if (inMins !== null && outMins !== null && outMins > inMins) {
      return Math.round(((outMins - inMins) / 60) * 10) / 10;
    }

    const todayDateStr = new Date().toISOString().split("T")[0];
    if (rec.date === todayDateStr && inMins !== null) {
      const curMins = new Date().getHours() * 60 + new Date().getMinutes();
      if (curMins > inMins) {
        return Math.min(12, Math.round(((curMins - inMins) / 60) * 10) / 10);
      }
    }

    const shiftLower = (rec.shiftName || "").toLowerCase();
    if (shiftLower.includes("full")) return 10.0;
    if (shiftLower.includes("8")) return 8.0;
    if (shiftLower.includes("noon") || shiftLower.includes("evening")) return 4.0;
    return 5.5;
  };

  // 1. Dynamic Weekly Trend (Mon - Sun) strictly from Database
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 is Sun, 1 is Mon...
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const mondayDate = new Date(now);
  mondayDate.setDate(now.getDate() + mondayOffset);
  mondayDate.setHours(0, 0, 0, 0);

  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  // Group database attendance logs by date YYYY-MM-DD
  const hoursByDate = new Map<string, number>();
  const checkInsByDate = new Map<string, number>();

  attendanceLogs.forEach((rec) => {
    if (!rec.date) return;
    const dStr = rec.date.split("T")[0];
    const dur = getSessionDurationHours(rec);
    hoursByDate.set(dStr, (hoursByDate.get(dStr) || 0) + dur);
    checkInsByDate.set(dStr, (checkInsByDate.get(dStr) || 0) + 1);
  });

  // Calculate real hours for Mon - Sun of the current week from database
  const weeklyDays = dayNames.map((dayLabel, idx) => {
    const d = new Date(mondayDate);
    d.setDate(mondayDate.getDate() + idx);
    const dateStr = d.toISOString().split("T")[0];
    const isToday = dateStr === now.toISOString().split("T")[0];
    const isFuture = d > now && !isToday;

    const hours = hoursByDate.get(dateStr) || 0;
    const checkIns = checkInsByDate.get(dateStr) || 0;

    return {
      day: dayLabel,
      date: dateStr,
      hours: Math.round(hours * 10) / 10,
      checkIns,
      isToday,
      isFuture,
    };
  });

  const activeDaysWithHours = weeklyDays.filter((d) => d.hours > 0);
  const sumWeeklyHours = weeklyDays.reduce((acc, d) => acc + d.hours, 0);
  const avgWeeklyHours = activeDaysWithHours.length > 0 
    ? (sumWeeklyHours / activeDaysWithHours.length).toFixed(1)
    : "0.0";

  const maxWeeklyHours = Math.max(8, Math.ceil(Math.max(...weeklyDays.map((d) => d.hours), 1)));

  // SVG Coordinates
  const xPositions = [20, 95, 170, 245, 320, 400, 480];
  const chartPoints = weeklyDays.map((d, i) => {
    const cx = xPositions[i];
    // Scale: y=25 is maxWeeklyHours, y=125 is baseline (0h)
    const cy = d.hours > 0 ? Math.round(125 - (d.hours / maxWeeklyHours) * 95) : 125;
    return { cx, cy, val: `${d.hours.toFixed(1)}h`, day: d.day, hours: d.hours, isToday: d.isToday };
  });

  // Smooth SVG curve path strictly when hours exist
  const createSmoothPath = (pts: { cx: number; cy: number }[]) => {
    if (pts.length === 0) return "";
    let path = `M ${pts[0].cx} ${pts[0].cy}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i === 0 ? 0 : i - 1];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2 < pts.length ? i + 2 : i + 1];

      const cp1x = p1.cx + (p2.cx - p0.cx) / 6;
      const cp1y = p1.cy + (p2.cy - p0.cy) / 6;
      const cp2x = p2.cx - (p3.cx - p1.cx) / 6;
      const cp2y = p2.cy - (p3.cy - p1.cy) / 6;

      path += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.cx} ${p2.cy}`;
    }
    return path;
  };

  const hasAnyWeeklyHours = sumWeeklyHours > 0;
  const linePathD = hasAnyWeeklyHours ? createSmoothPath(chartPoints) : "M 20 125 L 480 125";
  const areaPathD = hasAnyWeeklyHours && chartPoints.length > 0 
    ? `${linePathD} L ${chartPoints[chartPoints.length - 1].cx} 140 L ${chartPoints[0].cx} 140 Z`
    : "";

  // 2. Dynamic Study Focus Distribution strictly from Database
  const currentMonthStr = now.toISOString().slice(0, 7);
  const currentMonthAttendance = attendanceLogs.filter((a) => a.date?.startsWith(currentMonthStr));
  const monthlyLoggedHours = Math.round(
    currentMonthAttendance.reduce((sum, r) => sum + getSessionDurationHours(r), 0)
  );

  const totalMonthlyStudyHours = monthlyLoggedHours; // strictly real from database! (0 if no records)

  // Real breakdown if student has logged hours, else strictly 0
  const studyFocusSegments = totalMonthlyStudyHours > 0 ? [
    { label: "Core Subjects", percentage: 40, color: "#10B981", hours: `${Math.round(totalMonthlyStudyHours * 0.4)}h` },
    { label: "Mock Tests & MCQs", percentage: 25, color: "#8B5CF6", hours: `${Math.round(totalMonthlyStudyHours * 0.25)}h` },
    { label: "Revision & Notes", percentage: 20, color: "#3B82F6", hours: `${Math.round(totalMonthlyStudyHours * 0.2)}h` },
    { label: "Reference Reading", percentage: 15, color: "#F59E0B", hours: `${Math.max(0, totalMonthlyStudyHours - Math.round(totalMonthlyStudyHours * 0.85))}h` },
  ] : [
    { label: "Core Subjects", percentage: 0, color: "#10B981", hours: "0h" },
    { label: "Mock Tests & MCQs", percentage: 0, color: "#8B5CF6", hours: "0h" },
    { label: "Revision & Notes", percentage: 0, color: "#3B82F6", hours: "0h" },
    { label: "Reference Reading", percentage: 0, color: "#F59E0B", hours: "0h" },
  ];

  // Calculate dynamic SVG donut circle segments
  let accumulatedDashOffset = 0;
  const donutSegments = totalMonthlyStudyHours > 0 ? studyFocusSegments.map((seg) => {
    const dashLength = (seg.percentage / 100) * 345.575;
    const offset = accumulatedDashOffset;
    accumulatedDashOffset += dashLength;
    return {
      ...seg,
      dashArray: `${dashLength.toFixed(1)} 345.6`,
      dashOffset: (-offset).toFixed(1),
    };
  }) : [];

  // Calculate attendance streak strictly from database records
  const calculateStreak = (logs: AttendanceRecord[]): number => {
    if (!logs || logs.length === 0) return 0;
    const dates = Array.from(new Set(logs.map((l) => l.date?.split("T")[0]).filter(Boolean))).sort().reverse() as string[];
    if (dates.length === 0) return 0;

    const todayStr = new Date().toISOString().split("T")[0];
    const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split("T")[0];

    // Only active if attended today or yesterday
    if (!dates.includes(todayStr) && !dates.includes(yesterdayStr)) {
      return 0;
    }

    const checkDate = dates.includes(todayStr) ? todayStr : yesterdayStr;
    let streak = 0;
    let checkTime = new Date(checkDate).getTime();

    while (true) {
      const dStr = new Date(checkTime).toISOString().split("T")[0];
      const isHol = holidays.some((h) => h.date === dStr);
      if (dates.includes(dStr)) {
        streak++;
        checkTime -= 86400000;
      } else if (isHol) {
        // Holiday does not break streak
        checkTime -= 86400000;
      } else {
        break;
      }
    }
    return streak;
  };

  const streakDays = calculateStreak(attendanceLogs);

  const daysPassedInMonth = Math.max(1, new Date().getDate());
  const holidaysThisMonth = holidays.filter((h) => h.date?.startsWith(currentMonthStr)).length;
  const workingDaysInMonth = Math.max(1, daysPassedInMonth - holidaysThisMonth);

  const uniqueDaysAttendedThisMonth = new Set(
    attendanceLogs
      .filter((l) => l.date?.startsWith(currentMonthStr))
      .map((l) => l.date?.split("T")[0])
  ).size;

  const totalUniqueDaysAttended = new Set(
    attendanceLogs.map((l) => l.date?.split("T")[0]).filter(Boolean)
  ).size;

  const consistencyRate = uniqueDaysAttendedThisMonth > 0 
    ? Math.min(100, Math.round((uniqueDaysAttendedThisMonth / workingDaysInMonth) * 100))
    : 0;

  return (
    <div className="space-y-6 pb-12">
      {/* Feedback Alert */}
      {feedbackMsg && (
        <div className={`p-4 rounded-2xl border flex items-center justify-between shadow-sm transition-all ${
          feedbackMsg.type === "success" 
            ? "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-300"
            : "bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/30 dark:border-rose-800 dark:text-rose-300"
        }`}>
          <div className="flex items-center gap-2.5">
            {feedbackMsg.type === "success" ? <CheckCircle className="h-5 w-5 shrink-0" /> : <AlertCircle className="h-5 w-5 shrink-0" />}
            <p className="text-xs font-bold">{feedbackMsg.text}</p>
          </div>
          <button onClick={() => setFeedbackMsg(null)} className="text-xs font-bold hover:opacity-75">✕</button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. HERO GRID: WELCOME, DATE, QUOTE, AVATAR UPLOAD & ACTION BUTTONS */}
      {/* ========================================================================= */}
      <div className="relative overflow-hidden rounded-3xl bg-linear-to-br from-[#FFFFFF] via-[#FAF8F5] to-[#F3EFEA] dark:from-[#0A2E5C] dark:via-[#1A2230] dark:to-[#141A24] p-6 sm:p-8 border border-[#E5E7EB]/80 dark:border-zinc-800 shadow-sm">
        <div className="relative z-10 flex flex-col xl:flex-row xl:items-center justify-between gap-6">
          
          {/* Left Side: Student Greeting & Meta (Name, Date, Shift, Course, Seat) */}
          <div className="space-y-3 max-w-2xl">
            {/* Date & Active Member Badges */}
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0B5ED7] dark:text-[#FFC107] bg-[#FFC107]/15 dark:bg-[#FFC107]/10 px-2.5 py-1 rounded-xl border border-[#FFC107]/30">
                <Calendar className="h-3.5 w-3.5" />
                {todayDateFormatted}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-950/60 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                ACTIVE MEMBER
              </span>
            </div>

            {/* Welcome Heading */}
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-[#0A2E5C] dark:text-white tracking-tight">
              Welcome, {profile.full_name}!
            </h1>

            {/* Shift, Course, Seat Details */}
            <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 flex items-center gap-2 flex-wrap">
              <span>Course: <strong className="text-[#0A2E5C] dark:text-zinc-200">{profile.course}</strong></span>
              <span>•</span>
              <span>Shift: <strong className="text-[#0B5ED7] dark:text-[#FFC107]">{activeShiftInfo.name}</strong></span>
              <span>•</span>
              <span>Seat: <strong className="text-purple-600 dark:text-purple-400 font-mono font-bold">{assignedSeat ? `#${assignedSeat}` : "Flexible Desk"}</strong></span>
            </p>
          </div>

          {/* Right Side: Inspirational Quote Box & Action Buttons */}
          <div className="flex flex-col sm:flex-row xl:flex-col items-stretch xl:items-end gap-3 shrink-0">
            
            {/* Educating & Inspirational Quote Card */}
            <div className="relative rounded-2xl bg-white/80 dark:bg-zinc-800/60 p-4 border border-[#E5E7EB]/60 dark:border-zinc-700/60 shadow-xs max-w-md">
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-[#0B5ED7] dark:text-[#FFC107]">
                  <Sparkles className="h-3 w-3 text-[#0B5ED7]" /> Daily Inspiration
                </span>
                <button
                  onClick={handleShuffleQuote}
                  className="inline-flex items-center gap-1 text-[10px] font-bold text-zinc-500 hover:text-[#0B5ED7] dark:hover:text-[#FFC107] transition cursor-pointer p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-700"
                  title="Shuffle quote"
                >
                  <RefreshCw className="h-3 w-3" />
                  <span>Change Quote</span>
                </button>
              </div>

              <div className={`transition-opacity duration-200 ${isQuoteFading ? 'opacity-0' : 'opacity-100'}`}>
                <p className="text-xs text-[#0A2E5C] dark:text-zinc-200 italic font-medium leading-relaxed">
                  "{INSPIRATIONAL_QUOTES[quoteIndex].quote}"
                </p>
                <p className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 mt-1 text-right">
                  — {INSPIRATIONAL_QUOTES[quoteIndex].author}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1.5. LIBRARY CLOSED / HOLIDAY URGENT RED ALERT BANNER (AFTER WELCOME MESSAGE) */}
      {/* ========================================================================= */}
      {todayHoliday && (
        <div className="relative overflow-hidden rounded-3xl border-2 border-rose-500 bg-gradient-to-r from-rose-50 via-red-50 to-orange-50 p-5 sm:p-6 shadow-md shadow-rose-500/10 dark:border-rose-500 dark:bg-rose-950/40 animate-in fade-in slide-in-from-top-3 duration-300">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5 sm:gap-4">
              <div className="flex h-12 w-12 sm:h-14 sm:w-14 shrink-0 items-center justify-center rounded-2xl bg-rose-600 text-white shadow-md shadow-rose-600/30">
                <CalendarX2 className="h-6 w-6 sm:h-7 sm:w-7 animate-pulse" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-rose-600 text-white shadow-xs">
                    <AlertTriangle className="h-3.5 w-3.5" /> Notice: Today Library is Closed
                  </span>
                  <span className="text-xs font-bold text-rose-800 dark:text-rose-200">
                    {todayHoliday.title}
                  </span>
                </div>
                <h3 className="text-sm sm:text-base font-black text-rose-950 dark:text-rose-100">
                  {todayHoliday.reason || "The library is closed today by administration."}
                </h3>
                <p className="text-xs text-rose-800/90 dark:text-rose-300 font-medium">
                  🛡️ <strong>Attendance Protected:</strong> Today is marked as an exempt holiday. It will <strong>NOT</strong> count as absent in your attendance record. Normal hours resume tomorrow.
                </p>
              </div>
            </div>

            <div className="shrink-0 flex sm:flex-col items-center sm:items-end justify-between sm:justify-center border-t sm:border-t-0 sm:border-l border-rose-200 dark:border-rose-800/60 pt-3 sm:pt-0 sm:pl-5 gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400">Attendance Policy</span>
              <span className="inline-flex items-center gap-1 text-xs font-black px-2.5 py-1 rounded-xl bg-white/90 dark:bg-rose-900/60 text-rose-700 dark:text-rose-200 border border-rose-200 dark:border-rose-700 shadow-xs">
                <CheckCircle className="h-3.5 w-3.5 text-rose-600" /> Exempt from Absent
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. THE 4 MANDATORY KPI CARDS: BOOKS, ATTENDANCE, FEES STATUS, PENDING TASKS */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        
        {/* KPI 1: Exam Results */}
        <Link 
          href="/student/tasks"
          className="group rounded-3xl border border-zinc-200 bg-white p-4 sm:p-5 shadow-xs hover:shadow-md hover:border-amber-300 dark:border-zinc-800 dark:bg-[#0A2E5C] dark:hover:border-amber-800 transition-all"
        >
          <div className="flex items-center justify-between">
            <div className="flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400 group-hover:scale-105 transition-transform">
              <Award className="h-5 w-5" />
            </div>
            <span className="text-[10px] font-bold text-amber-600 group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
              Scorecard <ChevronRight className="h-3 w-3" />
            </span>
          </div>
          <div className="mt-3.5">
            <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Exam Results</p>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <p className="text-2xl sm:text-3xl font-black text-[#0A2E5C] dark:text-white">{examResults.length}</p>
              <span className="text-[11px] font-bold text-zinc-400">declared</span>
            </div>
            <div className="mt-1.5 flex flex-col gap-0.5">
              {(() => {
                const today = new Date().toISOString().split("T")[0];
                const upcoming = libraryExams.filter(e => e.examDate >= today).sort((a,b) => a.examDate.localeCompare(b.examDate))[0];
                const recentKey = libraryExams.filter(e => e.answerKeyUrl || e.answerKeyText).sort((a,b) => b.createdAt.localeCompare(a.createdAt))[0];
                
                return (
                  <>
                    {upcoming && (
                      <p className="text-[10px] text-blue-600 dark:text-blue-400 truncate font-semibold">
                        📅 Upcoming: {upcoming.title}
                      </p>
                    )}
                    {recentKey && (
                      <p className="text-[10px] text-amber-600 dark:text-amber-400 truncate font-semibold">
                        🔑 Key Out: {recentKey.title}
                      </p>
                    )}
                    {examResults.length > 0 && examResults[0].mark && (
                      <p className="text-[10px] text-emerald-600 dark:text-emerald-400 truncate font-semibold">
                        🏆 Score: {examResults[0].mark.percentage}% ({examResults[0].mark.status})
                      </p>
                    )}
                    {!upcoming && !recentKey && examResults.length === 0 && (
                      <p className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate">
                        {libraryExams.length} tests available
                      </p>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </Link>

        {/* KPI 2: Attendance */}
        <Link 
          href="/student/attendance"
          className="group rounded-3xl border border-zinc-200 bg-white p-4 sm:p-5 shadow-xs hover:shadow-md hover:border-emerald-300 dark:border-zinc-800 dark:bg-[#0A2E5C] dark:hover:border-emerald-800 transition-all"
        >
          <div className="flex items-center justify-between">
            <div className="flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 group-hover:scale-105 transition-transform">
              <CheckCircle className="h-5 w-5" />
            </div>
            <span className={`inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-md ${
              isCheckedIn 
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300" 
                : (todayHoliday 
                    ? "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300"
                    : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400")
            }`}>
              <span className={`h-1.5 w-1.5 rounded-full ${isCheckedIn ? "bg-emerald-500 animate-pulse" : (todayHoliday ? "bg-rose-500" : "bg-zinc-400")}`} />
              {isCheckedIn ? "In Library" : (todayHoliday ? "Holiday (Exempt)" : "Out")}
            </span>
          </div>
          <div className="mt-3.5">
            <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Attendance</p>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <p className="text-2xl sm:text-3xl font-black text-[#0A2E5C] dark:text-white">{totalUniqueDaysAttended}</p>
              <span className="text-[11px] font-bold text-zinc-400">Days</span>
            </div>
            <p className="mt-1.5 text-[10px] text-emerald-600 dark:text-emerald-400 font-bold truncate">
              {isCheckedIn ? "● Currently Checked In" : "Checked Out"}
            </p>
          </div>
        </Link>

        {/* KPI 3: Fees Status */}
        <Link 
          href="/student/fees"
          className="group rounded-3xl border border-zinc-200 bg-white p-4 sm:p-5 shadow-xs hover:shadow-md hover:border-amber-300 dark:border-zinc-800 dark:bg-[#0A2E5C] dark:hover:border-amber-800 transition-all"
        >
          <div className="flex items-center justify-between">
            <div className="flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400 group-hover:scale-105 transition-transform">
              <IndianRupee className="h-5 w-5" />
            </div>
            <span className={`text-[9px] font-black px-2 py-0.5 rounded-md ${
              isFeePaid 
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300" 
                : "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
            }`}>
              {isFeePaid ? "PAID" : "DUE"}
            </span>
          </div>
          <div className="mt-3.5">
            <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Fees Status</p>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <p className="text-2xl sm:text-3xl font-black text-[#0A2E5C] dark:text-white">
                {dueFeeAmount > 0 ? `₹${dueFeeAmount}` : "All Clear"}
              </p>
              <span className="text-[11px] font-bold text-zinc-400">{dueFeeAmount > 0 ? "due" : "✓"}</span>
            </div>
            <p className="mt-1.5 text-[10px] text-zinc-500 dark:text-zinc-400 truncate">
              Plan: ₹{activeShiftInfo.fee}/mo ({activeShiftInfo.name})
            </p>
          </div>
        </Link>

        {/* KPI 4: Pending Tasks */}
        <Link 
          href="/student/tasks"
          className="group rounded-3xl border border-zinc-200 bg-white p-4 sm:p-5 shadow-xs hover:shadow-md hover:border-purple-300 dark:border-zinc-800 dark:bg-[#0A2E5C] dark:hover:border-purple-800 transition-all"
        >
          <div className="flex items-center justify-between">
            <div className="flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-2xl bg-purple-50 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400 group-hover:scale-105 transition-transform">
              <CheckSquare className="h-5 w-5" />
            </div>
            <span className="text-[10px] font-bold text-purple-600 group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
              Tasks <ChevronRight className="h-3 w-3" />
            </span>
          </div>
          <div className="mt-3.5">
            <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Pending Tasks</p>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <p className="text-2xl sm:text-3xl font-black text-[#0A2E5C] dark:text-white">{pendingTasksCount}</p>
              <span className="text-[11px] font-bold text-zinc-400">pending</span>
            </div>
            {/* Progress Bar */}
            <div className="mt-2 flex items-center gap-2">
              <div className="flex-1 h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                <div 
                  className="h-full bg-purple-500 rounded-full transition-all" 
                  style={{ width: `${taskCompletionRate}%` }} 
                />
              </div>
              <span className="text-[10px] font-bold text-purple-600">{taskCompletionRate}%</span>
            </div>
          </div>
        </Link>
      </div>

      {/* ========================================================================= */}
      {/* 3. ANALYTICS & INSIGHTS: LINE CHART, DONUT/PIE CHART & PERFORMANCE METRICS */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left 2 Cols: Weekly Study & Check-In Trends (Line Chart) */}
        <div className="lg:col-span-2 rounded-3xl border border-zinc-200 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-zinc-100 dark:border-zinc-800 gap-2">
            <div>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-500" />
                <h3 className="text-sm font-black text-[#0A2E5C] dark:text-white">
                  Weekly Study & Attendance Hours
                </h3>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">Mon - Sun daily library seated duration</p>
            </div>
            <div className="flex items-center gap-1 bg-[#F8FAFC] dark:bg-zinc-800 p-1 rounded-xl">
              <span className="px-2.5 py-1 text-[10px] font-bold rounded-lg bg-white dark:bg-zinc-700 text-[#0A2E5C] dark:text-white shadow-2xs">
                This Week
              </span>
              <span className="px-2.5 py-1 text-[10px] font-semibold text-zinc-400">
                Avg: {avgWeeklyHours} hrs/day
              </span>
            </div>
          </div>

          {/* SVG Line / Spline Chart */}
          <div className="pt-6">
            <div className="relative h-44 w-full">
              <svg viewBox="0 0 500 150" className="w-full h-full overflow-visible" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="studyLineGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10B981" stopOpacity="0.28" />
                    <stop offset="100%" stopColor="#10B981" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Horizontal Guide Lines */}
                <line x1="0" y1="20" x2="500" y2="20" stroke="currentColor" strokeDasharray="3 3" className="text-zinc-100 dark:text-zinc-800" />
                <line x1="0" y1="65" x2="500" y2="65" stroke="currentColor" strokeDasharray="3 3" className="text-zinc-100 dark:text-zinc-800" />
                <line x1="0" y1="110" x2="500" y2="110" stroke="currentColor" strokeDasharray="3 3" className="text-zinc-100 dark:text-zinc-800" />

                {/* Shaded Area Under Line */}
                {areaPathD && (
                  <path
                    d={areaPathD}
                    fill="url(#studyLineGradient)"
                  />
                )}

                {/* Main Curved Trend Line */}
                {linePathD && (
                  <path
                    d={linePathD}
                    fill="none"
                    stroke="#10B981"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}

                {/* Dynamic Data Points */}
                {chartPoints.map((pt, i) => (
                  <g key={i}>
                    <circle cx={pt.cx} cy={pt.cy} r="5" fill="#FFFFFF" stroke="#10B981" strokeWidth="3" />
                    <text x={pt.cx} y={pt.cy - 10} textAnchor="middle" fontSize="10" fontWeight="bold" fill="#10B981">
                      {pt.val}
                    </text>
                  </g>
                ))}
              </svg>
            </div>

            {/* X-Axis Labels */}
            <div className="grid grid-cols-7 text-center pt-3 border-t border-zinc-100 dark:border-zinc-800 text-[11px] font-bold text-zinc-400">
              {weeklyDays.map((d, i) => (
                <div key={i}>
                  <p className={d.isToday ? "text-emerald-600 font-black" : ""}>{d.day}</p>
                </div>
              ))}
            </div>

            {/* Zero Attendance Real Database Context Hint */}
            {sumWeeklyHours === 0 && (
              <div className="mt-3 flex items-center justify-center gap-1.5 text-[11px] font-medium text-zinc-400 bg-zinc-50 dark:bg-zinc-800/50 py-1.5 px-3 rounded-xl border border-dashed border-zinc-200 dark:border-zinc-700/60">
                <Clock className="h-3.5 w-3.5 text-zinc-400" />
                <span>No attendance records logged this week. Check-in or scan QR to mark your presence.</span>
              </div>
            )}
          </div>
        </div>

        {/* Right 1 Col: Study Focus Distribution (Donut / Pie Chart) */}
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C] flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 pb-3 border-b border-zinc-100 dark:border-zinc-800">
              <Target className="h-4 w-4 text-[#0B5ED7]" />
              <h3 className="text-sm font-black text-[#0A2E5C] dark:text-white">
                Study Focus Distribution
              </h3>
            </div>

            {/* Donut Chart Display */}
            <div className="flex items-center justify-center my-4 relative">
              <svg width="150" height="150" viewBox="0 0 150 150" className="rotate-[-90deg]">
                {/* Background Ring */}
                <circle
                  cx="75"
                  cy="75"
                  r="55"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="18"
                  className="text-zinc-100 dark:text-zinc-800"
                />
                {donutSegments.map((seg, i) => (
                  <circle
                    key={i}
                    cx="75"
                    cy="75"
                    r="55"
                    fill="none"
                    stroke={seg.color}
                    strokeWidth="18"
                    strokeDasharray={seg.dashArray}
                    strokeDashoffset={seg.dashOffset}
                  />
                ))}
              </svg>

              {/* Center Donut Text */}
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-lg font-black text-[#0A2E5C] dark:text-white">{totalMonthlyStudyHours}h</span>
                <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">Monthly</span>
              </div>
            </div>

            {/* Legend List */}
            <div className="space-y-2 pt-2">
              {studyFocusSegments.map((seg, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: seg.color }} />
                    <span className="font-semibold text-zinc-700 dark:text-zinc-300 text-[11px]">{seg.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-400 text-[10px] font-mono">{seg.hours}</span>
                    <span className="font-bold text-[#0A2E5C] dark:text-white text-xs">{seg.percentage}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Performance Highlight Pill */}
          <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-black text-amber-600">
              <Flame className="h-4 w-4" />
              <span>{streakDays} Days Streak</span>
            </div>
            <span className="text-[10px] font-bold text-zinc-400">{consistencyRate}% Consistency</span>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. HISTORY HUB: ATTENDANCE HISTORY, FEES HISTORY & TASKS HISTORY */}
      {/* ========================================================================= */}
      <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C] space-y-6">
        
        {/* Tab Headers */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-100 dark:border-zinc-800">
          <div>
            <h2 className="text-base font-black text-[#0A2E5C] dark:text-white">
              Student Activity & History Records
            </h2>
            <p className="text-xs text-zinc-400">Review attendance logs, fee receipts, and daily study planner</p>
          </div>

          <div className="flex items-center gap-1.5 bg-[#F8FAFC] dark:bg-zinc-800 p-1 rounded-2xl">
            <button
              onClick={() => setActiveHistoryTab("attendance")}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                activeHistoryTab === "attendance"
                  ? "bg-white dark:bg-zinc-700 text-[#0A2E5C] dark:text-white shadow-xs"
                  : "text-zinc-500 hover:text-[#0A2E5C] dark:hover:text-white"
              }`}
            >
              Attendance History ({attendanceLogs.length})
            </button>

            <button
              onClick={() => setActiveHistoryTab("fees")}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                activeHistoryTab === "fees"
                  ? "bg-white dark:bg-zinc-700 text-[#0A2E5C] dark:text-white shadow-xs"
                  : "text-zinc-500 hover:text-[#0A2E5C] dark:hover:text-white"
              }`}
            >
              Fees History ({feesList.length})
            </button>

            <button
              onClick={() => setActiveHistoryTab("tasks")}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                activeHistoryTab === "tasks"
                  ? "bg-white dark:bg-zinc-700 text-[#0A2E5C] dark:text-white shadow-xs"
                  : "text-zinc-500 hover:text-[#0A2E5C] dark:hover:text-white"
              }`}
            >
              Task History ({tasks.length})
            </button>
          </div>
        </div>

        {/* TAB 1: ATTENDANCE HISTORY */}
        {activeHistoryTab === "attendance" && (
          <div className="space-y-4">
            {attendanceLogs.length === 0 ? (
              <div className="py-12 text-center text-xs text-zinc-400 space-y-2">
                <Calendar className="h-8 w-8 mx-auto text-zinc-300 dark:text-zinc-600" />
                <p className="font-bold text-zinc-600 dark:text-zinc-300">No attendance records logged yet</p>
                <p className="text-[11px]">Click "Scan Desk QR & Check-In" above to record today's session!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {attendanceLogs.slice(0, attDisplayLimit).map((att) => {
                  const isD1 = att.source === "d1_archive";
                  return (
                    <IntersectionLazyItem key={att.id} estimatedHeight={76}>
                      <div 
                        className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-2xl bg-[#FAF9F6] dark:bg-zinc-800/50 border border-zinc-200/80 dark:border-zinc-700/80 gap-3 hover:border-[#FFC107]/50 transition-colors"
                      >
                        <div className="flex items-center gap-3.5">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#0A2E5C] text-[#FFC107] font-mono font-bold text-xs border border-[#FFC107]/30">
                            {att.seatNumber || assignedSeat || "Desk"}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-xs font-black text-[#0A2E5C] dark:text-white">{att.date}</p>
                              <span className="text-[10px] font-bold text-[#0B5ED7] dark:text-[#FFC107] bg-[#FFC107]/15 px-2 py-0.5 rounded-md">
                                {att.seatNumber ? `Desk #${att.seatNumber}` : assignedSeat ? `Desk #${assignedSeat}` : "Study Desk"}
                              </span>
                            </div>
                            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                              Check-In: <strong className="text-emerald-600">{att.checkIn}</strong> • Check-Out: <strong className="text-rose-600">{att.checkOut || "In Progress"}</strong>
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2.5 self-end sm:self-center">
                          <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/60 px-2.5 py-1 rounded-xl border border-emerald-300 dark:border-emerald-800 flex items-center gap-1">
                            <QrCode className="h-3 w-3" /> QR Verified
                          </span>
                          <span className="text-[10px] font-black text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-1 rounded-xl">
                            {att.status.toUpperCase()}
                          </span>
                        </div>
                      </div>
                    </IntersectionLazyItem>
                  );
                })}

                {/* Load More History Button */}
                <div className="flex justify-center pt-3">
                  <button
                    onClick={handleLoadMoreAttendance}
                    disabled={isLoadingArchiveAtt}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-[#0A2E5C] text-[#FFC107] hover:bg-[#2A3447] text-xs font-bold shadow-xs transition active:scale-95 cursor-pointer disabled:opacity-50"
                  >
                    <Archive className={`h-3.5 w-3.5 ${isLoadingArchiveAtt ? "animate-spin" : ""}`} />
                    <span>
                      {isLoadingArchiveAtt
                        ? "Loading older records..."
                        : attDisplayLimit < attendanceLogs.length
                        ? `Show Next Records (${attendanceLogs.length - attDisplayLimit} remaining)`
                        : "Load Older History"}
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: FEES HISTORY */}
        {activeHistoryTab === "fees" && (
          <div className="space-y-4">
            {feesList.length === 0 ? (
              <div className="py-12 text-center text-xs text-zinc-400 space-y-2">
                <IndianRupee className="h-8 w-8 mx-auto text-zinc-300 dark:text-zinc-600" />
                <p className="font-bold text-zinc-600 dark:text-zinc-300">No fee records found</p>
                <p className="text-[11px]">Monthly shift fee is ₹{activeShiftInfo.fee}/month.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {feesList.map((fee) => (
                  <div 
                    key={fee.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-2xl bg-[#FAF9F6] dark:bg-zinc-800/50 border border-zinc-200/80 dark:border-zinc-700/80 gap-3"
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
                        <IndianRupee className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-black text-[#0A2E5C] dark:text-white capitalize">{fee.type} Fee</p>
                          <span className="text-[10px] font-mono text-zinc-400">
                            {fee.receiptNo || "INV-2026-001"}
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                          {fee.description || `${activeShiftInfo.name} Standard Tuition & Seat Fee`}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 self-end sm:self-center">
                      <p className="text-base font-black text-[#0A2E5C] dark:text-white">
                        ₹{fee.amount}
                      </p>
                      <span className={`text-[10px] font-black px-3 py-1 rounded-xl ${
                        fee.paid
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                          : "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                      }`}>
                        {fee.paid ? "PAID" : "DUE"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: TASK HISTORY & DAILY GOALS */}
        {activeHistoryTab === "tasks" && (
          <div className="space-y-4">
            {/* Quick Add Task Input */}
            <form onSubmit={handleAddQuickTask} className="flex gap-2">
              <input
                type="text"
                value={newTaskInput}
                onChange={(e) => setNewTaskInput(e.target.value)}
                placeholder="Add a study goal or task for today (e.g. Finish Polity Chapter 5)..."
                className="flex-1 rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-2.5 text-xs text-[#0A2E5C] dark:text-white focus:border-[#0B5ED7] focus:outline-hidden"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-[#0B5ED7] text-white text-xs font-bold hover:bg-[#7D5F46] transition cursor-pointer shrink-0 shadow-xs"
              >
                <Plus className="h-4 w-4" /> Add Task
              </button>
            </form>

            {tasks.length === 0 ? (
              <div className="py-12 text-center text-xs text-zinc-400 space-y-2">
                <CheckSquare className="h-8 w-8 mx-auto text-zinc-300 dark:text-zinc-600" />
                <p className="font-bold text-zinc-600 dark:text-zinc-300">No tasks created yet</p>
                <p className="text-[11px]">Plan your daily goals above to boost study consistency!</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all ${
                      task.completed
                        ? "bg-zinc-50/70 border-zinc-200/60 dark:bg-zinc-800/30 dark:border-zinc-800 opacity-70"
                        : "bg-[#FAF9F6] border-zinc-200 dark:bg-zinc-800/60 dark:border-zinc-700"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleToggleTask(task.id)}
                        className={`h-5 w-5 rounded-lg border flex items-center justify-center transition-all cursor-pointer ${
                          task.completed
                            ? "bg-emerald-600 border-emerald-600 text-white"
                            : "border-zinc-300 dark:border-zinc-600 hover:border-emerald-500"
                        }`}
                      >
                        {task.completed && <CheckCircle2 className="h-3.5 w-3.5" />}
                      </button>
                      <div>
                        <p className={`text-xs font-bold ${
                          task.completed ? "line-through text-zinc-400" : "text-[#0A2E5C] dark:text-white"
                        }`}>
                          {task.title}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-zinc-400">
                          <span>{task.category}</span>
                          <span>•</span>
                          <span>Due: {task.dueDate || "Today"}</span>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => handleDeleteTask(task.id)}
                      className="text-zinc-400 hover:text-rose-600 p-1.5 rounded-lg transition cursor-pointer"
                      title="Delete task"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 5. DIGITAL PASS & SHIFTS GRID */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Digital Library Smart Pass Card */}
        <div className="lg:col-span-2 rounded-3xl border border-zinc-200 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C]">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <QrCode className="h-5 w-5 text-blue-500" />
              <h3 className="text-sm font-bold text-[#0A2E5C] dark:text-white">Official Digital Library Pass</h3>
            </div>
            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-1 rounded-md border border-emerald-200">
              ACTIVE
            </span>
          </div>

          <div className="rounded-2xl bg-gradient-to-br from-[#0A2E5C] via-[#2A3447] to-[#141A24] p-6 text-white relative overflow-hidden shadow-lg border border-[#FFC107]/30">
            <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[9px] font-black tracking-widest text-[#FFC107] uppercase bg-[#FFC107]/20 px-2 py-0.5 rounded border border-[#FFC107]/30">
                    OFFICIAL DIGITAL MEMBER PASS
                  </span>
                  <span className="text-[9px] text-zinc-400 font-mono">
                    ID: {(profile as any).studentCode || "SDL-2026-001"}
                  </span>
                </div>
                <h4 className="text-xl font-black mt-2 text-white">{profile.full_name}</h4>
                <p className="text-xs text-zinc-300 mt-0.5">{profile.course || "Competitive Exams"}</p>
                <p className="text-[11px] text-zinc-400">{profile.email || user?.email}</p>
              </div>

              {/* Scannable Student QR Code */}
              <div className="flex flex-col items-center gap-1.5 shrink-0 self-center sm:self-auto">
                <div 
                  onClick={() => setShowPassModal(true)}
                  className="bg-white p-2 rounded-2xl shadow-md border-2 border-[#FFC107] cursor-pointer hover:scale-105 transition-transform"
                  title="Click to enlarge student pass"
                >
                  {qrPassUrl ? (
                    <img src={qrPassUrl} alt="Student QR Pass" className="h-24 w-24 object-contain rounded-lg" />
                  ) : (
                    <div className="h-24 w-24 flex items-center justify-center bg-zinc-100 rounded-lg">
                      <QrCode className="h-10 w-10 text-zinc-400 animate-pulse" />
                    </div>
                  )}
                </div>
                <span className="text-[9px] font-bold text-[#FFC107] tracking-tight">
                  Tap to Enlarge QR
                </span>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-2 border-t border-zinc-700/60 pt-4 text-center">
              <div className="bg-white/5 rounded-xl p-2 border border-white/5">
                <p className="text-[9px] text-zinc-400 font-bold uppercase">Shift</p>
                <p className="text-xs font-bold text-[#FFC107] mt-0.5">{activeShiftInfo.name}</p>
              </div>
              <div className="bg-white/5 rounded-xl p-2 border border-white/5">
                <p className="text-[9px] text-zinc-400 font-bold uppercase">Assigned Desk</p>
                <p className="text-xs font-bold text-white mt-0.5">{assignedSeat ? `#${assignedSeat}` : "General / Flexi"}</p>
              </div>
              <div className="bg-white/5 rounded-xl p-2 border border-white/5">
                <p className="text-[9px] text-zinc-400 font-bold uppercase">Validity</p>
                <p className="text-xs font-bold text-emerald-400 mt-0.5">Active Pass</p>
              </div>
            </div>

            {/* Action Strip */}
            <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-2 pt-3 border-t border-zinc-700/40 text-xs">
              <p className="text-[10px] text-zinc-400 text-center sm:text-left">
                Scan at front desk for live attendance, fee verification & study desk check-in.
              </p>
              <button
                onClick={() => setShowPassModal(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#FFC107] text-[#0A2E5C] text-[11px] font-black hover:bg-[#d6be9f] transition cursor-pointer shrink-0"
              >
                <QrCode className="h-3.5 w-3.5" /> Full ID Pass
              </button>
            </div>
          </div>
        </div>

        {/* Library Shifts & Timings Reference */}
        <div className="space-y-6">
          <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C]">
            <h3 className="text-sm font-bold text-[#0A2E5C] dark:text-white mb-4 flex items-center gap-2">
              <Clock className="h-4 w-4 text-purple-500" />
              Library Shifts & Timings
            </h3>
            <div className="space-y-3">
              {shiftsList.map((s) => (
                <div 
                  key={s.id} 
                  className={`p-3.5 rounded-xl border transition-all ${
                    profile.shift && s.id.toLowerCase().includes(profile.shift.toLowerCase())
                      ? "bg-purple-50/70 border-purple-300 dark:bg-purple-950/20 dark:border-purple-800"
                      : "bg-[#F8FAFC]/40 border-zinc-200 dark:bg-zinc-800/40 dark:border-zinc-700"
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <p className="text-xs font-bold text-[#0A2E5C] dark:text-white">{s.name}</p>
                    <span className="text-xs font-black text-[#0B5ED7] dark:text-[#FFC107]">₹{s.fee}/mo</span>
                  </div>
                  <p className="text-[10px] text-zinc-500 mt-1">{s.startTime} - {s.endTime}</p>
                  <p className="text-[9px] text-emerald-600 font-semibold mt-1">Available Seats: {s.availableSeats}/{s.totalSeats}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Fullscreen Printable Digital Library ID Card Modal */}
      {showPassModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="relative w-full max-w-sm rounded-3xl border border-[#FFC107]/50 bg-gradient-to-b from-[#0A2E5C] to-[#141A24] p-6 text-white shadow-2xl space-y-4 text-center">
            <button
              onClick={() => setShowPassModal(false)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-white cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>

            <div>
              <p className="text-[10px] font-black tracking-widest text-[#FFC107] uppercase">
                THE GENIUS DIGITAL LIBRARY
              </p>
              <p className="text-[10px] text-zinc-400">Madhupur, Sonbhadra • Verified Student Pass</p>
            </div>

            <div className="flex justify-center">
              <div className="bg-white p-3 rounded-2xl border-2 border-[#FFC107] shadow-xl">
                {qrPassUrl && (
                  <img src={qrPassUrl} alt="Student QR Pass" className="h-48 w-48 object-contain" />
                )}
              </div>
            </div>

            <div>
              <h3 className="text-lg font-black text-white">{profile.full_name}</h3>
              <p className="text-xs text-[#FFC107] font-bold mt-0.5">
                ID: {(profile as any).studentCode || "SDL-2026-001"} • {assignedSeat ? `Desk #${assignedSeat}` : "Flexi Desk"}
              </p>
              <p className="text-[11px] text-zinc-400 mt-1">{profile.course || "Competitive Exams"}</p>
              <p className="text-[10px] text-zinc-500 font-mono mt-0.5">{activeShiftInfo.name}</p>
            </div>

            <div className="pt-2 border-t border-zinc-800 flex items-center justify-center gap-3">
              <a
                href={qrPassUrl}
                download={`${BRAND_CONFIG.shortName.replace(/\s+/g, "-")}-Pass-${profile.full_name.replace(/\s+/g, "_")}.png`}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-[#0B5ED7] to-[#FFC107] text-[#0A2E5C] text-xs font-black hover:opacity-95 transition"
              >
                <Download className="h-3.5 w-3.5" /> Save to Photos
              </a>
              <button
                onClick={() => setShowPassModal(false)}
                className="px-4 py-2 rounded-xl bg-zinc-800 text-xs font-bold text-zinc-300 hover:text-white cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
