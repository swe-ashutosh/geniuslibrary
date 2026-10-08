"use client";

/**
 * [WEB • PAGE] Student Attendance History
 *
 * (Small helper file — see code comments below.)
 */
import { useState, useEffect } from "react";
import { 
  Calendar, 
  CheckCircle, 
  Clock, 
  QrCode, 
  ShieldCheck, 
  RefreshCw, 
  UserCheck, 
  CalendarCheck,
  Database,
  Archive,
  ChevronDown,
  AlertCircle,
  CalendarX2,
  Smartphone,
  Fingerprint,
  LayoutGrid,
  Table as TableIcon,
  ArrowRight
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getAttendanceWaterfall, AttendanceRecord, getLibraryHolidays, LibraryHoliday } from "@/lib/api";
import { LiveAttendanceCameraModal } from "@/components/LiveAttendanceCameraModal";
import { IntersectionLazyItem } from "@/components/VirtualizedList";

export default function StudentAttendancePage() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [attendanceList, setAttendanceList] = useState<AttendanceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
  
  // Waterfall Pagination & Filter state
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [isArchiveLoaded, setIsArchiveLoaded] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<"all" | "supabase" | "d1">("all");
  const [holidays, setHolidays] = useState<LibraryHoliday[]>([]);
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");

  const todayStr = new Date().toISOString().split("T")[0];

  const loadData = async (resetPage = 1) => {
    setIsLoading(true);
    const supabase = createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();

    if (authUser) {
      setUser(authUser);
      
      // 1. Authoritative Identity strictly from Supabase profiles
      let profileData: any = null;
      try {
        const { data } = await supabase
          .from("profiles")
          .select("full_name, email, phone, parent_name, parent_phone, address, course, shift, membership_plan, avatar_url, seat_number, student_code, created_at")
          .eq("id", authUser.id)
          .maybeSingle();
        profileData = data;
      } catch {}

      const cachedAvatar = typeof window !== "undefined" ? localStorage.getItem(`genius_custom_avatar_${authUser.id}`) : null;
      setProfile({
        ...(authUser.user_metadata || {}),
        ...(profileData || {}),
        avatar_url: cachedAvatar || profileData?.avatar_url || authUser.user_metadata?.avatar_url || null,
      });

      // 2. Waterfall Fetch: Supabase Live records first, fall back to D1 Archive
      try {
        const [result, holidaysRes] = await Promise.all([
          getAttendanceWaterfall({
            studentId: authUser.id,
            page: resetPage,
            pageSize: 15,
            loadArchive: resetPage > 1,
          }),
          getLibraryHolidays().catch(() => []),
        ]);

        setAttendanceList(result.records);
        setHasMore(result.hasMore);
        setIsArchiveLoaded(result.isArchiveLoaded);
        setPage(resetPage);
        setHolidays(holidaysRes || []);
      } catch (err) {
        console.warn("Failed to load attendance waterfall:", err);
      }
    }
    setIsLoading(false);
  };

  const handleLoadMoreFromD1 = async () => {
    if (!user?.id || isLoadingMore) return;
    setIsLoadingMore(true);

    try {
      const nextPage = page + 1;
      const result = await getAttendanceWaterfall({
        studentId: user.id,
        page: nextPage,
        pageSize: 15,
        loadArchive: true, // Forces checking Cloudflare D1 cold archive
      });

      setAttendanceList(result.records);
      setHasMore(result.hasMore);
      setIsArchiveLoaded(result.isArchiveLoaded);
      setPage(nextPage);
    } catch (err) {
      console.warn("Error loading more attendance from D1 archive:", err);
    } finally {
      setIsLoadingMore(false);
    }
  };

  useEffect(() => {
    loadData(1);

    const handleUpdate = () => loadData(1);
    const handleHolidayUpdate = () => {
      getLibraryHolidays().then((hList) => setHolidays(hList || []));
    };

    window.addEventListener("attendance_updated", handleUpdate);
    window.addEventListener("library_holiday_updated", handleHolidayUpdate);
    return () => {
      window.removeEventListener("attendance_updated", handleUpdate);
      window.removeEventListener("library_holiday_updated", handleHolidayUpdate);
    };
  }, []);

  // 1. Total Days (Unique Present Days)
  const uniquePresentDates = new Set(
    attendanceList.filter((a) => a.date && (a.status === "present" || a.checkIn)).map((a) => a.date)
  );
  const totalPresentDays = uniquePresentDates.size;

  // 2. Total Study Hours
  const parseTimeToMinutes = (tStr?: string | null): number | null => {
    if (!tStr) return null;
    try {
      const m = tStr.match(/(\d+):(\d+)(?::\d+)?\s*(AM|PM)?/i);
      if (!m) return null;
      let hrs = parseInt(m[1], 10);
      const mins = parseInt(m[2], 10);
      const period = m[3]?.toUpperCase();
      if (period === "PM" && hrs < 12) hrs += 12;
      if (period === "AM" && hrs === 12) hrs = 0;
      return hrs * 60 + mins;
    } catch {
      return null;
    }
  };

  let totalMinutes = 0;
  attendanceList.forEach((a) => {
    const inMins = parseTimeToMinutes(a.checkIn);
    let outMins = parseTimeToMinutes(a.checkOut);
    if (inMins !== null) {
      if (outMins === null && a.date === todayStr) {
        const n = new Date();
        outMins = n.getHours() * 60 + n.getMinutes();
      }
      if (outMins !== null && outMins >= inMins) {
        totalMinutes += outMins - inMins;
      }
    }
  });
  const totalHoursDisplay = totalMinutes > 0
    ? `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`
    : "0h 0m";

  // 3. Total Absent Days (Respecting Join Date & Library Holidays)
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const currentDay = now.getDate();

  const joinDateRaw = profile?.created_at || user?.created_at;
  const joinDate = joinDateRaw ? new Date(joinDateRaw) : null;
  const startDay = (joinDate && joinDate.getFullYear() === currentYear && joinDate.getMonth() === currentMonth)
    ? Math.max(1, joinDate.getDate())
    : 1;

  // Count declared holidays in student's active enrolled period of this month
  let holidaysInPeriod = 0;
  for (let day = startDay; day <= currentDay; day++) {
    const yyyy = currentYear;
    const mm = String(currentMonth + 1).padStart(2, "0");
    const dd = String(day).padStart(2, "0");
    const dateStr = `${yyyy}-${mm}-${dd}`;
    if (holidays.some((h) => h.date === dateStr)) {
      holidaysInPeriod++;
    }
  }

  let thisMonthPresent = 0;
  uniquePresentDates.forEach((d) => {
    const parsedD = new Date(d);
    if (parsedD.getMonth() === currentMonth && parsedD.getFullYear() === currentYear) {
      if (parsedD.getDate() >= startDay) {
        thisMonthPresent++;
      }
    }
  });

  const totalDaysInPeriod = Math.max(0, currentDay - startDay + 1);
  const workingDaysInPeriod = Math.max(0, totalDaysInPeriod - holidaysInPeriod);
  const totalAbsentDays = Math.max(0, workingDaysInPeriod - thisMonthPresent);

  // 4. Today Present or Absent
  const todayRecord = attendanceList.find((a) => a.date === todayStr);
  const isCheckedInToday = !!todayRecord && !todayRecord.checkOut;
  const todayHoliday = holidays.find((h) => h.date === todayStr);

  const supabaseCount = attendanceList.filter(a => a.source !== "d1_archive").length;
  const d1Count = attendanceList.filter(a => a.source === "d1_archive").length;

  const calcDuration = (inT: string, outT?: string | null): string => {
    if (!outT || outT === "In Progress" || outT === "—") return "In Progress";
    const inMins = parseTimeToMinutes(inT);
    const outMins = parseTimeToMinutes(outT);
    if (inMins === null || outMins === null || outMins < inMins) return "—";
    const diff = outMins - inMins;
    const h = Math.floor(diff / 60);
    const m = diff % 60;
    if (h > 0 && m > 0) return `${h}h ${m}m`;
    if (h > 0) return `${h}h`;
    return `${m}m`;
  };

  interface AttendanceSessionItem {
    id: string;
    sessionNumber: number;
    checkIn: string;
    checkOut: string;
    duration: string;
    method: 'nfc' | 'qr' | 'admin' | 'stamp';
  }

  interface DayAttendanceGroup {
    id: string;
    date: string;
    seatNumber?: string | null;
    shiftName?: string | null;
    status: string;
    source?: string;
    verificationMethod: 'nfc' | 'qr' | 'admin' | 'stamp';
    sessions: AttendanceSessionItem[];
  }

  const rawFiltered = attendanceList.filter(a => {
    if (sourceFilter === "supabase") return a.source !== "d1_archive";
    if (sourceFilter === "d1") return a.source === "d1_archive";
    return true;
  });

  const dayGroupsMap = new Map<string, DayAttendanceGroup>();

  rawFiltered.forEach(rec => {
    const dateKey = rec.date || todayStr;
    const existing = dayGroupsMap.get(dateKey);

    const inTimes = (rec.checkIn || "").split(",").map(t => t.trim()).filter(Boolean);
    const outTimes = (rec.checkOut || "").split(",").map(t => t.trim()).filter(Boolean);
    const count = Math.max(inTimes.length, outTimes.length, 1);

    const recSessions: AttendanceSessionItem[] = [];
    for (let i = 0; i < count; i++) {
      const cIn = inTimes[i] || (inTimes.length > 0 ? inTimes[inTimes.length - 1] : "—");
      let cOut = outTimes[i] || null;
      if (!cOut) {
        cOut = (i === count - 1 && (!rec.checkOut || rec.checkOut === "In Progress")) ? "In Progress" : "—";
      }

      let meth: 'nfc' | 'qr' | 'admin' | 'stamp' = rec.verificationMethod || 'qr';
      if (!rec.verificationMethod) {
        if (rec.seatNumber === "MASTER" || rec.seatNumber === "A-03" || rec.seatNumber === "#A-03" || (dateKey === todayStr && typeof window !== "undefined" && localStorage.getItem("genius_last_att_method") === "nfc")) {
          meth = "nfc";
        } else if (rec.status?.toLowerCase().includes("admin") || rec.status?.toLowerCase().includes("manual")) {
          meth = "admin";
        }
      }

      recSessions.push({
        id: `${rec.id || dateKey}-${i}`,
        sessionNumber: i + 1,
        checkIn: cIn,
        checkOut: cOut,
        duration: calcDuration(cIn, cOut),
        method: meth,
      });
    }

    if (existing) {
      existing.sessions.push(...recSessions);
      if (rec.seatNumber && !existing.seatNumber) existing.seatNumber = rec.seatNumber;
      if (rec.verificationMethod) existing.verificationMethod = rec.verificationMethod;
    } else {
      let dayMeth: 'nfc' | 'qr' | 'admin' | 'stamp' = rec.verificationMethod || 'qr';
      if (!rec.verificationMethod) {
        if (rec.seatNumber === "MASTER" || rec.seatNumber === "A-03" || rec.seatNumber === "#A-03" || (dateKey === todayStr && typeof window !== "undefined" && localStorage.getItem("genius_last_att_method") === "nfc")) {
          dayMeth = "nfc";
        } else if (rec.status?.toLowerCase().includes("admin") || rec.status?.toLowerCase().includes("manual")) {
          dayMeth = "admin";
        }
      }

      dayGroupsMap.set(dateKey, {
        id: rec.id || dateKey,
        date: dateKey,
        seatNumber: rec.seatNumber,
        shiftName: rec.shiftName,
        status: rec.status,
        source: rec.source,
        verificationMethod: dayMeth,
        sessions: recSessions,
      });
    }
  });

  const groupedDays: DayAttendanceGroup[] = Array.from(dayGroupsMap.values()).map(day => {
    const seen = new Set<string>();
    const uniqueSessions = day.sessions.filter(s => {
      const k = `${s.checkIn}_${s.checkOut}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    uniqueSessions.forEach((s, idx) => {
      s.sessionNumber = idx + 1;
    });

    return {
      ...day,
      sessions: uniqueSessions.length > 0 ? uniqueSessions : [{
        id: `${day.id}-empty`,
        sessionNumber: 1,
        checkIn: "—",
        checkOut: "—",
        duration: "—",
        method: day.verificationMethod,
      }],
    };
  });

  const allFlatRows = groupedDays.flatMap(day => 
    day.sessions.map(s => ({
      ...s,
      date: day.date,
      seatNumber: day.seatNumber || (profile?.seat_number ? `Desk #${profile.seat_number}` : "Library"),
      shiftName: day.shiftName || profile?.shift || "General Shift",
      dayStatus: day.status || "present",
    }))
  );

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-3xl bg-white p-6 shadow-xs border border-[#E5E7EB] dark:border-zinc-800 dark:bg-[#0A2E5C]">
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
            <UserCheck className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-[#0A2E5C] dark:text-white">
              My Attendance & Desk History
            </h1>
            <p className="text-xs text-zinc-500">
              View your verified check-ins and complete past attendance history.
            </p>
          </div>
        </div>

        <div>
          {/* Single Mark Attendance Button (QR Scan with Silent Anti-Proxy Photo Capture) */}
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("open_student_qr_scanner"))}
            className="inline-flex items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:to-teal-800 px-6 py-3.5 text-xs font-black text-white shadow-lg shadow-emerald-600/25 transition active:scale-95 cursor-pointer"
          >
            <QrCode className="h-4 w-4" />
            <span>{isCheckedInToday ? "Mark Check-Out" : "Mark Attendance"}</span>
          </button>
        </div>
      </div>

      {/* Holiday / Library Closure Notice */}
      {todayHoliday && (
        <div className="rounded-3xl border-2 border-rose-500 bg-gradient-to-r from-rose-50 via-red-50 to-orange-50 dark:border-rose-600 dark:bg-rose-950/40 p-5 sm:p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-600 text-white shadow-md shadow-rose-600/30">
              <CalendarX2 className="h-6 w-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-600 text-white">
                  Notice: Library Closed Today
                </span>
                <span className="text-xs font-bold text-rose-800 dark:text-rose-200">
                  {todayHoliday.title}
                </span>
              </div>
              <h3 className="text-sm font-black text-rose-950 dark:text-rose-100 mt-1">
                {todayHoliday.reason || "The library is closed today by administration."}
              </h3>
              <p className="text-xs text-rose-800/90 dark:text-rose-300 mt-0.5 font-medium">
                🛡️ <strong>Attendance Protected:</strong> You are not required to check in today. Today is an exempt holiday and will not be marked as absent.
              </p>
            </div>
          </div>
          <span className="self-start sm:self-auto shrink-0 text-xs font-black text-rose-700 dark:text-rose-200 bg-white/90 dark:bg-rose-900/60 px-3 py-1.5 rounded-xl border border-rose-200 dark:border-rose-700 shadow-xs">
            Exempt From Absence
          </span>
        </div>
      )}

      {/* 4 User Requested KPI Cards: 1. Total Days, 2. Total Hours, 3. Total Absent, 4. Today Present/Absent */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        {/* KPI 1: Total Days */}
        <div className="rounded-3xl border border-zinc-200 bg-white p-3.5 sm:p-5 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C]">
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <div className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
              <Calendar className="h-4 w-4" />
            </div>
            <span className="text-[9px] sm:text-[10px] font-bold text-blue-600 uppercase">Days</span>
          </div>
          <p className="text-[10px] sm:text-xs font-bold text-zinc-500 truncate">Total Days</p>
          <p className="text-xl sm:text-2xl font-black text-[#0A2E5C] dark:text-white mt-0.5 sm:mt-1">{totalPresentDays} Days</p>
          <p className="text-[9px] sm:text-[10px] font-semibold text-emerald-600 mt-1 truncate">
            Verified Attendance
          </p>
        </div>

        {/* KPI 2: Total Hours */}
        <div className="rounded-3xl border border-zinc-200 bg-white p-3.5 sm:p-5 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C]">
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <div className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
              <Clock className="h-4 w-4" />
            </div>
            <span className="text-[9px] sm:text-[10px] font-bold text-purple-600 uppercase">Study</span>
          </div>
          <p className="text-[10px] sm:text-xs font-bold text-zinc-500 truncate">Total Hours</p>
          <p className="text-xl sm:text-2xl font-black text-[#0A2E5C] dark:text-white mt-0.5 sm:mt-1">{totalHoursDisplay}</p>
          <p className="text-[9px] sm:text-[10px] font-semibold text-purple-600 mt-1 truncate">
            Recorded Study Time
          </p>
        </div>

        {/* KPI 3: Total Absent */}
        <div className="rounded-3xl border border-zinc-200 bg-white p-3.5 sm:p-5 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C]">
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <div className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-rose-100 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400">
              <AlertCircle className="h-4 w-4" />
            </div>
            <span className="text-[9px] sm:text-[10px] font-bold text-rose-600 uppercase">Absents</span>
          </div>
          <p className="text-[10px] sm:text-xs font-bold text-zinc-500 truncate">Total Absent</p>
          <p className="text-xl sm:text-2xl font-black text-[#0A2E5C] dark:text-white mt-0.5 sm:mt-1">{totalAbsentDays} Days</p>
          <p className="text-[9px] sm:text-[10px] font-semibold text-zinc-400 mt-1 truncate">
            {holidaysInPeriod > 0 ? `Holidays exempt (${holidaysInPeriod}d)` : "Current Cycle"}
          </p>
        </div>

        {/* KPI 4: Today Present or Absent or Holiday */}
        <div className="rounded-3xl border border-zinc-200 bg-white p-3.5 sm:p-5 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C]">
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <div className={`flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl ${
              todayRecord 
                ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400" 
                : (todayHoliday 
                    ? "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
                    : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400")
            }`}>
              {todayHoliday && !todayRecord ? <CalendarX2 className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
            </div>
            <span className={`text-[9px] sm:text-[10px] font-bold uppercase ${
              todayRecord 
                ? "text-emerald-600" 
                : (todayHoliday ? "text-amber-700 dark:text-amber-400" : "text-zinc-400")
            }`}>
              Today
            </span>
          </div>
          <p className="text-[10px] sm:text-xs font-bold text-zinc-500 truncate">Today's Status</p>
          <p className={`text-sm sm:text-xl font-black mt-0.5 sm:mt-1 truncate ${
            todayRecord 
              ? "text-emerald-600 dark:text-emerald-400" 
              : (todayHoliday ? "text-amber-700 dark:text-amber-400" : "text-zinc-500 dark:text-zinc-400")
          }`}>
            {todayRecord ? (todayRecord.checkOut ? "Completed" : "Present") : (todayHoliday ? "Holiday (Exempt)" : "Absent")}
          </p>
          <p className="text-[9px] sm:text-[10px] font-semibold text-zinc-400 mt-1 truncate">
            {todayRecord 
              ? (todayRecord.checkOut ? `Out: ${todayRecord.checkOut}` : `In: ${todayRecord.checkIn} (#${todayRecord.seatNumber || 'Desk'})`) 
              : (todayHoliday ? `Library closed today (${todayHoliday.title}). Not marked absent.` : "Scan QR at desk to mark present")}
          </p>
        </div>
      </div>

      {/* Attendance History Log Table */}
      <div className="rounded-3xl border border-[#E5E7EB] bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-zinc-100 dark:border-zinc-800 mb-4">
          <div className="flex items-center gap-2">
            <CalendarCheck className="h-5 w-5 text-emerald-600" />
            <h3 className="text-sm font-bold text-[#0A2E5C] dark:text-white">Attendance History</h3>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* View Switcher: Cards vs Table */}
            <div className="flex items-center gap-1 bg-[#F8FAFC] dark:bg-zinc-800 p-1 rounded-xl text-[11px] font-bold border border-zinc-200/60 dark:border-zinc-700/60">
              <button
                type="button"
                onClick={() => setViewMode("cards")}
                className={`px-2.5 py-1 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                  viewMode === "cards"
                    ? "bg-white dark:bg-zinc-700 text-[#0A2E5C] dark:text-white shadow-xs"
                    : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400"
                }`}
                title="Cards View"
              >
                <LayoutGrid className="h-3.5 w-3.5 text-emerald-600" />
                <span>Cards</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className={`px-2.5 py-1 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                  viewMode === "table"
                    ? "bg-white dark:bg-zinc-700 text-[#0A2E5C] dark:text-white shadow-xs"
                    : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400"
                }`}
                title="Table View"
              >
                <TableIcon className="h-3.5 w-3.5 text-emerald-600" />
                <span>Table</span>
              </button>
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1 bg-[#F8FAFC] dark:bg-zinc-800 p-1 rounded-xl text-[11px] font-bold">
              <button
                onClick={() => setSourceFilter("all")}
                className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                  sourceFilter === "all" ? "bg-white dark:bg-zinc-700 text-[#0A2E5C] dark:text-white shadow-xs" : "text-zinc-500"
                }`}
              >
                All ({attendanceList.length})
              </button>
              <button
                onClick={() => setSourceFilter("supabase")}
                className={`px-2.5 py-1 rounded-lg transition cursor-pointer flex items-center gap-1 ${
                  sourceFilter === "supabase" ? "bg-white dark:bg-zinc-700 text-emerald-600 shadow-xs" : "text-zinc-500"
                }`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block" />
                Recent ({supabaseCount})
              </button>
              <button
                onClick={() => setSourceFilter("d1")}
                className={`px-2.5 py-1 rounded-lg transition cursor-pointer flex items-center gap-1 ${
                  sourceFilter === "d1" ? "bg-white dark:bg-zinc-700 text-purple-600 shadow-xs" : "text-zinc-500"
                }`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-purple-500 inline-block" />
                Older History ({d1Count})
              </button>
            </div>

            <button
              onClick={() => loadData(1)}
              disabled={isLoading}
              className="text-xs font-bold text-[#0B5ED7] dark:text-[#FFC107] hover:underline flex items-center gap-1 cursor-pointer ml-1"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} /> Refresh
            </button>
          </div>
        </div>

        {groupedDays.length === 0 ? (
          <div className="py-12 text-center text-xs text-zinc-400">
            No attendance records found for this view.
          </div>
        ) : viewMode === "cards" ? (
          /* Card View: Sessions listed neatly below each other */
          <div className="space-y-4">
            {groupedDays.map((att) => (
              <IntersectionLazyItem key={att.id} estimatedHeight={120}>
                <div className="p-4 sm:p-5 rounded-2xl bg-[#F8FAFC]/50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 hover:border-[#FFC107]/50 transition space-y-3">
                  {/* Day Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#0A2E5C] text-[#FFC107] font-mono font-black text-xs border border-[#FFC107]/30 shadow-xs">
                        {att.seatNumber ? (att.seatNumber.startsWith("#") ? att.seatNumber : `#${att.seatNumber}`) : (profile?.seat_number ? `#${profile.seat_number}` : "Desk")}
                      </div>

                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-black text-[#0A2E5C] dark:text-white">{att.date}</p>
                          <span className="px-2 py-0.5 rounded bg-[#0A2E5C] text-[#FFC107] font-mono text-[10px] font-bold">
                            {att.seatNumber ? `Desk ${att.seatNumber.startsWith('#') ? att.seatNumber : `#${att.seatNumber}`}` : "Desk Reserved"}
                          </span>
                          <span className="text-[10px] text-zinc-400 font-semibold hidden sm:inline">•</span>
                          <span className="text-[11px] text-zinc-500 font-medium hidden sm:inline">
                            {att.shiftName || profile?.shift || "Evening Shift"}
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 sm:hidden">
                          {att.shiftName || profile?.shift || "Evening Shift"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-start sm:self-center flex-wrap">
                      {att.verificationMethod === "stamp" ? (
                        <span className="text-[10px] font-bold text-amber-800 bg-amber-50 dark:bg-amber-950/60 dark:text-amber-300 px-2.5 py-1 rounded-lg border border-amber-200 dark:border-amber-800 flex items-center gap-1.5 shadow-xs">
                          <CheckCircle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                          <span>Touch Stamp Verified</span>
                        </span>
                      ) : att.verificationMethod === "nfc" ? (
                        <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 dark:bg-emerald-950/60 dark:text-emerald-300 px-2.5 py-1 rounded-lg border border-emerald-200 dark:border-emerald-800 flex items-center gap-1.5 shadow-xs">
                          <Smartphone className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                          <span>NFC Stand Verified</span>
                        </span>
                      ) : att.verificationMethod === "admin" ? (
                        <span className="text-[10px] font-bold text-purple-800 bg-purple-50 dark:bg-purple-950/60 dark:text-purple-300 px-2.5 py-1 rounded-lg border border-purple-200 dark:border-purple-800 flex items-center gap-1.5 shadow-xs">
                          <ShieldCheck className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
                          <span>Admin Verified</span>
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-blue-800 bg-blue-50 dark:bg-blue-950/60 dark:text-blue-300 px-2.5 py-1 rounded-lg border border-blue-200 dark:border-blue-800 flex items-center gap-1.5 shadow-xs">
                          <QrCode className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                          <span>QR Scan Verified</span>
                        </span>
                      )}
                      <span className="text-[10px] font-black text-emerald-700 bg-emerald-100 dark:bg-emerald-950/80 dark:text-emerald-300 px-2.5 py-1 rounded-lg uppercase">
                        {att.status.toUpperCase()}
                      </span>
                    </div>
                  </div>

                  {/* Sessions breakdown: each checkin & checkout shift placed just below */}
                  <div className="space-y-2 pt-2 border-t border-zinc-200/60 dark:border-zinc-700/60">
                    {att.sessions.map((sess) => (
                      <div
                        key={sess.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between p-2.5 rounded-xl bg-white/90 dark:bg-zinc-800/90 border border-zinc-200/80 dark:border-zinc-700/80 gap-2 text-xs"
                      >
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <span className="h-5 w-5 rounded-md bg-[#0A2E5C] text-[#FFC107] flex items-center justify-center text-[10px] font-bold">
                            S{sess.sessionNumber}
                          </span>
                          <span className="text-zinc-500 font-medium">Check-In:</span>
                          <strong className="text-emerald-700 dark:text-emerald-400 font-bold font-mono">
                            {sess.checkIn}
                          </strong>
                          <ArrowRight className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                          <span className="text-zinc-500 font-medium">Check-Out:</span>
                          <strong className={`font-mono font-bold ${sess.checkOut === "In Progress" ? "text-amber-600 animate-pulse" : "text-rose-600 dark:text-rose-400"}`}>
                            {sess.checkOut}
                          </strong>
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-auto text-[11px]">
                          <span className="px-2 py-0.5 rounded-md bg-[#F8FAFC] dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 font-bold">
                            ⏱ {sess.duration}
                          </span>
                          <span className="text-[10px] font-bold text-zinc-400">
                            {sess.method === "nfc" ? "NFC Stand" : (sess.method === "admin" ? "Admin Desk" : "Desk QR")}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </IntersectionLazyItem>
            ))}
          </div>
        ) : (
          /* Table View: Full tabular breakdown */
          <div className="overflow-x-auto rounded-2xl border border-zinc-200 dark:border-zinc-700">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F8FAFC] dark:bg-zinc-800 text-[10px] font-black uppercase text-zinc-500 tracking-wider">
                <tr>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Desk</th>
                  <th className="py-3 px-4">Shift</th>
                  <th className="py-3 px-4">Session</th>
                  <th className="py-3 px-4">Check-In</th>
                  <th className="py-3 px-4">Check-Out</th>
                  <th className="py-3 px-4">Duration</th>
                  <th className="py-3 px-4">Verification Method</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200/70 dark:divide-zinc-700/70 bg-white dark:bg-zinc-900">
                {allFlatRows.map((row) => (
                  <tr key={row.id} className="hover:bg-[#F8FAFC]/50 dark:hover:bg-zinc-800/50 transition">
                    <td className="py-3 px-4 font-bold text-[#0A2E5C] dark:text-white whitespace-nowrap">{row.date}</td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded bg-[#0A2E5C] text-[#FFC107] font-mono font-bold text-[10px]">
                        {row.seatNumber ? (row.seatNumber.startsWith('#') ? row.seatNumber : `#${row.seatNumber}`) : "Desk"}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-zinc-500 font-medium whitespace-nowrap">{row.shiftName}</td>
                    <td className="py-3 px-4 font-bold text-zinc-600 dark:text-zinc-300">Session {row.sessionNumber}</td>
                    <td className="py-3 px-4 font-bold text-emerald-700 dark:text-emerald-400 whitespace-nowrap font-mono">{row.checkIn}</td>
                    <td className="py-3 px-4 font-bold whitespace-nowrap font-mono">
                      {row.checkOut === "In Progress" ? <span className="text-amber-600 animate-pulse">In Progress</span> : <span className="text-rose-600 dark:text-rose-400">{row.checkOut}</span>}
                    </td>
                    <td className="py-3 px-4 text-zinc-500 font-bold whitespace-nowrap">⏱ {row.duration}</td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {row.method === "stamp" ? (
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-amber-800 bg-amber-50 dark:bg-amber-950/60 dark:text-amber-300 px-2 py-0.5 rounded-md border border-amber-200 dark:border-amber-800">
                          <CheckCircle className="h-3 w-3 text-amber-600" /> Touch Stamp
                        </span>
                      ) : row.method === "nfc" ? (
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-emerald-800 bg-emerald-50 dark:bg-emerald-950/60 dark:text-emerald-300 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800">
                          <Smartphone className="h-3 w-3 text-emerald-600" /> NFC Stand
                        </span>
                      ) : row.method === "admin" ? (
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-purple-800 bg-purple-50 dark:bg-purple-950/60 dark:text-purple-300 px-2 py-0.5 rounded-md border border-purple-200 dark:border-purple-800">
                          <ShieldCheck className="h-3 w-3 text-purple-600" /> Admin Staff
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-blue-800 bg-blue-50 dark:bg-blue-950/60 dark:text-blue-300 px-2 py-0.5 rounded-md border border-blue-200 dark:border-blue-800">
                          <QrCode className="h-3 w-3 text-blue-600" /> Desk QR
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300">
                        {row.dayStatus}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Load More History Button */}
        {hasMore && (
          <div className="mt-6 pt-4 border-t border-zinc-100 dark:border-zinc-800 flex justify-center">
            <button
              onClick={handleLoadMoreFromD1}
              disabled={isLoadingMore}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-2xl bg-[#0A2E5C] text-[#FFC107] hover:bg-[#2A3447] text-xs font-bold shadow-sm transition active:scale-95 cursor-pointer disabled:opacity-50"
            >
              <Archive className={`h-4 w-4 ${isLoadingMore ? "animate-spin" : ""}`} />
              <span>
                {isLoadingMore ? "Loading older records..." : "Load Older Attendance History"}
              </span>
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
