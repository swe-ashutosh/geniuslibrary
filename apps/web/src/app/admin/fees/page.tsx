"use client";

/**
 * [WEB • PAGE] Fees Management
 *
 * Create fee records, collect/payments, delete, and printable invoices
 * via FeeInvoiceModal.
 */
import { useState, useEffect, useMemo } from "react";
import { 
  IndianRupee, Search, Download, Plus, 
  Clock, CheckCircle2, AlertCircle, ArrowUpRight, ArrowDownRight,
  Receipt, Wallet, History, AlertTriangle, FileText, X, Check,
  Printer, Sparkles, User, Calendar, Tag, RefreshCw, Trash2, Mail,
  MessageCircle, CreditCard, ChevronRight, TrendingUp, PieChart,
  DollarSign, ShieldAlert, CheckCheck, Send, ExternalLink, Filter, Phone,
  List, LayoutGrid, ChevronDown, CalendarDays, SlidersHorizontal
} from "lucide-react";
import { 
  getFees, 
  createFee, 
  deleteFee,
  verifyUpiClaim,
  clearUpiClaim,
  clearStudentUpiClaims,
  sendFeeReceiptEmail,
  getExpenses,
  createExpense,
  deleteExpense,
  createNotification,
  ExpenseRecord,
  FeeRecord,
  generateInvoiceNumber 
} from "@/lib/api";
import { createClient } from "@/lib/supabase/client";
import { isMasterAdminEmail } from "@/lib/config";
import FeeInvoiceModal, { InvoiceData } from "@/components/FeeInvoiceModal";

interface StudentProfile {
  id: string;
  studentCode: string;
  fullName: string;
  phone: string;
  email: string;
  shift: string;
  membershipPlan: string;
  feeStatus: "Paid" | "Due";
  dueAmount: number;
  createdAt: string;
}

interface FeeTransaction {
  id: string;
  receiptNo: string;
  studentId: string;
  rawStudentId?: string;
  studentName: string;
  email: string;
  phone: string;
  type: string;
  amount: number;
  totalDue?: number;
  remainingDue?: number;
  date: string;
  dateRaw: string;
  status: "Paid" | "Pending" | "Overdue";
  method: "UPI" | "Cash" | "Card" | "Bank Transfer";
  shift?: string;
  notes?: string;
}

interface DueRecord {
  id: string;
  studentId: string;
  studentCode: string;
  studentName: string;
  phone: string;
  email: string;
  type: string;
  amount: number;
  dueDate: string;
  status: "Pending" | "Overdue" | "Defaulter (2+ Mo)";
  isDefaulter: boolean;
  monthsOverdue: number;
  shift: string;
}

