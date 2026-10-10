"use client";

/**
 * [WEB • PAGE] Staff Portal & Front Desk Terminal
 *
 * Dedicated Staff Dashboard styled identically to Admin Dashboard with
 * operational clearances:
 * - See attendance & mark attendance (live scanner + 1-click check-in/out)
 * - Register new students & approve applications
 * - Collect monthly fees & view monthly fee revenue (strictly current month)
 * - Full desk & seat layout matrix with assignment
 * - Full mock tests & exam results desk (scorecard & mark entry)
 * - 2-way student help desk messaging
 */
import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BrandLogo } from "@/components/BrandLogo";
import { createClient } from "@/lib/supabase/client";
import { getSavedUserRole, saveUserRole } from "@/lib/authInactivity";
import { BRAND_CONFIG, isMasterAdminEmail } from "@/lib/config";
import {
  getStudents,
  getAttendance,
  recordCheckIn,
  recordCheckOut,
  getStaffMembers,
  getFees,
  createFee,
  clearStudentUpiClaims,
  getMessages,
  sendMessage,
  markMessagesAsRead,
  updateStudentStatus,
  StaffMember,
  FeeRecord,
  MessageRecord,
  Student,
  AttendanceRecord as ApiAttendanceRecord
} from "@/lib/api";
import {
  getLibraryExams,
  getAllExamMarks,
  saveStudentMark,
  syncExamsAndMarksFromSupabase,
  LibraryExam,
  StudentExamMark
} from "@/lib/examResults";
import { AdminStudentQrScannerModal } from "@/components/AdminStudentQrScannerModal";
import { matchSeatNumber, parseDeskNum, formatDeskId } from "@/lib/seatUtils";
import {
  LayoutGrid,
  QrCode,
  Camera,
  UserCheck,
  IndianRupee,
  AlertCircle,
  CheckCircle2,
  LogOut,
  Grid3X3,
  RefreshCw,
  Award,
  Sparkles,
  Search,
  Send,
  CheckCheck,
  ShieldCheck,
  Check,
  X,
  Clock,
  User,
  Users,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Bold,
  Italic,
  Armchair,
  MessageSquare,
  UserPlus,
  Lock,
  Wallet,
  Calendar,
  Activity,
  TrendingUp,
  Receipt,
  Phone,
  Filter,
  CheckCircle,
  HelpCircle,
  Info,
  Menu
} from "lucide-react";

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

type StaffTab = "dashboard" | "attendance" | "students" | "fees" | "seats" | "results" | "messages";

interface StaffStudent {
  id: string;
  name: string;
  studentCode: string;
  rollNo: string;
  seatNo: number | null;
  seatCode: string;
  rawSeat?: string;
  zone: string;
  monthlyFee: number;
  feeStatus: "paid" | "due";
  shift: string;
  checkedInNow: boolean;
  phone?: string;
  email?: string;
  status: string;
  membershipPlan?: string;
  isReserved?: boolean;
  checkInTime?: string;
}

