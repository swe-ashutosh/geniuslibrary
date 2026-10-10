"use client";

/**
 * [WEB • PAGE] Public Attendance Gate
 *
 * Supports strictly 2 verification methods:
 * 1. NFC Tap (Serial: 53:D4:B6:CD:53:00:01) -> Instant check-in/out, NO picture required.
 * 2. Camera QR Scan -> Scans single library gate QR with silent picture capture.
 *
 * If scanned with external scanner:
 * - Not logged in: Displays library welcome card with buttons to Sign In or visit Homepage.
 * - Logged in: Allows instant NFC or QR attendance check-in/out.
 */
import { useEffect, useState, useRef, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { 
  CheckCircle2, 
  Clock, 
  Smartphone, 
  Radio, 
  ArrowRight, 
  AlertCircle, 
  RefreshCw, 
  Armchair, 
  ShieldCheck, 
  LogIn,
  Camera,
  Home,
  QrCode,
  Sparkles
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { smartQrScanAttendance } from "@/lib/api";
import { BRAND_CONFIG } from "@/lib/config";
import { BrandLogo } from "@/components/BrandLogo";
import { LiveAttendanceCameraModal } from "@/components/LiveAttendanceCameraModal";

export default function AttendanceGatePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#FDFCF7] flex items-center justify-center text-[#0A2E5C]">
        <RefreshCw className="h-8 w-8 animate-spin text-[#FFC107]" />
      </div>
    }>
      <AttendanceGateContent />
    </Suspense>
  );
}

function AttendanceGateContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    action?: "checked_in" | "checked_out";
    seatNumber?: string;
    time?: string;
    message: string;
    method?: "nfc" | "qr";
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [nfcListening, setNfcListening] = useState(false);
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
  const [externalScanDetected, setExternalScanDetected] = useState(false);

  // Detect if opened from external scanner via query param
  useEffect(() => {
    const qrParam = searchParams.get("qr") || searchParams.get("action") || searchParams.get("source");
    if (qrParam) {
      setExternalScanDetected(true);
    }
  }, [searchParams]);

  // Check Auth state and load student profile if logged in
  useEffect(() => {
    async function initGate() {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
          setLoading(false);
          return;
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .maybeSingle();

        const studentName = profile?.full_name || profile?.name || user.user_metadata?.full_name || user.email?.split("@")[0] || "Student";
        const studentInfo = {
          id: user.id,
          name: studentName,
          email: user.email,
          seatNumber: profile?.seat_number || null,
          shift: profile?.shift || "General Shift",
        };
        setCurrentUser(studentInfo);
      } catch (err: any) {
        console.error("Attendance gate init error:", err);
        setErrorMsg("Failed to connect to library server. Please try again.");
      } finally {
        setLoading(false);
      }
    }

    initGate();
  }, []);

  // Process attendance (Method 1: NFC, Method 2: QR)
  const processAttendance = async (
    studentId: string, 
    studentName: string, 
    verificationMethod: "nfc" | "qr" = "nfc",
    photoUrl?: string
  ) => {
    setIsProcessing(true);
    setErrorMsg(null);

    // Haptic feedback
    if (typeof window !== "undefined" && window.navigator && window.navigator.vibrate) {
      try { window.navigator.vibrate([80, 50, 80]); } catch {}
    }

    try {
      const res = await smartQrScanAttendance({
        studentId,
        studentName,
        shiftName: currentUser?.shift || "General Shift",
        verificationMethod,
        photoUrl, // Only provided for QR, undefined for NFC!
      });

      if (res.action === "all_occupied") {
        setErrorMsg(res.message || "All 100 library desks are currently occupied. Please contact admin.");
        return;
      }

      setResult({
        success: res.success,
        action: res.action === "seat_occupied" ? undefined : res.action,
        seatNumber: res.seatNumber,
        time: res.checkInTime || res.checkOutTime || new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }),
        message: verificationMethod === "nfc"
          ? `✓ NFC Tap Verified (Tag: 53:D4:B6:CD:53:00:01). No picture required.`
          : `✓ Camera QR Verified with Silent Photo Proof.`,
        method: verificationMethod,
      });

      try {
        const { triggerNativeNotification } = await import("@/lib/pushNotify");
        const actionLabel = res.action === "checked_out" ? "Check-Out Confirmed" : "Check-In Confirmed";
        triggerNativeNotification({
          title: `✓ ${actionLabel} — ${BRAND_CONFIG.shortName}`,
          body: res.message || `${studentName} attendance recorded at ${res.checkInTime || res.checkOutTime}.`,
          url: "/student/attendance",
          tag: `gate-att-${Date.now()}`,
        }).catch(() => {});
      } catch {}
    } catch (err: any) {
      setErrorMsg(err.message || "Could not record attendance. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  // Method 1: Web NFC Tap (Serial: 53:D4:B6:CD:53:00:01) -> NO PICTURE NEEDED!
  const startNfcTap = async () => {
    if (typeof window === "undefined" || !("NDEFReader" in window)) {
      setErrorMsg("Web NFC is only available on compatible devices (such as Chrome on Android). On other devices, please use Camera QR Scan.");
      return;
    }

    try {
      setNfcListening(true);
      setErrorMsg(null);
      const ndef = new (window as any).NDEFReader();
      await ndef.scan();
      
      ndef.onreading = async (event: any) => {
        const rawSerial = event.serialNumber || "";
        const normalize = (s: string) => (s || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
        
        const ALLOWED_SERIALS = [
          "53:D4:B6:CD:53:00:01",
          "53:98:3A:CD:53:00:01"
        ];

        const isMatch = ALLOWED_SERIALS.some(
          (allowed) => normalize(allowed) === normalize(rawSerial)
        );

        if (!isMatch) {
          setErrorMsg(`Unrecognized NFC Tag! Serial: ${rawSerial}. Allowed Tag: 53:D4:B6:CD:53:00:01`);
          setNfcListening(false);
          return;
        }

        if (currentUser) {
          await processAttendance(currentUser.id, currentUser.name, "nfc");
          setNfcListening(false);
        }
      };
    } catch (err: any) {
      console.warn("NFC Error:", err);
      setErrorMsg("NFC sensor could not be activated: " + (err.message || "Permission required"));
      setNfcListening(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FDFCF7] text-[#0A2E5C] flex flex-col justify-between selection:bg-[#FFC107]/30">
      
      {/* Top Header */}
      <header className="border-b border-[#E5E7EB]/60 bg-white/80 backdrop-blur-md sticky top-0 z-20 px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <BrandLogo size="sm" />
          <div>
            <h1 className="text-sm font-black text-[#0A2E5C] tracking-tight">{BRAND_CONFIG.fullName}</h1>
            <p className="text-[10px] font-bold text-[#FFC107] tracking-wider uppercase">Gate Attendance System</p>
          </div>
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 hover:bg-zinc-200 px-3 py-1 text-[11px] font-bold text-zinc-700 transition"
          >
            <Home className="h-3.5 w-3.5" />
            <span>Homepage</span>
          </Link>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-[11px] font-bold text-emerald-800">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Gate Online</span>
          </span>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md rounded-3xl border border-[#E5E7EB] bg-white p-6 sm:p-8 shadow-xl text-center space-y-6">
          
          {/* Status Icon */}
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-[#0A2E5C] text-[#FFC107] shadow-lg relative">
            {loading || isProcessing ? (
              <RefreshCw className="h-10 w-10 animate-spin text-[#FFC107]" />
            ) : result ? (
              <CheckCircle2 className="h-10 w-10 text-emerald-400 animate-in zoom-in-75 duration-200" />
            ) : (
              <Radio className="h-10 w-10 animate-pulse text-[#FFC107]" />
            )}
            <div className="absolute inset-0 rounded-3xl border-2 border-[#FFC107]/30 animate-pulse pointer-events-none" />
          </div>

          {/* Heading */}
          <div>
            <h2 className="text-xl font-black text-[#0A2E5C] tracking-tight">
              {loading ? "Checking Student Session..." :
               isProcessing ? "Recording Attendance..." :
               result ? (result.action === "checked_in" ? "Check-In Confirmed!" : "Check-Out Confirmed!") :
               `Welcome to ${BRAND_CONFIG.name}`}
            </h2>
            <p className="mt-1 text-xs text-zinc-500 max-w-xs mx-auto leading-relaxed">
              {loading ? "Checking your credentials..." :
               isProcessing ? "Updating attendance logs..." :
               result ? result.message :
               externalScanDetected && !currentUser ?
               "Library Gate QR scanned successfully. Sign in with your student account to record check-in/out, or visit the homepage." :
               "Choose your verification method below: NFC Tap (Instant, No Photo) or Camera QR Scan (Silent Photo Proof)."}
            </p>
          </div>

          {/* Error Notice */}
          {errorMsg && (
            <div className="flex items-center gap-2 rounded-2xl bg-rose-50 p-4 text-xs font-bold text-rose-700 border border-rose-200 text-left">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* RESULT CARD */}
          {result && (
            <div className="space-y-4 rounded-2xl border-2 border-emerald-500 bg-emerald-50/80 p-5 text-left animate-in fade-in duration-300">
              <div className="flex items-center justify-between border-b border-emerald-200/80 pb-3">
                <span className="text-[11px] font-bold text-emerald-900 uppercase tracking-wider">
                  {result.method === "nfc" ? "NFC Tag Tap Record" : "Camera QR Record"}
                </span>
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-0.5 text-[10px] font-black text-white uppercase">
                  {result.action === "checked_in" ? "CHECK-IN" : "CHECK-OUT"}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-[10px] font-bold text-emerald-700/80 uppercase">Desk / Seat</p>
                  <p className="text-lg font-black text-[#0A2E5C] flex items-center gap-1">
                    <Armchair className="h-4 w-4 text-emerald-600" />
                    <span>#{result.seatNumber || "General"}</span>
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-emerald-700/80 uppercase">Timestamp</p>
                  <p className="text-sm font-black text-[#0A2E5C] flex items-center gap-1">
                    <Clock className="h-4 w-4 text-emerald-600" />
                    <span>{result.time}</span>
                  </p>
                </div>
              </div>

              {currentUser && (
                <div className="pt-2 border-t border-emerald-200/60 text-[11px] text-emerald-900 flex items-center justify-between">
                  <span>Student: <strong>{currentUser.name}</strong></span>
                  <span className="text-[10px] text-emerald-700 font-semibold">
                    {result.method === "nfc" ? "NFC 53:D4:B6:CD:53:00:01" : "Silent Photo Saved"}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Action Buttons: 2 Strict Verification Methods */}
          <div className="space-y-3 pt-2">
            {result ? (
              <div className="flex flex-col gap-2">
                <Link
                  href="/student"
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#0A2E5C] py-3 text-xs font-black text-[#FFC107] shadow-md hover:bg-[#141A24] transition"
                >
                  <span>Go to Student Portal</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setResult(null);
                    setErrorMsg(null);
                  }}
                  className="w-full py-2.5 rounded-xl border border-zinc-200 bg-white text-xs font-bold text-zinc-600 hover:bg-zinc-50"
                >
                  Record Another Check-In / Check-Out
                </button>
              </div>
            ) : !currentUser && !loading ? (
              // NOT LOGGED IN STATE (e.g. Scanned via Google Lens / Camera from outside)
              <div className="space-y-3">
                <div className="p-4 rounded-2xl bg-[#0A2E5C]/5 border border-[#0A2E5C]/10 text-left space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-black text-[#0A2E5C]">
                    <Sparkles className="h-3.5 w-3.5 text-[#FFC107]" />
                    <span>Library Gate QR Scanned</span>
                  </div>
                  <p className="text-[11px] text-zinc-600">
                    If you are a student, sign in to confirm your attendance. If you are a visitor, explore our library website.
                  </p>
                </div>

                <Link
                  href="/login?redirect=/attendance?action=gate"
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#0A2E5C] py-3.5 text-xs font-black text-[#FFC107] shadow-md hover:bg-[#141A24] transition active:scale-95"
                >
                  <LogIn className="h-4 w-4" />
                  <span>Student Sign In to Mark Attendance</span>
                </Link>

                <Link
                  href="/"
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white py-2.5 text-xs font-bold text-zinc-700 hover:bg-zinc-50 transition"
                >
                  <Home className="h-4 w-4 text-zinc-500" />
                  <span>Visit Library Homepage</span>
                </Link>
              </div>
            ) : (
              // LOGGED IN STATE: 2 STRICT WAYS
              <div className="space-y-3">
                <div className="text-left px-1">
                  <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Logged In Member</p>
                  <p className="text-sm font-black text-[#0A2E5C]">{currentUser?.name}</p>
                </div>

                {/* WAY 1: NFC TAP (NO PICTURE) */}
                <button
                  type="button"
                  onClick={startNfcTap}
                  disabled={isProcessing}
                  className="w-full flex items-center justify-between p-3.5 rounded-2xl border-2 border-emerald-500/50 bg-emerald-50 hover:bg-emerald-100/80 transition text-left cursor-pointer active:scale-95"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-xs">
                      <Smartphone className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs font-black text-emerald-950">
                        {nfcListening ? "Tap Tag Against Phone Now..." : "1. Tap Physical NFC Tag"}
                      </p>
                      <p className="text-[10px] text-emerald-700 font-semibold">
                        Tag: 53:D4:B6:CD:53:00:01 • No Picture Needed
                      </p>
                    </div>
                  </div>
                  <span className="rounded-full bg-emerald-600 px-2.5 py-1 text-[10px] font-black text-white">
                    TAP
                  </span>
                </button>

                {/* WAY 2: CAMERA QR SCAN (WITH SILENT PICTURE PROOF) */}
                <button
                  type="button"
                  onClick={() => setIsCameraModalOpen(true)}
                  disabled={isProcessing}
                  className="w-full flex items-center justify-between p-3.5 rounded-2xl border-2 border-[#0A2E5C]/30 bg-blue-50/60 hover:bg-blue-100/80 transition text-left cursor-pointer active:scale-95"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0A2E5C] text-[#FFC107] shadow-xs">
                      <Camera className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs font-black text-[#0A2E5C]">
                        2. Scan Gate QR with Camera
                      </p>
                      <p className="text-[10px] text-blue-700 font-semibold">
                        Silent Picture Capture Verification Proof
                      </p>
                    </div>
                  </div>
                  <span className="rounded-full bg-[#0A2E5C] px-2.5 py-1 text-[10px] font-black text-[#FFC107]">
                    SCAN
                  </span>
                </button>
              </div>
            )}
          </div>

          {/* Security Badge */}
          <div className="pt-2 border-t border-zinc-100 flex items-center justify-center gap-1.5 text-[10px] font-bold text-zinc-400">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            <span>Dual Method Gate: NFC Serial (53:D4:B6:CD:53:00:01) or Camera QR Snapshot</span>
          </div>

        </div>
      </main>

      {/* Camera QR Modal with Silent Snapshot */}
      {currentUser && (
        <LiveAttendanceCameraModal
          isOpen={isCameraModalOpen}
          onClose={() => setIsCameraModalOpen(false)}
          studentId={currentUser.id}
          studentName={currentUser.name}
          shiftName={currentUser.shift || "General Shift"}
          defaultSeat={currentUser.seatNumber || undefined}
          onSuccess={(rec) => {
            setIsCameraModalOpen(false);
            setResult({
              success: true,
              action: rec.action || (rec.checkOut ? "checked_out" : "checked_in"),
              seatNumber: rec.seatNumber,
              time: rec.checkIn || rec.checkOut || new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }),
              message: "✓ Camera QR Verified with Silent Photo Proof.",
              method: "qr",
            });
          }}
        />
      )}

      {/* Footer */}
      <footer className="border-t border-[#E5E7EB]/60 bg-white/60 px-6 py-4 text-center text-xs text-zinc-500">
        <p className="font-semibold text-[#0A2E5C]">{BRAND_CONFIG.fullName}, {BRAND_CONFIG.location}</p>
        <p className="text-[11px] text-zinc-400">Station Road, Near Town Hall, Madhupur, Deoghar, Jharkhand 815353</p>
      </footer>

    </div>
  );
}
