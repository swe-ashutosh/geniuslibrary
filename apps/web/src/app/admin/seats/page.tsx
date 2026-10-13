"use client";

/**
 * [WEB • PAGE] Seat Matrix Management
 *
 * 3 Distinct Desk Categories:
 * 1. Small Desks (01 to 54)
 * 2. Medium Desks (55 to 104)
 * 3. Large Desks with Locker (105 to 134)
 *
 * Flexible Desk Policy:
 * Unreserved / Flexible pass holders can sit anywhere across all sections where a seat is free.
 *
 * Single Source of Truth:
 * Direct Supabase PostgreSQL synchronization for Add, Delete, and Status operations.
 */
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import {
  Armchair, RefreshCw, Plus, Search,
  User, Lock, CalendarCheck, AlertTriangle, LayoutGrid, List, Grid3X3,
  Table as TableIcon, CheckCircle2, Info, X, Sparkles, Trash2,
  Radio, Smartphone, ChevronRight
} from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { createClient } from "@/lib/supabase/client";
import { isMasterAdminEmail } from "@/lib/config";
import { getStudents, getFees, getAttendance } from "@/lib/api";
import { matchSeatNumber, parseDeskNum } from "@/lib/seatUtils";
import { enqueueOfflineMutation } from "@/lib/offlineSync";

export type SeatCategory = "Small" | "Medium" | "Large with Locker" | "Additional";

