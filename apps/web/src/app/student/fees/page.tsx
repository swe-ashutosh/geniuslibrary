"use client";

/**
 * [WEB • PAGE] Student Fees
 *
 * Dues summary, receipts and UPI deep-link payment (details from
 * BRAND_CONFIG.payment).
 */
import { useState, useEffect } from "react";
import { 
  IndianRupee, 
  CheckCircle2, 
  Clock, 
  Download, 
  CreditCard, 
  QrCode, 
  FileText, 
  Sparkles, 
  ShieldCheck, 
  ArrowRight,
  RefreshCw,
  Receipt,
  Printer,
  Mail,
  Copy,
  Check,
  Info
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getFees, createFee, FeeRecord, sendFeeReceiptEmail, createNotification, sendMessage, generateInvoiceNumber, formatInvoiceNumber } from "@/lib/api";
import FeeInvoiceModal, { InvoiceData } from "@/components/FeeInvoiceModal";
import { BRAND_CONFIG } from "@/lib/config";

export function resolvePlanRate(shift?: string, plan?: string, dueAmount?: number): number {
  if (plan === "Trial Pass" || (shift || "").toLowerCase().includes("trial")) {
    return 0;
  }
  const s = (shift || "").toLowerCase();
  if (s.includes("locker") || s.includes("700")) return 700;
  if (s.includes("reserve big") || s.includes("big") || s.includes("600")) return 600;
  if (s.includes("reserve mini") || s.includes("mini") || s.includes("prime") || s.includes("pro") || s.includes("6 hour") || s.includes("6hr") || s.includes("night") || s.includes("500") || s.includes("evening")) return 500;
  if (s.includes("standard") || s.includes("3 hour") || s.includes("300") || s.includes("3hr")) return 300;
  if (s.includes("full") || s.includes("1100")) return 1100;

  if (dueAmount && Number(dueAmount) > 0) return Number(dueAmount);
  return 600;
}

