"use client";

/**
 * [WEB • PAGE] Seat Matrix Management
 *
 * Allocate/vacate seats, lockers, disputes and live occupancy grid.
 */
import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import {
  Armchair, RefreshCw, Settings2, Plus, Search,
  User, Lock, CalendarCheck, AlertTriangle, LayoutGrid, List, Grid3X3,
  Table as TableIcon, CheckCircle2, Info, QrCode, Download,
  Printer, X, Filter, Sparkles, Check, ChevronDown,
  Layers, SlidersHorizontal, ArrowUpDown, FileDown, AlertCircle, Trash2,
  Radio, Smartphone
} from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { createClient } from "@/lib/supabase/client";
import { isMasterAdminEmail } from "@/lib/config";
import { getStudents, getFees, getAttendance } from "@/lib/api";
import { matchSeatNumber, parseDeskNum, formatDeskId } from "@/lib/seatUtils";

interface SeatData {
  id: string;
  row: string;
  col: string;
  zone: string;
  hasLocker: boolean;
  status: "available" | "occupied" | "reserved" | "locker" | "disabled";
  occupantName?: string;
  occupantEmail?: string;
  occupantPhone?: string;
  occupantShift?: string;
  lastCheckedIn?: string;
  feeStatus?: "Paid" | "Due";
  dueAmount?: number;
  yesterdayAttendance?: "Present" | "Absent";
  yesterdayTime?: string;
  todayAttendanceStatus?: "active" | "present" | "absent";
  todayCheckInTime?: string;
  todayCheckOutTime?: string;
}