export default function FeesAndExpensesManagement() {
  const [mounted, setMounted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [transactions, setTransactions] = useState<FeeTransaction[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);

  // Search & Filter States
  const [ledgerSearch, setLedgerSearch] = useState("");
  const [ledgerStatusFilter, setLedgerStatusFilter] = useState<"All" | "Pending" | "Overdue" | "Defaulter">("All");
  
  const [txSearch, setTxSearch] = useState("");
  const [txModeFilter, setTxModeFilter] = useState("All");

  // Table vs Grid View Modes
  const [duesViewMode, setDuesViewMode] = useState<"table" | "grid">("table");
  const [txViewMode, setTxViewMode] = useState<"table" | "grid">("table");

  // Date Range Filter States (Matching Image 3 UI)
  const [dateRangePreset, setDateRangePreset] = useState<"Today" | "Yesterday" | "Last 7 Days" | "Last 30 Days" | "All Time" | "Custom">("All Time");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [tempPreset, setTempPreset] = useState<"Today" | "Yesterday" | "Last 7 Days" | "Last 30 Days" | "Custom">("Today");
  const [tempFromDate, setTempFromDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [tempToDate, setTempToDate] = useState<string>(new Date().toISOString().split("T")[0]);

  // Mobile Filter Drawer State
  const [mobileFilterSection, setMobileFilterSection] = useState<"ledger" | "tx" | null>(null);

  // Date Presets Handler
  const handleSelectPreset = (preset: "Today" | "Yesterday" | "Last 7 Days" | "Last 30 Days") => {
    setTempPreset(preset);
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    if (preset === "Today") {
      setTempFromDate(todayStr);
      setTempToDate(todayStr);
    } else if (preset === "Yesterday") {
      const y = new Date();
      y.setDate(y.getDate() - 1);
      const yStr = y.toISOString().split("T")[0];
      setTempFromDate(yStr);
      setTempToDate(yStr);
    } else if (preset === "Last 7 Days") {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      setTempFromDate(d.toISOString().split("T")[0]);
      setTempToDate(todayStr);
    } else if (preset === "Last 30 Days") {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      setTempFromDate(d.toISOString().split("T")[0]);
      setTempToDate(todayStr);
    }
  };

  const handleApplyDateFilter = () => {
    setDateRangePreset(tempPreset as any);
    setFromDate(tempFromDate);
    setToDate(tempToDate);
    setIsDatePickerOpen(false);
    showToast(`📅 Filter applied: ${tempPreset === "Custom" ? `${tempFromDate} to ${tempToDate}` : tempPreset}`);
  };

  const handleResetToToday = () => {
    const todayStr = new Date().toISOString().split("T")[0];
    setTempPreset("Today");
    setTempFromDate(todayStr);
    setTempToDate(todayStr);
    setDateRangePreset("Today");
    setFromDate(todayStr);
    setToDate(todayStr);
    setIsDatePickerOpen(false);
    showToast("📅 Filter reset to Today");
  };

  const handleClearDateFilter = () => {
    setDateRangePreset("All Time");
    setFromDate("");
    setToDate("");
    setIsDatePickerOpen(false);
    showToast("📅 Date filter cleared (Showing All Time)");
  };

  const formatDisplayDate = (dStr: string) => {
    if (!dStr) return "";
    const parts = dStr.split("-");
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dStr;
  };

  // Notification Toast
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  // Modals
  const [isCollectModalOpen, setIsCollectModalOpen] = useState(false);
  const [isAddExpenseModalOpen, setIsAddExpenseModalOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceData | null>(null);
  const [sendingReceiptId, setSendingReceiptId] = useState<string | null>(null);

  // Drilldown KPI Modals
  const [activeKpiModal, setActiveKpiModal] = useState<
    "collection" | "dues" | "upi" | "defaulters" | "expenses" | "revenue" | null
  >(null);
  const [kpiHistoryScope, setKpiHistoryScope] = useState<"all" | "period">("all");
  const [selectedMonthFilter, setSelectedMonthFilter] = useState<string>("current");

  // Collect Fee Form State
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [studentSearchTerm, setStudentSearchTerm] = useState("");
  const [showStudentDropdown, setShowStudentDropdown] = useState(false);
  const [newStudentName, setNewStudentName] = useState("");
  const [newStudentPhone, setNewStudentPhone] = useState("");
  const [newStudentEmail, setNewStudentEmail] = useState("");
  const [totalBilledDue, setTotalBilledDue] = useState<number>(600);
  const [newAmount, setNewAmount] = useState<number>(600);
  const [newType, setNewType] = useState("Monthly Seat Fee");
  const [newMethod, setNewMethod] = useState<"UPI" | "Cash" | "Card" | "Bank Transfer">("UPI");
  const [newShift, setNewShift] = useState("Morning Shift");
  const [isSubmittingFee, setIsSubmittingFee] = useState(false);

  // Add Expense Form State
  const [newExpenseTitle, setNewExpenseTitle] = useState("");
  const [newExpenseCategory, setNewExpenseCategory] = useState("Electricity Bill");
  const [newExpenseAmount, setNewExpenseAmount] = useState<number>(1000);
  const [newExpenseDate, setNewExpenseDate] = useState(new Date().toISOString().split("T")[0]);
  const [newExpenseMethod, setNewExpenseMethod] = useState<"UPI" | "Cash" | "Bank Transfer" | "Card">("UPI");
  const [newExpenseNotes, setNewExpenseNotes] = useState("");
  const [isSubmittingExpense, setIsSubmittingExpense] = useState(false);

  // -------------------------------------------------------------
  // Data Fetching: 100% Supabase Primary
  // -------------------------------------------------------------
  const loadData = async () => {
    setIsLoading(true);
    try {
      const supabase = createClient();
      const [feesData, expData, sbProfilesRes] = await Promise.all([
        getFees(),
        getExpenses(),
        supabase.from("profiles").select("*"),
      ]);

      setExpenses(expData || []);

      // Build verified students map from Supabase profiles
      const studentMap = new Map<string, StudentProfile>();
      const unifiedStudents: StudentProfile[] = [];

      if (sbProfilesRes.data && Array.isArray(sbProfilesRes.data)) {
        sbProfilesRes.data.forEach((p: any) => {
          const hasPhone = p.phone && String(p.phone).trim().length > 0;
          if (!isMasterAdminEmail(p.email) && p.role !== "admin" && hasPhone) {
            const stdObj: StudentProfile = {
              id: p.id,
              studentCode: p.student_code || p.member_id || `SDL-${p.id.slice(-4).toUpperCase()}`,
              fullName: p.full_name || "Student Member",
              phone: p.phone || "",
              email: p.email || "",
              shift: p.shift || "Morning Shift",
              membershipPlan: p.membership_plan || "General",
              feeStatus: p.fee_status || (p.due_amount && Number(p.due_amount) > 0 ? "Due" : "Paid"),
              dueAmount: Number(p.due_amount || 0),
              createdAt: p.created_at || new Date().toISOString(),
            };
            unifiedStudents.push(stdObj);
            studentMap.set(p.id, stdObj);
            if (p.email) studentMap.set(p.email.toLowerCase(), stdObj);
            if (stdObj.studentCode) studentMap.set(stdObj.studentCode, stdObj);
          }
        });
      }

      setStudents(unifiedStudents);

      // Build transaction records (excluding internal expense records)
      const nonExpenseFees = (feesData || []).filter(f => f.studentId !== "LIBRARY_EXPENSE" && f.type !== "Expense");
      const mappedTxs: FeeTransaction[] = nonExpenseFees.map((f) => {
        const extra = f as any;
        const std = studentMap.get(f.studentId) || (extra.studentEmail ? studentMap.get(String(extra.studentEmail).toLowerCase()) : null);
        const parsedRemaining = extra.remainingDue !== undefined && extra.remainingDue !== null
          ? Number(extra.remainingDue)
          : (std?.dueAmount && std.dueAmount > 0 ? Number(std.dueAmount) : undefined);
        const parsedTotal = extra.totalDue !== undefined && extra.totalDue !== null
          ? Number(extra.totalDue)
          : (parsedRemaining !== undefined ? f.amount + parsedRemaining : undefined);

        const rawDate = f.paidAt || f.createdAt || new Date().toISOString();
        const formattedDate = new Date(rawDate).toLocaleDateString("en-IN", { 
          day: "2-digit", 
          month: "short", 
          year: "numeric" 
        });

        // Parse payment method from description or fallback to UPI
        let method: "UPI" | "Cash" | "Card" | "Bank Transfer" = "UPI";
        const desc = (f.description || "").toLowerCase();
        if (desc.includes("cash")) method = "Cash";
        else if (desc.includes("card")) method = "Card";
        else if (desc.includes("bank") || desc.includes("neft")) method = "Bank Transfer";

        return {
          id: f.id,
          receiptNo: f.receiptNo || f.id,
          studentId: std?.studentCode || f.studentId,
          rawStudentId: f.studentId,
          studentName: f.studentName || std?.fullName || "Student Member",
          email: std?.email || extra.studentEmail || "",
          phone: std?.phone || "",
          type: f.type || "Monthly Seat & Facility Fee",
          amount: f.amount,
          totalDue: parsedTotal,
          remainingDue: parsedRemaining,
          date: formattedDate,
          dateRaw: rawDate,
          status: f.paid ? "Paid" : "Pending",
          method,
          shift: std?.shift || "General",
          notes: f.description || "",
        };
      });

      setTransactions(mappedTxs);
    } catch (err) {
      console.error("Error loading fees & expenses data:", err);
      showToast("Notice: Loaded data from offline cache");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setMounted(true);
    loadData();
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("modal") === "upi" || params.get("upi") === "true") {
        setActiveKpiModal("upi");
      }
    }
  }, []);

  // -------------------------------------------------------------
  // Month-Accurate Calendar Calculations (Exact Day 1 Reset)
  // -------------------------------------------------------------
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-11
  const todayIso = now.toISOString().split("T")[0];
  const currentMonthName = now.toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  const isDateInCurrentMonth = (dateStr: string) => {
    const d = new Date(dateStr);
    return !isNaN(d.getTime()) && d.getFullYear() === currentYear && d.getMonth() === currentMonth;
  };

  const isDateToday = (dateStr: string) => {
    const d = new Date(dateStr);
    return !isNaN(d.getTime()) && d.toISOString().split("T")[0] === todayIso;
  };

  // -------------------------------------------------------------
  // Dynamic & Month-Accurate Calculations (With All-Time History Totals)
  // -------------------------------------------------------------
  const isDateFilterActive = dateRangePreset !== "All Time" && Boolean(fromDate && toDate);

  const isDateInKpiScope = (dateStr: string) => {
    if (isDateFilterActive) {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return false;
      const iso = d.toISOString().split("T")[0];
      return iso >= fromDate && iso <= toDate;
    }
    return isDateInCurrentMonth(dateStr);
  };

  // 1. Collection Calculations
  const paidTransactions = useMemo(() => transactions.filter(t => t.status === "Paid"), [transactions]);

  // All-Time Collection (for History Records Modal)
  const allTimeCollection = useMemo(() => {
    return paidTransactions.reduce((sum, t) => sum + Number(t.amount || 0), 0);
  }, [paidTransactions]);

  const thisMonthPaidTxs = useMemo(() => {
    return paidTransactions.filter(t => isDateInCurrentMonth(t.dateRaw));
  }, [paidTransactions, currentYear, currentMonth]);

  // Dynamic KPI Paid Transactions (Current Month by default, or Selected Date Range)
  const dynamicKpiPaidTxs = useMemo(() => {
    return paidTransactions.filter(t => isDateInKpiScope(t.dateRaw));
  }, [paidTransactions, isDateFilterActive, fromDate, toDate, currentYear, currentMonth]);

  const monthlyCollection = useMemo(() => {
    return thisMonthPaidTxs.reduce((sum, t) => sum + Number(t.amount || 0), 0);
  }, [thisMonthPaidTxs]);

  const effectiveCollectionTotal = useMemo(() => {
    return dynamicKpiPaidTxs.reduce((sum, t) => sum + Number(t.amount || 0), 0);
  }, [dynamicKpiPaidTxs]);

  const todayCollection = useMemo(() => {
    return paidTransactions
      .filter(t => isDateToday(t.dateRaw))
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);
  }, [paidTransactions, todayIso]);

  // 2. Student Dues Ledger & Defaulters Calculation
  const studentDuesLedger: DueRecord[] = useMemo(() => {
    const duesList: DueRecord[] = [];
    const currentTime = now.getTime();

    students.forEach((s) => {
      const isDue = s.feeStatus === "Due" || (s.dueAmount && s.dueAmount > 0);
      if (isDue) {
        const dueAmt = s.dueAmount && s.dueAmount > 0 ? s.dueAmount : 600;
        const joinDate = new Date(s.createdAt);
        const joinTime = joinDate.getTime();
        const daysOverdue = Math.max(0, Math.floor((currentTime - joinTime) / (1000 * 60 * 60 * 24)));
        const monthsOverdue = Math.floor(daysOverdue / 30);
        const isDefaulter = daysOverdue >= 60; // 2+ months unpaid

        // Status Rule: 
        // 1. Due date is the admission/billing date
        // 2. Overdue after 15 days of non-payment
        // 3. Defaulter after 2 months (60+ days) continuous non-payment
        let statusText: "Pending" | "Overdue" | "Defaulter (2+ Mo)" = "Pending";
        if (isDefaulter) {
          statusText = "Defaulter (2+ Mo)";
        } else if (daysOverdue > 15) {
          statusText = "Overdue";
        }

        // Display the actual due date that student needs to pay (admission/cycle date)
        const formattedDueDate = joinDate.toLocaleDateString("en-IN", { 
          day: "2-digit", 
          month: "short", 
          year: "numeric" 
        });

        duesList.push({
          id: `due-${s.id}`,
          studentId: s.id,
          studentCode: s.studentCode,
          studentName: s.fullName,
          phone: s.phone,
          email: s.email,
          type: "Monthly Seat Fee",
          amount: dueAmt,
          dueDate: formattedDueDate,
          status: statusText,
          isDefaulter,
          monthsOverdue: Math.max(1, monthsOverdue),
          shift: s.shift,
        });
      }
    });

    return duesList;
  }, [students]);

  const totalPendingDuesAmount = useMemo(() => {
    return studentDuesLedger.reduce((sum, d) => sum + d.amount, 0);
  }, [studentDuesLedger]);

  const pendingStudentsCount = studentDuesLedger.length;

  // 3. UPI Claims (Pending UPI transactions & student submitted claims)
  const upiClaimsList = useMemo(() => {
    return transactions.filter(t => 
      t.status === "Pending" && 
      (t.method === "UPI" || t.type === "UPI Claim" || (t.notes && (t.notes.toLowerCase().includes("upi") || t.notes.toLowerCase().includes("utr"))))
    );
  }, [transactions]);

  // 4. Defaulters (Over 2 months / 60+ days)
  const defaultersList = useMemo(() => {
    return studentDuesLedger.filter(d => d.isDefaulter);
  }, [studentDuesLedger]);

  const defaultersTotalAmount = useMemo(() => {
    return defaultersList.reduce((sum, d) => sum + d.amount, 0);
  }, [defaultersList]);

  // 5. Expenses: All-Time vs Dynamic
  const allTimeExpensesTotal = useMemo(() => {
    return expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  }, [expenses]);

  const thisMonthExpenses = useMemo(() => {
    return expenses.filter(e => isDateInCurrentMonth(e.date || e.createdAt));
  }, [expenses, currentYear, currentMonth]);

  const dynamicKpiExpenses = useMemo(() => {
    return expenses.filter(e => isDateInKpiScope(e.date || e.createdAt));
  }, [expenses, isDateFilterActive, fromDate, toDate, currentYear, currentMonth]);

  const monthlyExpensesTotal = useMemo(() => {
    return thisMonthExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  }, [thisMonthExpenses]);

  const effectiveExpensesTotal = useMemo(() => {
    return dynamicKpiExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  }, [dynamicKpiExpenses]);

  // 6. Net Revenue: All-Time vs Dynamic
  const allTimeNetRevenue = allTimeCollection - allTimeExpensesTotal;
  const monthlyNetRevenue = monthlyCollection - monthlyExpensesTotal;
  const effectiveNetRevenue = effectiveCollectionTotal - effectiveExpensesTotal;

  // -------------------------------------------------------------
  // Filtered Tables
  // -------------------------------------------------------------
  const filteredLedger = useMemo(() => {
    return studentDuesLedger.filter((d) => {
      if (ledgerStatusFilter === "Pending" && d.status !== "Pending") return false;
      if (ledgerStatusFilter === "Overdue" && d.status !== "Overdue") return false;
      if (ledgerStatusFilter === "Defaulter" && !d.isDefaulter) return false;

      if (ledgerSearch.trim()) {
        const q = ledgerSearch.toLowerCase().trim();
        const matchName = d.studentName.toLowerCase().includes(q);
        const matchCode = d.studentCode.toLowerCase().includes(q);
        const matchPhone = d.phone.includes(q);
        if (!matchName && !matchCode && !matchPhone) return false;
      }
      return true;
    });
  }, [studentDuesLedger, ledgerStatusFilter, ledgerSearch]);

  const filteredTransactions = useMemo(() => {
    return paidTransactions.filter((t) => {
      if (txModeFilter !== "All" && t.method !== txModeFilter) return false;

      // Date Range Filter
      if (fromDate && toDate && dateRangePreset !== "All Time") {
        const rawDate = t.dateRaw;
        if (rawDate) {
          const tDate = new Date(rawDate).toISOString().split("T")[0];
          if (tDate < fromDate || tDate > toDate) return false;
        }
      }

      if (txSearch.trim()) {
        const q = txSearch.toLowerCase().trim();
        const matchName = t.studentName.toLowerCase().includes(q);
        const matchInv = t.receiptNo.toLowerCase().includes(q);
        const matchId = t.studentId.toLowerCase().includes(q);
        const matchPhone = t.phone.includes(q);
        if (!matchName && !matchInv && !matchId && !matchPhone) return false;
      }
      return true;
    });
  }, [paidTransactions, txModeFilter, txSearch, fromDate, toDate, dateRangePreset]);

  // -------------------------------------------------------------
  // Actions: WhatsApp & Payment Pre-fill
  // -------------------------------------------------------------
  const handleOpenWhatsAppReminder = (due: DueRecord) => {
    const cleanPhone = due.phone.replace(/[^0-9]/g, "");
    const formattedPhone = cleanPhone.startsWith("91") ? cleanPhone : `91${cleanPhone}`;
    const text = encodeURIComponent(
      `Hello ${due.studentName},\n\nThis is a friendly reminder from Genius Library, Madhupur.\nYour library seat fee of ₹${due.amount} (${due.type}) is currently due.\n\nDue Date: ${due.dueDate}\nStatus: ${due.status}\n\nPlease settle your dues via UPI or at the library front desk to keep your seat reserved.\nThank you!`
    );
    window.open(`https://wa.me/${formattedPhone}?text=${text}`, "_blank");
  };

  const handlePreFillCollectModal = (due: DueRecord) => {
    setSelectedStudentId(due.studentId);
    setNewStudentName(due.studentName);
    setNewStudentPhone(due.phone);
    setNewStudentEmail(due.email);
    setTotalBilledDue(due.amount);
    setNewAmount(due.amount);
    setNewShift(due.shift || "Morning Shift");
    setNewType(due.type || "Monthly Seat Fee");
    setIsCollectModalOpen(true);
  };

  // -------------------------------------------------------------
  // UPI Claim Handlers (Verify & Clear)
  // -------------------------------------------------------------
  const [claimActionLoadingId, setClaimActionLoadingId] = useState<string | null>(null);

  const handleVerifyUpiClaim = async (claim: FeeTransaction) => {
    setClaimActionLoadingId(`verify-${claim.id}`);
    try {
      await verifyUpiClaim(claim.id, {
        studentId: claim.rawStudentId || claim.studentId,
        studentName: claim.studentName,
        amount: claim.amount,
        receiptNo: claim.receiptNo,
      });

      // Clear any remaining pending claims for this student
      await clearStudentUpiClaims(claim.rawStudentId || claim.studentId);
      if (claim.studentName) {
        await clearStudentUpiClaims(claim.studentName);
      }

      setTransactions(prev =>
        prev.map(t => (t.id === claim.id ? { ...t, status: "Paid" as const } : t))
      );
      showToast(`✓ UPI Claim for ${claim.studentName} (₹${claim.amount}) verified & marked Paid!`);
      await loadData();
    } catch (err: any) {
      alert(`Failed to verify claim: ${err?.message || "Please try again"}`);
    } finally {
      setClaimActionLoadingId(null);
    }
  };

  const handleClearUpiClaim = async (claim: FeeTransaction) => {
    setClaimActionLoadingId(`clear-${claim.id}`);
    try {
      await clearUpiClaim(claim.id);
      await clearStudentUpiClaims(claim.rawStudentId || claim.studentId);
      if (claim.studentName) {
        await clearStudentUpiClaims(claim.studentName);
      }

      setTransactions(prev => prev.filter(t => t.id !== claim.id));
      showToast(`UPI claim of ₹${claim.amount} cleared.`);
      await loadData();
    } catch (err: any) {
      alert(`Failed to clear claim: ${err?.message || "Please try again"}`);
    } finally {
      setClaimActionLoadingId(null);
    }
  };

  const handleVerifyAllClaims = async () => {
    if (upiClaimsList.length === 0) return;
    setClaimActionLoadingId("verify-all");
    try {
      for (const claim of upiClaimsList) {
        await verifyUpiClaim(claim.id, {
          studentId: claim.rawStudentId || claim.studentId,
          studentName: claim.studentName,
          amount: claim.amount,
        });
        await clearStudentUpiClaims(claim.rawStudentId || claim.studentId);
        if (claim.studentName) await clearStudentUpiClaims(claim.studentName);
      }
      showToast(`✓ All ${upiClaimsList.length} UPI claims verified and marked Paid!`);
      await loadData();
    } catch (err: any) {
      alert(`Failed: ${err?.message || "Please try again"}`);
    } finally {
      setClaimActionLoadingId(null);
    }
  };

  // Handle Collecting Fees
  const handleCollectFeesSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudentName.trim() || newAmount <= 0) return;
    setIsSubmittingFee(true);

    try {
      const generatedReceipt = generateInvoiceNumber(transactions.map(t => t.receiptNo));
      const remainingDue = Math.max(0, totalBilledDue - newAmount);
      const isPartial = remainingDue > 0;
      const targetStudent = students.find(s => s.id === selectedStudentId || s.fullName.toLowerCase() === newStudentName.toLowerCase());

      await createFee({
        studentId: targetStudent ? targetStudent.id : `std-${Date.now()}`,
        studentName: newStudentName.trim(),
        studentEmail: newStudentEmail.trim() || targetStudent?.email,
        type: newType,
        amount: newAmount,
        totalDue: totalBilledDue,
        remainingDue,
        paid: true,
        paidAt: new Date().toISOString(),
        receiptNo: generatedReceipt,
        description: isPartial 
          ? `Partial Fee Payment (Paid ₹${newAmount} of ₹${totalBilledDue}, Remaining ₹${remainingDue}) via ${newMethod}`
          : `Full Fee Payment of ₹${newAmount} via ${newMethod} for ${newShift}`,
      });

      // Update student profile in Supabase
      if (targetStudent) {
        try {
          const supabase = createClient();
          await supabase.from("profiles").update({
            fee_status: isPartial ? "Due" : "Paid",
            due_amount: remainingDue,
            updated_at: new Date().toISOString(),
          }).eq("id", targetStudent.id);
        } catch (sbErr) {
          console.warn("Supabase profile update:", sbErr);
        }

        // Notify student of successful fee payment
        createNotification({
          recipientRole: "student",
          recipientId: targetStudent.id,
          title: "🧾 Fee Payment Successful!",
          message: `Your payment of ₹${newAmount} has been recorded successfully. Receipt #${generatedReceipt}.`,
          type: "payment",
          actionUrl: "/student/fees",
        }).catch(() => {});

        // Dispatch Invoice Receipt Email
        const destEmail = targetStudent.email || newStudentEmail.trim();
        if (destEmail) {
          sendFeeReceiptEmail(generatedReceipt, destEmail, remainingDue, totalBilledDue).catch(() => {});
        }
      }

      // Automatically remove/clear any pending UPI claims for this student upon receiving fee
      try {
        await clearStudentUpiClaims(targetStudent ? targetStudent.id : newStudentName);
        await clearStudentUpiClaims(newStudentName);
        if (targetStudent?.email) {
          await clearStudentUpiClaims(targetStudent.email);
        }
      } catch (claimErr) {
        console.warn("Auto-clear student upi claims notice:", claimErr);
      }

      setIsCollectModalOpen(false);
      showToast(`✓ Received ₹${newAmount} from ${newStudentName}! Invoice ${generatedReceipt} created.`);
      await loadData();
    } catch (err: any) {
      alert("Error saving fee: " + err.message);
    } finally {
      setIsSubmittingFee(false);
    }
  };

  // Handle Adding Expense
  const handleAddExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExpenseTitle.trim() || newExpenseAmount <= 0) return;
    setIsSubmittingExpense(true);

    try {
      await createExpense({
        title: newExpenseTitle.trim(),
        category: newExpenseCategory,
        amount: newExpenseAmount,
        date: newExpenseDate,
        paymentMethod: newExpenseMethod,
        notes: newExpenseNotes.trim(),
      });

      setIsAddExpenseModalOpen(false);
      setNewExpenseTitle("");
      setNewExpenseAmount(1000);
      setNewExpenseNotes("");
      showToast(`✓ Logged operational expense of ₹${newExpenseAmount} (${newExpenseCategory})!`);
      await loadData();
    } catch (err: any) {
      alert("Error recording expense: " + err.message);
    } finally {
      setIsSubmittingExpense(false);
    }
  };

  // Delete Paid Fee Record
  const handleDeleteTransaction = async (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete payment record for ${name}?`)) {
      try {
        await deleteFee(id);
        showToast(`✓ Payment record deleted.`);
        await loadData();
      } catch (err: any) {
        showToast(`Failed to delete: ${err.message}`);
      }
    }
  };

  // Delete Expense Record
  const handleDeleteExpenseItem = async (id: string, title: string) => {
    if (confirm(`Delete expense record "${title}"?`)) {
      try {
        await deleteExpense(id);
        showToast(`✓ Expense record deleted.`);
        await loadData();
      } catch (err: any) {
        showToast(`Failed to delete: ${err.message}`);
      }
    }
  };

  // Send Email Receipt
  const handleSendEmailReceipt = async (tx: FeeTransaction) => {
    if (!tx.email || !tx.email.includes("@")) {
      showToast("⚠️ Student email address not found on record");
      return;
    }
    setSendingReceiptId(tx.id);
    try {
      const res = await sendFeeReceiptEmail(tx.id, tx.email, tx.remainingDue, tx.totalDue);
      if (res.success) {
        showToast(`✓ Receipt emailed to ${tx.email}!`);
      } else {
        showToast(`⚠️ Could not send email: ${res.error || "Unknown error"}`);
      }
    } catch (err: any) {
      showToast(`⚠️ Email error: ${err.message}`);
    } finally {
      setSendingReceiptId(null);
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    const headers = ["Invoice ID", "Student ID", "Student Name", "Fee Type", "Amount", "Date", "Payment Method", "Status"];
    const rows = paidTransactions.map(t => [
      t.receiptNo,
      t.studentId,
      t.studentName,
      t.type,
      t.amount,
      t.date,
      t.method,
      t.status
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Genius_Library_Fees_Report_${todayIso}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("✓ Exported fee collections report as CSV");
  };

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto pb-16">
      
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed top-6 right-6 z-[999999] flex items-center gap-2 rounded-2xl bg-[#0A2E5C] px-4 py-3 text-xs font-bold text-[#FFC107] shadow-2xl border border-[#FFC107]/40 animate-in fade-in slide-in-from-top-4">
          <Check className="h-4 w-4 text-emerald-400" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. HEADER & MAIN ACTIONS                                                  */}
      {/* ========================================================================= */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between bg-white dark:bg-zinc-900 p-5 sm:p-6 rounded-3xl border border-[#E5E7EB]/60 dark:border-zinc-800 shadow-xs">
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
            <Receipt className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black text-[#0A2E5C] dark:text-white">
                Fees & Expenses Management
              </h1>
              <span className="hidden sm:inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#F8FAFC] dark:bg-zinc-800 text-[#0B5ED7] dark:text-[#FFC107]">
                {currentMonthName}
              </span>
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">
              Live monthly collections, operational expenses, defaulters tracking, and student dues ledger.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-center sm:justify-end gap-1.5 sm:gap-2.5 flex-nowrap shrink-0 w-full sm:w-auto px-1 sm:px-0">
          {/* Calendar Custom Date Range Dropdown (Matching Screenshot 3) */}
          <div className="relative">
            <button 
              onClick={() => {
                if (!isDatePickerOpen) {
                  if (fromDate && toDate) {
                    setTempFromDate(fromDate);
                    setTempToDate(toDate);
                  }
                }
                setIsDatePickerOpen(!isDatePickerOpen);
              }}
              className={`inline-flex items-center gap-1 sm:gap-2 rounded-xl border px-2.5 sm:px-3.5 py-1.5 sm:py-2 text-[11px] sm:text-xs font-bold transition active:scale-95 cursor-pointer shadow-xs whitespace-nowrap ${
                dateRangePreset !== "All Time"
                  ? "border-[#8B5E3C] bg-[#8B5E3C]/10 text-[#8B5E3C] dark:border-[#FFC107] dark:bg-[#FFC107]/15 dark:text-[#E8D7C3]"
                  : "border-[#E5E7EB] bg-white text-[#0A2E5C] hover:bg-[#F8FAFC] dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              }`}
              title="Filter by Custom Date Range"
            >
              <Calendar className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-[#0B5ED7] dark:text-[#FFC107]" />
              <span>
                {dateRangePreset === "All Time" 
                  ? "Date Filter" 
                  : dateRangePreset === "Custom"
                    ? `${formatDisplayDate(fromDate)} - ${formatDisplayDate(toDate)}`
                    : dateRangePreset}
              </span>
              <ChevronDown className="h-2.5 w-2.5 sm:h-3 sm:w-3 opacity-60" />
            </button>

            {/* Date Picker Popover (Exact Screenshot 3 UI) */}
            {isDatePickerOpen && (
              <div className="absolute right-0 top-full mt-2 z-50 w-80 sm:w-96 rounded-3xl border border-[#E5E7EB]/80 bg-white p-5 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900 animate-in fade-in zoom-in-95 duration-150">
                
                {/* QUICK PRESETS */}
                <div className="mb-4">
                  <h4 className="text-[11px] font-black uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2.5">
                    QUICK PRESETS
                  </h4>
                  <div className="grid grid-cols-2 gap-2">
                    {(["Today", "Yesterday", "Last 7 Days", "Last 30 Days"] as const).map((preset) => {
                      const isSelected = tempPreset === preset;
                      return (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => handleSelectPreset(preset)}
                          className={`py-2.5 px-3 rounded-2xl text-xs font-bold transition cursor-pointer text-center ${
                            isSelected
                              ? "bg-[#8B5E3C] text-white shadow-xs"
                              : "bg-[#F4F4F5] hover:bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-200"
                          }`}
                        >
                          {preset}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* SELECT DATE OR DATE RANGE */}
                <div className="mb-5">
                  <h4 className="text-[11px] font-black uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2.5">
                    SELECT DATE OR DATE RANGE
                  </h4>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-bold text-zinc-500 dark:text-zinc-400 mb-1">
                        From Date
                      </label>
                      <input
                        type="date"
                        value={tempFromDate}
                        onChange={(e) => {
                          setTempFromDate(e.target.value);
                          setTempPreset("Custom");
                        }}
                        className="w-full py-2 px-3 rounded-2xl border border-zinc-200 bg-[#F4F4F5]/60 dark:border-zinc-700 dark:bg-zinc-800/80 text-xs font-bold text-[#0A2E5C] dark:text-white focus:outline-hidden focus:ring-1 focus:ring-[#8B5E3C]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-zinc-500 dark:text-zinc-400 mb-1">
                        To Date
                      </label>
                      <input
                        type="date"
                        value={tempToDate}
                        onChange={(e) => {
                          setTempToDate(e.target.value);
                          setTempPreset("Custom");
                        }}
                        className="w-full py-2 px-3 rounded-2xl border border-zinc-200 bg-[#F4F4F5]/60 dark:border-zinc-700 dark:bg-zinc-800/80 text-xs font-bold text-[#0A2E5C] dark:text-white focus:outline-hidden focus:ring-1 focus:ring-[#8B5E3C]"
                      />
                    </div>
                  </div>
                </div>

                {/* POPUP FOOTER */}
                <div className="flex items-center justify-between pt-2 border-t border-zinc-100 dark:border-zinc-800">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleResetToToday}
                      className="text-xs font-bold text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition cursor-pointer"
                    >
                      Reset to Today
                    </button>
                    {dateRangePreset !== "All Time" && (
                      <button
                        type="button"
                        onClick={handleClearDateFilter}
                        className="text-xs font-bold text-rose-500 hover:text-rose-700 transition cursor-pointer"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleApplyDateFilter}
                    className="px-4 py-2 rounded-xl bg-[#0A2E5C] hover:bg-black text-[#F5E6D3] text-xs font-black shadow-xs transition active:scale-95 cursor-pointer"
                  >
                    Apply Filter
                  </button>
                </div>

              </div>
            )}
          </div>

          <button 
            onClick={() => setIsAddExpenseModalOpen(true)}
            className="inline-flex items-center gap-1 sm:gap-2 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-300 px-2.5 sm:px-3.5 py-1.5 sm:py-2 text-[11px] sm:text-xs font-bold transition active:scale-95 cursor-pointer shadow-xs whitespace-nowrap"
          >
            <Wallet className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-amber-600 dark:text-amber-400" />
            <span>Add Expense</span>
          </button>
          <button 
            onClick={() => {
              setSelectedStudentId("");
              setNewStudentName("");
              setNewStudentPhone("");
              setTotalBilledDue(600);
              setNewAmount(600);
              setIsCollectModalOpen(true);
            }}
            className="inline-flex items-center gap-1 sm:gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-2.5 sm:px-4 py-1.5 sm:py-2 text-[11px] sm:text-xs font-bold text-white shadow-md shadow-emerald-600/20 transition active:scale-95 cursor-pointer whitespace-nowrap"
          >
            <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span>Collect Fees</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. THE 6 MONTHLY FINANCIAL KPIS (MATCHING DASHBOARD CLEAN & MINIMAL STYLE)  */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
        
        {/* KPI 1: Monthly / Dynamic Collection */}
        <div 
          onClick={() => setActiveKpiModal("collection")}
          className="group rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-xs transition-all hover:scale-[1.02] hover:border-[#0B5ED7] hover:shadow-md dark:border-zinc-800 dark:bg-[#0A2E5C] flex flex-col justify-between cursor-pointer min-h-[160px]"
          title="Click to view Collection Records & All-Time History"
        >
          <div className="flex items-start justify-between">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
              <IndianRupee className="h-4 w-4" />
            </div>
            <span className="text-[9px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/50 px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
              {isDateFilterActive ? (
                <span>{dateRangePreset}</span>
              ) : (
                <>
                  <Plus className="h-2.5 w-2.5" /> ₹{todayCollection.toLocaleString("en-IN")}
                </>
              )}
            </span>
          </div>
          <div className="mt-3">
            <p className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">Total Collection</p>
            <p className="text-2xl font-black text-[#0A2E5C] dark:text-white mt-0.5">
              ₹{effectiveCollectionTotal.toLocaleString("en-IN")}
            </p>
            <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5 truncate">
              {isDateFilterActive ? `${dynamicKpiPaidTxs.length} Paid Records` : `${currentMonthName} Collections`}
            </p>
          </div>
          <div className="mt-3 pt-2 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between">
            <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 group-hover:underline">View Records</span>
            <ChevronRight className="h-3 w-3 text-emerald-400 group-hover:trangray-x-0.5 transition-transform" />
          </div>
        </div>

        {/* KPI 2: Pending Dues */}
        <div 
          onClick={() => setActiveKpiModal("dues")}
          className="group rounded-2xl border border-rose-200/80 bg-rose-50/20 p-4 shadow-xs transition-all hover:scale-[1.02] hover:border-rose-400 hover:shadow-md dark:border-rose-900/40 dark:bg-rose-950/10 flex flex-col justify-between cursor-pointer min-h-[160px]"
          title="Click to view Pending Dues Ledger"
        >
          <div className="flex items-start justify-between">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300 group-hover:bg-rose-600 group-hover:text-white transition-colors">
              <Clock className="h-4 w-4" />
            </div>
            <span className="text-[9px] font-bold text-rose-700 dark:text-rose-300 bg-rose-100 dark:bg-rose-900/50 px-1.5 py-0.5 rounded-md">
              Action
            </span>
          </div>
          <div className="mt-3">
            <p className="text-[11px] font-semibold text-rose-900 dark:text-rose-300/90">Pending Dues</p>
            <p className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-0.5">
              ₹{totalPendingDuesAmount.toLocaleString("en-IN")}
            </p>
            <p className="text-[10px] text-rose-700/80 dark:text-rose-400/80 mt-0.5 truncate">
              {pendingStudentsCount} Students Pending
            </p>
          </div>
          <div className="mt-3 pt-2 border-t border-rose-200/40 dark:border-rose-900/40 flex items-center justify-between">
            <span className="text-[9px] font-bold text-rose-700 dark:text-rose-400 group-hover:underline">Dues Ledger</span>
            <ChevronRight className="h-3 w-3 text-rose-600 group-hover:trangray-x-0.5 transition-transform" />
          </div>
        </div>

        {/* KPI 3: UPI Claims */}
        <div 
          onClick={() => setActiveKpiModal("upi")}
          className="group rounded-2xl border border-sky-200/80 bg-sky-50/20 p-4 shadow-xs transition-all hover:scale-[1.02] hover:border-sky-400 hover:shadow-md dark:border-sky-900/40 dark:bg-sky-950/10 flex flex-col justify-between cursor-pointer min-h-[160px]"
          title="Click to verify pending UPI claims"
        >
          <div className="flex items-start justify-between">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300 group-hover:bg-sky-600 group-hover:text-white transition-colors">
              <CreditCard className="h-4 w-4" />
            </div>
            <span className="text-[9px] font-bold text-sky-700 dark:text-sky-300 bg-sky-100 dark:bg-sky-900/50 px-1.5 py-0.5 rounded-md">
              Verify
            </span>
          </div>
          <div className="mt-3">
            <p className="text-[11px] font-semibold text-sky-900 dark:text-sky-300/90">UPI Claims</p>
            <p className="text-2xl font-black text-[#0A2E5C] dark:text-white mt-0.5">
              {upiClaimsList.length} <span className="text-sm font-semibold text-zinc-400">Claims</span>
            </p>
            <p className="text-[10px] text-sky-700/80 dark:text-sky-400/80 mt-0.5 truncate">
              Online Verifications
            </p>
          </div>
          <div className="mt-3 pt-2 border-t border-sky-200/40 dark:border-sky-900/40 flex items-center justify-between">
            <span className="text-[9px] font-bold text-sky-700 dark:text-sky-400 group-hover:underline">Verify Claims</span>
            <ChevronRight className="h-3 w-3 text-sky-600 group-hover:trangray-x-0.5 transition-transform" />
          </div>
        </div>

        {/* KPI 4: Defaulters (>2 Months Unpaid) */}
        <div 
          onClick={() => setActiveKpiModal("defaulters")}
          className="group rounded-2xl border border-red-300 bg-red-50/20 p-4 shadow-xs transition-all hover:scale-[1.02] hover:border-red-500 hover:shadow-md dark:border-red-900/40 dark:bg-red-950/10 flex flex-col justify-between cursor-pointer min-h-[160px]"
          title="Click to view Defaulters (Over 2 Months Overdue)"
        >
          <div className="flex items-start justify-between">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-100 text-red-700 dark:bg-red-900/60 dark:text-red-300 group-hover:bg-red-600 group-hover:text-white transition-colors">
              <ShieldAlert className="h-4 w-4" />
            </div>
            <span className="text-[9px] font-bold text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/50 px-1.5 py-0.5 rounded-md">
              Alert
            </span>
          </div>
          <div className="mt-3">
            <p className="text-[11px] font-semibold text-red-900 dark:text-red-300/90">Defaulter (2+ Mo)</p>
            <p className="text-2xl font-black text-red-600 dark:text-red-400 mt-0.5">
              {defaultersList.length} <span className="text-sm font-semibold text-zinc-400">Students</span>
            </p>
            <p className="text-[10px] text-red-700/80 dark:text-red-400/80 mt-0.5 truncate">
              ₹{defaultersTotalAmount.toLocaleString("en-IN")} at risk
            </p>
          </div>
          <div className="mt-3 pt-2 border-t border-red-200/40 dark:border-red-900/40 flex items-center justify-between">
            <span className="text-[9px] font-bold text-red-700 dark:text-red-400 group-hover:underline">Nudge Defaulters</span>
            <ChevronRight className="h-3 w-3 text-red-600 group-hover:trangray-x-0.5 transition-transform" />
          </div>
        </div>

        {/* KPI 5: Total Expenses (Dynamic / Monthly) */}
        <div 
          onClick={() => setActiveKpiModal("expenses")}
          className="group rounded-2xl border border-amber-200/80 bg-amber-50/20 p-4 shadow-xs transition-all hover:scale-[1.02] hover:border-amber-400 hover:shadow-md dark:border-amber-900/40 dark:bg-amber-950/10 flex flex-col justify-between cursor-pointer min-h-[160px]"
          title="Click to view Expenses History & All-Time Total"
        >
          <div className="flex items-start justify-between">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300 group-hover:bg-amber-600 group-hover:text-white transition-colors">
              <Wallet className="h-4 w-4" />
            </div>
            <span className="text-[9px] font-bold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/50 px-1.5 py-0.5 rounded-md">
              {isDateFilterActive ? dateRangePreset : "This Month"}
            </span>
          </div>
          <div className="mt-3">
            <p className="text-[11px] font-semibold text-amber-900 dark:text-amber-300/90">Total Expenses</p>
            <p className="text-2xl font-black text-amber-950 dark:text-white mt-0.5">
              ₹{effectiveExpensesTotal.toLocaleString("en-IN")}
            </p>
            <p className="text-[10px] text-amber-700/80 dark:text-amber-400/80 mt-0.5 truncate">
              {isDateFilterActive ? `${dynamicKpiExpenses.length} Records (${dateRangePreset})` : `${thisMonthExpenses.length} Records (Month)`}
            </p>
          </div>
          <div className="mt-3 pt-2 border-t border-amber-200/40 dark:border-amber-900/40 flex items-center justify-between">
            <span className="text-[9px] font-bold text-amber-700 dark:text-amber-400 group-hover:underline">Expenses History</span>
            <ChevronRight className="h-3 w-3 text-amber-600 group-hover:trangray-x-0.5 transition-transform" />
          </div>
        </div>

        {/* KPI 6: Total Net Revenue (Dynamic / Monthly) */}
        <div 
          onClick={() => setActiveKpiModal("revenue")}
          className="group rounded-2xl border border-purple-200/80 bg-purple-50/20 p-4 shadow-xs transition-all hover:scale-[1.02] hover:border-purple-400 hover:shadow-md dark:border-purple-900/40 dark:bg-purple-950/10 flex flex-col justify-between cursor-pointer min-h-[160px]"
          title="Click to view Net Profit Breakdown"
        >
          <div className="flex items-start justify-between">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300 group-hover:bg-purple-600 group-hover:text-white transition-colors">
              <TrendingUp className="h-4 w-4" />
            </div>
            <span className="text-[9px] font-bold text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-900/50 px-1.5 py-0.5 rounded-md">
              Net
            </span>
          </div>
          <div className="mt-3">
            <p className="text-[11px] font-semibold text-purple-900 dark:text-purple-300/90">Total Revenue</p>
            <p className={`text-2xl font-black mt-0.5 ${effectiveNetRevenue >= 0 ? "text-purple-950 dark:text-white" : "text-rose-600"}`}>
              ₹{effectiveNetRevenue.toLocaleString("en-IN")}
            </p>
            <p className="text-[10px] text-purple-700/80 dark:text-purple-400/80 mt-0.5 truncate">
              {isDateFilterActive ? `Net (${dateRangePreset})` : "Net Profit (Month)"}
            </p>
          </div>
          <div className="mt-3 pt-2 border-t border-purple-200/40 dark:border-purple-900/40 flex items-center justify-between">
            <span className="text-[9px] font-bold text-purple-700 dark:text-purple-400 group-hover:underline">Profit Breakdown</span>
            <ChevronRight className="h-3 w-3 text-purple-600 group-hover:trangray-x-0.5 transition-transform" />
          </div>
        </div>

      </div>

      {/* ========================================================================= */}
      {/* 3. STUDENT DUES LEDGER (TABLE WITH EXACT REQUESTED COLUMNS & ACTIONS)     */}
      {/* ========================================================================= */}
      <div className="rounded-3xl border border-[#E5E7EB]/60 bg-white p-5 sm:p-6 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
        
        {/* Ledger Header & Search / Filters */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black text-[#0A2E5C] dark:text-white">
                Student Dues Ledger
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-black bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                {studentDuesLedger.length} Pending
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              Track student dues, send direct WhatsApp reminders, and collect payments on-the-spot.
            </p>
          </div>

          {/* Desktop Toolbar */}
          <div className="hidden sm:flex flex-wrap items-center gap-2.5">
            {/* Filter Pills */}
            <div className="flex items-center gap-1 bg-[#F8F9FA] dark:bg-zinc-800 p-1 rounded-2xl border border-zinc-200 dark:border-zinc-700 text-xs font-bold">
              {(["All", "Pending", "Overdue", "Defaulter"] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setLedgerStatusFilter(filter)}
                  className={`px-3 py-1 rounded-xl transition cursor-pointer ${
                    ledgerStatusFilter === filter 
                      ? "bg-white dark:bg-zinc-700 text-[#0A2E5C] dark:text-white shadow-xs font-black"
                      : "text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div className="relative min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -trangray-y-1/2 h-3.5 w-3.5 text-zinc-400" />
              <input 
                type="text"
                placeholder="Search student or phone..."
                value={ledgerSearch}
                onChange={(e) => setLedgerSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs text-[#0A2E5C] dark:text-white placeholder:text-zinc-400 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            {/* View Switcher (Table vs Grid) */}
            <div className="flex items-center rounded-xl border border-zinc-200 bg-zinc-50 p-1 dark:border-zinc-700 dark:bg-zinc-800">
              <button
                type="button"
                onClick={() => setDuesViewMode("table")}
                className={`p-1.5 rounded-lg transition cursor-pointer ${
                  duesViewMode === "table"
                    ? "bg-white text-[#0A2E5C] shadow-xs dark:bg-zinc-700 dark:text-white"
                    : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                }`}
                title="Table View"
              >
                <List className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setDuesViewMode("grid")}
                className={`p-1.5 rounded-lg transition cursor-pointer ${
                  duesViewMode === "grid"
                    ? "bg-white text-[#0A2E5C] shadow-xs dark:bg-zinc-700 dark:text-white"
                    : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                }`}
                title="Grid View"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Mobile Toolbar: Search + Filter Icon Button + View Switcher */}
          <div className="flex sm:hidden items-center gap-2 w-full">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -trangray-y-1/2 h-3.5 w-3.5 text-zinc-400" />
              <input 
                type="text"
                placeholder="Search..."
                value={ledgerSearch}
                onChange={(e) => setLedgerSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs text-[#0A2E5C] dark:text-white placeholder:text-zinc-400 focus:outline-hidden"
              />
            </div>

            {/* Mobile Filter Button */}
            <button
              type="button"
              onClick={() => setMobileFilterSection("ledger")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition active:scale-95 cursor-pointer shadow-xs ${
                ledgerStatusFilter !== "All"
                  ? "border-[#8B5E3C] bg-[#8B5E3C]/10 text-[#8B5E3C] dark:border-[#FFC107] dark:bg-[#FFC107]/15 dark:text-[#E8D7C3]"
                  : "border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800 text-[#0A2E5C] dark:text-white"
              }`}
            >
              <Filter className="h-3.5 w-3.5 text-[#0B5ED7] dark:text-[#FFC107]" />
              <span>{ledgerStatusFilter !== "All" ? ledgerStatusFilter : "Filter"}</span>
              {ledgerStatusFilter !== "All" && (
                <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
              )}
            </button>

            {/* Mobile View Switcher */}
            <div className="flex items-center rounded-xl border border-zinc-200 bg-zinc-50 p-1 dark:border-zinc-700 dark:bg-zinc-800">
              <button
                type="button"
                onClick={() => setDuesViewMode("table")}
                className={`p-1.5 rounded-lg transition ${
                  duesViewMode === "table"
                    ? "bg-white text-[#0A2E5C] shadow-xs dark:bg-zinc-700 dark:text-white"
                    : "text-zinc-400"
                }`}
              >
                <List className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setDuesViewMode("grid")}
                className={`p-1.5 rounded-lg transition ${
                  duesViewMode === "grid"
                    ? "bg-white text-[#0A2E5C] shadow-xs dark:bg-zinc-700 dark:text-white"
                    : "text-zinc-400"
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* ======================= LEDGER TABLE VIEW ======================= */}
        {duesViewMode === "table" ? (
          <div className="overflow-x-auto rounded-2xl border border-zinc-100 dark:border-zinc-800">
            <table className="w-full text-left border-collapse min-w-[750px]">
              <thead>
                <tr className="bg-[#FAF9F6] dark:bg-zinc-800/60 border-b border-zinc-200/70 dark:border-zinc-800 text-[10px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  <th className="py-3 px-4">STUDENT ID</th>
                  <th className="py-3 px-4">STUDENT</th>
                  <th className="py-3 px-4">NUMBER</th>
                  <th className="py-3 px-4">TYPE</th>
                  <th className="py-3 px-4">AMOUNT</th>
                  <th className="py-3 px-4">DUE DATE</th>
                  <th className="py-3 px-4">STATUS</th>
                  <th className="py-3 px-4 text-center">ACTION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 text-xs">
                {filteredLedger.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-zinc-400">
                      <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-500 opacity-60" />
                      <p className="font-bold text-zinc-600 dark:text-zinc-300">No pending dues found!</p>
                      <p className="text-[11px] text-zinc-400">All student membership fees are settled.</p>
                    </td>
                  </tr>
                ) : (
                  filteredLedger.map((due) => (
                    <tr key={due.id} className="hover:bg-zinc-50/60 dark:hover:bg-zinc-800/40 transition">
                      
                      {/* 1. Student ID */}
                      <td className="py-3.5 px-4 font-mono font-bold text-zinc-600 dark:text-zinc-300">
                        {due.studentCode}
                      </td>

                      {/* 2. Student (Only Name Mentioned) */}
                      <td className="py-3.5 px-4 font-black text-[#0A2E5C] dark:text-white">
                        {due.studentName}
                      </td>

                      {/* 3. Number */}
                      <td className="py-3.5 px-4 font-medium text-zinc-500 dark:text-zinc-400">
                        {due.phone || "—"}
                      </td>

                      {/* 4. Type */}
                      <td className="py-3.5 px-4">
                        <span className="inline-flex px-2 py-0.5 rounded-lg text-[10px] font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                          {due.type}
                        </span>
                      </td>

                      {/* 5. Amount */}
                      <td className="py-3.5 px-4 font-black text-rose-600 dark:text-rose-400">
                        ₹{due.amount.toLocaleString("en-IN")}
                      </td>

                      {/* 6. Due Date */}
                      <td className="py-3.5 px-4 text-zinc-500 dark:text-zinc-400 font-medium">
                        {due.dueDate}
                      </td>

                      {/* 7. Status */}
                      <td className="py-3.5 px-4">
                        {due.isDefaulter ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300 border border-red-200 dark:border-red-800">
                            <AlertTriangle className="h-3 w-3" /> Defaulter ({due.monthsOverdue}m+)
                          </span>
                        ) : due.status === "Overdue" ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                            Overdue
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-900">
                            Pending
                          </span>
                        )}
                      </td>

                      {/* 8. Action: Single-click Call, WhatsApp icon & Collect Payment icon */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* 📞 Single-Click Call Button */}
                          <a
                            href={due.phone ? `tel:${due.phone.replace(/[^0-9+]/g, "")}` : undefined}
                            onClick={(e) => {
                              if (!due.phone) {
                                e.preventDefault();
                                showToast("⚠️ Student phone number not available on record");
                              }
                            }}
                            className={`h-8 w-8 rounded-xl flex items-center justify-center transition active:scale-95 cursor-pointer shadow-2xs ${
                              due.phone 
                                ? "bg-sky-50 hover:bg-sky-100 text-sky-600 dark:bg-sky-950/60 dark:text-sky-400" 
                                : "bg-zinc-100 text-zinc-400 opacity-40 cursor-not-allowed"
                            }`}
                            title={due.phone ? `Single-Click Call: ${due.phone}` : "No Phone Number"}
                          >
                            <Phone className="h-4 w-4" />
                          </a>

                          {/* 💬 WhatsApp Reminder Button */}
                          <button
                            onClick={() => handleOpenWhatsAppReminder(due)}
                            disabled={!due.phone}
                            className="h-8 w-8 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 flex items-center justify-center transition active:scale-95 disabled:opacity-40 cursor-pointer shadow-2xs"
                            title="Send Due Reminder on WhatsApp"
                          >
                            <MessageCircle className="h-4 w-4" />
                          </button>

                          {/* 💳 Collect Payment Icon (Opens Collect Modal) */}
                          <button
                            onClick={() => handlePreFillCollectModal(due)}
                            className="h-8 w-8 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400 flex items-center justify-center transition active:scale-95 cursor-pointer shadow-2xs"
                            title="Collect Fees for this Student"
                          >
                            <CreditCard className="h-4 w-4" />
                          </button>
                        </div>
                      </td>

                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          /* ======================= LEDGER GRID VIEW (COMPACT MOBILE VIEW) ======================= */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3.5">
            {filteredLedger.length === 0 ? (
              <div className="col-span-full py-10 text-center text-zinc-400">
                <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-500 opacity-60" />
                <p className="font-bold text-zinc-600 dark:text-zinc-300">No pending dues found!</p>
                <p className="text-[11px] text-zinc-400">All student membership fees are settled.</p>
              </div>
            ) : (
              filteredLedger.map((due) => (
                <div 
                  key={due.id} 
                  className="rounded-xl sm:rounded-2xl border border-zinc-200/80 bg-[#FAF9F6] dark:border-zinc-800 dark:bg-zinc-850/60 p-3 sm:p-4 shadow-2xs hover:shadow-xs transition flex flex-col justify-between"
                >
                  <div>
                    {/* Top Row: Student Code & Status */}
                    <div className="flex items-center justify-between mb-1.5 sm:mb-2">
                      <span className="font-mono text-xs font-bold text-zinc-500 dark:text-zinc-400">
                        {due.studentCode}
                      </span>
                      {due.isDefaulter ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300 border border-red-200 dark:border-red-800">
                          <AlertTriangle className="h-3 w-3" /> Defaulter ({due.monthsOverdue}m+)
                        </span>
                      ) : due.status === "Overdue" ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                          Overdue
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-900">
                          Pending
                        </span>
                      )}
                    </div>

                    {/* Student Name & Phone */}
                    <h3 className="font-black text-xs sm:text-sm text-[#0A2E5C] dark:text-white mb-0.5">
                      {due.studentName}
                    </h3>
                    <p className="text-[11px] sm:text-xs text-zinc-500 dark:text-zinc-400 mb-2 sm:mb-3">
                      {due.phone || "No phone registered"}
                    </p>

                    {/* Type & Amount Info Box */}
                    <div className="flex items-center justify-between py-1.5 px-2.5 sm:py-2 sm:px-3 rounded-lg sm:rounded-xl bg-white dark:bg-zinc-800/80 border border-zinc-100 dark:border-zinc-700/60 text-xs mb-2 sm:mb-3">
                      <div>
                        <span className="text-[10px] text-zinc-400 block font-bold">TYPE</span>
                        <span className="font-bold text-zinc-700 dark:text-zinc-300">{due.type}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-zinc-400 block font-bold">DUE AMOUNT</span>
                        <span className="font-black text-rose-600 dark:text-rose-400 text-xs sm:text-sm">
                          ₹{due.amount.toLocaleString("en-IN")}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Card Bottom: Due Date & Actions */}
                  <div className="flex items-center justify-between pt-1.5 sm:pt-2 border-t border-zinc-200/60 dark:border-zinc-800">
                    <span className="text-[10px] sm:text-[11px] text-zinc-400 font-medium">
                      Due: {due.dueDate}
                    </span>

                    <div className="flex items-center gap-1 sm:gap-1.5">
                      {/* Call */}
                      <a
                        href={due.phone ? `tel:${due.phone.replace(/[^0-9+]/g, "")}` : undefined}
                        onClick={(e) => {
                          if (!due.phone) {
                            e.preventDefault();
                            showToast("⚠️ Student phone number not available on record");
                          }
                        }}
                        className={`h-7.5 w-7.5 sm:h-8 sm:w-8 rounded-lg sm:rounded-xl flex items-center justify-center transition active:scale-95 cursor-pointer shadow-2xs ${
                          due.phone 
                            ? "bg-sky-50 hover:bg-sky-100 text-sky-600 dark:bg-sky-950/60 dark:text-sky-400" 
                            : "bg-zinc-100 text-zinc-400 opacity-40 cursor-not-allowed"
                        }`}
                        title={due.phone ? `Single-Click Call: ${due.phone}` : "No Phone"}
                      >
                        <Phone className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      </a>

                      {/* WhatsApp */}
                      <button
                        onClick={() => handleOpenWhatsAppReminder(due)}
                        disabled={!due.phone}
                        className="h-7.5 w-7.5 sm:h-8 sm:w-8 rounded-lg sm:rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 flex items-center justify-center transition active:scale-95 disabled:opacity-40 cursor-pointer shadow-2xs"
                        title="Send WhatsApp Reminder"
                      >
                        <MessageCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      </button>

                      {/* Collect */}
                      <button
                        onClick={() => handlePreFillCollectModal(due)}
                        className="h-7.5 w-7.5 sm:h-8 sm:w-8 rounded-lg sm:rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400 flex items-center justify-center transition active:scale-95 cursor-pointer shadow-2xs"
                        title="Collect Fee"
                      >
                        <CreditCard className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      </button>
                    </div>
                  </div>

                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 4. TRANSACTION HISTORY (PAID FEES - MATCHING ATTACHED SCREENSHOT 2)       */}
      {/* ========================================================================= */}
      <div className="rounded-3xl border border-[#E5E7EB]/60 bg-white p-5 sm:p-6 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
        
        {/* Table Header & Search / Filters */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black text-[#0A2E5C] dark:text-white">
                Transaction History
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-black bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                {paidTransactions.length} Paid Records
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              Official library receipts, payment methods, and invoice print controls.
            </p>
          </div>

          {/* Desktop Toolbar */}
          <div className="hidden sm:flex flex-wrap items-center gap-2.5">
            {/* Mode Filter */}
            <select
              value={txModeFilter}
              onChange={(e) => setTxModeFilter(e.target.value)}
              className="text-xs font-bold px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[#0A2E5C] dark:text-white cursor-pointer"
            >
              <option value="All">All Payment Modes</option>
              <option value="UPI">UPI</option>
              <option value="Cash">Cash</option>
              <option value="Bank Transfer">Bank Transfer</option>
              <option value="Card">Card</option>
            </select>

            {/* Search Input */}
            <div className="relative min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -trangray-y-1/2 h-3.5 w-3.5 text-zinc-400" />
              <input 
                type="text"
                placeholder="Search invoice or student..."
                value={txSearch}
                onChange={(e) => setTxSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs text-[#0A2E5C] dark:text-white placeholder:text-zinc-400 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            {/* View Switcher (Table vs Grid) */}
            <div className="flex items-center rounded-xl border border-zinc-200 bg-zinc-50 p-1 dark:border-zinc-700 dark:bg-zinc-800">
              <button
                type="button"
                onClick={() => setTxViewMode("table")}
                className={`p-1.5 rounded-lg transition cursor-pointer ${
                  txViewMode === "table"
                    ? "bg-white text-[#0A2E5C] shadow-xs dark:bg-zinc-700 dark:text-white"
                    : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                }`}
                title="Table View"
              >
                <List className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setTxViewMode("grid")}
                className={`p-1.5 rounded-lg transition cursor-pointer ${
                  txViewMode === "grid"
                    ? "bg-white text-[#0A2E5C] shadow-xs dark:bg-zinc-700 dark:text-white"
                    : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                }`}
                title="Grid View"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Mobile Toolbar: Search + Filter Icon Button + View Switcher */}
          <div className="flex sm:hidden items-center gap-2 w-full">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -trangray-y-1/2 h-3.5 w-3.5 text-zinc-400" />
              <input 
                type="text"
                placeholder="Search..."
                value={txSearch}
                onChange={(e) => setTxSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs text-[#0A2E5C] dark:text-white placeholder:text-zinc-400 focus:outline-hidden"
              />
            </div>

            {/* Mobile Filter Button */}
            <button
              type="button"
              onClick={() => setMobileFilterSection("tx")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition active:scale-95 cursor-pointer shadow-xs ${
                txModeFilter !== "All" || dateRangePreset !== "All Time"
                  ? "border-[#8B5E3C] bg-[#8B5E3C]/10 text-[#8B5E3C] dark:border-[#FFC107] dark:bg-[#FFC107]/15 dark:text-[#E8D7C3]"
                  : "border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800 text-[#0A2E5C] dark:text-white"
              }`}
            >
              <Filter className="h-3.5 w-3.5 text-[#0B5ED7] dark:text-[#FFC107]" />
              <span>{txModeFilter !== "All" ? txModeFilter : "Filter"}</span>
              {(txModeFilter !== "All" || dateRangePreset !== "All Time") && (
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              )}
            </button>

            {/* Mobile View Switcher */}
            <div className="flex items-center rounded-xl border border-zinc-200 bg-zinc-50 p-1 dark:border-zinc-700 dark:bg-zinc-800">
              <button
                type="button"
                onClick={() => setTxViewMode("table")}
                className={`p-1.5 rounded-lg transition ${
                  txViewMode === "table"
                    ? "bg-white text-[#0A2E5C] shadow-xs dark:bg-zinc-700 dark:text-white"
                    : "text-zinc-400"
                }`}
              >
                <List className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setTxViewMode("grid")}
                className={`p-1.5 rounded-lg transition ${
                  txViewMode === "grid"
                    ? "bg-white text-[#0A2E5C] shadow-xs dark:bg-zinc-700 dark:text-white"
                    : "text-zinc-400"
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* ======================= TRANSACTION TABLE VIEW ======================= */}
        {txViewMode === "table" ? (
          <div className="overflow-x-auto rounded-2xl border border-zinc-100 dark:border-zinc-800">
            <table className="w-full text-left border-collapse min-w-[850px]">
              <thead>
                <tr className="bg-[#FAF9F6] dark:bg-zinc-800/60 border-b border-zinc-200/70 dark:border-zinc-800 text-[10px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  <th className="py-3 px-4"># INVOICE</th>
                  <th className="py-3 px-4">STUDENT ID</th>
                  <th className="py-3 px-4">STUDENT NAME</th>
                  <th className="py-3 px-4">TYPE</th>
                  <th className="py-3 px-4">AMOUNT</th>
                  <th className="py-3 px-4">DATE</th>
                  <th className="py-3 px-4">MODE</th>
                  <th className="py-3 px-4 text-center">ACTION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 text-xs">
                {filteredTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-zinc-400">
                      <Receipt className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="font-bold">No transactions found</p>
                      <p className="text-[11px]">Collected fees will appear here automatically.</p>
                    </td>
                  </tr>
                ) : (
                  filteredTransactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-zinc-50/60 dark:hover:bg-zinc-800/40 transition">
                      
                      {/* 1. Invoice */}
                      <td className="py-3.5 px-4 font-mono font-black text-[#0A2E5C] dark:text-white">
                        {tx.receiptNo}
                      </td>

                      {/* 2. Student ID */}
                      <td className="py-3.5 px-4 font-mono font-medium text-zinc-500 dark:text-zinc-400">
                        {tx.studentId}
                      </td>

                      {/* 3. Student Name */}
                      <td className="py-3.5 px-4 font-black text-[#0A2E5C] dark:text-white">
                        {tx.studentName}
                      </td>

                      {/* 4. Type */}
                      <td className="py-3.5 px-4">
                        <span className="inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#F8FAFC] dark:bg-zinc-800 text-[#0B5ED7] dark:text-[#FFC107] border border-[#E5E7EB]/40 dark:border-zinc-700">
                          {tx.type}
                        </span>
                      </td>

                      {/* 5. Amount */}
                      <td className="py-3.5 px-4 font-black text-emerald-600 dark:text-emerald-400">
                        ₹{tx.amount.toLocaleString("en-IN")}
                      </td>

                      {/* 6. Date */}
                      <td className="py-3.5 px-4 text-zinc-500 dark:text-zinc-400">
                        {tx.date}
                      </td>

                      {/* 7. Mode */}
                      <td className="py-3.5 px-4">
                        <span className="font-bold text-zinc-700 dark:text-zinc-300">
                          {tx.method}
                        </span>
                      </td>

                      {/* 8. Action: Bill icon, Email icon, WhatsApp icon, Delete icon */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center justify-center gap-1.5">
                          
                          {/* 🧾 Bill Icon: Open A4 Invoice Modal */}
                          <button
                            onClick={() => {
                              setSelectedInvoice({
                                invoiceNo: tx.receiptNo,
                                date: tx.date,
                                studentName: tx.studentName,
                                studentCode: tx.studentId,
                                studentEmail: tx.email,
                                studentPhone: tx.phone,
                                shift: tx.shift,
                                feeType: tx.type,
                                amount: tx.amount,
                                totalDue: tx.totalDue,
                                remainingDue: tx.remainingDue,
                                paymentMode: tx.method,
                                status: "Paid",
                                remarks: tx.notes || "Official Student Seat Fee",
                              });
                            }}
                            className="h-7 w-7 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 flex items-center justify-center transition active:scale-95 cursor-pointer shadow-2xs"
                            title="Print / View Invoice Bill"
                          >
                            <Receipt className="h-3.5 w-3.5" />
                          </button>

                          {/* ✉️ Email Icon: Resend Receipt */}
                          <button
                            onClick={() => handleSendEmailReceipt(tx)}
                            disabled={sendingReceiptId === tx.id}
                            className="h-7 w-7 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-600 dark:bg-sky-950/60 dark:text-sky-300 flex items-center justify-center transition active:scale-95 cursor-pointer shadow-2xs disabled:opacity-50"
                            title="Email Receipt to Student"
                          >
                            <Mail className="h-3.5 w-3.5" />
                          </button>

                          {/* 💬 WhatsApp Icon: Share Receipt */}
                          <button
                            onClick={() => {
                              const cleanPhone = (tx.phone || "").replace(/[^0-9]/g, "");
                              const formattedPhone = cleanPhone.startsWith("91") ? cleanPhone : `91${cleanPhone}`;
                              const text = encodeURIComponent(
                                `Hello ${tx.studentName},\n\nHere is your official fee payment receipt from Genius Library, Madhupur.\n\nInvoice No: ${tx.receiptNo}\nAmount Paid: ₹${tx.amount}\nDate: ${tx.date}\nPayment Mode: ${tx.method}\nStatus: PAID\n\nThank you for choosing Genius Library!`
                              );
                              window.open(`https://wa.me/${formattedPhone}?text=${text}`, "_blank");
                            }}
                            className="h-7 w-7 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-300 flex items-center justify-center transition active:scale-95 cursor-pointer shadow-2xs"
                            title="Share Receipt on WhatsApp"
                          >
                            <MessageCircle className="h-3.5 w-3.5" />
                          </button>

                          {/* 🗑️ Delete Icon: Delete Record */}
                          <button
                            onClick={() => handleDeleteTransaction(tx.id, tx.studentName)}
                            className="h-7 w-7 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400 flex items-center justify-center transition active:scale-95 cursor-pointer shadow-2xs"
                            title="Delete Transaction"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>

                        </div>
                      </td>

                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          /* ======================= TRANSACTION GRID VIEW ======================= */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {filteredTransactions.length === 0 ? (
              <div className="col-span-full py-10 text-center text-zinc-400">
                <Receipt className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="font-bold">No transactions found</p>
                <p className="text-[11px]">Collected fees will appear here automatically.</p>
              </div>
            ) : (
              filteredTransactions.map((tx) => (
                <div 
                  key={tx.id} 
                  className="rounded-2xl border border-zinc-200/80 bg-[#FAF9F6] dark:border-zinc-800 dark:bg-zinc-850/60 p-4 shadow-2xs hover:shadow-xs transition flex flex-col justify-between"
                >
                  <div>
                    {/* Top Row: Invoice # & Paid Badge */}
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-xs font-bold text-[#0B5ED7] dark:text-[#FFC107]">
                        {tx.receiptNo}
                      </span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                        PAID
                      </span>
                    </div>

                    {/* Student Name & Student ID */}
                    <h3 className="font-black text-sm text-[#0A2E5C] dark:text-white mb-0.5">
                      {tx.studentName}
                    </h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 font-mono mb-3">
                      ID: {tx.studentId}
                    </p>

                    {/* Paid Info Box */}
                    <div className="flex items-center justify-between py-2 px-3 rounded-xl bg-white dark:bg-zinc-800/80 border border-zinc-100 dark:border-zinc-700/60 text-xs mb-3">
                      <div>
                        <span className="text-[10px] text-zinc-400 block font-bold">DATE & MODE</span>
                        <span className="font-bold text-zinc-700 dark:text-zinc-300">{tx.date} • {tx.method}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-zinc-400 block font-bold">AMOUNT</span>
                        <span className="font-black text-emerald-600 dark:text-emerald-400 text-sm">
                          ₹{tx.amount.toLocaleString("en-IN")}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Card Bottom: Type & Actions */}
                  <div className="flex items-center justify-between pt-2 border-t border-zinc-200/60 dark:border-zinc-800">
                    <span className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#F8FAFC] dark:bg-zinc-800 text-[#0B5ED7] dark:text-[#FFC107]">
                      {tx.type}
                    </span>

                    <div className="flex items-center gap-1.5">
                      {/* Bill */}
                      <button
                        onClick={() => {
                          setSelectedInvoice({
                            invoiceNo: tx.receiptNo,
                            date: tx.date,
                            studentName: tx.studentName,
                            studentCode: tx.studentId,
                            studentEmail: tx.email,
                            studentPhone: tx.phone,
                            shift: tx.shift,
                            feeType: tx.type,
                            amount: tx.amount,
                            totalDue: tx.totalDue,
                            remainingDue: tx.remainingDue,
                            paymentMode: tx.method,
                            status: "Paid",
                            remarks: tx.notes || "Official Student Seat Fee",
                          });
                        }}
                        className="h-7 w-7 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 flex items-center justify-center transition active:scale-95 cursor-pointer shadow-2xs"
                        title="Print / View Invoice"
                      >
                        <Receipt className="h-3.5 w-3.5" />
                      </button>

                      {/* Email */}
                      <button
                        onClick={() => handleSendEmailReceipt(tx)}
                        disabled={sendingReceiptId === tx.id}
                        className="h-7 w-7 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-600 dark:bg-sky-950/60 dark:text-sky-300 flex items-center justify-center transition active:scale-95 cursor-pointer shadow-2xs disabled:opacity-50"
                        title="Email Receipt"
                      >
                        <Mail className="h-3.5 w-3.5" />
                      </button>

                      {/* WhatsApp */}
                      <button
                        onClick={() => {
                          const cleanPhone = (tx.phone || "").replace(/[^0-9]/g, "");
                          const formattedPhone = cleanPhone.startsWith("91") ? cleanPhone : `91${cleanPhone}`;
                          const text = encodeURIComponent(
                            `Hello ${tx.studentName},\n\nHere is your official fee payment receipt from Genius Library, Madhupur.\n\nInvoice No: ${tx.receiptNo}\nAmount Paid: ₹${tx.amount}\nDate: ${tx.date}\nPayment Mode: ${tx.method}\nStatus: PAID\n\nThank you for choosing Genius Library!`
                          );
                          window.open(`https://wa.me/${formattedPhone}?text=${text}`, "_blank");
                        }}
                        className="h-7 w-7 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-300 flex items-center justify-center transition active:scale-95 cursor-pointer shadow-2xs"
                        title="Share on WhatsApp"
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                      </button>

                      {/* Delete */}
                      <button
                        onClick={() => handleDeleteTransaction(tx.id, tx.studentName)}
                        className="h-7 w-7 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400 flex items-center justify-center transition active:scale-95 cursor-pointer shadow-2xs"
                        title="Delete Transaction"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 5. THE 4 ANALYTICAL OVERVIEW CARDS (MATCHING ATTACHED SCREENSHOT 1)       */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        
        {/* Card 1: Collection Growth */}
        <div className="rounded-3xl border border-[#E5E7EB]/60 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-100 text-sky-600 dark:bg-sky-950 dark:text-sky-400">
                <Clock className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-[#0A2E5C] dark:text-white">Collection Growth</h3>
                <p className="text-[11px] text-zinc-400">Current month performance vs target</p>
              </div>
            </div>

            <div className="space-y-3 my-4">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-zinc-500">Target Progress</span>
                <span className="font-black text-[#0A2E5C] dark:text-white">
                  ₹{monthlyCollection.toLocaleString("en-IN")} / ₹25,000
                </span>
              </div>
              <div className="w-full bg-zinc-100 dark:bg-zinc-800 h-2.5 rounded-full overflow-hidden">
                <div 
                  className="bg-emerald-500 h-full rounded-full transition-all duration-500" 
                  style={{ width: `${Math.min(100, Math.round((monthlyCollection / 25000) * 100))}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] text-zinc-400 font-medium">
                <span>{Math.min(100, Math.round((monthlyCollection / 25000) * 100))}% achieved</span>
                <span>Reset: End of Month</span>
              </div>
            </div>
          </div>

          <div className="border-t border-zinc-100 dark:border-zinc-800 pt-3 flex items-center justify-between text-xs">
            <span className="font-bold text-zinc-500">Paying Members</span>
            <span className="font-black text-emerald-600 dark:text-emerald-400">
              {paidTransactions.length} Verified Receipts
            </span>
          </div>
        </div>

        {/* Card 2: Revenue Distribution (Donut Chart Matching Screenshot 1) */}
        <div className="rounded-3xl border border-[#E5E7EB]/60 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-purple-100 text-purple-600 dark:bg-purple-950 dark:text-purple-400">
                <PieChart className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-[#0A2E5C] dark:text-white">Revenue Sources</h3>
                <p className="text-[11px] text-zinc-400">Category & plan fee distribution</p>
              </div>
            </div>

            {/* Donut Chart representation */}
            <div className="flex items-center justify-around py-3">
              <div className="relative flex items-center justify-center">
                <svg className="w-24 h-24 transform -rotate-90">
                  <circle cx="48" cy="48" r="38" stroke="currentColor" strokeWidth="9" className="text-zinc-100 dark:text-zinc-800" fill="transparent" />
                  <circle cx="48" cy="48" r="38" stroke="currentColor" strokeWidth="9" strokeDasharray="238" strokeDashoffset="40" className="text-emerald-500" strokeLinecap="round" fill="transparent" />
                  <circle cx="48" cy="48" r="38" stroke="currentColor" strokeWidth="9" strokeDasharray="238" strokeDashoffset="180" className="text-purple-600" strokeLinecap="round" fill="transparent" />
                </svg>
                <div className="absolute text-center">
                  <span className="text-base font-black text-[#0A2E5C] dark:text-white">{paidTransactions.length}</span>
                  <p className="text-[9px] font-bold text-zinc-400 uppercase">Paid</p>
                </div>
              </div>

              <div className="space-y-1.5 text-xs">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  <span className="font-bold text-zinc-600 dark:text-zinc-300">Seat Fees</span>
                  <span className="ml-auto font-black text-zinc-900 dark:text-white text-[11px]">{paidTransactions.length}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-purple-600" />
                  <span className="font-bold text-zinc-600 dark:text-zinc-300">Admission</span>
                  <span className="ml-auto font-black text-zinc-900 dark:text-white text-[11px]">0</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-sky-400" />
                  <span className="font-bold text-zinc-600 dark:text-zinc-300">Lockers</span>
                  <span className="ml-auto font-black text-zinc-900 dark:text-white text-[11px]">0</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                  <span className="font-bold text-zinc-600 dark:text-zinc-300">Fines</span>
                  <span className="ml-auto font-black text-zinc-900 dark:text-white text-[11px]">0</span>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-zinc-100 dark:border-zinc-800 pt-3 text-[11px] text-zinc-400 text-center font-medium">
            Primary source: 100% Monthly Seat Plans
          </div>
        </div>

        {/* Card 3: Library Expenses Trend (Matching Screenshot 1 Sparkline) */}
        <div className="rounded-3xl border border-[#E5E7EB]/60 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
                  <TrendingUp className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-[#0A2E5C] dark:text-white">Expenses Trend</h3>
                  <p className="text-[11px] text-zinc-400">Operational cost trajectory</p>
                </div>
              </div>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                {thisMonthExpenses.length} Records
              </span>
            </div>

            {/* Sparkline curve */}
            <div className="relative py-2">
              <div className="flex justify-between items-baseline mb-2">
                <span className="text-lg font-black text-[#0A2E5C] dark:text-white">
                  ₹{monthlyExpensesTotal.toLocaleString("en-IN")}
                </span>
                <span className="text-[10px] font-bold text-zinc-400">Monthly Burn</span>
              </div>
              <svg className="w-full h-12" viewBox="0 0 200 40">
                <path 
                  d="M0 30 Q 30 15, 60 25 T 120 18 T 160 28 T 200 12 L 200 40 L 0 40 Z" 
                  className="fill-emerald-100/50 dark:fill-emerald-950/30" 
                />
                <path 
                  d="M0 30 Q 30 15, 60 25 T 120 18 T 160 28 T 200 12" 
                  fill="none" 
                  stroke="currentColor" 
                  strokeWidth="2.5" 
                  className="text-emerald-500" 
                />
                <circle cx="60" cy="25" r="3" className="fill-white stroke-emerald-500" strokeWidth="2" />
                <circle cx="120" cy="18" r="3" className="fill-white stroke-emerald-500" strokeWidth="2" />
                <circle cx="200" cy="12" r="3" className="fill-white stroke-emerald-500" strokeWidth="2" />
              </svg>
            </div>
          </div>

          <div className="border-t border-zinc-100 dark:border-zinc-800 pt-3 flex items-center justify-between text-xs">
            <span className="font-bold text-zinc-500">Major Category</span>
            <span className="font-black text-amber-700 dark:text-amber-400">
              {thisMonthExpenses[0]?.category || "Electricity / Rent"}
            </span>
          </div>
        </div>

        {/* Card 4: Quick Financial Actions (2x2 Grid Matching Screenshot 1) */}
        <div className="rounded-3xl border border-[#E5E7EB]/60 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900 flex flex-col justify-between">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-[#0A2E5C] dark:text-white">Quick Actions</h3>
              <p className="text-[11px] text-zinc-400">Instant finance controls</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 my-1">
            <button 
              onClick={() => {
                setSelectedStudentId("");
                setNewStudentName("");
                setIsCollectModalOpen(true);
              }}
              className="flex flex-col items-center justify-center p-2.5 rounded-2xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800 transition active:scale-95 cursor-pointer text-center"
            >
              <CreditCard className="h-4 w-4 text-emerald-600 dark:text-emerald-400 mb-1" />
              <span className="text-[11px] font-black text-emerald-900 dark:text-emerald-200">Collect Fees</span>
            </button>

            <button 
              onClick={() => setIsAddExpenseModalOpen(true)}
              className="flex flex-col items-center justify-center p-2.5 rounded-2xl bg-amber-50 hover:bg-amber-100 border border-amber-200 dark:bg-amber-950/40 dark:border-amber-800 transition active:scale-95 cursor-pointer text-center"
            >
              <Wallet className="h-4 w-4 text-amber-600 dark:text-amber-400 mb-1" />
              <span className="text-[11px] font-black text-amber-900 dark:text-amber-200">Add Expense</span>
            </button>

            <button 
              onClick={handleExportCSV}
              className="flex flex-col items-center justify-center p-2.5 rounded-2xl bg-sky-50 hover:bg-sky-100 border border-sky-200 dark:bg-sky-950/40 dark:border-sky-800 transition active:scale-95 cursor-pointer text-center"
            >
              <Download className="h-4 w-4 text-sky-600 dark:text-sky-400 mb-1" />
              <span className="text-[11px] font-black text-sky-900 dark:text-sky-200">Export CSV</span>
            </button>

            <button 
              onClick={async () => {
                if (studentDuesLedger.length === 0) {
                  showToast("No pending dues found today!");
                  return;
                }
                for (const due of studentDuesLedger) {
                  createNotification({
                    recipientRole: "student",
                    recipientId: due.studentId,
                    title: "💳 Library Fee Due Reminder",
                    message: `Dear ${due.studentName}, your fee payment of ₹${due.amount} (${due.type}) is currently pending. Kindly clear your dues via UPI or at the library desk.`,
                    type: "fee_reminder",
                    actionUrl: "/student/fees",
                  }).catch(() => {});
                }
                showToast(`✓ Sent broadcast reminder to ${studentDuesLedger.length} due students!`);
              }}
              className="flex flex-col items-center justify-center p-2.5 rounded-2xl bg-purple-50 hover:bg-purple-100 border border-purple-200 dark:bg-purple-950/40 dark:border-purple-800 transition active:scale-95 cursor-pointer text-center"
            >
              <Send className="h-4 w-4 text-purple-600 dark:text-purple-400 mb-1" />
              <span className="text-[11px] font-black text-purple-900 dark:text-purple-200">Send Reminders</span>
            </button>
          </div>

          <div className="border-t border-zinc-100 dark:border-zinc-800 pt-2 text-[10px] text-zinc-400 text-center font-bold">
            100% Primary Supabase Live Sync
          </div>
        </div>

      </div>

      {/* ========================================================================= */}
      {/* 6. DRILL-DOWN MODALS FOR ALL 6 KPIS                                       */}
      {/* ========================================================================= */}
      
      {/* KPI Modal: Collection History */}
      {activeKpiModal === "collection" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white dark:bg-zinc-900 rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-zinc-200 dark:border-zinc-800 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <div>
                <h3 className="text-lg font-black text-[#0A2E5C] dark:text-white">Collection Records</h3>
                <p className="text-xs text-zinc-400">All-time & monthly payment history</p>
              </div>
              <button onClick={() => setActiveKpiModal(null)} className="h-8 w-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 hover:text-black dark:hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Quick Stat Highlights */}
            <div className="grid grid-cols-3 gap-2 text-center p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/50 dark:border-zinc-700/50">
              <div>
                <p className="text-[10px] uppercase font-bold text-zinc-400">All-Time Grand Total</p>
                <p className="text-base sm:text-lg font-black text-emerald-700 dark:text-emerald-400">
                  ₹{allTimeCollection.toLocaleString("en-IN")}
                </p>
              </div>
              <div className="border-x border-zinc-200 dark:border-zinc-700">
                <p className="text-[10px] uppercase font-bold text-zinc-400">{isDateFilterActive ? dateRangePreset : currentMonthName}</p>
                <p className="text-base sm:text-lg font-black text-emerald-600 dark:text-emerald-300">
                  ₹{effectiveCollectionTotal.toLocaleString("en-IN")}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-zinc-400">Today</p>
                <p className="text-base sm:text-lg font-black text-blue-600 dark:text-blue-400">
                  +₹{todayCollection.toLocaleString("en-IN")}
                </p>
              </div>
            </div>

            {/* Scope Filter Tabs */}
            <div className="flex items-center gap-2 border-b border-zinc-100 dark:border-zinc-800 pb-2">
              <button
                onClick={() => setKpiHistoryScope("all")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  kpiHistoryScope === "all"
                    ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow-xs"
                    : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                }`}
              >
                All History Records ({paidTransactions.length})
              </button>
              <button
                onClick={() => setKpiHistoryScope("period")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  kpiHistoryScope === "period"
                    ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow-xs"
                    : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                }`}
              >
                {isDateFilterActive ? "Selected Filter" : currentMonthName} ({dynamicKpiPaidTxs.length})
              </button>
            </div>

            <div className="overflow-y-auto flex-1 divide-y divide-zinc-100 dark:divide-zinc-800 text-xs">
              {(kpiHistoryScope === "all" ? paidTransactions : dynamicKpiPaidTxs).length === 0 ? (
                <p className="text-center py-8 text-zinc-400">No collection records found for this view.</p>
              ) : (
                (kpiHistoryScope === "all" ? paidTransactions : dynamicKpiPaidTxs).map(t => (
                  <div key={t.id} className="py-3 flex items-center justify-between">
                    <div>
                      <p className="font-black text-[#0A2E5C] dark:text-white">{t.studentName}</p>
                      <p className="text-[11px] text-zinc-400 font-mono">{t.receiptNo} • {t.date} via {t.method}</p>
                    </div>
                    <span className="font-black text-emerald-600 dark:text-emerald-400 text-sm">
                      ₹{t.amount.toLocaleString("en-IN")}
                    </span>
                  </div>
                ))
              )}
            </div>

            <div className="border-t border-zinc-100 dark:border-zinc-800 pt-3 flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-500">
                Showing {(kpiHistoryScope === "all" ? paidTransactions : dynamicKpiPaidTxs).length} records
              </span>
              <button onClick={() => setActiveKpiModal(null)} className="px-4 py-2 rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 text-xs font-bold">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* KPI Modal: Pending Dues */}
      {activeKpiModal === "dues" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white dark:bg-zinc-900 rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-zinc-200 dark:border-zinc-800 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <div>
                <h3 className="text-lg font-black text-rose-600">Pending Dues Overview</h3>
                <p className="text-xs text-zinc-400">{pendingStudentsCount} students with outstanding fees (₹{totalPendingDuesAmount.toLocaleString("en-IN")})</p>
              </div>
              <button onClick={() => setActiveKpiModal(null)} className="h-8 w-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 hover:text-black dark:hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 divide-y divide-zinc-100 dark:divide-zinc-800 text-xs">
              {studentDuesLedger.map(d => (
                <div key={d.id} className="py-3 flex items-center justify-between">
                  <div>
                    <p className="font-black text-[#0A2E5C] dark:text-white">{d.studentName} ({d.studentCode})</p>
                    <p className="text-[11px] text-zinc-400">Due Date: {d.dueDate} • Phone: {d.phone || "—"}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-black text-rose-600">₹{d.amount}</span>
                    <a
                      href={d.phone ? `tel:${d.phone.replace(/[^0-9+]/g, "")}` : undefined}
                      className={`p-1.5 rounded-lg flex items-center justify-center transition active:scale-95 ${
                        d.phone 
                          ? "bg-sky-50 text-sky-600 hover:bg-sky-100 dark:bg-sky-950 dark:text-sky-400 cursor-pointer" 
                          : "bg-zinc-100 text-zinc-400 opacity-40 cursor-not-allowed"
                      }`}
                      title={d.phone ? `Single-Click Call: ${d.phone}` : "No Phone"}
                    >
                      <Phone className="h-3.5 w-3.5" />
                    </a>
                    <button onClick={() => { setActiveKpiModal(null); handleOpenWhatsAppReminder(d); }} className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-[11px] font-bold">
                      WhatsApp
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-zinc-100 dark:border-zinc-800 pt-3 flex justify-end">
              <button onClick={() => setActiveKpiModal(null)} className="px-4 py-2 rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 text-xs font-bold">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* KPI Modal: UPI Claims */}
      {activeKpiModal === "upi" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white dark:bg-zinc-900 rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-zinc-200 dark:border-zinc-800 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <div>
                <h3 className="text-lg font-black text-sky-600 flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  <span>UPI Payment Claims ({upiClaimsList.length})</span>
                </h3>
                <p className="text-xs text-zinc-400">Student digital payment verifications &amp; UTR approvals</p>
              </div>
              <button 
                onClick={() => setActiveKpiModal(null)} 
                className="h-8 w-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 hover:text-black dark:hover:text-white transition cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 divide-y divide-zinc-100 dark:divide-zinc-800 text-xs py-1 space-y-3">
              {upiClaimsList.length === 0 ? (
                <div className="py-10 text-center">
                  <CheckCheck className="h-12 w-12 text-emerald-500 mx-auto mb-2 opacity-80" />
                  <p className="font-bold text-sm text-zinc-700 dark:text-zinc-200">All UPI Claims Verified</p>
                  <p className="text-xs text-zinc-400 mt-0.5">No pending student UPI payment claims awaiting review.</p>
                </div>
              ) : (
                upiClaimsList.map(c => {
                  const isVerifying = claimActionLoadingId === `verify-${c.id}`;
                  const isClearing = claimActionLoadingId === `clear-${c.id}`;
                  const isAnyLoading = !!claimActionLoadingId;

                  return (
                    <div key={c.id} className="pt-3 first:pt-0 p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/80 dark:border-zinc-700/60 space-y-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-black text-sm text-[#0A2E5C] dark:text-white">{c.studentName}</p>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                              Pending Review
                            </span>
                          </div>
                          <p className="text-[11px] text-zinc-500 font-mono mt-0.5">
                            {c.studentId} • {c.phone || c.email || "—"}
                          </p>
                          <p className="text-[11px] text-zinc-600 dark:text-zinc-300 mt-1">
                            Ref/UTR: <strong className="font-mono text-sky-600 dark:text-sky-400">{c.receiptNo}</strong>
                            {c.notes && c.notes !== c.receiptNo && (
                              <span className="text-zinc-400 ml-1.5 font-normal">({c.notes})</span>
                            )}
                          </p>
                          <p className="text-[10px] text-zinc-400 mt-0.5">Submitted: {c.date}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-base font-black text-sky-600 dark:text-sky-400">₹{c.amount}</span>
                        </div>
                      </div>

                      {/* Action buttons: Verify & Clear */}
                      <div className="flex items-center justify-end gap-2 pt-1 border-t border-zinc-200/50 dark:border-zinc-700/50">
                        <button
                          type="button"
                          disabled={isAnyLoading}
                          onClick={() => handleClearUpiClaim(c)}
                          className="px-3 py-1.5 rounded-xl border border-zinc-200 hover:border-rose-300 hover:bg-rose-50 text-zinc-600 hover:text-rose-700 dark:border-zinc-700 dark:hover:bg-rose-950/40 dark:text-zinc-300 dark:hover:text-rose-300 text-xs font-bold transition cursor-pointer disabled:opacity-50"
                        >
                          {isClearing ? "Clearing..." : "✕ Clear Claim"}
                        </button>
                        <button
                          type="button"
                          disabled={isAnyLoading}
                          onClick={() => handleVerifyUpiClaim(c)}
                          className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                        >
                          <CheckCheck className="h-3.5 w-3.5" />
                          <span>{isVerifying ? "Verifying..." : "Verify & Mark Paid"}</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="border-t border-zinc-100 dark:border-zinc-800 pt-3 flex items-center justify-between">
              {upiClaimsList.length > 1 ? (
                <button
                  type="button"
                  disabled={!!claimActionLoadingId}
                  onClick={handleVerifyAllClaims}
                  className="px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold transition cursor-pointer disabled:opacity-50"
                >
                  {claimActionLoadingId === "verify-all" ? "Verifying..." : `Verify All (${upiClaimsList.length})`}
                </button>
              ) : <div />}
              <button 
                onClick={() => setActiveKpiModal(null)} 
                className="px-4 py-2 rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 text-xs font-bold hover:opacity-90 transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* KPI Modal: Defaulters (2+ Months Overdue) */}
      {activeKpiModal === "defaulters" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white dark:bg-zinc-900 rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-red-200 dark:border-red-900 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <div>
                <h3 className="text-lg font-black text-red-600 flex items-center gap-1.5">
                  <ShieldAlert className="h-5 w-5" /> Defaulter Students (2+ Months Unpaid)
                </h3>
                <p className="text-xs text-zinc-400">{defaultersList.length} students with severe overdue fees over 60 days</p>
              </div>
              <button onClick={() => setActiveKpiModal(null)} className="h-8 w-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-500">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 divide-y divide-zinc-100 dark:divide-zinc-800 text-xs">
              {defaultersList.length === 0 ? (
                <div className="text-center py-8 text-zinc-400">
                  <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2 opacity-70" />
                  <p className="font-bold text-zinc-700 dark:text-zinc-200">Zero Defaulters!</p>
                  <p className="text-[11px] text-zinc-400">No students are currently overdue by more than 2 months.</p>
                </div>
              ) : (
                defaultersList.map(def => (
                  <div key={def.id} className="py-3.5 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-[#0A2E5C] dark:text-white">{def.studentName}</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-red-100 text-red-700">
                          {def.monthsOverdue} Months Due
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-400 mt-0.5">ID: {def.studentCode} • Phone: {def.phone}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-black text-red-600 text-sm">₹{def.amount}</span>
                      <a
                        href={def.phone ? `tel:${def.phone.replace(/[^0-9+]/g, "")}` : undefined}
                        className={`p-2 rounded-xl flex items-center justify-center transition active:scale-95 ${
                          def.phone 
                            ? "bg-sky-50 hover:bg-sky-100 text-sky-600 dark:bg-sky-950 dark:text-sky-400 cursor-pointer shadow-2xs" 
                            : "bg-zinc-100 text-zinc-400 opacity-40 cursor-not-allowed"
                        }`}
                        title={def.phone ? `Single-Click Call: ${def.phone}` : "No Phone"}
                      >
                        <Phone className="h-4 w-4" />
                      </a>
                      <button 
                        onClick={() => { setActiveKpiModal(null); handleOpenWhatsAppReminder(def); }}
                        className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white font-bold text-xs shadow-xs hover:bg-emerald-700 cursor-pointer"
                      >
                        Nudge on WhatsApp
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="border-t border-zinc-100 dark:border-zinc-800 pt-3 flex justify-end">
              <button onClick={() => setActiveKpiModal(null)} className="px-4 py-2 rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 text-xs font-bold">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* KPI Modal: Expenses History */}
      {activeKpiModal === "expenses" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white dark:bg-zinc-900 rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-amber-200 dark:border-amber-900 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <div>
                <h3 className="text-lg font-black text-amber-700 dark:text-amber-400">Expenses History</h3>
                <p className="text-xs text-zinc-400">All-time & monthly expense records</p>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => { setActiveKpiModal(null); setIsAddExpenseModalOpen(true); }}
                  className="px-3 py-1 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs"
                >
                  + Add Expense
                </button>
                <button onClick={() => setActiveKpiModal(null)} className="h-8 w-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-500">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Quick Stat Highlights */}
            <div className="grid grid-cols-2 gap-2 text-center p-3 rounded-2xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/50 dark:border-amber-800/40">
              <div>
                <p className="text-[10px] uppercase font-bold text-amber-600 dark:text-amber-400">All-Time Total Expenses</p>
                <p className="text-base sm:text-lg font-black text-amber-900 dark:text-amber-200">
                  ₹{allTimeExpensesTotal.toLocaleString("en-IN")}
                </p>
              </div>
              <div className="border-l border-amber-200 dark:border-amber-800">
                <p className="text-[10px] uppercase font-bold text-amber-600 dark:text-amber-400">{isDateFilterActive ? dateRangePreset : currentMonthName}</p>
                <p className="text-base sm:text-lg font-black text-amber-700 dark:text-amber-300">
                  ₹{effectiveExpensesTotal.toLocaleString("en-IN")}
                </p>
              </div>
            </div>

            {/* Scope Filter Tabs */}
            <div className="flex items-center gap-2 border-b border-zinc-100 dark:border-zinc-800 pb-2">
              <button
                onClick={() => setKpiHistoryScope("all")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  kpiHistoryScope === "all"
                    ? "bg-amber-700 text-white dark:bg-amber-500 dark:text-black shadow-xs"
                    : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                }`}
              >
                All Expenses ({expenses.length})
              </button>
              <button
                onClick={() => setKpiHistoryScope("period")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  kpiHistoryScope === "period"
                    ? "bg-amber-700 text-white dark:bg-amber-500 dark:text-black shadow-xs"
                    : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                }`}
              >
                {isDateFilterActive ? "Selected Filter" : currentMonthName} ({dynamicKpiExpenses.length})
              </button>
            </div>

            <div className="overflow-y-auto flex-1 divide-y divide-zinc-100 dark:divide-zinc-800 text-xs">
              {(kpiHistoryScope === "all" ? expenses : dynamicKpiExpenses).length === 0 ? (
                <div className="text-center py-8 text-zinc-400">
                  <Wallet className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="font-bold">No expenses found</p>
                  <p className="text-[11px]">Click &quot;+ Add Expense&quot; to record library bills and operational costs.</p>
                </div>
              ) : (
                (kpiHistoryScope === "all" ? expenses : dynamicKpiExpenses).map(exp => (
                  <div key={exp.id} className="py-3 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-[#0A2E5C] dark:text-white">{exp.title}</span>
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                          {exp.category}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-400 mt-0.5">{exp.date} • {exp.paymentMethod} {exp.notes ? `• ${exp.notes}` : ""}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-black text-amber-900 dark:text-amber-200">₹{exp.amount.toLocaleString("en-IN")}</span>
                      <button 
                        onClick={() => handleDeleteExpenseItem(exp.id, exp.title)} 
                        className="text-zinc-400 hover:text-rose-600 p-1 rounded-md"
                        title="Delete expense record"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="border-t border-zinc-100 dark:border-zinc-800 pt-3 flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-500">
                Showing {(kpiHistoryScope === "all" ? expenses : dynamicKpiExpenses).length} records
              </span>
              <button onClick={() => setActiveKpiModal(null)} className="px-4 py-2 rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 text-xs font-bold">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* KPI Modal: Profit & Loss Revenue Summary */}
      {activeKpiModal === "revenue" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white dark:bg-zinc-900 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-purple-200 dark:border-purple-900 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <div>
                <h3 className="text-lg font-black text-purple-700 dark:text-purple-400">Profit & Loss Summary</h3>
                <p className="text-xs text-zinc-400">All-time & monthly net revenue comparison</p>
              </div>
              <button onClick={() => setActiveKpiModal(null)} className="h-8 w-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-500">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 py-2 text-xs">
              {/* All-Time Card */}
              <div className="p-3.5 rounded-2xl bg-purple-50/70 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 space-y-2">
                <div className="flex justify-between items-center text-[11px] font-bold text-purple-900 dark:text-purple-300">
                  <span className="uppercase tracking-wider">All-Time Grand Total</span>
                  <span className="text-base font-black text-purple-700 dark:text-purple-300">₹{allTimeNetRevenue.toLocaleString("en-IN")}</span>
                </div>
                <div className="flex justify-between text-zinc-500 dark:text-zinc-400 text-[11px]">
                  <span>Total Collected:</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">₹{allTimeCollection.toLocaleString("en-IN")}</span>
                </div>
                <div className="flex justify-between text-zinc-500 dark:text-zinc-400 text-[11px]">
                  <span>Total Expenses:</span>
                  <span className="font-bold text-amber-600 dark:text-amber-400">-₹{allTimeExpensesTotal.toLocaleString("en-IN")}</span>
                </div>
              </div>

              {/* Dynamic / Monthly Card */}
              <div className="p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 space-y-2">
                <div className="flex justify-between items-center text-[11px] font-bold text-zinc-800 dark:text-zinc-200">
                  <span className="uppercase tracking-wider">{isDateFilterActive ? dateRangePreset : currentMonthName}</span>
                  <span className="text-base font-black text-zinc-900 dark:text-white">₹{effectiveNetRevenue.toLocaleString("en-IN")}</span>
                </div>
                <div className="flex justify-between text-zinc-500 dark:text-zinc-400 text-[11px]">
                  <span>Collection:</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">+₹{effectiveCollectionTotal.toLocaleString("en-IN")}</span>
                </div>
                <div className="flex justify-between text-zinc-500 dark:text-zinc-400 text-[11px]">
                  <span>Expenses:</span>
                  <span className="font-bold text-amber-600 dark:text-amber-400">-₹{effectiveExpensesTotal.toLocaleString("en-IN")}</span>
                </div>
              </div>
            </div>

            <div className="border-t border-zinc-100 dark:border-zinc-800 pt-3 flex justify-end">
              <button onClick={() => setActiveKpiModal(null)} className="px-4 py-2 rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 text-xs font-bold">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 7. MODALS: COLLECT FEES & ADD EXPENSE                                     */}
      {/* ========================================================================= */}

      {/* Modal: Collect Fees */}
      {isCollectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white dark:bg-zinc-900 rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-zinc-200 dark:border-zinc-800 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
                  <CreditCard className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-[#0A2E5C] dark:text-white">Collect Student Fees</h3>
                  <p className="text-[11px] text-zinc-400">Record full or partial payment into Supabase</p>
                </div>
              </div>
              <button onClick={() => setIsCollectModalOpen(false)} className="h-8 w-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-500">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCollectFeesSubmit} className="space-y-4 text-xs">
              
              {/* Student Picker */}
              <div>
                <label className="block font-bold text-zinc-700 dark:text-zinc-300 mb-1">Select Student Member</label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    placeholder="Search name or phone..."
                    value={newStudentName}
                    onChange={(e) => {
                      setNewStudentName(e.target.value);
                      setShowStudentDropdown(true);
                    }}
                    onFocus={() => setShowStudentDropdown(true)}
                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-bold text-[#0A2E5C] dark:text-white"
                  />
                  {showStudentDropdown && (
                    <div className="absolute top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-lg z-20 divide-y divide-zinc-100 dark:divide-zinc-700">
                      {students
                        .filter(s => s.fullName.toLowerCase().includes(newStudentName.toLowerCase()) || s.phone.includes(newStudentName))
                        .map(s => (
                          <div 
                            key={s.id} 
                            onClick={() => {
                              setSelectedStudentId(s.id);
                              setNewStudentName(s.fullName);
                              setNewStudentPhone(s.phone);
                              setNewStudentEmail(s.email);
                              setTotalBilledDue(s.dueAmount && s.dueAmount > 0 ? s.dueAmount : 600);
                              setNewAmount(s.dueAmount && s.dueAmount > 0 ? s.dueAmount : 600);
                              setNewShift(s.shift || "Morning Shift");
                              setShowStudentDropdown(false);
                            }}
                            className="p-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-700 cursor-pointer flex justify-between items-center"
                          >
                            <div>
                              <p className="font-bold text-[#0A2E5C] dark:text-white">{s.fullName}</p>
                              <p className="text-[10px] text-zinc-400">{s.studentCode} • {s.phone}</p>
                            </div>
                            <span className="text-[10px] font-black text-rose-600">₹{s.dueAmount || 600} Due</span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Fee Type & Shift */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-zinc-700 dark:text-zinc-300 mb-1">Fee Type</label>
                  <select 
                    value={newType} 
                    onChange={(e) => setNewType(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 font-bold"
                  >
                    <option value="Monthly Seat Fee">Monthly Seat Fee</option>
                    <option value="Admission / Registration">Admission Fee</option>
                    <option value="Locker Facility">Locker Facility</option>
                    <option value="Late Fine">Late Fine</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-zinc-700 dark:text-zinc-300 mb-1">Assigned Shift</label>
                  <input
                    type="text"
                    value={newShift}
                    onChange={(e) => setNewShift(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 font-bold"
                  />
                </div>
              </div>

              {/* Total Due & Amount Collected */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-zinc-700 dark:text-zinc-300 mb-1">Total Due Amount (₹)</label>
                  <input 
                    type="number"
                    min="1"
                    value={totalBilledDue}
                    onChange={(e) => setTotalBilledDue(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-zinc-700 dark:text-zinc-300 mb-1">Amount Collecting (₹)</label>
                  <input 
                    type="number"
                    min="1"
                    value={newAmount}
                    onChange={(e) => setNewAmount(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200 font-black"
                  />
                </div>
              </div>

              {/* Payment Method */}
              <div>
                <label className="block font-bold text-zinc-700 dark:text-zinc-300 mb-1">Payment Method</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["UPI", "Cash", "Bank Transfer"] as const).map(mode => (
                    <button
                      type="button"
                      key={mode}
                      onClick={() => setNewMethod(mode)}
                      className={`py-2 rounded-xl border text-xs font-bold transition cursor-pointer ${
                        newMethod === mode 
                          ? "bg-emerald-600 text-white border-emerald-600 font-black shadow-xs" 
                          : "border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400"
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="border-t border-zinc-100 dark:border-zinc-800 pt-3 flex items-center justify-end gap-2.5">
                <button 
                  type="button" 
                  onClick={() => setIsCollectModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-bold text-zinc-600"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={isSubmittingFee}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-md cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingFee ? "Saving..." : `Confirm & Collect ₹${newAmount}`}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Operational Expense */}
      {isAddExpenseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white dark:bg-zinc-900 rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-zinc-200 dark:border-zinc-800 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
                  <Wallet className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-[#0A2E5C] dark:text-white">Add Operational Expense</h3>
                  <p className="text-[11px] text-zinc-400">Record library expenses into Supabase</p>
                </div>
              </div>
              <button onClick={() => setIsAddExpenseModalOpen(false)} className="h-8 w-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-500">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleAddExpenseSubmit} className="space-y-4 text-xs">
              
              <div>
                <label className="block font-bold text-zinc-700 dark:text-zinc-300 mb-1">Expense Title / Vendor</label>
                <input 
                  type="text"
                  required
                  placeholder="e.g. September Electricity Bill"
                  value={newExpenseTitle}
                  onChange={(e) => setNewExpenseTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-zinc-700 dark:text-zinc-300 mb-1">Category</label>
                  <select 
                    value={newExpenseCategory}
                    onChange={(e) => setNewExpenseCategory(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 font-bold"
                  >
                    <option value="Electricity Bill">Electricity Bill</option>
                    <option value="Library Rent">Library Rent</option>
                    <option value="High-Speed Internet / Wi-Fi">Internet / Wi-Fi</option>
                    <option value="Cleaning & Maintenance">Cleaning & Maintenance</option>
                    <option value="Water & Dispensers">Water & Dispensers</option>
                    <option value="Tea & Refreshments">Tea & Refreshments</option>
                    <option value="Stationery & Printing">Stationery & Printing</option>
                    <option value="AC & Inverter Servicing">AC & Inverter Servicing</option>
                    <option value="Other Operations">Other Operations</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-zinc-700 dark:text-zinc-300 mb-1">Amount (₹)</label>
                  <input 
                    type="number"
                    min="1"
                    required
                    value={newExpenseAmount}
                    onChange={(e) => setNewExpenseAmount(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 font-black"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-zinc-700 dark:text-zinc-300 mb-1">Date</label>
                  <input 
                    type="date"
                    required
                    value={newExpenseDate}
                    onChange={(e) => setNewExpenseDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-zinc-700 dark:text-zinc-300 mb-1">Payment Method</label>
                  <select
                    value={newExpenseMethod}
                    onChange={(e) => setNewExpenseMethod(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 font-bold"
                  >
                    <option value="UPI">UPI / QR</option>
                    <option value="Cash">Cash</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Card">Debit/Credit Card</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-zinc-700 dark:text-zinc-300 mb-1">Notes / Voucher Reference (Optional)</label>
                <input 
                  type="text"
                  placeholder="e.g. Paid to vendor, receipt #104"
                  value={newExpenseNotes}
                  onChange={(e) => setNewExpenseNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 font-medium"
                />
              </div>

              <div className="border-t border-zinc-100 dark:border-zinc-800 pt-3 flex items-center justify-end gap-2.5">
                <button 
                  type="button" 
                  onClick={() => setIsAddExpenseModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-bold text-zinc-600"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={isSubmittingExpense}
                  className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black shadow-md cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingExpense ? "Recording..." : `Save Expense (₹${newExpenseAmount})`}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 8. INVOICE PREVIEW & PRINT MODAL                                          */}
      {/* ========================================================================= */}
      {selectedInvoice && (
        <FeeInvoiceModal
          invoice={selectedInvoice}
          onClose={() => setSelectedInvoice(null)}
          onEmail={async (inv) => {
            if (inv.studentEmail) {
              const tx = transactions.find(t => t.receiptNo === inv.invoiceNo);
              if (tx) await handleSendEmailReceipt(tx);
            }
          }}
          isSendingEmail={!!sendingReceiptId}
        />
      )}

      {/* ========================================================================= */}
      {/* 9. MOBILE FILTER MODAL (TRIGGERED BY FILTER ICON IN MOBILE VIEW)          */}
      {/* ========================================================================= */}
      {mobileFilterSection && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full sm:max-w-md bg-white dark:bg-zinc-900 rounded-t-3xl sm:rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-2xl p-5 sm:p-6 max-h-[90vh] overflow-y-auto">
            
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800 mb-4">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-xl bg-[#F5E6D3] dark:bg-zinc-800 text-[#8B5E3C] dark:text-[#E8D7C3] flex items-center justify-center">
                  <Filter className="h-4 w-4" />
                </div>
                <h3 className="text-base font-black text-[#0A2E5C] dark:text-white">
                  {mobileFilterSection === "ledger" ? "Filter Dues Ledger" : "Filter Transactions"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setMobileFilterSection(null)}
                className="h-8 w-8 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 hover:text-zinc-800 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Date Range Section */}
            <div className="mb-4">
              <h4 className="text-[11px] font-black uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2">
                DATE RANGE PRESETS
              </h4>
              <div className="grid grid-cols-2 gap-2">
                {(["Today", "Yesterday", "Last 7 Days", "Last 30 Days"] as const).map((preset) => {
                  const isSelected = tempPreset === preset;
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => handleSelectPreset(preset)}
                      className={`py-2 px-3 rounded-xl text-xs font-bold transition text-center cursor-pointer ${
                        isSelected
                          ? "bg-[#8B5E3C] text-white shadow-xs"
                          : "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                      }`}
                    >
                      {preset}
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-2 gap-2 mt-3">
                <div>
                  <label className="block text-[10px] font-bold text-zinc-500 dark:text-zinc-400 mb-1">From Date</label>
                  <input
                    type="date"
                    value={tempFromDate}
                    onChange={(e) => {
                      setTempFromDate(e.target.value);
                      setTempPreset("Custom");
                    }}
                    className="w-full py-1.5 px-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-xs font-bold text-[#0A2E5C] dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-500 dark:text-zinc-400 mb-1">To Date</label>
                  <input
                    type="date"
                    value={tempToDate}
                    onChange={(e) => {
                      setTempToDate(e.target.value);
                      setTempPreset("Custom");
                    }}
                    className="w-full py-1.5 px-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-xs font-bold text-[#0A2E5C] dark:text-white"
                  />
                </div>
              </div>
            </div>

            {/* Specific Filter by Section */}
            {mobileFilterSection === "ledger" ? (
              <div className="mb-5">
                <h4 className="text-[11px] font-black uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2">
                  DUE STATUS
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  {(["All", "Pending", "Overdue", "Defaulter"] as const).map((filter) => (
                    <button
                      key={filter}
                      type="button"
                      onClick={() => setLedgerStatusFilter(filter)}
                      className={`py-2 px-3 rounded-xl text-xs font-bold transition text-center cursor-pointer ${
                        ledgerStatusFilter === filter
                          ? "bg-[#0A2E5C] text-white dark:bg-white dark:text-zinc-900 shadow-xs"
                          : "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                      }`}
                    >
                      {filter}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mb-5">
                <h4 className="text-[11px] font-black uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2">
                  PAYMENT MODE
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  {["All", "UPI", "Cash", "Bank Transfer", "Card"].map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setTxModeFilter(mode)}
                      className={`py-2 px-3 rounded-xl text-xs font-bold transition text-center cursor-pointer ${
                        txModeFilter === mode
                          ? "bg-[#0A2E5C] text-white dark:bg-white dark:text-zinc-900 shadow-xs"
                          : "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                      }`}
                    >
                      {mode === "All" ? "All Modes" : mode}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Footer Buttons */}
            <div className="flex items-center justify-between pt-3 border-t border-zinc-100 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => {
                  if (mobileFilterSection === "ledger") setLedgerStatusFilter("All");
                  if (mobileFilterSection === "tx") setTxModeFilter("All");
                  handleClearDateFilter();
                  setMobileFilterSection(null);
                }}
                className="text-xs font-bold text-rose-500 hover:text-rose-700 cursor-pointer"
              >
                Reset All Filters
              </button>
              <button
                type="button"
                onClick={() => {
                  handleApplyDateFilter();
                  setMobileFilterSection(null);
                }}
                className="px-5 py-2 rounded-xl bg-[#0A2E5C] hover:bg-black text-[#F5E6D3] text-xs font-black shadow-xs cursor-pointer active:scale-95 transition"
              >
                Apply Filters
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
