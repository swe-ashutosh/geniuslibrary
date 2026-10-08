"use client";

/**
 * [WEB • PAGE] Attendance Control
 *
 * QR scanner modal, live attendance log, manual entries and daily view.
 */
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Users,
  CheckCircle,
  XCircle,
  Clock,
  Calendar,
  QrCode,
  ClipboardEdit,
  Search,
  ListFilter,
  LayoutGrid,
  Table as TableIcon,
  List,
  Grid3X3,
  Fingerprint,
  Eye,
  Camera,
  RefreshCw,
  MapPin,
  ShieldCheck,
  User,
  Armchair,
  X,
  AlertTriangle,
  AlertCircle,
  Check,
  Ban,
  HelpCircle,
  Sparkles,
  BarChart2,
  ChevronDown,
  UserCheck,
  CheckCheck,
  CalendarDays,
  Compass,
  ArrowUpRight,
  UserX,
  History,
  ChevronRight,
  LogIn,
  LogOut,
  Timer,
  Phone,
  MessageSquare,
  MessageCircle
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  getAttendance,
  recordCheckIn,
  recordCheckOut,
  getDeskDisputes,
  resolveDeskDispute,
  getStudents,
  createNotification,
  AttendanceRecord,
  DeskDispute
} from "@/lib/api";
import { AdminStudentQrScannerModal } from "@/components/AdminStudentQrScannerModal";
import { BRAND_CONFIG, isMasterAdminEmail } from "@/lib/config";

interface StudentProfile {
  id: string;
  student_code?: string;
  full_name: string;
  email: string;
  phone: string;
  course: string;
  shift: string;
  role: string;
  status: "active" | "pending" | "suspended";
  avatar_url?: string | null;
  seat_number?: string | null;
  membership_plan?: string;
  created_at?: string;
}

interface CheckSession {
  sessionNumber: number;
  checkInTime: string;
  checkOutTime: string;
  duration: string;
  gate: string;
  method: string;
  seatNumber: string;
  status: "completed" | "in_progress" | "absent";
}

interface StudentCheckLogModalData {
  student: {
    id: string;
    full_name: string;
    email: string;
    studentCode: string;
    rollNo?: string;
    shift: string;
    seatNumber: string;
    isPresent: boolean;
  };
  date: string;
  formattedDate: string;
  sessions: CheckSession[];
  totalCheckIns: number;
  totalDuration: string;
  status: "Active" | "Present" | "Absent";
}

interface StudentHistoryDay {
  date: string;
  formattedDate: string;
  sessions: CheckSession[];
  status: "Present" | "Absent";
}

interface StudentHistoryModalData {
  student: StudentProfile & { studentCode: string; seatNumber: string };
  totalDaysPresent: number;
  totalSessions: number;
  historyDays: StudentHistoryDay[];
  isLoading: boolean;
}