export default function StaffPortal() {
  const router = useRouter();
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  const [activeTab, setActiveTab] = useState<StaffTab>("dashboard");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Date and Time State
  const [currentDateStr, setCurrentDateStr] = useState("");
  const [currentTimeStr, setCurrentTimeStr] = useState("");

  useEffect(() => {
    const updateDateTime = () => {
      const now = new Date();
      setCurrentDateStr(
        now.toLocaleDateString("en-IN", {
          weekday: "short",
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      );
      setCurrentTimeStr(
        now.toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
        })
      );
    };
    updateDateTime();
    const timer = setInterval(updateDateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // Staff Identity
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [currentUserIsAdmin, setCurrentUserIsAdmin] = useState(false);
  const [currentStaff, setCurrentStaff] = useState<StaffMember>({
    id: "",
    name: "Staff Member",
    email: "",
    phone: "",
    role: "prime_staff",
    category: "Prime Staff",
    shiftAssigned: "Morning Shift (06:00 AM - 02:00 PM)",
    status: "active",
  });
  const [isStaffSwitcherOpen, setIsStaffSwitcherOpen] = useState(false);

  // Operational Data
  const [students, setStudents] = useState<StaffStudent[]>([]);
  const [rawStudents, setRawStudents] = useState<Student[]>([]);
  const [attendance, setAttendance] = useState<ApiAttendanceRecord[]>([]);
  const [exams, setExams] = useState<LibraryExam[]>([]);
  const [examMarks, setExamMarks] = useState<StudentExamMark[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<string>("");
  const [fees, setFees] = useState<FeeRecord[]>([]);
  const [messages, setMessages] = useState<MessageRecord[]>([]);

  // Turnstile Gate Scanner State
  const [scanInput, setScanInput] = useState("");
  const [isQrScannerOpen, setIsQrScannerOpen] = useState(false);
  const [scanResult, setScanResult] = useState<{
    status: "success" | "warning" | "error";
    message: string;
    student?: StaffStudent;
  } | null>(null);

  // Fee Collection Modal / Form State
  const [isFeeModalOpen, setIsFeeModalOpen] = useState(false);
  const [feeStudentRoll, setFeeStudentRoll] = useState("");
  const [feeAmount, setFeeAmount] = useState(900);
  const [feeMode, setFeeMode] = useState<"Cash" | "UPI">("UPI");
  const [feeDescription, setFeeDescription] = useState("");
  const [feeSuccessMsg, setFeeSuccessMsg] = useState("");
  const [isSubmittingFee, setIsSubmittingFee] = useState(false);

  // Attendance Filters & Search
  const [attSearch, setAttSearch] = useState("");
  const [attShiftFilter, setAttShiftFilter] = useState("all");
  const [attStatusFilter, setAttStatusFilter] = useState<"all" | "in_hall" | "checked_out">("all");

  // Registration Form State
  const [newStudentName, setNewStudentName] = useState("");
  const [newStudentEmail, setNewStudentEmail] = useState("");
  const [newStudentPhone, setNewStudentPhone] = useState("");
  const [newStudentShift, setNewStudentShift] = useState("Morning Shift");
  const [newStudentCourse, setNewStudentCourse] = useState("General Study");
  const [newStudentFee, setNewStudentFee] = useState(900);
  const [newStudentSeat, setNewStudentSeat] = useState("");
  const [isAddingStudent, setIsAddingStudent] = useState(false);
  const [regSuccessMsg, setRegSuccessMsg] = useState("");

  // Seats State
  const [selectedSeatNumber, setSelectedSeatNumber] = useState<number | null>(null);
  const [assignStudentId, setAssignStudentId] = useState("");
  const [isAssigningSeat, setIsAssigningSeat] = useState(false);

  // Exam Score Entry State
  const [markStudentId, setMarkStudentId] = useState("");
  const [markScore, setMarkScore] = useState<number>(0);
  const [markRemarks, setMarkRemarks] = useState("");
  const [isSubmittingMark, setIsSubmittingMark] = useState(false);

  // Live Chat State
  const [activeChatStudentId, setActiveChatStudentId] = useState("");
  const [chatReplyText, setChatReplyText] = useState("");
  const [isReplying, setIsReplying] = useState(false);
  const [mobileStaffChatView, setMobileStaffChatView] = useState<"list" | "chat">("chat");
  const [staffChatSearch, setStaffChatSearch] = useState("");
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Load Operational Data
  const loadData = async (activeStaffId?: string) => {
    try {
      const [studentsData, attList, allStaff, feeList, msgList] = await Promise.all([
        getStudents(),
        getAttendance(),
        getStaffMembers(),
        getFees(),
        getMessages(),
      ]);

      let libraryExams = getLibraryExams();
      let allStudentMarks = getAllExamMarks();

      try {
        const synced = await syncExamsAndMarksFromSupabase();
        if (synced?.exams?.length) libraryExams = synced.exams;
        if (synced?.marks?.length) allStudentMarks = synced.marks;
      } catch {}

      setRawStudents(studentsData || []);
      setStaffList(allStaff || []);
      setExams(libraryExams);
      setExamMarks(allStudentMarks);
      if (libraryExams.length > 0 && !selectedExamId) {
        setSelectedExamId(libraryExams[0].id);
      }
      setFees(feeList || []);
      setMessages(msgList || []);

      if (allStaff && allStaff.length > 0) {
        const targetId = activeStaffId || currentStaff.id;
        if (targetId) {
          const match = allStaff.find(
            (s) => s.id === targetId || s.email.toLowerCase() === targetId.toLowerCase()
          );
          if (match) setCurrentStaff(match);
        }
      }

      const todayStr = new Date().toISOString().split("T")[0];
      const todayAtt = (attList || []).filter((a) => !a.date || a.date === todayStr);

      const activeStudentCheckInMap = new Map<string, string>();
      todayAtt.forEach((a) => {
        if (!a.checkOut || a.checkOut === "In Progress" || a.checkOut === "—") {
          activeStudentCheckInMap.set(a.studentId, a.checkIn || "Active");
          if (a.studentName) {
            activeStudentCheckInMap.set(a.studentName.toLowerCase(), a.checkIn || "Active");
          }
        }
      });

      const mapped: StaffStudent[] = (studentsData || []).map((s, idx) => {
        const rawSeat = s.seatNumber || (s as any).seat_number || null;
        const deskNum = parseDeskNum(rawSeat);
        const isCheckedIn = activeStudentCheckInMap.has(s.id) || (s.fullName && activeStudentCheckInMap.has(s.fullName.toLowerCase()));
        const checkInTime = isCheckedIn ? (activeStudentCheckInMap.get(s.id) || activeStudentCheckInMap.get(s.fullName.toLowerCase())) : undefined;

        const code = s.studentCode || (s.id ? `SDL-${String(s.id).slice(-4).toUpperCase()}` : `SDL-${String(idx + 1).padStart(3, "0")}`);
        const plan = s.membershipPlan || (s as any).membership_plan || "General";
        const isReserved = plan === "Reserved Seat" || (s as any).is_reserved === true || String(plan).toLowerCase().includes("reserved");

        return {
          id: s.id,
          name: s.fullName,
          studentCode: code,
          rollNo: code,
          seatNo: deskNum,
          seatCode: rawSeat ? (rawSeat.startsWith("#") ? rawSeat : `#${rawSeat}`) : "—",
          rawSeat: rawSeat || undefined,
          zone: deskNum ? (deskNum <= 12 ? "Silent Zone" : deskNum <= 24 ? "AC Premium" : "General Hall") : "Unassigned",
          monthlyFee: s.dueAmount || 900,
          feeStatus: s.feeStatus?.toLowerCase() === "paid" ? "paid" : "due",
          shift: s.shift || "Morning Shift",
          checkedInNow: Boolean(isCheckedIn),
          phone: s.phone,
          email: s.email,
          status: isReserved ? "reserved" : (s.status || "active"),
          membershipPlan: plan,
          isReserved,
          checkInTime,
        };
      });

      setStudents(mapped);
      setAttendance(attList || []);

      if (mapped.length > 0 && !activeChatStudentId) {
        setActiveChatStudentId(mapped[0].id);
      }
    } catch (e) {
      console.error("Failed to load staff portal data", e);
    }
  };

  // Auth and role verification
  useEffect(() => {
    async function checkAuth() {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        let user = session?.user;

        if (!user) {
          const { data: { user: authUser }, error } = await supabase.auth.getUser();
          if (error || !authUser) {
            router.replace("/login?redirect=/staff");
            return;
          }
          user = authUser;
        }

        const isAdmin = isMasterAdminEmail(user.email) || user.user_metadata?.role === "admin";
        setCurrentUserIsAdmin(isAdmin);

        const userRole = user.user_metadata?.role;
        const isStaff = userRole === "staff" || isAdmin;

        if (isStaff) {
          saveUserRole(isAdmin ? "admin" : "staff");
          setIsCheckingAuth(false);
          loadData(user.id);
        }

        const [profileRes, staffRes] = await Promise.all([
          Promise.resolve(
            supabase
              .from("profiles")
              .select("role, full_name, email, phone, status")
              .eq("id", user.id)
              .maybeSingle()
          ).then((r) => r.data).catch(() => null),
          Promise.resolve(
            supabase
              .from("staff_profiles")
              .select("*")
              .eq("id", user.id)
              .maybeSingle()
          ).then((r) => r.data).catch(() => null),
        ]);

        const verifiedRole = profileRes?.role || userRole;
        if (verifiedRole !== "staff" && !isAdmin) {
          router.replace("/student");
          return;
        }

        if (staffRes) {
          setCurrentStaff({
            id: staffRes.id,
            name: staffRes.name || profileRes?.full_name || user.email || "Staff Member",
            email: staffRes.email || user.email || "",
            phone: staffRes.phone || profileRes?.phone || "",
            address: staffRes.address || "",
            aadharNumber: staffRes.aadhar_number || "",
            avatarUrl: staffRes.avatar_url || undefined,
            role: staffRes.role || "prime_staff",
            category: staffRes.category || "Prime Staff",
            shiftAssigned: staffRes.shift_assigned || "Morning Shift (06:00 AM - 02:00 PM)",
            status: staffRes.status || "active",
          });
        } else {
          const staffCategory = user.user_metadata?.staff_category || "Prime Staff";
          const staffRole = staffCategory === "Sub Staff" ? "sub_staff" : "prime_staff";
          setCurrentStaff({
            id: user.id,
            name: profileRes?.full_name || user.user_metadata?.full_name || "Staff Member",
            email: user.email || "",
            phone: profileRes?.phone || user.user_metadata?.phone || "",
            role: staffRole,
            category: staffCategory,
            shiftAssigned: "Morning Shift (06:00 AM - 02:00 PM)",
            status: "active",
          });
        }

        setIsCheckingAuth(false);
      } catch (err) {
        console.error("Staff auth check error:", err);
        router.replace("/login?redirect=/staff");
      }
    }
    checkAuth();
  }, [router]);

  // Polling for live messages, attendance, and profile update listener
  useEffect(() => {
    const interval = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const [msgs, att] = await Promise.all([getMessages(), getAttendance()]);
        if (msgs) setMessages(msgs);
        if (att) setAttendance(att);
      } catch {}
    }, 45000);

    const handleProfileUpdated = (event: any) => {
      const updated = event.detail;
      if (!updated?.id) return;
      setRawStudents((prev) =>
        prev.map((s) =>
          s.id === updated.id
            ? {
                ...s,
                phone: updated.phone || s.phone,
                fullName: updated.full_name || s.fullName,
                parentPhone: updated.parent_phone || s.parentPhone,
              }
            : s
        )
      );
    };
    if (typeof window !== "undefined") {
      window.addEventListener("student_profile_updated", handleProfileUpdated);
    }

    return () => {
      clearInterval(interval);
      if (typeof window !== "undefined") {
        window.removeEventListener("student_profile_updated", handleProfileUpdated);
      }
    };
  }, []);

  const handleSwitchStaff = (staff: StaffMember) => {
    setCurrentStaff(staff);
    if (typeof window !== "undefined") {
      localStorage.setItem("genius_staff_active_id", staff.id);
    }
    setIsStaffSwitcherOpen(false);
  };

  // -------------------------------------------------------------
  // Calculations: STRICT LIMITATION TO MONTHLY REVENUE
  // -------------------------------------------------------------
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonthNum = now.getMonth();
  const currentMonthName = now.toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  const monthlyFeeStats = useMemo(() => {
    let monthlyRevenue = 0;
    let monthlyCashRevenue = 0;
    let monthlyUpiRevenue = 0;
    let monthlyPaidCount = 0;

    (fees || []).forEach((f) => {
      if (!f.paid) return;
      const dateToCheck = f.paidAt ? new Date(f.paidAt) : f.createdAt ? new Date(f.createdAt) : null;
      if (dateToCheck && dateToCheck.getFullYear() === currentYear && dateToCheck.getMonth() === currentMonthNum) {
        const amt = Number(f.amount) || 0;
        monthlyRevenue += amt;
        monthlyPaidCount += 1;
        const desc = (f.description || "").toLowerCase();
        if (desc.includes("cash") || f.type?.toLowerCase().includes("cash")) {
          monthlyCashRevenue += amt;
        } else {
          monthlyUpiRevenue += amt;
        }
      }
    });

    return {
      monthlyRevenue,
      monthlyCashRevenue,
      monthlyUpiRevenue,
      monthlyPaidCount,
    };
  }, [fees, currentYear, currentMonthNum]);

  // Attendance metrics
  const todayIsoDate = now.toISOString().split("T")[0];
  const todayAttendanceList = useMemo(() => {
    return (attendance || []).filter((a) => !a.date || a.date === todayIsoDate);
  }, [attendance, todayIsoDate]);

  const currentlyInHallCount = useMemo(() => {
    return todayAttendanceList.filter(
      (a) => a.checkOut === "In Progress" || !a.checkOut || a.checkOut === "—"
    ).length;
  }, [todayAttendanceList]);

  // Seats calculations (100 Desks Matrix)
  const TOTAL_SEATS = 100;
  const occupiedSeatsCount = currentlyInHallCount;
  const reservedSeatsCount = useMemo(() => {
    return rawStudents.filter((s) => {
      const plan = s.membershipPlan || (s as any).membership_plan;
      const isRes = plan === "Reserved Seat" || (s as any).is_reserved === true || String(plan || "").toLowerCase().includes("reserved");
      return isRes && (s.status === "active" || !s.status);
    }).length;
  }, [rawStudents]);
  const availableSeatsCount = Math.max(0, TOTAL_SEATS - (occupiedSeatsCount + reservedSeatsCount));

  // Hourly Occupancy SVG Trend
  const timeLabels = ["6 AM", "8 AM", "10 AM", "12 PM", "2 PM", "4 PM", "6 PM", "8 PM", "10 PM"];
  const hourlyOccupancy = useMemo(() => {
    const hours = [6, 8, 10, 12, 14, 16, 18, 20, 22];
    return hours.map((hour, index) => {
      const x = (index / (hours.length - 1)) * 100;
      let count = 0;
      if (todayAttendanceList && todayAttendanceList.length > 0) {
        todayAttendanceList.forEach((att) => {
          let checkInHour = 6;
          if (att.checkIn) {
            const timeParts = att.checkIn.split(":");
            if (timeParts.length >= 2) {
              let h = parseInt(timeParts[0], 10);
              const isPM = att.checkIn.toLowerCase().includes("pm");
              const isAM = att.checkIn.toLowerCase().includes("am");
              if (isPM && h < 12) h += 12;
              if (isAM && h === 12) h = 0;
              checkInHour = isNaN(h) ? 6 : h;
            }
          }
          let checkOutHour = 22;
          if (att.checkOut && att.checkOut !== "In Progress" && att.checkOut !== "—") {
            const timeParts = att.checkOut.split(":");
            if (timeParts.length >= 2) {
              let h = parseInt(timeParts[0], 10);
              const isPM = att.checkOut.toLowerCase().includes("pm");
              const isAM = att.checkOut.toLowerCase().includes("am");
              if (isPM && h < 12) h += 12;
              if (isAM && h === 12) h = 0;
              checkOutHour = isNaN(h) ? 22 : h;
            }
          }
          if (checkInHour <= hour && checkOutHour >= hour) {
            count++;
          }
        });
      } else if (currentlyInHallCount > 0) {
        count = Math.min(currentlyInHallCount, TOTAL_SEATS);
      }
      const percent = Math.min(100, Math.round((count / TOTAL_SEATS) * 100));
      const y = Math.max(5, 100 - percent);
      return { hour, label: timeLabels[index], percent, x, y };
    });
  }, [todayAttendanceList, currentlyInHallCount]);

  // Shifts breakdown
  const shiftOverview = useMemo(() => {
    const presentIds = new Set(todayAttendanceList.map((a) => a.studentId));
    const presentNames = new Set(todayAttendanceList.map((a) => (a.studentName || "").toLowerCase()));
    const isStudentPresent = (s: StaffStudent) => presentIds.has(s.id) || presentNames.has(s.name.toLowerCase());

    const morningStds = students.filter((s) => s.shift.toLowerCase().includes("morning") || s.shift.toLowerCase().includes("6-12"));
    const afternoonStds = students.filter((s) => s.shift.toLowerCase().includes("afternoon") || s.shift.toLowerCase().includes("12-6"));
    const eveningStds = students.filter((s) => s.shift.toLowerCase().includes("evening") || s.shift.toLowerCase().includes("6-10"));
    const fullDayStds = students.filter((s) => s.shift.toLowerCase().includes("full"));

    return [
      { name: "Morning Shift", time: "06:00 AM - 12:00 PM", enrolled: morningStds.length, present: morningStds.filter(isStudentPresent).length },
      { name: "Afternoon Shift", time: "12:00 PM - 06:00 PM", enrolled: afternoonStds.length, present: afternoonStds.filter(isStudentPresent).length },
      { name: "Evening Shift", time: "06:00 PM - 10:00 PM", enrolled: eveningStds.length, present: eveningStds.filter(isStudentPresent).length },
      { name: "Full Day Access", time: "06:00 AM - 10:00 PM", enrolled: fullDayStds.length, present: fullDayStds.filter(isStudentPresent).length },
    ];
  }, [students, todayAttendanceList]);

  // Pending students count
  const pendingStudents = rawStudents.filter((s) => s.status?.toLowerCase() === "pending");

  // Dues list
  const dueStudentsList = useMemo(() => {
    return students.filter((s) => s.feeStatus === "due" || s.monthlyFee > 0);
  }, [students]);

  // -------------------------------------------------------------
  // Quick Turnstile Scanner Action (Check In / Check Out)
  // -------------------------------------------------------------
  const handleQuickScan = async (rollOrName: string) => {
    if (!rollOrName.trim()) return;
    const query = rollOrName.trim().toLowerCase();
    const student = students.find(
      (s) =>
        s.rollNo.toLowerCase() === query ||
        s.name.toLowerCase().includes(query) ||
        String(s.seatNo) === query ||
        s.seatCode.toLowerCase().includes(query)
    );

    if (!student) {
      setScanResult({
        status: "error",
        message: `No active member found matching "${rollOrName}". Please verify Roll No or register member.`,
      });
      return;
    }

    if (student.feeStatus === "due") {
      setScanResult({
        status: "warning",
        message: `⚠️ FEE DUE ALERT: ${student.name} (${student.rollNo}) has pending monthly dues of ₹${student.monthlyFee}.`,
        student,
      });
      return;
    }

    const isCheckingIn = !student.checkedInNow;
    try {
      if (isCheckingIn) {
        await recordCheckIn({
          studentId: student.id,
          studentName: student.name,
          seatNumber: student.seatCode.replace("#", ""),
          shiftName: student.shift,
        });
      } else {
        await recordCheckOut(student.id);
      }
      await loadData();
    } catch (e) {
      console.error("Gate check toggle error:", e);
    }

    setScanResult({
      status: "success",
      message: isCheckingIn
        ? `✓ Gate Access Granted! ${student.name} checked into ${student.seatCode} (${student.zone}).`
        : `✓ Gate Check-Out recorded for ${student.name}. Desk ${student.seatCode} vacated.`,
      student,
    });
    setScanInput("");
  };

  // Direct manual 1-click check in/out
  const handleManualToggleAttendance = async (student: StaffStudent) => {
    try {
      if (student.checkedInNow) {
        await recordCheckOut(student.id);
      } else {
        await recordCheckIn({
          studentId: student.id,
          studentName: student.name,
          seatNumber: student.seatCode.replace("#", ""),
          shiftName: student.shift,
        });
      }
      await loadData();
    } catch (err: any) {
      alert("Attendance error: " + err.message);
    }
  };

  // -------------------------------------------------------------
  // Fee Collection Handler (Monthly Fee Only)
  // -------------------------------------------------------------
  const handleCollectFee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feeStudentRoll) return;

    const student = students.find((s) => s.rollNo === feeStudentRoll || s.id === feeStudentRoll);
    if (!student) return;

    setIsSubmittingFee(true);
    try {
      const recNumber = `REC-M-${Date.now().toString().slice(-6)}`;
      await createFee({
        studentId: student.id,
        studentName: student.name,
        amount: feeAmount,
        type: `Monthly Fee (${currentMonthName})`,
        paid: true,
        description: feeDescription || `Monthly desk fee collected via ${feeMode} at Front Desk`,
        receiptNo: recNumber,
      });

      // Update Supabase profile fee status to Paid
      const supabase = createClient();
      await supabase
        .from("profiles")
        .update({
          fee_status: "Paid",
          due_amount: 0,
          updated_at: new Date().toISOString(),
        })
        .eq("id", student.id);

      // Auto-clear any pending UPI payment claims for this student
      try {
        await clearStudentUpiClaims(student.id);
        await clearStudentUpiClaims(student.name);
        if (student.rollNo) await clearStudentUpiClaims(student.rollNo);
      } catch (claimErr) {
        console.warn("Auto-clear claims notice:", claimErr);
      }

      setFeeSuccessMsg(`✓ Monthly Receipt #${recNumber} Generated! Collected ₹${feeAmount} via ${feeMode} for ${student.name}.`);
      setFeeStudentRoll("");
      setFeeDescription("");
      setIsFeeModalOpen(false);
      await loadData();
      setTimeout(() => setFeeSuccessMsg(""), 6000);
    } catch (err: any) {
      alert("Error collecting fee: " + err.message);
    } finally {
      setIsSubmittingFee(false);
    }
  };

  // -------------------------------------------------------------
  // Student Registration & Approval Handlers
  // -------------------------------------------------------------
  const handleCreateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudentName.trim() || !newStudentEmail.trim()) {
      alert("Please enter full name and email.");
      return;
    }

    setIsAddingStudent(true);
    try {
      const supabase = createClient();
      const stdId = `std-${Date.now()}`;
      const code = `SDL-${Date.now().toString().slice(-4)}`;

      await supabase.from("profiles").upsert({
        id: stdId,
        full_name: newStudentName.trim(),
        email: newStudentEmail.trim().toLowerCase(),
        phone: newStudentPhone.trim() || "+91 98765 00000",
        course: newStudentCourse,
        shift: newStudentShift,
        seat_number: newStudentSeat ? `S-${newStudentSeat.replace(/^S-/, "")}` : null,
        due_amount: newStudentFee,
        fee_status: "Paid",
        status: "active",
        role: "student",
        student_code: code,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // Record initial joining fee receipt
      await createFee({
        studentId: stdId,
        studentName: newStudentName.trim(),
        amount: newStudentFee,
        type: `Joining & Monthly Fee (${currentMonthName})`,
        paid: true,
        description: `Walk-in registration at front desk via Cash/Counter`,
        receiptNo: `REC-REG-${Date.now().toString().slice(-5)}`,
      });

      setRegSuccessMsg(`✓ Member "${newStudentName}" successfully registered and activated!`);
      setNewStudentName("");
      setNewStudentEmail("");
      setNewStudentPhone("");
      setNewStudentSeat("");
      await loadData();
      setTimeout(() => setRegSuccessMsg(""), 6000);
    } catch (err: any) {
      alert("Error creating student: " + err.message);
    } finally {
      setIsAddingStudent(false);
    }
  };

  const handleApproveStudent = async (studentId: string, name: string) => {
    try {
      await updateStudentStatus(studentId, "active");
      alert(`✓ Student registration for "${name}" approved successfully!`);
      await loadData();
    } catch (err: any) {
      alert("Error approving student: " + err.message);
    }
  };

  // -------------------------------------------------------------
  // Desk Assignment Handler
  // -------------------------------------------------------------
  const handleAssignDesk = async () => {
    if (!selectedSeatNumber || !assignStudentId) return;
    setIsAssigningSeat(true);
    try {
      const supabase = createClient();
      const seatStr = `S-${String(selectedSeatNumber).padStart(2, "0")}`;
      await supabase
        .from("profiles")
        .update({
          seat_number: seatStr,
          updated_at: new Date().toISOString(),
        })
        .eq("id", assignStudentId);

      alert(`✓ Desk #${selectedSeatNumber} assigned successfully!`);
      setAssignStudentId("");
      await loadData();
    } catch (err: any) {
      alert("Error assigning desk: " + err.message);
    } finally {
      setIsAssigningSeat(false);
    }
  };

  const handleVacateDesk = async (studentId: string, deskNum: number) => {
    if (!confirm(`Are you sure you want to vacate Desk #${deskNum}?`)) return;
    try {
      const supabase = createClient();
      await supabase
        .from("profiles")
        .update({
          seat_number: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", studentId);

      alert(`✓ Desk #${deskNum} has been vacated.`);
      await loadData();
    } catch (err: any) {
      alert("Error vacating desk: " + err.message);
    }
  };

  // -------------------------------------------------------------
  // Exam Marks Entry Handler
  // -------------------------------------------------------------
  const handleSaveExamScore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedExamId || !markStudentId) return;

    const exam = exams.find((ex) => ex.id === selectedExamId);
    const student = students.find((s) => s.id === markStudentId);
    if (!exam || !student) return;

    setIsSubmittingMark(true);
    try {
      const totalMarks = exam.totalMarks || 100;
      const percentage = Math.round((markScore / totalMarks) * 100);
      const isPassed = markScore >= (exam.passingMarks || 40);

      const markRecord: StudentExamMark = {
        id: `mark-${exam.id}-${student.id}`,
        examId: exam.id,
        examTitle: exam.title,
        studentId: student.id,
        studentName: student.name,
        studentCode: student.studentCode,
        studentEmail: student.email || "",
        seatNumber: student.seatCode.replace("#", ""),
        marksObtained: markScore,
        totalMarks,
        percentage,
        status: isPassed ? "Pass" : "Fail",
        remarks: markRemarks || (isPassed ? "Cleared test successfully" : "Needs revision"),
        submittedAt: new Date().toISOString(),
      };

      saveStudentMark(markRecord);
      alert(`✓ Score recorded for ${student.name}: ${markScore}/${totalMarks} (${isPassed ? "Pass" : "Fail"})!`);
      setMarkScore(0);
      setMarkRemarks("");
      setMarkStudentId("");
      await loadData();
    } catch (err: any) {
      alert("Error saving exam score: " + err.message);
    } finally {
      setIsSubmittingMark(false);
    }
  };

  // -------------------------------------------------------------
  // Live Chat Reply Handler
  // -------------------------------------------------------------
  const handleSendChatReply = async () => {
    if (!activeChatStudentId || !chatReplyText.trim() || isReplying) return;

    const targetStudent = students.find((s) => s.id === activeChatStudentId);
    const text = chatReplyText.trim();
    setIsReplying(true);

    try {
      await sendMessage({
        studentId: activeChatStudentId,
        studentName: targetStudent?.name || "Student",
        studentEmail: targetStudent?.email || "",
        senderRole: "staff",
        senderName: `${currentStaff.name} (${currentStaff.category})`,
        message: text,
      });

      setChatReplyText("");
      const refreshed = await getMessages();
      if (refreshed) setMessages(refreshed);
      setTimeout(() => chatScrollRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (err: any) {
      alert("Error sending message: " + err.message);
    } finally {
      setIsReplying(false);
    }
  };

  const handleLogout = async () => {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch (e) {
      console.warn("Sign out notice:", e);
    }
    router.replace("/login");
  };

  // Selected chat details
  const activeStudentChatMsgs = messages.filter((m) => m.studentId === activeChatStudentId);
  const selectedChatStudent = students.find((s) => s.id === activeChatStudentId);

  if (isCheckingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#141A24]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#FFC107] border-t-transparent" />
          <p className="text-xs font-bold tracking-wider text-[#FFC107]">Verifying Staff Terminal Authentication...</p>
        </div>
      </div>
    );
  }

  const unreadMessagesCount = messages.filter((m) => m.senderRole === "student" && !m.isRead).length;

  const STAFF_SIDEBAR_SECTIONS = [
    {
      group: "",
      items: [
        { id: "dashboard", label: "Dashboard", icon: LayoutGrid },
      ]
    },
    {
      group: "FRONT DESK & OPS",
      items: [
        { id: "attendance", label: "Attendance & Scanner", icon: QrCode },
        { id: "students", label: "Students Register", icon: UserPlus, badge: pendingStudents.length },
        { id: "fees", label: "Monthly Fees", icon: IndianRupee },
        { id: "seats", label: "Seats & Desks (01-100)", icon: Armchair },
      ]
    },
    {
      group: "ACADEMICS & COMMS",
      items: [
        { id: "results", label: "Exam Results", icon: Award },
        { id: "messages", label: "Messages & Inquiries", icon: MessageSquare, badge: unreadMessagesCount },
      ]
    }
  ];

  const STAFF_MOBILE_BOTTOM_NAV = [
    { id: "dashboard", label: "Dashboard", icon: LayoutGrid },
    { id: "attendance", label: "Attendance", icon: QrCode },
    { id: "students", label: "Students", icon: UserPlus },
    { id: "fees", label: "Fees", icon: IndianRupee },
    { id: "seats", label: "Seats", icon: Armchair },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-[#F3F4F6] dark:bg-[#141A24]">
      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 z-50 bg-[#0A2E5C]/80 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* ========================================================================= */}
      {/* 1. SIDEBAR (MATCHING ADMIN PANEL SIDEBAR WITH BRAND COLORS) */}
      {/* ========================================================================= */}
      <aside className={`
        fixed inset-y-0 left-0 z-[60] flex w-64 flex-col bg-[#0A2E5C] text-white transition-transform duration-300 ease-in-out lg:static lg:translate-x-0 border-r border-zinc-800/80 shadow-2xl lg:shadow-none
        ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Brand Logo Header */}
        <div className="flex h-20 items-center px-6 border-b border-zinc-800/60 justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-linear-to-tr from-[#0B5ED7] to-[#FFC107] text-[#0A2E5C] shadow-lg shadow-[#0B5ED7]/20 font-black">
              <Sparkles className="h-6 w-6 text-[#0A2E5C]" />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight text-white leading-none">{BRAND_CONFIG.name.replace(/^The /, "")}</h2>
              <p className="text-[11px] font-semibold text-[#FFC107] mt-1 leading-none">Staff Desk Portal</p>
            </div>
          </div>

          <button 
            className="text-zinc-400 hover:text-white lg:hidden cursor-pointer"
            onClick={() => setMobileMenuOpen(false)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Sidebar Nav Items */}
        <div className="flex-1 overflow-y-auto px-4 py-5 scrollbar-none space-y-6">
          {STAFF_SIDEBAR_SECTIONS.map((section, idx) => (
            <div key={idx}>
              {section.group && (
                <p className="px-3 text-[10px] font-black uppercase tracking-wider text-[#0B5ED7] mb-2">
                  {section.group}
                </p>
              )}
              <nav className="space-y-1">
                {section.items.map((item) => {
                  const active = activeTab === item.id;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setActiveTab(item.id as StaffTab);
                        setMobileMenuOpen(false);
                      }}
                      className={`
                        w-full flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-semibold transition-all cursor-pointer
                        ${active 
                          ? 'bg-[#0B5ED7]/20 text-[#FFC107] shadow-xs' 
                          : 'text-zinc-400 hover:bg-white/5 hover:text-white'}
                      `}
                    >
                      <div className="flex items-center gap-3.5">
                        <Icon className={`h-5 w-5 ${active ? 'text-[#FFC107]' : 'text-zinc-400'}`} />
                        <span>{item.label}</span>
                      </div>
                      {Boolean(item.badge && item.badge > 0) && (
                        <span className="px-1.5 py-0.5 rounded-full bg-rose-500 text-white text-[9px] font-black">
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>
          ))}
        </div>

        {/* Bottom Profile Card & Logout matching Admin Sidebar */}
        <div className="border-t border-zinc-800/80 p-4 space-y-3 bg-[#111620]">
          <div className="relative">
            <div className="flex items-center gap-3 rounded-2xl bg-[#0A2E5C] p-3 border border-zinc-800">
              <div 
                className="h-10 w-10 shrink-0 rounded-full bg-linear-to-br from-[#FFC107] to-[#0B5ED7] text-[#0A2E5C] flex items-center justify-center font-black text-xs shadow-xs border border-[#FFC107]/60 select-none"
              >
                {currentStaff.name.slice(0, 2).toUpperCase() || "ST"}
              </div>
              <div className="flex-1 overflow-hidden">
                <div className="flex items-center justify-between">
                  <p className="truncate text-xs font-black text-white">{currentStaff.name}</p>
                  {currentUserIsAdmin && (
                    <button 
                      onClick={() => setIsStaffSwitcherOpen(!isStaffSwitcherOpen)}
                      className="text-[10px] text-[#FFC107] hover:underline cursor-pointer"
                    >
                      Switch
                    </button>
                  )}
                </div>
                <p className="truncate text-[10px] font-medium text-zinc-400">{currentStaff.shiftAssigned || currentStaff.category}</p>
              </div>
            </div>

            {/* Switch Staff Dropdown */}
            {currentUserIsAdmin && isStaffSwitcherOpen && (
              <div className="absolute bottom-full mb-2 left-0 right-0 rounded-2xl bg-white dark:bg-[#0A2E5C] border border-[#E5E7EB] dark:border-zinc-700 shadow-2xl p-2 z-50 text-zinc-900 dark:text-white animate-in fade-in">
                <div className="p-2 border-b border-zinc-100 dark:border-zinc-800 text-[10px] uppercase font-bold text-zinc-400">
                  Switch Active Staff Terminal Profile
                </div>
                <div className="py-1 space-y-1 max-h-48 overflow-y-auto">
                  {staffList.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        handleSwitchStaff(s);
                        setIsStaffSwitcherOpen(false);
                      }}
                      className={`w-full text-left p-2.5 rounded-xl text-xs flex items-center justify-between transition cursor-pointer ${
                        s.id === currentStaff.id
                          ? "bg-[#0A2E5C] text-[#FFC107] dark:bg-zinc-800"
                          : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
                      }`}
                    >
                      <div>
                        <p className="font-bold">{s.name}</p>
                        <p className="text-[10px] text-zinc-400">{s.shiftAssigned}</p>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-amber-100 text-amber-900">
                        {s.role === "prime_staff" ? "PRIME" : "SUB"}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button 
            onClick={handleLogout}
            className="flex w-full items-center gap-3 px-3 py-2 text-xs font-bold text-zinc-400 hover:text-rose-400 hover:bg-white/5 rounded-xl transition cursor-pointer"
          >
            <LogOut className="h-4 w-4" />
            <span>Logout Terminal</span>
          </button>
        </div>
      </aside>

      {/* ========================================================================= */}
      {/* 2. MAIN VIEWPORT & NAVBAR (MATCHING ADMIN PANEL TOPBAR) */}
      {/* ========================================================================= */}
      <div className="flex flex-1 flex-col overflow-hidden">
        
        {/* Top Header Navbar */}
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-zinc-200/80 bg-white px-3 sm:px-6 dark:border-zinc-800 dark:bg-[#0A2E5C] relative z-30 shadow-xs">
          
          {/* Left Side: Mobile Hamburger + Current Title */}
          <div className="flex items-center gap-2.5 sm:gap-3 flex-1 min-w-0">
            {/* Mobile Hamburger Menu Button */}
            <button 
              className="lg:hidden flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 text-[#0A2E5C] dark:text-[#FFC107] border border-zinc-200/80 dark:border-zinc-700/60 transition cursor-pointer shrink-0 shadow-xs active:scale-95"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open Navigation Sidebar Menu"
              title="Open Navigation Menu"
            >
              <Menu className="h-5 w-5 stroke-[2.2]" />
            </button>

            {/* Title & Subtitle */}
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base font-black text-[#0A2E5C] dark:text-white capitalize truncate leading-tight">
                {activeTab === "dashboard" && "Staff Operations Dashboard"}
                {activeTab === "attendance" && "Attendance & QR Scanner"}
                {activeTab === "students" && "Student Admission & Records"}
                {activeTab === "fees" && `Monthly Fees Revenue (${currentMonthName})`}
                {activeTab === "seats" && "Desk Matrix & Floor Layout (01 to 100)"}
                {activeTab === "results" && "Exam Scorecards & Mock Tests"}
                {activeTab === "messages" && "Student Help Desk Messages"}
              </h1>
              <p className="text-[10px] sm:text-xs text-zinc-400 hidden sm:block">
                Front Desk Terminal • {currentDateStr} • {currentTimeStr}
              </p>
            </div>
          </div>

          {/* Right Side: Quick Action Buttons */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Desktop & Mobile QR Scanner Modal Button */}
            <button
              onClick={() => setIsQrScannerOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-2xl border border-[#FFC107]/50 bg-linear-to-r from-[#0A2E5C] to-[#2B3548] text-[#FFC107] hover:text-white hover:border-[#FFC107] transition-all shadow-sm group cursor-pointer"
              title="Open QR Scanner / Display Pass & Codes"
              aria-label="Open QR Scanner"
            >
              <div className="relative flex items-center justify-center">
                <QrCode className="h-4 w-4 text-[#FFC107] group-hover:scale-110 transition-transform" />
                <span className="absolute -top-1 -right-1 flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#FFC107] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#0B5ED7]"></span>
                </span>
              </div>
              <span className="text-xs font-bold tracking-tight hidden sm:inline">Scanner & QR</span>
            </button>

            {/* Quick Receive Fee Button */}
            <button
              onClick={() => setIsFeeModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 sm:py-2 text-xs font-bold text-white shadow-xs transition cursor-pointer"
              title="Collect Monthly Fee"
            >
              <IndianRupee className="h-3.5 w-3.5" />
              <span className="hidden md:inline">Receive Fee</span>
            </button>

            {currentUserIsAdmin && (
              <Link
                href="/admin"
                className="hidden lg:inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-white/5 px-2.5 py-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/10 transition"
              >
                Admin Suite
              </Link>
            )}
          </div>
        </header>

        {/* Scrollable Main Content Area */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6 pb-20 lg:pb-8">

        {/* Global Success / Alert Feedback */}
        {feeSuccessMsg && (
          <div className="rounded-2xl border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 p-4 text-xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <span>{feeSuccessMsg}</span>
            </div>
            <button onClick={() => setFeeSuccessMsg("")} className="text-zinc-400 hover:text-zinc-600 cursor-pointer">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {regSuccessMsg && (
          <div className="rounded-2xl border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 p-4 text-xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <span>{regSuccessMsg}</span>
            </div>
            <button onClick={() => setRegSuccessMsg("")} className="text-zinc-400 hover:text-zinc-600 cursor-pointer">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 1: DASHBOARD HOME (MIRRORS ADMIN DASHBOARD OVERVIEW)   */}
        {/* ========================================================= */}
        {activeTab === "dashboard" && (
          <div className="space-y-6">

            {/* Dashboard Sub-Header / Operational Banner */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-3xl bg-white dark:bg-[#0A2E5C] border border-[#E5E7EB] dark:border-zinc-800 shadow-xs">
              <div>
                <h2 className="text-base sm:text-lg font-black text-[#0A2E5C] dark:text-white flex items-center gap-2">
                  <span>Front Desk Operational Dashboard</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                    Live Shift Terminal
                  </span>
                </h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Madhupur Branch • Desk Shift: {currentStaff.shiftAssigned}
                </p>
              </div>

              {/* Monthly Revenue Notice Badge */}
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800/60 text-[11px] font-bold text-amber-900 dark:text-amber-300">
                <ShieldCheck className="h-4 w-4 text-amber-700 dark:text-amber-400" />
                <span>Scope: Monthly Collections Only (No Annual Ledger)</span>
              </div>
            </div>

            {/* 6 Key Performance Metrics Cards (Mirroring Admin Cards) */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">

              {/* 1. Total Registered Students */}
              <div
                onClick={() => setActiveTab("students")}
                className="group rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-xs transition-all hover:scale-[1.02] hover:border-[#0B5ED7] hover:shadow-md dark:border-zinc-800 dark:bg-[#0A2E5C] flex flex-col justify-between cursor-pointer min-h-[160px]"
              >
                <div className="flex items-start justify-between">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                    <Users className="h-4 w-4" />
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 text-zinc-400 group-hover:text-[#0B5ED7] group-hover:translate-x-0.5 transition-transform" />
                </div>
                <div className="mt-3">
                  <p className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">Total Students</p>
                  <p className="text-2xl font-black text-[#0A2E5C] dark:text-white mt-0.5">{students.length}</p>
                  <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5 truncate">Registered members</p>
                </div>
                <div className="mt-3 pt-2 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between">
                  <span className="text-[9px] font-bold text-indigo-600 dark:text-indigo-400 group-hover:underline">Register Student</span>
                  <ChevronRight className="h-3 w-3 text-indigo-400" />
                </div>
              </div>

              {/* 2. Pending Approvals */}
              <div
                onClick={() => setActiveTab("students")}
                className="group rounded-2xl border border-amber-200/80 bg-amber-50/20 p-4 shadow-xs transition-all hover:scale-[1.02] hover:border-amber-400 hover:shadow-md dark:border-amber-900/40 dark:bg-amber-950/10 flex flex-col justify-between cursor-pointer min-h-[160px]"
              >
                <div className="flex items-start justify-between">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300 group-hover:bg-amber-600 group-hover:text-white transition-colors">
                    <UserPlus className="h-4 w-4" />
                  </div>
                  <span className="text-[9px] font-bold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/50 px-1.5 py-0.5 rounded-md">
                    Action
                  </span>
                </div>
                <div className="mt-3">
                  <p className="text-[11px] font-semibold text-amber-900 dark:text-amber-300/90">Pending Approvals</p>
                  <p className="text-2xl font-black text-amber-900 dark:text-amber-200 mt-0.5">{pendingStudents.length}</p>
                  <p className="text-[10px] text-amber-700/80 dark:text-amber-400/80 mt-0.5 truncate">Awaiting review</p>
                </div>
                <div className="mt-3 pt-2 border-t border-amber-200/40 dark:border-amber-900/40 flex items-center justify-between">
                  <span className="text-[9px] font-bold text-amber-700 dark:text-amber-400 group-hover:underline">Verify Students</span>
                  <ChevronRight className="h-3 w-3 text-amber-600" />
                </div>
              </div>

              {/* 3. Monthly Fee Revenue (Strictly limited to current month!) */}
              <div
                onClick={() => setActiveTab("fees")}
                className="group rounded-2xl border border-emerald-200/80 bg-emerald-50/20 p-4 shadow-xs transition-all hover:scale-[1.02] hover:border-emerald-400 hover:shadow-md dark:border-emerald-900/40 dark:bg-emerald-950/10 flex flex-col justify-between cursor-pointer min-h-[160px]"
              >
                <div className="flex items-start justify-between">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                    <Wallet className="h-4 w-4" />
                  </div>
                  <span className="text-[9px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/50 px-1.5 py-0.5 rounded-md">
                    Monthly
                  </span>
                </div>
                <div className="mt-3">
                  <p className="text-[11px] font-semibold text-emerald-900 dark:text-emerald-300/90">Monthly Revenue</p>
                  <p className="text-2xl font-black text-emerald-900 dark:text-emerald-200 mt-0.5">
                    ₹{monthlyFeeStats.monthlyRevenue.toLocaleString("en-IN")}
                  </p>
                  <p className="text-[10px] font-medium text-emerald-700/80 dark:text-emerald-400/80 mt-0.5 truncate">
                    {monthlyFeeStats.monthlyPaidCount} receipts ({currentMonthName})
                  </p>
                </div>
                <div className="mt-3 pt-2 border-t border-emerald-200/40 dark:border-emerald-900/40 flex items-center justify-between">
                  <span className="text-[9px] font-bold text-emerald-700 dark:text-emerald-400 group-hover:underline">Collect Fee</span>
                  <ChevronRight className="h-3 w-3 text-emerald-600" />
                </div>
              </div>

              {/* 4. Active In Hall (Live Attendance) */}
              <div
                onClick={() => setActiveTab("attendance")}
                className="group rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-xs transition-all hover:scale-[1.02] hover:border-emerald-500 hover:shadow-md dark:border-zinc-800 dark:bg-[#0A2E5C] flex flex-col justify-between cursor-pointer min-h-[160px]"
              >
                <div className="flex items-start justify-between">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                    <UserCheck className="h-4 w-4" />
                  </div>
                  <span className="text-[9px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded-md flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    Live
                  </span>
                </div>
                <div className="mt-3">
                  <p className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">Active In Hall</p>
                  <div className="flex items-baseline gap-1.5 mt-0.5">
                    <p className="text-2xl font-black text-emerald-700 dark:text-emerald-400">{currentlyInHallCount}</p>
                    <span className="text-[10px] font-bold text-zinc-400">/ {todayAttendanceList.length} today</span>
                  </div>
                  <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5 truncate">
                    Currently inside library
                  </p>
                </div>
                <div className="mt-3 pt-2 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between">
                  <span className="text-[9px] font-bold text-emerald-700 dark:text-emerald-400 group-hover:underline">Gate Scanner</span>
                  <ChevronRight className="h-3 w-3 text-emerald-600" />
                </div>
              </div>

              {/* 5. Available Desks (Seats Matrix) */}
              <div
                onClick={() => setActiveTab("seats")}
                className="group rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-xs transition-all hover:scale-[1.02] hover:border-[#0B5ED7] hover:shadow-md dark:border-zinc-800 dark:bg-[#0A2E5C] flex flex-col justify-between cursor-pointer min-h-[160px]"
              >
                <div className="flex items-start justify-between">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-950/50 dark:text-purple-400 group-hover:bg-purple-600 group-hover:text-white transition-colors">
                    <Armchair className="h-4 w-4" />
                  </div>
                  <span className="text-[9px] font-bold text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-900/50 px-1.5 py-0.5 rounded-md">
                    Seats
                  </span>
                </div>
                <div className="mt-3">
                  <p className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">Available Desks</p>
                  <p className="text-2xl font-black text-[#0A2E5C] dark:text-white mt-0.5">
                    {availableSeatsCount} <span className="text-sm font-semibold text-zinc-400">/ {TOTAL_SEATS}</span>
                  </p>
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5 truncate flex items-center gap-1.5 font-medium">
                    <span className="text-blue-600 dark:text-blue-400 font-bold">{occupiedSeatsCount} in hall</span>
                    <span>•</span>
                    <span className="text-rose-500 dark:text-rose-400 font-bold">{reservedSeatsCount} assigned</span>
                  </p>
                </div>
                <div className="mt-3 pt-2 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between">
                  <span className="text-[9px] font-bold text-purple-600 dark:text-purple-400 group-hover:underline">Desk Matrix</span>
                  <ChevronRight className="h-3 w-3 text-purple-400" />
                </div>
              </div>

              {/* 6. Mock Exams & Tests Desk */}
              <div
                onClick={() => setActiveTab("results")}
                className="group rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-xs transition-all hover:scale-[1.02] hover:border-[#0B5ED7] hover:shadow-md dark:border-zinc-800 dark:bg-[#0A2E5C] flex flex-col justify-between cursor-pointer min-h-[160px]"
              >
                <div className="flex items-start justify-between">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400 group-hover:bg-amber-600 group-hover:text-white transition-colors">
                    <Award className="h-4 w-4" />
                  </div>
                  <span className="text-[9px] font-bold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/50 px-1.5 py-0.5 rounded-md">
                    Tests
                  </span>
                </div>
                <div className="mt-3">
                  <p className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">Exam Results Desk</p>
                  <p className="text-2xl font-black text-[#0A2E5C] dark:text-white mt-0.5">
                    {exams.length} <span className="text-sm font-semibold text-zinc-400">Tests</span>
                  </p>
                  <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5 truncate">
                    {examMarks.length} scorecards entered
                  </p>
                </div>
                <div className="mt-3 pt-2 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between">
                  <span className="text-[9px] font-bold text-amber-600 dark:text-amber-400 group-hover:underline">Enter Scores</span>
                  <ChevronRight className="h-3 w-3 text-amber-400" />
                </div>
              </div>

            </div>

            {/* Charts & Shift Overview Row (Matching Admin Dashboard) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
              
              {/* Hourly Occupancy Trend SVG Graph */}
              <div className="lg:col-span-2 rounded-3xl border border-[#E5E7EB] bg-white p-4 sm:p-6 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C]">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg bg-blue-50 p-1.5 dark:bg-blue-500/10">
                      <Activity className="h-4 w-4 text-blue-500" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-[#0A2E5C] dark:text-white">Hourly Seat Occupancy Trend</h3>
                      <p className="text-[10px] text-zinc-400">Live Turnstile check-ins throughout today</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-600">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    Live Sync
                  </div>
                </div>

                <div className="relative h-40 sm:h-48 w-full border-b border-zinc-100 dark:border-zinc-800/50">
                  <div className="absolute left-0 top-0 h-full flex flex-col justify-between text-[8px] font-bold text-zinc-400 pb-6">
                    <span>100%</span><span>75%</span><span>50%</span><span>25%</span><span>0%</span>
                  </div>
                  <div className="absolute left-6 sm:left-8 right-0 h-full pb-6">
                    <svg className="h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
                      <defs>
                        <linearGradient id="staff-blue-grad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.35" />
                          <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.0" />
                        </linearGradient>
                      </defs>
                      <path
                        d={`M0,100 L${hourlyOccupancy.map((pt) => `${pt.x},${pt.y}`).join(" L")} L100,100 Z`}
                        fill="url(#staff-blue-grad)"
                      />
                      <path
                        d={`M${hourlyOccupancy.map((pt) => `${pt.x},${pt.y}`).join(" L")}`}
                        fill="none"
                        stroke="#3B82F6"
                        strokeWidth="2.5"
                        vectorEffect="non-scaling-stroke"
                      />
                      {hourlyOccupancy.map((pt, idx) => (
                        <circle key={idx} cx={pt.x} cy={pt.y} r="2.5" fill="#3B82F6" />
                      ))}
                    </svg>
                  </div>
                  <div className="absolute left-6 sm:left-8 right-0 bottom-0 flex justify-between text-[7px] sm:text-[8px] font-bold text-zinc-400 overflow-x-hidden">
                    {timeLabels.map((lbl, idx) => (
                      <span key={idx} className="truncate">{lbl}</span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Active Shifts Overview */}
              <div className="rounded-3xl border border-[#E5E7EB] bg-white p-4 sm:p-6 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C]">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-[#0A2E5C] dark:text-[#FFC107]" />
                    <h3 className="text-sm font-bold text-[#0A2E5C] dark:text-white">Active Shifts Overview</h3>
                  </div>
                  <span className="text-[10px] font-bold text-[#0B5ED7]">4 Shifts Active</span>
                </div>

                <div className="space-y-3 pt-1">
                  {shiftOverview.map((shift, i) => (
                    <div key={i} className="flex items-center justify-between p-2.5 rounded-xl bg-[#F8FAFC]/50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700">
                      <div>
                        <p className="text-xs font-bold text-[#0A2E5C] dark:text-white">{shift.name}</p>
                        <p className="text-[9px] text-zinc-400">{shift.time}</p>
                      </div>
                      <span className={`text-[10px] font-bold px-2.5 py-1 rounded-md transition ${
                        shift.enrolled > 0
                          ? "text-emerald-700 bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"
                          : "text-zinc-500 bg-zinc-100 dark:bg-zinc-800/80 dark:text-zinc-400"
                      }`}>
                        {shift.enrolled > 0 ? `${shift.present}/${shift.enrolled} Present` : "0 Students"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

            </div>

            {/* Quick Gate Scanner & Recent Turnstile Entry Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

              {/* Left: Quick Turnstile Scanner */}
              <div className="lg:col-span-5 rounded-3xl border border-[#E5E7EB] bg-white p-5 sm:p-6 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C] space-y-4">
                <div className="flex items-center gap-2.5">
                  <div className="rounded-xl bg-[#0A2E5C] p-2 text-[#FFC107]">
                    <QrCode className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-bold text-[#0A2E5C] dark:text-white">
                      Desk Turnstile Scanner
                    </h3>
                    <p className="text-xs text-zinc-500">Scan QR or enter Roll No to check-in/out</p>
                  </div>
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleQuickScan(scanInput);
                  }}
                  className="space-y-3"
                >
                  <div>
                    <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                      Student Roll / Member ID / Desk #
                    </label>
                    <input
                      type="text"
                      value={scanInput}
                      onChange={(e) => setScanInput(e.target.value)}
                      placeholder="e.g. SDL-2026-003 or Student Name"
                      className="mt-1 w-full rounded-xl border-2 border-[#FFC107] bg-[#E5E7EB]/15 p-2.5 text-xs font-bold text-[#0A2E5C] placeholder-zinc-400 focus:outline-none focus:ring-4 focus:ring-[#FFC107]/20 dark:bg-zinc-800 dark:text-white"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#0A2E5C] py-2.5 text-xs font-bold text-[#FFC107] border border-[#FFC107]/40 shadow-sm hover:bg-[#141A24] transition cursor-pointer"
                  >
                    <UserCheck className="h-4 w-4" /> Verify & Toggle Gate Access
                  </button>
                </form>

                {scanResult && (
                  <div
                    className={`rounded-2xl p-4 border text-xs ${
                      scanResult.status === "success"
                        ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
                        : scanResult.status === "warning"
                        ? "border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
                        : "border-rose-300 bg-rose-50 text-rose-900 dark:bg-rose-950/40 dark:text-rose-200"
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      {scanResult.status === "success" ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                      ) : (
                        <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
                      )}
                      <div>
                        <p className="font-bold">{scanResult.message}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Quick Desk Test Chips */}
                <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800">
                  <span className="text-[10px] font-bold uppercase text-[#0B5ED7]">Fast Test Shortcuts:</span>
                  <div className="grid grid-cols-2 gap-2 mt-1.5">
                    {students.slice(0, 4).map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => handleQuickScan(s.rollNo)}
                        className="rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] p-2 text-left text-xs hover:bg-[#E5E7EB]/30 dark:border-zinc-700 dark:bg-zinc-800 cursor-pointer"
                      >
                        <div className="font-bold text-[#0A2E5C] dark:text-white truncate">{s.name}</div>
                        <div className="text-[10px] text-[#0B5ED7]">{s.seatCode} • {s.rollNo}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right: Recent Live Turnstile Activity */}
              <div className="lg:col-span-7 rounded-3xl border border-[#E5E7EB] bg-white p-5 sm:p-6 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C]">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm sm:text-base font-bold text-[#0A2E5C] dark:text-white">
                    Today Gate Entry / Exit Activity
                  </h3>
                  <button
                    onClick={() => setActiveTab("attendance")}
                    className="text-xs font-bold text-[#0B5ED7] hover:underline"
                  >
                    Full Register →
                  </button>
                </div>

                <div className="divide-y divide-[#E5E7EB]/40 dark:divide-zinc-800 max-h-[360px] overflow-y-auto">
                  {todayAttendanceList.length === 0 ? (
                    <div className="py-12 text-center text-xs text-zinc-400">
                      No gate check-ins recorded yet today. Scan student roll number to check in.
                    </div>
                  ) : (
                    todayAttendanceList.slice(0, 8).map((att) => {
                      const isIn = !att.checkOut || att.checkOut === "In Progress" || att.checkOut === "—";
                      return (
                        <div key={att.id} className="flex items-center justify-between py-2.5">
                          <div className="flex items-center gap-3">
                            <div className={`flex h-8 w-8 items-center justify-center rounded-xl text-xs font-black ${
                              isIn ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                            }`}>
                              {att.seatNumber ? `#${att.seatNumber}` : "Desk"}
                            </div>
                            <div>
                              <p className="font-bold text-xs text-[#0A2E5C] dark:text-white">{att.studentName}</p>
                              <p className="text-[10px] text-zinc-400">{att.shiftName || "Shift"} • Desk #{att.seatNumber || "—"}</p>
                            </div>
                          </div>
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                            isIn ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                          }`}>
                            {att.checkIn} {att.checkOut && att.checkOut !== "In Progress" && att.checkOut !== "—" ? `→ ${att.checkOut}` : "(In Hall)"}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

            </div>

            {/* Due Fee Students Widget (Matching Admin Due Fee Section) */}
            <div className="rounded-3xl border border-[#E5E7EB] bg-white p-5 sm:p-6 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C] space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-zinc-100 dark:border-zinc-800">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
                    <Wallet className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-bold text-[#0A2E5C] dark:text-white">
                      Current Month Pending Fees
                    </h3>
                  </div>
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                    {dueStudentsList.length} Due
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setActiveTab("fees")}
                    className="text-xs font-bold text-[#0B5ED7] hover:underline"
                  >
                    Fee Desk & Receipts →
                  </button>
                </div>
              </div>

              <div className="max-h-[300px] overflow-y-auto rounded-2xl border border-zinc-100 dark:border-zinc-800">
                <table className="w-full text-left text-xs min-w-[600px]">
                  <thead className="sticky top-0 bg-[#FAF9F6] dark:bg-zinc-800/90 z-10 border-b border-zinc-200/70 dark:border-zinc-800 text-[10px] font-black uppercase tracking-wider text-zinc-500">
                    <tr>
                      <th className="py-2.5 px-3">Roll ID</th>
                      <th className="py-2.5 px-3">Student</th>
                      <th className="py-2.5 px-3">Desk / Shift</th>
                      <th className="py-2.5 px-3">Pending Amount</th>
                      <th className="py-2.5 px-3 text-center">Fast Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {dueStudentsList.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-zinc-400">
                          All student monthly fees are clear!
                        </td>
                      </tr>
                    ) : (
                      dueStudentsList.map((st) => (
                        <tr key={st.id} className="hover:bg-zinc-50/70 dark:hover:bg-zinc-800/40">
                          <td className="py-2.5 px-3 font-mono font-bold text-zinc-600 dark:text-zinc-300">
                            {st.studentCode}
                          </td>
                          <td className="py-2.5 px-3 font-bold text-[#0A2E5C] dark:text-white">
                            {st.name}
                          </td>
                          <td className="py-2.5 px-3 text-zinc-500">
                            {st.seatCode} • {st.shift}
                          </td>
                          <td className="py-2.5 px-3 font-black text-rose-600 dark:text-rose-400">
                            ₹{st.monthlyFee}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                onClick={() => {
                                  setFeeStudentRoll(st.rollNo);
                                  setFeeAmount(st.monthlyFee);
                                  setIsFeeModalOpen(true);
                                }}
                                className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold shadow-xs cursor-pointer"
                              >
                                Collect Fee
                              </button>
                              {st.phone && (
                                <a
                                  href={`https://wa.me/${st.phone.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(`Dear ${st.name}, this is a gentle reminder from Genius Library front desk regarding your pending monthly fee of ₹${st.monthlyFee}. Kindly pay at the counter or via UPI.`)}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="p-1 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
                                  title="WhatsApp Reminder"
                                >
                                  <WhatsAppIcon className="h-3.5 w-3.5" />
                                </a>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 2: ATTENDANCE & GATE SCANNER (SEE & MARK ATTENDANCE)   */}
        {/* ========================================================= */}
        {activeTab === "attendance" && (
          <div className="space-y-6">

            {/* Attendance Top Action Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-3xl bg-white dark:bg-[#0A2E5C] border border-[#E5E7EB] dark:border-zinc-800 shadow-xs">
              <div>
                <h3 className="text-base sm:text-lg font-black text-[#0A2E5C] dark:text-white flex items-center gap-2">
                  <QrCode className="h-5 w-5 text-[#FFC107]" />
                  <span>Gate Attendance Register &amp; Live Mark</span>
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  See student check-in/out records, scan QR, or manually mark attendance with 1 click.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-bold px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200">
                  {currentlyInHallCount} in hall right now
                </span>
              </div>
            </div>

            {/* Turnstile Scanner Component */}
            <div className="rounded-3xl border border-[#E5E7EB] bg-white p-5 sm:p-6 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C]">
              <div className="max-w-2xl mx-auto space-y-3">
                <div className="text-center">
                  <h4 className="text-sm font-black text-[#0A2E5C] dark:text-white">Quick Turnstile Desk Scanner</h4>
                  <p className="text-xs text-zinc-500">Scan card QR or type Roll No / Member ID / Desk Number</p>
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleQuickScan(scanInput);
                  }}
                  className="flex flex-col sm:flex-row gap-2"
                >
                  <input
                    type="text"
                    autoFocus
                    value={scanInput}
                    onChange={(e) => setScanInput(e.target.value)}
                    placeholder="Scan QR or enter Roll No (e.g. SDL-2026-001)..."
                    className="flex-1 rounded-xl border-2 border-[#FFC107] bg-[#E5E7EB]/15 p-3 text-xs font-bold text-[#0A2E5C] placeholder-zinc-400 focus:outline-none dark:bg-zinc-800 dark:text-white"
                  />
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      className="flex-1 sm:flex-none px-5 py-3 rounded-xl bg-[#0A2E5C] text-[#FFC107] text-xs font-bold border border-[#FFC107]/40 hover:bg-[#141A24] cursor-pointer shadow-sm flex items-center justify-center gap-1.5"
                    >
                      <UserCheck className="h-4 w-4" /> Verify
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsQrScannerOpen(true)}
                      className="px-4 py-3 rounded-xl bg-[#FFC107] text-[#0A2E5C] text-xs font-bold hover:bg-[#b09373] cursor-pointer shadow-sm flex items-center justify-center gap-1.5"
                      title="Open Live Camera Scanner"
                    >
                      <Camera className="h-4 w-4" /> Camera Scan
                    </button>
                  </div>
                </form>

                {scanResult && (
                  <div
                    className={`rounded-2xl p-3.5 border text-xs ${
                      scanResult.status === "success"
                        ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
                        : scanResult.status === "warning"
                        ? "border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
                        : "border-rose-300 bg-rose-50 text-rose-900 dark:bg-rose-950/40 dark:text-rose-200"
                    }`}
                  >
                    <p className="font-bold">{scanResult.message}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Attendance Register Table with Filters & 1-Click Mark */}
            <div className="rounded-3xl border border-[#E5E7EB] bg-white p-5 sm:p-6 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C] space-y-4">
              
              {/* Filter controls */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search className="h-3.5 w-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={attSearch}
                    onChange={(e) => setAttSearch(e.target.value)}
                    placeholder="Search by student name or roll..."
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[#0A2E5C] dark:text-white"
                  />
                </div>

                <div className="flex items-center gap-2 overflow-x-auto">
                  {/* Shift Filter */}
                  <select
                    value={attShiftFilter}
                    onChange={(e) => setAttShiftFilter(e.target.value)}
                    className="text-xs font-bold rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-2 text-[#0A2E5C] dark:text-white"
                  >
                    <option value="all">All Shifts</option>
                    <option value="morning">Morning Shift</option>
                    <option value="afternoon">Afternoon Shift</option>
                    <option value="evening">Evening Shift</option>
                    <option value="full">Full Day Access</option>
                  </select>

                  {/* Status Filter */}
                  <div className="flex items-center rounded-xl bg-zinc-100 dark:bg-zinc-800 p-1 border border-zinc-200 dark:border-zinc-700 text-xs">
                    <button
                      onClick={() => setAttStatusFilter("all")}
                      className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${
                        attStatusFilter === "all" ? "bg-white dark:bg-zinc-700 shadow-xs" : "text-zinc-500"
                      }`}
                    >
                      All
                    </button>
                    <button
                      onClick={() => setAttStatusFilter("in_hall")}
                      className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${
                        attStatusFilter === "in_hall" ? "bg-emerald-600 text-white shadow-xs" : "text-zinc-500"
                      }`}
                    >
                      In Hall
                    </button>
                    <button
                      onClick={() => setAttStatusFilter("checked_out")}
                      className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${
                        attStatusFilter === "checked_out" ? "bg-white dark:bg-zinc-700 shadow-xs" : "text-zinc-500"
                      }`}
                    >
                      Checked Out
                    </button>
                  </div>
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto rounded-2xl border border-zinc-100 dark:border-zinc-800">
                <table className="w-full text-left text-xs min-w-[700px]">
                  <thead className="bg-[#FAF9F6] dark:bg-zinc-800/90 border-b border-zinc-200 dark:border-zinc-800 text-[10px] font-black uppercase text-zinc-500">
                    <tr>
                      <th className="py-3 px-3">Roll ID</th>
                      <th className="py-3 px-3">Student Name</th>
                      <th className="py-3 px-3">Desk #</th>
                      <th className="py-3 px-3">Shift</th>
                      <th className="py-3 px-3">Check-In Time</th>
                      <th className="py-3 px-3">Check-Out Time</th>
                      <th className="py-3 px-3 text-center">Hall Status</th>
                      <th className="py-3 px-3 text-center">Mark Attendance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {students
                      .filter((s) => {
                        if (attSearch) {
                          const q = attSearch.toLowerCase();
                          if (!s.name.toLowerCase().includes(q) && !s.rollNo.toLowerCase().includes(q)) return false;
                        }
                        if (attShiftFilter !== "all") {
                          if (!s.shift.toLowerCase().includes(attShiftFilter)) return false;
                        }
                        if (attStatusFilter === "in_hall" && !s.checkedInNow) return false;
                        if (attStatusFilter === "checked_out" && s.checkedInNow) return false;
                        return true;
                      })
                      .map((st) => (
                        <tr key={st.id} className="hover:bg-zinc-50/70 dark:hover:bg-zinc-800/40">
                          <td className="py-2.5 px-3 font-mono font-bold text-zinc-600 dark:text-zinc-300">
                            {st.studentCode}
                          </td>
                          <td className="py-2.5 px-3 font-black text-[#0A2E5C] dark:text-white">
                            {st.name}
                          </td>
                          <td className="py-2.5 px-3 font-bold text-[#0B5ED7]">
                            {st.seatCode}
                          </td>
                          <td className="py-2.5 px-3 text-zinc-500">
                            {st.shift}
                          </td>
                          <td className="py-2.5 px-3 text-zinc-600 dark:text-zinc-300 font-semibold">
                            {st.checkInTime || "—"}
                          </td>
                          <td className="py-2.5 px-3 text-zinc-400">
                            {st.checkedInNow ? "Active (In Hall)" : "—"}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                              st.checkedInNow
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                            }`}>
                              {st.checkedInNow ? "● In Hall" : "Out"}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {st.checkedInNow ? (
                              <button
                                onClick={() => handleManualToggleAttendance(st)}
                                className="px-3 py-1 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold shadow-xs transition cursor-pointer"
                              >
                                Mark Check-Out
                              </button>
                            ) : (
                              <button
                                onClick={() => handleManualToggleAttendance(st)}
                                className="px-3 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold shadow-xs transition cursor-pointer"
                              >
                                Mark Check-In
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 3: STUDENT REGISTRATION & APPROVALS                    */}
        {/* ========================================================= */}
        {activeTab === "students" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

            {/* Left: Register New Walk-in Student Form */}
            <div className="lg:col-span-6 rounded-3xl border border-[#E5E7EB] bg-white p-5 sm:p-6 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C] space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="rounded-xl bg-[#0A2E5C] p-2 text-[#FFC107]">
                  <UserPlus className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-[#0A2E5C] dark:text-white">
                    Register Walk-in Student
                  </h3>
                  <p className="text-xs text-zinc-500">Fast counter enrollment and instant profile activation</p>
                </div>
              </div>

              <form onSubmit={handleCreateStudent} className="space-y-3 text-xs">
                <div>
                  <label className="font-bold text-zinc-700 dark:text-zinc-300 block mb-1">
                    Student Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={newStudentName}
                    onChange={(e) => setNewStudentName(e.target.value)}
                    placeholder="e.g. Rahul Kumar Verma"
                    className="w-full rounded-xl border border-[#E5E7EB] p-2.5 text-xs text-[#0A2E5C] dark:bg-zinc-800 dark:text-white dark:border-zinc-700"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-zinc-700 dark:text-zinc-300 block mb-1">Email Address *</label>
                    <input
                      type="email"
                      required
                      value={newStudentEmail}
                      onChange={(e) => setNewStudentEmail(e.target.value)}
                      placeholder="rahul@example.com"
                      className="w-full rounded-xl border border-[#E5E7EB] p-2.5 text-xs text-[#0A2E5C] dark:bg-zinc-800 dark:text-white dark:border-zinc-700"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-zinc-700 dark:text-zinc-300 block mb-1">Phone Number</label>
                    <input
                      type="text"
                      value={newStudentPhone}
                      onChange={(e) => setNewStudentPhone(e.target.value)}
                      placeholder="+91 98765 00000"
                      className="w-full rounded-xl border border-[#E5E7EB] p-2.5 text-xs text-[#0A2E5C] dark:bg-zinc-800 dark:text-white dark:border-zinc-700"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-zinc-700 dark:text-zinc-300 block mb-1">Shift Timing</label>
                    <select
                      value={newStudentShift}
                      onChange={(e) => setNewStudentShift(e.target.value)}
                      className="w-full rounded-xl border border-[#E5E7EB] p-2.5 text-xs text-[#0A2E5C] dark:bg-zinc-800 dark:text-white dark:border-zinc-700"
                    >
                      <option value="Morning Shift">Morning Shift (06:00 AM - 12:00 PM)</option>
                      <option value="Afternoon Shift">Afternoon Shift (12:00 PM - 06:00 PM)</option>
                      <option value="Evening Shift">Evening Shift (06:00 PM - 10:00 PM)</option>
                      <option value="Full Day Access">Full Day Access</option>
                    </select>
                  </div>
                  <div>
                    <label className="font-bold text-zinc-700 dark:text-zinc-300 block mb-1">Course / Prep Goal</label>
                    <input
                      type="text"
                      value={newStudentCourse}
                      onChange={(e) => setNewStudentCourse(e.target.value)}
                      placeholder="e.g. UPSC / BPSC / SSC"
                      className="w-full rounded-xl border border-[#E5E7EB] p-2.5 text-xs text-[#0A2E5C] dark:bg-zinc-800 dark:text-white dark:border-zinc-700"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-zinc-700 dark:text-zinc-300 block mb-1">Allot Desk Number (1-100)</label>
                    <input
                      type="text"
                      value={newStudentSeat}
                      onChange={(e) => setNewStudentSeat(e.target.value)}
                      placeholder="e.g. 15 or S-15"
                      className="w-full rounded-xl border border-[#E5E7EB] p-2.5 text-xs text-[#0A2E5C] dark:bg-zinc-800 dark:text-white dark:border-zinc-700"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-zinc-700 dark:text-zinc-300 block mb-1">Joining &amp; Monthly Fee (₹)</label>
                    <input
                      type="number"
                      value={newStudentFee}
                      onChange={(e) => setNewStudentFee(Number(e.target.value))}
                      className="w-full rounded-xl border border-[#E5E7EB] p-2.5 text-xs font-bold text-[#0A2E5C] dark:bg-zinc-800 dark:text-white dark:border-zinc-700"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isAddingStudent}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#0A2E5C] py-3 text-xs font-bold text-[#FFC107] border border-[#FFC107]/40 shadow-sm hover:bg-[#141A24] transition cursor-pointer mt-2"
                >
                  <UserPlus className="h-4 w-4" />
                  {isAddingStudent ? "Registering Member..." : "Register & Activate Member"}
                </button>
              </form>
            </div>

            {/* Right: Pending Student Approvals Queue */}
            <div className="lg:col-span-6 rounded-3xl border border-[#E5E7EB] bg-white p-5 sm:p-6 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C] space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm sm:text-base font-bold text-[#0A2E5C] dark:text-white">
                    Pending Student Registrations
                  </h3>
                  <span className="rounded-full bg-rose-500 text-white text-[10px] font-black px-2 py-0.5">
                    {pendingStudents.length}
                  </span>
                </div>
                <span className="text-[11px] text-zinc-400">1-Click Verification</span>
              </div>

              <div className="divide-y divide-zinc-100 dark:divide-zinc-800 max-h-[460px] overflow-y-auto">
                {pendingStudents.length === 0 ? (
                  <div className="py-16 text-center text-xs text-zinc-400">
                    <CheckCircle className="h-8 w-8 text-emerald-500 mx-auto mb-2 opacity-80" />
                    No pending student registrations! All members are active.
                  </div>
                ) : (
                  pendingStudents.map((std) => (
                    <div key={std.id} className="py-3.5 flex items-center justify-between gap-3">
                      <div>
                        <h4 className="font-bold text-xs text-[#0A2E5C] dark:text-white">{std.fullName}</h4>
                        <p className="text-[11px] text-zinc-500 mt-0.5">
                          {std.email} • {std.phone} • {std.shift || "Morning Shift"}
                        </p>
                      </div>

                      <button
                        onClick={() => handleApproveStudent(std.id, std.fullName)}
                        className="px-3.5 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 shadow-sm transition cursor-pointer shrink-0 flex items-center gap-1.5"
                      >
                        <Check className="h-3.5 w-3.5" /> Approve
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 4: MONTHLY FEES & REVENUE (STRICTLY MONTHLY ONLY)      */}
        {/* ========================================================= */}
        {activeTab === "fees" && (
          <div className="space-y-6">

            {/* Monthly Scope Banner */}
            <div className="p-4 rounded-3xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="h-5 w-5 text-amber-700 dark:text-amber-400 shrink-0" />
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-amber-900 dark:text-amber-300">
                    Staff Clearance: Monthly Fee Collection Only
                  </h4>
                  <p className="text-[11px] text-amber-800/80 dark:text-amber-400">
                    Annual turnover and master ledger settings are restricted to Super Admin.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsFeeModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition cursor-pointer self-start sm:self-auto"
              >
                <IndianRupee className="h-3.5 w-3.5" /> Collect Student Fee
              </button>
            </div>

            {/* 3 Monthly Revenue Metric Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-3xl border border-emerald-200 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C]">
                <span className="text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-400 block">
                  {currentMonthName} Revenue
                </span>
                <div className="text-2xl sm:text-3xl font-black text-emerald-800 dark:text-emerald-300 mt-1">
                  ₹{monthlyFeeStats.monthlyRevenue.toLocaleString("en-IN")}
                </div>
                <p className="text-[11px] text-zinc-500 mt-0.5">{monthlyFeeStats.monthlyPaidCount} Receipts Issued</p>
              </div>

              <div className="rounded-3xl border border-[#E5E7EB] bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C]">
                <span className="text-[10px] font-bold uppercase text-[#0B5ED7] block">
                  Payment Mode Split (This Month)
                </span>
                <div className="text-sm font-bold text-[#0A2E5C] dark:text-white mt-2 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-zinc-500">UPI / QR Code:</span>
                    <span className="font-black text-emerald-700">₹{monthlyFeeStats.monthlyUpiRevenue.toLocaleString("en-IN")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Cash at Counter:</span>
                    <span className="font-black text-blue-700">₹{monthlyFeeStats.monthlyCashRevenue.toLocaleString("en-IN")}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-rose-200 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C]">
                <span className="text-[10px] font-bold uppercase text-rose-700 dark:text-rose-400 block">
                  Pending Monthly Dues
                </span>
                <div className="text-2xl sm:text-3xl font-black text-rose-700 dark:text-rose-400 mt-1">
                  {dueStudentsList.length} <span className="text-xs font-normal text-zinc-400">Students</span>
                </div>
                <p className="text-[11px] text-zinc-500 mt-0.5">Awaiting monthly renewal</p>
              </div>
            </div>

            {/* Fee Collection & Recent Receipts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

              {/* Fee Collection Box */}
              <div className="lg:col-span-5 rounded-3xl border border-[#E5E7EB] bg-white p-5 sm:p-6 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C] space-y-4">
                <h3 className="text-sm sm:text-base font-bold text-[#0A2E5C] dark:text-white">
                  Receive Student Monthly Fee
                </h3>

                <form onSubmit={handleCollectFee} className="space-y-3 text-xs">
                  <div>
                    <label className="font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                      Select Student *
                    </label>
                    <select
                      value={feeStudentRoll}
                      onChange={(e) => {
                        setFeeStudentRoll(e.target.value);
                        const s = students.find((std) => std.rollNo === e.target.value || std.id === e.target.value);
                        if (s) setFeeAmount(s.monthlyFee || 900);
                      }}
                      required
                      className="w-full rounded-xl border border-[#E5E7EB] p-2.5 text-xs text-[#0A2E5C] dark:bg-zinc-800 dark:text-white dark:border-zinc-700"
                    >
                      <option value="">-- Choose Member --</option>
                      {students.map((s) => (
                        <option key={s.id} value={s.rollNo}>
                          {s.name} ({s.rollNo}) - ₹{s.monthlyFee} ({s.feeStatus.toUpperCase()})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">Amount (₹) *</label>
                      <input
                        type="number"
                        required
                        value={feeAmount}
                        onChange={(e) => setFeeAmount(Number(e.target.value))}
                        className="w-full rounded-xl border border-[#E5E7EB] p-2.5 text-xs font-bold text-[#0A2E5C] dark:bg-zinc-800 dark:text-white dark:border-zinc-700"
                      />
                    </div>

                    <div>
                      <label className="font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">Payment Mode *</label>
                      <select
                        value={feeMode}
                        onChange={(e) => setFeeMode(e.target.value as "Cash" | "UPI")}
                        className="w-full rounded-xl border border-[#E5E7EB] p-2.5 text-xs text-[#0A2E5C] dark:bg-zinc-800 dark:text-white dark:border-zinc-700"
                      >
                        <option value="UPI">UPI / QR Code</option>
                        <option value="Cash">Cash at Counter</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">Remarks / Note</label>
                    <input
                      type="text"
                      value={feeDescription}
                      onChange={(e) => setFeeDescription(e.target.value)}
                      placeholder={`Monthly fee for ${currentMonthName}`}
                      className="w-full rounded-xl border border-[#E5E7EB] p-2.5 text-xs text-[#0A2E5C] dark:bg-zinc-800 dark:text-white dark:border-zinc-700"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmittingFee}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#0A2E5C] py-3 text-xs font-bold text-[#FFC107] border border-[#FFC107]/40 shadow-sm hover:bg-[#141A24] transition cursor-pointer mt-2"
                  >
                    <IndianRupee className="h-4 w-4" />
                    {isSubmittingFee ? "Recording..." : "Record Fee & Mark Paid"}
                  </button>
                </form>
              </div>

              {/* Recent Monthly Receipts Issued */}
              <div className="lg:col-span-7 rounded-3xl border border-[#E5E7EB] bg-white p-5 sm:p-6 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C] space-y-4">
                <h3 className="text-sm sm:text-base font-bold text-[#0A2E5C] dark:text-white">
                  Monthly Receipts Issued ({currentMonthName})
                </h3>

                <div className="divide-y divide-zinc-100 dark:divide-zinc-800 max-h-[400px] overflow-y-auto">
                  {fees
                    .filter((f) => f.paid)
                    .slice(0, 15)
                    .map((f) => (
                      <div key={f.id} className="py-2.5 flex items-center justify-between text-xs">
                        <div>
                          <p className="font-bold text-[#0A2E5C] dark:text-white">{f.studentName}</p>
                          <p className="text-[10px] text-zinc-400">
                            {f.receiptNo || "REC"} • {f.type} • {f.createdAt?.split("T")[0] || "Today"}
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="font-black text-emerald-600 dark:text-emerald-400">
                            +₹{Number(f.amount).toLocaleString("en-IN")}
                          </span>
                          <p className="text-[10px] text-zinc-400">{f.description?.includes("Cash") ? "Cash" : "UPI"}</p>
                        </div>
                      </div>
                    ))}
                </div>
              </div>

            </div>

          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 5: DESK & SEATS MATRIX (100 DESKS WITH PERMISSION)    */}
        {/* ========================================================= */}
        {activeTab === "seats" && (
          <div className="space-y-6">

            {/* Header / Info */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-3xl bg-white dark:bg-[#0A2E5C] border border-[#E5E7EB] dark:border-zinc-800 shadow-xs">
              <div>
                <h3 className="text-base sm:text-lg font-black text-[#0A2E5C] dark:text-white flex items-center gap-2">
                  <Armchair className="h-5 w-5 text-[#FFC107]" />
                  <span>Library Floor &amp; Desk Matrix (100 Study Desks • 01 to 100)</span>
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Physical desk allocation (Desks #01 to #100). Click any desk to inspect occupant details or reassign desk.
                </p>
              </div>

              {/* Legend matching Admin Layout */}
              <div className="flex flex-wrap items-center gap-3 text-[10px] font-bold">
                <div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-600"></span><span>Free (Green)</span></div>
                <div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-blue-600"></span><span>Student Seat (Blue)</span></div>
                <div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-red-600"></span><span>Reserved (Red)</span></div>
                <div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-violet-600"></span><span>Locker (Violet)</span></div>
                <div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-emerald-200"></span><span>Inside Now</span></div>
              </div>
            </div>

            {/* Matrix of Study Desks 01 to 100 (Continuous Floor Matrix, No Sections) */}
            <div className="rounded-3xl border border-[#E5E7EB] bg-white p-5 sm:p-6 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C]">
              <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-8 lg:grid-cols-10 gap-2 sm:gap-2.5">
                {Array.from({ length: 100 }, (_, i) => i + 1).map((seatNum) => {
                  const seatId = String(seatNum).padStart(2, "0");
                  const student = students.find((s) => 
                    s.seatNo === seatNum || 
                    matchSeatNumber(s.rawSeat, seatId) ||
                    matchSeatNumber(s.seatCode, seatId)
                  );
                  const isCheckedIn = Boolean(student && student.checkedInNow);
                  const isSelected = selectedSeatNumber === seatNum;
                  const hasLocker = [8, 15, 23, 34, 42, 55, 68, 77, 86, 94].includes(seatNum);

                  // Mode-based Color Determination:
                  // 1. Reserved: Red color with name of student
                  // 2. Student Seat (occupied/assigned): Blue color with seated student name
                  // 3. Locker: Violet color
                  // 4. Free: Green color
                  let colorClass = "bg-emerald-600 text-white border-emerald-700 dark:bg-emerald-600";
                  if (student) {
                    if (student.isReserved || student.status === "reserved" || student.membershipPlan === "Reserved Seat") {
                      colorClass = "bg-red-600 text-white border-red-700 dark:bg-red-600 shadow-xs";
                    } else {
                      colorClass = "bg-blue-600 text-white border-blue-700 dark:bg-blue-600 shadow-xs";
                    }
                  } else if (hasLocker) {
                    colorClass = "bg-violet-600 text-white border-violet-700 dark:bg-violet-600 shadow-xs";
                  }

                  return (
                    <button
                      key={seatNum}
                      onClick={() => setSelectedSeatNumber(seatNum)}
                      className={`
                        relative flex min-h-[64px] sm:min-h-[72px] flex-col items-center justify-center rounded-2xl border font-mono transition-all cursor-pointer p-1.5 shadow-2xs
                        ${colorClass}
                        ${isSelected ? 'ring-3 ring-[#0A2E5C] dark:ring-[#FFC107] scale-105 shadow-md z-10' : 'opacity-95 hover:opacity-100 hover:scale-102'}
                      `}
                      title={`Desk #${seatId} ${student ? `• ${student.name}` : ''} - Click to Inspect`}
                    >
                      {isCheckedIn && (
                        <span className="absolute top-1.5 right-1.5 flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-300 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-200"></span>
                        </span>
                      )}
                      <span className="text-xs sm:text-sm font-black tracking-tight leading-none">#{seatId}</span>
                      {student ? (
                        <span className="text-[9px] sm:text-[10px] font-black truncate max-w-full px-1 text-center mt-1 leading-tight tracking-tight uppercase">
                          {student.name}
                        </span>
                      ) : hasLocker ? (
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

            {/* Desk Inspector Panel */}
            {selectedSeatNumber && (
              <div className="rounded-3xl border border-[#FFC107] bg-white p-5 sm:p-6 shadow-md dark:border-zinc-700 dark:bg-[#0A2E5C] animate-in fade-in">
                {(() => {
                  const currentOccupant = students.find((s) => s.seatNo === selectedSeatNumber);
                  return (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
                        <div className="flex items-center gap-2">
                          <Armchair className="h-5 w-5 text-[#FFC107]" />
                          <h4 className="text-sm sm:text-base font-black text-[#0A2E5C] dark:text-white">
                            Desk #{String(selectedSeatNumber).padStart(2, "0")} Inspection
                          </h4>
                        </div>
                        <button
                          onClick={() => setSelectedSeatNumber(null)}
                          className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>

                      {currentOccupant ? (
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div>
                            <p className="text-xs font-semibold text-zinc-400">Assigned Member</p>
                            <h5 className="text-base font-black text-[#0A2E5C] dark:text-white mt-0.5">
                              {currentOccupant.name} ({currentOccupant.rollNo})
                            </h5>
                            <p className="text-xs text-zinc-500 mt-1">
                              Shift: {currentOccupant.shift} • Phone: {currentOccupant.phone || "—"} • Fee: {currentOccupant.feeStatus.toUpperCase()}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase ${
                                currentOccupant.status === "reserved"
                                  ? "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300 border border-red-200"
                                  : "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200"
                              }`}>
                                {currentOccupant.status === "reserved" ? "Reserved (Red)" : "Student Seat (Blue)"}
                              </span>
                              <span className="text-xs font-bold text-emerald-600">
                                {currentOccupant.checkedInNow ? "✓ Inside Library Now" : "Currently outside"}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                const nextStatus = currentOccupant.status === "reserved" ? "active" : "reserved";
                                setStudents(prev => prev.map(s => s.id === currentOccupant.id ? { ...s, status: nextStatus } : s));
                              }}
                              className={`px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer border ${
                                currentOccupant.status === "reserved"
                                  ? "bg-blue-50 text-blue-700 border-blue-300 hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300"
                                  : "bg-red-50 text-red-700 border-red-300 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-300"
                              }`}
                            >
                              {currentOccupant.status === "reserved" ? "Set as Seated (Blue)" : "Set as Reserved (Red)"}
                            </button>
                            <button
                              onClick={() => handleVacateDesk(currentOccupant.id, selectedSeatNumber)}
                              className="px-4 py-2 rounded-xl border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold cursor-pointer"
                            >
                              Vacate Desk
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <p className="text-xs text-zinc-500">
                            Desk #{String(selectedSeatNumber).padStart(2, "0")} is currently vacant. Assign an active student to this desk:
                          </p>

                          <div className="flex flex-col sm:flex-row items-center gap-3">
                            <select
                              value={assignStudentId}
                              onChange={(e) => setAssignStudentId(e.target.value)}
                              className="w-full sm:w-80 rounded-xl border border-[#E5E7EB] p-2.5 text-xs text-[#0A2E5C] dark:bg-zinc-800 dark:text-white dark:border-zinc-700"
                            >
                              <option value="">-- Choose Member to Assign --</option>
                              {students.map((st) => (
                                <option key={st.id} value={st.id}>
                                  {st.name} ({st.rollNo}) - Current Desk: {st.seatCode}
                                </option>
                              ))}
                            </select>

                            <button
                              onClick={handleAssignDesk}
                              disabled={!assignStudentId || isAssigningSeat}
                              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                            >
                              {isAssigningSeat ? "Assigning..." : "Assign Desk"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 6: EXAM RESULTS & TESTS DESK (WITH PERMISSION)         */}
        {/* ========================================================= */}
        {activeTab === "results" && (
          <div className="space-y-6">

            {/* Exam Desk Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-3xl bg-white dark:bg-[#0A2E5C] border border-[#E5E7EB] dark:border-zinc-800 shadow-xs">
              <div>
                <h3 className="text-base sm:text-lg font-black text-[#0A2E5C] dark:text-white flex items-center gap-2">
                  <Award className="h-5 w-5 text-[#FFC107]" />
                  <span>Library Mock Tests &amp; Exam Scorecards Desk</span>
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  View scheduled tests, official answer keys, and record student marks directly.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-bold px-3 py-1.5 rounded-xl bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200">
                  {exams.length} Exams Active
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

              {/* Left Column: Exams List & Enter Score Form */}
              <div className="lg:col-span-5 space-y-6">

                {/* Exams List */}
                <div className="rounded-3xl border border-[#E5E7EB] bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C] space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black uppercase tracking-wider text-zinc-500">Scheduled Tests</h4>
                    <span className="text-[10px] text-zinc-400">Click to inspect</span>
                  </div>

                  <div className="space-y-2 max-h-[280px] overflow-y-auto">
                    {exams.map((ex) => (
                      <div
                        key={ex.id}
                        onClick={() => setSelectedExamId(ex.id)}
                        className={`p-3 rounded-2xl border transition cursor-pointer ${
                          selectedExamId === ex.id
                            ? "border-[#FFC107] bg-[#F8FAFC] dark:bg-zinc-800 shadow-xs"
                            : "border-zinc-200 dark:border-zinc-800 hover:border-[#FFC107]"
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <h5 className="font-bold text-xs text-[#0A2E5C] dark:text-white">{ex.title}</h5>
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                            {ex.status}
                          </span>
                        </div>
                        <p className="text-[10px] text-zinc-500 mt-1">
                          Date: {ex.examDate} • Max: {ex.totalMarks} Marks • Pass: {ex.passingMarks}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Record Student Score Form */}
                <div className="rounded-3xl border border-[#E5E7EB] bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C] space-y-3">
                  <h4 className="text-xs font-black uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                    Record Student Exam Score
                  </h4>

                  <form onSubmit={handleSaveExamScore} className="space-y-3 text-xs">
                    <div>
                      <label className="font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">Select Student *</label>
                      <select
                        value={markStudentId}
                        onChange={(e) => setMarkStudentId(e.target.value)}
                        required
                        className="w-full rounded-xl border border-[#E5E7EB] p-2.5 text-xs text-[#0A2E5C] dark:bg-zinc-800 dark:text-white dark:border-zinc-700"
                      >
                        <option value="">-- Choose Member --</option>
                        {students.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.rollNo})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">Marks Obtained *</label>
                        <input
                          type="number"
                          required
                          value={markScore}
                          onChange={(e) => setMarkScore(Number(e.target.value))}
                          className="w-full rounded-xl border border-[#E5E7EB] p-2.5 text-xs font-bold text-[#0A2E5C] dark:bg-zinc-800 dark:text-white dark:border-zinc-700"
                        />
                      </div>
                      <div>
                        <label className="font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">Remarks</label>
                        <input
                          type="text"
                          value={markRemarks}
                          onChange={(e) => setMarkRemarks(e.target.value)}
                          placeholder="e.g. Excellent / Pass"
                          className="w-full rounded-xl border border-[#E5E7EB] p-2.5 text-xs text-[#0A2E5C] dark:bg-zinc-800 dark:text-white dark:border-zinc-700"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={isSubmittingMark}
                      className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#0A2E5C] py-2.5 text-xs font-bold text-[#FFC107] border border-[#FFC107]/40 shadow-sm hover:bg-[#141A24] cursor-pointer"
                    >
                      <Award className="h-4 w-4" />
                      {isSubmittingMark ? "Saving..." : "Save Score & Update Ranks"}
                    </button>
                  </form>
                </div>

              </div>

              {/* Right Column: Selected Exam Details & Scores Table */}
              <div className="lg:col-span-7 rounded-3xl border border-[#E5E7EB] bg-white p-5 sm:p-6 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C] space-y-4">
                {(() => {
                  const currentExam = exams.find((e) => e.id === selectedExamId) || exams[0];
                  if (!currentExam) {
                    return <div className="py-12 text-center text-xs text-zinc-400">No exams available.</div>;
                  }
                  const marksForExam = examMarks.filter((m) => m.examId === currentExam.id);

                  return (
                    <div className="space-y-4">
                      <div className="border-b border-zinc-100 dark:border-zinc-800 pb-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black uppercase text-[#0B5ED7]">{currentExam.category}</span>
                          <span className="text-xs text-zinc-400">Exam Date: {currentExam.examDate}</span>
                        </div>
                        <h4 className="text-base font-black text-[#0A2E5C] dark:text-white mt-1">{currentExam.title}</h4>
                        <p className="text-xs text-zinc-500 mt-0.5">{currentExam.description}</p>
                      </div>

                      <div className="flex items-center justify-between">
                        <h5 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                          Student Scorecard ({marksForExam.length} Entries)
                        </h5>
                      </div>

                      <div className="overflow-x-auto rounded-2xl border border-zinc-100 dark:border-zinc-800">
                        <table className="w-full text-left text-xs min-w-[500px]">
                          <thead className="bg-[#FAF9F6] dark:bg-zinc-800/90 text-zinc-500 text-[10px] font-black uppercase">
                            <tr>
                              <th className="py-2.5 px-3">Rank</th>
                              <th className="py-2.5 px-3">Student</th>
                              <th className="py-2.5 px-3 text-center">Score</th>
                              <th className="py-2.5 px-3 text-center">Status</th>
                              <th className="py-2.5 px-3">Remarks</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                            {marksForExam.length === 0 ? (
                              <tr>
                                <td colSpan={5} className="py-8 text-center text-zinc-400">
                                  No student scores recorded yet for this exam. Use the form on the left to enter marks.
                                </td>
                              </tr>
                            ) : (
                              marksForExam.map((m) => (
                                <tr key={m.id} className="hover:bg-zinc-50/70 dark:hover:bg-zinc-800/40">
                                  <td className="py-2.5 px-3 font-black text-[#0A2E5C] dark:text-white">
                                    #{m.rank || "—"}
                                  </td>
                                  <td className="py-2.5 px-3 font-bold text-[#0A2E5C] dark:text-white">
                                    {m.studentName}
                                  </td>
                                  <td className="py-2.5 px-3 text-center font-bold text-zinc-700 dark:text-zinc-200">
                                    {m.marksObtained} / {m.totalMarks} ({m.percentage}%)
                                  </td>
                                  <td className="py-2.5 px-3 text-center">
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                      m.status === "Pass"
                                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                        : "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                                    }`}>
                                      {m.status}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 text-zinc-500 italic text-[11px]">
                                    {m.remarks || "—"}
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })()}
              </div>

            </div>

          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 7: 2-WAY STUDENT MESSAGES                             */}
        {/* ========================================================= */}
        {activeTab === "messages" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 rounded-3xl border border-[#E5E7EB] bg-white dark:border-zinc-800 dark:bg-[#0A2E5C] overflow-hidden shadow-xs">
            
            {/* Left Column: Student Inquiries List */}
            <div className={`lg:col-span-4 border-b lg:border-b-0 lg:border-r border-zinc-200 dark:border-zinc-800 flex flex-col bg-[#FBFBFA] dark:bg-[#161D2A] max-h-[660px] ${
              mobileStaffChatView === "chat" ? "hidden lg:flex" : "flex"
            }`}>
              <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-black uppercase tracking-wider text-[#0A2E5C] dark:text-white flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-[#0B5ED7]" /> Student Inquiries
                  </h3>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                    {students.length} Members
                  </span>
                </div>

                <div className="relative">
                  <Search className="h-3.5 w-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search student or roll..."
                    value={staffChatSearch}
                    onChange={(e) => setStaffChatSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs bg-white dark:bg-[#0A2E5C] border border-zinc-200 dark:border-zinc-700 rounded-xl focus:outline-none focus:border-[#FFC107] text-[#0A2E5C] dark:text-white"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800/60">
                {students
                  .filter((s) => {
                    if (!staffChatSearch) return true;
                    const q = staffChatSearch.toLowerCase();
                    return s.name.toLowerCase().includes(q) || s.rollNo.toLowerCase().includes(q);
                  })
                  .map((s) => {
                    const studentMsgs = messages.filter((m) => m.studentId === s.id);
                    const lastMsg = studentMsgs[studentMsgs.length - 1];
                    const isSelected = s.id === activeChatStudentId;
                    const unread = studentMsgs.filter((m) => m.senderRole === "student" && !m.isRead).length;

                    return (
                      <button
                        key={s.id}
                        onClick={() => {
                          setActiveChatStudentId(s.id);
                          setMobileStaffChatView("chat");
                          markMessagesAsRead(s.id);
                        }}
                        className={`w-full text-left p-3.5 transition flex items-start gap-3 cursor-pointer ${
                          isSelected
                            ? "bg-white dark:bg-[#0A2E5C] border-l-4 border-l-[#FFC107] shadow-xs"
                            : "hover:bg-white/60 dark:hover:bg-zinc-800/50"
                        }`}
                      >
                        <div className="relative shrink-0">
                          <div className="h-10 w-10 rounded-2xl bg-[#0A2E5C] text-[#FFC107] font-bold flex items-center justify-center text-xs shadow-xs">
                            {s.name.slice(0, 2).toUpperCase()}
                          </div>
                          {unread > 0 && (
                            <span className="absolute -top-1 -right-1 h-4 min-w-[16px] px-1 bg-rose-500 text-white rounded-full text-[9px] font-black flex items-center justify-center">
                              {unread}
                            </span>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <p className="text-xs font-black text-[#0A2E5C] dark:text-white truncate">{s.name}</p>
                            {lastMsg && (
                              <span className="text-[10px] text-zinc-400 shrink-0">
                                {new Date(lastMsg.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-zinc-400 truncate">{s.seatCode} • {s.shift}</p>
                          <p className={`text-[11px] mt-1 truncate ${
                            unread > 0 ? "font-bold text-[#0A2E5C] dark:text-white" : "text-zinc-500 dark:text-zinc-400"
                          }`}>
                            {lastMsg ? `${lastMsg.senderRole === "student" ? "Student: " : "Staff: "}${lastMsg.message}` : "No messages yet"}
                          </p>
                        </div>
                      </button>
                    );
                  })}
              </div>
            </div>

            {/* Right Column: Chat Box */}
            <div className={`lg:col-span-8 flex flex-col h-[660px] bg-white dark:bg-[#0A2E5C] ${
              mobileStaffChatView === "list" ? "hidden lg:flex" : "flex"
            }`}>
              {selectedChatStudent ? (
                <>
                  <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3 bg-[#FBFBFA]/70 dark:bg-[#161D2A]/70">
                    <div className="flex items-center gap-3 min-w-0">
                      <button
                        onClick={() => setMobileStaffChatView("list")}
                        className="lg:hidden p-1.5 rounded-xl text-zinc-600 hover:bg-zinc-100"
                      >
                        <ChevronLeft className="h-5 w-5" />
                      </button>
                      <div className="h-10 w-10 rounded-2xl bg-[#0A2E5C] text-[#FFC107] font-black flex items-center justify-center text-xs shadow-xs shrink-0">
                        {selectedChatStudent.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-sm font-black text-[#0A2E5C] dark:text-white truncate">
                          {selectedChatStudent.name}
                        </h4>
                        <p className="text-[11px] text-zinc-500 truncate">
                          {selectedChatStudent.rollNo} • {selectedChatStudent.seatCode} • {selectedChatStudent.shift}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {selectedChatStudent.phone && (
                        <a
                          href={`https://wa.me/${selectedChatStudent.phone.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(`Hello ${selectedChatStudent.name}, this is ${currentStaff.name} from Genius Library front desk.`)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition"
                        >
                          <WhatsAppIcon className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">WhatsApp</span>
                        </a>
                      )}
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3 bg-[#FBFBFA]/60 dark:bg-[#121822]/60">
                    {activeStudentChatMsgs.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-center text-zinc-400 text-xs">
                        <MessageSquare className="h-8 w-8 mb-2 text-zinc-300" />
                        <span>No message history with {selectedChatStudent.name}.</span>
                      </div>
                    ) : (
                      [...activeStudentChatMsgs].reverse().map((msg) => {
                        const isStudent = msg.senderRole === "student";
                        return (
                          <div key={msg.id} className={`flex flex-col ${isStudent ? "items-start" : "items-end"}`}>
                            <div className="flex items-center gap-1.5 mb-1 px-1">
                              <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400">
                                {isStudent ? selectedChatStudent.name : msg.senderName || "Front Desk Staff"}
                              </span>
                            </div>
                            <div
                              className={`p-3.5 rounded-2xl max-w-[85%] sm:max-w-[75%] text-xs shadow-xs ${
                                isStudent
                                  ? "bg-[#F8FAFC] dark:bg-zinc-800 text-[#0A2E5C] dark:text-zinc-100 rounded-tl-xs border border-zinc-200"
                                  : "bg-[#0A2E5C] text-white dark:bg-[#FFC107] dark:text-[#0A2E5C] rounded-tr-xs font-medium"
                              }`}
                            >
                              <FormattedMessage text={msg.message} />
                            </div>
                          </div>
                        );
                      })
                    )}
                    <div ref={chatScrollRef} />
                  </div>

                  <div className="p-3 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#0A2E5C]">
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleSendChatReply();
                      }}
                      className="flex items-center gap-2"
                    >
                      <input
                        type="text"
                        placeholder={`Message ${selectedChatStudent.name}...`}
                        value={chatReplyText}
                        onChange={(e) => setChatReplyText(e.target.value)}
                        className="flex-1 px-4 py-2.5 bg-[#F8FAFC] dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs text-[#0A2E5C] dark:text-white focus:outline-none focus:border-[#FFC107]"
                      />
                      <button
                        type="submit"
                        disabled={isReplying || !chatReplyText.trim()}
                        className="px-4 py-2.5 rounded-xl bg-[#0A2E5C] text-[#FFC107] text-xs font-bold hover:bg-[#141A24] cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                      >
                        <Send className="h-3.5 w-3.5" /> Send
                      </button>
                    </form>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center p-8 text-xs text-zinc-400">
                  <MessageSquare className="h-10 w-10 text-zinc-300 mb-2" />
                  Select a member to chat.
                </div>
              )}
            </div>

          </div>
        )}

        </main>

        {/* Mobile Bottom Navigation Bar styled like Admin layout */}
        <div className="lg:hidden fixed bottom-0 left-0 right-0 border-t border-zinc-200/80 bg-white/95 backdrop-blur-md px-1.5 py-1 z-30 dark:bg-[#0A2E5C]/95 dark:border-zinc-800 shadow-[0_-6px_20px_rgba(0,0,0,0.06)] pb-[calc(0.25rem+env(safe-area-inset-bottom))]">
          <div className="flex justify-around items-center max-w-md mx-auto">
            {STAFF_MOBILE_BOTTOM_NAV.map((item) => {
              const active = activeTab === item.id;
              const Icon = item.icon;

              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id as StaffTab)}
                  className="cursor-pointer focus:outline-none py-0.5 px-2"
                >
                  <div className="flex flex-col items-center justify-center gap-0.5 group active:scale-90 transition-transform select-none">
                    <div className={`
                      flex h-8 w-8 items-center justify-center rounded-xl transition-all duration-200 shadow-xs
                      ${active 
                        ? "bg-linear-to-tr from-[#0B5ED7] to-[#FFC107] text-[#0A2E5C] shadow-sm shadow-[#0B5ED7]/30 scale-105" 
                        : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 group-hover:bg-[#FFC107]/20 group-hover:text-[#0B5ED7]"
                      }
                    `}>
                      <Icon className={`h-4 w-4 ${active ? "stroke-[2.5]" : "stroke-[1.75]"}`} />
                    </div>
                    <span className={`text-[10px] font-bold tracking-tight ${active ? "text-[#0B5ED7] dark:text-[#FFC107]" : "text-zinc-400"}`}>
                      {item.label}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

      </div>

      {/* Quick Fee Collection Modal (Callable from any tab) */}
      {isFeeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="relative w-full max-w-md rounded-3xl bg-white dark:bg-[#0A2E5C] border border-[#E5E7EB] dark:border-zinc-700 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                  ₹
                </div>
                <div>
                  <h3 className="text-sm font-black text-[#0A2E5C] dark:text-white">Receive Student Monthly Fee</h3>
                  <p className="text-[11px] text-zinc-400">{currentMonthName}</p>
                </div>
              </div>
              <button onClick={() => setIsFeeModalOpen(false)} className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCollectFee} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">Student / Roll *</label>
                <select
                  value={feeStudentRoll}
                  onChange={(e) => {
                    setFeeStudentRoll(e.target.value);
                    const s = students.find((std) => std.rollNo === e.target.value || std.id === e.target.value);
                    if (s) setFeeAmount(s.monthlyFee || 900);
                  }}
                  required
                  className="w-full rounded-xl border border-[#E5E7EB] p-2.5 text-xs text-[#0A2E5C] dark:bg-zinc-800 dark:text-white dark:border-zinc-700"
                >
                  <option value="">-- Choose Member --</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.rollNo}>
                      {s.name} ({s.rollNo}) - Due: ₹{s.monthlyFee}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">Amount (₹) *</label>
                  <input
                    type="number"
                    required
                    value={feeAmount}
                    onChange={(e) => setFeeAmount(Number(e.target.value))}
                    className="w-full rounded-xl border border-[#E5E7EB] p-2.5 text-xs font-bold text-[#0A2E5C] dark:bg-zinc-800 dark:text-white dark:border-zinc-700"
                  />
                </div>
                <div>
                  <label className="font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">Payment Mode *</label>
                  <select
                    value={feeMode}
                    onChange={(e) => setFeeMode(e.target.value as "Cash" | "UPI")}
                    className="w-full rounded-xl border border-[#E5E7EB] p-2.5 text-xs text-[#0A2E5C] dark:bg-zinc-800 dark:text-white dark:border-zinc-700"
                  >
                    <option value="UPI">UPI / QR Code</option>
                    <option value="Cash">Cash at Counter</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">Receipt Note</label>
                <input
                  type="text"
                  value={feeDescription}
                  onChange={(e) => setFeeDescription(e.target.value)}
                  placeholder={`Monthly desk installment for ${currentMonthName}`}
                  className="w-full rounded-xl border border-[#E5E7EB] p-2.5 text-xs text-[#0A2E5C] dark:bg-zinc-800 dark:text-white dark:border-zinc-700"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsFeeModalOpen(false)}
                  className="px-4 py-2 rounded-xl border text-xs font-bold text-zinc-600 dark:text-zinc-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingFee}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md cursor-pointer"
                >
                  {isSubmittingFee ? "Processing..." : "Confirm & Issue Receipt"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Live Camera Scanner Modal */}
      <AdminStudentQrScannerModal
        isOpen={isQrScannerOpen}
        onClose={() => setIsQrScannerOpen(false)}
        onStudentUpdated={loadData}
      />

    </div>
  );
}
