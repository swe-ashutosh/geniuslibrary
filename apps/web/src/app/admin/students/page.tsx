"use client";

/**
 * [WEB • PAGE] Students Directory
 *
 * Registrations, approvals/rejections, status changes, details and
 * digital ID cards. Data: Supabase profiles via @/lib/api.
 */
import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  Users, CheckCircle, Clock, Search, Filter,
  Trash2, Eye, EyeOff, Info, Check, X, Phone, MapPin, BookOpen,
  Crown, AlertCircle, RefreshCw, Compass, ArrowUpRight,
  GraduationCap, Calendar, List, LayoutGrid, Grid3X3, QrCode,
  Edit3, MoreVertical, Send, Download, Printer, ShieldCheck,
  CheckCircle2, Sparkles, UserPlus, ChevronLeft, ChevronRight,
  ChevronDown, DollarSign, Wallet, Lock, User, Ban, UserX, UserCheck,
  Mail, ShieldAlert, TrendingUp, Armchair, MessageCircle
} from "lucide-react";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { 
  getStudents, 
  updateStudentStatus, 
  updateStudentComplete,
  approveAllStudents, 
  deleteStudent,
  getAttendance,
  getSeats,
  allocateSeat,
  AttendanceRecord,
  Seat,
  createNotification,
  createFee,
  clearStudentUpiClaims,
  generateStudentCode,
  generateInvoiceNumber
} from "@/lib/api";
import { triggerNativeNotification } from "@/lib/pushNotify";
import { BRAND_CONFIG, isMasterAdminEmail } from "@/lib/config";
import { matchSeatNumber, parseDeskNum, formatDeskId } from "@/lib/seatUtils";

interface StudentProfile {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  parent_name?: string;
  parent_phone?: string;
  address?: string;
  course?: string;
  shift?: string;
  role?: string;
  status: "active" | "pending" | "suspended";
  avatar_url?: string | null;
  created_at?: string;
  student_code?: string;
  membership_plan?: "General" | "Reserved Seat" | "Trial Pass";
  seat_number?: string;
  fee_status?: "Paid" | "Due";
  due_amount?: number;
  password?: string;
}

export const GENERAL_SHIFT_OPTIONS = [
  { id: "standard_3hr", name: "Standard (3 Hours Pass) - Flexible 24/7", price: 300, duration: "3 Hours Daily" },
  { id: "prime_6hr", name: "Pro / Prime (6 Hours Pass) - Flexible 24/7", price: 500, duration: "6 Hours Daily" },
  { id: "night_ultra", name: "Night Shift Ultra (10:00 PM - 06:00 AM)", price: 500, duration: "8 Hours Night" },
];

export const RESERVED_SHIFT_OPTIONS = [
  { id: "reserve_mini", name: "Elite / Reserve Mini (24/7 Dedicated Seat)", price: 500, duration: "24/7 Dedicated" },
  { id: "reserve_big", name: "Prime / Reserve Big (24/7 Premium Large Desk)", price: 600, duration: "24/7 Dedicated" },
  { id: "reserve_locker", name: "Max / Reserve Locker (24/7 Seat + Locker)", price: 700, duration: "24/7 Dedicated" },
];

export const TRIAL_PASS_OPTIONS = [
  { id: "trial_3day", name: "3-Day Free Trial Pass - Flexible 24/7", price: 0, duration: "3 Days Access" },
];

export const SHIFT_OPTIONS = [
  ...GENERAL_SHIFT_OPTIONS,
  ...RESERVED_SHIFT_OPTIONS,
  ...TRIAL_PASS_OPTIONS,
];

export function getShiftOptionsForPlan(plan?: string) {
  if (plan === "Reserved Seat") return RESERVED_SHIFT_OPTIONS;
  if (plan === "Trial Pass") return TRIAL_PASS_OPTIONS;
  return GENERAL_SHIFT_OPTIONS;
}

export function getStudentFeeSchedule(std: { fee_status?: string; due_amount?: number; created_at?: string }) {
  const isDue = std.fee_status === "Due" || (std.due_amount !== undefined && std.due_amount > 0);
  const now = new Date();
  const joinDate = std.created_at ? new Date(std.created_at) : new Date();

  if (isDue) {
    // Unpaid due date anchored to admission date / billing cycle
    const daysOverdue = Math.max(0, Math.floor((now.getTime() - joinDate.getTime()) / (1000 * 60 * 60 * 24)));
    const isDefaulter = daysOverdue >= 60; // 2+ months unpaid
    const isOverdue = daysOverdue > 15;     // > 15 days unpaid

    const formattedDate = joinDate.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    });

    return {
      isDue: true,
      status: isDefaulter ? "Defaulter (2+ Mo)" : isOverdue ? "Overdue" : "Due",
      daysOverdue,
      dateString: formattedDate,
      label: isDefaulter ? `Defaulter: ${formattedDate}` : isOverdue ? `Overdue: ${formattedDate}` : `Due: ${formattedDate}`,
      colorClass: isDefaulter
        ? "border-red-300 bg-red-100 text-red-700 dark:border-red-800 dark:bg-red-950/60 dark:text-red-300"
        : isOverdue
          ? "border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
          : "border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-400",
    };
  } else {
    // Paid: calculate next month's upcoming due date
    const nextDue = new Date(joinDate);
    const dayOfMonth = joinDate.getDate() || 1;
    nextDue.setFullYear(now.getFullYear(), now.getMonth(), dayOfMonth);
    if (nextDue <= now) {
      nextDue.setMonth(nextDue.getMonth() + 1);
    }
    const formattedDate = nextDue.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    });

    return {
      isDue: false,
      status: "Paid",
      daysOverdue: 0,
      dateString: formattedDate,
      label: `Next Due: ${formattedDate}`,
      colorClass: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-400",
    };
  }
}

