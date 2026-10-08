"use client";

/**
 * [WEB • PAGE] Public Attendance Gate
 *
 * Standalone QR check-in/check-out page with GPS geofence verification
 * against BRAND_CONFIG.gps.
 */
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { 
  CheckCircle2, 
  Clock, 
  MapPin, 
  Smartphone, 
  Radio, 
  ArrowRight, 
  AlertCircle, 
  RefreshCw, 
  Armchair, 
  ShieldCheck, 
  LogIn 
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { smartQrScanAttendance } from "@/lib/api";
import { BRAND_CONFIG } from "@/lib/config";
import { BrandLogo } from "@/components/BrandLogo";

export default function AttendanceGatePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    action?: "checked_in" | "checked_out";
    seatNumber?: string;
    time?: string;
    message: string;
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [nfcListening, setNfcListening] = useState(false);
  const hasTriggeredRef = useRef(false);

  // 1. Immediately sanitize URL in browser bar so no query parameters or tokens linger
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        window.history.replaceState({}, document.title, window.location.pathname);
      } catch {}
    }
  }, []);

  // 2. Check Auth state and record attendance if logged in
  useEffect(() => {
    async function initGate() {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
          setLoading(false);
          return;
        }

        // Fetch student profile info
        const { data: profile } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .single();

        const studentName = profile?.name || user.user_metadata?.full_name || user.email?.split("@")[0] || "Student";
        const studentInfo = {
          id: user.id,
          name: studentName,
          email: user.email,
        };
        setCurrentUser(studentInfo);

        // Auto check-in removed. Hardware serial scanning required.
      } catch (err: any) {
        console.error("Attendance gate init error:", err);
        setErrorMsg("Failed to connect to library server. Please try again.");
      } finally {
        setLoading(false);
      }
    }

    initGate();
  }, []);

  const processAttendance = async (studentId: string, studentName: string) => {
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
        shiftName: "General Shift",
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
        message: res.message,
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

  // Web NFC Stand Tap
  const startNfcTap = async () => {
    if (typeof window === "undefined" || !("NDEFReader" in window)) {
      setErrorMsg("Web NFC is only available on compatible devices (such as Chrome on Android).");
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
          "53:98:3A:CD:53:00:01" 
        ];

        const isMatch = ALLOWED_SERIALS.some(
          (allowed) => normalize(allowed) === normalize(rawSerial)
        );

        if (!isMatch) {
          setErrorMsg(`Unrecognized NFC Tag! Serial: ${rawSerial}`);
          setNfcListening(false);
          return;
        }

        if (currentUser) {
          await processAttendance(currentUser.id, currentUser.name);
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
            <p className="text-[10px] font-bold text-[#FFC107] tracking-wider uppercase">Self Attendance Gate</p>
          </div>
        </Link>
        <div className="flex items-center gap-2">
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
              {loading ? "Verifying Student Session..." :
               isProcessing ? "Recording Attendance..." :
               result ? (result.action === "checked_in" ? "Check-In Confirmed!" : "Check-Out Confirmed!") :
               `Welcome to ${BRAND_CONFIG.name}`}
            </h2>
            <p className="mt-1 text-xs text-zinc-500 max-w-xs mx-auto leading-relaxed">
              {loading ? "Checking your library credentials..." :
               isProcessing ? "Allocating desk and updating library logs..." :
               result ? result.message :
               "Scan the library entrance QR code or tap your phone against the physical NFC stand."}
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
                  Session Details
                </span>
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-0.5 text-[10px] font-black text-white uppercase">
                  {result.action === "checked_in" ? "CHECK-IN" : "CHECK-OUT"}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-[10px] font-bold text-emerald-700/80 uppercase">Desk Number</p>
                  <p className="text-lg font-black text-[#0A2E5C] flex items-center gap-1">
                    <Armchair className="h-4 w-4 text-emerald-600" />
                    <span>#{result.seatNumber || "A-01"}</span>
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
                <div className="pt-2 border-t border-emerald-200/60 text-[11px] text-emerald-900">
                  Student: <strong>{currentUser.name}</strong>
                </div>
              )}
            </div>
          )}

          {/* Action Buttons */}
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
                    hasTriggeredRef.current = false;
                    if (currentUser) {
                      processAttendance(currentUser.id, currentUser.name);
                    }
                  }}
                  className="w-full py-2.5 rounded-xl border border-zinc-200 bg-white text-xs font-bold text-zinc-600 hover:bg-zinc-50"
                >
                  Scan or Tap Again
                </button>
              </div>
            ) : !currentUser && !loading ? (
              <div className="space-y-3">
                <p className="text-xs text-zinc-600 font-semibold">
                  Please log in with your registered student account to confirm attendance:
                </p>
                <Link
                  href="/login?redirect=/attendance"
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#0A2E5C] py-3 text-xs font-black text-[#FFC107] shadow-md hover:bg-[#141A24] transition"
                >
                  <LogIn className="h-4 w-4" />
                  <span>Student Sign In to Mark Attendance</span>
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={startNfcTap}
                  disabled={isProcessing}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-xs font-black text-white shadow-md hover:bg-emerald-700 transition disabled:opacity-50"
                >
                  <Smartphone className="h-4 w-4" />
                  <span>{nfcListening ? "Listening for NFC Tap..." : "Tap Physical NFC Stand"}</span>
                </button>
                {/* Manual one-click attendance removed */}
              </div>
            )}
          </div>

          {/* Security Badge */}
          <div className="pt-2 border-t border-zinc-100 flex items-center justify-center gap-1.5 text-[10px] font-bold text-zinc-400">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            <span>Encrypted Dual-Cloud Check-In • Real-Time Seat Sync</span>
          </div>

        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#E5E7EB]/60 bg-white/60 px-6 py-4 text-center text-xs text-zinc-500">
        <p className="font-semibold text-[#0A2E5C]">{BRAND_CONFIG.fullName}, {BRAND_CONFIG.location}</p>
        <p className="text-[11px] text-zinc-400">Station Road, Near Town Hall, Madhupur, Deoghar, Jharkhand 815353</p>
      </footer>

    </div>
  );
}