export default function SeatManagementPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [activeTab, setActiveTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSeatId, setSelectedSeatId] = useState<string>("1");
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);

  // Add Seats Modal States
  const [isAddSeatModalOpen, setIsAddSeatModalOpen] = useState(false);
  const [newSeatCount, setNewSeatCount] = useState(1);
  const [newSeatHasLocker, setNewSeatHasLocker] = useState(false);

  // Delete Seats Modal States
  const [isDeleteSeatsModalOpen, setIsDeleteSeatsModalOpen] = useState(false);
  const [selectedSeatsToDelete, setSelectedSeatsToDelete] = useState<string[]>([]);
  const [deleteSearchQuery, setDeleteSearchQuery] = useState("");

  // Attach Locker Modal States
  const [isAttachLockerModalOpen, setIsAttachLockerModalOpen] = useState(false);
  const [targetLockerSeat, setTargetLockerSeat] = useState<string>("1");

  // Toast Notification
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Master Stand & NFC States
  const [isMasterStandModalOpen, setIsMasterStandModalOpen] = useState(false);
  const [masterQrDataUrl, setMasterQrDataUrl] = useState<string | null>(null);
  const [isWritingNfc, setIsWritingNfc] = useState(false);

  // 100 library desks (Numbered 01 to 100, continuous floor layout without sections)
  const defaultSeats100: SeatData[] = Array.from({ length: 100 }, (_, i) => {
    const num = i + 1;
    const id = String(num).padStart(2, "0");
    const hasLocker = [8, 15, 23, 34, 42, 55, 68, 77, 86, 94].includes(num);
    return {
      id,
      row: "",
      col: String(num),
      zone: "Main Hall",
      hasLocker,
      status: hasLocker ? "locker" : "available",
    };
  });

  const [seats, setSeats] = useState<SeatData[]>(defaultSeats100);

  // Fetch live profiles and enrolled students to sync real seat occupants
  useEffect(() => {
    let initialSeats = defaultSeats100;
    try {
      const savedStr = localStorage.getItem("genius_seats_100_v2");
      if (savedStr) {
        const parsed = JSON.parse(savedStr);
        if (Array.isArray(parsed) && parsed.length === 100) {
          initialSeats = parsed;
          setSeats(initialSeats);
        }
      } else {
        localStorage.setItem("genius_seats_100_v2", JSON.stringify(defaultSeats100));
      }
    } catch (e) {}

    const fetchLiveSeats = async () => {
      try {
        const todayStr = new Date().toISOString().split("T")[0];
        const [enrolledStudents, feesList, attendanceList] = await Promise.all([
          getStudents().catch(() => []),
          getFees().catch(() => []),
          getAttendance({ date: todayStr }).catch(() => []),
        ]);
        const supabase = createClient();
        const { data: profiles } = await supabase
          .from("profiles")
          .select("*")
          .not("seat_number", "is", null);

        const allAssignedStudents: any[] = [];
        if (profiles && profiles.length > 0) {
          profiles.forEach((p: any) => {
            if (p.seat_number && p.status === "active" && p.role !== "admin" && !isMasterAdminEmail(p.email)) {
              const profileDue = Number(p.due_amount || 0);
              const isProfileDue = p.fee_status === "Due" || profileDue > 0;
              const isReserved =
                p.membership_plan === "Reserved Seat" ||
                p.is_reserved === true ||
                String(p.membership_plan || "").toLowerCase().includes("reserved");

              allAssignedStudents.push({
                seatNumber: p.seat_number,
                fullName: p.full_name || "Enrolled Student",
                email: p.email,
                phone: p.phone,
                shift: p.shift,
                studentId: p.id,
                feeStatus: isProfileDue ? "Due" : "Paid",
                dueAmount: profileDue > 0 ? profileDue : (isProfileDue ? 800 : 0),
                membershipPlan: p.membership_plan,
                isReserved,
              });
            }
          });
        }

        // Also merge any assigned students from getStudents() if not already in list
        if (Array.isArray(enrolledStudents) && enrolledStudents.length > 0) {
          enrolledStudents.forEach((std: any) => {
            const seatNo = std.seatNumber || std.seat_number;
            if (seatNo && (std.status === "active" || !std.status)) {
              const already = allAssignedStudents.some(
                (p) => p.studentId === std.id || (p.email && p.email === std.email) || (p.fullName && p.fullName === (std.fullName || std.name))
              );
              if (!already) {
                const plan = std.membershipPlan || std.membership_plan || "General";
                const isReserved =
                  plan === "Reserved Seat" ||
                  std.is_reserved === true ||
                  String(plan).toLowerCase().includes("reserved");

                allAssignedStudents.push({
                  seatNumber: seatNo,
                  fullName: std.fullName || std.name || "Enrolled Student",
                  email: std.email,
                  phone: std.phone,
                  shift: std.shift,
                  studentId: std.id,
                  feeStatus: std.feeStatus === "Due" ? "Due" : "Paid",
                  dueAmount: std.dueAmount || 0,
                  membershipPlan: plan,
                  isReserved,
                });
              }
            }
          });
        }

        if (allAssignedStudents.length > 0) {
          setSeats((prev) => {
            const nextSeats = prev.map((seat) => {
              const matched = allAssignedStudents.find((p: any) => {
                return matchSeatNumber(p.seatNumber, seat.id);
              });

              if (matched) {
                const studentFees = (feesList || []).filter((f: any) => f.studentId === matched.studentId || f.studentName?.toLowerCase() === matched.fullName?.toLowerCase());
                const dueFees = studentFees.filter((f: any) => !f.paid);
                const totalDueFromFees = dueFees.reduce((sum: number, f: any) => sum + (f.amount || 0), 0);

                // Authoritative Single Source of Truth: Supabase profiles
                const profileDueAmount = matched.dueAmount || 0;
                const effectiveDueAmount = profileDueAmount > 0 ? profileDueAmount : totalDueFromFees;
                const isDue = matched.feeStatus === "Due" || effectiveDueAmount > 0;

                const todayAtt = (attendanceList || []).find((att: any) => 
                  att.studentId === matched.studentId || 
                  matchSeatNumber(att.seatNumber, seat.id) ||
                  (att.studentName && matched.fullName && att.studentName.toLowerCase() === matched.fullName.toLowerCase())
                );

                const hasCheckedInToday = !!todayAtt && (todayAtt.status === "in_progress" || todayAtt.status === "completed" || !!todayAtt.checkIn);
                const hasCheckedOutToday = !!todayAtt && !!todayAtt.checkOut && todayAtt.checkOut !== "In Progress" && todayAtt.checkOut !== "—";

                let todayStatus: "active" | "present" | "absent" = "absent";
                if (hasCheckedInToday) {
                  todayStatus = hasCheckedOutToday ? "present" : "active";
                }

                // If student has a Reserved Seat membership plan, the seat is strictly "reserved" (Red)
                // If regular/flexi/general student, the seat is "occupied" (Blue)
                const assignedStatus: SeatData["status"] = matched.isReserved ? "reserved" : "occupied";

                return {
                  ...seat,
                  status: assignedStatus,
                  occupantName: matched.fullName,
                  occupantEmail: matched.email,
                  occupantPhone: matched.phone,
                  occupantShift: matched.shift || "Evening Shift (06:00 PM - 10:00 PM)",
                  feeStatus: (isDue ? "Due" : "Paid") as "Paid" | "Due",
                  dueAmount: isDue ? (effectiveDueAmount || 800) : 0,
                  yesterdayAttendance: (hasCheckedInToday ? "Present" : "Absent") as "Present" | "Absent",
                  yesterdayTime: hasCheckedInToday ? "08:30 AM - 01:00 PM" : "-",
                  lastCheckedIn: todayAtt?.checkIn ? `Today, ${todayAtt.checkIn}` : "-",
                  todayAttendanceStatus: todayStatus,
                  todayCheckInTime: todayAtt?.checkIn || undefined,
                  todayCheckOutTime: todayAtt?.checkOut || undefined,
                };
              }

              return {
                ...seat,
                occupantName: undefined,
                occupantEmail: undefined,
                occupantPhone: undefined,
                occupantShift: undefined,
                feeStatus: undefined,
                dueAmount: undefined,
                yesterdayAttendance: undefined,
                yesterdayTime: undefined,
                lastCheckedIn: undefined,
                todayAttendanceStatus: undefined,
                status: (seat.status === "disabled" ? "disabled" : seat.hasLocker ? "locker" : "available") as SeatData["status"],
              };
            });

            try {
              if (typeof window !== "undefined") {
                localStorage.setItem("genius_seats_100_v2", JSON.stringify(nextSeats));
              }
            } catch (e) {}

            return nextSeats;
          });
        }
        } catch (err) {
        console.error("Error fetching live student seat links:", err);
      }
    };

    fetchLiveSeats();

    const handleProfileUpdated = (event: any) => {
      const updated = event.detail;
      if (!updated?.id && !updated?.phone) return;
      setSeats((prev) =>
        prev.map((s) => {
          if (
            (updated.seat_number && matchSeatNumber(updated.seat_number, s.id)) ||
            (s.occupantEmail && updated.email && s.occupantEmail.toLowerCase() === updated.email.toLowerCase()) ||
            (s.occupantName && updated.full_name && s.occupantName.toLowerCase() === updated.full_name.toLowerCase())
          ) {
            return {
              ...s,
              occupantPhone: updated.phone || s.occupantPhone,
              occupantName: updated.full_name || s.occupantName,
            };
          }
          return s;
        })
      );
    };

    if (typeof window !== "undefined") {
      window.addEventListener("student_profile_updated", handleProfileUpdated);
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("student_profile_updated", handleProfileUpdated);
      }
    };
  }, []);

  const selectedSeat = seats.find((s) => s.id === selectedSeatId) || seats[0] || {
    id: "1",
    row: "",
    col: "1",
    zone: "Hall",
    hasLocker: false,
    status: "available",
  };

  // Filter seats for main page (1 to 75 desks, no zones)
  const filteredSeats = seats.filter((s) => {
    const matchesTab =
      activeTab === "all" ||
      (activeTab === "available" && (s.status === "available" || s.status === "locker")) ||
      (activeTab === "occupied" && s.status === "occupied") ||
      (activeTab === "reserved" && s.status === "reserved") ||
      (activeTab === "locker" && s.hasLocker) ||
      (activeTab === s.status);

    const matchesSearch =
      !searchQuery.trim() ||
      s.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      `seat ${s.id}`.includes(searchQuery.toLowerCase()) ||
      `#${s.id}`.includes(searchQuery.toLowerCase()) ||
      (s.occupantName && s.occupantName.toLowerCase().includes(searchQuery.toLowerCase()));

    return matchesTab && matchesSearch;
  });

  const sortedSeats = [...filteredSeats].sort((a, b) => (parseInt(a.id) || 0) - (parseInt(b.id) || 0));

  // Calculate Metrics
  const totalCount = seats.length;
  const availableCount = seats.filter(s => s.status === "available" || s.status === "locker").length;
  const occupiedCount = seats.filter(s => s.status === "occupied").length;
  const reservedCount = seats.filter(s => s.status === "reserved").length;
  const lockerCount = seats.filter(s => s.hasLocker).length;
  const disabledCount = seats.filter(s => s.status === "disabled").length;

  const getStatusBadge = (status: SeatData["status"]) => {
    switch (status) {
      case "available":
        return "bg-emerald-600 text-white border-emerald-700 dark:bg-emerald-600";
      case "occupied":
        return "bg-blue-600 text-white border-blue-700 dark:bg-blue-600";
      case "reserved":
        return "bg-red-600 text-white border-red-700 dark:bg-red-600";
      case "locker":
        return "bg-violet-600 text-white border-violet-700 dark:bg-violet-600";
      case "disabled":
        return "bg-zinc-400 text-zinc-100 border-zinc-500 dark:bg-zinc-700 dark:text-zinc-300";
      default:
        return "bg-emerald-600 text-white";
    }
  };


  // Open Entrance Master Standee Poster & NFC Modal
  const handleOpenMasterStandModal = async () => {
    try {
      const payload = "https://geniuslibrary.librarywale.in/attendance";
      const dataUrl = await QRCode.toDataURL(payload, {
        width: 600,
        margin: 2,
        color: {
          dark: "#0A2E5C",
          light: "#FFFFFF",
        },
        errorCorrectionLevel: "H",
      });
      setMasterQrDataUrl(dataUrl);
      setIsMasterStandModalOpen(true);
    } catch (err) {
      console.error("Failed to generate master QR:", err);
    }
  };

  // Web NFC Tag Programmer (Writes Master Gate URL to physical NFC tag)
  const handleProgramNfcTag = async () => {
    if (typeof window === "undefined" || !("NDEFReader" in window)) {
      setToastMsg("Web NFC is only supported on NFC-enabled Android devices running Chrome.");
      return;
    }
    try {
      setIsWritingNfc(true);
      const ndef = new (window as any).NDEFReader();
      await ndef.write({
        records: [
          {
            recordType: "url",
            data: "https://geniuslibrary.librarywale.in/attendance",
          },
        ],
      });
      setToastMsg("Success! Physical NFC Stand tag encoded with Entrance Attendance Gate.");
    } catch (err: any) {
      setToastMsg("NFC Write notice: " + (err.message || "Device timed out"));
    } finally {
      setIsWritingNfc(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between no-print">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0A2E5C] text-[#FFC107] shadow-sm">
            <Armchair className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-[#0A2E5C] dark:text-white flex items-center gap-2">
              Seats Management
            </h1>
            <p className="text-xs text-zinc-500">
              Manage physical cubicles, monitor occupancy status, and generate printable A4 / PNG QR desk stickers.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* 1. Add Seats Button */}
          <button
            onClick={() => setIsAddSeatModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-linear-to-r from-[#0B5ED7] to-[#FFC107] px-4 py-2.5 text-xs font-black text-[#0A2E5C] shadow-md shadow-[#0B5ED7]/20 hover:opacity-95 transition active:scale-95 cursor-pointer"
          >
            <Plus className="h-4 w-4 text-[#0A2E5C]" />
            <span>Add Seats</span>
          </button>

          {/* Delete Seats Button */}
          <button
            onClick={() => {
              setSelectedSeatsToDelete([]);
              setIsDeleteSeatsModalOpen(true);
            }}
            className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-bold text-rose-700 hover:bg-rose-100 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-400 dark:hover:bg-rose-950/60 transition active:scale-95 cursor-pointer shadow-xs"
          >
            <Trash2 className="h-4 w-4 text-rose-600 dark:text-rose-400" />
            <span>Delete Seats</span>
          </button>

          {/* 2. Attach Locker Button */}
          <button
            onClick={() => {
              setTargetLockerSeat(selectedSeatId);
              setIsAttachLockerModalOpen(true);
            }}
            className="inline-flex items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3.5 py-2.5 text-xs font-bold text-[#0A2E5C] shadow-xs hover:bg-[#F8FAFC] dark:border-zinc-800 dark:bg-[#0A2E5C] dark:text-white dark:hover:bg-zinc-800 cursor-pointer"
          >
            <Lock className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
            <span>Attach Locker</span>
          </button>
        </div>
      </div>


      {/* Toast Alert Notice */}
      {toastMsg && (
        <div className="p-4 rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300 text-xs font-bold flex items-center justify-between animate-fadeIn no-print shadow-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            <span>{toastMsg}</span>
          </div>
          <button onClick={() => setToastMsg(null)} className="hover:opacity-75 cursor-pointer">✕</button>
        </div>
      )}

      {/* Metrics Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6 no-print">
        {[
          { title: "Total Seats", value: `${totalCount}`, icon: Armchair, color: "emerald", desc: `Desks #1 to #${totalCount}` },
          { title: "With Locker", value: `${lockerCount}`, icon: Lock, color: "purple", desc: `${lockerCount} secure lockers` },
          { title: "Available", value: `${availableCount}`, icon: CheckCircle2, color: "emerald", desc: `${availableCount} desks free` },
          { title: "Occupied", value: `${occupiedCount}`, icon: User, color: "blue", desc: `${occupiedCount} active now` },
          { title: "Reserved", value: `${reservedCount}`, icon: CalendarCheck, color: "rose", desc: `${reservedCount} reserved` },
          { title: "Maintenance", value: `${disabledCount}`, icon: AlertTriangle, color: "zinc", desc: `${disabledCount} disabled` },
        ].map((metric, idx) => (
          <div key={idx} className="rounded-3xl border border-[#E5E7EB] bg-white p-4 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C]">
            <div className="flex items-center gap-3 mb-2">
              <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${metric.color === "emerald" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400" :
                metric.color === "blue" ? "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400" :
                  metric.color === "purple" ? "bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-400" :
                    metric.color === "zinc" ? "bg-zinc-100 text-zinc-600 dark:bg-zinc-850 dark:text-zinc-300" :
                    "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400"
                }`}>
                <metric.icon className="h-4 w-4" />
              </div>
            </div>
            <p className="text-[10px] font-black text-zinc-500 uppercase tracking-wider">{metric.title}</p>
            <span className="text-xl sm:text-2xl font-black text-[#0A2E5C] dark:text-white">{metric.value}</span>
            <span className="text-[9px] text-zinc-400">{metric.desc}</span>
          </div>
        ))}
      </div>

      {/* Main Container - Full Width */}
      <div className="w-full space-y-4 no-print">

        {/* Controls Bar: Mobile responsive & sleek on desktop */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white dark:bg-[#0A2E5C] p-3 sm:p-3.5 rounded-2xl border border-[#E5E7EB]/70 dark:border-zinc-800 shadow-xs">

          {/* Desktop Left: Status Filter Tabs (Hidden on mobile, uses status filter icon dropdown instead) */}
          <div className="hidden sm:flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0 scrollbar-none shrink-0">
            {[
              { id: "all", label: `All (${totalCount})` },
              { id: "available", label: `Available (${availableCount})` },
              { id: "occupied", label: `Occupied (${occupiedCount})` },
              { id: "reserved", label: `Reserved (${reservedCount})` },
              { id: "locker", label: `Lockers (${lockerCount})` },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`whitespace-nowrap rounded-xl px-3 py-1.5 text-[11px] font-bold transition-all cursor-pointer ${activeTab === tab.id
                  ? "bg-[#0A2E5C] text-[#FFC107] shadow-xs border border-[#FFC107]/40 dark:border-zinc-700"
                  : "text-zinc-500 hover:bg-[#F8FAFC] dark:hover:bg-zinc-800"
                  }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Controls: Searchbar + Status Filter (mobile) + Zone Filter + Grid/Table Switcher (icon-only on mobile) */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1 lg:flex-initial sm:justify-end">
            {/* 1. Searchbar */}
            <div className="relative w-full sm:w-52 lg:w-60">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
              <input
                type="text"
                placeholder="Search desk # or student..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 w-full rounded-xl border border-[#E5E7EB] bg-[#F8FAFC]/50 py-1.5 pl-8.5 pr-7 text-xs text-[#0A2E5C] placeholder-zinc-400 focus:border-[#FFC107] focus:outline-none dark:border-zinc-800 dark:bg-zinc-800 dark:text-white transition-all shadow-2xs"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-xs cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Sub-row on mobile (< sm) / same row on desktop */}
            <div className="flex items-center gap-2">
              {/* 2. Filter Icon for Status (Mobile only) */}
              <div className="relative flex sm:hidden items-center flex-1 min-w-0">
                <button
                  type="button"
                  onClick={() => {
                    setIsStatusDropdownOpen(!isStatusDropdownOpen);
                  }}
                  className={`h-9 w-full rounded-xl border py-1.5 pl-7 pr-6 text-xs font-bold transition-all cursor-pointer shadow-2xs flex items-center justify-between text-left ${
                    activeTab !== "all"
                      ? "border-[#FFC107] bg-[#FFC107]/15 text-[#0A2E5C] dark:text-[#FFC107] dark:bg-[#FFC107]/10 font-black"
                      : "border-[#E5E7EB] bg-[#F8FAFC]/60 text-zinc-700 hover:bg-[#F8FAFC] dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-200"
                  }`}
                  title="Filter Status"
                >
                  <Filter className={`absolute left-2.5 h-3.5 w-3.5 pointer-events-none transition-colors ${
                    activeTab !== "all" ? "text-[#0B5ED7] dark:text-[#FFC107]" : "text-zinc-400"
                  }`} />
                  <span className="truncate">
                    {activeTab === "all" ? `Status: All (${totalCount})` :
                     activeTab === "available" ? `Available (${availableCount})` :
                     activeTab === "occupied" ? `Occupied (${occupiedCount})` :
                     activeTab === "reserved" ? `Reserved (${reservedCount})` :
                     `Lockers (${lockerCount})`}
                  </span>
                  <ChevronDown className={`absolute right-2 h-3.5 w-3.5 text-zinc-400 transition-transform duration-200 ${isStatusDropdownOpen ? "rotate-180" : ""}`} />
                </button>

                {/* Status Dropdown Menu - anchored directly underneath */}
                {isStatusDropdownOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setIsStatusDropdownOpen(false)}
                    />
                    <div className="absolute top-full mt-1.5 left-0 w-full min-w-[165px] z-50 rounded-2xl border border-[#E5E7EB] bg-white p-1.5 shadow-xl dark:border-zinc-700 dark:bg-[#0A2E5C] animate-in fade-in zoom-in-95 duration-100">
                      {[
                        { id: "all", label: `Status: All (${totalCount})` },
                        { id: "available", label: `Available (${availableCount})` },
                        { id: "occupied", label: `Occupied (${occupiedCount})` },
                        { id: "reserved", label: `Reserved (${reservedCount})` },
                        { id: "locker", label: `Lockers (${lockerCount})` },
                      ].map(opt => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => {
                            setActiveTab(opt.id);
                            setIsStatusDropdownOpen(false);
                          }}
                          className={`w-full flex items-center justify-between px-3 py-2 text-xs font-bold rounded-xl transition-all text-left cursor-pointer ${
                            activeTab === opt.id
                              ? "bg-[#FFC107]/15 text-[#0B5ED7] dark:text-[#FFC107] font-black"
                              : "text-zinc-700 dark:text-zinc-300 hover:bg-[#F8FAFC] dark:hover:bg-zinc-800"
                          }`}
                        >
                          <span>{opt.label}</span>
                          {activeTab === opt.id && <Check className="h-3.5 w-3.5 text-[#0B5ED7] dark:text-[#FFC107] shrink-0 ml-2" />}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>



              {/* 4. Grid / Table Switcher: icon only on mobile, text + icon on desktop */}
              <div className="flex h-9 items-center rounded-xl bg-zinc-100/90 dark:bg-zinc-800/90 p-1 border border-zinc-200/80 dark:border-zinc-700/80 shrink-0">
                <button
                  onClick={() => setViewMode("table")}
                  className={`h-7 px-2 flex items-center gap-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    viewMode === "table"
                      ? "bg-white text-[#0A2E5C] shadow-xs dark:bg-[#0A2E5C] dark:text-white"
                      : "text-zinc-400 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-300"
                  }`}
                  title="Detailed Table View"
                >
                  <List className="h-4 w-4" />
                  <span className="hidden sm:inline text-[10px]">Table</span>
                </button>
                <button
                  onClick={() => setViewMode("grid")}
                  className={`h-7 px-2 flex items-center gap-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    viewMode === "grid"
                      ? "bg-white text-[#0A2E5C] shadow-xs dark:bg-[#0A2E5C] dark:text-white"
                      : "text-zinc-400 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-300"
                  }`}
                  title="Hall Matrix Grid View"
                >
                  <Grid3X3 className="h-4 w-4" />
                  <span className="hidden sm:inline text-[10px]">Grid</span>
                </button>
              </div>
            </div>
          </div>

        </div>

        {/* VIEW 1: INTERACTIVE HALL SEAT MATRIX GRID */}
        {viewMode === "grid" ? (
          <div className="rounded-3xl border border-[#E5E7EB] bg-white p-5 sm:p-6 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
              <div>
                <h3 className="text-sm font-black text-[#0A2E5C] dark:text-white flex items-center gap-2">
                  <LayoutGrid className="h-4 w-4 text-[#0B5ED7]" />
                  Hall Floor Plan Matrix ({totalCount} Study Desks)
                </h3>
                <p className="text-[11px] text-zinc-400 mt-0.5">Physical desk allocation (Desks #1 to #{totalCount}). Click on any desk to inspect.</p>
              </div>

              {/* Legend */}
              <div className="flex flex-wrap items-center gap-3 text-[10px] font-bold">
                <div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-600"></span><span>Free (Green)</span></div>
                <div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-blue-600"></span><span>Student Seat (Blue)</span></div>
                <div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-red-600"></span><span>Reserved (Red)</span></div>
                <div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-violet-600"></span><span>Locker (Violet)</span></div>
                <div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-zinc-400"></span><span>Disabled</span></div>
              </div>
            </div>

            {/* Matrix of Study Desks 01 to 100 (Continuous Floor Matrix, No Sections) */}
            <div className="overflow-x-auto pb-2">
              <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-8 lg:grid-cols-10 gap-2 sm:gap-2.5">
                {sortedSeats.map((seat) => {
                  const seatId = seat.id;
                  const isSelected = selectedSeatId === seatId;

                  // Mode-based Color Determination:
                  // 1. Reserved: Red color with name of student
                  // 2. Student Seat (occupied/assigned): Blue color with seated student name
                  // 3. Locker: Violet color
                  // 4. Free: Green color
                  let colorClass = "bg-emerald-600 text-white border-emerald-700 dark:bg-emerald-600";
                  if (seat.status === "disabled") {
                    colorClass = "bg-zinc-400 text-zinc-100 border-zinc-500 dark:bg-zinc-700 dark:text-zinc-300";
                  } else if (seat.status === "reserved") {
                    colorClass = "bg-red-600 text-white border-red-700 dark:bg-red-600 shadow-xs";
                  } else if (seat.status === "occupied" || Boolean(seat.occupantName)) {
                    colorClass = "bg-blue-600 text-white border-blue-700 dark:bg-blue-600 shadow-xs";
                  } else if (seat.hasLocker || seat.status === "locker") {
                    colorClass = "bg-violet-600 text-white border-violet-700 dark:bg-violet-600 shadow-xs";
                  }

                  const displayName = seat.occupantName;
                  const isLockerDesk = (seat.hasLocker || seat.status === "locker") && !displayName;

                  return (
                    <button
                      key={seatId}
                      onClick={() => {
                        setSelectedSeatId(seatId);
                        setIsInspectorOpen(true);
                      }}
                      className={`
                        relative flex min-h-[64px] sm:min-h-[72px] flex-col items-center justify-center rounded-2xl border font-mono transition-all cursor-pointer p-1.5 shadow-2xs
                        ${colorClass}
                        ${isSelected ? 'ring-3 ring-[#0A2E5C] dark:ring-[#FFC107] scale-105 shadow-md z-10' : 'opacity-95 hover:opacity-100 hover:scale-102'}
                      `}
                      title={`Desk #${seatId} ${displayName ? `• ${displayName}` : ''} - Click to Inspect`}
                    >
                      {seat.todayAttendanceStatus === "active" && (
                        <span className="absolute top-1.5 right-1.5 flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-300 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-200"></span>
                        </span>
                      )}
                      <span className="text-xs sm:text-sm font-black tracking-tight leading-none">#{seatId}</span>
                      {displayName ? (
                        <span className="text-[9px] sm:text-[10px] font-black truncate max-w-full px-1 text-center mt-1 leading-tight tracking-tight uppercase">
                          {displayName}
                        </span>
                      ) : isLockerDesk ? (
                        <span className="inline-flex items-center gap-0.5 text-[8px] font-bold opacity-90 mt-1">
                          <Lock className="h-2.5 w-2.5" /> Locker
                        </span>
                      ) : (
                        <span className="text-[8px] font-semibold opacity-85 mt-1">Free</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-6 flex flex-col sm:flex-row items-center justify-between border-t border-[#E5E7EB]/60 pt-4 dark:border-zinc-800 text-xs text-zinc-500 gap-2">
              <div className="flex items-center gap-2">
                <Info className="h-4 w-4 text-[#0B5ED7]" />
                <span>Showing {sortedSeats.length} of {totalCount} Study Desks (Numbered 1 to {totalCount}) • Click any desk to open Desk Inspector</span>
              </div>
            </div>
          </div>
        ) : (
          /* VIEW 2: DETAILED DATA TABLE LIST VIEW */
          <div className="rounded-3xl border border-[#E5E7EB] bg-white p-5 sm:p-6 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C] overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-black text-[#0A2E5C] dark:text-white flex items-center gap-2">
                  <TableIcon className="h-4 w-4 text-[#0B5ED7]" />
                  Seat Directory Table
                </h3>
                <p className="text-[11px] text-zinc-400">Total {filteredSeats.length} matching seats • Click row to inspect</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[#E5E7EB]/70 dark:border-zinc-800 bg-[#F8FAFC]/60 dark:bg-zinc-800/40 text-[10px] font-black uppercase tracking-wider text-zinc-500">
                  <tr>
                    <th className="p-3">Desk ID</th>
                    <th className="p-3">Zone / Hall</th>
                    <th className="p-3">Type</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Current Occupant</th>
                    <th className="p-3">Shift Timing</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {filteredSeats.map((seat) => (
                    <tr
                      key={seat.id}
                      onClick={() => {
                        setSelectedSeatId(seat.id);
                        setIsInspectorOpen(true);
                      }}
                      className={`hover:bg-[#F8FAFC]/50 dark:hover:bg-zinc-800/40 transition cursor-pointer ${selectedSeatId === seat.id ? "bg-[#FFC107]/10 dark:bg-[#FFC107]/10" : ""
                        }`}
                    >
                      <td className="p-3 font-mono font-black text-[#0A2E5C] dark:text-white">
                        #{seat.id}
                      </td>
                      <td className="p-3 font-medium text-zinc-600 dark:text-zinc-300">
                        {seat.zone}
                      </td>
                      <td className="p-3">
                        {seat.hasLocker ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-purple-700 bg-purple-50 dark:bg-purple-950/40 px-2 py-0.5 rounded border border-purple-200">
                            <Lock className="h-2.5 w-2.5" /> Locker
                          </span>
                        ) : (
                          <span className="text-zinc-400">Standard</span>
                        )}
                      </td>
                      <td className="p-3">
                        <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${seat.status === "available" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" :
                          seat.status === "occupied" ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300" :
                            seat.status === "reserved" ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300" :
                              "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                          }`}>
                          {seat.status}
                        </span>
                      </td>
                      <td className="p-3 font-medium text-[#0A2E5C] dark:text-white">
                        {seat.occupantName || <span className="text-zinc-400 italic">—</span>}
                      </td>
                      <td className="p-3 text-zinc-500 text-[11px]">
                        {seat.occupantShift || "—"}
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedSeatId(seat.id);
                            setIsInspectorOpen(true);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#F8FAFC] hover:bg-[#E5E7EB] dark:bg-zinc-800 text-[11px] font-bold text-[#0A2E5C] dark:text-white transition cursor-pointer mr-1.5"
                        >
                          <Armchair className="h-3 w-3 text-[#0B5ED7]" />
                          <span>Inspect</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>

      {/* ========================================================================= */}
      {/* DESK INSPECTOR POPUP WINDOW MODAL */}
      {/* ========================================================================= */}
      {mounted && isInspectorOpen && createPortal(
        <div
          onClick={() => setIsInspectorOpen(false)}
          className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-6 bg-black/75 backdrop-blur-sm no-print animate-in fade-in duration-200"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-lg max-h-[90vh] flex flex-col rounded-3xl border border-[#E5E7EB] bg-white shadow-2xl dark:border-zinc-800 dark:bg-[#0A2E5C] overflow-hidden animate-in zoom-in-95 duration-200"
          >

            {/* Modal Header */}
            <div className="shrink-0 flex items-center justify-between border-b border-[#E5E7EB]/60 p-4 sm:p-5 dark:border-zinc-800 bg-[#F8FAFC]/50 dark:bg-zinc-900/50">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#0A2E5C] text-[#FFC107] shadow-xs">
                  <Armchair className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-black text-[#0A2E5C] dark:text-white flex items-center gap-2">
                    Desk Inspector
                    <span className="text-xs font-mono font-bold text-zinc-400">
                      Desk #{selectedSeat.id}
                    </span>
                  </h2>
                  <p className="text-[11px] text-zinc-500">Cubicle details, occupant info & desk controls</p>
                </div>
              </div>

              <button
                onClick={() => setIsInspectorOpen(false)}
                className="rounded-full p-2 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-white transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 min-h-0 overflow-y-auto p-5 sm:p-6 space-y-5">
              <div className="flex items-center gap-4">
                <div className={`flex h-16 w-16 items-center justify-center rounded-2xl ${getStatusBadge(selectedSeat.status)} shadow-xs`}>
                  <Armchair className="h-8 w-8" />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-[#0A2E5C] dark:text-white">Desk #{selectedSeat.id}</h2>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400">
                      Standard Study Desk
                    </span>
                    {selectedSeat.hasLocker && (
                      <span className="inline-flex items-center gap-1 text-[9px] font-bold text-purple-700 bg-purple-50 dark:bg-purple-950/40 px-2 py-0.5 rounded border border-purple-200">
                        <Lock className="h-2.5 w-2.5" /> Locker Attached
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Occupant Detail Box */}
              <div className="p-4.5 rounded-2xl bg-[#F8FAFC] dark:bg-zinc-800/60 text-xs space-y-3 border border-[#E5E7EB]/60 dark:border-zinc-700">
                <div className="flex justify-between items-center">
                  <span className="text-zinc-400">Desk Status:</span>
                  <span className={`inline-flex px-2.5 py-0.5 rounded-lg text-[10px] font-extrabold uppercase ${selectedSeat.status === "available" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" :
                    selectedSeat.status === "occupied" ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300" :
                      selectedSeat.status === "reserved" ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300" :
                        "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                    }`}>
                    {selectedSeat.status}
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-zinc-400">Current Occupant:</span>
                  <span className="font-black text-sm text-[#0A2E5C] dark:text-white">{selectedSeat.occupantName || "None (Vacant Desk)"}</span>
                </div>

                {selectedSeat.occupantEmail && (
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-400">Email:</span>
                    <span className="font-medium text-zinc-600 dark:text-zinc-300 font-mono text-[11px]">{selectedSeat.occupantEmail}</span>
                  </div>
                )}

                {selectedSeat.occupantPhone && (
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-400">Mobile:</span>
                    <span className="font-medium text-zinc-600 dark:text-zinc-300 font-mono text-[11px]">{selectedSeat.occupantPhone}</span>
                  </div>
                )}

                {selectedSeat.occupantShift && (
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-400">Allocated Shift:</span>
                    <span className="font-medium text-zinc-600 dark:text-zinc-300">{selectedSeat.occupantShift}</span>
                  </div>
                )}

                {/* FEE STATUS BADGE */}
                {(selectedSeat.occupantName || selectedSeat.status === "occupied" || selectedSeat.status === "reserved") && (
                  <div className="flex justify-between items-center pt-2 border-t border-zinc-200/80 dark:border-zinc-700/80">
                    <span className="text-zinc-400 font-medium">Fee Status:</span>
                    {selectedSeat.feeStatus === "Due" || (selectedSeat.dueAmount && selectedSeat.dueAmount > 0) ? (
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-rose-100 dark:bg-rose-950/60 px-2.5 py-1 text-[11px] font-bold text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                        <AlertCircle className="h-3.5 w-3.5" />
                        <span>Due ₹{selectedSeat.dueAmount || 800}</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 px-2.5 py-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span>Fee Paid (No Due)</span>
                      </span>
                    )}
                  </div>
                )}

                {/* YESTERDAY'S ATTENDANCE BADGE */}
                {(selectedSeat.occupantName || selectedSeat.status === "occupied") && (
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-400 font-medium">Yesterday Attendance:</span>
                    {selectedSeat.yesterdayAttendance === "Absent" ? (
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-rose-100 dark:bg-rose-950/60 px-2.5 py-1 text-[11px] font-bold text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                        <X className="h-3.5 w-3.5" />
                        <span>Absent</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 px-2.5 py-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                        <Check className="h-3.5 w-3.5" />
                        <span>Present {selectedSeat.yesterdayTime ? `(${selectedSeat.yesterdayTime})` : ""}</span>
                      </span>
                    )}
                  </div>
                )}

                {/* TODAY'S ATTENDANCE STATUS (Active / Present / Absent) */}
                {(selectedSeat.occupantName || selectedSeat.status === "occupied" || selectedSeat.status === "reserved") && (
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-400 font-medium">Today's Attendance:</span>
                    {selectedSeat.todayAttendanceStatus === "active" ? (
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 px-2.5 py-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span>Active {selectedSeat.todayCheckInTime ? `(In ${selectedSeat.todayCheckInTime})` : "(In Library)"}</span>
                      </span>
                    ) : selectedSeat.todayAttendanceStatus === "present" ? (
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-blue-100 dark:bg-blue-950/60 px-2.5 py-1 text-[11px] font-bold text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span>Present {selectedSeat.todayCheckOutTime ? `(Out ${selectedSeat.todayCheckOutTime})` : "(Checked Out)"}</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-rose-100 dark:bg-rose-950/60 px-2.5 py-1 text-[11px] font-bold text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                        <X className="h-3.5 w-3.5" />
                        <span>Absent</span>
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Desk Mode Quick Switcher */}
              <div className="space-y-1.5 pt-1">
                <p className="font-bold text-zinc-600 dark:text-zinc-300 text-[11px]">Seat Status Mode:</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setSeats(prev => {
                        const updated = prev.map(s => s.id === selectedSeat.id ? { ...s, status: "available" as const, occupantName: undefined } : s);
                        if (typeof window !== "undefined") localStorage.setItem("genius_seats_100_v2", JSON.stringify(updated));
                        return updated;
                      });
                      setToastMsg(`Desk #${selectedSeat.id} marked as Free (Green)`);
                    }}
                    className={`px-2 py-2 rounded-xl text-[10px] font-bold border transition cursor-pointer flex items-center justify-center gap-1 ${
                      selectedSeat.status === "available" && !selectedSeat.occupantName
                        ? "bg-emerald-600 text-white border-emerald-700 shadow-xs"
                        : "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300"
                    }`}
                  >
                    <span>Free (Green)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSeats(prev => {
                        const updated = prev.map(s => s.id === selectedSeat.id ? { ...s, status: "occupied" as const } : s);
                        if (typeof window !== "undefined") localStorage.setItem("genius_seats_100_v2", JSON.stringify(updated));
                        return updated;
                      });
                      setToastMsg(`Desk #${selectedSeat.id} marked as Student Seat (Blue)`);
                    }}
                    className={`px-2 py-2 rounded-xl text-[10px] font-bold border transition cursor-pointer flex items-center justify-center gap-1 ${
                      selectedSeat.status === "occupied" || (selectedSeat.occupantName && selectedSeat.status !== "reserved")
                        ? "bg-blue-600 text-white border-blue-700 shadow-xs"
                        : "bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300"
                    }`}
                  >
                    <span>Student (Blue)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSeats(prev => {
                        const updated = prev.map(s => s.id === selectedSeat.id ? { ...s, status: "reserved" as const } : s);
                        if (typeof window !== "undefined") localStorage.setItem("genius_seats_100_v2", JSON.stringify(updated));
                        return updated;
                      });
                      setToastMsg(`Desk #${selectedSeat.id} marked as Reserved (Red)`);
                    }}
                    className={`px-2 py-2 rounded-xl text-[10px] font-bold border transition cursor-pointer flex items-center justify-center gap-1 ${
                      selectedSeat.status === "reserved"
                        ? "bg-red-600 text-white border-red-700 shadow-xs"
                        : "bg-red-50 text-red-800 border-red-200 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-300"
                    }`}
                  >
                    <span>Reserved (Red)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSeats(prev => {
                        const updated = prev.map(s => s.id === selectedSeat.id ? { ...s, status: "locker" as const, hasLocker: true } : s);
                        if (typeof window !== "undefined") localStorage.setItem("genius_seats_100_v2", JSON.stringify(updated));
                        return updated;
                      });
                      setToastMsg(`Desk #${selectedSeat.id} marked as Locker Desk (Violet)`);
                    }}
                    className={`px-2 py-2 rounded-xl text-[10px] font-bold border transition cursor-pointer flex items-center justify-center gap-1 ${
                      selectedSeat.status === "locker" || (selectedSeat.hasLocker && !selectedSeat.occupantName)
                        ? "bg-violet-600 text-white border-violet-700 shadow-xs"
                        : "bg-purple-50 text-purple-800 border-purple-200 hover:bg-purple-100 dark:bg-purple-950/40 dark:text-purple-300"
                    }`}
                  >
                    <span>Locker (Violet)</span>
                  </button>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="space-y-2.5 pt-1">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      if (window.confirm(`Are you sure you want to permanently delete Desk #${selectedSeat.id}?`)) {
                        setSeats(prev => {
                          const updated = prev.filter(s => s.id !== selectedSeat.id);
                          if (typeof window !== "undefined") localStorage.setItem("genius_seats_100_v2", JSON.stringify(updated));
                          return updated;
                        });
                        if (targetLockerSeat === selectedSeat.id) {
                          const nextAvail = seats.find(s => s.id !== selectedSeat.id);
                          if (nextAvail) setTargetLockerSeat(nextAvail.id);
                        }
                        setIsInspectorOpen(false);
                        setToastMsg(`Desk #${selectedSeat.id} deleted successfully.`);
                      }
                    }}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50/80 p-2.5 text-xs font-bold text-rose-700 hover:bg-rose-100 transition dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-400 dark:hover:bg-rose-900/60 cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
                    Delete Seat
                  </button>

                  <button
                    onClick={() => {
                      setSeats(prev => {
                        const updated = prev.map(s => s.id === selectedSeat.id ? { ...s, status: (s.status === 'disabled' ? 'available' : 'disabled') as "available" | "disabled" } : s);
                        if (typeof window !== "undefined") localStorage.setItem("genius_seats_100_v2", JSON.stringify(updated));
                        return updated;
                      });
                    }}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-zinc-200 bg-white p-2.5 text-xs font-bold text-zinc-600 hover:bg-zinc-50 transition dark:border-zinc-700 dark:bg-[#0A2E5C] dark:text-zinc-300 cursor-pointer"
                  >
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                    {selectedSeat.status === "disabled" ? "Enable Desk" : "Maintenance"}
                  </button>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="shrink-0 p-4 border-t border-[#E5E7EB]/60 dark:border-zinc-800 bg-[#F8FAFC]/50 dark:bg-zinc-900/50 flex items-center justify-between text-xs text-zinc-500">
              <span>Desk ID: #{selectedSeat.id}</span>
              <button
                onClick={() => setIsInspectorOpen(false)}
                className="px-4 py-2 rounded-xl bg-zinc-200 dark:bg-zinc-800 font-bold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-300 transition cursor-pointer"
              >
                Close
              </button>
            </div>

          </div>
        </div>,
        document.body
      )}

      {/* ========================================================================= */}
      {/* 1. ADD SEATS MODAL */}
      {/* ========================================================================= */}
      {mounted && isAddSeatModalOpen && createPortal(
        <div 
          onClick={() => setIsAddSeatModalOpen(false)}
          className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-6 bg-black/75 backdrop-blur-sm no-print animate-in fade-in duration-200"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-md max-h-[90vh] flex flex-col rounded-3xl border border-[#E5E7EB] bg-white shadow-2xl dark:border-zinc-800 dark:bg-[#0A2E5C] overflow-hidden animate-in zoom-in-95 duration-200"
          >
            <div className="shrink-0 flex items-center justify-between p-4 sm:p-5 border-b border-[#E5E7EB]/60 dark:border-zinc-800 bg-[#F8FAFC]/50 dark:bg-zinc-900/50">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#0A2E5C] text-[#FFC107] shadow-xs">
                  <Plus className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-black text-[#0A2E5C] dark:text-white">Add Seats</h2>
                  <p className="text-[11px] text-zinc-500">Expand library seating capacity</p>
                </div>
              </div>
              <button
                onClick={() => setIsAddSeatModalOpen(false)}
                className="rounded-full p-2 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-white transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const maxNum = seats.reduce((max, s) => Math.max(max, parseInt(s.id) || 0), 0);
                const count = Math.max(1, newSeatCount);
                const newDesks: SeatData[] = [];
                for (let i = 1; i <= count; i++) {
                  const num = maxNum + i;
                  newDesks.push({
                    id: String(num),
                    row: "",
                    col: String(num),
                    zone: "Hall",
                    hasLocker: newSeatHasLocker,
                    status: "available",
                  });
                }
                setSeats(prev => {
                  const updated = [...prev, ...newDesks];
                  if (typeof window !== "undefined") {
                    localStorage.setItem("genius_seats_100_v2", JSON.stringify(updated));
                  }
                  return updated;
                });
                setIsAddSeatModalOpen(false);
                setToastMsg(`Successfully added ${count} new seat(s) (Seat #${maxNum + 1}${count > 1 ? ` to #${maxNum + count}` : ''})! Total seats: ${seats.length + count}`);
              }}
              className="flex-1 min-h-0 overflow-y-auto p-5 sm:p-6 space-y-4 text-xs"
            >
              <div>
                <label className="block font-bold text-zinc-600 dark:text-zinc-300 mb-1">Number of Desks to Add</label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  required
                  value={newSeatCount}
                  onChange={(e) => setNewSeatCount(Math.max(1, Number(e.target.value)))}
                  className="w-full rounded-xl border border-zinc-200 bg-[#F8FAFC]/50 p-2.5 font-bold text-[#0A2E5C] dark:border-zinc-700 dark:bg-zinc-800 dark:text-white focus:border-[#FFC107] focus:outline-none"
                />
              </div>

              {(() => {
                const maxNum = seats.reduce((max, s) => Math.max(max, parseInt(s.id) || 0), 0);
                const count = Math.max(1, newSeatCount);
                return (
                  <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300 text-xs">
                    <p className="font-bold">Next Desk Numbers:</p>
                    <p className="text-[11px] mt-0.5">
                      Will create Desk #{maxNum + 1} {count > 1 ? `through Desk #${maxNum + count}` : ""} (Total desks will become {seats.length + count})
                    </p>
                  </div>
                );
              })()}

              <div className="flex items-center gap-2.5 p-3 rounded-xl border border-purple-200/80 bg-purple-50/50 dark:bg-purple-950/20 dark:border-purple-900/40">
                <input
                  type="checkbox"
                  id="includeLockers"
                  checked={newSeatHasLocker}
                  onChange={(e) => setNewSeatHasLocker(e.target.checked)}
                  className="h-4 w-4 rounded border-purple-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                />
                <label htmlFor="includeLockers" className="text-xs font-bold text-purple-900 dark:text-purple-300 cursor-pointer flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5" />
                  <span>Attach Secure Storage Lockers to these desks</span>
                </label>
              </div>

              <div className="pt-3 border-t border-[#E5E7EB]/60 dark:border-zinc-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddSeatModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-zinc-200 text-xs font-bold text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[#0A2E5C] text-[#FFC107] text-xs font-black shadow-md hover:bg-[#141A24] transition cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add Desks</span>
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* ========================================================================= */}
      {/* 1.5. DELETE SEATS MODAL (Multi-Seat Bulk Deletion) */}
      {/* ========================================================================= */}
      {mounted && isDeleteSeatsModalOpen && createPortal(
        <div 
          onClick={() => setIsDeleteSeatsModalOpen(false)}
          className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-6 bg-black/75 backdrop-blur-sm no-print animate-in fade-in duration-200"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-lg max-h-[90vh] flex flex-col rounded-3xl border border-rose-200 bg-white shadow-2xl dark:border-rose-900/60 dark:bg-[#0A2E5C] overflow-hidden animate-in zoom-in-95 duration-200"
          >
            {/* Header */}
            <div className="shrink-0 flex items-center justify-between p-4 sm:p-5 border-b border-rose-100 dark:border-zinc-800 bg-rose-50/60 dark:bg-rose-950/20">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-600 text-white shadow-xs">
                  <Trash2 className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-black text-[#0A2E5C] dark:text-white">Delete Seats</h2>
                  <p className="text-[11px] text-zinc-500">Select single or multiple desks to remove</p>
                </div>
              </div>
              <button
                onClick={() => setIsDeleteSeatsModalOpen(false)}
                className="rounded-full p-2 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-white transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-4 text-xs">
              {/* Search & Bulk Select Controls */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-zinc-400" />
                  <input
                    type="text"
                    value={deleteSearchQuery}
                    onChange={(e) => setDeleteSearchQuery(e.target.value)}
                    placeholder="Filter by seat (e.g. J-01, Row J)..."
                    className="w-full rounded-xl border border-zinc-200 bg-[#F8FAFC]/50 py-2 pl-8.5 pr-3 text-xs text-[#0A2E5C] dark:border-zinc-700 dark:bg-zinc-800 dark:text-white focus:border-rose-500 focus:outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const filtered = seats.filter(s => 
                      !deleteSearchQuery || 
                      s.id.toLowerCase().includes(deleteSearchQuery.toLowerCase()) || 
                      (s.occupantName && s.occupantName.toLowerCase().includes(deleteSearchQuery.toLowerCase()))
                    );
                    const allIds = filtered.map(s => s.id);
                    if (selectedSeatsToDelete.length === allIds.length) {
                      setSelectedSeatsToDelete([]);
                    } else {
                      setSelectedSeatsToDelete(allIds);
                    }
                  }}
                  className="shrink-0 px-3 py-2 rounded-xl border border-zinc-200 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800 text-[11px] font-bold text-zinc-700 dark:text-zinc-300 cursor-pointer"
                >
                  {selectedSeatsToDelete.length > 0 ? "Deselect All" : "Select All"}
                </button>
              </div>

              {/* Seats Selection Grid */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-[11px] font-bold text-zinc-500">
                  <span>Available Desks ({seats.length} total)</span>
                  <span className="text-rose-600 font-black">{selectedSeatsToDelete.length} selected</span>
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 max-h-56 overflow-y-auto p-2 border border-zinc-200 rounded-2xl bg-[#FAF9F6] dark:border-zinc-800 dark:bg-zinc-900/40">
                  {seats
                    .filter(s => 
                      !deleteSearchQuery || 
                      s.id.toLowerCase().includes(deleteSearchQuery.toLowerCase()) || 
                      (s.occupantName && s.occupantName.toLowerCase().includes(deleteSearchQuery.toLowerCase()))
                    )
                    .map((s) => {
                      const isSelected = selectedSeatsToDelete.includes(s.id);
                      const isAssigned = s.status === "occupied" || s.status === "reserved" || !!s.occupantName;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            setSelectedSeatsToDelete(prev => 
                              prev.includes(s.id) ? prev.filter(id => id !== s.id) : [...prev, s.id]
                            );
                          }}
                          className={`flex flex-col items-center justify-center p-2 rounded-xl border text-center transition cursor-pointer ${
                            isSelected
                              ? "border-rose-600 bg-rose-50 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 ring-2 ring-rose-400"
                              : isAssigned
                                ? "border-purple-200 bg-purple-50 text-purple-800 dark:border-purple-900/40 dark:bg-purple-950/20 dark:text-purple-300"
                                : "border-zinc-200 bg-white hover:border-zinc-400 text-zinc-800 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                          }`}
                        >
                          <span className="font-mono font-black text-xs">#{s.id}</span>
                          <span className="text-[9px] font-bold mt-0.5 truncate max-w-full">
                            {isAssigned ? (s.occupantName?.split(" ")[0] || "Assigned") : "Available"}
                          </span>
                        </button>
                      );
                    })}
                </div>
              </div>

              {/* Warning if assigned seats are selected */}
              {(() => {
                const assignedSelected = seats.filter(s => selectedSeatsToDelete.includes(s.id) && (s.status === "occupied" || s.status === "reserved" || !!s.occupantName));
                if (assignedSelected.length === 0) return null;
                return (
                  <div className="p-3 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-300 text-xs">
                    <p className="font-bold">⚠️ Warning: {assignedSelected.length} assigned desk(s) selected:</p>
                    <p className="text-[11px] mt-0.5">
                      {assignedSelected.map(s => `#${s.id} (${s.occupantName || "Student"})`).join(", ")}. Deleting these will unassign the desks.
                    </p>
                  </div>
                );
              })()}
            </div>

            {/* Footer */}
            <div className="shrink-0 p-4 border-t border-[#E5E7EB]/60 dark:border-zinc-800 flex items-center justify-between bg-[#F8FAFC]/30 dark:bg-zinc-900/30">
              <span className="text-xs text-zinc-500 font-bold">
                {selectedSeatsToDelete.length} seat(s) to remove
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsDeleteSeatsModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-zinc-200 text-xs font-bold text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={selectedSeatsToDelete.length === 0}
                  onClick={() => {
                    const toDelete = new Set(selectedSeatsToDelete);
                    const remaining = seats.filter(s => !toDelete.has(s.id));
                    setSeats(remaining);
                    if (typeof window !== "undefined") {
                      localStorage.setItem("genius_seats_100_v2", JSON.stringify(remaining));
                    }
                    if (selectedSeatsToDelete.includes(targetLockerSeat)) {
                      const nextAvail = remaining[0];
                      if (nextAvail) setTargetLockerSeat(nextAvail.id);
                    }
                    setIsDeleteSeatsModalOpen(false);
                    setToastMsg(`✓ Successfully deleted ${selectedSeatsToDelete.length} desk(s)! Total desks: ${remaining.length}`);
                    setSelectedSeatsToDelete([]);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-black shadow-md transition cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Delete {selectedSeatsToDelete.length > 0 ? `(${selectedSeatsToDelete.length})` : ""}</span>
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ========================================================================= */}
      {/* 2. ATTACH / DETACH LOCKER MODAL */}
      {/* ========================================================================= */}
      {mounted && isAttachLockerModalOpen && createPortal(
        <div 
          onClick={() => setIsAttachLockerModalOpen(false)}
          className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-6 bg-black/75 backdrop-blur-sm no-print animate-in fade-in duration-200"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-md max-h-[90vh] flex flex-col rounded-3xl border border-[#E5E7EB] bg-white shadow-2xl dark:border-zinc-800 dark:bg-[#0A2E5C] overflow-hidden animate-in zoom-in-95 duration-200"
          >
            <div className="shrink-0 flex items-center justify-between p-4 sm:p-5 border-b border-[#E5E7EB]/60 dark:border-zinc-800 bg-[#F8FAFC]/50 dark:bg-zinc-900/50">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-purple-100 text-purple-700 dark:bg-purple-950/60 shadow-xs">
                  <Lock className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-black text-[#0A2E5C] dark:text-white">Attach / Detach Locker</h2>
                  <p className="text-[11px] text-zinc-500">Configure locker unit on any desk</p>
                </div>
              </div>
              <button
                onClick={() => setIsAttachLockerModalOpen(false)}
                className="rounded-full p-2 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-white transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-5 sm:p-6 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-zinc-600 dark:text-zinc-300 mb-1">Select Target Desk</label>
                <select
                  value={targetLockerSeat}
                  onChange={(e) => setTargetLockerSeat(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-white p-2.5 font-mono font-bold text-[#0A2E5C] dark:border-zinc-700 dark:bg-zinc-800 dark:text-white focus:border-[#FFC107] focus:outline-none cursor-pointer"
                >
                  {seats.map((s) => (
                    <option key={s.id} value={s.id}>
                      Desk #{s.id} {s.hasLocker ? "• [Locker Attached]" : "• [No Locker]"}
                    </option>
                  ))}
                </select>
              </div>

              {(() => {
                const target = seats.find(s => s.id === targetLockerSeat) || seats[0];
                return (
                  <div className="p-4 rounded-2xl bg-[#F8FAFC]/60 dark:bg-zinc-800/60 border border-[#E5E7EB]/60 dark:border-zinc-700 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-zinc-400">Desk ID:</span>
                      <span className="font-mono font-black text-[#0A2E5C] dark:text-white">#{target.id}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-zinc-400">Current Locker Status:</span>
                      {target.hasLocker ? (
                        <span className="inline-flex items-center gap-1 font-bold text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-950/60 px-2 py-0.5 rounded border border-purple-200">
                          <Lock className="h-3 w-3" /> Attached
                        </span>
                      ) : (
                        <span className="text-zinc-500 font-bold">Not Attached</span>
                      )}
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-zinc-400">Occupant:</span>
                      <span className="font-bold text-[#0A2E5C] dark:text-white">{target.occupantName || "None (Vacant)"}</span>
                    </div>
                  </div>
                );
              })()}

              <div className="pt-3 border-t border-[#E5E7EB]/60 dark:border-zinc-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAttachLockerModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-zinc-200 text-xs font-bold text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 cursor-pointer"
                >
                  Cancel
                </button>
                {(() => {
                  const target = seats.find(s => s.id === targetLockerSeat);
                  const isCurrentlyAttached = target?.hasLocker;

                  return (
                    <button
                      type="button"
                      onClick={() => {
                        setSeats(prev => {
                          const updated = prev.map(s => {
                            if (s.id === targetLockerSeat) {
                              const nextState = !s.hasLocker;
                              return {
                                ...s,
                                hasLocker: nextState,
                                status: s.status === "locker" ? "available" : s.status,
                              };
                            }
                            return s;
                          });
                          if (typeof window !== "undefined") localStorage.setItem("genius_seats_100_v2", JSON.stringify(updated));
                          return updated;
                        });
                        setToastMsg(`Locker ${isCurrentlyAttached ? 'detached from' : 'attached to'} Desk #${targetLockerSeat}!`);
                        setIsAttachLockerModalOpen(false);
                      }}
                      className={`inline-flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-black shadow-md transition cursor-pointer ${
                        isCurrentlyAttached
                          ? "bg-rose-600 hover:bg-rose-700 text-white"
                          : "bg-purple-600 hover:bg-purple-700 text-white"
                      }`}
                    >
                      <Lock className="h-3.5 w-3.5" />
                      <span>{isCurrentlyAttached ? "Detach Locker" : "Attach Locker"}</span>
                    </button>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}





      {/* ========================================================================= */}
      {/* MASTER STANDEE POSTER & NFC STAND PROGRAMMER MODAL */}
      {/* ========================================================================= */}
      {mounted && isMasterStandModalOpen && createPortal(
        <div 
          onClick={() => setIsMasterStandModalOpen(false)}
          className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-sm no-print animate-in fade-in duration-200"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-2xl max-h-[92vh] flex flex-col rounded-3xl border border-[#E5E7EB] bg-white shadow-2xl dark:border-zinc-800 dark:bg-[#0A2E5C] overflow-y-auto"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#E5E7EB]/60 p-5 bg-[#F8FAFC]/50 dark:bg-zinc-900/50">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-xs">
                  <Radio className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-black text-[#0A2E5C] dark:text-white flex items-center gap-2">
                    Entrance Master Attendance QR & NFC Stand
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                      Primary Gate System
                    </span>
                  </h2>
                  <p className="text-[11px] text-zinc-500">
                    Single library entrance stand: students scan or tap phone to check-in (auto desk allotment) or check-out.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsMasterStandModalOpen(false)}
                className="rounded-full p-2 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-white cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Standee Preview Card (Ready for Print) */}
            <div className="p-6 space-y-6">
              <div id="master-standee-poster" className="rounded-3xl border-2 border-[#FFC107] bg-[#FDFCF7] p-6 text-center text-[#0A2E5C] shadow-lg space-y-4">
                <div className="flex items-center justify-center gap-2">
                  <BrandLogo size="md" />
                </div>
                <div>
                  <h3 className="text-xl font-black tracking-tight text-[#0A2E5C]">THE GENIUS DIGITAL LIBRARY</h3>
                  <p className="text-[11px] font-bold text-[#FFC107] tracking-widest uppercase">Self Attendance & Desk Allotment Station</p>
                  <p className="text-[10px] text-zinc-400">Station Road, Near Town Hall, Madhupur, Deoghar, Jharkhand 815353</p>
                </div>

                {/* Big Master QR */}
                <div className="mx-auto w-56 h-56 p-3 rounded-2xl bg-white border border-[#E5E7EB] shadow-md flex items-center justify-center">
                  {masterQrDataUrl ? (
                    <img src={masterQrDataUrl} alt="Library Master QR" className="w-full h-full object-contain" />
                  ) : (
                    <RefreshCw className="h-8 w-8 animate-spin text-zinc-400" />
                  )}
                </div>

                <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 border border-emerald-200 px-4 py-1.5 text-xs font-bold text-emerald-800">
                  <Smartphone className="h-4 w-4 text-emerald-600" />
                  <span>Scan QR Code or Tap Phone via NFC</span>
                </div>

                {/* Instructions */}
                <div className="grid grid-cols-2 gap-3 text-left pt-2 border-t border-[#E5E7EB]/60">
                  <div className="rounded-xl bg-white p-3 border border-[#E5E7EB]/40 shadow-xs">
                    <p className="text-[11px] font-black text-emerald-700 uppercase">🟢 Step 1: Check-In</p>
                    <p className="text-[10px] text-zinc-600 mt-0.5">Scan or tap at entrance. An available study desk is automatically allotted.</p>
                  </div>
                  <div className="rounded-xl bg-white p-3 border border-[#E5E7EB]/40 shadow-xs">
                    <p className="text-[11px] font-black text-rose-700 uppercase">🔴 Step 2: Check-Out</p>
                    <p className="text-[10px] text-zinc-600 mt-0.5">Scan or tap again when leaving. Releases your desk for other students.</p>
                  </div>
                </div>

                <p className="text-[9px] text-zinc-400 pt-1">
                  Powered by Cloudflare Edge & Supabase Mumbai • Real-Time Desk Sync
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={() => {
                    const printWindow = window.open("", "_blank");
                    if (printWindow && masterQrDataUrl) {
                      printWindow.document.write(`
                        <html>
                          <head>
                            <title>Genius Library - Master Attendance Standee</title>
                            <style>
                              @page { size: A4 portrait; margin: 15mm; }
                              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; text-align: center; color: #0A2E5C; padding: 20px; }
                              .border-box { border: 4px solid #FFC107; border-radius: 24px; padding: 40px 30px; background: #FFFDF9; max-width: 600px; margin: 0 auto; box-sizing: border-box; }
                              h1 { font-size: 28px; margin: 0; font-weight: 900; letter-spacing: -0.5px; }
                              h2 { font-size: 14px; margin: 8px 0 0 0; color: #FFC107; text-transform: uppercase; letter-spacing: 2px; }
                              .address { font-size: 11px; color: #666; margin-top: 4px; }
                              .qr-box { margin: 30px auto; width: 260px; height: 260px; background: #fff; padding: 16px; border: 2px solid #E5E7EB; border-radius: 16px; }
                              .badge { display: inline-block; background: #E8F5E9; border: 1px solid #81C784; color: #1B5E20; padding: 8px 18px; border-radius: 20px; font-weight: bold; font-size: 13px; margin-bottom: 25px; }
                              .grid { display: flex; gap: 15px; text-align: left; margin-top: 20px; }
                              .card { flex: 1; border: 1px solid #E5E7EB; border-radius: 12px; padding: 12px; background: #fff; }
                              .card-title { font-size: 12px; font-weight: bold; margin-bottom: 4px; }
                              .card-desc { font-size: 11px; color: #555; line-height: 1.4; }
                              .footer { margin-top: 30px; font-size: 10px; color: #888; }
                            </style>
                          </head>
                          <body>
                            <div class="border-box">
                              <h1>THE GENIUS DIGITAL LIBRARY</h1>
                              <h2>Self Attendance & Desk Allotment Station</h2>
                              <div class="address">Station Road, Near Town Hall, Madhupur, Deoghar, Jharkhand 815353</div>
                              <div class="qr-box">
                                <img src="${masterQrDataUrl}" alt="Library Master Attendance QR Code" style="width: 100%; height: 100%;" />
                              </div>
                              <div class="badge">📲 Scan QR Code or Tap Phone via NFC</div>
                              <div class="grid">
                                <div class="card">
                                  <div class="card-title" style="color: #2E7D32;">🟢 1. ENTRY CHECK-IN</div>
                                  <div class="card-desc">Scan or tap at entrance. An available study desk is automatically allocated for your session.</div>
                                </div>
                                <div class="card">
                                  <div class="card-title" style="color: #C62828;">🔴 2. EXIT CHECK-OUT</div>
                                  <div class="card-desc">Scan or tap again when leaving. Vacates your desk and updates your daily library hours.</div>
                                </div>
                              </div>
                              <div class="footer">www.geniuslibrary.librarywale.in • Madhupur, Jharkhand</div>
                            </div>
                            <script>window.onload = function() { window.print(); }</script>
                          </body>
                        </html>
                      `);
                      printWindow.document.close();
                    }
                  }}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-[#0A2E5C] text-[#FFC107] font-bold text-xs shadow hover:bg-[#141A24] transition cursor-pointer"
                >
                  <Printer className="h-4 w-4" />
                  <span>Print Official A4 Standee Poster</span>
                </button>

                <button
                  type="button"
                  onClick={handleProgramNfcTag}
                  disabled={isWritingNfc}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 text-white font-bold text-xs shadow hover:bg-emerald-700 transition cursor-pointer"
                >
                  <Smartphone className="h-4 w-4" />
                  <span>{isWritingNfc ? "Tap NFC Tag to Phone..." : "Program Physical NFC Tag"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
}