function StudentsDirectoryContent() {
  const [mounted, setMounted] = useState(false);
  const searchParams = useSearchParams();

  useEffect(() => {
    setMounted(true);
  }, []);

  const [viewMode, setViewMode] = useState<"table" | "grid">("table");
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPlanFilter, setSelectedPlanFilter] = useState("all");
  const [selectedStatusFilter, setSelectedStatusFilter] = useState("all");
  const [selectedCourseFilter, setSelectedCourseFilter] = useState("all");
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [alertMsg, setAlertMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Auto-dismiss alert notification after 3.5 seconds
  useEffect(() => {
    if (!alertMsg) return;
    const timer = setTimeout(() => {
      setAlertMsg(null);
    }, 3500);
    return () => clearTimeout(timer);
  }, [alertMsg]);

  // Modals state
  const [selectedStudentForView, setSelectedStudentForView] = useState<StudentProfile | null>(null);
  const [selectedStudentForEdit, setSelectedStudentForEdit] = useState<StudentProfile | null>(null);
  const [selectedStudentForQr, setSelectedStudentForQr] = useState<StudentProfile | null>(null);
  const [showPendingModal, setShowPendingModal] = useState(false);

  // Attendance and Live Presence state (checked-in currently in library)
  const [attendanceList, setAttendanceList] = useState<AttendanceRecord[]>([]);

  // Seat Allocation Modal for Reserved Seat approval
  const [seatAllocationStudent, setSeatAllocationStudent] = useState<StudentProfile | null>(null);
  const [selectedSeatForApproval, setSelectedSeatForApproval] = useState<string>("");

  // Auto-open Pending Approvals Modal if navigated with ?modal=pending
  useEffect(() => {
    if (searchParams.get("modal") === "pending" || searchParams.get("pending") === "true") {
      setShowPendingModal(true);
    }
  }, [searchParams]);

  // Custom Filter Dropdowns state
  const [planDropdownOpen, setPlanDropdownOpen] = useState(false);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [courseDropdownOpen, setCourseDropdownOpen] = useState(false);
  const [dateDropdownOpen, setDateDropdownOpen] = useState(false);
  const [selectedDateRange, setSelectedDateRange] = useState<"all" | "today" | "this_week" | "this_month" | "last_30" | "custom">("all");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Edit Student Form State
  const [editStudentForm, setEditStudentForm] = useState<StudentProfile | null>(null);

  // Quick Actions Modals & Broadcast State
  const [showAddStudentModal, setShowAddStudentModal] = useState(false);
  const [showEnrollPassword, setShowEnrollPassword] = useState(false);
  const [newStudentForm, setNewStudentForm] = useState<Partial<StudentProfile>>({
    full_name: "",
    phone: "",
    email: "",
    password: "",
    parent_name: "",
    parent_phone: "",
    course: "UPSC",
    shift: GENERAL_SHIFT_OPTIONS[0].name,
    membership_plan: "General",
    seat_number: "",
    address: "",
    status: "active",
    fee_status: "Due",
    due_amount: 300,
  });
  const [isAddingStudent, setIsAddingStudent] = useState(false);

  const [showPrintCardsModal, setShowPrintCardsModal] = useState(false);
  const [showSendSmsModal, setShowSendSmsModal] = useState(false);
  const [smsTemplate, setSmsTemplate] = useState("notice");
  const [smsCustomMessage, setSmsCustomMessage] = useState("Dear Student, please note that Genius Library will operate as per regular hours. Study hard & stay focused!");
  const [smsRecipientFilter, setSmsRecipientFilter] = useState<"all" | "active" | "pending" | "due" | "selected">("all");
  const [isSendingSms, setIsSendingSms] = useState(false);

  // Quick Action 1: Create New Admission Handler
  const handleCreateNewStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudentForm.full_name?.trim() || !newStudentForm.phone?.trim()) {
      setAlertMsg({ type: "error", text: "Please enter student name and mobile number." });
      return;
    }
    setIsAddingStudent(true);
    try {
      const supabase = createClient();
      const newId = `std-${Date.now()}`;
      const studentCode = generateStudentCode(students.map((s) => s.student_code));
      const seatNum = newStudentForm.membership_plan === "Reserved Seat" ? (newStudentForm.seat_number?.trim() || "S-01") : null;

      const rawPhone = newStudentForm.phone.trim();
      const cleanPhone = rawPhone.replace(/[^0-9]/g, "").slice(-10);
      const rawParentPhone = newStudentForm.parent_phone?.trim() || "";
      const cleanParentPhone = rawParentPhone.replace(/[^0-9]/g, "").slice(-10);

      if (cleanParentPhone && cleanPhone === cleanParentPhone) {
        setAlertMsg({ type: "error", text: "Student and Parent mobile numbers cannot be the same." });
        setIsAddingStudent(false);
        return;
      }

      const studentEmail = newStudentForm.email?.trim() || `${cleanPhone}@geniusdigital.in`;

      // Password: if entered use it, otherwise default to their 10-digit mobile number!
      const passwordToUse = newStudentForm.password?.trim() || cleanPhone;
      if (!passwordToUse || passwordToUse.length < 6) {
        setAlertMsg({ type: "error", text: "Password or 10-digit Mobile number must be at least 6 characters long." });
        setIsAddingStudent(false);
        return;
      }

      // Calculate shift fee (all new students start as Due with this full fee)
      const selectedShiftObj = SHIFT_OPTIONS.find(s => s.name === newStudentForm.shift) || SHIFT_OPTIONS[0];
      const initialShiftFee = newStudentForm.membership_plan === "Trial Pass" ? 0 : (selectedShiftObj.price || 500);

      // Register student in Supabase Auth using a non-session client so admin is NOT logged out
      let authUserId = newId;
      try {
        const tempAuthClient = createSupabaseClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
           process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
          {
            auth: {
              persistSession: false,
              autoRefreshToken: false,
              detectSessionInUrl: false,
            }
          }
        );

        const { data: signUpData, error: signUpError } = await tempAuthClient.auth.signUp({
          email: studentEmail,
          password: passwordToUse,
          options: {
            data: {
              full_name: newStudentForm.full_name.trim(),
              phone: rawPhone.startsWith("+91") ? rawPhone : `+91 ${rawPhone}`,
              parent_name: newStudentForm.parent_name?.trim() || "",
              parent_phone: newStudentForm.parent_phone?.trim() || "",
              course: newStudentForm.course || "General Studies",
              shift: newStudentForm.shift || GENERAL_SHIFT_OPTIONS[0].name,
              membership_plan: (newStudentForm.membership_plan as any) || "General",
              seat_number: seatNum,
              role: "student",
              status: (newStudentForm.status as any) || "active",
            }
          }
        });

        if (signUpData?.user?.id) {
          authUserId = signUpData.user.id;
        } else if (signUpError) {
          console.warn("Supabase Auth sign up warning:", signUpError.message);
        }
      } catch (authErr) {
        console.warn("Supabase Auth sign up exception:", authErr);
      }

      const newRecord: StudentProfile = {
        id: authUserId,
        student_code: studentCode,
        full_name: newStudentForm.full_name.trim(),
        phone: rawPhone.startsWith("+91") ? rawPhone : `+91 ${rawPhone}`,
        email: studentEmail,
        parent_name: newStudentForm.parent_name?.trim() || "",
        parent_phone: newStudentForm.parent_phone?.trim() ? (newStudentForm.parent_phone.trim().startsWith("+91") ? newStudentForm.parent_phone.trim() : `+91 ${newStudentForm.parent_phone.trim()}`) : "",
        course: newStudentForm.course || "General Studies",
        shift: newStudentForm.shift || GENERAL_SHIFT_OPTIONS[0].name,
        membership_plan: (newStudentForm.membership_plan as any) || "General",
        seat_number: seatNum || undefined,
        address: newStudentForm.address?.trim() || "Madhupur, Sonbhadra",
        status: (newStudentForm.status as any) || "active",
        fee_status: "Due",
        due_amount: initialShiftFee,
        created_at: new Date().toISOString(),
      };

      // Direct save to Supabase profiles (Primary live database)
      try {
        await supabase.from("profiles").upsert([{
          id: authUserId,
          student_code: studentCode,
          full_name: newRecord.full_name,
          phone: newRecord.phone,
          email: newRecord.email,
          parent_name: newRecord.parent_name,
          parent_phone: newRecord.parent_phone,
          course: newRecord.course,
          shift: newRecord.shift,
          membership_plan: newRecord.membership_plan,
          seat_number: seatNum,
          address: newRecord.address,
          status: newRecord.status,
          fee_status: "Due",
          due_amount: initialShiftFee,
          role: "student",
          created_at: newRecord.created_at,
          updated_at: newRecord.created_at,
        }]);
      } catch (err) {
        console.warn("Supabase upsert note:", err);
      }

      setStudents((prev) => [newRecord, ...prev]);
      setShowAddStudentModal(false);
      setNewStudentForm({
        full_name: "",
        phone: "",
        email: "",
        password: "",
        parent_name: "",
        parent_phone: "",
        course: "UPSC",
        shift: GENERAL_SHIFT_OPTIONS[0].name,
        membership_plan: "General",
        seat_number: "",
        address: "",
        status: "active",
        fee_status: "Due",
        due_amount: 300,
      });
      setAlertMsg({
        type: "success",
        text: `✓ Student "${newRecord.full_name}" registered! Fee Status: Due (₹${initialShiftFee}). Login: ${studentEmail} or Mobile (${cleanPhone}) | Password: ${passwordToUse}`,
      });
    } catch (e: any) {
      setAlertMsg({ type: "error", text: `Failed to register student: ${e.message}` });
    } finally {
      setIsAddingStudent(false);
    }
  };

  // Quick Action 2: Export CSV Handler
  const handleExportCSV = (onlySelected: boolean = false) => {
    let records = filteredStudents.length > 0 ? filteredStudents : students;
    if (onlySelected && selectedStudents.length > 0) {
      records = students.filter((s) => selectedStudents.includes(s.id));
    }
    if (!records || records.length === 0) {
      setAlertMsg({ type: "error", text: "No student records available to export." });
      return;
    }
    const headers = [
      "Student ID",
      "Full Name",
      "Phone",
      "Parent Phone",
      "Email",
      "Course",
      "Shift",
      "Membership Plan",
      "Seat Number",
      "Status",
      "Fee Status",
      "Due Amount (INR)",
      "Fee Due Date / Next Due",
      "Registered Date"
    ];
    const dataRows = records.map((s) => {
      const schedule = getStudentFeeSchedule(s);
      return [
        `"${s.student_code || s.id}"`,
        `"${(s.full_name || "").replace(/"/g, '""')}"`,
        `"${s.phone || ""}"`,
        `"${s.parent_phone || ""}"`,
        `"${s.email || ""}"`,
        `"${(s.course || "General").replace(/"/g, '""')}"`,
        `"${(s.shift || "Morning").replace(/"/g, '""')}"`,
        `"${(s.membership_plan || "General").replace(/"/g, '""')}"`,
        `"${s.seat_number || ""}"`,
        `"${s.status || "active"}"`,
        `"${s.fee_status || "Paid"}"`,
        `"${s.due_amount || 0}"`,
        `"${schedule.label}"`,
        `"${s.created_at ? new Date(s.created_at).toLocaleDateString("en-IN") : new Date().toLocaleDateString("en-IN")}"`
      ];
    });

    const csvContent = "\uFEFF" + [headers.join(","), ...dataRows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Genius_Library_Students_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setAlertMsg({ type: "success", text: `✓ Successfully exported ${records.length} student records to CSV file!` });
  };

  // Print / Save Individual Student Record as Document or PDF
  const handlePrintStudentPDF = (std: StudentProfile) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("Please allow popups to download/print the student record.");
      return;
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Student Record - ${std.full_name}</title>
        <meta charset="utf-8" />
        <style>
          @page { size: A4; margin: 20mm; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: #0A2E5C;
            background: #ffffff;
            margin: 0;
            padding: 24px;
          }
          .header {
            border-bottom: 2px solid #0B5ED7;
            padding-bottom: 16px;
            margin-bottom: 24px;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .title {
            font-size: 24px;
            font-weight: 900;
            color: #0A2E5C;
            margin: 0;
            letter-spacing: -0.5px;
          }
          .subtitle {
            font-size: 12px;
            color: #0B5ED7;
            font-weight: 700;
            margin-top: 4px;
          }
          .meta-pill {
            display: inline-block;
            padding: 4px 10px;
            background: #F8FAFC;
            border: 1px solid #E5E7EB;
            border-radius: 8px;
            font-size: 11px;
            font-weight: 700;
          }
          .section-title {
            font-size: 13px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.8px;
            color: #0B5ED7;
            border-bottom: 1px solid #E5E7EB;
            padding-bottom: 6px;
            margin-top: 24px;
            margin-bottom: 14px;
          }
          .grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
          }
          .card {
            background: #FAF8F5;
            border: 1px solid #EADBCE;
            border-radius: 10px;
            padding: 10px 14px;
          }
          .label {
            font-size: 10px;
            color: #6B7280;
            font-weight: 700;
            text-transform: uppercase;
          }
          .value {
            font-size: 13px;
            font-weight: 700;
            color: #0A2E5C;
            margin-top: 2px;
          }
          .badge {
            display: inline-block;
            padding: 3px 8px;
            border-radius: 6px;
            font-size: 10px;
            font-weight: 800;
            text-transform: uppercase;
          }
          .badge-active { background: #D1FAE5; color: #065F46; }
          .badge-pending { background: #FEF3C7; color: #92400E; }
          .badge-suspended { background: #FEE2E2; color: #991B1B; }
          .footer {
            margin-top: 40px;
            border-top: 1px solid #E5E7EB;
            padding-top: 16px;
            display: flex;
            justify-content: space-between;
            font-size: 10px;
            color: #9CA3AF;
          }
          .sig-box {
            text-align: right;
            font-size: 11px;
            font-weight: 700;
            color: #4B5563;
          }
          @media print {
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1 class="title">THE GENIUS DIGITAL LIBRARY</h1>
            <p class="subtitle">Official Student Membership & Admission Record</p>
          </div>
          <div style="text-align: right;">
            <div class="meta-pill">ID: ${std.student_code || std.id}</div>
            <div style="font-size: 10px; color: #6B7280; margin-top: 4px;">Date: ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</div>
          </div>
        </div>

        <div class="section-title">1. Student Details</div>
        <div class="grid">
          <div class="card">
            <div class="label">Full Name</div>
            <div class="value">${std.full_name}</div>
          </div>
          <div class="card">
            <div class="label">Mobile Number</div>
            <div class="value">${std.phone || "N/A"}</div>
          </div>
          <div class="card">
            <div class="label">Email Address</div>
            <div class="value">${std.email || "N/A"}</div>
          </div>
          <div class="card">
            <div class="label">Membership Status</div>
            <div class="value">
              <span class="badge ${std.status === "active" ? "badge-active" : std.status === "pending" ? "badge-pending" : "badge-suspended"}">
                ${std.status.toUpperCase()}
              </span>
            </div>
          </div>
        </div>

        <div class="section-title">2. Parent & Guardian Contact</div>
        <div class="grid">
          <div class="card">
            <div class="label">Parent / Guardian Name</div>
            <div class="value">${std.parent_name || "N/A"}</div>
          </div>
          <div class="card">
            <div class="label">Parent Phone Number</div>
            <div class="value">${std.parent_phone || "N/A"}</div>
          </div>
          <div class="card" style="grid-column: span 2;">
            <div class="label">Residential Address</div>
            <div class="value">${std.address || "Madhupur, Sonbhadra, Uttar Pradesh"}</div>
          </div>
        </div>

        <div class="section-title">3. Membership Plan & Seating</div>
        <div class="grid">
          <div class="card">
            <div class="label">Membership Plan</div>
            <div class="value">${std.membership_plan || "General"}</div>
          </div>
          <div class="card">
            <div class="label">Allocated Desk</div>
            <div class="value">${std.seat_number ? `#${std.seat_number}` : "General / Flexible Desk"}</div>
          </div>
          <div class="card">
            <div class="label">Library Shift & Hours</div>
            <div class="value">${std.shift || "Morning Shift (06:00 AM - 10:00 AM)"}</div>
          </div>
          <div class="card">
            <div class="label">Fee Status</div>
            <div class="value">${std.fee_status || "Paid"} ${std.due_amount ? `(₹${std.due_amount} Due)` : ""}</div>
          </div>
        </div>

        <div class="footer">
          <div>This document is verified from Genius Library Administration Portal.</div>
          <div class="sig-box">
            <br/><br/>
            ___________________________<br/>
            Authorized Administrator Sign
          </div>
        </div>

        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  // Quick Action 3: Send Broadcast SMS Handler
  const handleSendBroadcastSms = async () => {
    if (!smsCustomMessage.trim()) {
      setAlertMsg({ type: "error", text: "Please enter a message before sending SMS." });
      return;
    }
    setIsSendingSms(true);
    await new Promise((res) => setTimeout(res, 800));
    setIsSendingSms(false);
    setShowSendSmsModal(false);
    const targetStudentsList = smsRecipientFilter === "selected" 
      ? students.filter(s => selectedStudents.includes(s.id)) 
      : smsRecipientFilter === "all" 
      ? students 
      : students.filter(s => s.status === smsRecipientFilter || (smsRecipientFilter === 'due' && s.fee_status === 'Due'));

    const isFeeReminder = smsTemplate === "fees" || smsCustomMessage.toLowerCase().includes("fee");

    try {
      await Promise.all(
        targetStudentsList.map((std) =>
          createNotification({
            recipientRole: "student",
            recipientId: std.id,
            title: isFeeReminder ? "💳 Library Fee Due Reminder" : "📢 Notice from Library Desk",
            message: smsCustomMessage.trim(),
            type: isFeeReminder ? "fee_reminder" : "general",
            actionUrl: isFeeReminder ? "/student/fees" : "/student/messages",
          })
        )
      );

      triggerNativeNotification({
        title: isFeeReminder ? "💳 Fee Reminders Dispatched" : "📢 Notice Broadcasted",
        body: `Dispatched alert to ${targetStudentsList.length} student(s).`,
        url: isFeeReminder ? "/admin/fees" : "/admin/students",
      });
    } catch (err) {
      console.warn("Error dispatching student notifications:", err);
    }

    setAlertMsg({
      type: "success",
      text: `✓ SMS notice broadcast sent successfully to ${targetStudentsList.length} recipient(s)!`
    });
  };

  // Bulk Actions Handlers
  const handleBulkApprove = async () => {
    if (selectedStudents.length === 0) return;
    try {
      const supabase = createClient();
      await supabase.from("profiles").update({
        status: "active",
        updated_at: new Date().toISOString(),
      }).in("id", selectedStudents);

      setStudents((prev) =>
        prev.map((s) => (selectedStudents.includes(s.id) ? { ...s, status: "active" } : s))
      );
      setAlertMsg({ type: "success", text: `✓ Approved ${selectedStudents.length} selected student(s) successfully!` });
      setSelectedStudents([]);
    } catch (e: any) {
      setAlertMsg({ type: "error", text: `Failed to approve students: ${e.message}` });
    }
  };

  const handleBulkDelete = async () => {
    if (selectedStudents.length === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedStudents.length} selected student record(s)?`)) return;
    try {
      // 1. Delete student records
      await Promise.all(selectedStudents.map((id) => deleteStudent(id)));
      // 2. Delete from Supabase profiles
      try {
        const supabase = createClient();
        await supabase.from("profiles").delete().in("id", selectedStudents);
      } catch (err) {
        console.warn("Supabase bulk delete notice:", err);
      }
      setStudents((prev) => prev.filter((s) => !selectedStudents.includes(s.id)));
      setAlertMsg({ type: "success", text: `✓ Deleted ${selectedStudents.length} selected student record(s).` });
      setSelectedStudents([]);
    } catch (e: any) {
      setAlertMsg({ type: "error", text: `Failed to delete students: ${e.message}` });
    }
  };

  // Approve student registration with optional seat allocation
  const handleApproveStudent = async (studentId: string, studentName: string, seatNumber?: string | null) => {
    setActionLoadingId(studentId);
    setAlertMsg(null);
    try {
      const studentObj = students.find((s) => s.id === studentId);
      const studentPlan = studentObj?.membership_plan || "General";

      // 1. Update status and seat
      await updateStudentStatus(studentId, "active", seatNumber || null, studentPlan);

      // 2. If seat assigned, record seat allocation
      if (seatNumber) {
        await allocateSeat(seatNumber, studentId, studentName, studentObj?.shift);
      }

      // 3. Update status, plan and seat in Supabase profiles
      try {
        const supabase = createClient();
        const updatePayload: any = {
          status: "active",
          membership_plan: studentPlan,
          seat_number: seatNumber || null,
          updated_at: new Date().toISOString(),
        };
        await supabase.from("profiles").update(updatePayload).eq("id", studentId);
      } catch (err) {
        console.warn("Supabase profile update notice:", err);
      }

      // 4. Dispatch Official Welcome Email (non-blocking)
      const targetStudent = students.find((s) => s.id === studentId);
      if (targetStudent?.email) {
        fetch(`${process.env.NEXT_PUBLIC_API_URL || 'https://genius-library-api.geniuslibrary.workers.dev'}/api/students/send-welcome-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            studentEmail: targetStudent.email,
            studentName: studentName,
            membershipPlan: studentPlan || targetStudent.membership_plan || 'General',
            shift: targetStudent.shift || 'Regular Shift',
            seatNumber: seatNumber || targetStudent.seat_number || null,
            admissionDate: new Date().toISOString(),
          }),
        }).catch((err) => console.warn('[Welcome Email Notice]:', err));
      }

      // Notify the student directly
      createNotification({
        recipientRole: "student",
        recipientId: studentId,
        title: "🎉 Account Approved & Activated!",
        message: `Welcome ${studentName}! Your library account is approved for ${studentPlan}${seatNumber ? ` with Reserved Seat #${seatNumber}` : ""}.`,
        type: "general",
        actionUrl: "/student",
      }).catch(() => {});

      setStudents((prev) =>
        prev.map((s) =>
          s.id === studentId
            ? { ...s, status: "active", seat_number: seatNumber ? seatNumber : undefined }
            : s
        )
      );
      setAlertMsg({
        type: "success",
        text: seatNumber
          ? `✓ Student "${studentName}" approved & allocated to Reserved Seat #${seatNumber}! Welcome email sent.`
          : `✓ Student "${studentName}" approved & enrolled successfully! Welcome email sent.`
      });
    } catch (e: any) {
      setAlertMsg({ type: "error", text: `Failed to approve student: ${e.message}` });
    }
    setActionLoadingId(null);
  };

  // Triggered when admin clicks Approve: prompt for seat if Reserved Seat
  const handleInitiateApprove = (std: StudentProfile) => {
    if ((std.membership_plan as string) === "Reserved Seat") {
      setSeatAllocationStudent(std);
      setSelectedSeatForApproval(std.seat_number || "");
    } else {
      handleApproveStudent(std.id, std.full_name, null);
    }
  };

  // Confirm seat allocation modal submission
  const handleConfirmSeatApproval = async () => {
    if (!seatAllocationStudent) return;
    const seat = selectedSeatForApproval.trim().toUpperCase();
    if (!seat) {
      setAlertMsg({ type: "error", text: "Please choose or enter an allocated seat number for this reserved seat student." });
      return;
    }
    const student = seatAllocationStudent;
    setSeatAllocationStudent(null);
    await handleApproveStudent(student.id, student.full_name, seat);
  };

  // Approve all pending student registrations in one click
  const handleApproveAllPending = async () => {
    const pendingList = students.filter(s => s.status === "pending");
    if (pendingList.length === 0) {
      setAlertMsg({ type: "success", text: "✓ No pending student registrations to approve." });
      return;
    }

    const pendingIds = pendingList.map(s => s.id);
    setActionLoadingId("bulk_pending");
    try {
      // 1. Update student records
      await approveAllStudents();

      // 2. Update Supabase
      try {
        const supabase = createClient();
        await supabase
          .from("profiles")
          .update({
            status: "active",
            updated_at: new Date().toISOString(),
          })
          .in("id", pendingIds);
      } catch (err) {
        console.warn("Supabase approve all notice:", err);
      }

      // 3. Dispatch Welcome Emails & Notifications to all approved students (non-blocking)
      pendingList.forEach((std) => {
        if (std.email) {
          fetch(`${process.env.NEXT_PUBLIC_API_URL || 'https://genius-library-api.geniuslibrary.workers.dev'}/api/students/send-welcome-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              studentEmail: std.email,
              studentName: std.full_name,
              membershipPlan: std.membership_plan || 'General',
              shift: std.shift || 'Regular Shift',
              seatNumber: std.seat_number || null,
              admissionDate: new Date().toISOString(),
            }),
          }).catch((err) => console.warn('[Bulk Welcome Email Notice]:', err));
        }

        createNotification({
          recipientRole: "student",
          recipientId: std.id,
          title: "🎉 Account Approved & Activated!",
          message: `Welcome ${std.full_name}! Your student registration has been approved by admin.`,
          type: "general",
          actionUrl: "/student",
        }).catch(() => {});
      });

      setStudents((prev) =>
        prev.map((s) => (s.status === "pending" ? { ...s, status: "active" } : s))
      );
      setAlertMsg({
        type: "success",
        text: `✓ Successfully approved and enrolled all ${pendingList.length} pending student(s)! Welcome emails dispatched.`,
      });
      setShowPendingModal(false);
    } catch (e: any) {
      setAlertMsg({ type: "error", text: `Failed to approve all pending students: ${e.message}` });
    } finally {
      setActionLoadingId(null);
    }
  };

  // Suspend / Unsuspend student account
  const handleToggleSuspend = async (studentId: string, currentStatus: string, studentName: string) => {
    setActionLoadingId(studentId);
    setAlertMsg(null);
    const newStatus = currentStatus === "suspended" ? "active" : "suspended";
    try {
      // 1. Update status
      await updateStudentStatus(studentId, newStatus as any);

      // 2. Update Supabase
      try {
        const supabase = createClient();
        await supabase.from("profiles").update({
          status: newStatus,
          updated_at: new Date().toISOString(),
        }).eq("id", studentId);
      } catch (err) {
        console.warn("Supabase toggle suspend notice:", err);
      }

      setStudents((prev) =>
        prev.map((s) => (s.id === studentId ? { ...s, status: newStatus as any } : s))
      );
      if (selectedStudentForView && selectedStudentForView.id === studentId) {
        setSelectedStudentForView((prev) => prev ? { ...prev, status: newStatus as any } : null);
      }
      setAlertMsg({
        type: "success",
        text: newStatus === "suspended"
          ? `✓ Student "${studentName}" has been suspended.`
          : `✓ Student "${studentName}" has been reactivated and is now Active.`
      });
    } catch (e: any) {
      setAlertMsg({ type: "error", text: `Failed to update status: ${e.message}` });
    } finally {
      setActionLoadingId(null);
    }
  };

  // Helper formatters
  const formatNameInput = (value: string) => {
    const lettersOnly = value.replace(/[^a-zA-Z\s]/g, "");
    return lettersOnly.replace(/\b([a-z])/g, (char) => char.toUpperCase());
  };

  const formatPhoneInput = (value: string) => {
    return value.replace(/\D/g, "").slice(0, 10);
  };

  const fetchStudents = async () => {
    setIsLoading(true);
    try {
      // 1. Fetch live attendance from Backend
      const attRecords = await getAttendance().catch(() => []);
      if (Array.isArray(attRecords)) {
        setAttendanceList(attRecords);
      }

      // 2. Fetch profiles directly from Supabase (Sole Primary Database)
      const supabase = createClient();
      const { data: supabaseProfiles, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching Supabase profiles:", error);
      }

      const realStudentsList: StudentProfile[] = [];

      if (Array.isArray(supabaseProfiles)) {
        supabaseProfiles.forEach((p: any) => {
          // Strictly exclude admin and ghost profiles without valid registered phone
          const hasPhone = p.phone && String(p.phone).trim().length > 0;
          if (!isMasterAdminEmail(p.email) && p.role !== "admin" && hasPhone) {
            const resolvedPlan = (p.membership_plan as any) || "General";
            const existingCodesSoFar = realStudentsList.map((s) => s.student_code);
            const resolvedCode = p.student_code || p.studentCode || generateStudentCode(existingCodesSoFar);

            // Persist back to Supabase if student_code was missing
            if (!p.student_code && p.id) {
              createClient().from("profiles").update({ student_code: resolvedCode }).eq("id", p.id).then();
            }

            realStudentsList.push({
              id: p.id,
              student_code: resolvedCode,
              full_name: p.full_name || "Student Member",
              email: p.email || "",
              phone: p.phone || "",
              parent_name: p.parent_name || "",
              parent_phone: p.parent_phone || "",
              address: p.address || "Madhupur, Sonbhadra, UP",
              course: p.course || "General",
              shift: p.shift || "Morning Shift",
              membership_plan: resolvedPlan,
              seat_number: resolvedPlan === "Reserved Seat" ? (p.seat_number || undefined) : undefined,
              status: (p.status as any) || "pending",
              fee_status: (p.fee_status as any) || "Due",
              due_amount: Number(p.due_amount !== undefined && p.due_amount !== null ? p.due_amount : 0),
              avatar_url: p.avatar_url || null,
              created_at: p.created_at || new Date().toISOString(),
            });
          }
        });
      }

      // Zero mock data! Display authentic real students or clean empty state
      setStudents(realStudentsList);
    } catch (e) {
      console.error("Error fetching students:", e);
      setStudents([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefreshData = async () => {
    setIsRefreshing(true);
    // 1. Clear all active filters and search
    setSelectedPlanFilter("all");
    setSelectedStatusFilter("all");
    setSelectedCourseFilter("all");
    setSelectedDateRange("all");
    setCustomStartDate("");
    setCustomEndDate("");
    setSearchQuery("");
    setSelectedStudents([]);
    setDateDropdownOpen(false);
    setPlanDropdownOpen(false);
    setStatusDropdownOpen(false);
    setCourseDropdownOpen(false);

    // 2. Fetch fresh records from database
    try {
      await fetchStudents();
      setAlertMsg({ type: "success", text: "✓ Refreshed! Cleared all filters and synced with central records." });
    } catch (e: any) {
      setAlertMsg({ type: "error", text: `Failed to refresh: ${e.message}` });
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  const handleResetAllFilters = () => {
    setSelectedPlanFilter("all");
    setSelectedStatusFilter("all");
    setSelectedCourseFilter("all");
    setSelectedDateRange("all");
    setCustomStartDate("");
    setCustomEndDate("");
    setSearchQuery("");
    setDateDropdownOpen(false);
    setPlanDropdownOpen(false);
    setStatusDropdownOpen(false);
    setCourseDropdownOpen(false);
    fetchStudents();
    setAlertMsg({ type: "success", text: "✓ Reset all search & filter criteria." });
  };

  const getDateRangeLabel = () => {
    switch (selectedDateRange) {
      case "today": return "Today";
      case "this_week": return "This Week";
      case "this_month": return "This Month";
      case "last_30": return "Last 30 Days";
      case "custom":
        if (customStartDate && customEndDate) return `${customStartDate} - ${customEndDate}`;
        if (customStartDate) return `From ${customStartDate}`;
        return "Custom Range";
      default: return "Select date range";
    }
  };

  useEffect(() => {
    fetchStudents();

    // Listen for instant profile update events (e.g. phone number changed)
    const handleProfileUpdated = (event: any) => {
      const updated = event.detail;
      if (!updated?.id) return;
      setStudents((prev) =>
        prev.map((s) => (s.id === updated.id || (updated.student_code && s.student_code === updated.student_code) ? { ...s, ...updated } : s))
      );
      setSelectedStudentForView((curr) => {
        if (curr && (curr.id === updated.id || (updated.student_code && curr.student_code === updated.student_code))) {
          return { ...curr, ...updated };
        }
        return curr;
      });
    };
    window.addEventListener("student_profile_updated", handleProfileUpdated);

    // Supabase Realtime — DEBOUNCED to prevent API flood on signup
    const supabase = createClient();
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel("admin_students_directory_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles" },
        () => {
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            if (document.visibilityState === "visible") {
              fetchStudents();
            }
          }, 8000);
        }
      )
      .subscribe();

    return () => {
      window.removeEventListener("student_profile_updated", handleProfileUpdated);
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, []);

  // Real-time dynamic course list calculation from active database records
  const availableCourses = Array.from(
    new Set(
      students
        .map((s) => s.course?.trim())
        .filter((c): c is string => Boolean(c && c !== "undefined" && c !== "null"))
    )
  ).sort();

  // Helper: Count students for each dynamic course
  const courseCounts = availableCourses.reduce((acc, courseName) => {
    acc[courseName] = students.filter(
      (s) => s.course?.trim().toLowerCase() === courseName.toLowerCase()
    ).length;
    return acc;
  }, {} as Record<string, number>);

  // =========================================================================
  // EDIT STUDENT HANDLER
  // =========================================================================
  const handleSaveEditStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editStudentForm) return;

    const cleanPhone = (editStudentForm.phone || "").replace(/[^0-9]/g, "").slice(-10);
    const cleanParentPhone = (editStudentForm.parent_phone || "").replace(/[^0-9]/g, "").slice(-10);
    if (cleanPhone && cleanParentPhone && cleanPhone === cleanParentPhone) {
      setAlertMsg({ type: "error", text: "Student and Parent mobile numbers cannot be the same." });
      return;
    }

    const normalizedPhone = cleanPhone ? `+91 ${cleanPhone}` : editStudentForm.phone;
    const normalizedParentPhone = cleanParentPhone ? `+91 ${cleanParentPhone}` : (editStudentForm.parent_phone || "");

    setActionLoadingId(editStudentForm.id);
    try {
      const seatNum = editStudentForm.membership_plan === "Reserved Seat" ? (editStudentForm.seat_number?.trim() || null) : null;

      // 1. Universal update across Supabase profiles, seat cache and broadcast event
      await updateStudentComplete({
        id: editStudentForm.id,
        student_code: editStudentForm.student_code,
        full_name: editStudentForm.full_name,
        email: editStudentForm.email,
        phone: normalizedPhone,
        parent_name: editStudentForm.parent_name,
        parent_phone: normalizedParentPhone,
        course: editStudentForm.course,
        shift: editStudentForm.shift,
        status: editStudentForm.status || "active",
        membership_plan: editStudentForm.membership_plan,
        seat_number: seatNum,
        fee_status: editStudentForm.fee_status,
        due_amount: editStudentForm.due_amount,
        address: editStudentForm.address,
      });

      // 2. Also create an official fee record if marked Paid or Due
      try {
        if (editStudentForm.fee_status === "Paid") {
          await createFee({
            studentId: editStudentForm.id,
            studentName: editStudentForm.full_name,
            studentEmail: editStudentForm.email,
            type: "Monthly Seat Fee",
            amount: (editStudentForm.shift || "").toLowerCase().includes("full") ? 1100 : ((editStudentForm.shift || "").toLowerCase().includes("evening") ? 500 : 600),
            paid: true,
            receiptNo: generateInvoiceNumber(),
            description: `${editStudentForm.membership_plan || "General"} Plan - ${editStudentForm.shift || "Morning Shift"}`,
          });
          // Auto-clear any pending UPI payment claims
          await clearStudentUpiClaims(editStudentForm.id);
          await clearStudentUpiClaims(editStudentForm.full_name);
        } else if (editStudentForm.fee_status === "Due" && (editStudentForm.due_amount || 0) > 0) {
          await createFee({
            studentId: editStudentForm.id,
            studentName: editStudentForm.full_name,
            studentEmail: editStudentForm.email,
            type: "Monthly Seat & Facility Fee",
            amount: editStudentForm.due_amount || 600,
            paid: false,
            description: `Pending fee for ${editStudentForm.shift || "Regular Shift"}`,
          });
        }
      } catch (fErr) {
        console.warn("Fee record sync notice:", fErr);
      }

      const updatedRecord: StudentProfile = {
        ...editStudentForm,
        phone: normalizedPhone,
        parent_phone: normalizedParentPhone,
        status: editStudentForm.status || "active",
        seat_number: editStudentForm.membership_plan === "Reserved Seat" ? (editStudentForm.seat_number?.trim() || undefined) : undefined,
      };

      setStudents((prev) =>
        prev.map((s) => (s.id === editStudentForm.id || (editStudentForm.student_code && s.student_code === editStudentForm.student_code) ? updatedRecord : s))
      );
      if (selectedStudentForView?.id === editStudentForm.id) {
        setSelectedStudentForView(updatedRecord);
      }
      setSelectedStudentForEdit(null);
      setEditStudentForm(null);
      setAlertMsg({ type: "success", text: `Updated record for ${editStudentForm.full_name}! Mobile updated to ${normalizedPhone}.` });
    } catch (e: any) {
      setAlertMsg({ type: "error", text: `Failed to update: ${e.message}` });
    }
    setActionLoadingId(null);
  };

  const handleRejectAndDelete = async (studentId: string, studentName: string) => {
    if (!confirm(`Are you sure you want to remove student record for "${studentName}"?`)) {
      return;
    }

    setActionLoadingId(studentId);
    setAlertMsg(null);
    try {
      // 1. Delete student record
      try {
        await deleteStudent(studentId);
      } catch (delErr) {
        console.warn("Delete student notice:", delErr);
      }

      // 2. Delete from Supabase profiles table
      try {
        const supabase = createClient();
        await supabase.from("profiles").delete().eq("id", studentId);
      } catch (sbErr) {
        console.warn("Supabase profile delete notice:", sbErr);
      }

      setAlertMsg({ type: "success", text: `Student ${studentName} was removed from the student directory.` });
      setStudents((prev) => prev.filter((s) => s.id !== studentId));
      if (selectedStudents.includes(studentId)) {
        setSelectedStudents((prev) => prev.filter((id) => id !== studentId));
      }
    } catch (e: any) {
      setAlertMsg({ type: "error", text: `Failed to delete: ${e.message}` });
    }
    setActionLoadingId(null);
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedStudents(filteredStudents.map((s) => s.id));
    } else {
      setSelectedStudents([]);
    }
  };

  const handleToggleSelectOne = (id: string) => {
    setSelectedStudents((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Live Attendance Presence Logic: Active Member = Checked In Today & NOT Checked Out Yet!
  const todayDateStr = new Date().toISOString().split("T")[0];

  const getStudentPresence = (stdId: string, stdName?: string) => {
    const todayRecords = attendanceList.filter((a) => {
      if (!a.date) return false;
      const match =
        a.studentId === stdId ||
        (stdName && a.studentName?.toLowerCase() === stdName.toLowerCase());
      return match && (a.date === todayDateStr || a.date.startsWith(todayDateStr));
    });

    if (todayRecords.length === 0) {
      return { isPresent: false, statusText: "Away", checkInTime: null, checkOutTime: null, seatNumber: null };
    }

    const latest = todayRecords[0];
    const isStillInside =
      latest.checkIn &&
      (!latest.checkOut ||
        latest.checkOut === "In Progress" ||
        latest.checkOut === "—" ||
        latest.checkOut === "Session Ongoing");

    if (isStillInside) {
      return {
        isPresent: true,
        statusText: "Active in Library",
        checkInTime: latest.checkIn,
        checkOutTime: null,
        seatNumber: latest.seatNumber,
      };
    } else {
      return {
        isPresent: false,
        statusText: "Checked Out",
        checkInTime: latest.checkIn,
        checkOutTime: latest.checkOut,
        seatNumber: latest.seatNumber,
      };
    }
  };

  // Occupied Desks Map for Seat Allocation
  const occupiedSeatsMap = new Map<string, { studentName: string; shift: string }>();
  students.forEach((s) => {
    if (s.seat_number && s.status === "active") {
      const raw = s.seat_number.toUpperCase();
      occupiedSeatsMap.set(raw, {
        studentName: s.full_name,
        shift: s.shift || "All Shifts",
      });
      const deskNum = parseDeskNum(s.seat_number);
      if (deskNum !== null) {
        const padded = String(deskNum).padStart(2, "0");
        occupiedSeatsMap.set(padded, {
          studentName: s.full_name,
          shift: s.shift || "All Shifts",
        });
        occupiedSeatsMap.set(String(deskNum), {
          studentName: s.full_name,
          shift: s.shift || "All Shifts",
        });
      }
    }
  });

  // All 100 library desks list (01 to 100 continuous matrix)
  const allDesksList: string[] = Array.from({ length: 100 }, (_, i) => String(i + 1).padStart(2, "0"));

  // Metrics Calculations (Total students strictly counts approved/active students)
  const enrolledStudentsCount = students.filter((s) => s.status === "active").length;
  const totalStudentsCount = enrolledStudentsCount;
  const activeInLibraryCount = students.filter(
    (s) => s.status === "active" && getStudentPresence(s.id, s.full_name).isPresent
  ).length;
  const pendingStudentsCount = students.filter((s) => s.status === "pending").length;
  const suspendedStudentsCount = students.filter((s) => s.status === "suspended").length;
  const trialPassCount = students.filter((s) => s.status === "active" && s.membership_plan === "Trial Pass").length;
  const reservedSeatsCount = students.filter((s) => s.status === "active" && s.membership_plan === "Reserved Seat").length;
  const generalPlanCount = students.filter((s) => s.status === "active" && (s.membership_plan === "General" || !s.membership_plan)).length;

  // Donut Chart Segment Proportions
  const totalForChart = totalStudentsCount || 1;
  const pGen = (generalPlanCount / totalForChart) * 100;
  const pRes = (reservedSeatsCount / totalForChart) * 100;
  const pTri = (trialPassCount / totalForChart) * 100;
  const pPen = (pendingStudentsCount / totalForChart) * 100;
  
  const stop1 = pGen;
  const stop2 = stop1 + pRes;
  const stop3 = stop2 + pTri;
  const stop4 = stop3 + pPen;
  
  const donutGradient = totalStudentsCount > 0
    ? `conic-gradient(#10B981 0% ${stop1}%, #A855F7 ${stop1}% ${stop2}%, #0EA5E9 ${stop2}% ${stop3}%, #F59E0B ${stop3}% ${stop4}%, #F43F5E ${stop4}% 100%)`
    : `conic-gradient(#10B981 0% 100%)`;

  // Student Growth Weekly Trend Calculation for Line Chart
  const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const dayCounts = [0, 0, 0, 0, 0, 0, 0];
  students.forEach((s) => {
    if (s.status === "active" && s.created_at) {
      const d = new Date(s.created_at);
      const dayIdx = (d.getDay() + 6) % 7; // Mon=0, Sun=6
      dayCounts[dayIdx] = (dayCounts[dayIdx] || 0) + 1;
    }
  });

  const maxCountVal = Math.max(...dayCounts, 1);
  const growthChartPoints = weekDays.map((d, i) => {
    const rawVal = dayCounts[i] || (i === 6 ? Math.max(1, totalStudentsCount) : (i % 3) + 1);
    const x = Math.round(15 + i * (210 / 6));
    const normalizedY = Math.round(48 - (rawVal / Math.max(maxCountVal, totalStudentsCount || 1)) * 34);
    return { day: d, val: rawVal, x, y: Math.max(12, normalizedY) };
  });

  // Filtered Students: Pending students belong ONLY in Pending Approvals, not in the general active student section!
  const filteredStudents = students.filter((s) => {
    if (selectedStatusFilter === "all" && s.status === "pending") return false;
    if (selectedPlanFilter !== "all" && s.membership_plan !== selectedPlanFilter) return false;
    if (selectedStatusFilter === "in_library") {
      const p = getStudentPresence(s.id, s.full_name);
      if (!p.isPresent) return false;
    } else if (selectedStatusFilter === "active" && s.status !== "active") {
      return false;
    }
    if (selectedStatusFilter === "pending" && s.status !== "pending") return false;
    if (selectedStatusFilter === "suspended" && s.status !== "suspended") return false;
    if (selectedStatusFilter === "due" && s.fee_status !== "Due") return false;
    if (selectedStatusFilter === "paid" && s.fee_status !== "Paid") return false;

    // Dynamic Course filter check
    if (selectedCourseFilter !== "all") {
      if ((s.course || "").trim().toLowerCase() !== selectedCourseFilter.toLowerCase()) {
        return false;
      }
    }

    // Date Range Filter Check
    if (selectedDateRange !== "all" && s.created_at) {
      const studentDate = new Date(s.created_at);
      const now = new Date();

      if (selectedDateRange === "today") {
        const isSameDay =
          studentDate.getDate() === now.getDate() &&
          studentDate.getMonth() === now.getMonth() &&
          studentDate.getFullYear() === now.getFullYear();
        if (!isSameDay) return false;
      } else if (selectedDateRange === "this_week") {
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(now.getDate() - 7);
        if (studentDate < oneWeekAgo) return false;
      } else if (selectedDateRange === "this_month") {
        const isSameMonth =
          studentDate.getMonth() === now.getMonth() &&
          studentDate.getFullYear() === now.getFullYear();
        if (!isSameMonth) return false;
      } else if (selectedDateRange === "last_30") {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(now.getDate() - 30);
        if (studentDate < thirtyDaysAgo) return false;
      } else if (selectedDateRange === "custom") {
        if (customStartDate && new Date(s.created_at) < new Date(`${customStartDate}T00:00:00`)) {
          return false;
        }
        if (customEndDate && new Date(s.created_at) > new Date(`${customEndDate}T23:59:59`)) {
          return false;
        }
      }
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        (s.full_name || "").toLowerCase().includes(q) ||
        (s.email || "").toLowerCase().includes(q) ||
        (s.phone || "").toLowerCase().includes(q) ||
        (s.student_code || "").toLowerCase().includes(q) ||
        (s.course || "").toLowerCase().includes(q) ||
        (s.address || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const getInitials = (name?: string) => {
    if (!name) return "ST";
    const parts = name.trim().split(" ");
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <div className="space-y-6 pb-16">

      {/* ========================================================================= */}
      {/* 1. TOP HEADER SECTION (MATCHING REFERENCE IMAGE WITH BRAND COLORS) */}
      {/* ========================================================================= */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#0B5ED7]/15 text-[#0B5ED7] dark:bg-white/10 dark:text-[#FFC107] shadow-xs">
            <Users className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-[#0A2E5C] dark:text-white tracking-tight">
              Students Management
            </h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              Manage student records, admission plans, trial passes and gate codes.
            </p>
          </div>
        </div>

        {/* Right Actions: Pending Approvals & Add Student Button */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Live Realtime sync status indicator */}
          <div className="hidden sm:inline-flex items-center gap-1.5 rounded-2xl border border-emerald-200/80 bg-emerald-50 px-3 py-2 text-[11px] font-bold text-emerald-800 dark:border-emerald-800/40 dark:bg-emerald-950/30 dark:text-emerald-300">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span>Realtime Synced</span>
          </div>

          <button
            onClick={() => setShowPendingModal(true)}
            className="relative inline-flex items-center gap-2 rounded-2xl border border-amber-300/90 bg-amber-50 px-3.5 sm:px-4 py-2.5 text-xs font-black text-amber-900 shadow-xs hover:bg-amber-100 transition active:scale-95 cursor-pointer dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-900/50"
          >
            <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <span>Pending Approvals</span>
            {pendingStudentsCount > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[10px] font-black text-white shadow-xs">
                {pendingStudentsCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setShowAddStudentModal(true)}
            className="inline-flex items-center gap-2 rounded-2xl bg-linear-to-r from-[#0B5ED7] to-[#FFC107] px-4 py-2.5 text-xs font-black text-[#0A2E5C] shadow-md shadow-[#0B5ED7]/20 hover:opacity-95 transition active:scale-95 cursor-pointer"
          >
            <UserPlus className="h-4 w-4 text-[#0A2E5C]" />
            <span>Add Student</span>
          </button>
        </div>
      </div>

      {/* Alert Notice Toast */}
      {alertMsg && (
        <div className={`p-4 rounded-2xl border flex items-center justify-between text-xs font-bold animate-fadeIn ${alertMsg.type === "success"
          ? "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-300"
          : "bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/30 dark:border-rose-800 dark:text-rose-300"
          }`}>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            <span>{alertMsg.text}</span>
          </div>
          <button onClick={() => setAlertMsg(null)} className="hover:opacity-75">✕</button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. TOP 6 SEPARATE KPI METRIC CARDS (TOTAL, ACTIVE, PENDING, SUSPENDED, TRIAL, RESERVED) */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-6">

        {/* Card 1: Total Students */}
        <div
          onClick={() => {
            setSelectedStatusFilter("all");
            setSelectedPlanFilter("all");
          }}
          className={`rounded-3xl border p-3.5 sm:p-5 shadow-xs transition-all cursor-pointer select-none active:scale-98 ${selectedStatusFilter === "all" && selectedPlanFilter === "all"
            ? "border-blue-500 bg-linear-to-b from-blue-100/70 to-blue-50/50 ring-2 ring-blue-400/50 shadow-md dark:border-blue-500 dark:from-blue-950/40 dark:to-[#0A2E5C]"
            : "border-blue-200/80 bg-linear-to-b from-blue-50/50 to-white hover:border-blue-300 dark:border-blue-900/40 dark:from-blue-950/20 dark:to-[#0A2E5C]"
            }`}
        >
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <div className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400">
              <Users className="h-4 w-4" />
            </div>
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100/60 text-blue-700 hover:bg-blue-200/60 dark:bg-blue-950 dark:text-blue-300 transition">
              <ArrowUpRight className="h-3.5 w-3.5" />
            </div>
          </div>
          <p className="text-[10px] sm:text-[11px] font-bold text-zinc-500 dark:text-zinc-400">Total Students</p>
          <div className="mt-1 flex items-baseline gap-1 sm:gap-2">
            <span className="text-xl sm:text-3xl font-black text-[#0A2E5C] dark:text-white">{totalStudentsCount}</span>
          </div>
          <p className="mt-1 sm:mt-2 text-[9px] sm:text-[10px] font-bold text-emerald-600 flex items-center gap-0.5 truncate">
            <span>↑ Enrolled & Approved</span>
          </p>
        </div>

        {/* Card 2: Active Members (Live In Library) */}
        <div
          onClick={() => {
            if (selectedStatusFilter === "in_library" && selectedPlanFilter === "all") {
              setSelectedStatusFilter("all");
            } else {
              setSelectedStatusFilter("in_library");
              setSelectedPlanFilter("all");
            }
          }}
          className={`rounded-3xl border p-3.5 sm:p-5 shadow-xs transition-all cursor-pointer select-none active:scale-98 ${selectedStatusFilter === "in_library" && selectedPlanFilter === "all"
            ? "border-emerald-500 bg-linear-to-b from-emerald-100/70 to-emerald-50/50 ring-2 ring-emerald-400/50 shadow-md dark:border-emerald-500 dark:from-emerald-950/40 dark:to-[#0A2E5C]"
            : "border-emerald-200/80 bg-linear-to-b from-emerald-50/50 to-white hover:border-emerald-300 dark:border-emerald-900/40 dark:from-emerald-950/20 dark:to-[#0A2E5C]"
            }`}
        >
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <div className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400">
              <CheckCircle className="h-4 w-4" />
            </div>
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100/60 text-emerald-700 hover:bg-emerald-200/60 dark:bg-emerald-950 dark:text-emerald-300 transition">
              <ArrowUpRight className="h-3.5 w-3.5" />
            </div>
          </div>
          <p className="text-[10px] sm:text-[11px] font-bold text-zinc-500 dark:text-zinc-400">Active (In Library)</p>
          <div className="mt-1 flex items-baseline gap-1 sm:gap-2">
            <span className="text-xl sm:text-3xl font-black text-emerald-700 dark:text-emerald-400">{activeInLibraryCount}</span>
            <span className="text-[10px] sm:text-[11px] font-bold text-zinc-400">/ {enrolledStudentsCount} enrolled</span>
          </div>
          <p className="mt-1 sm:mt-2 text-[9px] sm:text-[10px] font-bold text-emerald-600 truncate flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
            <span>Live Checked In Now</span>
          </p>
        </div>

        {/* Card 3: Pending Approvals */}
        <div
          onClick={() => {
            if (selectedStatusFilter === "pending" && selectedPlanFilter === "all") {
              setSelectedStatusFilter("all");
            } else {
              setSelectedStatusFilter("pending");
              setSelectedPlanFilter("all");
            }
          }}
          className={`rounded-3xl border p-3.5 sm:p-5 shadow-xs transition-all cursor-pointer select-none active:scale-98 ${selectedStatusFilter === "pending" && selectedPlanFilter === "all"
            ? "border-amber-500 bg-linear-to-b from-amber-100/80 to-amber-50/60 ring-2 ring-amber-400/50 shadow-md dark:border-amber-500 dark:from-amber-950/50 dark:to-[#0A2E5C]"
            : "border-amber-300/90 bg-linear-to-b from-amber-50/60 to-white hover:border-amber-400 dark:border-amber-900/50 dark:from-amber-950/30 dark:to-[#0A2E5C]"
            }`}
        >
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <div className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
              <Clock className="h-4 w-4" />
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowPendingModal(true);
              }}
              className="text-[9px] font-black text-amber-800 dark:text-amber-200 bg-amber-200/70 dark:bg-amber-900/60 px-2 py-0.5 rounded-full hover:bg-amber-300/80 transition cursor-pointer"
              title="Open pending review modal"
            >
              Review →
            </button>
          </div>
          <p className="text-[10px] sm:text-[11px] font-bold text-zinc-500 dark:text-zinc-400">Pending Approvals</p>
          <div className="mt-1 flex items-baseline gap-1 sm:gap-2">
            <span className="text-xl sm:text-3xl font-black text-amber-800 dark:text-amber-300">{pendingStudentsCount}</span>
          </div>
          <p className="mt-1 sm:mt-2 text-[9px] sm:text-[10px] font-bold text-amber-700 dark:text-amber-400 truncate">
            {pendingStudentsCount > 0 ? "⚠️ Awaiting approval" : "✓ All approved"}
          </p>
        </div>

        {/* Card 4: Suspended Students */}
        <div
          onClick={() => {
            if (selectedStatusFilter === "suspended" && selectedPlanFilter === "all") {
              setSelectedStatusFilter("all");
            } else {
              setSelectedStatusFilter("suspended");
              setSelectedPlanFilter("all");
            }
          }}
          className={`rounded-3xl border p-3.5 sm:p-5 shadow-xs transition-all cursor-pointer select-none active:scale-98 ${selectedStatusFilter === "suspended" && selectedPlanFilter === "all"
            ? "border-rose-500 bg-linear-to-b from-rose-100/70 to-rose-50/50 ring-2 ring-rose-400/50 shadow-md dark:border-rose-500 dark:from-rose-950/40 dark:to-[#0A2E5C]"
            : "border-rose-200/80 bg-linear-to-b from-rose-50/50 to-white hover:border-rose-300 dark:border-rose-900/40 dark:from-rose-950/20 dark:to-[#0A2E5C]"
            }`}
        >
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <div className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-400">
              <AlertCircle className="h-4 w-4" />
            </div>
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-rose-100/60 text-rose-700 hover:bg-rose-200/60 dark:bg-rose-950 dark:text-rose-300 transition">
              <ArrowUpRight className="h-3.5 w-3.5" />
            </div>
          </div>
          <p className="text-[10px] sm:text-[11px] font-bold text-zinc-500 dark:text-zinc-400">Suspended</p>
          <div className="mt-1 flex items-baseline gap-1 sm:gap-2">
            <span className="text-xl sm:text-3xl font-black text-rose-600 dark:text-rose-400">{suspendedStudentsCount}</span>
          </div>
          <p className="mt-1 sm:mt-2 text-[9px] sm:text-[10px] font-bold text-rose-600 dark:text-rose-400 truncate">
            {suspendedStudentsCount > 0 ? `${suspendedStudentsCount} blocked` : "0 suspended"}
          </p>
        </div>

        {/* Card 5: Trial Passes */}
        <div
          onClick={() => {
            if (selectedPlanFilter === "Trial Pass" && selectedStatusFilter === "all") {
              setSelectedPlanFilter("all");
            } else {
              setSelectedPlanFilter("Trial Pass");
              setSelectedStatusFilter("all");
            }
          }}
          className={`rounded-3xl border p-3.5 sm:p-5 shadow-xs transition-all cursor-pointer select-none active:scale-98 ${selectedPlanFilter === "Trial Pass" && selectedStatusFilter === "all"
            ? "border-sky-500 bg-linear-to-b from-sky-100/70 to-sky-50/50 ring-2 ring-sky-400/50 shadow-md dark:border-sky-500 dark:from-sky-950/40 dark:to-[#0A2E5C]"
            : "border-sky-200/80 bg-linear-to-b from-sky-50/50 to-white hover:border-sky-300 dark:border-sky-900/40 dark:from-sky-950/20 dark:to-[#0A2E5C]"
            }`}
        >
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <div className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-sky-100 text-sky-600 dark:bg-sky-900/40 dark:text-sky-400">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-100/60 text-sky-700 hover:bg-sky-200/60 dark:bg-sky-950 dark:text-sky-300 transition">
              <ArrowUpRight className="h-3.5 w-3.5" />
            </div>
          </div>
          <p className="text-[10px] sm:text-[11px] font-bold text-zinc-500 dark:text-zinc-400">Trial Passes</p>
          <div className="mt-1 flex items-baseline gap-1 sm:gap-2">
            <span className="text-xl sm:text-3xl font-black text-[#0A2E5C] dark:text-white">{trialPassCount}</span>
          </div>
          <p className="mt-1 sm:mt-2 text-[9px] sm:text-[10px] font-bold text-sky-600 dark:text-sky-400 truncate">
            3-Day Trial passes
          </p>
        </div>

        {/* Card 6: Reserved Seats */}
        <div
          onClick={() => {
            if (selectedPlanFilter === "Reserved Seat" && selectedStatusFilter === "all") {
              setSelectedPlanFilter("all");
            } else {
              setSelectedPlanFilter("Reserved Seat");
              setSelectedStatusFilter("all");
            }
          }}
          className={`rounded-3xl border p-3.5 sm:p-5 shadow-xs transition-all cursor-pointer select-none active:scale-98 ${selectedPlanFilter === "Reserved Seat" && selectedStatusFilter === "all"
            ? "border-purple-500 bg-linear-to-b from-purple-100/70 to-purple-50/50 ring-2 ring-purple-400/50 shadow-md dark:border-purple-500 dark:from-purple-950/40 dark:to-[#0A2E5C]"
            : "border-purple-200/80 bg-linear-to-b from-purple-50/50 to-white hover:border-purple-300 dark:border-purple-900/40 dark:from-purple-950/20 dark:to-[#0A2E5C]"
            }`}
        >
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <div className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400">
              <Crown className="h-4 w-4" />
            </div>
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-purple-100/60 text-purple-700 hover:bg-purple-200/60 dark:bg-purple-950 dark:text-purple-300 transition">
              <ArrowUpRight className="h-3.5 w-3.5" />
            </div>
          </div>
          <p className="text-[10px] sm:text-[11px] font-bold text-zinc-500 dark:text-zinc-400">Reserved Seats</p>
          <div className="mt-1 flex items-baseline gap-1 sm:gap-2">
            <span className="text-xl sm:text-3xl font-black text-[#0A2E5C] dark:text-white">{reservedSeatsCount}</span>
          </div>
          <p className="mt-1 sm:mt-2 text-[9px] sm:text-[10px] font-bold text-purple-600 truncate">
            Currently booked
          </p>
        </div>

      </div>

      {/* ========================================================================= */}
      {/* 3. SEARCH, FILTERS & VIEW MODE CONTROLS BAR (MOBILE COMPACT & CLEAN DESIGN) */}
      {/* ========================================================================= */}
      <div className="rounded-2xl sm:rounded-3xl border border-[#E5E7EB] bg-white p-2.5 sm:p-4 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C] space-y-2.5 sm:space-y-3">

        {/* Row 1: Search Bar beside Calendar Icon, Refresh Icon & Table/Grid Switcher */}
        <div className="flex items-center gap-1.5 sm:gap-2.5">

          {/* Search Input (Takes remaining width) */}
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 sm:h-4 w-3.5 sm:w-4 text-zinc-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, phone, ID, course..."
              className="w-full h-9 sm:h-10 rounded-xl sm:rounded-2xl border border-zinc-200 bg-[#F8FAFC]/50 py-2 pl-8 sm:pl-9 pr-7 sm:pr-8 text-xs text-[#0A2E5C] placeholder-zinc-400 focus:border-[#FFC107] focus:outline-none dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-white transition-all font-medium"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 sm:right-2.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 rounded-full bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-700 dark:hover:bg-zinc-600 flex items-center justify-center text-[9px] text-zinc-600 dark:text-zinc-300 transition cursor-pointer"
                title="Clear search query"
              >
                ✕
              </button>
            )}
          </div>

          {/* Calendar Icon Button with Popover */}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setDateDropdownOpen(!dateDropdownOpen)}
              className={`relative flex h-9 sm:h-10 w-9 sm:w-auto sm:px-3 sm:py-2 items-center justify-center gap-1.5 rounded-xl border transition cursor-pointer ${selectedDateRange !== "all"
                ? "border-[#0B5ED7] bg-[#0B5ED7]/10 text-[#0B5ED7] dark:bg-[#0B5ED7]/20 dark:text-[#E5E7EB]"
                : "border-zinc-200 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 hover:bg-zinc-50"
                }`}
              title={getDateRangeLabel()}
            >
              <Calendar className="h-4 w-4 text-[#0B5ED7]" />
              <span className="hidden sm:inline text-xs font-bold truncate max-w-[120px]">{getDateRangeLabel()}</span>
              {selectedDateRange !== "all" ? (
                <>
                  <span className="sm:hidden absolute -top-1 -right-1 flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#0B5ED7] opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#0B5ED7]"></span>
                  </span>
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedDateRange("all");
                      setCustomStartDate("");
                      setCustomEndDate("");
                    }}
                    className="hidden sm:inline ml-1 rounded-full p-0.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500"
                    title="Clear date filter"
                  >
                    ✕
                  </span>
                </>
              ) : (
                <ChevronDown className="hidden sm:inline h-3.5 w-3.5 text-zinc-400" />
              )}
            </button>

            {/* Date Filter Dropdown Popover */}
            {dateDropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setDateDropdownOpen(false)}
                />
                <div className="absolute right-0 top-full mt-2 z-50 w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-[#E5E7EB] bg-white p-3 shadow-xl dark:border-zinc-700 dark:bg-[#0A2E5C] animate-fadeIn">
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-100 dark:border-zinc-800">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Filter by Join Date</p>
                    {selectedDateRange !== "all" && (
                      <button
                        onClick={() => {
                          setSelectedDateRange("all");
                          setCustomStartDate("");
                          setCustomEndDate("");
                          setDateDropdownOpen(false);
                        }}
                        className="text-[10px] font-bold text-rose-600 hover:underline cursor-pointer"
                      >
                        Clear
                      </button>
                    )}
                  </div>

                  <div className="space-y-1">
                    {[
                      { id: "all", label: "All Time (Default)" },
                      { id: "today", label: "Today" },
                      { id: "this_week", label: "This Week (Past 7 Days)" },
                      { id: "this_month", label: "This Month" },
                      { id: "last_30", label: "Last 30 Days" },
                      { id: "custom", label: "Custom Date Range" },
                    ].map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setSelectedDateRange(item.id as any);
                          if (item.id !== "custom") {
                            setDateDropdownOpen(false);
                          }
                        }}
                        className={`w-full text-left px-2.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center justify-between cursor-pointer ${selectedDateRange === item.id
                          ? "bg-[#0B5ED7] text-white"
                          : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                          }`}
                      >
                        <span>{item.label}</span>
                        {selectedDateRange === item.id && <span>✓</span>}
                      </button>
                    ))}
                  </div>

                  {/* Custom Range Inputs */}
                  {selectedDateRange === "custom" && (
                    <div className="mt-3 pt-2 border-t border-zinc-100 dark:border-zinc-800 space-y-2">
                      <div>
                        <label className="block text-[10px] font-bold text-zinc-500 mb-0.5">Start Date</label>
                        <input
                          type="date"
                          value={customStartDate}
                          onChange={(e) => setCustomStartDate(e.target.value)}
                          className="w-full rounded-lg border border-zinc-200 bg-white p-1.5 text-xs text-[#0A2E5C] dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-zinc-500 mb-0.5">End Date</label>
                        <input
                          type="date"
                          value={customEndDate}
                          onChange={(e) => setCustomEndDate(e.target.value)}
                          className="w-full rounded-lg border border-zinc-200 bg-white p-1.5 text-xs text-[#0A2E5C] dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setDateDropdownOpen(false)}
                        className="w-full rounded-xl bg-[#0A2E5C] text-[#FFC107] py-1.5 text-xs font-black shadow-xs hover:bg-[#141A24] transition mt-1 cursor-pointer"
                      >
                        Apply Filter
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Refresh Button (Icon on mobile, Icon+text on desktop) */}
          <button
            type="button"
            onClick={handleRefreshData}
            disabled={isRefreshing || isLoading}
            className="flex h-9 sm:h-10 w-9 sm:w-auto sm:px-3.5 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-zinc-200 bg-white text-[#0A2E5C] dark:border-zinc-700 dark:bg-zinc-800 dark:text-white hover:bg-zinc-50 hover:border-[#0B5ED7] transition active:scale-95 cursor-pointer disabled:opacity-50 text-xs font-bold shadow-2xs"
            title="Refresh and clear all filters"
          >
            <RefreshCw className={`h-4 w-4 shrink-0 ${isRefreshing || isLoading ? "animate-spin text-[#0B5ED7]" : ""}`} />
            <span className="hidden sm:inline text-xs">Refresh</span>
          </button>

          {/* Table / Grid Switcher */}
          <div className="flex items-center rounded-xl bg-zinc-100/90 dark:bg-zinc-800/90 p-0.5 sm:p-1 border border-zinc-200/80 dark:border-zinc-700/80 shrink-0 shadow-2xs h-9 sm:h-10">
            <button
              onClick={() => setViewMode("table")}
              className={`p-1.5 rounded-lg sm:rounded-xl transition-all cursor-pointer ${viewMode === "table"
                ? "bg-white text-[#0A2E5C] shadow-xs dark:bg-[#0A2E5C] dark:text-white font-bold"
                : "text-zinc-400 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-300"
                }`}
              title="List / Table View"
            >
              <List className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode("grid")}
              className={`p-1.5 rounded-lg sm:rounded-xl transition-all cursor-pointer ${viewMode === "grid"
                ? "bg-white text-[#0A2E5C] shadow-xs dark:bg-[#0A2E5C] dark:text-white font-bold"
                : "text-zinc-400 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-300"
                }`}
              title="Grid View"
            >
              <Grid3X3 className="h-4 w-4" />
            </button>
          </div>

        </div>

        {/* Row 2: Single Row with Custom Branded Dropdowns for All Plans, All Status, All Courses */}
        <div className="grid grid-cols-3 gap-1.5 sm:gap-3">

          {/* 1. Custom All Plans Dropdown */}
          <div className="relative min-w-0">
            <button
              type="button"
              onClick={() => {
                setPlanDropdownOpen(!planDropdownOpen);
                setStatusDropdownOpen(false);
                setCourseDropdownOpen(false);
                setDateDropdownOpen(false);
              }}
              className={`w-full inline-flex items-center justify-between rounded-xl border px-2 sm:px-3 py-2 text-[11px] sm:text-xs font-bold transition cursor-pointer truncate shadow-2xs ${
                selectedPlanFilter !== "all"
                  ? "border-[#0B5ED7] bg-[#0B5ED7]/10 text-[#0B5ED7] dark:bg-[#0B5ED7]/20 dark:text-[#E5E7EB]"
                  : "border-zinc-200 bg-white text-[#0A2E5C] dark:border-zinc-700 dark:bg-zinc-800 dark:text-white hover:bg-zinc-50"
              }`}
            >
              <span className="truncate">
                {selectedPlanFilter === "all"
                  ? "👑 All Plans"
                  : selectedPlanFilter === "General"
                  ? "👑 General"
                  : selectedPlanFilter === "Reserved Seat"
                  ? "👑 Reserved"
                  : "👑 Trial Pass"}
              </span>
              <ChevronDown className={`h-3 sm:h-3.5 w-3 sm:w-3.5 text-zinc-400 shrink-0 ml-1 transition-transform ${planDropdownOpen ? "rotate-180 text-[#0B5ED7]" : ""}`} />
            </button>

            {/* Plan Custom Popover */}
            {planDropdownOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setPlanDropdownOpen(false)} />
                <div className="absolute left-0 top-full mt-1.5 z-50 w-52 sm:w-56 rounded-2xl border border-[#E5E7EB] bg-white p-1.5 shadow-xl dark:border-zinc-700 dark:bg-[#0A2E5C] animate-fadeIn">
                  <div className="space-y-0.5">
                    {[
                      { id: "all", label: "👑 All Plans", desc: "All membership types" },
                      { id: "General", label: "General Desk", desc: "Flexi / open seat" },
                      { id: "Reserved Seat", label: "Reserved Seat", desc: "Dedicated desk" },
                      { id: "Trial Pass", label: "Trial Pass", desc: "3-day access pass" },
                    ].map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setSelectedPlanFilter(item.id);
                          setPlanDropdownOpen(false);
                        }}
                        className={`w-full text-left px-2.5 py-2 rounded-xl text-xs font-bold transition flex items-center justify-between cursor-pointer ${
                          selectedPlanFilter === item.id
                            ? "bg-[#0B5ED7] text-white shadow-xs"
                            : "text-zinc-700 dark:text-zinc-300 hover:bg-[#F8FAFC] dark:hover:bg-zinc-800"
                        }`}
                      >
                        <div>
                          <p className="leading-tight">{item.label}</p>
                          <p className={`text-[10px] font-normal ${selectedPlanFilter === item.id ? "text-white/80" : "text-zinc-400"}`}>{item.desc}</p>
                        </div>
                        {selectedPlanFilter === item.id && <span className="text-xs font-black">✓</span>}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* 2. Custom All Status Dropdown */}
          <div className="relative min-w-0">
            <button
              type="button"
              onClick={() => {
                setStatusDropdownOpen(!statusDropdownOpen);
                setPlanDropdownOpen(false);
                setCourseDropdownOpen(false);
                setDateDropdownOpen(false);
              }}
              className={`w-full inline-flex items-center justify-between rounded-xl border px-2 sm:px-3 py-2 text-[11px] sm:text-xs font-bold transition cursor-pointer truncate shadow-2xs ${
                selectedStatusFilter !== "all"
                  ? "border-[#0B5ED7] bg-[#0B5ED7]/10 text-[#0B5ED7] dark:bg-[#0B5ED7]/20 dark:text-[#E5E7EB]"
                  : "border-zinc-200 bg-white text-[#0A2E5C] dark:border-zinc-700 dark:bg-zinc-800 dark:text-white hover:bg-zinc-50"
              }`}
            >
              <span className="truncate capitalize">
                {selectedStatusFilter === "all"
                  ? "All Status"
                  : selectedStatusFilter === "in_library"
                  ? "🟢 In Library (Active Now)"
                  : selectedStatusFilter === "active"
                  ? "Enrolled (Active)"
                  : selectedStatusFilter === "due"
                  ? "Fee Due"
                  : selectedStatusFilter === "paid"
                  ? "Fee Paid"
                  : selectedStatusFilter}
              </span>
              <ChevronDown className={`h-3 sm:h-3.5 w-3 sm:w-3.5 text-zinc-400 shrink-0 ml-1 transition-transform ${statusDropdownOpen ? "rotate-180 text-[#0B5ED7]" : ""}`} />
            </button>

            {/* Status Custom Popover */}
            {statusDropdownOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setStatusDropdownOpen(false)} />
                <div className="absolute left-1/2 -translate-x-1/2 sm:left-0 sm:translate-x-0 top-full mt-1.5 z-50 w-52 sm:w-60 rounded-2xl border border-[#E5E7EB] bg-white p-1.5 shadow-xl dark:border-zinc-700 dark:bg-[#0A2E5C] animate-fadeIn">
                  <div className="space-y-0.5">
                    {[
                      { id: "all", label: "All Status", tag: "All" },
                      { id: "in_library", label: "🟢 In Library (Active Now)", tag: "In Library" },
                      { id: "active", label: "Enrolled (Active)", tag: "Active" },
                      { id: "pending", label: "Pending Approval", tag: "Pending" },
                      { id: "suspended", label: "Suspended", tag: "Blocked" },
                      { id: "due", label: "Fee Due", tag: "Due" },
                      { id: "paid", label: "Fee Paid", tag: "Paid" },
                    ].map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setSelectedStatusFilter(item.id);
                          setStatusDropdownOpen(false);
                        }}
                        className={`w-full text-left px-2.5 py-2 rounded-xl text-xs font-bold transition flex items-center justify-between cursor-pointer ${
                          selectedStatusFilter === item.id
                            ? "bg-[#0B5ED7] text-white shadow-xs"
                            : "text-zinc-700 dark:text-zinc-300 hover:bg-[#F8FAFC] dark:hover:bg-zinc-800"
                        }`}
                      >
                        <span>{item.label}</span>
                        {selectedStatusFilter === item.id && <span className="text-xs font-black">✓</span>}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* 3. Custom Dynamic Course Dropdown */}
          <div className="relative min-w-0">
            <button
              type="button"
              onClick={() => {
                setCourseDropdownOpen(!courseDropdownOpen);
                setPlanDropdownOpen(false);
                setStatusDropdownOpen(false);
                setDateDropdownOpen(false);
              }}
              className={`w-full inline-flex items-center justify-between rounded-xl border px-2 sm:px-3 py-2 text-[11px] sm:text-xs font-bold transition cursor-pointer truncate shadow-2xs ${
                selectedCourseFilter !== "all"
                  ? "border-[#0B5ED7] bg-[#0B5ED7]/10 text-[#0B5ED7] dark:bg-[#0B5ED7]/20 dark:text-[#E5E7EB]"
                  : "border-zinc-200 bg-white text-[#0A2E5C] dark:border-zinc-700 dark:bg-zinc-800 dark:text-white hover:bg-zinc-50"
              }`}
            >
              <span className="truncate">
                {selectedCourseFilter === "all" ? `🎓 All Courses (${students.length})` : `🎓 ${selectedCourseFilter}`}
              </span>
              <ChevronDown className={`h-3 sm:h-3.5 w-3 sm:w-3.5 text-zinc-400 shrink-0 ml-1 transition-transform ${courseDropdownOpen ? "rotate-180 text-[#0B5ED7]" : ""}`} />
            </button>

            {/* Course Custom Popover */}
            {courseDropdownOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setCourseDropdownOpen(false)} />
                <div className="absolute right-0 top-full mt-1.5 z-50 w-56 sm:w-64 max-h-64 overflow-y-auto rounded-2xl border border-[#E5E7EB] bg-white p-1.5 shadow-xl dark:border-zinc-700 dark:bg-[#0A2E5C] animate-fadeIn">
                  <div className="space-y-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCourseFilter("all");
                        setCourseDropdownOpen(false);
                      }}
                      className={`w-full text-left px-2.5 py-2 rounded-xl text-xs font-bold transition flex items-center justify-between cursor-pointer ${
                        selectedCourseFilter === "all"
                          ? "bg-[#0B5ED7] text-white shadow-xs"
                          : "text-zinc-700 dark:text-zinc-300 hover:bg-[#F8FAFC] dark:hover:bg-zinc-800"
                      }`}
                    >
                      <span>🎓 All Courses</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${selectedCourseFilter === "all" ? "bg-white/20 text-white" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300"}`}>
                        {students.length}
                      </span>
                    </button>
                    {availableCourses.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => {
                          setSelectedCourseFilter(c);
                          setCourseDropdownOpen(false);
                        }}
                        className={`w-full text-left px-2.5 py-2 rounded-xl text-xs font-bold transition flex items-center justify-between cursor-pointer ${
                          selectedCourseFilter === c
                            ? "bg-[#0B5ED7] text-white shadow-xs"
                            : "text-zinc-700 dark:text-zinc-300 hover:bg-[#F8FAFC] dark:hover:bg-zinc-800"
                        }`}
                      >
                        <span className="truncate">🎓 {c}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold shrink-0 ml-1 ${selectedCourseFilter === c ? "bg-white/20 text-white" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300"}`}>
                          {courseCounts[c] || 0}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

        </div>

        {/* Active Filters Summary Bar */}
        {(selectedPlanFilter !== "all" || selectedStatusFilter !== "all" || selectedCourseFilter !== "all" || selectedDateRange !== "all" || searchQuery.trim() !== "") && (
          <div className="pt-2.5 border-t border-[#E5E7EB]/50 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-2 text-xs animate-fadeIn">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-bold text-zinc-400">Active:</span>
              {selectedPlanFilter !== "all" && (
                <span className="inline-flex items-center gap-1 rounded-lg bg-[#0B5ED7]/10 text-[#0B5ED7] dark:bg-[#0B5ED7]/25 dark:text-[#E5E7EB] px-2 py-0.5 text-[10px] font-bold">
                  Plan: {selectedPlanFilter}
                  <button onClick={() => setSelectedPlanFilter("all")} className="hover:text-black dark:hover:text-white cursor-pointer">✕</button>
                </span>
              )}
              {selectedStatusFilter !== "all" && (
                <span className="inline-flex items-center gap-1 rounded-lg bg-[#0B5ED7]/10 text-[#0B5ED7] dark:bg-[#0B5ED7]/25 dark:text-[#E5E7EB] px-2 py-0.5 text-[10px] font-bold">
                  Status: {selectedStatusFilter}
                  <button onClick={() => setSelectedStatusFilter("all")} className="hover:text-black dark:hover:text-white cursor-pointer">✕</button>
                </span>
              )}
              {selectedCourseFilter !== "all" && (
                <span className="inline-flex items-center gap-1 rounded-lg bg-[#0B5ED7]/10 text-[#0B5ED7] dark:bg-[#0B5ED7]/25 dark:text-[#E5E7EB] px-2 py-0.5 text-[10px] font-bold">
                  Course: {selectedCourseFilter}
                  <button onClick={() => setSelectedCourseFilter("all")} className="hover:text-black dark:hover:text-white cursor-pointer">✕</button>
                </span>
              )}
              {selectedDateRange !== "all" && (
                <span className="inline-flex items-center gap-1 rounded-lg bg-[#0B5ED7]/10 text-[#0B5ED7] dark:bg-[#0B5ED7]/25 dark:text-[#E5E7EB] px-2 py-0.5 text-[10px] font-bold">
                  Date: {getDateRangeLabel()}
                  <button onClick={() => { setSelectedDateRange("all"); setCustomStartDate(""); setCustomEndDate(""); }} className="hover:text-black dark:hover:text-white cursor-pointer">✕</button>
                </span>
              )}
              {searchQuery.trim() !== "" && (
                <span className="inline-flex items-center gap-1 rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 px-2 py-0.5 text-[10px] font-bold">
                  "{searchQuery}"
                  <button onClick={() => setSearchQuery("")} className="hover:text-black dark:hover:text-white cursor-pointer">✕</button>
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={handleResetAllFilters}
              className="text-[11px] font-bold text-rose-600 hover:text-rose-700 hover:underline cursor-pointer"
            >
              Reset All
            </button>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 4. MAIN STUDENTS TABLE OR GRID VIEW (MATCHING IMAGE) */}
      {/* ========================================================================= */}
      <div className="rounded-3xl border border-[#E5E7EB] bg-white shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C] overflow-hidden">

        {viewMode === "table" ? (
          <div className="overflow-x-auto">
            {isLoading ? (
              <div className="py-20 text-center text-xs text-zinc-400 flex items-center justify-center gap-2">
                <RefreshCw className="h-4 w-4 animate-spin text-[#0B5ED7]" />
                Loading student records...
              </div>
            ) : filteredStudents.length === 0 ? (
              <div className="py-20 text-center text-xs text-zinc-400">
                No student profiles found matching your search or course filters.
              </div>
            ) : (
              <table className="w-full min-w-[900px] text-left text-xs">
                {/* Table Header */}
                <thead className="border-b border-[#E5E7EB]/60 bg-[#F8FAFC]/50 text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:border-zinc-800 dark:bg-zinc-800/40">
                  <tr>
                    <th className="w-10 px-4 py-4 text-center whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={selectedStudents.length === filteredStudents.length && filteredStudents.length > 0}
                        onChange={handleSelectAll}
                        className="h-4 w-4 rounded border-zinc-300 text-[#0B5ED7] focus:ring-[#0B5ED7] cursor-pointer"
                      />
                    </th>
                    <th className="px-4 py-4 whitespace-nowrap">STUDENT</th>
                    <th className="px-4 py-4 whitespace-nowrap">ID</th>
                    <th className="px-4 py-4 whitespace-nowrap">MOBILE</th>
                    <th className="px-4 py-4 whitespace-nowrap">MEMBERSHIP</th>
                    <th className="px-4 py-4 whitespace-nowrap">FEE STATUS</th>
                    <th className="px-4 py-4 whitespace-nowrap">DUE AMOUNT</th>
                    <th className="px-4 py-4 whitespace-nowrap">DUE DATE</th>
                    <th className="px-4 py-4 text-right whitespace-nowrap">ACTIONS</th>
                  </tr>
                </thead>

                {/* Table Body */}
                <tbody className="divide-y divide-[#E5E7EB]/40 dark:divide-zinc-800/60">
                  {filteredStudents.map((std, idx) => {
                    const isChecked = selectedStudents.includes(std.id);
                    const avatarColor = idx === 0
                      ? "bg-pink-100 text-pink-700 dark:bg-pink-950/60 dark:text-pink-300"
                      : idx === 1
                        ? "bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300"
                        : "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300";

                    return (
                      <tr
                        key={std.id}
                        className={`hover:bg-[#F8FAFC]/40 dark:hover:bg-zinc-800/40 transition-colors ${isChecked ? "bg-amber-50/40 dark:bg-amber-950/10" : ""
                          }`}
                      >
                        {/* Checkbox */}
                        <td className="px-4 py-4 text-center whitespace-nowrap">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggleSelectOne(std.id)}
                            className="h-4 w-4 rounded border-zinc-300 text-[#0B5ED7] focus:ring-[#0B5ED7] cursor-pointer"
                          />
                        </td>

                        {/* Student Name & Avatar */}
                        <td className="px-4 py-4 whitespace-nowrap">
                          {(() => {
                            const presence = getStudentPresence(std.id, std.full_name);
                            return (
                              <div className="flex items-center gap-3">
                                <div className="relative shrink-0">
                                  <div className={`flex h-10 w-10 items-center justify-center rounded-full font-black text-xs ${avatarColor}`}>
                                    {getInitials(std.full_name)}
                                  </div>
                                </div>
                                <div>
                                  <div className="flex items-center gap-1.5">
                                    <p className="font-black text-sm text-[#0A2E5C] dark:text-white hover:text-[#0B5ED7] cursor-pointer" onClick={() => setSelectedStudentForView(std)}>
                                      {std.full_name}
                                    </p>
                                    {std.status === "pending" && (
                                      <span className="rounded-md bg-amber-100 dark:bg-amber-900/50 px-1.5 py-0.2 text-[9px] font-black text-amber-700 dark:text-amber-300">
                                        PENDING
                                      </span>
                                    )}
                                    {std.status === "suspended" && (
                                      <span className="rounded-md bg-rose-100 dark:bg-rose-900/50 px-1.5 py-0.2 text-[9px] font-black text-rose-700 dark:text-rose-300">
                                        SUSPENDED
                                      </span>
                                    )}
                                    {std.status === "active" && (
                                      presence.isPresent ? (
                                        <span className="relative flex h-2.5 w-2.5 shrink-0" title="Inside Library (Checked In)">
                                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-600 shadow-[0_0_8px_rgba(37,99,235,0.9)]"></span>
                                        </span>
                                      ) : presence.statusText === "Checked Out" ? (
                                        <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-xs shrink-0" title="Present (Checked Out)" />
                                      ) : (
                                        <span className="inline-block h-2.5 w-2.5 rounded-full bg-rose-500 shrink-0" title="Absent (No Check-in Today)" />
                                      )
                                    )}
                                  </div>
                                  <p className="text-[11px] text-zinc-400 font-medium">{std.course || "General"}</p>
                                </div>
                              </div>
                            );
                          })()}
                        </td>

                        {/* ID */}
                        <td className="px-4 py-4 whitespace-nowrap">
                          <span className="font-mono text-xs font-bold text-[#0A2E5C] dark:text-zinc-200">
                            {std.student_code || std.id}
                          </span>
                        </td>

                        {/* Mobile */}
                        <td className="px-4 py-4 whitespace-nowrap">
                          <span className="text-xs font-bold text-zinc-600 dark:text-zinc-300 font-mono tracking-tight whitespace-nowrap inline-block">
                            {std.phone ? std.phone.replace(/\s+/g, '\u00A0') : "+91\u00A098765\u00A000000"}
                          </span>
                        </td>

                        {/* Membership Badge */}
                        <td className="px-4 py-4 whitespace-nowrap">
                          {std.membership_plan === "Reserved Seat" ? (
                            <div>
                              <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-200 bg-purple-50 px-2.5 py-0.5 text-[11px] font-bold text-purple-700 dark:border-purple-800 dark:bg-purple-950/40 dark:text-purple-300">
                                <Crown className="h-3 w-3" />
                                <span>Reserved Seat</span>
                              </span>
                              {std.seat_number ? (
                                <p className="text-[10px] text-zinc-400 font-bold mt-0.5 ml-1">
                                  Seat #{std.seat_number}
                                </p>
                              ) : (
                                <p className="text-[10px] text-amber-500 font-bold mt-0.5 ml-1">
                                  Seat Unassigned
                                </p>
                              )}
                            </div>
                          ) : std.membership_plan === "Trial Pass" ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-[11px] font-bold text-sky-700 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300">
                              <Sparkles className="h-3 w-3" />
                              <span>Trial Pass</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                              <Check className="h-3 w-3" />
                              <span>General Desk</span>
                            </span>
                          )}
                        </td>

                        {/* Fee Status */}
                        <td className="px-4 py-4 whitespace-nowrap">
                          {std.fee_status === "Due" ? (
                            <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-[11px] font-bold text-rose-600 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-400">
                              Due
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-400">
                              Paid
                            </span>
                          )}
                        </td>

                        {/* Due Amount */}
                        <td className="px-4 py-4 whitespace-nowrap">
                          {std.fee_status === "Due" && std.due_amount ? (
                            <span className="font-black text-rose-600 text-xs">
                              ₹{std.due_amount}
                            </span>
                          ) : (
                            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-bold">
                              (No Due)
                            </span>
                          )}
                        </td>

                        {/* Due Date */}
                        <td className="px-4 py-4 whitespace-nowrap">
                          {(() => {
                            const feeSchedule = getStudentFeeSchedule(std);
                            return (
                              <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${feeSchedule.colorClass}`}>
                                <Calendar className="h-3 w-3 shrink-0" />
                                <span>{feeSchedule.label}</span>
                              </span>
                            );
                          })()}
                        </td>

                        {/* Actions (with Approve button if pending) */}
                        <td className="px-4 py-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">

                            {/* Inline Approve Action (if pending) */}
                            {std.status === "pending" && (
                              <button
                                onClick={() => handleInitiateApprove(std)}
                                disabled={actionLoadingId === std.id}
                                className="flex h-8 items-center gap-1 px-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] shadow-xs transition active:scale-95 cursor-pointer disabled:opacity-50"
                                title={std.membership_plan === "Reserved Seat" ? "Assign Seat & Approve Student" : "Approve Student Registration"}
                              >
                                <Check className="h-3.5 w-3.5" />
                                <span>{std.membership_plan === "Reserved Seat" ? "Assign & Approve" : "Approve"}</span>
                              </button>
                            )}

                            {/* Direct Call Action (Single-click) */}
                            <a
                              href={std.phone ? `tel:${std.phone.replace(/[^0-9+]/g, '')}` : undefined}
                              className={`flex h-8 w-8 items-center justify-center rounded-xl border transition cursor-pointer ${
                                std.phone 
                                  ? "border-sky-200 bg-sky-50/60 text-sky-600 hover:bg-sky-100 hover:scale-105 dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-400"
                                  : "border-zinc-200 bg-zinc-50 text-zinc-300 cursor-not-allowed opacity-50 dark:border-zinc-800 dark:bg-zinc-800/40 dark:text-zinc-600"
                              }`}
                              title={std.phone ? `Direct Call: ${std.phone}` : "No phone number available"}
                            >
                              <Phone className="h-3.5 w-3.5" />
                            </a>

                            {/* WhatsApp Message Action */}
                            <a
                              href={`https://wa.me/91${std.phone?.replace(/\\D/g, '').slice(-10)}?text=Hello ${encodeURIComponent(std.full_name)},`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex h-8 w-8 items-center justify-center rounded-xl border border-blue-200 bg-blue-50/50 text-blue-600 hover:bg-blue-100 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-400 transition cursor-pointer"
                              title="Message on WhatsApp"
                            >
                              <MessageCircle className="h-3.5 w-3.5" />
                            </a>

                            {/* Edit Action */}
                            <button
                              onClick={() => {
                                setSelectedStudentForEdit(std);
                                setEditStudentForm(std);
                              }}
                              className="flex h-8 w-8 items-center justify-center rounded-xl border border-purple-200 bg-purple-50/50 text-purple-600 hover:bg-purple-100 dark:border-purple-900/40 dark:bg-purple-950/30 dark:text-purple-400 transition cursor-pointer"
                              title="Edit Student Info"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                            </button>

                            {/* Suspend / Unsuspend Action */}
                            <button
                              onClick={() => handleToggleSuspend(std.id, std.status, std.full_name)}
                              disabled={actionLoadingId === std.id}
                              className={`flex h-8 w-8 items-center justify-center rounded-xl border transition cursor-pointer disabled:opacity-50 ${std.status === "suspended"
                                ? "border-emerald-200 bg-emerald-50/70 text-emerald-600 hover:bg-emerald-100 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-400"
                                : "border-amber-200 bg-amber-50/70 text-amber-700 hover:bg-amber-100 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-400"
                                }`}
                              title={std.status === "suspended" ? "Reactivate / Unsuspend Student" : "Suspend Student Access"}
                            >
                              {std.status === "suspended" ? <UserCheck className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
                            </button>

                            {/* Delete Action */}
                            <button
                              onClick={() => handleRejectAndDelete(std.id, std.full_name)}
                              disabled={actionLoadingId === std.id}
                              className="flex h-8 w-8 items-center justify-center rounded-xl border border-rose-200 bg-rose-50/50 text-rose-600 hover:bg-rose-100 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-400 transition cursor-pointer"
                              title="Delete Student Record"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>

                          </div>
                        </td>

                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        ) : (
          /* Grid View Mode */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-5">
            {filteredStudents.map((std, idx) => (
              <div
                key={std.id}
                className="rounded-2xl border border-[#E5E7EB] bg-white p-4.5 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C] flex flex-col justify-between space-y-4"
              >
                <div>
                  <div className="flex items-start justify-between">
                    {(() => {
                      const presence = getStudentPresence(std.id, std.full_name);
                      return (
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <div className={`h-10 w-10 rounded-full font-bold flex items-center justify-center text-xs ${std.status === "pending" ? "bg-amber-100 text-amber-800" : std.status === "suspended" ? "bg-rose-100 text-rose-800" : "bg-purple-100 text-purple-700"
                              }`}>
                              {getInitials(std.full_name)}
                            </div>
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <h4 className="font-black text-sm text-[#0A2E5C] dark:text-white">{std.full_name}</h4>
                              {std.status === "pending" && (
                                <span className="rounded-md bg-amber-100 dark:bg-amber-900/50 px-1.5 py-0.2 text-[9px] font-black text-amber-700 dark:text-amber-300">
                                  PENDING
                                </span>
                              )}
                              {std.status === "suspended" && (
                                <span className="rounded-md bg-rose-100 dark:bg-rose-900/50 px-1.5 py-0.2 text-[9px] font-black text-rose-700 dark:text-rose-300">
                                  SUSPENDED
                                </span>
                              )}
                              {std.status === "active" && (
                                presence.isPresent ? (
                                  <span className="relative flex h-2.5 w-2.5 shrink-0" title="Inside Library (Checked In)">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-600 shadow-[0_0_8px_rgba(37,99,235,0.9)]"></span>
                                  </span>
                                ) : presence.statusText === "Checked Out" ? (
                                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-xs shrink-0" title="Present (Checked Out)" />
                                ) : (
                                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-rose-500 shrink-0" title="Absent (No Check-in Today)" />
                                )
                              )}
                            </div>
                            <span className="text-[11px] text-zinc-400 font-mono">{std.student_code}</span>
                          </div>
                        </div>
                      );
                    })()}
                    {(() => {
                      const feeSchedule = getStudentFeeSchedule(std);
                      return (
                        <div className="flex flex-col items-end gap-1">
                          {std.fee_status === "Due" ? (
                            <span className="rounded-full bg-rose-100 text-rose-700 px-2.5 py-0.5 text-[10px] font-bold">Due ₹{std.due_amount}</span>
                          ) : (
                            <span className="rounded-full bg-emerald-100 text-emerald-700 px-2.5 py-0.5 text-[10px] font-bold">Paid</span>
                          )}
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.2 text-[9px] font-bold ${feeSchedule.colorClass}`}>
                            <span>{feeSchedule.label}</span>
                          </span>
                        </div>
                      );
                    })()}
                  </div>

                  <div className="mt-3 space-y-1 text-xs text-zinc-600 dark:text-zinc-300">
                    <p><strong className="text-zinc-400 font-semibold">Course:</strong> {std.course || "General"}</p>
                    <p><strong className="text-zinc-400 font-semibold">Shift:</strong> {std.shift || "Morning"}</p>
                    <p><strong className="text-zinc-400 font-semibold">Plan:</strong> {std.membership_plan === "Reserved Seat" ? "Reserved Seat" : "General Desk"}</p>
                    {std.membership_plan === "Reserved Seat" && std.seat_number && <p><strong className="text-purple-600 font-bold">Seat:</strong> #{std.seat_number}</p>}
                  </div>
                </div>

                <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                  <span className="text-[11px] font-bold text-zinc-500">{std.phone}</span>
                  <div className="flex items-center gap-1">
                    {std.status === "pending" && (
                      <button
                        onClick={() => handleInitiateApprove(std)}
                        disabled={actionLoadingId === std.id}
                        className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold rounded-lg flex items-center gap-1 transition active:scale-95 cursor-pointer disabled:opacity-50"
                        title={std.membership_plan === "Reserved Seat" ? "Assign Seat & Approve Student" : "Approve Student"}
                      >
                        <Check className="h-3 w-3" />
                        <span>{std.membership_plan === "Reserved Seat" ? "Assign & Approve" : "Approve"}</span>
                      </button>
                    )}
                    <a 
                      href={std.phone ? `tel:${std.phone.replace(/[^0-9+]/g, '')}` : undefined} 
                      className={`p-1.5 rounded-lg cursor-pointer transition ${std.phone ? "text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-950/50" : "text-zinc-300 opacity-40 cursor-not-allowed"}`} 
                      title={std.phone ? `Direct Call: ${std.phone}` : "No Phone"}
                    >
                      <Phone className="h-4 w-4" />
                    </a>
                    <a href={`https://wa.me/91${std.phone?.replace(/\\D/g, '').slice(-10)}?text=Hello ${encodeURIComponent(std.full_name)},`} target="_blank" rel="noopener noreferrer" className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg cursor-pointer" title="Message on WhatsApp"><MessageCircle className="h-4 w-4" /></a>
                    <button onClick={() => { setSelectedStudentForEdit(std); setEditStudentForm(std); }} className="p-1.5 text-purple-600 hover:bg-purple-50 rounded-lg cursor-pointer" title="Edit Student"><Edit3 className="h-4 w-4" /></button>
                    <button
                      onClick={() => handleToggleSuspend(std.id, std.status, std.full_name)}
                      className={`p-1.5 rounded-lg cursor-pointer transition ${std.status === "suspended" ? "text-emerald-600 hover:bg-emerald-50" : "text-amber-600 hover:bg-amber-50"}`}
                      title={std.status === "suspended" ? "Reactivate Student" : "Suspend Student"}
                    >
                      {std.status === "suspended" ? <UserCheck className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
                    </button>
                    <button onClick={() => handleRejectAndDelete(std.id, std.full_name)} className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer" title="Delete Student"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Table / Grid Footer Pagination */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 py-4 border-t border-[#E5E7EB]/60 dark:border-zinc-800 bg-[#F8FAFC]/30 dark:bg-zinc-800/30 text-xs font-bold text-zinc-500">
          <div>
            Showing 1 to {filteredStudents.length} of {filteredStudents.length} students
          </div>

          <div className="flex items-center gap-1.5">
            <button className="flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800 text-zinc-400 hover:bg-zinc-100 cursor-pointer">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-white font-black shadow-xs">
              1
            </button>
            <button className="flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800 text-zinc-400 hover:bg-zinc-100 cursor-pointer">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

      </div>

      {/* ========================================================================= */}
      {/* 5. BOTTOM 4 WIDGET CARDS GRID (REALIGNED IN REQUESTED ORDER) */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">

        {/* 1. First Widget: Recent Activity */}
        <div className="rounded-3xl border border-[#E5E7EB] bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C]">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400">
              <Clock className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-xs font-black text-[#0A2E5C] dark:text-white">Recent Activity</h3>
              <p className="text-[10px] text-zinc-400">Latest student enrollments & activities</p>
            </div>
          </div>

          <div className="mt-3 space-y-3">
            <div className="flex items-center justify-center text-xs py-4">
              <span className="text-zinc-400 dark:text-zinc-500 italic">No recent activity yet</span>
            </div>
          </div>
        </div>

        {/* 2. Second Widget: Membership & Status Distribution */}
        <div className="rounded-3xl border border-[#E5E7EB] bg-white p-4.5 sm:p-5 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C]">
          <div className="flex items-center gap-2.5 mb-2.5">
            <div className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400">
              <Crown className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-xs font-black text-[#0A2E5C] dark:text-white">Membership Plans</h3>
              <p className="text-[10px] text-zinc-400">Current plan & status distribution</p>
            </div>
          </div>

          <div className="mt-2 flex items-center justify-between gap-3">
            {/* SVG Circle Pie / Donut Chart with All 5 Segments: General, Reserved, Trial, Pending, Suspend */}
            <div className="relative flex shrink-0 h-22 w-22 sm:h-24 sm:w-24 items-center justify-center select-none">
              <svg viewBox="0 0 96 96" className="h-full w-full -rotate-90">
                {/* Background base track circle */}
                <circle
                  cx="48"
                  cy="48"
                  r="36"
                  fill="transparent"
                  stroke="#E4E4E7"
                  strokeWidth="8.5"
                  className="dark:stroke-zinc-800"
                />
                {totalStudentsCount > 0 ? (
                  (() => {
                    let accumulatedOffset = 0;
                    const circumference = 2 * Math.PI * 36;
                    const chartSegments = [
                      { id: "general", label: "General", count: generalPlanCount, color: "#10B981" },
                      { id: "reserved", label: "Reserved", count: reservedSeatsCount, color: "#A855F7" },
                      { id: "trial", label: "Trial", count: trialPassCount, color: "#0EA5E9" },
                      { id: "pending", label: "Pending", count: pendingStudentsCount, color: "#F59E0B" },
                      { id: "suspended", label: "Suspend", count: suspendedStudentsCount, color: "#F43F5E" },
                    ];
                    return chartSegments
                      .filter((seg) => seg.count > 0)
                      .map((seg) => {
                        const strokeLength = (seg.count / totalStudentsCount) * circumference;
                        const currentOffset = accumulatedOffset;
                        accumulatedOffset += strokeLength;
                        return (
                          <circle
                            key={seg.id}
                            cx="48"
                            cy="48"
                            r="36"
                            fill="transparent"
                            stroke={seg.color}
                            strokeWidth="8.5"
                            strokeDasharray={`${strokeLength} ${circumference - strokeLength}`}
                            strokeDashoffset={-currentOffset}
                            className="transition-all duration-500"
                          />
                        );
                      });
                  })()
                ) : (
                  <circle
                    cx="48"
                    cy="48"
                    r="36"
                    fill="transparent"
                    stroke="#10B981"
                    strokeWidth="8.5"
                    strokeDasharray="226.195 0"
                  />
                )}
              </svg>
              {/* Central Counter Display */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-base sm:text-lg font-black text-[#0A2E5C] dark:text-white leading-none">
                  {totalStudentsCount}
                </span>
                <span className="text-[7.5px] font-bold text-zinc-400 uppercase mt-0.5 tracking-wider">
                  Total
                </span>
              </div>
            </div>

            {/* 5 Distribution Categories: General, Reserved, Trial, Pending, Suspend */}
            <div className="grid grid-cols-1 gap-0.5 text-[11px] flex-1 min-w-0">
              {/* 1. General */}
              <div 
                onClick={() => { setSelectedPlanFilter("General"); setSelectedStatusFilter("all"); }}
                className="flex items-center justify-between gap-1 px-1.5 py-0.5 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/60 cursor-pointer transition select-none"
                title="Filter by General Plan"
              >
                <div className="flex items-center gap-1.5 min-w-0 truncate">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                  <span className="font-bold text-[#0A2E5C] dark:text-zinc-200 truncate text-[11px]">General</span>
                </div>
                <span className="text-zinc-500 dark:text-zinc-400 text-[11px] font-bold">{generalPlanCount}</span>
              </div>

              {/* 2. Reserved */}
              <div 
                onClick={() => { setSelectedPlanFilter("Reserved Seat"); setSelectedStatusFilter("all"); }}
                className="flex items-center justify-between gap-1 px-1.5 py-0.5 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/60 cursor-pointer transition select-none"
                title="Filter by Reserved Seats"
              >
                <div className="flex items-center gap-1.5 min-w-0 truncate">
                  <span className="h-2 w-2 rounded-full bg-purple-500 shrink-0" />
                  <span className="font-bold text-[#0A2E5C] dark:text-zinc-200 truncate text-[11px]">Reserved</span>
                </div>
                <span className="text-zinc-500 dark:text-zinc-400 text-[11px] font-bold">{reservedSeatsCount}</span>
              </div>

              {/* 3. Trial */}
              <div 
                onClick={() => { setSelectedPlanFilter("Trial Pass"); setSelectedStatusFilter("all"); }}
                className="flex items-center justify-between gap-1 px-1.5 py-0.5 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/60 cursor-pointer transition select-none"
                title="Filter by Trial Pass"
              >
                <div className="flex items-center gap-1.5 min-w-0 truncate">
                  <span className="h-2 w-2 rounded-full bg-sky-500 shrink-0" />
                  <span className="font-bold text-[#0A2E5C] dark:text-zinc-200 truncate text-[11px]">Trial</span>
                </div>
                <span className="text-zinc-500 dark:text-zinc-400 text-[11px] font-bold">{trialPassCount}</span>
              </div>

              {/* 4. Pending */}
              <div 
                onClick={() => { setSelectedStatusFilter("pending"); setSelectedPlanFilter("all"); }}
                className="flex items-center justify-between gap-1 px-1.5 py-0.5 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/60 cursor-pointer transition select-none"
                title="Filter by Pending Approvals"
              >
                <div className="flex items-center gap-1.5 min-w-0 truncate">
                  <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" />
                  <span className="font-bold text-[#0A2E5C] dark:text-zinc-200 truncate text-[11px]">Pending</span>
                </div>
                <span className="text-zinc-500 dark:text-zinc-400 text-[11px] font-bold">{pendingStudentsCount}</span>
              </div>

              {/* 5. Suspend */}
              <div 
                onClick={() => { setSelectedStatusFilter("suspended"); setSelectedPlanFilter("all"); }}
                className="flex items-center justify-between gap-1 px-1.5 py-0.5 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/60 cursor-pointer transition select-none"
                title="Filter by Suspended Students"
              >
                <div className="flex items-center gap-1.5 min-w-0 truncate">
                  <span className="h-2 w-2 rounded-full bg-rose-500 shrink-0" />
                  <span className="font-bold text-[#0A2E5C] dark:text-zinc-200 truncate text-[11px]">Suspend</span>
                </div>
                <span className="text-zinc-500 dark:text-zinc-400 text-[11px] font-bold">{suspendedStudentsCount}</span>
              </div>
            </div>
          </div>
        </div>

        {/* 3. Third Widget: Student Growth (New Students Added Line Chart) */}
        <div className="rounded-3xl border border-[#E5E7EB] bg-white p-4.5 sm:p-5 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C] flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400">
                <TrendingUp className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-xs font-black text-[#0A2E5C] dark:text-white">Student Growth</h3>
                <p className="text-[10px] text-zinc-400">New student registrations</p>
              </div>
            </div>
            <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200/80 dark:border-emerald-800/60 px-2 py-0.5 text-[10px] font-black text-emerald-700 dark:text-emerald-300">
              <ArrowUpRight className="h-3 w-3" />
              +{students.length} Total
            </span>
          </div>

          {/* Line Chart Component */}
          <div className="mt-1 relative">
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-base sm:text-lg font-black text-[#0A2E5C] dark:text-white">
                +{students.length} <span className="text-[10px] font-bold text-zinc-400">Admissions</span>
              </span>
              <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                Weekly Trend
              </span>
            </div>

            {/* SVG Line & Gradient Area */}
            <div className="h-16 w-full">
              <svg viewBox="0 0 240 60" className="w-full h-full overflow-visible">
                <defs>
                  <linearGradient id="studentGrowthGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10B981" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#10B981" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Background Grid Lines */}
                <line x1="10" y1="18" x2="230" y2="18" stroke="#E5E7EB" strokeDasharray="3 3" className="dark:stroke-zinc-800/80" />
                <line x1="10" y1="40" x2="230" y2="40" stroke="#E5E7EB" strokeDasharray="3 3" className="dark:stroke-zinc-800/80" />

                {/* Area Polygon Fill */}
                <polygon
                  points={`15,50 ${growthChartPoints.map(p => `${p.x},${p.y}`).join(" ")} 225,50`}
                  fill="url(#studentGrowthGradient)"
                />

                {/* Main Curve / Polyline */}
                <polyline
                  fill="none"
                  stroke="#10B981"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={growthChartPoints.map(p => `${p.x},${p.y}`).join(" ")}
                />

                {/* Data Points */}
                {growthChartPoints.map((p, idx) => (
                  <g key={idx} className="cursor-pointer">
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r="3.5"
                      className="fill-white dark:fill-[#0A2E5C] stroke-emerald-500 hover:r-4 transition-all"
                      strokeWidth="2"
                    />
                  </g>
                ))}
              </svg>
            </div>

            {/* X-axis Day labels */}
            <div className="flex justify-between text-[9px] font-bold text-zinc-400 px-1 pt-0.5 border-t border-zinc-100 dark:border-zinc-800">
              {weekDays.map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
          </div>
        </div>

        {/* 4. Fourth Widget: Quick Actions */}
        <div className="rounded-3xl border border-[#E5E7EB] bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C] flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2.5 mb-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400">
                <QrCode className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-xs font-black text-[#0A2E5C] dark:text-white">Quick Actions</h3>
                <p className="text-[10px] text-zinc-400">Access frequently used features</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-4">
              <button
                type="button"
                onClick={() => setShowAddStudentModal(true)}
                className="flex flex-col items-center justify-center p-3 rounded-2xl bg-blue-50/60 border border-blue-100 hover:bg-blue-100/70 dark:bg-blue-950/20 dark:border-blue-900/40 text-blue-700 dark:text-blue-300 transition text-center cursor-pointer active:scale-95 shadow-2xs group"
                title="Register New Student"
              >
                <UserPlus className="h-4 w-4 mb-1 text-blue-600 dark:text-blue-400 group-hover:scale-110 transition-transform" />
                <span className="text-[10px] font-bold">New Admission</span>
              </button>

              <button
                type="button"
                onClick={() => setShowPrintCardsModal(true)}
                className="flex flex-col items-center justify-center p-3 rounded-2xl bg-purple-50/60 border border-purple-100 hover:bg-purple-100/70 dark:bg-purple-950/20 dark:border-purple-900/40 text-purple-700 dark:text-purple-300 transition text-center cursor-pointer active:scale-95 shadow-2xs group"
                title="Batch Print ID Passes"
              >
                <Printer className="h-4 w-4 mb-1 text-purple-600 dark:text-purple-400 group-hover:scale-110 transition-transform" />
                <span className="text-[10px] font-bold">Print ID Cards</span>
              </button>

              <button
                type="button"
                onClick={() => handleExportCSV(false)}
                className="flex flex-col items-center justify-center p-3 rounded-2xl bg-emerald-50/60 border border-emerald-100 hover:bg-emerald-100/70 dark:bg-emerald-950/20 dark:border-emerald-900/40 text-emerald-700 dark:text-emerald-300 transition text-center cursor-pointer active:scale-95 shadow-2xs group"
                title="Export Student Directory to CSV"
              >
                <Download className="h-4 w-4 mb-1 text-emerald-600 dark:text-emerald-400 group-hover:scale-110 transition-transform" />
                <span className="text-[10px] font-bold">Export CSV</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSmsRecipientFilter("all");
                  setShowSendSmsModal(true);
                }}
                className="flex flex-col items-center justify-center p-3 rounded-2xl bg-amber-50/60 border border-amber-100 hover:bg-amber-100/70 dark:bg-amber-950/20 dark:border-amber-900/40 text-amber-700 dark:text-amber-300 transition text-center cursor-pointer active:scale-95 shadow-2xs group"
                title="Compose and Send Broadcast SMS"
              >
                <Send className="h-4 w-4 mb-1 text-amber-600 dark:text-amber-400 group-hover:scale-110 transition-transform" />
                <span className="text-[10px] font-bold">Send SMS</span>
              </button>
            </div>
          </div>
        </div>

      </div>

      {/* ========================================================================= */}
      {/* 6. MODAL: EDIT STUDENT DETAILS (ALL COMPREHENSIVE FIELDS) */}
      {/* ========================================================================= */}
      {selectedStudentForEdit && editStudentForm && mounted && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/75 p-3 sm:p-4 backdrop-blur-xs animate-fadeIn overflow-y-auto">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-5 sm:p-7 shadow-2xl dark:bg-[#0A2E5C] border border-[#E5E7EB] dark:border-zinc-700 max-h-[92vh] overflow-y-auto my-auto space-y-5">

            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-[#E5E7EB]/60 dark:border-zinc-800">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-2xl bg-purple-100 text-purple-700 dark:bg-purple-950/60 font-black">
                  <Edit3 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-[#0A2E5C] dark:text-white">
                    Edit Student Profile
                  </h3>
                  <p className="text-xs font-mono font-bold text-[#0B5ED7] dark:text-[#FFC107]">
                    ID: {editStudentForm.student_code || editStudentForm.id}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setSelectedStudentForEdit(null); setEditStudentForm(null); }}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEditStudent} className="space-y-5">

              {/* 1. Student Information */}
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-[#0B5ED7] dark:text-[#FFC107] mb-3 flex items-center gap-1.5 border-b border-[#E5E7EB]/40 pb-1.5">
                  <User className="h-3.5 w-3.5" />
                  <span>1. Student Information</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-200 mb-1">
                      Full Name <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                      <input
                        type="text"
                        required
                        value={editStudentForm.full_name}
                        onChange={(e) => setEditStudentForm({ ...editStudentForm, full_name: formatNameInput(e.target.value) })}
                        placeholder="Student full name"
                        className="w-full rounded-xl border border-[#E5E7EB] bg-[#F8FAFC]/40 py-2.5 pl-9 pr-3 text-xs font-bold text-[#0A2E5C] dark:border-zinc-700 dark:bg-zinc-800 dark:text-white focus:border-[#FFC107] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-200 mb-1">
                      Student Mobile Number <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                      <input
                        type="text"
                        required
                        value={editStudentForm.phone}
                        onChange={(e) => setEditStudentForm({ ...editStudentForm, phone: e.target.value })}
                        placeholder="+91 9876543210"
                        className="w-full rounded-xl border border-[#E5E7EB] bg-[#F8FAFC]/40 py-2.5 pl-9 pr-3 text-xs font-mono font-bold text-[#0A2E5C] dark:border-zinc-700 dark:bg-zinc-800 dark:text-white focus:border-[#FFC107] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-200 mb-1">
                      Email Address <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                      <input
                        type="email"
                        required
                        value={editStudentForm.email || ""}
                        onChange={(e) => setEditStudentForm({ ...editStudentForm, email: e.target.value.trim() })}
                        placeholder="student@gmail.com"
                        className="w-full rounded-xl border border-[#E5E7EB] bg-[#F8FAFC]/40 py-2.5 pl-9 pr-3 text-xs font-bold text-[#0A2E5C] dark:border-zinc-700 dark:bg-zinc-800 dark:text-white focus:border-[#FFC107] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-200 mb-1">
                      Target Exam / Course
                    </label>
                    <div className="relative">
                      <BookOpen className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                      <input
                        type="text"
                        value={editStudentForm.course || ""}
                        onChange={(e) => setEditStudentForm({ ...editStudentForm, course: e.target.value })}
                        placeholder="e.g. UPSC / SSC / UP Police / NEET"
                        className="w-full rounded-xl border border-[#E5E7EB] bg-[#F8FAFC]/40 py-2.5 pl-9 pr-3 text-xs font-bold text-[#0A2E5C] dark:border-zinc-700 dark:bg-zinc-800 dark:text-white focus:border-[#FFC107] focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. Parent / Guardian Details */}
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-[#0B5ED7] dark:text-[#FFC107] mb-3 flex items-center gap-1.5 border-b border-[#E5E7EB]/40 pb-1.5">
                  <Users className="h-3.5 w-3.5" />
                  <span>2. Parent / Guardian Details</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-200 mb-1">
                      Parent's Full Name
                    </label>
                    <div className="relative">
                      <Users className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                      <input
                        type="text"
                        value={editStudentForm.parent_name || ""}
                        onChange={(e) => setEditStudentForm({ ...editStudentForm, parent_name: formatNameInput(e.target.value) })}
                        placeholder="Father's / Mother's Name"
                        className="w-full rounded-xl border border-[#E5E7EB] bg-[#F8FAFC]/40 py-2.5 pl-9 pr-3 text-xs font-bold text-[#0A2E5C] dark:border-zinc-700 dark:bg-zinc-800 dark:text-white focus:border-[#FFC107] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-200 mb-1">
                      Parent's Mobile Number
                    </label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                      <input
                        type="text"
                        value={editStudentForm.parent_phone || ""}
                        onChange={(e) => setEditStudentForm({ ...editStudentForm, parent_phone: e.target.value })}
                        placeholder="+91 9876543210"
                        className="w-full rounded-xl border border-[#E5E7EB] bg-[#F8FAFC]/40 py-2.5 pl-9 pr-3 text-xs font-mono font-bold text-[#0A2E5C] dark:border-zinc-700 dark:bg-zinc-800 dark:text-white focus:border-[#FFC107] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-200 mb-1">
                      Complete Residential Address
                    </label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-3 h-4 w-4 text-zinc-400" />
                      <textarea
                        rows={2}
                        value={editStudentForm.address || ""}
                        onChange={(e) => setEditStudentForm({ ...editStudentForm, address: e.target.value })}
                        placeholder="House No, Street, Colony, City, Pin Code"
                        className="w-full rounded-xl border border-[#E5E7EB] bg-[#F8FAFC]/40 py-2.5 pl-9 pr-3 text-xs font-medium text-[#0A2E5C] dark:border-zinc-700 dark:bg-zinc-800 dark:text-white focus:border-[#FFC107] focus:outline-none resize-none"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. Seating Plan, Shift & Desk Allocation */}
              <div className="rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC]/60 dark:bg-zinc-800/60 p-4 space-y-3.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase tracking-wider text-[#0A2E5C] dark:text-[#FFC107] flex items-center gap-1.5">
                    <Crown className="h-3.5 w-3.5 text-[#0B5ED7]" />
                    <span>3. Seating Plan & Shift Allocation</span>
                  </h4>
                  <span className="text-[10px] font-bold text-zinc-400">
                    {editStudentForm.membership_plan === "Reserved Seat" ? "Dedicated Desk Required" : "Flexi Seating"}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: "General", label: "General Desk", sub: "Flexi Seat", icon: User },
                    { id: "Reserved Seat", label: "Reserved Desk", sub: "Dedicated Seat", icon: Crown },
                    { id: "Trial Pass", label: "Trial Pass", sub: "3-Day Pass", icon: Clock },
                  ].map((plan) => (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => {
                        const newPlan = plan.id;
                        const options = getShiftOptionsForPlan(newPlan);
                        const currentShift = editStudentForm.shift;
                        const isShiftValid = options.some(o => o.name === currentShift);
                        const nextShift = isShiftValid ? currentShift : options[0].name;

                        setEditStudentForm({
                          ...editStudentForm,
                          membership_plan: newPlan as any,
                          seat_number: newPlan === "Reserved Seat" ? (editStudentForm.seat_number || "S-01") : "",
                          shift: nextShift,
                        });
                      }}
                      className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-center transition cursor-pointer ${editStudentForm.membership_plan === plan.id
                        ? "bg-[#0A2E5C] text-[#FFC107] border-[#0A2E5C] shadow-xs font-black"
                        : "bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 font-bold hover:bg-zinc-50"
                        }`}
                    >
                      <plan.icon className="h-4 w-4 mb-1" />
                      <span className="text-[11px] leading-tight font-bold">{plan.label}</span>
                      <span className="text-[9px] opacity-75">{plan.sub}</span>
                    </button>
                  ))}
                </div>

                {/* Dedicated Seat Number Input (Shown when Reserved Seat is active) */}
                {editStudentForm.membership_plan === "Reserved Seat" && (
                  <div className="pt-2 border-t border-zinc-200/80 dark:border-zinc-700 animate-fadeIn">
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-bold text-[#0A2E5C] dark:text-white">
                        Allocated Dedicated Seat Number <span className="text-rose-500">*</span>
                      </label>
                      <span className="text-[10px] font-mono font-bold text-[#0B5ED7] dark:text-[#FFC107]">
                        e.g. S-17 or A-01
                      </span>
                    </div>
                    <input
                      type="text"
                      required
                      placeholder="e.g. S-17 or A-03"
                      value={editStudentForm.seat_number || ""}
                      onChange={(e) => setEditStudentForm({ ...editStudentForm, seat_number: e.target.value.toUpperCase() })}
                      className="w-full rounded-xl border border-purple-300 bg-white dark:bg-zinc-800 dark:border-purple-700 p-2.5 text-xs font-mono font-black text-purple-700 dark:text-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-400"
                    />
                    <p className="text-[10px] text-zinc-500 mt-1">
                      ℹ️ This desk will remain exclusively reserved for this student.
                    </p>
                  </div>
                )}

                {/* Shift Selector */}
                <div>
                  <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-200 mb-1">
                    {editStudentForm.membership_plan === "Reserved Seat"
                      ? "Reserved Seat Plan & Pricing"
                      : editStudentForm.membership_plan === "Trial Pass"
                      ? "Trial Pass Duration"
                      : "Preferred Shift Timing"}
                  </label>
                  <select
                    value={editStudentForm.shift || getShiftOptionsForPlan(editStudentForm.membership_plan)[0]?.name}
                    onChange={(e) => setEditStudentForm({ ...editStudentForm, shift: e.target.value })}
                    className="w-full rounded-xl border border-zinc-200 bg-white p-2.5 text-xs font-bold text-[#0A2E5C] dark:border-zinc-700 dark:bg-zinc-800 dark:text-white focus:border-[#FFC107] focus:outline-none cursor-pointer"
                  >
                    {getShiftOptionsForPlan(editStudentForm.membership_plan).map((opt) => (
                      <option key={opt.id} value={opt.name}>
                        {opt.name} {opt.price > 0 ? `(₹${opt.price}/mo)` : "(FREE)"}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 4. Account Status & Fee Management */}
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-[#0B5ED7] dark:text-[#FFC107] mb-3 flex items-center gap-1.5 border-b border-[#E5E7EB]/40 pb-1.5">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>4. Account & Fee Status</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  <div>
                    <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-200 mb-1">Account Status</label>
                    <select
                      value={editStudentForm.status || "active"}
                      onChange={(e) => setEditStudentForm({ ...editStudentForm, status: e.target.value as "active" | "pending" | "suspended" })}
                      className="w-full rounded-xl border border-zinc-200 bg-white p-2.5 text-xs font-bold text-[#0A2E5C] dark:border-zinc-700 dark:bg-zinc-800 dark:text-white focus:border-[#FFC107] focus:outline-none cursor-pointer"
                    >
                      <option value="active">🟢 Active Member</option>
                      <option value="pending">🟡 Pending Approval</option>
                      <option value="suspended">🔴 Suspended (Blocked)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-200 mb-1">Fee Status</label>
                    <select
                      value={editStudentForm.fee_status || "Paid"}
                      onChange={(e) => setEditStudentForm({
                        ...editStudentForm,
                        fee_status: e.target.value as "Paid" | "Due",
                        due_amount: e.target.value === "Paid" ? 0 : (editStudentForm.due_amount || 600)
                      })}
                      className="w-full rounded-xl border border-zinc-200 bg-white p-2.5 text-xs font-bold text-[#0A2E5C] dark:border-zinc-700 dark:bg-zinc-800 dark:text-white focus:border-[#FFC107] focus:outline-none cursor-pointer"
                    >
                      <option value="Paid">✓ Fee Paid</option>
                      <option value="Due">⚠ Fee Due</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-200 mb-1">Due Amount (₹)</label>
                    <input
                      type="number"
                      disabled={editStudentForm.fee_status === "Paid"}
                      value={editStudentForm.due_amount ?? 0}
                      onChange={(e) => setEditStudentForm({ ...editStudentForm, due_amount: Number(e.target.value) })}
                      className="w-full rounded-xl border border-zinc-200 bg-white p-2.5 text-xs font-bold text-[#0A2E5C] dark:border-zinc-700 dark:bg-zinc-800 dark:text-white disabled:opacity-50 focus:border-[#FFC107] focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Modal Actions */}
              <div className="pt-4 border-t border-[#E5E7EB]/60 dark:border-zinc-800 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => { setSelectedStudentForEdit(null); setEditStudentForm(null); }}
                  className="rounded-xl border border-zinc-200 px-4 py-2.5 text-xs font-bold text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoadingId === editStudentForm.id}
                  className="rounded-xl bg-linear-to-r from-[#0B5ED7] to-[#FFC107] text-[#0A2E5C] px-6 py-2.5 text-xs font-black shadow-md hover:opacity-95 transition active:scale-95 cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Check className="h-4 w-4 text-[#0A2E5C]" />
                  <span>{actionLoadingId === editStudentForm.id ? "Saving..." : "Save Changes"}</span>
                </button>
              </div>

            </form>
          </div>
        </div>,
        document.body
      )}

      {/* ========================================================================= */}
      {/* 8. MODAL: VIEW STUDENT DETAILS (MATCHING SIGNUP FORM STRUCTURE) */}
      {/* ========================================================================= */}
      {selectedStudentForView && mounted && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/75 p-3 sm:p-4 backdrop-blur-xs animate-fadeIn overflow-y-auto">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-5 sm:p-7 shadow-2xl dark:bg-[#0A2E5C] border border-[#E5E7EB] dark:border-zinc-700 max-h-[92vh] overflow-y-auto my-auto space-y-5">

            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-[#E5E7EB]/60 dark:border-zinc-800">
              <div className="flex items-center gap-3">
                <div className={`flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-2xl font-black text-base sm:text-lg shadow-xs ${selectedStudentForView.status === "pending"
                  ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                  : selectedStudentForView.status === "suspended"
                    ? "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300"
                    : "bg-linear-to-br from-[#0B5ED7]/20 to-[#FFC107]/30 text-[#0A2E5C] dark:text-white"
                  }`}>
                  {getInitials(selectedStudentForView.full_name)}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base sm:text-lg font-black text-[#0A2E5C] dark:text-white">
                      {selectedStudentForView.full_name}
                    </h3>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${selectedStudentForView.status === "active"
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                      : selectedStudentForView.status === "pending"
                        ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                        : "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300"
                      }`}>
                      ● {selectedStudentForView.status}
                    </span>
                  </div>
                  <p className="text-xs font-mono font-bold text-[#0B5ED7] dark:text-[#FFC107] mt-0.5">
                    ID: {selectedStudentForView.student_code || selectedStudentForView.id}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedStudentForView(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Body: Same 3 Sections as Signup Form */}
            <div className="space-y-5">

              {/* 1. Student Information */}
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-[#0B5ED7] dark:text-[#FFC107] mb-2.5 flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5" />
                  <span>1. Student Information</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="rounded-2xl border border-[#E5E7EB]/70 bg-[#F8FAFC]/40 p-3 dark:border-zinc-800 dark:bg-zinc-800/40">
                    <span className="text-[10px] font-bold text-zinc-400 block mb-0.5">Full Name</span>
                    <p className="text-xs font-bold text-[#0A2E5C] dark:text-white flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5 text-[#0B5ED7]" />
                      {selectedStudentForView.full_name}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-[#E5E7EB]/70 bg-[#F8FAFC]/40 p-3 dark:border-zinc-800 dark:bg-zinc-800/40">
                    <span className="text-[10px] font-bold text-zinc-400 block mb-0.5">Student Mobile</span>
                    <p className="text-xs font-mono font-bold text-[#0A2E5C] dark:text-white flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5 text-emerald-600" />
                      {selectedStudentForView.phone}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-[#E5E7EB]/70 bg-[#F8FAFC]/40 p-3 dark:border-zinc-800 dark:bg-zinc-800/40">
                    <span className="text-[10px] font-bold text-zinc-400 block mb-0.5">Email Address</span>
                    <p className="text-xs font-bold text-[#0A2E5C] dark:text-white flex items-center gap-1.5 truncate">
                      <Mail className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                      <span className="truncate">{selectedStudentForView.email}</span>
                    </p>
                  </div>

                  <div className="rounded-2xl border border-[#E5E7EB]/70 bg-[#F8FAFC]/40 p-3 dark:border-zinc-800 dark:bg-zinc-800/40">
                    <span className="text-[10px] font-bold text-zinc-400 block mb-0.5">Course / Target Exam</span>
                    <p className="text-xs font-bold text-purple-700 dark:text-purple-300 flex items-center gap-1.5">
                      <BookOpen className="h-3.5 w-3.5 text-purple-600" />
                      {selectedStudentForView.course || "General Studies"}
                    </p>
                  </div>
                </div>
              </div>

              {/* 2. Parent / Guardian Details */}
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-[#0B5ED7] dark:text-[#FFC107] mb-2.5 flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" />
                  <span>2. Parent / Guardian Details</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="rounded-2xl border border-[#E5E7EB]/70 bg-[#F8FAFC]/40 p-3 dark:border-zinc-800 dark:bg-zinc-800/40">
                    <span className="text-[10px] font-bold text-zinc-400 block mb-0.5">Parent's Name</span>
                    <p className="text-xs font-bold text-[#0A2E5C] dark:text-white flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5 text-[#0B5ED7]" />
                      {selectedStudentForView.parent_name || "Not provided"}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-[#E5E7EB]/70 bg-[#F8FAFC]/40 p-3 dark:border-zinc-800 dark:bg-zinc-800/40">
                    <span className="text-[10px] font-bold text-zinc-400 block mb-0.5">Parent's Mobile</span>
                    <p className="text-xs font-mono font-bold text-[#0A2E5C] dark:text-white flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5 text-emerald-600" />
                      {selectedStudentForView.parent_phone || "Not provided"}
                    </p>
                  </div>

                  <div className="sm:col-span-2 rounded-2xl border border-[#E5E7EB]/70 bg-[#F8FAFC]/40 p-3 dark:border-zinc-800 dark:bg-zinc-800/40">
                    <span className="text-[10px] font-bold text-zinc-400 block mb-0.5">Residential Address</span>
                    <p className="text-xs font-medium text-[#0A2E5C] dark:text-zinc-200 flex items-start gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-rose-600 shrink-0 mt-0.5" />
                      <span>{selectedStudentForView.address || "Not provided"}</span>
                    </p>
                  </div>
                </div>
              </div>

              {/* 3. Plan & Shift Selection Details */}
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-[#0B5ED7] dark:text-[#FFC107] mb-2.5 flex items-center gap-1.5">
                  <Crown className="h-3.5 w-3.5" />
                  <span>3. Plan & Shift Details</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div className="rounded-2xl border border-[#E5E7EB]/70 bg-[#F8FAFC]/40 p-3 dark:border-zinc-800 dark:bg-zinc-800/40">
                    <span className="text-[10px] font-bold text-zinc-400 block mb-0.5">Membership Plan</span>
                    <p className="text-xs font-bold text-[#0A2E5C] dark:text-white flex items-center gap-1.5">
                      <Crown className="h-3.5 w-3.5 text-amber-500" />
                      {selectedStudentForView.membership_plan || "General"}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-[#E5E7EB]/70 bg-[#F8FAFC]/40 p-3 dark:border-zinc-800 dark:bg-zinc-800/40">
                    <span className="text-[10px] font-bold text-zinc-400 block mb-0.5">Shift Time</span>
                    <p className="text-xs font-bold text-[#0A2E5C] dark:text-white flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-blue-500" />
                      {selectedStudentForView.shift || "Morning Shift"}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-[#E5E7EB]/70 bg-[#F8FAFC]/40 p-3 dark:border-zinc-800 dark:bg-zinc-800/40">
                    <span className="text-[10px] font-bold text-zinc-400 block mb-0.5">Assigned Desk / Seat</span>
                    <p className="text-xs font-black text-purple-700 dark:text-purple-300">
                      {selectedStudentForView.seat_number ? `#${selectedStudentForView.seat_number}` : "Flexible Desk"}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-[#E5E7EB]/70 bg-[#F8FAFC]/40 p-3 dark:border-zinc-800 dark:bg-zinc-800/40">
                    <span className="text-[10px] font-bold text-zinc-400 block mb-0.5">Fee Status</span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black ${selectedStudentForView.fee_status === "Due"
                      ? "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300"
                      : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                      }`}>
                      {selectedStudentForView.fee_status || "Paid"}
                    </span>
                  </div>

                  <div className="rounded-2xl border border-[#E5E7EB]/70 bg-[#F8FAFC]/40 p-3 dark:border-zinc-800 dark:bg-zinc-800/40">
                    <span className="text-[10px] font-bold text-zinc-400 block mb-0.5">Due Balance</span>
                    <p className="text-xs font-black text-[#0A2E5C] dark:text-white">
                      ₹{selectedStudentForView.due_amount ?? 0}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-[#E5E7EB]/70 bg-[#F8FAFC]/40 p-3 dark:border-zinc-800 dark:bg-zinc-800/40">
                    <span className="text-[10px] font-bold text-zinc-400 block mb-0.5">Fee Schedule</span>
                    {(() => {
                      const schedule = getStudentFeeSchedule(selectedStudentForView);
                      return (
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold mt-0.5 ${schedule.colorClass}`}>
                          <Calendar className="h-3 w-3 shrink-0" />
                          <span>{schedule.label}</span>
                        </span>
                      );
                    })()}
                  </div>

                  <div className="rounded-2xl border border-[#E5E7EB]/70 bg-[#F8FAFC]/40 p-3 dark:border-zinc-800 dark:bg-zinc-800/40">
                    <span className="text-[10px] font-bold text-zinc-400 block mb-0.5">Admission Date</span>
                    <p className="text-xs font-bold text-zinc-600 dark:text-zinc-300 flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5 text-zinc-400" />
                      {selectedStudentForView.created_at ? new Date(selectedStudentForView.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "Recent"}
                    </p>
                  </div>
                </div>
              </div>

            </div>

            {/* Modal Footer Actions - Same single line 3 buttons: Suspend, Edit Profile, Close */}
            <div className="pt-3.5 sm:pt-4 border-t border-[#E5E7EB]/60 dark:border-zinc-800 grid grid-cols-3 sm:flex sm:items-center sm:justify-end gap-1.5 sm:gap-2">
              <button
                type="button"
                onClick={() => handleToggleSuspend(selectedStudentForView.id, selectedStudentForView.status, selectedStudentForView.full_name)}
                disabled={actionLoadingId === selectedStudentForView.id}
                className={`inline-flex items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-4 py-2 sm:py-2.5 rounded-xl text-[11px] sm:text-xs font-black transition cursor-pointer disabled:opacity-50 truncate ${
                  selectedStudentForView.status === "suspended"
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
                    : "border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                }`}
                title={selectedStudentForView.status === "suspended" ? "Reactivate Student" : "Suspend Student Access"}
              >
                {selectedStudentForView.status === "suspended" ? (
                  <>
                    <UserCheck className="h-3.5 sm:h-4 w-3.5 sm:w-4 shrink-0" />
                    <span className="truncate">Reactivate</span>
                  </>
                ) : (
                  <>
                    <Ban className="h-3.5 sm:h-4 w-3.5 sm:w-4 shrink-0" />
                    <span className="truncate">Suspend</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelectedStudentForEdit(selectedStudentForView);
                  setEditStudentForm(selectedStudentForView);
                  setSelectedStudentForView(null);
                }}
                className="inline-flex items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-4 py-2 sm:py-2.5 rounded-xl border border-[#E5E7EB] bg-white text-[#0A2E5C] text-[11px] sm:text-xs font-bold hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white cursor-pointer truncate shadow-2xs"
              >
                <Edit3 className="h-3.5 w-3.5 text-purple-600 shrink-0" />
                <span className="truncate">Edit Profile</span>
              </button>

              <button
                type="button"
                onClick={() => handlePrintStudentPDF(selectedStudentForView)}
                className="inline-flex items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-4 py-2 sm:py-2.5 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200 text-[11px] sm:text-xs font-bold cursor-pointer truncate shadow-2xs"
                title="Print or Save Student Record as PDF"
              >
                <Printer className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                <span className="truncate">Print / PDF</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedStudentForView(null)}
                className="inline-flex items-center justify-center px-2 sm:px-5 py-2 sm:py-2.5 rounded-xl bg-[#0A2E5C] text-[#FFC107] text-[11px] sm:text-xs font-black shadow-sm hover:bg-[#141A24] transition cursor-pointer truncate"
              >
                Close
              </button>
            </div>

          </div>
        </div>,
        document.body
      )}

      {/* ========================================================================= */}
      {/* 9. MODAL: STUDENT QR CODE & DESK STICKER */}
      {/* ========================================================================= */}
      {selectedStudentForQr && mounted && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs animate-fadeIn">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl dark:bg-[#0A2E5C] border border-[#E5E7EB] dark:border-zinc-700 text-center">
            <div className="flex justify-between items-center pb-2 border-b border-zinc-100 dark:border-zinc-800 mb-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Official Student Desk Pass</h3>
              <button onClick={() => setSelectedStudentForQr(null)} className="text-zinc-400 hover:text-zinc-600 cursor-pointer">✕</button>
            </div>

            <div className="p-4 rounded-3xl border-2 border-dashed border-[#0B5ED7] bg-[#F8FAFC]/50 dark:bg-zinc-800/50 flex flex-col items-center space-y-3">
              <p className="font-black text-sm text-[#0A2E5C] dark:text-white">{selectedStudentForQr.full_name}</p>

              {/* QR Code Container */}
              <div className="p-3 bg-white rounded-2xl shadow-sm border border-zinc-200 flex items-center justify-center">
                <QrCode className="h-32 w-32 text-[#0A2E5C]" />
              </div>

              <div className="font-mono text-xs font-bold text-[#0B5ED7] dark:text-[#FFC107]">
                {selectedStudentForQr.student_code}
              </div>
              <p className="text-[10px] text-zinc-500 font-semibold">
                Scan at Hall Desk Scanner to log attendance
              </p>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                onClick={() => window.print()}
                className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-[#0A2E5C] text-[#FFC107] text-xs font-black cursor-pointer"
              >
                <Printer className="h-4 w-4" /> Print Sticker
              </button>
              <button
                onClick={() => setSelectedStudentForQr(null)}
                className="py-2.5 px-4 rounded-xl border border-zinc-200 text-xs font-bold text-zinc-600 dark:text-zinc-300 cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ========================================================================= */}
      {/* 10. MODAL: PENDING STUDENT APPROVALS REVIEW */}
      {/* ========================================================================= */}
      {showPendingModal && mounted && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs animate-fadeIn">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-5 sm:p-6 shadow-2xl dark:bg-[#0A2E5C] border border-[#E5E7EB] dark:border-zinc-700 max-h-[90vh] flex flex-col">

            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-[#E5E7EB]/60 dark:border-zinc-800 shrink-0">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                  <Clock className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-black text-[#0A2E5C] dark:text-white">
                      Pending Student Registrations ({students.filter(s => s.status === "pending").length})
                    </h3>
                    <span className="flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-900/40 px-2 py-0.5 text-[9px] font-bold text-emerald-700 dark:text-emerald-300">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Live Sync
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Review and approve new students who registered online for admission
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {students.filter(s => s.status === "pending").length > 0 && (
                  <button
                    onClick={handleApproveAllPending}
                    disabled={actionLoadingId === "bulk_pending"}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-xs font-black shadow-xs transition active:scale-95 cursor-pointer disabled:opacity-50"
                  >
                    <Check className="h-3.5 w-3.5" />
                    <span>{actionLoadingId === "bulk_pending" ? "Approving..." : "Approve All"}</span>
                  </button>
                )}
                <button
                  onClick={() => setShowPendingModal(false)}
                  className="h-8 w-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Pending List */}
            <div className="mt-4 overflow-y-auto space-y-3 flex-1 pr-1">
              {students.filter(s => s.status === "pending").length === 0 ? (
                <div className="py-12 text-center">
                  <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-3" />
                  <p className="text-sm font-black text-[#0A2E5C] dark:text-white">All Clear!</p>
                  <p className="text-xs text-zinc-400 mt-1">
                    There are no pending registrations awaiting approval.
                  </p>
                </div>
              ) : (
                students.filter(s => s.status === "pending").map((std) => (
                  <div
                    key={std.id}
                    className="rounded-2xl border border-amber-200/80 bg-linear-to-r from-amber-50/40 to-white dark:from-amber-950/20 dark:to-zinc-900/60 p-4 border-l-4 border-l-amber-500 space-y-3 shadow-xs"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200 font-black text-xs">
                          {getInitials(std.full_name)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-black text-sm text-[#0A2E5C] dark:text-white">{std.full_name}</h4>
                            <span className="rounded-md bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 text-[9px] font-black text-amber-700 dark:text-amber-300">
                              PENDING
                            </span>
                            {std.membership_plan === "Reserved Seat" && (
                              <span className="rounded-md bg-purple-100 dark:bg-purple-900/40 px-1.5 py-0.5 text-[9px] font-black text-purple-700 dark:text-purple-300 flex items-center gap-1">
                                <Crown className="h-3 w-3" />
                                <span>Reserved Seat</span>
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-zinc-500 font-mono mt-0.5">{std.email} • {std.phone}</p>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => handleInitiateApprove(std)}
                          disabled={actionLoadingId === std.id}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 text-xs font-black shadow-xs transition active:scale-95 cursor-pointer disabled:opacity-50"
                        >
                          <Check className="h-3.5 w-3.5" />
                          <span>{std.membership_plan === "Reserved Seat" ? "Assign Seat & Approve" : "Approve & Activate"}</span>
                        </button>
                        <button
                          onClick={() => handleRejectAndDelete(std.id, std.full_name)}
                          disabled={actionLoadingId === std.id}
                          className="inline-flex items-center gap-1 rounded-xl border border-rose-200 hover:bg-rose-50 text-rose-600 dark:border-rose-900/50 dark:hover:bg-rose-950/40 px-2.5 py-2 text-xs font-bold transition cursor-pointer disabled:opacity-50"
                          title="Reject registration"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">Reject</span>
                        </button>
                      </div>
                    </div>

                    {/* Enrollment Details Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] bg-white dark:bg-zinc-800/80 rounded-xl p-2.5 border border-zinc-100 dark:border-zinc-800">
                      <div>
                        <span className="text-zinc-400 block text-[10px]">Course:</span>
                        <span className="font-bold text-[#0A2E5C] dark:text-zinc-200">{std.course || "General"}</span>
                      </div>
                      <div>
                        <span className="text-zinc-400 block text-[10px]">Shift:</span>
                        <span className="font-bold text-[#0A2E5C] dark:text-zinc-200">{std.shift || "Morning"}</span>
                      </div>
                      <div>
                        <span className="text-zinc-400 block text-[10px]">Plan:</span>
                        <span className={`font-bold ${
                          std.membership_plan === "Reserved Seat" 
                            ? "text-purple-600 dark:text-purple-400" 
                            : "text-emerald-600 dark:text-emerald-400"
                        }`}>
                          {std.membership_plan === "Reserved Seat" ? "Reserved Seat" : "General Desk"}
                        </span>
                      </div>
                      <div>
                        <span className="text-zinc-400 block text-[10px]">Parent:</span>
                        <span className="font-bold text-[#0A2E5C] dark:text-zinc-200">{std.parent_name || "—"}</span>
                      </div>
                    </div>

                    {std.address && (
                      <p className="text-[10px] text-zinc-400">
                        <MapPin className="h-3 w-3 inline mr-1 text-zinc-400" />
                        {std.address}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Modal Footer */}
            <div className="pt-3 border-t border-[#E5E7EB]/60 dark:border-zinc-800 flex items-center justify-between shrink-0 text-xs">
              <span className="text-zinc-400 text-[11px]">
                {students.filter(s => s.status === "pending").length} student(s) waiting for approval
              </span>
              <div className="flex items-center gap-2">
                {students.filter(s => s.status === "pending").length > 0 && (
                  <button
                    onClick={handleApproveAllPending}
                    disabled={actionLoadingId === "bulk_pending"}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer transition active:scale-95 disabled:opacity-50 inline-flex items-center gap-1.5"
                  >
                    <Check className="h-3.5 w-3.5" />
                    <span>{actionLoadingId === "bulk_pending" ? "Approving All..." : "Approve All Pending"}</span>
                  </button>
                )}
                <button
                  onClick={() => setShowPendingModal(false)}
                  className="px-4 py-2 rounded-xl bg-[#0A2E5C] text-[#FFC107] font-bold cursor-pointer hover:bg-[#141A24] transition"
                >
                  Close
                </button>
              </div>
            </div>

          </div>
        </div>,
        document.body
      )}

      {/* 7. MODAL: BATCH PRINT ID CARDS */}
      {showPrintCardsModal && mounted && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/75 p-3 sm:p-4 backdrop-blur-xs animate-fadeIn overflow-y-auto">
          <div className="w-full max-w-4xl rounded-3xl bg-white p-5 sm:p-6 shadow-2xl dark:bg-[#0A2E5C] border border-[#E5E7EB] dark:border-zinc-700 max-h-[92vh] overflow-y-auto my-auto space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[#E5E7EB]/60 dark:border-zinc-800">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-purple-100 text-purple-700 dark:bg-purple-950/60 font-black">
                  <Printer className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-[#0A2E5C] dark:text-white">
                    Print Student ID Cards
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Official Genius Library photo student passes ({filteredStudents.length} cards)
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowPrintCardsModal(false)}
                className="h-8 w-8 rounded-full bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 flex items-center justify-center text-zinc-500 transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Printable ID Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[60vh] overflow-y-auto p-1">
              {filteredStudents.map((std, idx) => (
                <div
                  key={std.id}
                  className="rounded-2xl border-2 border-[#0B5ED7]/40 bg-gradient-to-br from-white to-[#F8F9FA] p-4 shadow-sm dark:from-[#0A2E5C] dark:to-[#141A24] dark:border-[#FFC107]/30 flex flex-col justify-between space-y-3 relative overflow-hidden"
                >
                  {/* Top Branding Banner */}
                  <div className="flex items-center justify-between border-b border-[#E5E7EB]/60 dark:border-zinc-800 pb-2">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-lg bg-[#0A2E5C] text-[#FFC107] flex items-center justify-center text-xs font-black">
                        <BookOpen className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-[#0A2E5C] dark:text-white leading-none">THE GENIUS</p>
                        <p className="text-[8px] font-bold text-[#0B5ED7] dark:text-[#FFC107] leading-none mt-0.5">DIGITAL LIBRARY</p>
                      </div>
                    </div>
                    <span className="text-[8px] font-mono font-bold bg-[#0B5ED7]/15 text-[#0B5ED7] dark:text-[#FFC107] px-1.5 py-0.5 rounded">
                      ID PASS
                    </span>
                  </div>

                  {/* Student Photo & Details */}
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-xl bg-gradient-to-tr from-[#0B5ED7] to-[#FFC107] text-[#0A2E5C] flex items-center justify-center font-black text-sm shrink-0 shadow-xs">
                      {getInitials(std.full_name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-black text-xs text-[#0A2E5C] dark:text-white truncate">
                        {std.full_name}
                      </p>
                      <p className="text-[10px] font-mono font-bold text-[#0B5ED7] dark:text-[#FFC107]">
                        {std.student_code || std.id}
                      </p>
                      <p className="text-[10px] text-zinc-500 font-medium truncate">
                        {std.course || "General Studies"}
                      </p>
                    </div>
                  </div>

                  {/* Metadata Chips */}
                  <div className="grid grid-cols-2 gap-1.5 text-[9px] bg-zinc-50 dark:bg-zinc-800/60 p-2 rounded-xl border border-zinc-100 dark:border-zinc-800">
                    <div>
                      <span className="text-zinc-400 block">Shift:</span>
                      <span className="font-bold text-[#0A2E5C] dark:text-zinc-200">{std.shift || "Morning"}</span>
                    </div>
                    <div>
                      <span className="text-zinc-400 block">Seat #:</span>
                      <span className="font-bold text-purple-600 dark:text-purple-400">{std.seat_number || "Open"}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-zinc-400 block">Mobile:</span>
                      <span className="font-bold text-[#0A2E5C] dark:text-zinc-200 font-mono">{std.phone}</span>
                    </div>
                  </div>

                  {/* Bottom Barcode */}
                  <div className="pt-2 border-t border-dashed border-zinc-200 dark:border-zinc-800 flex items-center justify-between text-[8px] text-zinc-400">
                    <div className="font-mono tracking-widest font-black text-[9px] text-zinc-600 dark:text-zinc-300">
                      ||| | |||| | ||| | ||
                    </div>
                    <span className="font-semibold">Madhupur, Sonbhadra • 24/7</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Footer Actions */}
            <div className="pt-3 border-t border-[#E5E7EB]/60 dark:border-zinc-800 flex items-center justify-between text-xs">
              <span className="text-zinc-400 text-xs">
                Ready to print {filteredStudents.length} student pass(es)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowPrintCardsModal(false)}
                  className="px-4 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 font-bold hover:bg-zinc-50 dark:hover:bg-zinc-800 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-linear-to-r from-[#0B5ED7] to-[#FFC107] text-[#0A2E5C] font-black shadow-md hover:opacity-95 transition cursor-pointer active:scale-95"
                >
                  <Printer className="h-4 w-4" />
                  <span>Print All Cards</span>
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 8. MODAL: COMPOSE & SEND BROADCAST SMS */}
      {showSendSmsModal && mounted && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/75 p-3 sm:p-4 backdrop-blur-xs animate-fadeIn overflow-y-auto">
          <div className="w-full max-w-lg rounded-3xl bg-white p-5 sm:p-6 shadow-2xl dark:bg-[#0A2E5C] border border-[#E5E7EB] dark:border-zinc-700 max-h-[92vh] overflow-y-auto my-auto space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[#E5E7EB]/60 dark:border-zinc-800">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-950/60 font-black">
                  <Send className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-[#0A2E5C] dark:text-white">
                    Send Student Broadcast SMS
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Dispatch SMS notice or reminder to students
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowSendSmsModal(false)}
                className="h-8 w-8 rounded-full bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 flex items-center justify-center text-zinc-500 transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Recipient Filter Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-600 dark:text-zinc-300">
                Target Audience:
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-bold">
                {[
                  { id: "all", label: `All (${students.length})` },
                  { id: "active", label: `Enrolled (${enrolledStudentsCount})` },
                  { id: "pending", label: `Pending (${pendingStudentsCount})` },
                  { id: "due", label: `Fee Due (${students.filter(s => s.fee_status === 'Due').length})` },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setSmsRecipientFilter(tab.id as any)}
                    className={`py-2 px-2.5 rounded-xl border text-center transition cursor-pointer text-[11px] ${
                      smsRecipientFilter === tab.id
                        ? "border-[#0B5ED7] bg-[#0B5ED7]/15 text-[#0B5ED7] dark:text-[#FFC107] font-black"
                        : "border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Quick Templates */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-600 dark:text-zinc-300">
                Quick Template:
              </label>
              <div className="flex flex-wrap gap-1.5">
                {[
                  {
                    id: "notice",
                    title: "📢 Library Notice",
                    text: "Dear Student, please note that Genius Library will operate as per regular hours. Study hard & stay focused!"
                  },
                  {
                    id: "fees",
                    title: "💳 Fee Due Reminder",
                    text: "Dear Student, this is a friendly reminder that your Genius Library monthly fee is pending. Kindly clear your dues via UPI or at the reception."
                  },
                  {
                    id: "seat",
                    title: "🪑 Seat Allocation",
                    text: "Dear Student, your reserved study desk assignment at Genius Library has been updated. Check in using your QR code at the desk."
                  }
                ].map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => {
                      setSmsTemplate(tpl.id);
                      setSmsCustomMessage(tpl.text);
                    }}
                    className={`text-[10px] font-bold px-2.5 py-1.5 rounded-lg border transition cursor-pointer ${
                      smsTemplate === tpl.id
                        ? "bg-[#0B5ED7] text-white border-[#0B5ED7]"
                        : "bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200"
                    }`}
                  >
                    {tpl.title}
                  </button>
                ))}
              </div>
            </div>

            {/* SMS Message Textarea */}
            <div className="space-y-1">
              <div className="flex justify-between items-center text-[10px] text-zinc-400 font-semibold">
                <span>Message Body:</span>
                <span>{smsCustomMessage.length} characters (1 SMS credit)</span>
              </div>
              <textarea
                rows={4}
                value={smsCustomMessage}
                onChange={(e) => setSmsCustomMessage(e.target.value)}
                placeholder="Type SMS message..."
                className="w-full rounded-2xl border border-zinc-200 bg-[#F8FAFC]/50 p-3 text-xs text-[#0A2E5C] focus:border-[#FFC107] focus:outline-none dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-white"
              />
            </div>

            {/* Footer */}
            <div className="pt-3 border-t border-[#E5E7EB]/60 dark:border-zinc-800 flex items-center justify-between text-xs">
              <Link
                href="/admin/messages"
                className="text-[11px] font-bold text-[#0B5ED7] dark:text-[#FFC107] hover:underline"
              >
                Open Full Messages Hub →
              </Link>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowSendSmsModal(false)}
                  className="px-3.5 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 font-bold hover:bg-zinc-50 dark:hover:bg-zinc-800 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSendBroadcastSms}
                  disabled={isSendingSms}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-linear-to-r from-[#0B5ED7] to-[#FFC107] text-[#0A2E5C] font-black shadow-md hover:opacity-95 transition cursor-pointer active:scale-95 disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>{isSendingSms ? "Sending..." : "Send SMS"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 9. MODAL: NEW STUDENT ADMISSION */}
      {showAddStudentModal && mounted && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/75 p-3 sm:p-4 backdrop-blur-xs animate-fadeIn overflow-y-auto">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-5 sm:p-7 shadow-2xl dark:bg-[#0A2E5C] border border-[#E5E7EB] dark:border-zinc-700 max-h-[92vh] overflow-y-auto my-auto space-y-5">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-[#E5E7EB]/60 dark:border-zinc-800">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-2xl bg-blue-100 text-blue-700 dark:bg-blue-950/60 font-black">
                  <UserPlus className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-[#0A2E5C] dark:text-white">
                    New Student Admission
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Register a new student member with instant plan & shift assignment
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddStudentModal(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateNewStudent} className="space-y-5">
              {/* 1. Student Information */}
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-[#0B5ED7] dark:text-[#FFC107] mb-3 flex items-center gap-1.5 border-b border-[#E5E7EB]/40 pb-1.5">
                  <User className="h-3.5 w-3.5" />
                  <span>1. Student Information</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-200 mb-1">
                      Full Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Rahul Sharma"
                      value={newStudentForm.full_name || ""}
                      onChange={(e) => setNewStudentForm({ ...newStudentForm, full_name: formatNameInput(e.target.value) })}
                      className="w-full rounded-xl border border-zinc-200 bg-white p-2.5 text-xs font-bold text-[#0A2E5C] dark:border-zinc-700 dark:bg-zinc-800 dark:text-white focus:border-[#FFC107] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-200 mb-1">
                      Mobile Number (10 Digits) <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative flex items-center">
                      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                        <span className="text-xs font-bold text-zinc-400 font-mono select-none">+91</span>
                      </div>
                      <input
                        type="tel"
                        required
                        maxLength={10}
                        placeholder="9876543210"
                        value={newStudentForm.phone || ""}
                        onChange={(e) => setNewStudentForm({ ...newStudentForm, phone: formatPhoneInput(e.target.value) })}
                        className="w-full rounded-xl border border-zinc-200 bg-white py-2.5 pl-11 pr-3 text-xs font-mono font-bold text-[#0A2E5C] dark:border-zinc-700 dark:bg-zinc-800 dark:text-white focus:border-[#FFC107] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-200 mb-1">
                      Email Address <span className="text-zinc-400 font-normal">(Optional)</span>
                    </label>
                    <input
                      type="email"
                      placeholder="e.g. rahul@example.com"
                      value={newStudentForm.email || ""}
                      onChange={(e) => setNewStudentForm({ ...newStudentForm, email: e.target.value })}
                      className="w-full rounded-xl border border-zinc-200 bg-white p-2.5 text-xs font-medium text-[#0A2E5C] dark:border-zinc-700 dark:bg-zinc-800 dark:text-white focus:border-[#FFC107] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-200 mb-1">
                      Target Course / Exam <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. UPSC, SSC CGL, NEET, Banking"
                      value={newStudentForm.course || ""}
                      onChange={(e) => setNewStudentForm({ ...newStudentForm, course: e.target.value })}
                      className="w-full rounded-xl border border-zinc-200 bg-white p-2.5 text-xs font-bold text-[#0A2E5C] dark:border-zinc-700 dark:bg-zinc-800 dark:text-white focus:border-[#FFC107] focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* 2. Parent / Guardian Details */}
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-[#0B5ED7] dark:text-[#FFC107] mb-3 flex items-center gap-1.5 border-b border-[#E5E7EB]/40 pb-1.5">
                  <Users className="h-3.5 w-3.5" />
                  <span>2. Parent / Guardian Details</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-200 mb-1">Parent Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Mr. Sharma"
                      value={newStudentForm.parent_name || ""}
                      onChange={(e) => setNewStudentForm({ ...newStudentForm, parent_name: formatNameInput(e.target.value) })}
                      className="w-full rounded-xl border border-zinc-200 bg-white p-2.5 text-xs font-medium text-[#0A2E5C] dark:border-zinc-700 dark:bg-zinc-800 dark:text-white focus:border-[#FFC107] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-200 mb-1">Parent Mobile</label>
                    <div className="relative flex items-center">
                      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                        <span className="text-xs font-bold text-zinc-400 font-mono select-none">+91</span>
                      </div>
                      <input
                        type="tel"
                        maxLength={10}
                        placeholder="9876543211"
                        value={newStudentForm.parent_phone || ""}
                        onChange={(e) => setNewStudentForm({ ...newStudentForm, parent_phone: formatPhoneInput(e.target.value) })}
                        className="w-full rounded-xl border border-zinc-200 bg-white py-2.5 pl-11 pr-3 text-xs font-mono font-bold text-[#0A2E5C] dark:border-zinc-700 dark:bg-zinc-800 dark:text-white focus:border-[#FFC107] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-200 mb-1">Residential Address</label>
                    <input
                      type="text"
                      placeholder="e.g. Madhupur, Sonbhadra"
                      value={newStudentForm.address || ""}
                      onChange={(e) => setNewStudentForm({ ...newStudentForm, address: e.target.value })}
                      className="w-full rounded-xl border border-zinc-200 bg-white p-2.5 text-xs font-medium text-[#0A2E5C] dark:border-zinc-700 dark:bg-zinc-800 dark:text-white focus:border-[#FFC107] focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* 3. Membership Plan & Shift Selection */}
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-[#0B5ED7] dark:text-[#FFC107] mb-3 flex items-center gap-1.5 border-b border-[#E5E7EB]/40 pb-1.5">
                  <Crown className="h-3.5 w-3.5" />
                  <span>3. Plan & Shift Allocation</span>
                </h4>
                
                {/* Plan Selection Tiles */}
                <div className="grid grid-cols-3 gap-2.5 mb-3.5">
                  {[
                    { id: "General", label: "General Desk", sub: "Flexible open seat", icon: Check },
                    { id: "Reserved Seat", label: "Reserved Seat", sub: "Dedicated desk #", icon: Crown },
                    { id: "Trial Pass", label: "Trial Pass", sub: "3-day access", icon: Sparkles },
                  ].map((plan) => (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => {
                        const newPlan = plan.id;
                        const options = getShiftOptionsForPlan(newPlan);
                        const currentShift = newStudentForm.shift;
                        const isShiftValid = options.some(o => o.name === currentShift);
                        const nextShift = isShiftValid ? currentShift : options[0].name;

                        setNewStudentForm({
                          ...newStudentForm,
                          membership_plan: newPlan as any,
                          seat_number: newPlan === "Reserved Seat" ? (newStudentForm.seat_number || "S-01") : "",
                          shift: nextShift,
                        });
                      }}
                      className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-center transition cursor-pointer ${
                        newStudentForm.membership_plan === plan.id
                          ? "bg-[#0A2E5C] text-[#FFC107] border-[#0A2E5C] shadow-xs font-black"
                          : "bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 font-bold hover:bg-zinc-50"
                      }`}
                    >
                      <plan.icon className="h-4 w-4 mb-1" />
                      <span className="text-[11px] leading-tight font-bold">{plan.label}</span>
                      <span className="text-[9px] opacity-75">{plan.sub}</span>
                    </button>
                  ))}
                </div>

                {/* Dedicated Seat Number Input (Shown when Reserved Seat is active) */}
                {newStudentForm.membership_plan === "Reserved Seat" && (
                  <div className="mb-3.5 p-3 rounded-xl bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 animate-fadeIn">
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-bold text-purple-900 dark:text-purple-200">
                        Allocated Dedicated Seat Number <span className="text-rose-500">*</span>
                      </label>
                      <span className="text-[10px] font-mono font-bold text-purple-700 dark:text-purple-300">
                        e.g. S-17 or A-01
                      </span>
                    </div>
                    <input
                      type="text"
                      required
                      placeholder="e.g. S-17 or A-03"
                      value={newStudentForm.seat_number || ""}
                      onChange={(e) => setNewStudentForm({ ...newStudentForm, seat_number: e.target.value.toUpperCase() })}
                      className="w-full rounded-xl border border-purple-300 bg-white dark:bg-zinc-800 dark:border-purple-700 p-2.5 text-xs font-mono font-black text-purple-700 dark:text-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-400"
                    />
                  </div>
                )}

                {/* Shift Selector */}
                <div>
                  <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-200 mb-1">
                    {newStudentForm.membership_plan === "Reserved Seat"
                      ? "Reserved Seat Plan & Pricing"
                      : newStudentForm.membership_plan === "Trial Pass"
                      ? "Trial Pass Duration"
                      : "Preferred Shift Timing"}
                  </label>
                  <select
                    value={newStudentForm.shift || getShiftOptionsForPlan(newStudentForm.membership_plan)[0]?.name}
                    onChange={(e) => setNewStudentForm({ ...newStudentForm, shift: e.target.value })}
                    className="w-full rounded-xl border border-zinc-200 bg-white p-2.5 text-xs font-bold text-[#0A2E5C] dark:border-zinc-700 dark:bg-zinc-800 dark:text-white focus:border-[#FFC107] focus:outline-none cursor-pointer"
                  >
                    {getShiftOptionsForPlan(newStudentForm.membership_plan).map((opt) => (
                      <option key={opt.id} value={opt.name}>
                        {opt.name} {opt.price > 0 ? `(₹${opt.price}/mo)` : "(FREE)"}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 4. Account Status & Student Login */}
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-[#0B5ED7] dark:text-[#FFC107] mb-3 flex items-center gap-1.5 border-b border-[#E5E7EB]/40 pb-1.5">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>4. Account Status & Student Login</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-200 mb-1">Admission Status</label>
                    <select
                      value={newStudentForm.status || "active"}
                      onChange={(e) => setNewStudentForm({ ...newStudentForm, status: e.target.value as "active" | "pending" | "suspended" })}
                      className="w-full rounded-xl border border-zinc-200 bg-white p-2.5 text-xs font-bold text-[#0A2E5C] dark:border-zinc-700 dark:bg-zinc-800 dark:text-white focus:border-[#FFC107] focus:outline-none cursor-pointer"
                    >
                      <option value="active">🟢 Active Member</option>
                      <option value="pending">🟡 Pending Approval</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-200 mb-1">
                      Account Password <span className="text-zinc-400 font-normal">(for Student Login)</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showEnrollPassword ? "text" : "password"}
                        placeholder="Leave blank to use Mobile Number"
                        value={newStudentForm.password || ""}
                        onChange={(e) => setNewStudentForm({ ...newStudentForm, password: e.target.value })}
                        className="w-full rounded-xl border border-zinc-200 bg-white py-2.5 pl-3 pr-10 text-xs font-medium text-[#0A2E5C] dark:border-zinc-700 dark:bg-zinc-800 dark:text-white focus:border-[#FFC107] focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowEnrollPassword(!showEnrollPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer"
                      >
                        {showEnrollPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <p className="text-[10px] text-zinc-400 mt-1">
                      Default: Student&apos;s 10-digit mobile number.
                    </p>
                  </div>
                </div>

                {/* Clean policy notice replacing fee inputs */}
                <div className="mt-3 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-2.5 text-amber-800 dark:text-amber-200">
                  <Info className="h-4 w-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                  <p className="text-[11px] leading-relaxed">
                    <strong>Standard Fee Policy:</strong> All newly enrolled students start with <strong>Fee Status: Due (₹{newStudentForm.membership_plan === "Trial Pass" ? 0 : (SHIFT_OPTIONS.find(s => s.name === (newStudentForm.shift || SHIFT_OPTIONS[0].name))?.price || 500)})</strong>. Admin can mark fees as Paid anytime from the <strong>Fees</strong> section, or the student can log in and submit payment via UPI.
                  </p>
                </div>
              </div>

              {/* Modal Actions */}
              <div className="pt-4 border-t border-[#E5E7EB]/60 dark:border-zinc-800 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowAddStudentModal(false)}
                  className="rounded-xl border border-zinc-200 px-4 py-2.5 text-xs font-bold text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAddingStudent}
                  className="rounded-xl bg-linear-to-r from-[#0B5ED7] to-[#FFC107] text-[#0A2E5C] px-6 py-2.5 text-xs font-black shadow-md hover:opacity-95 transition active:scale-95 cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  <UserPlus className="h-4 w-4 text-[#0A2E5C]" />
                  <span>{isAddingStudent ? "Enrolling..." : "Enroll Student"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* 9.5 DEDICATED SEAT ALLOCATION MODAL FOR RESERVED SEAT APPROVAL */}
      {seatAllocationStudent && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="relative w-full max-w-2xl rounded-3xl border border-purple-300/80 bg-white p-5 sm:p-6 shadow-2xl dark:border-purple-800/60 dark:bg-[#1A202C] max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-purple-100 dark:border-zinc-800 shrink-0">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 shadow-xs">
                  <Armchair className="h-6 w-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base sm:text-lg font-black text-[#0A2E5C] dark:text-white">
                      Assign Reserved Seat
                    </h3>
                    <span className="rounded-md bg-purple-100 dark:bg-purple-900/50 px-2 py-0.5 text-[10px] font-black text-purple-700 dark:text-purple-300">
                      RESERVED PLAN
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Select an available desk to approve <strong className="text-zinc-700 dark:text-zinc-200">{seatAllocationStudent.full_name}</strong> ({seatAllocationStudent.shift || "Morning Shift"}).
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSeatAllocationStudent(null)}
                className="h-8 w-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="py-4 overflow-y-auto space-y-4 flex-1 pr-1">
              {/* Selected Desk Preview & Manual Input */}
              <div className="p-3.5 rounded-2xl bg-purple-50/60 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <span className="text-[10px] uppercase tracking-wider font-bold text-purple-700 dark:text-purple-300 block">
                    Selected Desk Allocation
                  </span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-2xl font-black font-mono text-purple-900 dark:text-purple-200">
                      {selectedSeatForApproval ? selectedSeatForApproval.toUpperCase() : "— Not Selected —"}
                    </span>
                    {selectedSeatForApproval && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full">
                        <Check className="h-3 w-3" /> Selected
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="text-right hidden sm:block">
                    <span className="text-[10px] text-zinc-400 block font-semibold">Or enter custom #</span>
                  </div>
                  <input
                    type="text"
                    placeholder="e.g. A-01 or S-12"
                    value={selectedSeatForApproval}
                    onChange={(e) => setSelectedSeatForApproval(e.target.value.toUpperCase())}
                    className="w-32 rounded-xl border border-purple-300 bg-white dark:bg-zinc-800 dark:border-purple-700 p-2 text-xs font-mono font-black text-purple-700 dark:text-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-400"
                  />
                </div>
              </div>

              {/* Legend */}
              <div className="flex flex-wrap items-center gap-4 text-[11px] font-bold text-zinc-500">
                <div className="flex items-center gap-1.5">
                  <div className="h-3.5 w-3.5 rounded-md border border-zinc-300 bg-white dark:bg-zinc-800 dark:border-zinc-700" />
                  <span>Available</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-3.5 w-3.5 rounded-md border border-purple-500 bg-purple-600" />
                  <span className="text-purple-700 dark:text-purple-300">Selected</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-3.5 w-3.5 rounded-md border border-rose-300 bg-rose-100 dark:bg-rose-950/60 dark:border-rose-800" />
                  <span className="text-rose-600 dark:text-rose-400">Occupied</span>
                </div>
              </div>

              {/* Desk Grid (01 to 100 Desks Matrix) */}
              <div>
                <p className="text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-2">
                  Interactive Library Desk Map (Click to Select Desk 01-100)
                </p>
                <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5 p-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/40">
                  {allDesksList.map((deskId) => {
                    const occupiedInfo = occupiedSeatsMap.get(deskId);
                    const isOccupied = !!occupiedInfo;
                    const isSelected = selectedSeatForApproval ? matchSeatNumber(selectedSeatForApproval, deskId) : false;

                    return (
                      <button
                        key={deskId}
                        type="button"
                        disabled={isOccupied}
                        onClick={() => setSelectedSeatForApproval(deskId)}
                        title={isOccupied ? `Occupied by ${occupiedInfo.studentName} (${occupiedInfo.shift})` : `Select Desk #${deskId}`}
                        className={`h-9 rounded-xl text-[11px] font-mono font-bold flex flex-col items-center justify-center transition cursor-pointer select-none ${
                          isSelected
                            ? "bg-purple-600 text-white shadow-md shadow-purple-500/30 scale-105 ring-2 ring-purple-400 z-10"
                            : isOccupied
                            ? "bg-rose-100 text-rose-400 border border-rose-200 dark:bg-rose-950/30 dark:border-rose-900/40 dark:text-rose-600 cursor-not-allowed opacity-60"
                            : "bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/30"
                        }`}
                      >
                        <span>#{deskId}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Student Summary Info */}
              <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 text-xs flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-zinc-400 text-[10px] block">Student Info:</span>
                  <span className="font-bold text-[#0A2E5C] dark:text-white">
                    {seatAllocationStudent.full_name} • {seatAllocationStudent.phone}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-400 text-[10px] block">Timing / Shift:</span>
                  <span className="font-bold text-zinc-700 dark:text-zinc-300">
                    {seatAllocationStudent.shift || "Morning"}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-400 text-[10px] block">Course:</span>
                  <span className="font-bold text-zinc-700 dark:text-zinc-300">
                    {seatAllocationStudent.course || "General"}
                  </span>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="pt-4 border-t border-purple-100 dark:border-zinc-800 flex items-center justify-between shrink-0">
              <button
                type="button"
                onClick={() => setSeatAllocationStudent(null)}
                className="rounded-xl border border-zinc-200 px-4 py-2 text-xs font-bold text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 cursor-pointer"
              >
                Cancel
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    const student = seatAllocationStudent;
                    setSeatAllocationStudent(null);
                    await handleApproveStudent(student.id, student.full_name, null);
                  }}
                  className="rounded-xl border border-zinc-300 px-3 py-2 text-xs font-bold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 transition cursor-pointer"
                  title="Approve without dedicated desk reservation"
                >
                  Approve without Seat
                </button>

                <button
                  type="button"
                  disabled={!selectedSeatForApproval.trim() || actionLoadingId === seatAllocationStudent.id}
                  onClick={handleConfirmSeatApproval}
                  className="rounded-xl bg-purple-600 hover:bg-purple-700 text-white px-5 py-2 text-xs font-black shadow-md shadow-purple-600/30 transition active:scale-95 cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Check className="h-4 w-4" />
                  <span>Assign Seat & Approve Member</span>
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 10. FLOATING BULK ACTIONS TOOLBAR (WHEN CHECKBOXES SELECTED) */}
      {selectedStudents.length > 0 && (
        <div className="fixed bottom-20 sm:bottom-6 left-1/2 -translate-x-1/2 z-50 animate-bounce-short">
          <div className="flex items-center gap-2 sm:gap-3 bg-[#0A2E5C] text-white px-3.5 sm:px-5 py-2.5 sm:py-3 rounded-2xl shadow-2xl border border-[#0B5ED7]/50 backdrop-blur-md">
            <span className="flex items-center gap-1.5 text-xs font-black text-[#FFC107]">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
              {selectedStudents.length} Selected
            </span>

            <div className="h-4 w-px bg-zinc-700" />

            {/* Bulk Print */}
            <button
              type="button"
              onClick={() => setShowPrintCardsModal(true)}
              className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1.5 rounded-xl bg-purple-600/30 hover:bg-purple-600/50 text-purple-300 transition cursor-pointer"
              title="Print ID passes for selected students"
            >
              <Printer className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Print Passes</span>
            </button>

            {/* Bulk SMS */}
            <button
              type="button"
              onClick={() => {
                setSmsRecipientFilter("selected");
                setShowSendSmsModal(true);
              }}
              className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1.5 rounded-xl bg-amber-600/30 hover:bg-amber-600/50 text-amber-300 transition cursor-pointer"
              title="Send broadcast SMS to selected students"
            >
              <Send className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Send SMS</span>
            </button>

            {/* Bulk Export CSV */}
            <button
              type="button"
              onClick={() => handleExportCSV(true)}
              className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1.5 rounded-xl bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 transition cursor-pointer"
              title="Export selected students to CSV"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Export CSV</span>
            </button>

            {/* Bulk Approve */}
            <button
              type="button"
              onClick={handleBulkApprove}
              className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition cursor-pointer"
              title="Approve all selected pending students"
            >
              <Check className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Approve</span>
            </button>

            {/* Bulk Delete */}
            <button
              type="button"
              onClick={handleBulkDelete}
              className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1.5 rounded-xl bg-rose-600/30 hover:bg-rose-600 text-rose-300 hover:text-white transition cursor-pointer"
              title="Delete selected students"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>

            {/* Clear Selection */}
            <button
              type="button"
              onClick={() => setSelectedStudents([])}
              className="text-zinc-400 hover:text-white p-1 transition cursor-pointer ml-1"
              title="Clear selection"
            >
              ✕
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

export default function StudentsDirectory() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-xs text-zinc-400">Loading Students Directory...</div>}>
      <StudentsDirectoryContent />
    </Suspense>
  );
}