export default function AdminAttendancePage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const [viewMode, setViewMode] = useState<"table" | "grid">("table");
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [disputes, setDisputes] = useState<DeskDispute[]>([]);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [studentHistoryData, setStudentHistoryData] = useState<StudentHistoryModalData | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedShiftFilter, setSelectedShiftFilter] = useState("all");
  const [selectedStatusFilter, setSelectedStatusFilter] = useState("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [isQrScannerOpen, setIsQrScannerOpen] = useState(false);
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
  const [isDateFilterOpen, setIsDateFilterOpen] = useState(false);
  const [selectedKpiShift, setSelectedKpiShift] = useState<"auto" | "standard" | "prime" | "reserved" | "night">("auto");

  // Helper to categorize shift strings into canonical shift buckets
  const getStudentShiftCategory = (shiftStr: string = ""): "standard" | "prime" | "reserved" | "night" => {
    const s = (shiftStr || "").toLowerCase();
    if (s.includes("night") || s.includes("ultra")) {
      return "night";
    }
    if (s.includes("reserve") || s.includes("mini") || s.includes("big") || s.includes("locker") || s.includes("elite")) {
      return "reserved";
    }
    if ((s.includes("6") || s.includes("prime") || s.includes("pro") || s.includes("afternoon") || s.includes("evening")) && !s.includes("big")) {
      return "prime";
    }
    if (s.includes("3") || s.includes("standard") || s.includes("morning") || s.includes("noon")) {
      return "standard";
    }
    return "standard";
  };

  // Selected date filter (Defaults to Today YYYY-MM-DD)
  const todayStr = new Date().toISOString().split("T")[0];
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdayStr = yesterdayDate.toISOString().split("T")[0];

  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(todayStr);

  // Check-In Log Modal state
  const [selectedStudentForLog, setSelectedStudentForLog] = useState<StudentCheckLogModalData | null>(null);

  // Selected desk photo for verification modal
  const [selectedDeskPhoto, setSelectedDeskPhoto] = useState<{
    url: string;
    studentName: string;
    studentEmail: string;
    seatNumber: string;
    checkInTime: string;
    date: string;
  } | null>(null);

  // Manual Attendance State
  const [manualForm, setManualForm] = useState({
    studentId: "",
    seatNumber: "A-01",
    actionType: "check_in" as "check_in" | "check_out",
  });

  const isToday = startDate === todayStr && endDate === todayStr;
  const isYesterday = startDate === yesterdayStr && endDate === yesterdayStr;

  const formatDisplayDate = (start: string, end: string) => {
    if (start === end) {
      try {
        const d = new Date(start + "T12:00:00");
        return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
      } catch {
        return start;
      }
    } else {
      try {
        const d1 = new Date(start + "T12:00:00");
        const d2 = new Date(end + "T12:00:00");
        return `${d1.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${d2.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
      } catch {
        return `${start} to ${end}`;
      }
    }
  };

  const formatShortDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr + "T12:00:00");
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    } catch {
      return dateStr;
    }
  };

  const loadData = async () => {
    setIsLoading(true);
    try {
      const supabase = createClient();
      const [profilesRes, attData, disputesData] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at", { ascending: false }),
        getAttendance({ startDate, endDate }),
        getDeskDisputes(),
      ]);

      const studentMap = new Map<string, StudentProfile>();

      // Supabase profiles (Sole Primary Database)
      if (profilesRes.data && Array.isArray(profilesRes.data)) {
        for (const p of profilesRes.data) {
          const hasPhone = p.phone && String(p.phone).trim().length > 0;
          if (p.role !== "admin" && !isMasterAdminEmail(p.email) && hasPhone) {
            const key = p.email ? p.email.toLowerCase() : p.id;
            studentMap.set(key, {
              ...p,
              student_code: p.student_code || p.studentCode || null,
              shift: p.shift || "Morning Shift",
              seat_number: p.seat_number || null,
              status: p.status || "pending",
              membership_plan: p.membership_plan || "General",
            });
          }
        }
      }

      setStudents(Array.from(studentMap.values()));
      setAttendanceRecords(attData || []);
      setDisputes(disputesData || []);
    } catch (e) {
      console.error("Error loading attendance data:", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    // Supabase Realtime — DEBOUNCED to prevent API flood
    const supabase = createClient();
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel("admin_attendance_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles" },
        () => {
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            if (document.visibilityState === "visible") {
              loadData();
            }
          }, 8000);
        }
      )
      .subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [startDate, endDate]);

  // Map students with attendance records for the SELECTED DATE or DATE RANGE
  const studentAttendanceList = students.map((std, idx) => {
    const isSingleDate = startDate === endDate;
    const records = attendanceRecords.filter((a) => {
      if (!a.date) return false;
      const matchStudent = a.studentId === std.id || a.studentName?.toLowerCase() === std.full_name?.toLowerCase();
      if (!matchStudent) return false;
      if (isSingleDate) return a.date === startDate;
      return a.date >= startDate && a.date <= endDate;
    });

    const studentCode = std.student_code || `SDL-2026-${String(idx + 1).padStart(3, "0")}`;

    // Pure real data: NO demo fallback!
    let sessions: CheckSession[] = [];
    let isPresent = false;
    let isCompleted = false;
    let firstCheckIn = "—";
    let lastCheckOut = "—";
    let seatNumber = std.seat_number || "—";
    let photoUrl = null;
    let attendanceRecordId = null;

    if (records.length > 0) {
      // Map all check-in records for that student on this date into individual sessions
      sessions = records.map((rec, sessionIdx) => {
        const hasActiveSession = rec.checkOut === "In Progress" || !rec.checkOut || rec.checkOut === "—";
        return {
          sessionNumber: sessionIdx + 1,
          checkInTime: rec.checkIn || "—",
          checkOutTime: hasActiveSession ? "Session Ongoing" : (rec.checkOut || "—"),
          duration: hasActiveSession ? "Active" : "Completed",
          gate: "Front Terminal",
          method: rec.seatNumber && rec.seatNumber !== "—" ? `Smart Desk QR Scan (#${rec.seatNumber})` : "Manual / Staff Entry",
          seatNumber: rec.seatNumber || seatNumber,
          status: hasActiveSession ? "in_progress" : "completed",
        };
      });

      const latestRecord = records[0];
      attendanceRecordId = latestRecord.id;
      photoUrl = latestRecord.photoUrl || null;
      seatNumber = latestRecord.seatNumber || seatNumber;

      // Earliest check-in of the day
      firstCheckIn = sessions[0]?.checkInTime || "—";

      // Last check-out of the day:
      const activeSession = sessions.find((s) => s.status === "in_progress");
      if (activeSession) {
        isPresent = true;
        isCompleted = false;
        lastCheckOut = "In Progress";
      } else {
        isPresent = false;
        isCompleted = true;
        const lastSession = sessions[sessions.length - 1];
        lastCheckOut = lastSession?.checkOutTime || "—";
      }
    }

    // Accurate count of check-in events (NOT multiplied by 2)
    const checkCount = sessions.length;
    const totalDuration = isPresent ? "In Progress" : isCompleted ? `${sessions.length} Session${sessions.length > 1 ? "s" : ""}` : "—";

    return {
      ...std,
      studentCode,
      rollNo: studentCode,
      isPresent,
      isCompleted,
      firstCheckIn,
      lastCheckOut,
      checkInTime: firstCheckIn,
      checkOutTime: lastCheckOut,
      seatNumber,
      photoUrl,
      attendanceRecordId,
      sessions,
      checkCount,
      totalDuration,
    };
  });

  const filteredStudents = studentAttendanceList.filter((std) => {
    const matchesSearch =
      std.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      std.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      std.studentCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (std.rollNo && std.rollNo.toLowerCase().includes(searchQuery.toLowerCase())) ||
      std.seatNumber.toLowerCase().includes(searchQuery.toLowerCase());

    const stdCategory = getStudentShiftCategory(std.shift);
    const matchesShift =
      selectedShiftFilter === "all" ||
      selectedShiftFilter === stdCategory ||
      std.shift.toLowerCase().includes(selectedShiftFilter.toLowerCase());

    const matchesStatus =
      selectedStatusFilter === "all" ||
      (selectedStatusFilter === "present" && (std.isPresent || std.isCompleted)) ||
      (selectedStatusFilter === "absent" && !std.isPresent && !std.isCompleted) ||
      (selectedStatusFilter === "completed" && std.isCompleted);

    return matchesSearch && matchesShift && matchesStatus;
  });

  // KPI Calculations for Selected Date / Range
  const totalStudents = studentAttendanceList.length;
  const presentCount = studentAttendanceList.filter(s => s.isPresent || s.isCompleted).length;
  const absentCount = totalStudents - presentCount;
  const presentPct = totalStudents > 0 ? ((presentCount / totalStudents) * 100).toFixed(1) : "0.0";
  const absentPct = totalStudents > 0 ? ((absentCount / totalStudents) * 100).toFixed(1) : "0.0";

  // Yesterday Absent Students Calculation
  const yesterdayObj = new Date(Date.now() - 86400000);
  const yesterdayDateStr = yesterdayObj.toISOString().split("T")[0];
  const yesterdayLogs = attendanceRecords.filter((r) => r.date === yesterdayDateStr);
  const yesterdayPresentStudentIds = new Set(yesterdayLogs.map((r) => r.studentId));
  const yesterdayPresentCount = students.filter(
    (s) =>
      yesterdayPresentStudentIds.has(s.id) ||
      (s.email && yesterdayLogs.some((r) => r.studentId === s.email)) ||
      (s.student_code && yesterdayLogs.some((r) => r.studentId === s.student_code))
  ).length;

  // Only count students who were already enrolled before yesterday (or who attended yesterday).
  // Students who just registered yesterday or today are new admissions and not marked absent.
  const yesterdayExpectedStudents = students.filter((s) => {
    const isPresent =
      yesterdayPresentStudentIds.has(s.id) ||
      (s.email && yesterdayLogs.some((r) => r.studentId === s.email)) ||
      (s.student_code && yesterdayLogs.some((r) => r.studentId === s.student_code));
    if (isPresent) return true;

    const regDate = s.created_at || (s as any).joined_at || (s as any).admission_date;
    if (regDate) {
      const regDateStr = new Date(regDate).toISOString().split("T")[0];
      if (regDateStr >= yesterdayDateStr) {
        return false;
      }
    }
    return true;
  });

  const yesterdayAbsentCount = Math.max(0, yesterdayExpectedStudents.length - yesterdayPresentCount);
  const yesterdayAbsentPct = yesterdayExpectedStudents.length > 0
    ? ((yesterdayAbsentCount / yesterdayExpectedStudents.length) * 100).toFixed(1)
    : "0.0";

  // Shift Stats using canonical classifier
  const standardStudents = studentAttendanceList.filter(s => getStudentShiftCategory(s.shift) === "standard");
  const standardPresent = standardStudents.filter(s => s.isPresent || s.isCompleted).length;

  const primeStudents = studentAttendanceList.filter(s => getStudentShiftCategory(s.shift) === "prime");
  const primePresent = primeStudents.filter(s => s.isPresent || s.isCompleted).length;

  const reservedStudents = studentAttendanceList.filter(s => getStudentShiftCategory(s.shift) === "reserved");
  const reservedPresent = reservedStudents.filter(s => s.isPresent || s.isCompleted).length;

  const nightStudents = studentAttendanceList.filter(s => getStudentShiftCategory(s.shift) === "night");
  const nightPresent = nightStudents.filter(s => s.isPresent || s.isCompleted).length;

  // Real-time dynamic shift detector based on current hour & minute
  const getActiveShiftInfo = () => {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    let autoShiftId: "standard" | "prime" | "reserved" | "night" = "standard";
    if (currentMinutes >= 1320 || currentMinutes < 360) {
      // 10:00 PM - 06:00 AM: Night Shift Ultra
      autoShiftId = "night";
    } else if (currentMinutes >= 360 && currentMinutes < 780) {
      // 06:00 AM - 01:00 PM: Standard 3 Hours Pass
      autoShiftId = "standard";
    } else if (currentMinutes >= 780 && currentMinutes < 1200) {
      // 01:00 PM - 08:00 PM: Pro / Prime 6 Hours Pass
      autoShiftId = "prime";
    } else {
      // 08:00 PM - 10:00 PM: Reserved Seating & Evening Pass
      autoShiftId = "reserved";
    }

    const shiftDefinitions = {
      standard: {
        id: "standard" as const,
        name: "Standard (3 Hours Pass)",
        timeRange: "Flexible 24/7 (Any 3 Hours)",
        badge: "3 Hrs • 24/7",
        students: standardStudents,
        present: standardPresent,
        nextShiftId: "prime" as const,
      },
      prime: {
        id: "prime" as const,
        name: "Pro / Prime (6 Hours Pass)",
        timeRange: "Flexible 24/7 (Any 6 Hours)",
        badge: "6 Hrs • 24/7",
        students: primeStudents,
        present: primePresent,
        nextShiftId: "reserved" as const,
      },
      reserved: {
        id: "reserved" as const,
        name: "Reserved Dedicated Desks",
        timeRange: "24/7 Dedicated (Mini / Big / Locker)",
        badge: "24/7 Fixed",
        students: reservedStudents,
        present: reservedPresent,
        nextShiftId: "night" as const,
      },
      night: {
        id: "night" as const,
        name: "Night Shift Ultra",
        timeRange: "10:00 PM - 06:00 AM (8 Hours)",
        badge: "10 PM - 6 AM",
        students: nightStudents,
        present: nightPresent,
        nextShiftId: "standard" as const,
      },
    };

    const activeId = selectedKpiShift === "auto" ? autoShiftId : selectedKpiShift;
    const current = shiftDefinitions[activeId];
    const next = shiftDefinitions[shiftDefinitions[autoShiftId].nextShiftId];

    return {
      current,
      next,
      autoShiftId,
      isAuto: selectedKpiShift === "auto",
      isLiveNow: activeId === autoShiftId,
    };
  };

  const shiftKpi = getActiveShiftInfo();

  // Real dynamic Avg Seating Hours from sessions
  let totalMinutes = 0;
  let completedSessionsCount = 0;

  studentAttendanceList.forEach(std => {
    std.sessions.forEach(sess => {
      if (sess.checkInTime && sess.checkOutTime && sess.checkOutTime !== "Session Ongoing" && sess.checkOutTime !== "—") {
        const parseTime = (t: string) => {
          const match = t.match(/(\d+):(\d+)\s*(am|pm)?/i);
          if (!match) return null;
          let h = parseInt(match[1], 10);
          const m = parseInt(match[2], 10);
          const mer = match[3]?.toLowerCase();
          if (mer === 'pm' && h < 12) h += 12;
          if (mer === 'am' && h === 12) h = 0;
          return h * 60 + m;
        };
        const inM = parseTime(sess.checkInTime);
        const outM = parseTime(sess.checkOutTime);
        if (inM !== null && outM !== null && outM >= inM) {
          totalMinutes += (outM - inM);
          completedSessionsCount++;
        }
      }
    });
  });

  const avgSeatingHourVal = completedSessionsCount > 0 ? (totalMinutes / completedSessionsCount / 60).toFixed(1) : "0.0";

  // Handle Manual Attendance Submission (Enforce 1 mark per date)
  const handleManualSubmit = async () => {
    if (!manualForm.studentId) return;

    const targetStudent = students.find(s => s.id === manualForm.studentId);
    if (!targetStudent) return;

    try {
      if (manualForm.actionType === "check_in") {
        await recordCheckIn({
          studentId: targetStudent.id,
          studentName: targetStudent.full_name,
          seatNumber: manualForm.seatNumber,
          shiftName: targetStudent.shift || "Morning",
        });
        setActionNotice(`Manually checked in ${targetStudent.full_name} to Desk #${manualForm.seatNumber}`);
      } else {
        await recordCheckOut(targetStudent.id);
        setActionNotice(`Manually checked out ${targetStudent.full_name}`);
      }
      setIsManualModalOpen(false);
      loadData();
      setTimeout(() => setActionNotice(null), 4000);
    } catch (e: any) {
      console.error(e);
    }
  };

  // Quick Toggle Attendance (Enforce exactly 1 attendance mark session per date)
  const handleToggleAttendance = async (student: typeof studentAttendanceList[0]) => {
    if (student.isCompleted) {
      setActionNotice(`Attendance for ${student.full_name} is already finalized for ${formatDisplayDate(startDate, endDate)}.`);
      setTimeout(() => setActionNotice(null), 3500);
      return;
    }

    try {
      if (student.isPresent) {
        // Currently present/in-progress -> Check Out
        await recordCheckOut(student.id);
        setActionNotice(`Checked out ${student.full_name}. Attendance completed for today.`);
      } else {
        // Absent -> Mark Present (Check In) once
        await recordCheckIn({
          studentId: student.id,
          studentName: student.full_name,
          seatNumber: student.seatNumber !== "—" ? student.seatNumber : "A-01",
          shiftName: student.shift || "Morning",
        });
        setActionNotice(`Marked present: ${student.full_name}`);
      }
      loadData();
      setTimeout(() => setActionNotice(null), 3500);
    } catch (e: any) {
      console.error(e);
    }
  };

  // Full Attendance History Handler (Queries Supabase for student's complete record history)
  const handleOpenFullStudentHistory = async (std: typeof studentAttendanceList[0]) => {
    setStudentHistoryData({
      student: {
        ...std,
        studentCode: std.studentCode,
        seatNumber: std.seatNumber,
      },
      totalDaysPresent: 0,
      totalSessions: 0,
      historyDays: [],
      isLoading: true,
    });

    try {
      const supabase = createClient();
      const { data: records, error } = await supabase
        .from("attendance")
        .select("*")
        .or(`student_id.eq.${std.id},student_name.ilike.${std.full_name}`)
        .order("date", { ascending: false });

      const allRecords = (records || []) as any[];
      const dateMap = new Map<string, CheckSession[]>();

      for (const rec of allRecords) {
        if (!rec.date) continue;
        const hasActive = rec.check_out === "In Progress" || !rec.check_out || rec.check_out === "—";
        const sess: CheckSession = {
          sessionNumber: 0,
          checkInTime: rec.check_in || "—",
          checkOutTime: hasActive ? "Session Ongoing" : (rec.check_out || "—"),
          duration: hasActive ? "Active" : "Completed",
          gate: "Front Terminal",
          method: rec.seat_number ? `Smart Desk QR Scan (#${rec.seat_number})` : "Manual / Staff Entry",
          seatNumber: rec.seat_number || std.seatNumber || "—",
          status: hasActive ? "in_progress" : "completed",
        };

        if (!dateMap.has(rec.date)) {
          dateMap.set(rec.date, []);
        }
        dateMap.get(rec.date)!.push(sess);
      }

      // Also ensure current active sessions from attendanceRecords are reflected
      const currentStudentRecords = attendanceRecords.filter(
        (a) => (a.studentId === std.id || a.studentName?.toLowerCase() === std.full_name.toLowerCase()) && a.date
      );
      for (const rec of currentStudentRecords) {
        if (!rec.date) continue;
        if (!dateMap.has(rec.date)) {
          const hasActive = rec.checkOut === "In Progress" || !rec.checkOut || rec.checkOut === "—";
          dateMap.set(rec.date, [{
            sessionNumber: 1,
            checkInTime: rec.checkIn || "—",
            checkOutTime: hasActive ? "Session Ongoing" : (rec.checkOut || "—"),
            duration: hasActive ? "Active" : "Completed",
            gate: "Front Terminal",
            method: rec.seatNumber ? `Smart Desk QR Scan (#${rec.seatNumber})` : "Manual / Staff Entry",
            seatNumber: rec.seatNumber || std.seatNumber || "—",
            status: hasActive ? "in_progress" : "completed",
          }]);
        }
      }

      const historyDays: StudentHistoryDay[] = [];
      let totalSessions = 0;

      const sortedDates = Array.from(dateMap.keys()).sort((a, b) => b.localeCompare(a));
      for (const d of sortedDates) {
        const daySessions = dateMap.get(d)!.map((s, idx) => ({
          ...s,
          sessionNumber: idx + 1,
        }));
        totalSessions += daySessions.length;
        historyDays.push({
          date: d,
          formattedDate: new Date(d).toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric",
          }),
          sessions: daySessions,
          status: "Present",
        });
      }

      setStudentHistoryData({
        student: {
          ...std,
          studentCode: std.studentCode,
          seatNumber: std.seatNumber,
        },
        totalDaysPresent: historyDays.length,
        totalSessions,
        historyDays,
        isLoading: false,
      });
    } catch (err) {
      console.error("Error fetching full student attendance history:", err);
      setStudentHistoryData((prev) => (prev ? { ...prev, isLoading: false } : null));
    }
  };

  // Day's Check-In Log Breakdown Handler
  const handleOpenStudentLog = (std: typeof studentAttendanceList[0]) => {
    setSelectedStudentForLog({
      student: {
        id: std.id,
        full_name: std.full_name,
        email: std.email,
        studentCode: std.studentCode,
        rollNo: std.studentCode,
        shift: std.shift,
        seatNumber: std.seatNumber,
        isPresent: std.isPresent || std.isCompleted,
      },
      date: startDate === endDate ? startDate : `${startDate} to ${endDate}`,
      formattedDate: formatDisplayDate(startDate, endDate),
      sessions: std.sessions,
      totalCheckIns: std.checkCount,
      totalDuration: std.totalDuration,
      status: std.isPresent ? "Active" : std.isCompleted ? "Present" : "Absent",
    });
  };

  const getShiftDisplay = (shift?: string) => {
    if (!shift) return { name: "Standard (3 Hours Pass)", timing: "Flexible 24/7" };
    const s = shift.toLowerCase();
    
    // Check if shift string already has format "Name (Time - Time)"
    const match = shift.match(/^(.*?)\s*\((.*?)\)$/);
    if (match) {
      return { name: match[1].trim(), timing: match[2].trim() };
    }

    if (s.includes("3") || s.includes("standard")) {
      return { name: "Standard (3 Hours Pass)", timing: "Flexible 24/7 (Any 3 Hrs)" };
    }
    if ((s.includes("6") || s.includes("prime") || s.includes("pro")) && !s.includes("big")) {
      return { name: "Pro / Prime (6 Hours Pass)", timing: "Flexible 24/7 (Any 6 Hrs)" };
    }
    if (s.includes("mini") || (s.includes("reserve") && !s.includes("big") && !s.includes("locker"))) {
      return { name: "Elite / Reserve Mini", timing: "24/7 Fixed Dedicated Desk" };
    }
    if (s.includes("big")) {
      return { name: "Prime / Reserve Big", timing: "24/7 Premium Large Desk" };
    }
    if (s.includes("locker")) {
      return { name: "Max / Reserve Locker", timing: "24/7 Desk + Personal Locker" };
    }
    if (s.includes("night") || s.includes("ultra")) {
      return { name: "Night Shift Ultra", timing: "10:00 PM – 06:00 AM" };
    }
    if (s.includes("morning")) {
      return { name: "Morning Shift (Legacy)", timing: "06:00 AM - 12:00 PM" };
    }
    if (s.includes("afternoon") || s.includes("noon")) {
      return { name: "Afternoon Shift (Legacy)", timing: "12:00 PM - 06:00 PM" };
    }
    if (s.includes("evening")) {
      return { name: "Evening Shift (Legacy)", timing: "06:00 PM - 10:00 PM" };
    }
    if (s.includes("full") || s.includes("24")) {
      return { name: "Full Day Access", timing: "24/7 Open Access" };
    }
    return { name: shift, timing: "24/7 Flexible Access" };
  };

  const getInitials = (name: string) => {
    const parts = name.trim().split(" ");
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.slice(0, 2).toUpperCase() || "ST";
  };

  return (
    <div className="space-y-6 pb-12">

      {/* Toast Notice */}
      {actionNotice && (
        <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center justify-between shadow-xs animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>{actionNotice}</span>
          </div>
          <button onClick={() => setActionNotice(null)} className="text-emerald-600 hover:text-emerald-900">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. TOP HEADER SECTION */}
      {/* ========================================================================= */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#FFC107]/20 text-[#0B5ED7] dark:bg-white/10 dark:text-[#FFC107] shadow-2xs">
            <Users className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-[#0A2E5C] dark:text-white tracking-tight">
              Attendance Management
            </h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              Track daily student check-ins, check-outs, attendance history, and seating hours.
            </p>
          </div>
        </div>

        {/* Right Header Controls */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Scan QR Attendance Button */}
          <button
            onClick={() => setIsQrScannerOpen(true)}
            className="inline-flex items-center gap-2 rounded-2xl border border-[#FFC107]/50 bg-linear-to-r from-[#0A2E5C] to-[#2B3548] px-4 py-2 text-xs font-black text-[#FFC107] hover:text-white shadow-md hover:border-[#FFC107] transition cursor-pointer active:scale-95"
          >
            <QrCode className="h-4 w-4 text-[#FFC107]" />
            <span>Scan Student Pass</span>
          </button>

          {/* Manual Entry Button */}
          <button
            onClick={() => setIsManualModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-2xl bg-linear-to-r from-[#0B5ED7] to-[#FFC107] px-4 py-2 text-xs font-black text-[#0A2E5C] shadow-md shadow-[#0B5ED7]/20 hover:opacity-95 transition cursor-pointer active:scale-95"
          >
            <ClipboardEdit className="h-4 w-4 text-[#0A2E5C]" />
            <span>Manual Entry</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. TOP KPI METRIC CARDS (2-IN-A-ROW MOBILE GRID) */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-6">

        {/* Card 1: Total Students */}
        <div className="rounded-3xl border border-blue-200/80 bg-linear-to-b from-blue-50/50 to-white p-3.5 sm:p-5 shadow-xs dark:border-blue-900/40 dark:from-blue-950/20 dark:to-[#0A2E5C]">
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <div className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400">
              <Users className="h-4 w-4" />
            </div>
            <span className="rounded-full bg-blue-100/70 px-2 py-0.5 text-[9px] sm:text-[10px] font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
              All
            </span>
          </div>
          <p className="text-[10px] sm:text-[11px] font-bold text-zinc-500 dark:text-zinc-400">Total Students</p>
          <div className="mt-1 flex items-baseline gap-1 sm:gap-2">
            <span className="text-xl sm:text-3xl font-black text-[#0A2E5C] dark:text-white">{totalStudents}</span>
          </div>
          <p className="mt-1 sm:mt-2 text-[9px] sm:text-[10px] font-bold text-emerald-600 flex items-center gap-0.5 truncate">
            <span>↑ Registered Students</span>
          </p>
        </div>

        {/* Card 2: Present On Date */}
        <div className="rounded-3xl border border-emerald-200/80 bg-linear-to-b from-emerald-50/50 to-white p-3.5 sm:p-5 shadow-xs dark:border-emerald-900/40 dark:from-emerald-950/20 dark:to-[#0A2E5C]">
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <div className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400">
              <CheckCircle className="h-4 w-4" />
            </div>
            <span className="rounded-full bg-emerald-100/70 px-2 py-0.5 text-[9px] sm:text-[10px] font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              {isToday ? "Today" : "Date"}
            </span>
          </div>
          <p className="text-[10px] sm:text-[11px] font-bold text-zinc-500 dark:text-zinc-400">Present {isToday ? "Today" : isYesterday ? "Yesterday" : "on Date"}</p>
          <div className="mt-1 flex items-baseline gap-1 sm:gap-2">
            <span className="text-xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400">{presentCount}</span>
          </div>
          <p className="mt-1 sm:mt-2 text-[9px] sm:text-[10px] font-bold text-emerald-600 truncate">
            {presentPct}% Attendance
          </p>
        </div>

        {/* Card 3: Absent On Date */}
        <div className="rounded-3xl border border-rose-200/80 bg-linear-to-b from-rose-50/50 to-white p-3.5 sm:p-5 shadow-xs dark:border-rose-900/40 dark:from-rose-950/20 dark:to-[#0A2E5C]">
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <div className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-400">
              <XCircle className="h-4 w-4" />
            </div>
            <span className="rounded-full bg-rose-100/70 px-2 py-0.5 text-[9px] sm:text-[10px] font-bold text-rose-700 dark:bg-rose-950 dark:text-rose-300">
              {isToday ? "Today" : "Date"}
            </span>
          </div>
          <p className="text-[10px] sm:text-[11px] font-bold text-zinc-500 dark:text-zinc-400">Absent {isToday ? "Today" : isYesterday ? "Yesterday" : "on Date"}</p>
          <div className="mt-1 flex items-baseline gap-1 sm:gap-2">
            <span className="text-xl sm:text-3xl font-black text-rose-600 dark:text-rose-400">{absentCount}</span>
          </div>
          <p className="mt-1 sm:mt-2 text-[9px] sm:text-[10px] font-bold text-rose-600 truncate">
            {absentPct}% Absent
          </p>
        </div>

        {/* Card 4: Current / Active Shift (Directly beside Absent Today) */}
        <div className="rounded-3xl border border-amber-200/80 bg-linear-to-b from-amber-50/50 to-white p-3.5 sm:p-5 shadow-xs dark:border-amber-900/40 dark:from-amber-950/20 dark:to-[#0A2E5C]">
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <div className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400">
              <Compass className="h-4 w-4" />
            </div>
            <div className="flex items-center gap-1.5">
              {shiftKpi.isLiveNow && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100/90 px-1.5 py-0.5 text-[8px] sm:text-[9px] font-black text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                  </span>
                  Live
                </span>
              )}
              <span className="rounded-full bg-amber-100/70 px-2 py-0.5 text-[9px] sm:text-[10px] font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                {shiftKpi.current.badge}
              </span>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-[10px] sm:text-[11px] font-bold text-zinc-500 dark:text-zinc-400 truncate">
              {shiftKpi.current.name}
            </p>
            <select
              value={selectedKpiShift}
              onChange={(e) => setSelectedKpiShift(e.target.value as any)}
              className="text-[9px] font-bold bg-transparent text-amber-800 dark:text-amber-400 border border-amber-300/60 dark:border-amber-800/60 rounded-md px-1 py-0.5 cursor-pointer outline-hidden hover:bg-amber-100/40"
              title="Change displayed shift"
            >
              <option value="auto">● Live (Auto)</option>
              <option value="standard">Standard (3H)</option>
              <option value="prime">Prime (6H)</option>
              <option value="reserved">Reserved (24/7)</option>
              <option value="night">Night Ultra</option>
            </select>
          </div>
          <div className="mt-1 flex items-baseline gap-1 sm:gap-2">
            <span className="text-xl sm:text-3xl font-black text-[#0A2E5C] dark:text-white">
              {shiftKpi.current.present} <span className="text-xs sm:text-base text-zinc-400 font-normal">/ {shiftKpi.current.students.length}</span>
            </span>
          </div>
          <p className="mt-1 sm:mt-2 text-[9px] sm:text-[10px] font-bold text-amber-700 dark:text-amber-400 truncate">
            {shiftKpi.current.timeRange}
          </p>
        </div>

        {/* Card 5: Yesterday Absent Students */}
        <div className="rounded-3xl border border-red-200/80 bg-linear-to-b from-red-50/50 to-white p-3.5 sm:p-5 shadow-xs dark:border-red-900/40 dark:from-red-950/20 dark:to-[#0A2E5C]">
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <div className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400">
              <UserX className="h-4 w-4" />
            </div>
            <span className="rounded-full bg-red-100/70 px-2 py-0.5 text-[9px] sm:text-[10px] font-bold text-red-700 dark:bg-red-950 dark:text-red-300">
              Yesterday
            </span>
          </div>
          <p className="text-[10px] sm:text-[11px] font-bold text-zinc-500 dark:text-zinc-400">Yesterday Absent</p>
          <div className="mt-1 flex items-baseline gap-1 sm:gap-2">
            <span className="text-xl sm:text-3xl font-black text-red-600 dark:text-red-400">{yesterdayAbsentCount}</span>
          </div>
          <p className="mt-1 sm:mt-2 text-[9px] sm:text-[10px] font-bold text-red-600 truncate">
            {yesterdayAbsentPct}% Absent Yesterday
          </p>
        </div>

        {/* Card 6: Avg. Seating Hour */}
        <div className="rounded-3xl border border-purple-200/80 bg-linear-to-b from-purple-50/50 to-white p-3.5 sm:p-5 shadow-xs dark:border-purple-900/40 dark:from-purple-950/20 dark:to-[#0A2E5C]">
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <div className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400">
              <CalendarDays className="h-4 w-4" />
            </div>
            <span className="rounded-full bg-purple-100/70 px-2 py-0.5 text-[9px] sm:text-[10px] font-bold text-purple-700 dark:bg-purple-950 dark:text-purple-300">
              Avg
            </span>
          </div>
          <p className="text-[10px] sm:text-[11px] font-bold text-zinc-500 dark:text-zinc-400">Avg. Seating Hour</p>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-xl sm:text-3xl font-black text-[#0A2E5C] dark:text-white">{avgSeatingHourVal}</span>
            <span className="text-[10px] sm:text-xs text-zinc-500 font-bold">hrs</span>
          </div>
          <p className="mt-1 sm:mt-2 text-[9px] sm:text-[10px] font-bold text-zinc-500 dark:text-zinc-400 flex items-center gap-0.5 truncate">
            <span>{completedSessionsCount > 0 ? `${completedSessionsCount} sessions completed` : "No sessions recorded"}</span>
          </p>
        </div>

      </div>

      {/* ========================================================================= */}
      {/* 3. MAIN SECTION: FULL-WIDTH ATTENDANCE TABLE & GRID                        */}
      {/* ========================================================================= */}
      <div className="w-full rounded-3xl border border-[#E5E7EB] bg-white p-5 sm:p-6 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C] flex flex-col justify-between space-y-4">

          <div>
            {/* Table Header Bar (REDESIGNED: Searchbar, Filter Icon, Calendar Icon, Grid/Table Switcher) */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-zinc-100 dark:border-zinc-800">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC]/60 dark:bg-zinc-800 dark:border-zinc-700 text-[#0B5ED7]">
                  <Calendar className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-black text-[#0A2E5C] dark:text-white">
                    {startDate === endDate
                      ? (isToday ? "Today's Attendance" : isYesterday ? "Yesterday's Attendance" : "Attendance Overview")
                      : "Attendance Overview"}
                  </h2>
                  <p className="text-[11px] text-zinc-400">
                    Student attendance for {formatDisplayDate(startDate, endDate)}
                  </p>
                </div>
              </div>

              {/* Action Tools: Search, Filter Icon, Calendar Date Filter Icon, Table/Grid Switcher */}
              <div className="flex flex-wrap items-center gap-2">
                {/* 1. Search Bar */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -trangray-y-1/2 h-3.5 w-3.5 text-zinc-400" />
                  <input
                    type="text"
                    placeholder="Search student |"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-36 sm:w-44 rounded-xl border border-zinc-200 bg-[#F3F4F6]/60 py-1.5 pl-8 pr-2.5 text-xs text-[#0A2E5C] placeholder:text-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white font-medium"
                  />
                </div>

                {/* 2. Filter Icon Popover (Shift & Status Filter) */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setIsFilterDropdownOpen(!isFilterDropdownOpen);
                      setIsDateFilterOpen(false);
                    }}
                    className={`p-2 rounded-xl border transition cursor-pointer flex items-center gap-1.5 text-xs font-bold ${
                      selectedShiftFilter !== "all" || selectedStatusFilter !== "all"
                        ? "border-[#0B5ED7] bg-[#0B5ED7]/10 text-[#0B5ED7] dark:border-[#FFC107] dark:text-[#FFC107]"
                        : "border-zinc-200 bg-white text-zinc-600 hover:text-black dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                    }`}
                    title="Filter by Shift or Status"
                  >
                    <ListFilter className="h-4 w-4" />
                    <span className="hidden md:inline">Filter</span>
                    {(selectedShiftFilter !== "all" || selectedStatusFilter !== "all") && (
                      <span className="h-1.5 w-1.5 rounded-full bg-[#0B5ED7]" />
                    )}
                  </button>

                  {/* Filter Dropdown */}
                  {isFilterDropdownOpen && (
                    <div className="absolute right-0 top-full mt-2 w-56 rounded-2xl border border-zinc-200 bg-white p-3.5 shadow-xl dark:border-zinc-700 dark:bg-[#0A2E5C] z-30 space-y-3 animate-fadeIn">
                      <div>
                        <label className="text-[10px] font-black uppercase text-zinc-400 block mb-1">Filter Shift</label>
                        <select
                          value={selectedShiftFilter}
                          onChange={(e) => setSelectedShiftFilter(e.target.value)}
                          className="w-full p-2 rounded-xl border border-zinc-200 bg-[#F3F4F6] text-xs font-bold text-[#0A2E5C] dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                        >
                          <option value="all">All Shifts &amp; Plans</option>
                          <option value="standard">Standard (3 Hours Pass)</option>
                          <option value="prime">Pro / Prime (6 Hours Pass)</option>
                          <option value="reserved">Reserved Dedicated Desks</option>
                          <option value="night">Night Shift Ultra (10 PM - 6 AM)</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-[10px] font-black uppercase text-zinc-400 block mb-1">Filter Status</label>
                        <select
                          value={selectedStatusFilter}
                          onChange={(e) => setSelectedStatusFilter(e.target.value)}
                          className="w-full p-2 rounded-xl border border-zinc-200 bg-[#F3F4F6] text-xs font-bold text-[#0A2E5C] dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                        >
                          <option value="all">All Status</option>
                          <option value="present">Present Only</option>
                          <option value="absent">Absent Only</option>
                        </select>
                      </div>

                      <div className="flex justify-between items-center pt-2 border-t border-zinc-100 dark:border-zinc-800">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedShiftFilter("all");
                            setSelectedStatusFilter("all");
                          }}
                          className="text-[10px] font-bold text-zinc-400 hover:text-zinc-600"
                        >
                          Reset
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsFilterDropdownOpen(false)}
                          className="px-3 py-1 rounded-lg bg-[#0A2E5C] text-[#FFC107] text-[11px] font-bold"
                        >
                          Apply
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* 3. Calendar Icon / Date Range Filter Popover */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setIsDateFilterOpen(!isDateFilterOpen);
                      setIsFilterDropdownOpen(false);
                    }}
                    className={`p-2 rounded-xl border transition cursor-pointer flex items-center gap-1.5 text-xs font-bold ${
                      !isToday
                        ? "border-[#0B5ED7] bg-[#0B5ED7]/10 text-[#0B5ED7] dark:border-[#FFC107] dark:text-[#FFC107]"
                        : "border-zinc-200 bg-white text-zinc-600 hover:text-black dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                    }`}
                    title="Filter by particular date or date range"
                  >
                    <Calendar className="h-4 w-4" />
                    <span className="hidden md:inline">
                      {startDate === endDate
                        ? (isToday ? "Today" : isYesterday ? "Yesterday" : formatShortDate(startDate))
                        : `${formatShortDate(startDate)} - ${formatShortDate(endDate)}`}
                    </span>
                    <ChevronDown className="h-3 w-3 opacity-60" />
                  </button>

                  {/* Date Filter Popover */}
                  {isDateFilterOpen && (
                    <div className="absolute right-0 top-full mt-2 w-72 rounded-2xl border border-zinc-200 bg-white p-3.5 shadow-xl dark:border-zinc-700 dark:bg-[#0A2E5C] z-30 space-y-3 animate-fadeIn">
                      <div>
                        <span className="text-[10px] font-black uppercase text-zinc-400 block mb-1.5">Quick Presets</span>
                        <div className="grid grid-cols-2 gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setStartDate(todayStr);
                              setEndDate(todayStr);
                              setIsDateFilterOpen(false);
                            }}
                            className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold text-left transition ${
                              startDate === todayStr && endDate === todayStr
                                ? "bg-[#0B5ED7] text-white"
                                : "bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                            }`}
                          >
                            Today
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setStartDate(yesterdayStr);
                              setEndDate(yesterdayStr);
                              setIsDateFilterOpen(false);
                            }}
                            className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold text-left transition ${
                              startDate === yesterdayStr && endDate === yesterdayStr
                                ? "bg-[#0B5ED7] text-white"
                                : "bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                            }`}
                          >
                            Yesterday
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const d = new Date();
                              d.setDate(d.getDate() - 7);
                              setStartDate(d.toISOString().split("T")[0]);
                              setEndDate(todayStr);
                              setIsDateFilterOpen(false);
                            }}
                            className="px-2.5 py-1.5 rounded-xl text-[11px] font-bold text-left transition bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                          >
                            Last 7 Days
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const d = new Date();
                              d.setDate(d.getDate() - 30);
                              setStartDate(d.toISOString().split("T")[0]);
                              setEndDate(todayStr);
                              setIsDateFilterOpen(false);
                            }}
                            className="px-2.5 py-1.5 rounded-xl text-[11px] font-bold text-left transition bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                          >
                            Last 30 Days
                          </button>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 space-y-2">
                        <span className="text-[10px] font-black uppercase text-zinc-400 block">Select Date or Date Range</span>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[9px] font-bold text-zinc-400 block mb-0.5">From Date</label>
                            <input
                              type="date"
                              value={startDate}
                              onChange={(e) => setStartDate(e.target.value)}
                              className="w-full p-1.5 rounded-lg border border-zinc-200 bg-[#F3F4F6] text-[11px] font-bold text-[#0A2E5C] dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                            />
                          </div>
                          <div>
                            <label className="text-[9px] font-bold text-zinc-400 block mb-0.5">To Date</label>
                            <input
                              type="date"
                              value={endDate}
                              onChange={(e) => setEndDate(e.target.value)}
                              className="w-full p-1.5 rounded-lg border border-zinc-200 bg-[#F3F4F6] text-[11px] font-bold text-[#0A2E5C] dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-between items-center pt-2 border-t border-zinc-100 dark:border-zinc-800">
                        <button
                          type="button"
                          onClick={() => {
                            setStartDate(todayStr);
                            setEndDate(todayStr);
                            setIsDateFilterOpen(false);
                          }}
                          className="text-[10px] font-bold text-zinc-400 hover:text-zinc-600 cursor-pointer"
                        >
                          Reset to Today
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsDateFilterOpen(false)}
                          className="px-3 py-1.5 rounded-lg bg-[#0A2E5C] text-[#FFC107] text-[11px] font-black hover:bg-[#141A24] cursor-pointer"
                        >
                          Apply Filter
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* 4. Table / Grid Switcher Toggle */}
                <div className="flex items-center rounded-2xl bg-zinc-100/90 dark:bg-zinc-800/90 p-1 border border-zinc-200/80 dark:border-zinc-700/80 shrink-0">
                  <button
                    onClick={() => setViewMode("table")}
                    className={`p-1.5 rounded-xl transition-all cursor-pointer ${viewMode === "table"
                        ? "bg-white text-[#0A2E5C] shadow-xs dark:bg-[#0A2E5C] dark:text-white"
                        : "text-zinc-400 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-300"
                      }`}
                    title="List / Table View"
                  >
                    <List className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setViewMode("grid")}
                    className={`p-1.5 rounded-xl transition-all cursor-pointer ${viewMode === "grid"
                        ? "bg-white text-[#0A2E5C] shadow-xs dark:bg-[#0A2E5C] dark:text-white"
                        : "text-zinc-400 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-300"
                      }`}
                    title="Grid View"
                  >
                    <Grid3X3 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Shift Filter Quick Tabs */}
            <div className="flex items-center gap-1.5 pt-3 pb-1 overflow-x-auto text-xs">
              <span className="text-[11px] font-bold text-zinc-400 shrink-0 mr-1">Filter Shift:</span>
              {[
                { id: "all", label: "All Plans" },
                { id: "standard", label: "Standard (3H Pass)" },
                { id: "prime", label: "Prime (6H Pass)" },
                { id: "reserved", label: "Reserved Desks (24/7)" },
                { id: "night", label: "Night Shift Ultra (10PM-6AM)" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSelectedShiftFilter(tab.id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer whitespace-nowrap ${
                    selectedShiftFilter === tab.id
                      ? "bg-[#0B5ED7] text-white shadow-2xs"
                      : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* TABLE VIEW */}
            {viewMode === "table" ? (
              <div className="overflow-x-auto mt-3">
                <table className="w-full text-left text-xs min-w-[720px]">
                  <thead className="bg-[#F8F9FA] dark:bg-zinc-800/50 text-[10px] font-black uppercase tracking-wider text-zinc-400 border-b border-zinc-100 dark:border-zinc-800">
                    <tr>
                      <th className="p-3 w-8">#</th>
                      <th className="p-3">Student Name</th>
                      <th className="p-3">Shift</th>
                      <th className="p-3">Student ID</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">First Check In</th>
                      <th className="p-3">Last Check Out</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {filteredStudents.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-12 text-center text-xs text-zinc-400">
                          No attendance records found for {formatDisplayDate(startDate, endDate)}.
                        </td>
                      </tr>
                    ) : (
                      filteredStudents.map((std, index) => {
                        const initials = getInitials(std.full_name);
                        const bgColors = [
                          "bg-purple-100 text-purple-700",
                          "bg-emerald-100 text-emerald-700",
                          "bg-pink-100 text-pink-700",
                          "bg-blue-100 text-blue-700",
                        ];
                        const avatarColor = bgColors[index % bgColors.length];

                        return (
                          <tr
                            key={std.id}
                            className="hover:bg-[#F3F4F6]/50 dark:hover:bg-zinc-800/40 transition"
                          >
                            {/* Index */}
                            <td className="p-3 font-mono font-bold text-zinc-400">
                              {index + 1}
                            </td>

                            {/* Student Name (No email below name) */}
                            <td className="p-3">
                              <div className="flex items-center gap-2.5">
                                <div className={`h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-xs font-black ${avatarColor}`}>
                                  {initials}
                                </div>
                                <div>
                                  <p className="font-bold text-[#0A2E5C] dark:text-white capitalize leading-tight hover:text-[#0B5ED7] cursor-pointer" onClick={() => handleOpenFullStudentHistory(std)}>
                                    {std.full_name}
                                  </p>
                                </div>
                              </div>
                            </td>

                            {/* Shift (Name on top, timing below) */}
                            <td className="p-3">
                              {(() => {
                                const { name, timing } = getShiftDisplay(std.shift);
                                return (
                                  <div>
                                    <span className="inline-block rounded-lg bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 text-[10px] font-bold text-blue-800 dark:text-blue-300">
                                      {name}
                                    </span>
                                    <p className="text-[10px] text-zinc-400 font-mono mt-0.5 whitespace-nowrap">
                                      {timing}
                                    </p>
                                  </div>
                                );
                              })()}
                            </td>

                            {/* Student ID */}
                            <td className="p-3 font-mono font-bold text-zinc-700 dark:text-zinc-200 text-xs">
                              {std.studentCode}
                            </td>

                            {/* Status: Strictly Active, Present, Absent */}
                            <td className="p-3">
                              {std.isPresent ? (
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-black text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-900">
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                  Active
                                </span>
                              ) : std.isCompleted ? (
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-0.5 text-[10px] font-black text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:border-blue-900">
                                  <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                                  Present
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-0.5 text-[10px] font-black text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:border-rose-900">
                                  <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                                  Absent
                                </span>
                              )}
                            </td>

                            {/* First Check In */}
                            <td className="p-3 font-mono text-zinc-600 dark:text-zinc-300 text-[11px]">
                              {std.firstCheckIn}
                            </td>

                            {/* Last Check Out */}
                            <td className="p-3 font-mono text-zinc-600 dark:text-zinc-300 text-[11px]">
                              {std.lastCheckOut === "In Progress" || !std.lastCheckOut || std.lastCheckOut === "—" ? (
                                <span className="text-zinc-400 font-bold">-</span>
                              ) : (
                                std.lastCheckOut
                              )}
                            </td>

                            {/* Actions (Call, WhatsApp, Desk Photo, View Log) */}
                            <td className="p-3 text-right">
                              <div className="inline-flex items-center gap-1.5">
                                {/* Single Click Phone Call */}
                                {std.phone ? (
                                  <a
                                    href={`tel:${std.phone}`}
                                    className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition cursor-pointer"
                                    title={`Call ${std.full_name} (${std.phone})`}
                                  >
                                    <Phone className="h-3.5 w-3.5" />
                                  </a>
                                ) : null}

                                {/* Single Click WhatsApp */}
                                {std.phone ? (
                                  <a
                                    href={`https://wa.me/91${std.phone.replace(/\D/g, "")}?text=${encodeURIComponent(`Hello ${std.full_name}, regarding your attendance at Genius Library:`)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition cursor-pointer"
                                    title={`WhatsApp ${std.full_name}`}
                                  >
                                    <MessageCircle className="h-3.5 w-3.5" />
                                  </a>
                                ) : null}

                                {/* Desk Verification Photo Trigger (Replaces Bell Icon) */}
                                {std.photoUrl ? (
                                  <button
                                    type="button"
                                    onClick={() => setSelectedDeskPhoto({
                                      url: std.photoUrl!,
                                      studentName: std.full_name,
                                      studentEmail: std.email,
                                      seatNumber: std.seatNumber,
                                      checkInTime: std.firstCheckIn,
                                      date: formatDisplayDate(startDate, endDate),
                                    })}
                                    className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition cursor-pointer"
                                    title="View Captured Desk Photo"
                                  >
                                    <Camera className="h-3.5 w-3.5" />
                                  </button>
                                ) : (
                                  <span
                                    className="p-1.5 text-zinc-300 dark:text-zinc-600 opacity-40 cursor-not-allowed"
                                    title="No desk photo available"
                                  >
                                    <Camera className="h-3.5 w-3.5" />
                                  </span>
                                )}

                                {/* View Log Button with Today's Session Count Badge */}
                                <button
                                  type="button"
                                  onClick={() => handleOpenFullStudentHistory(std)}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[#F8FAFC] hover:bg-[#EBEBE5] dark:bg-zinc-800 dark:hover:bg-zinc-700 text-[#0B5ED7] dark:text-[#FFC107] text-[11px] font-bold transition cursor-pointer shadow-2xs group"
                                  title="View full multi-day attendance history of this student"
                                >
                                  <History className="h-3.5 w-3.5 group-hover:rotate-45 transition-transform" />
                                  <span>View Log</span>
                                  {std.checkCount > 0 && (
                                    <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-amber-200/80 text-amber-900 dark:bg-amber-900/60 dark:text-amber-200">
                                      {std.checkCount}
                                    </span>
                                  )}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              /* GRID VIEW */
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mt-3">
                {filteredStudents.length === 0 ? (
                  <div className="col-span-2 py-12 text-center text-xs text-zinc-400">
                    No attendance records found for {formatDisplayDate(startDate, endDate)}.
                  </div>
                ) : (
                  filteredStudents.map((std, index) => {
                    const initials = getInitials(std.full_name);
                    const bgColors = [
                      "bg-purple-100 text-purple-700",
                      "bg-emerald-100 text-emerald-700",
                      "bg-pink-100 text-pink-700",
                      "bg-blue-100 text-blue-700",
                    ];
                    const avatarColor = bgColors[index % bgColors.length];
                    const { name: shiftName, timing: shiftTiming } = getShiftDisplay(std.shift);

                    return (
                      <div
                        key={std.id}
                        className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-[#FAF9F6]/50 dark:bg-zinc-800/40 p-3.5 flex flex-col justify-between hover:border-[#E5E7EB] transition space-y-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <div className={`h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-xs font-black ${avatarColor}`}>
                              {initials}
                            </div>
                            <div>
                              <p className="font-bold text-[#0A2E5C] dark:text-white capitalize text-xs hover:text-[#0B5ED7] cursor-pointer" onClick={() => handleOpenStudentLog(std)}>
                                {std.full_name}
                              </p>
                              <p className="text-[10px] text-zinc-400 leading-tight font-mono">
                                ID: {std.studentCode} • Desk #{std.seatNumber}
                              </p>
                              <div className="mt-1">
                                <span className="inline-block text-[9px] font-bold text-blue-700 bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 rounded-md">
                                  {shiftName}
                                </span>
                                <p className="text-[9px] text-zinc-400 font-mono mt-0.5">
                                  {shiftTiming}
                                </p>
                              </div>
                            </div>
                          </div>

                          <div>
                            {std.isPresent ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-900">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                Active
                              </span>
                            ) : std.isCompleted ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:border-blue-900">
                                <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                                Present
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:border-rose-900">
                                <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                                Absent
                              </span>
                            )}
                          </div>
                        </div>

                        {/* In/Out Times Row */}
                        <div className="grid grid-cols-2 gap-2 bg-white dark:bg-zinc-800 p-2 rounded-xl text-[11px] border border-zinc-100 dark:border-zinc-700/60">
                          <div>
                            <span className="text-[9px] text-zinc-400 block font-bold">First Check In</span>
                            <span className="font-mono font-bold text-[#0A2E5C] dark:text-zinc-200">{std.firstCheckIn}</span>
                          </div>
                          <div>
                            <span className="text-[9px] text-zinc-400 block font-bold">Last Check Out</span>
                            <span className="font-mono font-bold text-[#0A2E5C] dark:text-zinc-200">
                              {std.lastCheckOut === "In Progress" || !std.lastCheckOut || std.lastCheckOut === "—" ? (
                                <span className="text-zinc-400 font-bold">-</span>
                              ) : (
                                std.lastCheckOut
                              )}
                            </span>
                          </div>
                        </div>

                        {/* Action Buttons: Call, WhatsApp, Desk Photo & View Log */}
                        <div className="flex items-center justify-between gap-1.5 pt-1 border-t border-zinc-100 dark:border-zinc-800">
                          <div className="flex items-center gap-1.5">
                            {std.phone && (
                              <a
                                href={`tel:${std.phone}`}
                                className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition cursor-pointer"
                                title={`Call ${std.full_name}`}
                              >
                                <Phone className="h-3.5 w-3.5" />
                              </a>
                            )}
                            {std.phone && (
                              <a
                                href={`https://wa.me/91${std.phone.replace(/\D/g, "")}?text=${encodeURIComponent(`Hello ${std.full_name}, regarding your attendance at Genius Library:`)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition cursor-pointer"
                                title={`WhatsApp ${std.full_name}`}
                              >
                                <MessageCircle className="h-3.5 w-3.5" />
                              </a>
                            )}
                            {std.photoUrl && (
                              <button
                                type="button"
                                onClick={() => setSelectedDeskPhoto({
                                  url: std.photoUrl!,
                                  studentName: std.full_name,
                                  studentEmail: std.email,
                                  seatNumber: std.seatNumber,
                                  checkInTime: std.firstCheckIn,
                                  date: formatDisplayDate(startDate, endDate),
                                })}
                                className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition cursor-pointer"
                                title="View Captured Desk Photo"
                              >
                                <Camera className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenFullStudentHistory(std)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-[#F8FAFC] hover:bg-[#EBEBE5] dark:bg-zinc-800 dark:hover:bg-zinc-700 text-[#0B5ED7] dark:text-[#FFC107] text-[10px] font-bold transition cursor-pointer"
                              title="Full Attendance History"
                            >
                              <History className="h-3 w-3" />
                              <span>View Log</span>
                              {std.checkCount > 0 && (
                                <span className="px-1.5 py-0.2 rounded-full text-[9px] font-black bg-amber-200/80 text-amber-900 dark:bg-amber-900/60 dark:text-amber-200">
                                  {std.checkCount}
                                </span>
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* Table Footer: Showing 1 to 3 of 3 students & Pagination */}
          <div className="flex items-center justify-between pt-4 border-t border-zinc-100 dark:border-zinc-800 text-xs text-zinc-500">
            <span>Showing 1 to {filteredStudents.length} of {studentAttendanceList.length} students</span>
            <div className="flex items-center gap-1.5">
              <button className="h-7 w-7 rounded-lg border border-zinc-200 dark:border-zinc-700 flex items-center justify-center text-zinc-400 hover:bg-zinc-100 text-xs">
                &lt;
              </button>
              <button className="h-7 w-7 rounded-lg bg-blue-600 text-white font-bold text-xs flex items-center justify-center shadow-2xs">
                1
              </button>
              <button className="h-7 w-7 rounded-lg border border-zinc-200 dark:border-zinc-700 flex items-center justify-center text-zinc-400 hover:bg-zinc-100 text-xs">
                &gt;
              </button>
            </div>
          </div>

        </div>

      {/* ========================================================================= */}
      {/* 4. ATTENDANCE OVERVIEW & SHIFT-WISE STATS (BELOW TABLE IN 2-COL GRID)     */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* 1. Attendance Overview Donut Card (Matching Image) */}
          <div className="rounded-3xl border border-[#E5E7EB] bg-white p-5 sm:p-6 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C]">
            <h3 className="text-sm font-black text-[#0A2E5C] dark:text-white flex items-center gap-2 mb-4">
              <Calendar className="h-4 w-4 text-blue-500" />
              Attendance Overview
            </h3>

            {/* Circular Donut Gauge */}
            <div className="flex flex-col items-center justify-center py-4">
              <div className="relative flex h-36 w-36 items-center justify-center">
                <svg className="h-full w-full -rotate-90 transform" viewBox="0 0 100 100">
                  {/* Gray background track */}
                  <circle cx="50" cy="50" r="40" fill="none" stroke="#F3F4F6" strokeWidth="12" />

                  {/* Red Absent arc */}
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="none"
                    stroke="#F43F5E"
                    strokeWidth="12"
                    strokeDasharray="251"
                    strokeDashoffset={251 - (251 * (absentCount / (totalStudents || 1)))}
                  />

                  {/* Green Present arc */}
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="none"
                    stroke="#10B981"
                    strokeWidth="12"
                    strokeDasharray="251"
                    strokeDashoffset={251 - (251 * (presentCount / (totalStudents || 1)))}
                  />
                </svg>

                <div className="absolute flex flex-col items-center justify-center text-center">
                  <span className="text-2xl font-black text-[#0A2E5C] dark:text-white">{totalStudents}</span>
                  <span className="text-[9px] font-bold text-zinc-400">Total Students</span>
                </div>
              </div>
            </div>

            {/* Legend Stats List (Matching Image) */}
            <div className="mt-4 space-y-2.5 pt-4 border-t border-zinc-100 dark:border-zinc-800 text-xs font-bold">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  <span className="text-zinc-600 dark:text-zinc-300">Present</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[#0A2E5C] dark:text-white">{presentCount}</span>
                  <span className="text-zinc-400 text-[11px] w-12 text-right">{presentPct}%</span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
                  <span className="text-zinc-600 dark:text-zinc-300">Absent</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[#0A2E5C] dark:text-white">{absentCount}</span>
                  <span className="text-zinc-400 text-[11px] w-12 text-right">{absentPct}%</span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-500 animate-pulse" />
                  <span className="text-zinc-600 dark:text-zinc-300">Active Shift ({shiftKpi.current.name})</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[#0A2E5C] dark:text-white">{shiftKpi.current.present}</span>
                  <span className="text-zinc-400 text-[11px] w-12 text-right">
                    {shiftKpi.current.students.length > 0
                      ? ((shiftKpi.current.present / shiftKpi.current.students.length) * 100).toFixed(1)
                      : "0.0"}%
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 2. Shift-wise Attendance Card */}
          <div className="rounded-3xl border border-[#E5E7EB] bg-white p-5 sm:p-6 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-black text-[#0A2E5C] dark:text-white flex items-center gap-2">
                <Calendar className="h-4 w-4 text-blue-500" />
                Shift-wise Attendance
              </h3>
              <button
                type="button"
                onClick={() => setSelectedShiftFilter("all")}
                className="text-[11px] font-bold text-blue-600 dark:text-[#FFC107] hover:underline flex items-center gap-0.5"
              >
                All Batches
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-[11px]">
                <thead className="text-[9px] font-black uppercase text-zinc-400 border-b border-zinc-100 dark:border-zinc-800">
                  <tr>
                    <th className="pb-2">Shift</th>
                    <th className="pb-2 text-center">Total</th>
                    <th className="pb-2 text-center">Present</th>
                    <th className="pb-2 text-center">Absent</th>
                    <th className="pb-2 text-right">Avg. %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  <tr className={shiftKpi.autoShiftId === "standard" ? "bg-amber-50/50 dark:bg-amber-950/20" : ""}>
                    <td className="py-2.5 font-bold text-[#0A2E5C] dark:text-white">
                      <div className="flex items-center justify-between gap-1.5">
                        <span>Standard (3 Hours Pass - 24/7)</span>
                        {shiftKpi.autoShiftId === "standard" && (
                          <span className="relative flex h-2 w-2 shrink-0">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 text-center text-zinc-600 dark:text-zinc-300">{standardStudents.length}</td>
                    <td className="py-2.5 text-center text-emerald-600 font-bold">{standardPresent}</td>
                    <td className="py-2.5 text-center text-rose-600 font-bold">{Math.max(0, standardStudents.length - standardPresent)}</td>
                    <td className="py-2.5 text-right font-mono text-zinc-500">
                      {standardStudents.length > 0 ? ((standardPresent / standardStudents.length) * 100).toFixed(1) : "0.0"}%
                    </td>
                  </tr>
                  <tr className={shiftKpi.autoShiftId === "prime" ? "bg-amber-50/50 dark:bg-amber-950/20" : ""}>
                    <td className="py-2.5 font-bold text-[#0A2E5C] dark:text-white">
                      <div className="flex items-center justify-between gap-1.5">
                        <span>Pro / Prime (6 Hours Pass - 24/7)</span>
                        {shiftKpi.autoShiftId === "prime" && (
                          <span className="relative flex h-2 w-2 shrink-0">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 text-center text-zinc-600 dark:text-zinc-300">{primeStudents.length}</td>
                    <td className="py-2.5 text-center text-emerald-600 font-bold">{primePresent}</td>
                    <td className="py-2.5 text-center text-rose-600 font-bold">{Math.max(0, primeStudents.length - primePresent)}</td>
                    <td className="py-2.5 text-right font-mono text-zinc-500">
                      {primeStudents.length > 0 ? ((primePresent / primeStudents.length) * 100).toFixed(1) : "0.0"}%
                    </td>
                  </tr>
                  <tr className={shiftKpi.autoShiftId === "reserved" ? "bg-amber-50/50 dark:bg-amber-950/20" : ""}>
                    <td className="py-2.5 font-bold text-[#0A2E5C] dark:text-white">
                      <div className="flex items-center justify-between gap-1.5">
                        <span>Reserved Dedicated Desks (24/7)</span>
                        {shiftKpi.autoShiftId === "reserved" && (
                          <span className="relative flex h-2 w-2 shrink-0">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 text-center text-zinc-600 dark:text-zinc-300">{reservedStudents.length}</td>
                    <td className="py-2.5 text-center text-emerald-600 font-bold">{reservedPresent}</td>
                    <td className="py-2.5 text-center text-rose-600 font-bold">{Math.max(0, reservedStudents.length - reservedPresent)}</td>
                    <td className="py-2.5 text-right font-mono text-zinc-500">
                      {reservedStudents.length > 0 ? ((reservedPresent / reservedStudents.length) * 100).toFixed(1) : "0.0"}%
                    </td>
                  </tr>
                  <tr className={shiftKpi.autoShiftId === "night" ? "bg-amber-50/50 dark:bg-amber-950/20" : ""}>
                    <td className="py-2.5 font-bold text-[#0A2E5C] dark:text-white">
                      <div className="flex items-center justify-between gap-1.5">
                        <span>Night Shift Ultra (10 PM - 06 AM)</span>
                        {shiftKpi.autoShiftId === "night" && (
                          <span className="relative flex h-2 w-2 shrink-0">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 text-center text-zinc-600 dark:text-zinc-300">{nightStudents.length}</td>
                    <td className="py-2.5 text-center text-emerald-600 font-bold">{nightPresent}</td>
                    <td className="py-2.5 text-center text-rose-600 font-bold">{Math.max(0, nightStudents.length - nightPresent)}</td>
                    <td className="py-2.5 text-right font-mono text-zinc-500">
                      {nightStudents.length > 0 ? ((nightPresent / nightStudents.length) * 100).toFixed(1) : "0.0"}%
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

      </div>

      {/* ========================================================================= */}
      {/* 4. MODALS: MANUAL ATTENDANCE, DESK PHOTO & CHECK-IN LOG MODAL */}
      {/* ========================================================================= */}

      {/* Manual Entry Modal */}
      {isManualModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-md rounded-3xl border border-[#E5E7EB] bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-[#0A2E5C] space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
              <h3 className="text-base font-black text-[#0A2E5C] dark:text-white flex items-center gap-2">
                <ClipboardEdit className="h-5 w-5 text-[#0B5ED7]" /> Manual Attendance Override
              </h3>
              <button onClick={() => setIsManualModalOpen(false)} className="text-zinc-400 hover:text-zinc-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-zinc-500 block mb-1">Select Student:</label>
                <select
                  value={manualForm.studentId}
                  onChange={(e) => setManualForm({ ...manualForm, studentId: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-zinc-200 bg-[#F3F4F6] text-xs font-bold text-[#0A2E5C] dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                >
                  <option value="">-- Choose a student --</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.full_name} ({s.email}) - {s.shift}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-zinc-500 block mb-1">Desk & Seat Number:</label>
                <input
                  type="text"
                  value={manualForm.seatNumber}
                  onChange={(e) => setManualForm({ ...manualForm, seatNumber: e.target.value.toUpperCase() })}
                  className="w-full p-2.5 rounded-xl border border-zinc-200 bg-[#F3F4F6] text-xs font-mono font-bold text-[#0A2E5C] dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                />
              </div>

              <div>
                <label className="font-bold text-zinc-500 block mb-1">Attendance Action:</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setManualForm({ ...manualForm, actionType: "check_in" })}
                    className={`py-2 rounded-xl text-xs font-bold transition cursor-pointer ${manualForm.actionType === "check_in"
                        ? "bg-emerald-600 text-white shadow-xs"
                        : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                      }`}
                  >
                    Check In (Present)
                  </button>
                  <button
                    type="button"
                    onClick={() => setManualForm({ ...manualForm, actionType: "check_out" })}
                    className={`py-2 rounded-xl text-xs font-bold transition cursor-pointer ${manualForm.actionType === "check_out"
                        ? "bg-rose-600 text-white shadow-xs"
                        : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                      }`}
                  >
                    Check Out
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-800">
              <button
                onClick={() => setIsManualModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-zinc-500 hover:bg-zinc-100"
              >
                Cancel
              </button>
              <button
                onClick={handleManualSubmit}
                disabled={!manualForm.studentId}
                className="px-5 py-2 rounded-xl bg-[#0A2E5C] text-[#FFC107] text-xs font-black hover:bg-[#141A24] disabled:opacity-50"
              >
                Save Attendance Record
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Desk Photo Verification Modal */}
      {selectedDeskPhoto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-lg rounded-3xl border border-[#E5E7EB] bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-[#0A2E5C] space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
              <div>
                <h3 className="text-base font-black text-[#0A2E5C] dark:text-white flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-emerald-600" />
                  Anti-Proxy Desk Verification
                </h3>
                <p className="text-xs text-zinc-500">Live Camera Snapshot Captured at Desk</p>
              </div>
              <button
                onClick={() => setSelectedDeskPhoto(null)}
                className="text-zinc-400 hover:text-zinc-600 rounded-full p-1"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Full Camera View Display (object-contain with natural dimensions so 100% full camera coverage is visible) */}
            <div className="relative min-h-[280px] max-h-[68vh] rounded-2xl overflow-hidden bg-zinc-950 border-2 border-[#E5E7EB] dark:border-zinc-700 flex items-center justify-center p-1.5 shadow-inner">
              <img
                src={selectedDeskPhoto.url}
                alt="Desk Verification Full Camera View"
                className="max-h-[64vh] w-auto max-w-full object-contain rounded-xl mx-auto shadow-md"
              />
              <div className="absolute top-3 left-3 bg-black/80 backdrop-blur-md px-3 py-1.5 rounded-full text-white text-[11px] font-bold border border-white/20 shadow-md flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                <span>Desk #{selectedDeskPhoto.seatNumber}</span>
                <span className="text-zinc-400 font-medium">• Full Camera Area</span>
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-[#F3F4F6] dark:bg-zinc-800/60 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-zinc-400">Student:</span>
                <span className="font-bold text-[#0A2E5C] dark:text-white">{selectedDeskPhoto.studentName} ({selectedDeskPhoto.studentEmail})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Time:</span>
                <span className="font-medium text-zinc-600 dark:text-zinc-300">{selectedDeskPhoto.checkInTime} • {selectedDeskPhoto.date}</span>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedDeskPhoto(null)}
                className="px-4 py-2 rounded-xl bg-[#0A2E5C] text-[#FFC107] text-xs font-bold"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Check-In & Check-Out Log Modal */}
      {selectedStudentForLog && mounted && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-fadeIn">
          <div className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-3xl border border-[#E5E7EB] bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-[#0A2E5C] space-y-5">
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-4 border-b border-zinc-100 dark:border-zinc-800">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-2xl bg-linear-to-br from-[#0B5ED7] to-[#FFC107] text-white flex items-center justify-center font-black text-sm shadow-md">
                  {getInitials(selectedStudentForLog.student.full_name)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-black text-[#0A2E5C] dark:text-white capitalize">
                      {selectedStudentForLog.student.full_name}
                    </h3>
                    <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                      {selectedStudentForLog.student.shift}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 font-mono mt-0.5">
                    ID: {selectedStudentForLog.student.studentCode} • {selectedStudentForLog.student.email}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedStudentForLog(null)}
                className="p-1.5 rounded-xl text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Daily Check-In Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-[#FAF9F6] dark:bg-zinc-800/50 p-3">
                <span className="text-[10px] font-bold text-zinc-400 block">Date</span>
                <span className="text-xs font-black text-[#0A2E5C] dark:text-white mt-0.5 block truncate">
                  {selectedStudentForLog.formattedDate}
                </span>
              </div>

              <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-[#FAF9F6] dark:bg-zinc-800/50 p-3">
                <span className="text-[10px] font-bold text-zinc-400 block">Daily Status</span>
                <div className="mt-0.5">
                  {selectedStudentForLog.status === "Active" ? (
                    <span className="inline-flex items-center gap-1 text-xs font-black text-emerald-600">
                      <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                      Active
                    </span>
                  ) : selectedStudentForLog.status === "Present" ? (
                    <span className="inline-flex items-center gap-1 text-xs font-black text-blue-600">
                      <span className="h-2 w-2 rounded-full bg-blue-500" />
                      Present
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-black text-rose-600">
                      <span className="h-2 w-2 rounded-full bg-rose-500" />
                      Absent
                    </span>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-[#FAF9F6] dark:bg-zinc-800/50 p-3">
                <span className="text-[10px] font-bold text-zinc-400 block">Total Check-Ins</span>
                <span className="text-xs font-black text-[#0A2E5C] dark:text-white mt-0.5 block">
                  {selectedStudentForLog.totalCheckIns} {selectedStudentForLog.totalCheckIns === 1 ? "check-in" : "check-ins"}
                </span>
              </div>

              <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-[#FAF9F6] dark:bg-zinc-800/50 p-3">
                <span className="text-[10px] font-bold text-zinc-400 block">Seated Time</span>
                <span className="text-xs font-black text-[#0B5ED7] dark:text-[#FFC107] mt-0.5 block truncate">
                  {selectedStudentForLog.totalDuration}
                </span>
              </div>
            </div>

            {/* Chronological Check-In Sessions Timeline */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                  <History className="h-3.5 w-3.5 text-[#0B5ED7]" />
                  Check-In & Check-Out Sessions ({selectedStudentForLog.formattedDate})
                </h4>
                <span className="text-[10px] text-zinc-400 font-mono">Desk #{selectedStudentForLog.student.seatNumber}</span>
              </div>

              {selectedStudentForLog.sessions.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 p-8 text-center text-xs text-zinc-400 space-y-1">
                  <History className="h-8 w-8 mx-auto text-zinc-300 dark:text-zinc-600" />
                  <p className="font-bold text-zinc-600 dark:text-zinc-400">No check-in activity recorded</p>
                  <p className="text-[11px]">This student was marked absent or had no gate/desk logs on this date.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {selectedStudentForLog.sessions.map((session, idx) => (
                    <div
                      key={idx}
                      className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-[#FBFBFA] dark:bg-zinc-800/40 p-4 space-y-3"
                    >
                      <div className="flex items-center justify-between pb-2 border-b border-zinc-100 dark:border-zinc-800/80">
                        <span className="text-xs font-bold text-[#0A2E5C] dark:text-white flex items-center gap-1.5">
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#0B5ED7] text-white text-[10px] font-black">
                            {session.sessionNumber}
                          </span>
                          Session #{session.sessionNumber}
                        </span>
                        <span className="text-[11px] font-bold text-zinc-500 flex items-center gap-1">
                          <Timer className="h-3.5 w-3.5 text-[#0B5ED7]" />
                          {session.duration}
                        </span>
                      </div>

                      {/* In & Out Check-In Points */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {/* Check-In */}
                        <div className="flex items-center gap-3 p-2.5 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-900/40">
                          <div className="h-8 w-8 rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300 flex items-center justify-center shrink-0">
                            <LogIn className="h-4 w-4" />
                          </div>
                          <div>
                            <span className="text-[10px] font-bold text-emerald-800 dark:text-emerald-300 block">Check In (Entry)</span>
                            <span className="text-xs font-mono font-black text-[#0A2E5C] dark:text-white">{session.checkInTime}</span>
                          </div>
                        </div>

                        {/* Check-Out */}
                        <div className="flex items-center gap-3 p-2.5 rounded-xl bg-rose-50/60 dark:bg-rose-950/20 border border-rose-200/60 dark:border-rose-900/40">
                          <div className="h-8 w-8 rounded-xl bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-300 flex items-center justify-center shrink-0">
                            <LogOut className="h-4 w-4" />
                          </div>
                          <div>
                            <span className="text-[10px] font-bold text-rose-800 dark:text-rose-300 block">Check Out (Exit)</span>
                            <span className="text-xs font-mono font-black text-[#0A2E5C] dark:text-white">{session.checkOutTime}</span>
                          </div>
                        </div>
                      </div>

                      {/* Gate & Verification Method Metadata */}
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-zinc-400 pt-1">
                        <span>Terminal: {session.gate}</span>
                        <span>Method: {session.method}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="flex justify-end pt-2 border-t border-zinc-100 dark:border-zinc-800">
              <button
                onClick={() => setSelectedStudentForLog(null)}
                className="px-5 py-2 rounded-xl bg-[#0A2E5C] text-[#FFC107] hover:bg-[#141A24] text-xs font-bold transition cursor-pointer"
              >
                Close Log
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Full Multi-Day Student Attendance History Modal */}
      {studentHistoryData && mounted && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-fadeIn">
          <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border border-[#E5E7EB] bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-[#0A2E5C] space-y-5">
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-4 border-b border-zinc-100 dark:border-zinc-800">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-2xl bg-linear-to-br from-[#0B5ED7] to-[#FFC107] text-white flex items-center justify-center font-black text-sm shadow-md">
                  {getInitials(studentHistoryData.student.full_name)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-black text-[#0A2E5C] dark:text-white capitalize">
                      {studentHistoryData.student.full_name}
                    </h3>
                    <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                      {studentHistoryData.student.shift}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 font-mono mt-0.5">
                    ID: {studentHistoryData.student.studentCode} • Phone: {studentHistoryData.student.phone || "—"} • Desk #{studentHistoryData.student.seatNumber || studentHistoryData.student.seat_number || "—"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {studentHistoryData.student.phone && (
                  <a
                    href={`tel:${studentHistoryData.student.phone}`}
                    className="p-2 rounded-xl bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition cursor-pointer"
                    title="Call Student"
                  >
                    <Phone className="h-4 w-4" />
                  </a>
                )}
                {studentHistoryData.student.phone && (
                  <a
                    href={`https://wa.me/91${studentHistoryData.student.phone.replace(/\D/g, "")}?text=${encodeURIComponent(`Hello ${studentHistoryData.student.full_name}, regarding your attendance records at Genius Library:`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-xl bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition cursor-pointer"
                    title="WhatsApp Student"
                  >
                    <MessageSquare className="h-4 w-4" />
                  </a>
                )}
                <button
                  onClick={() => setStudentHistoryData(null)}
                  className="p-2 rounded-xl text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Quick Stat Highlights */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-[#FAF9F6] dark:bg-zinc-800/50 p-3">
                <span className="text-[10px] font-bold text-zinc-400 block">Total Days Present</span>
                <span className="text-base sm:text-lg font-black text-emerald-600 dark:text-emerald-400 mt-0.5 block">
                  {studentHistoryData.isLoading ? "..." : `${studentHistoryData.totalDaysPresent} Days`}
                </span>
              </div>

              <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-[#FAF9F6] dark:bg-zinc-800/50 p-3">
                <span className="text-[10px] font-bold text-zinc-400 block">Total Check-In Sessions</span>
                <span className="text-base sm:text-lg font-black text-[#0A2E5C] dark:text-white mt-0.5 block">
                  {studentHistoryData.isLoading ? "..." : `${studentHistoryData.totalSessions} Sessions`}
                </span>
              </div>

              <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-[#FAF9F6] dark:bg-zinc-800/50 p-3">
                <span className="text-[10px] font-bold text-zinc-400 block">Assigned Shift</span>
                <span className="text-xs font-black text-[#0B5ED7] dark:text-[#FFC107] mt-1 block truncate">
                  {studentHistoryData.student.shift || "Standard"}
                </span>
              </div>

              <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-[#FAF9F6] dark:bg-zinc-800/50 p-3">
                <span className="text-[10px] font-bold text-zinc-400 block">Allocated Seat</span>
                <span className="text-xs font-black text-blue-600 dark:text-blue-400 mt-1 block">
                  Desk #{studentHistoryData.student.seatNumber || studentHistoryData.student.seat_number || "—"}
                </span>
              </div>
            </div>

            {/* Attendance History Grouped by Date */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                  <CalendarDays className="h-4 w-4 text-[#0B5ED7]" />
                  Full Attendance History (Date by Date)
                </h4>
                <span className="text-[10px] text-zinc-400 font-bold">
                  {studentHistoryData.historyDays.length} Attended Days
                </span>
              </div>

              {studentHistoryData.isLoading ? (
                <div className="py-12 text-center text-xs text-zinc-400 flex flex-col items-center justify-center gap-2">
                  <RefreshCw className="h-6 w-6 animate-spin text-[#0B5ED7]" />
                  <span>Loading full attendance records from database...</span>
                </div>
              ) : studentHistoryData.historyDays.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 p-8 text-center text-xs text-zinc-400 space-y-1">
                  <History className="h-8 w-8 mx-auto text-zinc-300 dark:text-zinc-600" />
                  <p className="font-bold text-zinc-600 dark:text-zinc-400">No attendance history records</p>
                  <p className="text-[11px]">This student has not checked into the library yet.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {studentHistoryData.historyDays.map((day, dIdx) => (
                    <div
                      key={dIdx}
                      className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-[#FBFBFA] dark:bg-zinc-800/40 p-4 space-y-3"
                    >
                      {/* Day Header */}
                      <div className="flex items-center justify-between pb-2 border-b border-zinc-100 dark:border-zinc-800/80">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-[#0B5ED7]" />
                          <span className="text-xs font-black text-[#0A2E5C] dark:text-white">
                            {day.formattedDate}
                          </span>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/40">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            Present
                          </span>
                        </div>
                        <span className="text-[11px] font-bold text-zinc-500 bg-zinc-100 dark:bg-zinc-700/60 px-2 py-0.5 rounded-lg">
                          {day.sessions.length} {day.sessions.length === 1 ? "Check-in" : "Check-ins"}
                        </span>
                      </div>

                      {/* Chronological Sessions on This Day */}
                      <div className="space-y-2">
                        {day.sessions.map((sess, sIdx) => (
                          <div
                            key={sIdx}
                            className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-xl bg-white dark:bg-zinc-800/80 border border-zinc-100 dark:border-zinc-700/60 text-xs"
                          >
                            <div className="flex items-center gap-2">
                              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#0B5ED7] text-white text-[10px] font-black shrink-0">
                                {sess.sessionNumber || sIdx + 1}
                              </span>
                              <span className="font-bold text-[#0A2E5C] dark:text-white">
                                Session #{sess.sessionNumber || sIdx + 1}
                              </span>
                              <span className="text-[10px] text-zinc-400 font-mono">
                                • {sess.method}
                              </span>
                            </div>

                            <div className="flex items-center gap-3 text-[11px]">
                              {/* In Time */}
                              <div className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-mono font-bold bg-emerald-50 dark:bg-emerald-950/30 px-2 py-0.5 rounded-md">
                                <LogIn className="h-3 w-3" />
                                <span>In: {sess.checkInTime}</span>
                              </div>

                              {/* Out Time */}
                              <div className="flex items-center gap-1 text-rose-700 dark:text-rose-400 font-mono font-bold bg-rose-50 dark:bg-rose-950/30 px-2 py-0.5 rounded-md">
                                <LogOut className="h-3 w-3" />
                                <span>
                                  Out: {sess.status === "in_progress" ? (
                                    <span className="text-emerald-600 font-bold inline-flex items-center gap-1">
                                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                      In Progress
                                    </span>
                                  ) : sess.checkOutTime}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end pt-2 border-t border-zinc-100 dark:border-zinc-800">
              <button
                onClick={() => setStudentHistoryData(null)}
                className="px-5 py-2 rounded-xl bg-[#0A2E5C] text-[#FFC107] hover:bg-[#141A24] text-xs font-bold transition cursor-pointer"
              >
                Close History
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Student QR Scanner Modal */}
      <AdminStudentQrScannerModal
        isOpen={isQrScannerOpen}
        onClose={() => setIsQrScannerOpen(false)}
        onStudentUpdated={loadData}
      />

    </div>
  );
}