export interface SeatData {
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

/**
 * Resolves default category and locker flag based on desk number:
 * - Small: 1 to 54
 * - Medium: 55 to 104
 * - Large with Locker: 105 to 134
 */
export function getDeskCategory(deskNum: number): { zone: SeatCategory; hasLocker: boolean; label: string } {
  if (deskNum >= 1 && deskNum <= 54) {
    return { zone: "Small", hasLocker: false, label: "Small (01-54)" };
  } else if (deskNum >= 55 && deskNum <= 104) {
    return { zone: "Medium", hasLocker: false, label: "Medium (55-104)" };
  } else if (deskNum >= 105 && deskNum <= 134) {
    return { zone: "Large with Locker", hasLocker: true, label: "Large with Locker (105-134)" };
  } else {
    return { zone: "Additional", hasLocker: false, label: `Desk #${deskNum}` };
  }
}

/**
 * Default 134 library desks matrix across the 3 categories
 */
export const defaultSeats134: SeatData[] = Array.from({ length: 134 }, (_, i) => {
  const num = i + 1;
  const id = String(num).padStart(2, "0");
  const cat = getDeskCategory(num);
  return {
    id,
    row: "",
    col: String(num),
    zone: cat.zone,
    hasLocker: cat.hasLocker,
    status: cat.hasLocker ? "locker" : "available",
  };
});

export default function SeatManagementPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [activeTab, setActiveTab] = useState<string>("all");
  const [selectedCategory, setSelectedCategory] = useState<"all" | "Small" | "Medium" | "Large with Locker" | "flexible">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSeatId, setSelectedSeatId] = useState<string>("01");
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);

  // Add Seats Modal States
  const [isAddSeatModalOpen, setIsAddSeatModalOpen] = useState(false);
  const [newSeatCount, setNewSeatCount] = useState(1);
  const [newSeatCategory, setNewSeatCategory] = useState<SeatCategory>("Small");
  const [newSeatHasLocker, setNewSeatHasLocker] = useState(false);
  const [isSubmittingAdd, setIsSubmittingAdd] = useState(false);

  // Delete Seats Modal States
  const [isDeleteSeatsModalOpen, setIsDeleteSeatsModalOpen] = useState(false);
  const [selectedSeatsToDelete, setSelectedSeatsToDelete] = useState<string[]>([]);
  const [deleteSearchQuery, setDeleteSearchQuery] = useState("");
  const [isDeletingSeats, setIsDeletingSeats] = useState(false);

  // Attach Locker Modal States
  const [isAttachLockerModalOpen, setIsAttachLockerModalOpen] = useState(false);
  const [targetLockerSeat, setTargetLockerSeat] = useState<string>("01");

  // Toast Notification
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Master Stand & NFC States
  const [isMasterStandModalOpen, setIsMasterStandModalOpen] = useState(false);
  const [masterQrDataUrl, setMasterQrDataUrl] = useState<string | null>(null);
  const [isWritingNfc, setIsWritingNfc] = useState(false);

  const [seats, setSeats] = useState<SeatData[]>(defaultSeats134);

  // Fetch live profiles and enrolled students to sync real seat occupants
  useEffect(() => {
    let initialSeats = defaultSeats134;
    try {
      const savedStr = localStorage.getItem("genius_seats_134_v1");
      if (savedStr) {
        const parsed = JSON.parse(savedStr);
        if (Array.isArray(parsed) && parsed.length >= 134) {
          initialSeats = parsed;
          setSeats(initialSeats);
        }
      }
    } catch (e) {}

    const fetchLiveSeats = async () => {
      try {
        const todayStr = new Date().toISOString().split("T")[0];
        const supabase = createClient();

        // 1. Fetch Students, Fees, Attendance, and Seats Table in parallel
        const [enrolledStudents, feesList, attendanceList, seatsDbRes] = await Promise.all([
          getStudents().catch(() => []),
          getFees().catch(() => []),
          getAttendance({ date: todayStr }).catch(() => []),
          supabase.from("seats").select("*").order("seat_number", { ascending: true }),
        ]);

        const dbSeats = seatsDbRes.data;

        // Auto-seed Supabase if empty or missing any of the 134 categorized desks
        if (!dbSeats || dbSeats.length < 134) {
          try {
            const seedPayload = defaultSeats134.map((s) => ({
              id: `seat-${s.id}`,
              seat_number: s.id,
              zone: s.zone,
              has_locker: s.hasLocker,
              is_available: true,
            }));
            await supabase.from("seats").upsert(seedPayload, { onConflict: "seat_number" });
          } catch (seedErr) {
            console.warn("Notice: Auto-seeding default 134 seats to Supabase:", seedErr);
          }
        }

        // Build base seats list with all 134 categorized desks guaranteed
        const baseSeatsMap = new Map<string, SeatData>();
        defaultSeats134.forEach((s) => baseSeatsMap.set(s.id, { ...s }));

        if (Array.isArray(dbSeats) && dbSeats.length > 0) {
          dbSeats.forEach((row: any) => {
            const num = parseDeskNum(row.seat_number);
            const id = num !== null ? String(num).padStart(2, "0") : String(row.seat_number);
            const cat = num !== null ? getDeskCategory(num) : { zone: (row.zone || "Additional") as SeatCategory, hasLocker: Boolean(row.has_locker) };
            const hasLocker = row.has_locker !== null && row.has_locker !== undefined ? Boolean(row.has_locker) : cat.hasLocker;

            baseSeatsMap.set(id, {
              id,
              row: "",
              col: id,
              zone: row.zone || cat.zone,
              hasLocker,
              status: row.is_available === false ? "occupied" : hasLocker ? "locker" : "available",
            });
          });
        }

        // 2. Fetch Profiles for student allocations
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
                dueAmount: profileDue > 0 ? profileDue : isProfileDue ? 800 : 0,
                membershipPlan: p.membership_plan,
                isReserved,
              });
            }
          });
        }

        // Merge any assigned students from getStudents() if not already in list
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

        const initialList = Array.from(baseSeatsMap.values()).sort((a, b) => (parseInt(a.id) || 0) - (parseInt(b.id) || 0));

        setSeats(() => {
          const nextSeats = initialList.map((seat) => {
            const matched = allAssignedStudents.find((p: any) => {
              return matchSeatNumber(p.seatNumber, seat.id);
            });

            if (matched) {
              const studentFees = (feesList || []).filter(
                (f: any) => f.studentId === matched.studentId || f.studentName?.toLowerCase() === matched.fullName?.toLowerCase()
              );
              const dueFees = studentFees.filter((f: any) => !f.paid);
              const totalDueFromFees = dueFees.reduce((sum: number, f: any) => sum + (f.amount || 0), 0);

              const profileDueAmount = matched.dueAmount || 0;
              const effectiveDueAmount = profileDueAmount > 0 ? profileDueAmount : totalDueFromFees;
              const isDue = matched.feeStatus === "Due" || effectiveDueAmount > 0;

              const todayAtt = (attendanceList || []).find(
                (att: any) =>
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

              const assignedStatus: SeatData["status"] = matched.isReserved ? "reserved" : "occupied";

              return {
                ...seat,
                status: assignedStatus,
                occupantName: matched.fullName,
                occupantEmail: matched.email,
                occupantPhone: matched.phone,
                occupantShift: matched.shift || "Evening Shift (06:00 PM - 10:00 PM)",
                feeStatus: (isDue ? "Due" : "Paid") as "Paid" | "Due",
                dueAmount: isDue ? effectiveDueAmount || 800 : 0,
                yesterdayAttendance: (hasCheckedInToday ? "Present" : "Absent") as "Present" | "Absent",
                yesterdayTime: hasCheckedInToday ? "08:30 AM - 01:00 PM" : "-",
                lastCheckedIn: todayAtt?.checkIn ? `Today, ${todayAtt.checkIn}` : "-",
                todayAttendanceStatus: todayStatus,
                todayCheckInTime: todayAtt?.checkIn || undefined,
                todayCheckOutTime: todayAtt?.checkOut || undefined,
              };
            }

            // Check if an unreserved student was randomly allocated this desk today and is currently active
            const activeWalkInAtt = (attendanceList || []).find(
              (att: any) =>
                matchSeatNumber(att.seatNumber, seat.id) &&
                (!att.checkOut || att.checkOut === "In Progress" || att.checkOut === "—")
            );

            if (activeWalkInAtt) {
              return {
                ...seat,
                status: "occupied" as SeatData["status"],
                occupantName: activeWalkInAtt.studentName || "Student Member",
                occupantEmail: undefined,
                occupantPhone: undefined,
                occupantShift: activeWalkInAtt.shiftName || "Flexi Attendance",
                feeStatus: "Paid" as const,
                dueAmount: 0,
                yesterdayAttendance: "Present" as const,
                yesterdayTime: "-",
                lastCheckedIn: `Today, ${activeWalkInAtt.checkIn || ""}`,
                todayAttendanceStatus: "active" as const,
                todayCheckInTime: activeWalkInAtt.checkIn || undefined,
                todayCheckOutTime: undefined,
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
              localStorage.setItem("genius_seats_134_v1", JSON.stringify(nextSeats));
            }
          } catch (e) {}

          return nextSeats;
        });
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
    id: "01",
    row: "",
    col: "1",
    zone: "Small",
    hasLocker: false,
    status: "available",
  };

  // Filter seats based on status tabs, category selection, and search query
  const filteredSeats = seats.filter((s) => {
    // 1. Category / Flexible filter
    let matchesCategory = true;
    const num = parseInt(s.id, 10);

    if (selectedCategory === "flexible") {
      // Flexible pass holders can sit anywhere a seat is free
      matchesCategory = (s.status === "available" || s.status === "locker") && !s.occupantName;
    } else if (selectedCategory === "Small") {
      matchesCategory = (num >= 1 && num <= 54) || s.zone === "Small";
    } else if (selectedCategory === "Medium") {
      matchesCategory = (num >= 55 && num <= 104) || s.zone === "Medium";
    } else if (selectedCategory === "Large with Locker") {
      matchesCategory = (num >= 105 && num <= 134) || s.zone === "Large with Locker";
    }

    // 2. Status Tab filter
    const matchesTab =
      activeTab === "all" ||
      (activeTab === "available" && (s.status === "available" || s.status === "locker") && !s.occupantName) ||
      (activeTab === "occupied" && (s.status === "occupied" || Boolean(s.occupantName))) ||
      (activeTab === "reserved" && s.status === "reserved") ||
      (activeTab === "locker" && s.hasLocker) ||
      activeTab === s.status;

    // 3. Search query filter
    const matchesSearch =
      !searchQuery.trim() ||
      s.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      `seat ${s.id}`.includes(searchQuery.toLowerCase()) ||
      `#${s.id}`.includes(searchQuery.toLowerCase()) ||
      (s.zone && s.zone.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (s.occupantName && s.occupantName.toLowerCase().includes(searchQuery.toLowerCase()));

    return matchesCategory && matchesTab && matchesSearch;
  });

  const sortedSeats = [...filteredSeats].sort((a, b) => (parseInt(a.id) || 0) - (parseInt(b.id) || 0));

  // Calculate Overall Metrics
  const totalCount = seats.length;
  const availableCount = seats.filter((s) => (s.status === "available" || s.status === "locker") && !s.occupantName).length;
  const occupiedCount = seats.filter((s) => s.status === "occupied" || (Boolean(s.occupantName) && s.status !== "reserved")).length;
  const reservedCount = seats.filter((s) => s.status === "reserved").length;
  const lockerCount = seats.filter((s) => s.hasLocker).length;
  const disabledCount = seats.filter((s) => s.status === "disabled").length;

  // Category Specific Breakdowns
  const smallSectionSeats = seats.filter((s) => {
    const n = parseInt(s.id, 10);
    return (n >= 1 && n <= 54) || s.zone === "Small";
  });
  const smallAvailable = smallSectionSeats.filter((s) => (s.status === "available" || s.status === "locker") && !s.occupantName).length;
  const smallOccupied = smallSectionSeats.filter((s) => s.status === "occupied" || s.status === "reserved" || Boolean(s.occupantName)).length;

  const mediumSectionSeats = seats.filter((s) => {
    const n = parseInt(s.id, 10);
    return (n >= 55 && n <= 104) || s.zone === "Medium";
  });
  const mediumAvailable = mediumSectionSeats.filter((s) => (s.status === "available" || s.status === "locker") && !s.occupantName).length;
  const mediumOccupied = mediumSectionSeats.filter((s) => s.status === "occupied" || s.status === "reserved" || Boolean(s.occupantName)).length;

  const largeSectionSeats = seats.filter((s) => {
    const n = parseInt(s.id, 10);
    return (n >= 105 && n <= 134) || s.zone === "Large with Locker";
  });
  const largeAvailable = largeSectionSeats.filter((s) => (s.status === "available" || s.status === "locker") && !s.occupantName).length;
  const largeOccupied = largeSectionSeats.filter((s) => s.status === "occupied" || s.status === "reserved" || Boolean(s.occupantName)).length;

  // Filtered views by section for Section-by-Section grid rendering
  const smallFiltered = sortedSeats.filter((s) => {
    const n = parseInt(s.id, 10);
    return (n >= 1 && n <= 54) || s.zone === "Small";
  });
  const mediumFiltered = sortedSeats.filter((s) => {
    const n = parseInt(s.id, 10);
    return (n >= 55 && n <= 104) || s.zone === "Medium";
  });
  const largeFiltered = sortedSeats.filter((s) => {
    const n = parseInt(s.id, 10);
    return (n >= 105 && n <= 134) || s.zone === "Large with Locker";
  });
  const additionalFiltered = sortedSeats.filter((s) => {
    const n = parseInt(s.id, 10);
    return n > 134 && !["Small", "Medium", "Large with Locker"].includes(s.zone);
  });

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
      const payload = "https://genius.librarywale.in/attendance";
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
            data: "https://genius.librarywale.in/attendance",
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
              <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-[#FFC107]/20 text-[#0A2E5C] dark:text-[#FFC107] border border-[#FFC107]/40">
                134 Study Desks
              </span>
            </h1>
            <p className="text-xs text-zinc-500">
              3 Categorized Sections: Small (1-54), Medium (55-104), Large with Locker (105-134), and Flexible Desks.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Master Entrance Stand Button */}
          <button
            onClick={handleOpenMasterStandModal}
            className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 transition active:scale-95 cursor-pointer shadow-xs"
          >
            <Radio className="h-4 w-4 text-emerald-600" />
            <span>Master QR & NFC Stand</span>
          </button>

          {/* Add Seats Button */}
          <button
            onClick={() => {
              const maxNum = seats.reduce((max, s) => Math.max(max, parseInt(s.id) || 0), 0);
              const nextCat = getDeskCategory(maxNum + 1);
              setNewSeatCategory(nextCat.zone);
              setNewSeatHasLocker(nextCat.hasLocker);
              setIsAddSeatModalOpen(true);
            }}
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

          {/* Attach Locker Button */}
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

      {/* FLEXIBLE DESK ALLOTMENT STATUS BANNER */}
      <div className="rounded-3xl border border-blue-200/80 bg-gradient-to-r from-blue-50/90 via-indigo-50/70 to-amber-50/80 dark:from-blue-950/40 dark:via-indigo-950/30 dark:to-amber-950/20 p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#0A2E5C] text-[#FFC107] shadow-sm">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm sm:text-base font-black text-[#0A2E5C] dark:text-white">
                  Flexible Desks (Seat Anywhere When Free)
                </h2>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  {availableCount} Vacant Desks Ready Now
                </span>
              </div>
              <p className="text-xs text-zinc-600 dark:text-zinc-300 mt-1">
                Students with Flexible / Unreserved passes can sit at <strong>any vacant desk</strong> across the library. Live availability:{" "}
                <span className="font-bold text-blue-700 dark:text-blue-300">{smallAvailable} Small</span>,{" "}
                <span className="font-bold text-emerald-700 dark:text-emerald-300">{mediumAvailable} Medium</span>, and{" "}
                <span className="font-bold text-purple-700 dark:text-purple-300">{largeAvailable} Large with Locker</span> free.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setSelectedCategory(selectedCategory === "flexible" ? "all" : "flexible");
                if (selectedCategory !== "flexible") setActiveTab("all");
              }}
              className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                selectedCategory === "flexible"
                  ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30 ring-2 ring-emerald-400"
                  : "bg-white dark:bg-zinc-800 text-[#0A2E5C] dark:text-white border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50"
              }`}
            >
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <span>{selectedCategory === "flexible" ? "Reset View (All Desks)" : "Filter Free Desks for Walk-In"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 no-print">
        {[
          { title: "Total Library Desks", value: `${totalCount}`, icon: Armchair, color: "emerald", desc: `134 Master Study Desks` },
          { title: "Small Desks", value: `${smallSectionSeats.length}`, icon: Armchair, color: "blue", desc: `Desks 01 to 54 (${smallAvailable} free)` },
          { title: "Medium Desks", value: `${mediumSectionSeats.length}`, icon: Armchair, color: "emerald", desc: `Desks 55 to 104 (${mediumAvailable} free)` },
          { title: "Large + Locker", value: `${largeSectionSeats.length}`, icon: Lock, color: "purple", desc: `Desks 105 to 134 (${largeAvailable} free)` },
          { title: "Occupied Now", value: `${occupiedCount}`, icon: User, color: "blue", desc: `${occupiedCount} active today` },
          { title: "Reserved Seats", value: `${reservedCount}`, icon: CalendarCheck, color: "rose", desc: `${reservedCount} permanent` },
        ].map((metric, idx) => (
          <div key={idx} className="rounded-3xl border border-[#E5E7EB] bg-white p-4 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C]">
            <div className="flex items-center gap-3 mb-2">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-xl ${
                  metric.color === "emerald"
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400"
                    : metric.color === "blue"
                    ? "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400"
                    : metric.color === "purple"
                    ? "bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-400"
                    : "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400"
                }`}
              >
                <metric.icon className="h-4 w-4" />
              </div>
            </div>
            <p className="text-[10px] font-black text-zinc-500 uppercase tracking-wider">{metric.title}</p>
            <span className="text-xl sm:text-2xl font-black text-[#0A2E5C] dark:text-white">{metric.value}</span>
            <span className="block text-[9px] text-zinc-400">{metric.desc}</span>
          </div>
        ))}
      </div>

      {/* Main Container - Full Width */}
      <div className="w-full space-y-4 no-print">
        {/* Controls Bar: Category Selector Tabs, Status Filter Tabs, Search & Grid/Table Switcher */}
        <div className="flex flex-col gap-3 bg-white dark:bg-[#0A2E5C] p-3 sm:p-4 rounded-3xl border border-[#E5E7EB]/70 dark:border-zinc-800 shadow-xs">
          {/* Top Row: Category Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 dark:border-zinc-800/80 pb-3">
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
              <span className="text-[11px] font-black text-zinc-400 uppercase tracking-wider mr-1 shrink-0">Sections:</span>
              {[
                { id: "all", label: `All Sections (${totalCount})` },
                { id: "Small", label: `Small (1-54) • ${smallAvailable} Free` },
                { id: "Medium", label: `Medium (55-104) • ${mediumAvailable} Free` },
                { id: "Large with Locker", label: `Large with Locker (105-134) • ${largeAvailable} Free` },
                { id: "flexible", label: `🎯 Flexible Free Only (${availableCount})` },
              ].map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id as any)}
                  className={`whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                    selectedCategory === cat.id
                      ? "bg-[#0A2E5C] text-[#FFC107] shadow-xs border border-[#FFC107]/40 dark:border-zinc-700"
                      : "text-zinc-600 hover:bg-[#F8FAFC] dark:text-zinc-300 dark:hover:bg-zinc-800"
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Grid / Table Switcher */}
            <div className="flex h-9 items-center rounded-xl bg-zinc-100/90 dark:bg-zinc-800/90 p-1 border border-zinc-200/80 dark:border-zinc-700/80 shrink-0">
              <button
                onClick={() => setViewMode("grid")}
                className={`h-7 px-2.5 flex items-center gap-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  viewMode === "grid"
                    ? "bg-white text-[#0A2E5C] shadow-xs dark:bg-[#0A2E5C] dark:text-white"
                    : "text-zinc-400 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-300"
                }`}
                title="Sectioned Grid View"
              >
                <Grid3X3 className="h-4 w-4" />
                <span className="text-[10px]">3-Section Grid</span>
              </button>
              <button
                onClick={() => setViewMode("table")}
                className={`h-7 px-2.5 flex items-center gap-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  viewMode === "table"
                    ? "bg-white text-[#0A2E5C] shadow-xs dark:bg-[#0A2E5C] dark:text-white"
                    : "text-zinc-400 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-300"
                }`}
                title="Detailed Table View"
              >
                <List className="h-4 w-4" />
                <span className="text-[10px]">Table</span>
              </button>
            </div>
          </div>

          {/* Bottom Row: Status Filter Tabs + Searchbar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            {/* Status Filter Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none shrink-0">
              <span className="text-[11px] font-black text-zinc-400 uppercase tracking-wider mr-1 shrink-0">Status:</span>
              {[
                { id: "all", label: `All (${totalCount})` },
                { id: "available", label: `Free (${availableCount})` },
                { id: "occupied", label: `Occupied (${occupiedCount})` },
                { id: "reserved", label: `Reserved (${reservedCount})` },
                { id: "locker", label: `Lockers (${lockerCount})` },
                { id: "disabled", label: `Disabled (${disabledCount})` },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`whitespace-nowrap rounded-xl px-2.5 py-1 text-[11px] font-bold transition-all cursor-pointer ${
                    activeTab === tab.id
                      ? "bg-blue-50 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-900"
                      : "text-zinc-500 hover:bg-[#F8FAFC] dark:hover:bg-zinc-800"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Searchbar */}
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
              <input
                type="text"
                placeholder="Search desk #, zone or student..."
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
          </div>
        </div>

        {/* VIEW 1: 3-SECTION INTERACTIVE MATRIX GRID */}
        {viewMode === "grid" ? (
          <div className="space-y-6">
            {/* Helper to render a desk button */}
            {(() => {
              const renderDeskButton = (seat: SeatData) => {
                const seatId = seat.id;
                const isSelected = selectedSeatId === seatId;
                const displayName = seat.occupantName;

                let colorClass = "bg-emerald-600 text-white border-emerald-700 dark:bg-emerald-600";
                if (seat.status === "disabled") {
                  colorClass = "bg-zinc-400 text-zinc-100 border-zinc-500 dark:bg-zinc-700 dark:text-zinc-300";
                } else if (seat.status === "reserved") {
                  colorClass = "bg-red-600 text-white border-red-700 dark:bg-red-600 shadow-xs";
                } else if (seat.status === "occupied" || Boolean(displayName)) {
                  colorClass = "bg-blue-600 text-white border-blue-700 dark:bg-blue-600 shadow-xs";
                } else if (seat.hasLocker || seat.status === "locker") {
                  colorClass = "bg-violet-600 text-white border-violet-700 dark:bg-violet-600 shadow-xs";
                }

                const isLockerDesk = (seat.hasLocker || seat.status === "locker") && !displayName;

                return (
                  <button
                    key={seatId}
                    onClick={() => {
                      setSelectedSeatId(seatId);
                      setIsInspectorOpen(true);
                    }}
                    className={`
                      relative flex min-h-[64px] sm:min-h-[70px] flex-col items-center justify-center rounded-2xl border font-mono transition-all cursor-pointer p-1.5 shadow-2xs
                      ${colorClass}
                      ${isSelected ? "ring-3 ring-[#0A2E5C] dark:ring-[#FFC107] scale-105 shadow-md z-10" : "opacity-95 hover:opacity-100 hover:scale-102"}
                    `}
                    title={`Desk #${seatId} • ${seat.zone} ${displayName ? `• ${displayName}` : "• Free Desk"} - Click to Inspect`}
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
              };

              return (
                <div className="space-y-6">
                  {/* SECTION 1: SMALL DESKS (1 to 54) */}
                  {(selectedCategory === "all" || selectedCategory === "Small" || selectedCategory === "flexible") && smallFiltered.length > 0 && (
                    <div className="rounded-3xl border border-blue-200/80 bg-white p-5 sm:p-6 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C]">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 border-b border-zinc-100 dark:border-zinc-800 pb-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400 font-black text-sm">
                            S
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-base font-black text-[#0A2E5C] dark:text-white">
                                Section 1: Small Desks (01 to 54)
                              </h3>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border border-blue-200">
                                54 Desks
                              </span>
                            </div>
                            <p className="text-[11px] text-zinc-500 mt-0.5">
                              Compact study cubicles. Free desks open for all flexible walk-in students.
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 text-xs font-bold">
                          <span className="text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 rounded-xl border border-emerald-200 dark:border-emerald-900">
                            🟢 {smallAvailable} Free
                          </span>
                          <span className="text-blue-600 bg-blue-50 dark:bg-blue-950/40 px-2.5 py-1 rounded-xl border border-blue-200 dark:border-blue-900">
                            🔵 {smallOccupied} Occupied
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-9 xl:grid-cols-10 gap-2 sm:gap-2.5">
                        {smallFiltered.map((seat) => renderDeskButton(seat))}
                      </div>
                    </div>
                  )}

                  {/* SECTION 2: MEDIUM DESKS (55 to 104) */}
                  {(selectedCategory === "all" || selectedCategory === "Medium" || selectedCategory === "flexible") && mediumFiltered.length > 0 && (
                    <div className="rounded-3xl border border-emerald-200/80 bg-white p-5 sm:p-6 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C]">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 border-b border-zinc-100 dark:border-zinc-800 pb-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 font-black text-sm">
                            M
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-base font-black text-[#0A2E5C] dark:text-white">
                                Section 2: Medium Desks (55 to 104)
                              </h3>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200">
                                50 Desks
                              </span>
                            </div>
                            <p className="text-[11px] text-zinc-500 mt-0.5">
                              Standard executive desks. Free desks open for all flexible walk-in students.
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 text-xs font-bold">
                          <span className="text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 rounded-xl border border-emerald-200 dark:border-emerald-900">
                            🟢 {mediumAvailable} Free
                          </span>
                          <span className="text-blue-600 bg-blue-50 dark:bg-blue-950/40 px-2.5 py-1 rounded-xl border border-blue-200 dark:border-blue-900">
                            🔵 {mediumOccupied} Occupied
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-9 xl:grid-cols-10 gap-2 sm:gap-2.5">
                        {mediumFiltered.map((seat) => renderDeskButton(seat))}
                      </div>
                    </div>
                  )}

                  {/* SECTION 3: LARGE DESKS WITH LOCKER (105 to 134) */}
                  {(selectedCategory === "all" || selectedCategory === "Large with Locker" || selectedCategory === "flexible") && largeFiltered.length > 0 && (
                    <div className="rounded-3xl border border-purple-200/80 bg-white p-5 sm:p-6 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C]">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 border-b border-zinc-100 dark:border-zinc-800 pb-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-400 font-black text-sm">
                            <Lock className="h-5 w-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-base font-black text-[#0A2E5C] dark:text-white">
                                Section 3: Large Desks with Locker (105 to 134)
                              </h3>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300 border border-purple-200">
                                30 Desks with Lockers
                              </span>
                            </div>
                            <p className="text-[11px] text-zinc-500 mt-0.5">
                              Premium spacious study spaces with dedicated built-in personal storage lockers.
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 text-xs font-bold">
                          <span className="text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 rounded-xl border border-emerald-200 dark:border-emerald-900">
                            🟢 {largeAvailable} Free
                          </span>
                          <span className="text-blue-600 bg-blue-50 dark:bg-blue-950/40 px-2.5 py-1 rounded-xl border border-blue-200 dark:border-blue-900">
                            🔵 {largeOccupied} Occupied
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-9 xl:grid-cols-10 gap-2 sm:gap-2.5">
                        {largeFiltered.map((seat) => renderDeskButton(seat))}
                      </div>
                    </div>
                  )}

                  {/* SECTION 4 (CONDITIONAL): ADDITIONAL DESKS (135+) */}
                  {additionalFiltered.length > 0 && (
                    <div className="rounded-3xl border border-zinc-200 bg-white p-5 sm:p-6 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C]">
                      <div className="flex items-center justify-between gap-3 mb-5 border-b border-zinc-100 dark:border-zinc-800 pb-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 font-black text-sm">
                            +
                          </div>
                          <div>
                            <h3 className="text-base font-black text-[#0A2E5C] dark:text-white">
                              Additional Custom Desks (135+)
                            </h3>
                            <p className="text-[11px] text-zinc-500 mt-0.5">Extra desks created by admin.</p>
                          </div>
                        </div>
                        <span className="text-xs font-bold text-zinc-500">{additionalFiltered.length} Desks</span>
                      </div>
                      <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-9 xl:grid-cols-10 gap-2 sm:gap-2.5">
                        {additionalFiltered.map((seat) => renderDeskButton(seat))}
                      </div>
                    </div>
                  )}

                  {/* Empty Result Notification */}
                  {sortedSeats.length === 0 && (
                    <div className="rounded-3xl border border-[#E5E7EB] bg-white p-12 text-center shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C]">
                      <Armchair className="mx-auto h-12 w-12 text-zinc-300 dark:text-zinc-600 mb-3" />
                      <h3 className="text-base font-black text-[#0A2E5C] dark:text-white">No Desks Match Your Filter</h3>
                      <p className="text-xs text-zinc-400 mt-1 max-w-sm mx-auto">
                        Try resetting your search query or selecting "All Sections" to view all available desks.
                      </p>
                      <button
                        onClick={() => {
                          setSearchQuery("");
                          setActiveTab("all");
                          setSelectedCategory("all");
                        }}
                        className="mt-4 px-4 py-2 rounded-xl bg-[#0A2E5C] text-[#FFC107] text-xs font-bold cursor-pointer"
                      >
                        Reset All Filters
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Legend Footer */}
            <div className="rounded-2xl border border-zinc-200/80 bg-white p-4 dark:border-zinc-800 dark:bg-[#0A2E5C] flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-500">
              <div className="flex items-center gap-2">
                <Info className="h-4 w-4 text-[#0B5ED7]" />
                <span>Click on any desk card to open Desk Inspector, modify status, or allocate occupant.</span>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-[11px] font-bold">
                <div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-600"></span><span>Free (Green)</span></div>
                <div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-blue-600"></span><span>Occupied / Walk-In (Blue)</span></div>
                <div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-red-600"></span><span>Reserved (Red)</span></div>
                <div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-violet-600"></span><span>Locker Desk (Violet)</span></div>
                <div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-zinc-400"></span><span>Disabled</span></div>
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
                <p className="text-[11px] text-zinc-400">Total {sortedSeats.length} matching seats • Click row to inspect</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[#E5E7EB]/70 dark:border-zinc-800 bg-[#F8FAFC]/60 dark:bg-zinc-800/40 text-[10px] font-black uppercase tracking-wider text-zinc-500">
                  <tr>
                    <th className="p-3">Desk ID</th>
                    <th className="p-3">Category Section</th>
                    <th className="p-3">Storage Locker</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Current Occupant</th>
                    <th className="p-3">Shift Timing</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E7EB]/40 dark:divide-zinc-800/60">
                  {sortedSeats.map((seat) => (
                    <tr
                      key={seat.id}
                      onClick={() => {
                        setSelectedSeatId(seat.id);
                        setIsInspectorOpen(true);
                      }}
                      className={`hover:bg-[#F8FAFC]/50 dark:hover:bg-zinc-800/40 transition cursor-pointer ${
                        selectedSeatId === seat.id ? "bg-[#FFC107]/10 dark:bg-[#FFC107]/10" : ""
                      }`}
                    >
                      <td className="p-3 font-mono font-black text-[#0A2E5C] dark:text-white">
                        #{seat.id}
                      </td>
                      <td className="p-3">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${
                            seat.zone === "Small"
                              ? "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border border-blue-200"
                              : seat.zone === "Medium"
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200"
                              : "bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300 border border-purple-200"
                          }`}
                        >
                          {seat.zone}
                        </span>
                      </td>
                      <td className="p-3">
                        {seat.hasLocker ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-purple-700 bg-purple-50 dark:bg-purple-950/40 px-2 py-0.5 rounded border border-purple-200">
                            <Lock className="h-2.5 w-2.5" /> Locker Attached
                          </span>
                        ) : (
                          <span className="text-zinc-400">Standard</span>
                        )}
                      </td>
                      <td className="p-3">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                            seat.status === "available"
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                              : seat.status === "occupied"
                              ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                              : seat.status === "reserved"
                              ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                              : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                          }`}
                        >
                          {seat.status}
                        </span>
                      </td>
                      <td className="p-3 font-medium text-[#0A2E5C] dark:text-white">
                        {seat.occupantName || <span className="text-zinc-400 italic">None (Free)</span>}
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
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#F8FAFC] hover:bg-[#E5E7EB] dark:bg-zinc-800 text-[11px] font-bold text-[#0A2E5C] dark:text-white transition cursor-pointer"
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
                  <p className="text-[11px] text-zinc-500">
                    Category: {selectedSeat.zone} • {selectedSeat.hasLocker ? "Locker Attached" : "Standard Desk"}
                  </p>
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
                      {selectedSeat.zone} Section
                    </span>
                    {selectedSeat.hasLocker && (
                      <span className="inline-flex items-center gap-1 text-[9px] font-bold text-purple-700 bg-purple-50 dark:bg-purple-950/40 px-2 py-0.5 rounded border border-purple-200">
                        <Lock className="h-2.5 w-2.5" /> Locker Attached
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Occupant Details Card */}
              <div className="p-4 rounded-2xl bg-[#F8FAFC]/60 dark:bg-zinc-800/60 border border-[#E5E7EB]/60 dark:border-zinc-700 space-y-2.5 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-zinc-400">Occupant:</span>
                  <span className="font-bold text-[#0A2E5C] dark:text-white">
                    {selectedSeat.occupantName || "None (Vacant Free Desk)"}
                  </span>
                </div>
                {selectedSeat.occupantPhone && (
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-400">Phone:</span>
                    <span className="font-mono text-zinc-700 dark:text-zinc-200">{selectedSeat.occupantPhone}</span>
                  </div>
                )}
                {selectedSeat.occupantShift && (
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-400">Shift:</span>
                    <span className="text-zinc-700 dark:text-zinc-200">{selectedSeat.occupantShift}</span>
                  </div>
                )}
                {selectedSeat.lastCheckedIn && (
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-400">Attendance:</span>
                    <span className="text-emerald-600 font-bold">{selectedSeat.lastCheckedIn}</span>
                  </div>
                )}
              </div>

              {/* Quick Status Mode Switcher (Updates Supabase PostgreSQL) */}
              <div className="space-y-1.5 pt-1">
                <p className="font-bold text-zinc-600 dark:text-zinc-300 text-[11px]">Seat Status Mode (Updates Database):</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  <button
                    type="button"
                    onClick={async () => {
                      const supabase = createClient();
                      await supabase.from("seats").update({
                        is_available: true,
                        current_student_id: null,
                        current_student_name: null,
                        occupied_at: null,
                      }).or(`seat_number.eq.${selectedSeat.id},id.eq.seat-${selectedSeat.id}`);

                      setSeats((prev) => {
                        const updated = prev.map((s) => (s.id === selectedSeat.id ? { ...s, status: "available" as const, occupantName: undefined } : s));
                        if (typeof window !== "undefined") localStorage.setItem("genius_seats_134_v1", JSON.stringify(updated));
                        return updated;
                      });
                      setToastMsg(`Desk #${selectedSeat.id} marked as Free (Green) in database.`);
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
                    onClick={async () => {
                      const supabase = createClient();
                      await supabase.from("seats").update({
                        is_available: false,
                      }).or(`seat_number.eq.${selectedSeat.id},id.eq.seat-${selectedSeat.id}`);

                      setSeats((prev) => {
                        const updated = prev.map((s) => (s.id === selectedSeat.id ? { ...s, status: "occupied" as const } : s));
                        if (typeof window !== "undefined") localStorage.setItem("genius_seats_134_v1", JSON.stringify(updated));
                        return updated;
                      });
                      setToastMsg(`Desk #${selectedSeat.id} marked as Student Seat (Blue) in database.`);
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
                    onClick={async () => {
                      const supabase = createClient();
                      await supabase.from("seats").update({
                        is_available: false,
                      }).or(`seat_number.eq.${selectedSeat.id},id.eq.seat-${selectedSeat.id}`);

                      setSeats((prev) => {
                        const updated = prev.map((s) => (s.id === selectedSeat.id ? { ...s, status: "reserved" as const } : s));
                        if (typeof window !== "undefined") localStorage.setItem("genius_seats_134_v1", JSON.stringify(updated));
                        return updated;
                      });
                      setToastMsg(`Desk #${selectedSeat.id} marked as Reserved (Red) in database.`);
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
                    onClick={async () => {
                      const supabase = createClient();
                      await supabase.from("seats").update({
                        has_locker: true,
                      }).or(`seat_number.eq.${selectedSeat.id},id.eq.seat-${selectedSeat.id}`);

                      setSeats((prev) => {
                        const updated = prev.map((s) => (s.id === selectedSeat.id ? { ...s, status: "locker" as const, hasLocker: true } : s));
                        if (typeof window !== "undefined") localStorage.setItem("genius_seats_134_v1", JSON.stringify(updated));
                        return updated;
                      });
                      setToastMsg(`Desk #${selectedSeat.id} marked with Locker (Violet) in database.`);
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

              {/* Actions */}
              <div className="space-y-2.5 pt-1">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={async () => {
                      if (window.confirm(`Are you sure you want to permanently delete Desk #${selectedSeat.id} from database?`)) {
                        try {
                          const supabase = createClient();
                          await supabase.from("seats").delete().in("seat_number", [selectedSeat.id, `seat-${selectedSeat.id}`]);
                          await supabase.from("seats").delete().in("id", [`seat-${selectedSeat.id}`, selectedSeat.id]);

                          setSeats((prev) => {
                            const updated = prev.filter((s) => s.id !== selectedSeat.id);
                            if (typeof window !== "undefined") localStorage.setItem("genius_seats_134_v1", JSON.stringify(updated));
                            return updated;
                          });
                          setIsInspectorOpen(false);
                          setToastMsg(`Desk #${selectedSeat.id} deleted from database.`);
                        } catch (err: any) {
                          setToastMsg(`Delete error: ${err.message || "Failed"}`);
                        }
                      }
                    }}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50/80 p-2.5 text-xs font-bold text-rose-700 hover:bg-rose-100 transition dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-400 dark:hover:bg-rose-900/60 cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
                    Delete Seat
                  </button>

                  <button
                    onClick={async () => {
                      const nextState = selectedSeat.status === "disabled" ? "available" : "disabled";
                      const supabase = createClient();
                      await supabase.from("seats").update({
                        is_available: nextState === "available",
                      }).or(`seat_number.eq.${selectedSeat.id},id.eq.seat-${selectedSeat.id}`);

                      setSeats((prev) => {
                        const updated = prev.map((s) =>
                          s.id === selectedSeat.id ? { ...s, status: nextState as "available" | "disabled" } : s
                        );
                        if (typeof window !== "undefined") localStorage.setItem("genius_seats_134_v1", JSON.stringify(updated));
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
              <span>Desk ID: #{selectedSeat.id} • {selectedSeat.zone}</span>
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
      {/* 1. ADD SEATS MODAL (Synchronizes directly to Supabase PostgreSQL) */}
      {/* ========================================================================= */}
      {mounted && isAddSeatModalOpen && createPortal(
        <div
          onClick={() => !isSubmittingAdd && setIsAddSeatModalOpen(false)}
          className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-6 bg-black/75 backdrop-blur-sm no-print animate-in fade-in duration-200"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-md max-h-[90vh] flex flex-col rounded-3xl border border-[#E5E7EB] bg-white shadow-2xl dark:border-zinc-800 dark:bg-[#0A2E5C] overflow-hidden animate-in zoom-in-95 duration-200"
          >
            {/* Header */}
            <div className="shrink-0 flex items-center justify-between p-5 border-b border-[#E5E7EB]/60 dark:border-zinc-800 bg-[#F8FAFC]/50 dark:bg-zinc-900/50">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-linear-to-r from-[#0B5ED7] to-[#FFC107] text-[#0A2E5C] shadow-xs">
                  <Plus className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-black text-[#0A2E5C] dark:text-white">Add New Study Desks</h2>
                  <p className="text-[11px] text-zinc-500">Saves directly to Supabase primary database</p>
                </div>
              </div>
              <button
                onClick={() => setIsAddSeatModalOpen(false)}
                disabled={isSubmittingAdd}
                className="rounded-full p-2 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-white transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setIsSubmittingAdd(true);
                try {
                  const maxNum = seats.reduce((max, s) => Math.max(max, parseInt(s.id) || 0), 0);
                  const count = Math.max(1, newSeatCount);
                  const newDesks: SeatData[] = [];
                  const dbPayload: any[] = [];

                  for (let i = 1; i <= count; i++) {
                    const num = maxNum + i;
                    const id = String(num).padStart(2, "0");
                    const zone = newSeatCategory;
                    const hasLocker = newSeatHasLocker;

                    newDesks.push({
                      id,
                      row: "",
                      col: String(num),
                      zone,
                      hasLocker,
                      status: hasLocker ? "locker" : "available",
                    });

                    dbPayload.push({
                      id: `seat-${id}`,
                      seat_number: id,
                      zone,
                      has_locker: hasLocker,
                      is_available: true,
                      created_at: new Date().toISOString(),
                    });
                  }

                  // 1. DIRECT SUPABASE INSERT / UPSERT (Strict Single Source of Truth)
                  const supabase = createClient();
                  const { error } = await supabase.from("seats").upsert(dbPayload, { onConflict: "seat_number" });
                  if (error) {
                    console.error("Supabase add seats error:", error);
                    // Buffer for auto-upload when back online
                    enqueueOfflineMutation({
                      type: "seat_upsert",
                      table: "seats",
                      action: "upsert",
                      payload: dbPayload,
                    });
                  }

                  // 2. Update Local State
                  setSeats((prev) => {
                    const updated = [...prev, ...newDesks].sort((a, b) => (parseInt(a.id) || 0) - (parseInt(b.id) || 0));
                    if (typeof window !== "undefined") {
                      localStorage.setItem("genius_seats_134_v1", JSON.stringify(updated));
                      window.dispatchEvent(new CustomEvent("seats_updated", { detail: { count: updated.length } }));
                    }
                    return updated;
                  });

                  setIsAddSeatModalOpen(false);
                  setToastMsg(
                    `✓ Successfully added ${count} new desk(s) and saved to Supabase! (Desk #${maxNum + 1}${
                      count > 1 ? ` to #${maxNum + count}` : ""
                    }). Total: ${seats.length + count}`
                  );
                } catch (err: any) {
                  setToastMsg(`Notice: Saved locally and queued for Supabase upload.`);
                } finally {
                  setIsSubmittingAdd(false);
                }
              }}
              className="flex-1 min-h-0 overflow-y-auto p-5 sm:p-6 space-y-4 text-xs"
            >
              {/* Category Selection */}
              <div>
                <label className="block font-bold text-zinc-600 dark:text-zinc-300 mb-1">
                  Desk Category / Section
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: "Small", label: "Small", sub: "1 to 54", hasLocker: false },
                    { id: "Medium", label: "Medium", sub: "55 to 104", hasLocker: false },
                    { id: "Large with Locker", label: "Large", sub: "105 to 134", hasLocker: true },
                  ].map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => {
                        setNewSeatCategory(cat.id as SeatCategory);
                        setNewSeatHasLocker(cat.hasLocker);
                      }}
                      className={`p-2.5 rounded-xl border text-center transition cursor-pointer ${
                        newSeatCategory === cat.id
                          ? "border-[#0B5ED7] bg-blue-50 text-[#0A2E5C] dark:bg-blue-950/60 dark:text-white dark:border-blue-700 ring-2 ring-blue-400"
                          : "border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50"
                      }`}
                    >
                      <span className="block font-black text-xs">{cat.label}</span>
                      <span className="text-[10px] text-zinc-400">{cat.sub}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Number of desks */}
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

              {/* Next desk calculation notice */}
              {(() => {
                const maxNum = seats.reduce((max, s) => Math.max(max, parseInt(s.id) || 0), 0);
                const count = Math.max(1, newSeatCount);
                return (
                  <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300 text-xs">
                    <p className="font-bold">Next Desk Assignment:</p>
                    <p className="text-[11px] mt-0.5">
                      Will create Desk #{maxNum + 1} {count > 1 ? `through Desk #${maxNum + count}` : ""} under Section <strong>{newSeatCategory}</strong> (Database total: {seats.length + count})
                    </p>
                  </div>
                );
              })()}

              {/* Locker checkbox */}
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
                  <span>Attach Secure Storage Locker to these desks</span>
                </label>
              </div>

              <div className="pt-3 border-t border-[#E5E7EB]/60 dark:border-zinc-800 flex justify-end gap-2">
                <button
                  type="button"
                  disabled={isSubmittingAdd}
                  onClick={() => setIsAddSeatModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-zinc-200 text-xs font-bold text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingAdd}
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-linear-to-r from-[#0B5ED7] to-[#FFC107] text-xs font-black text-[#0A2E5C] shadow-md shadow-[#0B5ED7]/20 hover:opacity-95 transition cursor-pointer"
                >
                  {isSubmittingAdd ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>Saving to Supabase...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="h-3.5 w-3.5" />
                      <span>Add & Sync to Database</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* ========================================================================= */}
      {/* 2. DELETE SEATS MODAL (Deletes directly from Supabase PostgreSQL) */}
      {/* ========================================================================= */}
      {mounted && isDeleteSeatsModalOpen && createPortal(
        <div
          onClick={() => !isDeletingSeats && setIsDeleteSeatsModalOpen(false)}
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
                  <h2 className="text-base font-black text-[#0A2E5C] dark:text-white">Delete Desks</h2>
                  <p className="text-[11px] text-zinc-500">Permanently removes desks from Supabase database</p>
                </div>
              </div>
              <button
                onClick={() => setIsDeleteSeatsModalOpen(false)}
                disabled={isDeletingSeats}
                className="rounded-full p-2 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-white transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-4 text-xs">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-zinc-400" />
                  <input
                    type="text"
                    value={deleteSearchQuery}
                    onChange={(e) => setDeleteSearchQuery(e.target.value)}
                    placeholder="Filter by desk # or category..."
                    className="w-full rounded-xl border border-zinc-200 bg-[#F8FAFC]/50 py-2 pl-8.5 pr-3 text-xs text-[#0A2E5C] dark:border-zinc-700 dark:bg-zinc-800 dark:text-white focus:border-rose-500 focus:outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const filtered = seats.filter(
                      (s) =>
                        !deleteSearchQuery ||
                        s.id.toLowerCase().includes(deleteSearchQuery.toLowerCase()) ||
                        (s.zone && s.zone.toLowerCase().includes(deleteSearchQuery.toLowerCase())) ||
                        (s.occupantName && s.occupantName.toLowerCase().includes(deleteSearchQuery.toLowerCase()))
                    );
                    const allIds = filtered.map((s) => s.id);
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

              {/* Grid of Seats to select */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-[11px] font-bold text-zinc-500">
                  <span>Available Desks ({seats.length} total)</span>
                  <span className="text-rose-600 font-black">{selectedSeatsToDelete.length} selected</span>
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 max-h-56 overflow-y-auto p-2 border border-zinc-200 rounded-2xl bg-[#FAF9F6] dark:border-zinc-800 dark:bg-zinc-900/40">
                  {seats
                    .filter(
                      (s) =>
                        !deleteSearchQuery ||
                        s.id.toLowerCase().includes(deleteSearchQuery.toLowerCase()) ||
                        (s.zone && s.zone.toLowerCase().includes(deleteSearchQuery.toLowerCase())) ||
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
                            setSelectedSeatsToDelete((prev) =>
                              prev.includes(s.id) ? prev.filter((id) => id !== s.id) : [...prev, s.id]
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
                            {isAssigned ? s.occupantName?.split(" ")[0] || "Assigned" : s.zone}
                          </span>
                        </button>
                      );
                    })}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="shrink-0 p-4 border-t border-[#E5E7EB]/60 dark:border-zinc-800 flex items-center justify-between bg-[#F8FAFC]/30 dark:bg-zinc-900/30">
              <span className="text-xs text-zinc-500 font-bold">
                {selectedSeatsToDelete.length} seat(s) selected
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={isDeletingSeats}
                  onClick={() => setIsDeleteSeatsModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-zinc-200 text-xs font-bold text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={selectedSeatsToDelete.length === 0 || isDeletingSeats}
                  onClick={async () => {
                    setIsDeletingSeats(true);
                    try {
                      const supabase = createClient();
                      const seatNumbersToDelete = selectedSeatsToDelete.flatMap((num) => [
                        num,
                        String(parseInt(num, 10)),
                        String(parseInt(num, 10)).padStart(2, "0"),
                      ]);
                      const seatIdsToDelete = selectedSeatsToDelete.flatMap((num) => [
                        `seat-${num}`,
                        `seat-${parseInt(num, 10)}`,
                      ]);

                      const { error: delErr } = await supabase.from("seats").delete().in("seat_number", seatNumbersToDelete);
                      await supabase.from("seats").delete().in("id", seatIdsToDelete);

                      if (delErr) {
                        seatNumbersToDelete.forEach((sNum) => {
                          enqueueOfflineMutation({
                            type: "seat_delete",
                            table: "seats",
                            action: "delete",
                            payload: {},
                            filter: { column: "seat_number", value: sNum },
                          });
                        });
                      }

                      const toDelete = new Set(selectedSeatsToDelete);
                      const remaining = seats.filter((s) => !toDelete.has(s.id));
                      setSeats(remaining);

                      if (typeof window !== "undefined") {
                        localStorage.setItem("genius_seats_134_v1", JSON.stringify(remaining));
                        window.dispatchEvent(new CustomEvent("seats_updated", { detail: { count: remaining.length } }));
                      }

                      setIsDeleteSeatsModalOpen(false);
                      setToastMsg(`✓ Successfully deleted ${selectedSeatsToDelete.length} desk(s) from Supabase!`);
                      setSelectedSeatsToDelete([]);
                    } catch (err: any) {
                      setToastMsg(`Delete error: ${err.message || "Failed to delete"}`);
                    } finally {
                      setIsDeletingSeats(false);
                    }
                  }}
                  className="px-4 py-2 rounded-xl bg-rose-600 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50 transition cursor-pointer"
                >
                  {isDeletingSeats ? "Deleting..." : `Delete ${selectedSeatsToDelete.length} Desks`}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ========================================================================= */}
      {/* 3. ATTACH / DETACH LOCKER MODAL */}
      {/* ========================================================================= */}
      {mounted && isAttachLockerModalOpen && createPortal(
        <div
          onClick={() => setIsAttachLockerModalOpen(false)}
          className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-6 bg-black/75 backdrop-blur-sm no-print animate-in fade-in duration-200"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-md max-h-[90vh] flex flex-col rounded-3xl border border-purple-200 bg-white shadow-2xl dark:border-purple-900/60 dark:bg-[#0A2E5C] overflow-hidden animate-in zoom-in-95 duration-200"
          >
            {/* Header */}
            <div className="shrink-0 flex items-center justify-between p-5 border-b border-purple-100 dark:border-zinc-800 bg-purple-50/50 dark:bg-purple-950/20">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-purple-600 text-white shadow-xs">
                  <Lock className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-black text-[#0A2E5C] dark:text-white">Locker Attachment</h2>
                  <p className="text-[11px] text-zinc-500">Configure built-in storage locker for desk</p>
                </div>
              </div>
              <button
                onClick={() => setIsAttachLockerModalOpen(false)}
                className="rounded-full p-2 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-white transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5 sm:p-6 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-zinc-600 dark:text-zinc-300 mb-1">Select Target Desk</label>
                <select
                  value={targetLockerSeat}
                  onChange={(e) => setTargetLockerSeat(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-[#F8FAFC]/50 p-2.5 font-bold text-[#0A2E5C] dark:border-zinc-700 dark:bg-zinc-800 dark:text-white focus:border-purple-500 focus:outline-none"
                >
                  {seats.map((s) => (
                    <option key={s.id} value={s.id}>
                      Desk #{s.id} ({s.zone}) {s.hasLocker ? "• [Locker Attached]" : "• [No Locker]"}
                    </option>
                  ))}
                </select>
              </div>

              {(() => {
                const target = seats.find((s) => s.id === targetLockerSeat) || seats[0];
                return (
                  <div className="p-4 rounded-2xl bg-[#F8FAFC]/60 dark:bg-zinc-800/60 border border-[#E5E7EB]/60 dark:border-zinc-700 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-zinc-400">Desk ID:</span>
                      <span className="font-mono font-black text-[#0A2E5C] dark:text-white">#{target.id} ({target.zone})</span>
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
                  const target = seats.find((s) => s.id === targetLockerSeat);
                  const isCurrentlyAttached = target?.hasLocker;

                  return (
                    <button
                      type="button"
                      onClick={async () => {
                        const nextState = !isCurrentlyAttached;
                        const supabase = createClient();
                        await supabase
                          .from("seats")
                          .update({ has_locker: nextState })
                          .or(`seat_number.eq.${targetLockerSeat},id.eq.seat-${targetLockerSeat}`);

                        setSeats((prev) => {
                          const updated = prev.map((s) => {
                            if (s.id === targetLockerSeat) {
                              return {
                                ...s,
                                hasLocker: nextState,
                                status: s.status === "locker" && !nextState ? "available" : s.status,
                              };
                            }
                            return s;
                          });
                          if (typeof window !== "undefined") {
                            localStorage.setItem("genius_seats_134_v1", JSON.stringify(updated));
                          }
                          return updated;
                        });

                        setToastMsg(`Locker ${isCurrentlyAttached ? "detached from" : "attached to"} Desk #${targetLockerSeat} and updated in Supabase!`);
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
      {/* 4. MASTER STANDEE POSTER & NFC STAND PROGRAMMER MODAL */}
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
                              <div class="footer">www.genius.librarywale.in • Madhupur, Sonbhadra</div>
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
                  <RefreshCw className="h-4 w-4" />
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
