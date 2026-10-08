"use client";

/**
 * [WEB • PAGE] Operational Reports
 *
 * Daily/monthly reports with CSV/PDF export via the Worker.
 */
import { useState, useEffect, useMemo } from "react";
import { 
  FileText, 
  Download, 
  Calendar, 
  Filter, 
  Printer, 
  CheckCircle2, 
  IndianRupee, 
  Users, 
  Clock, 
  Armchair,
  FileSpreadsheet,
  AlertCircle,
  TrendingUp,
  UserPlus,
  UserMinus,
  Mail,
  Search,
  RefreshCw,
  Sparkles
} from "lucide-react";
import { 
  getStudents, 
  getAttendance, 
  getFees, 
  getSeats,
  triggerDailyBackupReport,
  getDailyReportDownloadUrl,
  StudentRecord, 
  AttendanceRecord, 
  FeeRecord, 
  Seat 
} from "@/lib/api";
import { BRAND_CONFIG } from "@/lib/config";

type TimeframeType = "daily" | "weekly" | "monthly" | "yearly" | "custom";

export default function AdminReportsPage() {
  const [timeframe, setTimeframe] = useState<TimeframeType>("monthly");
  
  // Date states
  const todayStr = new Date().toISOString().split("T")[0];
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [selectedMonth, setSelectedMonth] = useState<string>("2026-09");
  const [selectedYear, setSelectedYear] = useState<string>("2026");
  const [customStartDate, setCustomStartDate] = useState<string>(
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
  );
  const [customEndDate, setCustomEndDate] = useState<string>(todayStr);
  const [selectedShift, setSelectedShift] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<"students" | "attendance" | "fees">("students");
  const [searchQuery, setSearchQuery] = useState("");

  // Data states
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [fees, setFees] = useState<FeeRecord[]>([]);
  const [seats, setSeats] = useState<Seat[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Action states
  const [isExporting, setIsExporting] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Load all foundational records
  const loadData = async () => {
    setLoading(true);
    try {
      const [studentsRes, attendanceRes, feesRes, seatsRes] = await Promise.allSettled([
        getStudents(),
        getAttendance(),
        getFees(),
        getSeats(),
      ]);

      if (studentsRes.status === "fulfilled") setStudents(studentsRes.value || []);
      if (attendanceRes.status === "fulfilled") setAttendance(attendanceRes.value || []);
      if (feesRes.status === "fulfilled") setFees(feesRes.value || []);
      if (seatsRes.status === "fulfilled") setSeats(seatsRes.value?.seats || []);
    } catch (err) {
      console.error("Failed to load reports data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const showToast = (text: string, type: "success" | "error" = "success") => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage(null), 5000);
  };

  // Determine active date boundary [startDate, endDate]
  const dateRangeBounds = useMemo(() => {
    let start = "";
    let end = "";

    if (timeframe === "daily") {
      start = selectedDate;
      end = selectedDate;
    } else if (timeframe === "weekly") {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      start = d.toISOString().split("T")[0];
      end = todayStr;
    } else if (timeframe === "monthly") {
      const [yr, mo] = selectedMonth.split("-");
      start = `${yr}-${mo}-01`;
      const lastDay = new Date(parseInt(yr, 10), parseInt(mo, 10), 0).getDate();
      end = `${yr}-${mo}-${String(lastDay).padStart(2, "0")}`;
    } else if (timeframe === "yearly") {
      start = `${selectedYear}-01-01`;
      end = `${selectedYear}-12-31`;
    } else if (timeframe === "custom") {
      start = customStartDate;
      end = customEndDate;
    }

    return { start, end };
  }, [timeframe, selectedDate, selectedMonth, selectedYear, customStartDate, customEndDate, todayStr]);

  // Filter Attendance records in range & shift
  const filteredAttendance = useMemo(() => {
    const { start, end } = dateRangeBounds;
    return attendance.filter((a) => {
      const inDate = a.date >= start && a.date <= end;
      if (!inDate) return false;
      if (selectedShift !== "all") {
        const shiftMatch = a.shiftName?.toLowerCase().includes(selectedShift.toLowerCase());
        if (!shiftMatch) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesStudent = a.studentName?.toLowerCase().includes(q);
        const matchesSeat = a.seatNumber?.toLowerCase().includes(q);
        if (!matchesStudent && !matchesSeat) return false;
      }
      return true;
    });
  }, [attendance, dateRangeBounds, selectedShift, searchQuery]);

  // Filter Fee records in range
  const filteredFees = useMemo(() => {
    const { start, end } = dateRangeBounds;
    return fees.filter((f) => {
      const recordDate = f.paidAt ? f.paidAt.split("T")[0] : f.dueDate || f.createdAt?.split("T")[0] || "";
      const inDate = recordDate >= start && recordDate <= end;
      if (!inDate) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesStudent = f.studentName?.toLowerCase().includes(q);
        const matchesReceipt = f.receiptNo?.toLowerCase().includes(q);
        if (!matchesStudent && !matchesReceipt) return false;
      }
      return true;
    });
  }, [fees, dateRangeBounds, searchQuery]);

  // Filter Students based on shift and search
  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      if (selectedShift !== "all") {
        const shiftMatch = s.shift?.toLowerCase().includes(selectedShift.toLowerCase());
        if (!shiftMatch) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = s.fullName?.toLowerCase().includes(q);
        const matchesCode = s.studentCode?.toLowerCase().includes(q);
        const matchesPhone = s.phone?.toLowerCase().includes(q);
        const matchesSeat = s.seatNumber?.toLowerCase().includes(q);
        if (!matchesName && !matchesCode && !matchesPhone && !matchesSeat) return false;
      }
      return true;
    });
  }, [students, selectedShift, searchQuery]);

  // KPI Calculations
  const stats = useMemo(() => {
    const { start, end } = dateRangeBounds;

    // Total Revenue collected in window
    const revenue = filteredFees
      .filter((f) => f.paid)
      .reduce((sum, f) => sum + (f.amount || 0), 0);

    // Total Pending Dues across library
    const totalPending = fees
      .filter((f) => !f.paid)
      .reduce((sum, f) => sum + (f.amount || 0), 0);

    // Total Enrolled Students
    const totalEnrolled = students.length;

    // Students Added in window
    const studentsAdded = students.filter((s) => {
      const joinDate = s.createdAt ? s.createdAt.split("T")[0] : "";
      return joinDate >= start && joinDate <= end;
    }).length;

    // Students Left / Discontinued in window
    const studentsLeft = students.filter((s) => {
      if (s.status !== "suspended") return false;
      const updateDate = s.updatedAt ? s.updatedAt.split("T")[0] : s.createdAt?.split("T")[0] || "";
      return updateDate >= start && updateDate <= end;
    }).length;

    // Attendance counts
    const presentStudentIds = new Set(
      filteredAttendance
        .filter((a) => a.status === "present" || a.status === "in_progress" || a.status === "completed" || a.checkIn)
        .map((a) => a.studentId)
    );
    const presentCount = presentStudentIds.size;
    const absentCount = Math.max(0, totalEnrolled - presentCount);

    const suspendedCount = students.filter((s) => s.status === "suspended").length;
    const trialCount = students.filter((s) => s.membershipPlan?.toLowerCase().includes("trial") || (s as any).isTrial).length;

    // Peak Hour Time calculation from attendance check-in timestamps
    const hourHistogram: Record<number, number> = {};
    filteredAttendance.forEach((a) => {
      if (!a.checkIn) return;
      let hour = -1;
      const timeUpper = a.checkIn.toUpperCase();
      const parts = timeUpper.match(/(\d+):(\d+)(?:\s*(AM|PM))?/);
      if (parts) {
        let h = parseInt(parts[1], 10);
        const meridiem = parts[3];
        if (meridiem === "PM" && h < 12) h += 12;
        if (meridiem === "AM" && h === 12) h = 0;
        hour = h;
      }
      if (hour >= 0 && hour <= 23) {
        hourHistogram[hour] = (hourHistogram[hour] || 0) + 1;
      }
    });

    let peakHour = 10;
    let peakCount = 0;
    Object.entries(hourHistogram).forEach(([hrStr, count]) => {
      if (count > peakCount) {
        peakCount = count;
        peakHour = parseInt(hrStr, 10);
      }
    });

    const formatHour = (h: number) => {
      const ampm = h >= 12 ? "PM" : "AM";
      const displayH = h % 12 || 12;
      return `${displayH}:00 ${ampm}`;
    };

    const peakHourFormatted = peakCount > 0 
      ? `${formatHour(peakHour)} - ${formatHour(peakHour + 2)}` 
      : "10:00 AM - 01:00 PM (Typical)";

    return {
      revenue,
      totalPending,
      totalEnrolled,
      studentsAdded,
      studentsLeft,
      presentCount,
      absentCount,
      suspendedCount,
      trialCount,
      peakHourFormatted,
      peakCount,
    };
  }, [filteredFees, fees, students, filteredAttendance, dateRangeBounds]);

  // Master Student Sheet Builder matching official 14-column report + Student Name
  const masterStudentRows = useMemo(() => {
    const { start, end } = dateRangeBounds;

    return filteredStudents.map((std, idx) => {
      // Find today or range attendance for this student
      const studentAtts = attendance.filter(
        (a) => a.studentId === std.id && a.date >= start && a.date <= end
      );
      const latestAtt = studentAtts[0];
      const attCount = studentAtts.length;
      const isPresent = Boolean(latestAtt && (latestAtt.status === 'present' || latestAtt.checkIn));

      // Fees & dues for this student
      const studentFees = fees.filter((f) => f.studentId === std.id);
      const paidInWindow = studentFees
        .filter((f) => f.paid && f.paidAt && f.paidAt.split("T")[0] >= start && f.paidAt.split("T")[0] <= end)
        .reduce((sum, f) => sum + (f.amount || 0), 0);
      const studentTotalDue = studentFees
        .filter((f) => !f.paid)
        .reduce((sum, f) => sum + (f.amount || 0), 0);
      const latestReceipt = studentFees.find((f) => f.receiptNo)?.receiptNo || "-";

      const isNew = Boolean(std.createdAt && std.createdAt.split("T")[0] >= start && std.createdAt.split("T")[0] <= end);
      const isTrial = Boolean(std.membershipPlan?.toLowerCase().includes("trial") || (std as any).isTrial);

      // Membership display: Reserved <Seat>, General / Trial, General / Desk
      let membership = std.membershipPlan || "General / Desk";
      if (std.seatNumber) {
        membership = `Reserved ${std.seatNumber}`;
      } else if (isTrial) {
        membership = "General / Trial";
      } else if (!membership.includes("/")) {
        membership = `${membership} / Desk`;
      }

      // Renewal date formatted DD/MM/YYYY
      let renewDate = "—";
      if (std.createdAt) {
        try {
          const d = new Date(std.createdAt);
          d.setMonth(d.getMonth() + 1);
          renewDate = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
        } catch {}
      }

      // Join date formatted DD/MM/YYYY
      let joinDate = "—";
      if (std.createdAt) {
        try {
          const d = new Date(std.createdAt);
          joinDate = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
        } catch {}
      }

      // UPI Claims reference
      const upiFee = studentFees.find((f) => f.receiptNo?.includes("UPI") || f.description?.includes("UTR"));
      const upiClaims = upiFee ? (upiFee.receiptNo || "UTR LOGGED") : "—";

      // Status: Active | Suspend | Pending
      const statusDisplay = std.status === "suspended" ? "Suspend" : (std.status === "pending" ? "Pending" : "Active");

      // Fees: Paid | Due
      const feeDisplay = (std.feeStatus === "Paid" || (studentTotalDue === 0 && paidInWindow > 0)) ? "Paid" : "Due";

      return {
        id: std.id,
        no: idx + 1,
        code: std.studentCode || `SDL-${String(idx + 1).padStart(3, "0")}`,
        name: std.fullName || "Student",
        membership,
        status: statusDisplay,
        fees: feeDisplay,
        renewDate,
        attendance: isPresent ? "Present" : "Absent",
        checkIn: latestAtt?.checkIn || "—",
        checkOut: latestAtt?.checkOut || (latestAtt?.checkIn ? "In Hall" : "—"),
        upiClaims,
        mobNo: std.phone ? std.phone.replace(/[^0-9]/g, "").slice(-10) : "—",
        course: std.course || "General",
        joinDate,
        seat: std.seatNumber || latestAtt?.seatNumber || "-",
        shift: std.shift || latestAtt?.shiftName || "General",
        attCount,
        paidInWindow,
        totalDue: studentTotalDue,
        latestReceipt,
        isNew,
        isTrial,
      };
    });
  }, [filteredStudents, attendance, fees, dateRangeBounds]);

  // Export to CSV Function with exact 14 columns matching user screenshot
  const handleExportCSV = () => {
    setIsExporting(true);
    try {
      const headers = [
        "NO",
        "STUDENT ID",
        "STUDENT NAME",
        "MEMBERSHIP",
        "STATUS",
        "FEES",
        "RENEW DATE",
        "ATTENDANCE",
        "CHECK-IN",
        "CHECKOUT",
        "UPI CLAIMS",
        "MOB NO",
        "COURSE",
        "JOIN DATE"
      ];

      const rows = masterStudentRows.map((r, idx) => [
        idx + 1,
        `"${r.code}"`,
        `"${r.name}"`,
        `"${r.membership}"`,
        `"${r.status}"`,
        `"${r.fees}"`,
        `"${r.renewDate}"`,
        `"${r.attendance}"`,
        `"${r.checkIn}"`,
        `"${r.checkOut}"`,
        `"${r.upiClaims}"`,
        `"${r.mobNo}"`,
        `"${r.course}"`,
        `"${r.joinDate}"`
      ]);

      const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `Daily_Student_Operations_Report_${timeframe}_${dateRangeBounds.start}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      showToast(`Exported ${masterStudentRows.length} student records to CSV!`);
    } catch (err: any) {
      showToast(`CSV Export error: ${err.message}`, "error");
    } finally {
      setIsExporting(false);
    }
  };

  // Dispatch Nightly Backup Email Trigger
  const handleSendNightlyBackupEmail = async () => {
    setIsSendingEmail(true);
    try {
      const res = await triggerDailyBackupReport();
      if (res.success) {
        showToast(`✓ Nightly Report Sheet successfully compiled and emailed to ${BRAND_CONFIG.adminEmail || BRAND_CONFIG.email}!`);
      } else {
        showToast(`Email trigger returned notice: ${res.error || "Check Resend API Key"}`, "error");
      }
    } catch (err: any) {
      showToast(`Failed to trigger email report: ${err.message}`, "error");
    } finally {
      setIsSendingEmail(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`p-3.5 rounded-2xl border text-xs font-bold flex items-center justify-between shadow-lg transition-all animate-fadeIn ${
            toastMessage.type === "success"
              ? "bg-emerald-50 border-emerald-300 text-emerald-900 dark:bg-emerald-950/40 dark:border-emerald-700 dark:text-emerald-200"
              : "bg-rose-50 border-rose-300 text-rose-900 dark:bg-rose-950/40 dark:border-rose-700 dark:text-rose-200"
          }`}
        >
          <div className="flex items-center gap-2.5">
            {toastMessage.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <AlertCircle className="h-4 w-4 text-rose-600 dark:text-rose-400" />
            )}
            <span>{toastMessage.text}</span>
          </div>
          <button
            onClick={() => setToastMessage(null)}
            className="text-[10px] uppercase font-black tracking-wider opacity-60 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Top Banner (Matches User Screenshot) */}
      <div className="rounded-3xl bg-[#0A2E5C] text-white p-5 sm:p-6 shadow-md border border-[#2d3748] print:hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
              Daily Student Operations Report
            </h1>
            <p className="text-xs sm:text-sm text-zinc-300 font-medium mt-1">
              Generated based on system daily logs and attendance records
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleSendNightlyBackupEmail}
              disabled={isSendingEmail}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-amber-500/20 text-amber-200 border border-amber-400/30 text-xs font-bold hover:bg-amber-500/30 transition cursor-pointer disabled:opacity-50"
              title="Dispatches nightly report with PDF & CSV attachments"
            >
              <Mail className="h-4 w-4 text-amber-300" />
              {isSendingEmail ? "Sending..." : "Send Nightly Email (PDF + CSV)"}
            </button>

            <a
              href={getDailyReportDownloadUrl("pdf", dateRangeBounds.start)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-blue-600/30 text-blue-200 border border-blue-400/30 text-xs font-bold hover:bg-blue-600/40 transition cursor-pointer"
            >
              <Download className="h-4 w-4 text-blue-300" /> Download PDF
            </a>

            <button
              onClick={handleExportCSV}
              disabled={isExporting}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-600/30 text-emerald-200 border border-emerald-400/30 text-xs font-bold hover:bg-emerald-600/40 transition cursor-pointer disabled:opacity-50"
            >
              <FileSpreadsheet className="h-4 w-4 text-emerald-300" /> Download CSV
            </button>

            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/10 text-white border border-white/20 text-xs font-bold hover:bg-white/20 transition cursor-pointer"
            >
              <Printer className="h-4 w-4 text-white" /> Print Report
            </button>
          </div>
        </div>
      </div>

      {/* Printable Letterhead (Visible ONLY during window.print()) */}
      <div className="hidden print:block border-b-2 border-[#0A2E5C] pb-4 mb-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-black text-[#0A2E5C] tracking-tight uppercase">
              {BRAND_CONFIG.name}
            </h1>
            <p className="text-xs text-zinc-600 font-semibold mt-0.5">
              {BRAND_CONFIG.address}
            </p>
            <p className="text-[11px] text-zinc-500">
              Helpline: {BRAND_CONFIG.phone} | Email: {BRAND_CONFIG.email}
            </p>
          </div>
          <div className="text-right">
            <div className="text-xs font-bold uppercase text-[#0B5ED7]">Official Library Audit Report</div>
            <div className="text-xs text-zinc-600 mt-1">
              Timeframe: <strong className="uppercase">{timeframe}</strong> ({dateRangeBounds.start} to {dateRangeBounds.end})
            </div>
            <div className="text-[10px] text-zinc-400 mt-0.5">
              Generated: {new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
            </div>
          </div>
        </div>
      </div>

      {/* Control Panel & Parameter Controls */}
      <div className="p-4 sm:p-5 rounded-3xl border border-[#E5E7EB] bg-white dark:border-zinc-800 dark:bg-[#0A2E5C] shadow-xs space-y-4 print:hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          
          {/* Timeframe Selector Pills */}
          <div className="flex items-center gap-1.5 p-1 bg-[#F8FAFC] dark:bg-zinc-800/80 rounded-2xl overflow-x-auto">
            {(["daily", "weekly", "monthly", "yearly", "custom"] as TimeframeType[]).map((t) => {
              const active = timeframe === t;
              const labels: Record<TimeframeType, string> = {
                daily: "Per Day",
                weekly: "Weekly (7d)",
                monthly: "Monthly",
                yearly: "Yearly",
                custom: "Custom Date Range",
              };
              return (
                <button
                  key={t}
                  onClick={() => setTimeframe(t)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                    active
                      ? "bg-[#0A2E5C] text-[#FFC107] shadow-xs"
                      : "text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white"
                  }`}
                >
                  {labels[t]}
                </button>
              );
            })}
          </div>

          {/* Shift Filter Dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Shift:</span>
            <select
              value={selectedShift}
              onChange={(e) => setSelectedShift(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-[#E5E7EB] bg-[#F8F7F4] dark:border-zinc-700 dark:bg-zinc-800 text-xs font-bold text-[#0A2E5C] dark:text-white"
            >
              <option value="all">All Shifts &amp; Plans</option>
              <option value="standard">Standard (3 Hours Pass)</option>
              <option value="prime">Pro / Prime (6 Hours Pass)</option>
              <option value="reserve">Reserved Dedicated Desks</option>
              <option value="night">Night Shift Ultra (10 PM - 06 AM)</option>
            </select>

            <button
              onClick={loadData}
              title="Refresh Data"
              className="p-2 rounded-xl border border-[#E5E7EB] bg-white text-zinc-600 hover:bg-[#F8FAFC] dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Dynamic Secondary Date Filters */}
        <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800/80 flex flex-wrap items-center gap-3">
          {timeframe === "daily" && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-zinc-500">Select Date:</span>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-[#E5E7EB] bg-white text-xs font-bold text-[#0A2E5C] dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              />
              <span className="text-[11px] text-zinc-400">
                (Report for single 24-hr day ledger)
              </span>
            </div>
          )}

          {timeframe === "weekly" && (
            <div className="text-xs text-zinc-500 font-semibold flex items-center gap-2">
              <Calendar className="h-3.5 w-3.5 text-[#0B5ED7]" />
              Showing last 7 rolling days from <strong>{dateRangeBounds.start}</strong> to <strong>{dateRangeBounds.end}</strong>
            </div>
          )}

          {timeframe === "monthly" && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-zinc-500">Select Month:</span>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-[#E5E7EB] bg-white text-xs font-bold text-[#0A2E5C] dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              />
              <span className="text-[11px] text-zinc-400">
                (Full month register from 1st to last date)
              </span>
            </div>
          )}

          {timeframe === "yearly" && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-zinc-500">Select Year:</span>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-[#E5E7EB] bg-white text-xs font-bold text-[#0A2E5C] dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              >
                <option value="2026">Year 2026</option>
                <option value="2025">Year 2025</option>
                <option value="2027">Year 2027</option>
              </select>
            </div>
          )}

          {timeframe === "custom" && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-zinc-500">From:</span>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-[#E5E7EB] bg-white text-xs font-bold text-[#0A2E5C] dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              />
              <span className="text-xs font-bold text-zinc-500">To:</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-[#E5E7EB] bg-white text-xs font-bold text-[#0A2E5C] dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              />
            </div>
          )}

          <div className="ml-auto text-[11px] font-bold text-zinc-400">
            Active Period: <span className="text-[#0B5ED7] dark:text-[#FFC107] font-mono">{dateRangeBounds.start}</span> to <span className="text-[#0B5ED7] dark:text-[#FFC107] font-mono">{dateRangeBounds.end}</span>
          </div>
        </div>
      </div>

      {/* 8 KPI Cards Row (Matches User Screenshot) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 sm:gap-3.5">
        {/* 1. TOTAL STUDENTS */}
        <div className="p-3.5 sm:p-4 rounded-2xl bg-white border border-zinc-200 dark:border-zinc-800 dark:bg-[#0A2E5C] text-center shadow-xs">
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-400">
            TOTAL STUDENTS
          </div>
          <div className="mt-1.5 text-2xl font-black text-blue-600 dark:text-blue-400">
            {stats.totalEnrolled}
          </div>
        </div>

        {/* 2. NEW STUDENTS */}
        <div className="p-3.5 sm:p-4 rounded-2xl bg-white border border-zinc-200 dark:border-zinc-800 dark:bg-[#0A2E5C] text-center shadow-xs">
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-400">
            NEW STUDENTS
          </div>
          <div className="mt-1.5 text-2xl font-black text-emerald-600 dark:text-emerald-400">
            +{stats.studentsAdded}
          </div>
        </div>

        {/* 3. COLLECTED FEES */}
        <div className="p-3.5 sm:p-4 rounded-2xl bg-white border border-zinc-200 dark:border-zinc-800 dark:bg-[#0A2E5C] text-center shadow-xs">
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-400">
            COLLECTED FEES
          </div>
          <div className="mt-1.5 text-2xl font-black text-emerald-600 dark:text-emerald-400">
            ₹{stats.revenue.toLocaleString("en-IN")}
          </div>
        </div>

        {/* 4. DUE FEES */}
        <div className="p-3.5 sm:p-4 rounded-2xl bg-white border border-zinc-200 dark:border-zinc-800 dark:bg-[#0A2E5C] text-center shadow-xs">
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-400">
            DUE FEES
          </div>
          <div className="mt-1.5 text-2xl font-black text-amber-600 dark:text-amber-500">
            ₹{stats.totalPending.toLocaleString("en-IN")}
          </div>
        </div>

        {/* 5. PRESENT */}
        <div className="p-3.5 sm:p-4 rounded-2xl bg-white border border-zinc-200 dark:border-zinc-800 dark:bg-[#0A2E5C] text-center shadow-xs">
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-400">
            PRESENT
          </div>
          <div className="mt-1.5 text-2xl font-black text-zinc-800 dark:text-zinc-100">
            {stats.presentCount}
          </div>
        </div>

        {/* 6. ABSENT */}
        <div className="p-3.5 sm:p-4 rounded-2xl bg-white border border-zinc-200 dark:border-zinc-800 dark:bg-[#0A2E5C] text-center shadow-xs">
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-400">
            ABSENT
          </div>
          <div className="mt-1.5 text-2xl font-black text-rose-600 dark:text-rose-500">
            {stats.absentCount}
          </div>
        </div>

        {/* 7. SUSPENDED */}
        <div className="p-3.5 sm:p-4 rounded-2xl bg-white border border-zinc-200 dark:border-zinc-800 dark:bg-[#0A2E5C] text-center shadow-xs">
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-400">
            SUSPENDED
          </div>
          <div className="mt-1.5 text-2xl font-black text-rose-600 dark:text-rose-500">
            {String(stats.suspendedCount).padStart(2, "0")}
          </div>
        </div>

        {/* 8. TRIAL */}
        <div className="p-3.5 sm:p-4 rounded-2xl bg-white border border-zinc-200 dark:border-zinc-800 dark:bg-[#0A2E5C] text-center shadow-xs">
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-400">
            TRIAL
          </div>
          <div className="mt-1.5 text-2xl font-black text-zinc-800 dark:text-zinc-100">
            {String(stats.trialCount).padStart(2, "0")}
          </div>
        </div>
      </div>

      {/* Section Title matching screenshot */}
      <div className="flex items-center gap-2.5 pt-2">
        <div className="w-1.5 h-6 bg-blue-600 rounded-full" />
        <h2 className="text-sm font-black uppercase tracking-wider text-[#0A2E5C] dark:text-white">
          STUDENT ACTIVITY & MEMBERSHIP RECORDS
        </h2>
      </div>

      {/* Main Interactive Table Card */}
      <div className="rounded-3xl border border-[#E5E7EB] bg-white shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C] overflow-hidden">
        
        {/* Table Tabs & Search Filter Header */}
        <div className="p-4 sm:p-5 border-b border-zinc-100 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
          <div className="flex items-center gap-1.5 bg-[#F8FAFC] dark:bg-zinc-800 p-1 rounded-2xl">
            <button
              onClick={() => setActiveTab("students")}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                activeTab === "students"
                  ? "bg-[#0A2E5C] text-[#FFC107] shadow-xs"
                  : "text-zinc-500 hover:text-black dark:hover:text-white"
              }`}
            >
              All Students Master Sheet ({masterStudentRows.length})
            </button>
            <button
              onClick={() => setActiveTab("attendance")}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                activeTab === "attendance"
                  ? "bg-[#0A2E5C] text-[#FFC107] shadow-xs"
                  : "text-zinc-500 hover:text-black dark:hover:text-white"
              }`}
            >
              Attendance History ({filteredAttendance.length})
            </button>
            <button
              onClick={() => setActiveTab("fees")}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                activeTab === "fees"
                  ? "bg-[#0A2E5C] text-[#FFC107] shadow-xs"
                  : "text-zinc-500 hover:text-black dark:hover:text-white"
              }`}
            >
              Revenue & Invoices ({filteredFees.length})
            </button>
          </div>

          <div className="relative min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
            <input
              type="text"
              placeholder="Search student, seat, invoice..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-[#E5E7EB] bg-[#F8F7F4] text-xs font-semibold text-[#0A2E5C] placeholder:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
            />
          </div>
        </div>

        {/* Tab 1: Comprehensive 14-Column Master Student Sheet (Matches User Screenshot) */}
        {activeTab === "students" && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs whitespace-nowrap">
              <thead className="bg-[#101726] text-white uppercase tracking-wider font-black text-[10px]">
                <tr>
                  <th className="py-3 px-3 text-center">NO</th>
                  <th className="py-3 px-3">STUDENT ID</th>
                  <th className="py-3 px-3">STUDENT NAME</th>
                  <th className="py-3 px-3">MEMBERSHIP</th>
                  <th className="py-3 px-3 text-center">STATUS</th>
                  <th className="py-3 px-3 text-center">FEES</th>
                  <th className="py-3 px-3">RENEW DATE</th>
                  <th className="py-3 px-3 text-center">ATTENDANCE</th>
                  <th className="py-3 px-3">CHECK-IN</th>
                  <th className="py-3 px-3">CHECKOUT</th>
                  <th className="py-3 px-3">UPI CLAIMS</th>
                  <th className="py-3 px-3">MOB NO</th>
                  <th className="py-3 px-3">COURSE</th>
                  <th className="py-3 px-3">JOIN DATE</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/80 font-medium">
                {masterStudentRows.length === 0 ? (
                  <tr>
                    <td colSpan={14} className="py-12 text-center text-zinc-400">
                      No student records found matching this timeframe or search criteria.
                    </td>
                  </tr>
                ) : (
                  masterStudentRows.map((r) => (
                    <tr
                      key={r.id || r.no}
                      className="hover:bg-[#FDFCFB] dark:hover:bg-zinc-800/40 transition-colors"
                    >
                      {/* 1. NO */}
                      <td className="py-3 px-3 text-center font-bold text-zinc-500">
                        {r.no}
                      </td>

                      {/* 2. STUDENT ID */}
                      <td className="py-3 px-3 font-extrabold text-[#0A2E5C] dark:text-white font-mono">
                        {r.code}
                      </td>

                      {/* 3. STUDENT NAME (The user requested addition!) */}
                      <td className="py-3 px-3 font-bold text-[#0A2E5C] dark:text-white">
                        <div className="flex items-center gap-1.5">
                          <span>{r.name}</span>
                          {r.isTrial && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-amber-100 text-amber-800 border border-amber-300">
                              TRIAL
                            </span>
                          )}
                          {r.isNew && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                              NEW
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 4. MEMBERSHIP */}
                      <td className="py-3 px-3 text-zinc-700 dark:text-zinc-300 font-medium">
                        {r.membership}
                      </td>

                      {/* 5. STATUS */}
                      <td className="py-3 px-3 text-center">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-md text-[10px] font-bold ${
                            r.status === "Active"
                              ? "bg-emerald-100 text-emerald-800 border border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300"
                              : r.status === "Suspend"
                              ? "bg-rose-100 text-rose-800 border border-rose-200 dark:bg-rose-950 dark:text-rose-300"
                              : "bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-950 dark:text-amber-300"
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>

                      {/* 6. FEES */}
                      <td className="py-3 px-3 text-center">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-md text-[10px] font-bold ${
                            r.fees === "Paid"
                              ? "bg-blue-100 text-blue-800 border border-blue-200 dark:bg-blue-950 dark:text-blue-300"
                              : "bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-950 dark:text-amber-300"
                          }`}
                        >
                          {r.fees}
                        </span>
                      </td>

                      {/* 7. RENEW DATE */}
                      <td className="py-3 px-3 font-mono text-zinc-600 dark:text-zinc-300 text-[11px]">
                        {r.renewDate}
                      </td>

                      {/* 8. ATTENDANCE */}
                      <td className="py-3 px-3 text-center">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-md text-[10px] font-bold ${
                            r.attendance === "Present"
                              ? "bg-emerald-100 text-emerald-800 border border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300"
                              : "bg-rose-100 text-rose-800 border border-rose-200 dark:bg-rose-950 dark:text-rose-300"
                          }`}
                        >
                          {r.attendance}
                        </span>
                      </td>

                      {/* 9. CHECK-IN */}
                      <td className="py-3 px-3 font-mono text-[11px] text-zinc-700 dark:text-zinc-300">
                        {r.checkIn}
                      </td>

                      {/* 10. CHECKOUT */}
                      <td className="py-3 px-3 font-mono text-[11px] text-zinc-700 dark:text-zinc-300">
                        {r.checkOut}
                      </td>

                      {/* 11. UPI CLAIMS */}
                      <td className="py-3 px-3 font-mono text-[11px] text-zinc-600 dark:text-zinc-400">
                        {r.upiClaims}
                      </td>

                      {/* 12. MOB NO */}
                      <td className="py-3 px-3 font-mono text-[11px] text-zinc-600 dark:text-zinc-400">
                        {r.mobNo}
                      </td>

                      {/* 13. COURSE */}
                      <td className="py-3 px-3 text-zinc-700 dark:text-zinc-300 font-medium">
                        {r.course}
                      </td>

                      {/* 14. JOIN DATE */}
                      <td className="py-3 px-3 font-mono text-zinc-600 dark:text-zinc-300 text-[11px]">
                        {r.joinDate}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 2: Attendance History Register */}
        {activeTab === "attendance" && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#FAF9F6] text-zinc-500 uppercase tracking-wider font-extrabold text-[10px] border-b border-zinc-200 dark:bg-zinc-900/60 dark:border-zinc-800">
                <tr>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Student Name</th>
                  <th className="py-3 px-4">Desk Allotted</th>
                  <th className="py-3 px-4">Shift Name</th>
                  <th className="py-3 px-4">Gate Check-In</th>
                  <th className="py-3 px-4">Gate Check-Out</th>
                  <th className="py-3 px-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/80 font-medium">
                {filteredAttendance.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-zinc-400">
                      No attendance logs recorded in this period.
                    </td>
                  </tr>
                ) : (
                  filteredAttendance.map((a) => (
                    <tr
                      key={a.id}
                      className="hover:bg-[#FDFCFB] dark:hover:bg-zinc-800/40 transition-colors"
                    >
                      <td className="py-3 px-4 font-mono text-[11px] font-bold text-zinc-600 dark:text-zinc-300">
                        {a.date}
                      </td>
                      <td className="py-3 px-4 font-bold text-[#0A2E5C] dark:text-white">
                        {a.studentName}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-[#0B5ED7] dark:text-[#FFC107]">
                        {a.seatNumber ? `Desk #${a.seatNumber}` : "General Hall"}
                      </td>
                      <td className="py-3 px-4 text-zinc-600 dark:text-zinc-300">
                        {a.shiftName || "Standard (3 Hours Pass)"}
                      </td>
                      <td className="py-3 px-4 text-emerald-700 dark:text-emerald-400 font-bold">
                        {a.checkIn}
                      </td>
                      <td className="py-3 px-4 text-zinc-500">
                        {a.checkOut || <span className="text-blue-600 font-semibold">Active In Hall</span>}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-emerald-100 text-emerald-800">
                          {a.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 3: Revenue & Invoices Ledger */}
        {activeTab === "fees" && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#FAF9F6] text-zinc-500 uppercase tracking-wider font-extrabold text-[10px] border-b border-zinc-200 dark:bg-zinc-900/60 dark:border-zinc-800">
                <tr>
                  <th className="py-3 px-4">Receipt / Invoice #</th>
                  <th className="py-3 px-4">Student Name</th>
                  <th className="py-3 px-4">Fee Description</th>
                  <th className="py-3 px-4">Payment Date</th>
                  <th className="py-3 px-4 text-right">Amount Paid</th>
                  <th className="py-3 px-4 text-right">Balance Due</th>
                  <th className="py-3 px-4 text-center">Payment Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/80 font-medium">
                {filteredFees.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-zinc-400">
                      No financial transactions recorded in this period.
                    </td>
                  </tr>
                ) : (
                  filteredFees.map((f) => (
                    <tr
                      key={f.id}
                      className="hover:bg-[#FDFCFB] dark:hover:bg-zinc-800/40 transition-colors"
                    >
                      <td className="py-3 px-4 font-mono font-bold text-[#0B5ED7] dark:text-[#FFC107]">
                        {f.receiptNo || "INV-GEN"}
                      </td>
                      <td className="py-3 px-4 font-bold text-[#0A2E5C] dark:text-white">
                        {f.studentName}
                      </td>
                      <td className="py-3 px-4 text-zinc-600 dark:text-zinc-300">
                        {f.description || f.type || "Monthly Membership Fee"}
                      </td>
                      <td className="py-3 px-4 text-zinc-500 font-mono text-[11px]">
                        {f.paidAt ? f.paidAt.split("T")[0] : f.dueDate || "—"}
                      </td>
                      <td className="py-3 px-4 text-right font-extrabold text-emerald-600 dark:text-emerald-400">
                        ₹{f.amount?.toLocaleString("en-IN") || 0}
                      </td>
                      <td className="py-3 px-4 text-right font-extrabold text-rose-600">
                        {f.remainingDue && f.remainingDue > 0 ? `₹${f.remainingDue}` : "₹0"}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                            f.paid
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-rose-100 text-rose-800"
                          }`}
                        >
                          {f.paid ? "PAID" : "DUE"}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

      </div>
    </div>
  );
}