export default function StudentFeesPage() {
  const [fees, setFees] = useState<FeeRecord[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<FeeRecord | null>(null);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailStatus, setEmailStatus] = useState<string | null>(null);

  // UPI Payment Claim State
  const [utrNumber, setUtrNumber] = useState("");
  const [claimAmount, setClaimAmount] = useState<number>(600);
  const [claimNotes, setClaimNotes] = useState("");
  const [isSubmittingClaim, setIsSubmittingClaim] = useState(false);
  const [claimSuccessMsg, setClaimSuccessMsg] = useState<string | null>(null);
  const [copiedUpi, setCopiedUpi] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      // 1. Supabase only handles Auth & Signup Profile Details
      let profileData: any = null;
      try {
        const { data } = await supabase
          .from("profiles")
          .select("full_name, email, phone, parent_name, parent_phone, address, course, shift, membership_plan, fee_status, due_amount, student_code")
          .eq("id", user.id)
          .maybeSingle();
        profileData = data;
      } catch {}

      const candidateIds = Array.from(
        new Set([
          user.id,
          profileData?.student_code,
          profileData?.phone,
          user.email,
        ].filter(Boolean))
      ) as string[];

      const feesArrays = await Promise.all(candidateIds.map((id) => getFees(id).catch(() => [])));
      const feesMap = new Map<string, FeeRecord>();
      feesArrays.flat().forEach((f) => {
        if (f && f.id) feesMap.set(f.id, f);
      });
      let feesData = Array.from(feesMap.values()).sort(
        (a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")
      );

      const isDueInProfile = profileData?.fee_status === "Due" || (profileData?.due_amount && Number(profileData.due_amount) > 0);
      const hasUnpaidFee = feesData.some(f => !f.paid);
      const hasOutstandingDue = isDueInProfile || hasUnpaidFee;

      const planRate = resolvePlanRate(profileData?.shift, profileData?.membership_plan, profileData?.due_amount);

      const resolvedFeeStatus = hasOutstandingDue ? "Due" : "Paid";
      const unpaidFeesSum = feesData.filter(f => !f.paid).reduce((s, f) => s + (f.amount || 0), 0);
      const resolvedDueAmount = hasOutstandingDue
        ? (unpaidFeesSum > 0 ? unpaidFeesSum : planRate)
        : 0;

      // If feesData is empty, but student's operational status is "Paid", synthesize the official enrollment receipt
      if (feesData.length === 0 && !hasOutstandingDue) {
        feesData = [
          {
            id: `fee-${user.id.slice(0, 8)}`,
            studentId: user.id,
            studentName: profileData?.full_name || user.user_metadata?.full_name || "Student Member",
            type: "Monthly Seat Fee",
            amount: planRate,
            paid: true,
            paidAt: new Date().toISOString(),
            receiptNo: generateInvoiceNumber(),
            description: `${profileData?.membership_plan || "General"} Plan - ${profileData?.shift || "Standard"}`,
            createdAt: new Date().toISOString(),
          }
        ];
      }
      // Note: If student has unpaid dues, do NOT synthesize fake invoices. Invoices are generated strictly upon payment.

      const mergedProfile = {
        id: user.id,
        full_name: profileData?.full_name || user.user_metadata?.full_name || user.email?.split("@")[0] || "Student Member",
        email: user.email || "",
        phone: profileData?.phone || "",
        parent_name: profileData?.parent_name || "",
        parent_phone: profileData?.parent_phone || "",
        address: profileData?.address || "",
        course: profileData?.course || "",
        shift: profileData?.shift || "Morning",
        membership_plan: profileData?.membership_plan || "General",
        fee_status: resolvedFeeStatus,
        due_amount: resolvedDueAmount,
        seat_number: profileData?.seat_number || null,
        status: (profileData?.status as any) || "active",
      };

      setProfile(mergedProfile);
      setFees(feesData);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const paidFees = fees.filter((f) => f.paid);
  const totalPaid = paidFees.reduce((acc, curr) => acc + curr.amount, 0);
  const currentPlanRate = resolvePlanRate(profile?.shift, profile?.membership_plan, profile?.due_amount);
  const unpaidFees = fees.filter((f) => !f.paid);
  const feesDueSum = unpaidFees.reduce((acc, curr) => acc + curr.amount, 0);
  const totalUnpaidAmount = Math.max(feesDueSum, profile?.due_amount || 0);
  const pendingFee = unpaidFees[0] || null;
  const isDue = totalUnpaidAmount > 0 || profile?.fee_status === "Due";

  const handleEmailReceipt = async (receipt: FeeRecord) => {
    const email = profile?.email;
    if (!email) {
      setEmailStatus("⚠️ Email address not found.");
      return;
    }
    setIsSendingEmail(true);
    setEmailStatus(null);
    try {
      const res = await sendFeeReceiptEmail(receipt.id, email, receipt.remainingDue || undefined, receipt.totalDue || undefined);
      if (res.success) {
        setEmailStatus(`✓ Receipt sent to ${email}! Check your inbox.`);
      } else {
        setEmailStatus(`⚠️ ${res.error || "Failed to send email"}`);
      }
    } catch (err: any) {
      setEmailStatus(`⚠️ ${err.message}`);
    } finally {
      setIsSendingEmail(false);
    }
  };

  const openPaymentModal = () => {
    setClaimAmount(totalUnpaidAmount > 0 ? totalUnpaidAmount : (currentPlanRate > 0 ? currentPlanRate : 500));
    setClaimSuccessMsg(null);
    setIsQrModalOpen(true);
  };

  const handleSubmitClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!utrNumber.trim()) {
      alert("Please enter your 12-digit UPI / UTR Transaction ID.");
      return;
    }
    setIsSubmittingClaim(true);
    try {
      const studentName = profile?.full_name || "Student Member";
      const studentCode = profile?.student_code || "";
      const studentPhone = profile?.phone || "";

      // 1. Record Pending Fee Claim in Database (Supabase fees table)
      await createFee({
        studentId: profile?.id || "student",
        studentName: studentName,
        studentEmail: profile?.email || "",
        type: "UPI Claim",
        amount: claimAmount,
        paid: false,
        receiptNo: `UTR-${utrNumber.trim()}`,
        description: `UPI Payment Claim | UTR: ${utrNumber.trim()}${claimNotes ? ` | Note: ${claimNotes}` : ""}`,
      });

      // 2. Notify Admin via Notification
      await createNotification({
        recipientRole: "admin",
        title: "💳 New UPI Fee Payment Claim",
        message: `${studentName} (${studentCode || studentPhone}) claimed ₹${claimAmount} payment via UPI. UTR: ${utrNumber.trim()}${claimNotes ? ` (${claimNotes})` : ""}. Please verify and mark as Paid in Fees section.`,
        type: "payment",
        actionUrl: "/admin/fees?modal=upi",
      });

      // 2. Send Message to Admin thread
      await sendMessage({
        studentId: profile?.id || "student",
        studentName: studentName,
        studentEmail: profile?.email || "",
        senderRole: "student",
        senderName: studentName,
        message: `[UPI Payment Claim] I have paid ₹${claimAmount} via UPI for library fees. UTR Number: ${utrNumber.trim()}${claimNotes ? ` | App: ${claimNotes}` : ""}. Please verify and update my status to Paid.`,
        recipientRole: "admin",
        recipientName: "Library Admin",
      });

      setClaimSuccessMsg(`Your payment claim for ₹${claimAmount} (UTR: ${utrNumber.trim()}) has been sent to the admin. Once verified, your status will update to Paid!`);
    } catch (err: any) {
      alert(`Failed to submit claim: ${err?.message || "Please try again"}`);
    } finally {
      setIsSubmittingClaim(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-3xl bg-white p-6 shadow-xs border border-[#E5E7EB] dark:border-zinc-800 dark:bg-[#0A2E5C]">
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
            <IndianRupee className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-[#0A2E5C] dark:text-white">
              Fee Management & Digital Receipts
            </h1>
            <p className="text-xs text-zinc-500">
              Track monthly library seat fees, generate GST receipts, and pay online securely.
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3">
          <button
            onClick={openPaymentModal}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3 text-xs font-bold text-[#0A2E5C] border border-[#E5E7EB] shadow-sm hover:bg-[#F8FAFC] dark:bg-[#0A2E5C] dark:text-zinc-300 dark:border-zinc-700 dark:hover:bg-zinc-800 transition active:scale-95 cursor-pointer"
          >
            <QrCode className="h-4 w-4" />
            <span>Show QR</span>
          </button>
          
          <a
            href={`upi://pay?pa=${BRAND_CONFIG.payment.upiId}&pn=${encodeURIComponent(BRAND_CONFIG.payment.upiPayeeName)}&am=${profile?.shift === "full_day" ? 1100 : profile?.shift === "evening" ? 500 : 600}&cu=INR`}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-2xl bg-[#0A2E5C] px-5 py-3 text-xs font-bold text-[#FFC107] border border-[#FFC107]/40 shadow-md hover:bg-[#141A24] transition active:scale-95 cursor-pointer"
          >
            <Sparkles className="h-4 w-4" />
            <span>Pay Fee Directly</span>
          </a>
        </div>
      </div>

      {/* KPI Cards (2-in-a-row mobile grid) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="rounded-3xl border border-zinc-200 bg-white p-3.5 sm:p-5 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C]">
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <div className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <span className="text-[9px] sm:text-[10px] font-bold text-emerald-600 uppercase">Paid</span>
          </div>
          <p className="text-[10px] sm:text-xs font-bold text-zinc-500 truncate">Total Fees Paid</p>
          <p className="text-xl sm:text-2xl font-black text-[#0A2E5C] dark:text-white mt-0.5 sm:mt-1">₹{totalPaid}</p>
          <p className="text-[9px] sm:text-[10px] font-semibold text-emerald-600 mt-1 truncate">
            {totalPaid > 0 ? "Admission payments logged" : "No payments logged yet"}
          </p>
        </div>

        <div className="rounded-3xl border border-zinc-200 bg-white p-3.5 sm:p-5 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C]">
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <div className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400">
              <Clock className="h-4 w-4" />
            </div>
            <span className="text-[9px] sm:text-[10px] font-bold text-amber-600 uppercase">Monthly</span>
          </div>
          <p className="text-[10px] sm:text-xs font-bold text-zinc-500 truncate">Plan Rate</p>
          <p className="text-xl sm:text-2xl font-black text-[#0A2E5C] dark:text-white mt-0.5 sm:mt-1 truncate">
            {currentPlanRate === 0 ? "FREE" : `₹${currentPlanRate}`}
            {currentPlanRate > 0 && <span className="text-xs font-normal text-zinc-400">/mo</span>}
          </p>
          <p className="text-[9px] sm:text-[10px] font-semibold text-zinc-400 mt-1 truncate">
            {profile?.shift?.toLowerCase().endsWith("shift") ? profile.shift : `${profile?.shift || "Standard"} Shift`}
          </p>
        </div>

        <div className="rounded-3xl border border-zinc-200 bg-white p-3.5 sm:p-5 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C]">
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <div className={`flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl ${
              isDue ? "bg-amber-100 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400" : "bg-purple-100 text-purple-600 dark:bg-purple-950/50 dark:text-purple-400"
            }`}>
              <Receipt className="h-4 w-4" />
            </div>
            <span className={`text-[9px] sm:text-[10px] font-bold uppercase ${isDue ? "text-amber-600" : "text-emerald-600"}`}>
              {isDue ? "DUE" : "CLEAR"}
            </span>
          </div>
          <p className="text-[10px] sm:text-xs font-bold text-zinc-500 truncate">{isDue ? "Outstanding Due" : "Fee Status"}</p>
          <p className={`text-sm sm:text-xl font-black mt-0.5 sm:mt-1 truncate ${isDue ? "text-amber-600 dark:text-amber-400" : "text-[#0A2E5C] dark:text-white"}`}>
            {isDue ? `₹${totalUnpaidAmount}` : "All Clear"}
          </p>
          <p className={`text-[9px] sm:text-[10px] font-semibold mt-1 truncate ${isDue ? "text-amber-600" : "text-emerald-600"}`}>
            {isDue ? (pendingFee?.dueDate ? `Due: ${pendingFee.dueDate}` : "Payment Pending") : "All dues cleared"}
          </p>
        </div>

        <div className="rounded-3xl border border-zinc-200 bg-white p-3.5 sm:p-5 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C]">
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <div className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-[#0A2E5C] text-[#FFC107]">
              <FileText className="h-4 w-4" />
            </div>
            <span className="text-[9px] sm:text-[10px] font-bold text-[#0B5ED7] dark:text-[#FFC107] uppercase">Invoices</span>
          </div>
          <p className="text-[10px] sm:text-xs font-bold text-zinc-500 truncate">Receipts</p>
          <p className="text-xl sm:text-2xl font-black text-[#0A2E5C] dark:text-white mt-0.5 sm:mt-1">{paidFees.length}</p>
          <p className="text-[9px] sm:text-[10px] font-semibold text-zinc-400 mt-1 truncate">Total records</p>
        </div>
      </div>

      {/* Outstanding Due Notice Banner with Direct Pay Button */}
      {isDue && (
        <div className="rounded-3xl border border-amber-300 bg-linear-to-r from-amber-50 to-orange-50/60 p-5 shadow-xs dark:border-amber-800 dark:from-amber-950/40 dark:to-orange-950/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-sm">
              <Receipt className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-amber-900 dark:text-amber-300">
                  Fee Payment Pending
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 dark:bg-amber-900/80 dark:text-amber-200">
                  Due Immediate
                </span>
              </div>
              <p className="text-xs text-amber-800 dark:text-amber-300/90 mt-0.5">
                {profile?.membership_plan || "Library"} • {profile?.shift || "Standard"} — Outstanding balance: <strong className="font-black text-amber-950 dark:text-amber-100">₹{totalUnpaidAmount}</strong>
              </p>
              <p className="text-[11px] text-amber-700/80 dark:text-amber-400 mt-0.5">
                Official tax invoice and payment receipt will be generated automatically once your payment is received and verified.
              </p>
            </div>
          </div>

          <button
            onClick={openPaymentModal}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-2xl bg-linear-to-r from-[#0A2E5C] to-[#0B5ED7] text-xs font-black text-[#FFC107] hover:opacity-95 shadow-md active:scale-95 transition cursor-pointer shrink-0"
          >
            <Sparkles className="h-4 w-4" />
            <span>Pay ₹{totalUnpaidAmount} via UPI QR</span>
          </button>
        </div>
      )}

      {/* Fee History & Receipts */}
      <div className="rounded-3xl border border-[#E5E7EB] bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C]">
        <div className="flex items-center justify-between pb-4 border-b border-zinc-100 dark:border-zinc-800 mb-4">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-500" />
            <h3 className="text-sm font-bold text-[#0A2E5C] dark:text-white">Fee Invoices & Payment Receipts</h3>
          </div>
          <button
            onClick={loadData}
            disabled={isLoading}
            className="text-xs font-bold text-[#0B5ED7] dark:text-[#FFC107] hover:underline flex items-center gap-1 cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>

        <div className="space-y-3">
          {paidFees.length === 0 ? (
            <div className="py-8 text-center text-xs text-zinc-400 space-y-2">
              <IndianRupee className="h-7 w-7 mx-auto text-zinc-300 dark:text-zinc-600" />
              <p className="font-bold text-zinc-600 dark:text-zinc-300 text-sm">No payment receipts or invoices generated yet</p>
              <p className="text-[11px] max-w-md mx-auto text-zinc-500 dark:text-zinc-400">
                Invoices and official receipts are generated upon successful fee payment. Once your payment is verified, your official tax receipt (e.g. <span className="font-mono font-semibold">INV-2610-001</span>) will appear here for download.
              </p>
            </div>
          ) : paidFees.map((fee) => {
            const invoiceNum = formatInvoiceNumber(fee.receiptNo, fee.paidAt || fee.createdAt);
            return (
              <div
                key={fee.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-2xl bg-[#F8FAFC]/50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 gap-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-bold text-[#0A2E5C] dark:text-white">{fee.description || `${fee.type} Fee`}</p>
                    <span className="text-[10px] font-mono bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800 px-2 py-0.5 rounded font-bold">
                      {invoiceNum}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
                    Paid On: {fee.paidAt ? new Date(fee.paidAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "Completed"} • Status: Verified & Paid
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-sm font-black text-[#0A2E5C] dark:text-white">₹{fee.amount}</span>
                  <span className="text-[10px] font-bold px-2.5 py-1 rounded-lg text-emerald-700 bg-emerald-100 dark:bg-emerald-950/70">
                    PAID
                  </span>
                  <button
                    onClick={() => setSelectedReceipt(fee)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#E5E7EB] bg-white text-xs font-bold text-[#0A2E5C] hover:bg-[#F8FAFC] dark:border-zinc-700 dark:bg-[#0A2E5C] dark:text-white shadow-xs cursor-pointer"
                  >
                    <Download className="h-3.5 w-3.5 text-[#0B5ED7]" />
                    <span>Receipt</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Pay Online UPI QR & Payment Claim Modal */}
      {isQrModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 sm:p-4 backdrop-blur-sm overflow-y-auto">
          <div className="relative w-full max-w-md rounded-3xl border border-[#E5E7EB] bg-white p-5 sm:p-6 shadow-2xl dark:border-zinc-800 dark:bg-[#0A2E5C] space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-[#0A2E5C] dark:text-white">Pay Library Fee via UPI</h3>
                <p className="text-[11px] text-zinc-500">Scan QR, pay via any UPI app & submit UTR claim</p>
              </div>
              <button 
                onClick={() => { setIsQrModalOpen(false); setClaimSuccessMsg(null); }} 
                className="rounded-full p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {claimSuccessMsg ? (
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800 text-center space-y-2.5">
                <CheckCircle2 className="h-8 w-8 text-emerald-600 dark:text-emerald-400 mx-auto" />
                <h4 className="text-sm font-black text-emerald-900 dark:text-emerald-200">Claim Submitted Successfully!</h4>
                <p className="text-xs text-emerald-700 dark:text-emerald-300 leading-relaxed">
                  {claimSuccessMsg}
                </p>
                <button
                  type="button"
                  onClick={() => { setIsQrModalOpen(false); setClaimSuccessMsg(null); }}
                  className="w-full mt-2 rounded-xl bg-emerald-600 text-white py-2.5 text-xs font-bold shadow hover:bg-emerald-700 cursor-pointer"
                >
                  Done / Close
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmitClaim} className="space-y-4">
                {/* QR Code Card */}
                <div className="flex flex-col items-center justify-center p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-800/60 border border-dashed border-[#FFC107]">
                  <div className="p-2 bg-white rounded-2xl shadow-sm border border-zinc-200/80 dark:border-zinc-700 max-w-[260px] flex items-center justify-center">
                    <img
                      src="/payment-qr.jpg"
                      alt="Paytm UPI QR"
                      className="w-full h-auto rounded-xl object-contain max-h-72"
                    />
                  </div>
                  <div className="mt-3 text-center">
                    <p className="text-[11px] font-medium text-zinc-500">Scan via Paytm, PhonePe, Google Pay, or any UPI App</p>
                    <div className="mt-1.5 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-zinc-200/90 dark:bg-zinc-700 text-xs font-mono font-bold text-[#0A2E5C] dark:text-white shadow-xs">
                      <span>{BRAND_CONFIG.payment?.upiId || "paytmqr5u3ni1@ptys"}</span>
                      <button
                        type="button"
                        onClick={() => {
                          const upi = BRAND_CONFIG.payment?.upiId || "paytmqr5u3ni1@ptys";
                          navigator.clipboard.writeText(upi);
                          setCopiedUpi(true);
                          setTimeout(() => setCopiedUpi(false), 2000);
                        }}
                        className="text-zinc-500 hover:text-zinc-900 dark:hover:text-white cursor-pointer transition"
                        title="Copy UPI ID"
                      >
                        {copiedUpi ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Form to submit UTR */}
                <div className="space-y-3 text-left">
                  <div>
                    <label className="block text-xs font-bold text-[#0A2E5C] dark:text-zinc-200 mb-1">
                      12-Digit UPI / UTR Reference ID <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. 408219876543 (from receipt)"
                      value={utrNumber}
                      onChange={(e) => setUtrNumber(e.target.value.trim())}
                      className="w-full rounded-xl border border-zinc-200 bg-white p-2.5 text-xs font-mono font-bold text-[#0A2E5C] dark:border-zinc-700 dark:bg-zinc-800 dark:text-white focus:border-[#FFC107] focus:outline-none"
                    />
                    <p className="text-[10px] text-zinc-400 mt-1">Found in your payment app under &apos;UPI Ref No.&apos; or &apos;UTR&apos;.</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-[#0A2E5C] dark:text-zinc-200 mb-1">
                        Amount Paid (₹) <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="number"
                        required
                        value={claimAmount}
                        onChange={(e) => setClaimAmount(Number(e.target.value))}
                        className="w-full rounded-xl border border-zinc-200 bg-white p-2.5 text-xs font-bold text-[#0A2E5C] dark:border-zinc-700 dark:bg-zinc-800 dark:text-white focus:border-[#FFC107] focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[#0A2E5C] dark:text-zinc-200 mb-1">
                        UPI App (Optional)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. PhonePe / GPay"
                        value={claimNotes}
                        onChange={(e) => setClaimNotes(e.target.value)}
                        className="w-full rounded-xl border border-zinc-200 bg-white p-2.5 text-xs font-medium text-[#0A2E5C] dark:border-zinc-700 dark:bg-zinc-800 dark:text-white focus:border-[#FFC107] focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => { setIsQrModalOpen(false); setClaimSuccessMsg(null); }}
                    className="rounded-xl border border-zinc-200 px-4 py-2.5 text-xs font-bold text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingClaim}
                    className="rounded-xl bg-linear-to-r from-[#0B5ED7] to-[#FFC107] text-[#0A2E5C] px-5 py-2.5 text-xs font-black shadow-md hover:opacity-95 transition active:scale-95 cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <Sparkles className="h-4 w-4" />
                    <span>{isSubmittingClaim ? "Submitting..." : "Submit Payment Claim"}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Proper A4 Fee Invoice / Receipt Modal */}
      {selectedReceipt && (
        <FeeInvoiceModal
          invoice={{
            invoiceNo: formatInvoiceNumber(selectedReceipt.receiptNo, selectedReceipt.paidAt),
            date: selectedReceipt.paidAt
              ? new Date(selectedReceipt.paidAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
              : new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
            time: selectedReceipt.paidAt
              ? new Date(selectedReceipt.paidAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })
              : new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }),
            studentName: profile?.full_name || selectedReceipt.studentName || "Student Member",
            studentCode: profile?.student_code || undefined,
            studentEmail: profile?.email || undefined,
            studentPhone: profile?.phone || undefined,
            seatNo: profile?.seat_number || undefined,
            shift: profile?.shift || "Morning Shift",
            planName: profile?.membership_plan || "General Member",
            feeType: selectedReceipt.description || selectedReceipt.type || "Monthly Seat & Facility Fee",
            amount: selectedReceipt.amount,
            totalDue: selectedReceipt.totalDue ?? (selectedReceipt.remainingDue != null ? selectedReceipt.amount + selectedReceipt.remainingDue : (profile?.due_amount && profile.due_amount > 0 ? selectedReceipt.amount + profile.due_amount : undefined)),
            remainingDue: selectedReceipt.remainingDue != null ? selectedReceipt.remainingDue : (profile?.due_amount && profile.due_amount > 0 ? profile.due_amount : undefined),
            paymentMode: "Digital Transfer / Online",
            transactionId: selectedReceipt.id,
            status: ((selectedReceipt.remainingDue != null && selectedReceipt.remainingDue > 0) || (profile?.due_amount && profile.due_amount > 0)) ? "Partial" : "Paid",
          }}
          onClose={() => {
            setSelectedReceipt(null);
            setEmailStatus(null);
          }}
          onEmail={() => handleEmailReceipt(selectedReceipt)}
          isSendingEmail={isSendingEmail}
        />
      )}
    </div>
  );
}

