"use client";

/**
 * [WEB • COMPONENT] Stamp Check-In
 *
 * Fullscreen physical-stamp check-in flow using stampPattern matching.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { X, AlertCircle } from "lucide-react";
import { 
  getRegisteredStampPattern, 
  matchStampPattern, 
  extractStampGeometry,
  type StampPattern 
} from "@/lib/stampPattern";
import { smartQrScanAttendance } from "@/lib/api";
import { playNotificationChime, triggerNativeNotification } from "@/lib/pushNotify";

interface FullscreenStampAttendanceProps {
  isOpen: boolean;
  onClose: () => void;
  studentId: string;
  studentName?: string;
  shiftName?: string;
  defaultSeat?: string;
  onSuccess?: () => void;
}

export function FullscreenStampAttendance({
  isOpen,
  onClose,
  studentId,
  studentName = "Student Member",
  shiftName = "Regular Shift",
  defaultSeat = "",
  onSuccess,
}: FullscreenStampAttendanceProps) {
  const [stampPattern, setStampPattern] = useState<StampPattern | null>(null);
  const [touchState, setTouchState] = useState<"idle" | "success" | "mismatch">("idle");
  const [feedbackText, setFeedbackText] = useState<string>("");
  const [attendanceAction, setAttendanceAction] = useState<"checked_in" | "checked_out" | null>(null);
  const [seatAssigned, setSeatAssigned] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const isLockedRef = useRef(false);

  // Load configured stamp pattern from Supabase
  useEffect(() => {
    if (!isOpen) {
      setTouchState("idle");
      setFeedbackText("");
      setAttendanceAction(null);
      isLockedRef.current = false;
      return;
    }

    getRegisteredStampPattern().then((pat) => {
      setStampPattern(pat);
    });

    const handleUpdate = (e: any) => {
      setStampPattern(e.detail);
    };
    window.addEventListener("stamp_pattern_updated", handleUpdate);
    return () => window.removeEventListener("stamp_pattern_updated", handleUpdate);
  }, [isOpen]);

  // Handle Escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  // Execute Supabase attendance mark
  const executeAttendance = useCallback(async () => {
    if (isSubmitting || !studentId) return;
    setIsSubmitting(true);

    try {
      const result = await smartQrScanAttendance({
        seatNumber: defaultSeat || undefined,
        studentId,
        studentName,
        shiftName,
        verificationMethod: "stamp",
      });

      if (result.success) {
        setAttendanceAction(result.action === "checked_out" ? "checked_out" : "checked_in");
        setSeatAssigned(result.seatNumber || defaultSeat || "Desk Assigned");

        // Trigger native OS notification
        const isOut = result.action === "checked_out";
        triggerNativeNotification({
          title: isOut ? "🚪 Checked Out (Stamp Verified)" : "✅ Attendance Marked (Stamp Verified)",
          body: isOut
            ? `Goodbye ${studentName}! Your check-out at ${result.seatNumber || defaultSeat || "Desk"} is recorded.`
            : `Welcome ${studentName}! Attendance successfully verified with physical stamp at ${result.seatNumber || defaultSeat || "Desk"}.`,
          tag: `stamp-attendance-${Date.now()}`,
        }).catch(() => {});

        // Broadcast global update
        window.dispatchEvent(new CustomEvent("attendance_updated"));

        // Close after brief display
        setTimeout(() => {
          if (onSuccess) onSuccess();
          onClose();
        }, 1800);
      } else {
        setTouchState("mismatch");
        setFeedbackText(result.message || "Attendance could not be recorded. Try again.");
        setTimeout(() => {
          setTouchState("idle");
          setFeedbackText("");
          isLockedRef.current = false;
          setIsSubmitting(false);
        }, 1800);
      }
    } catch (err: any) {
      setTouchState("mismatch");
      setFeedbackText(err?.message || "Failed to mark attendance. Try again.");
      setTimeout(() => {
        setTouchState("idle");
        setFeedbackText("");
        isLockedRef.current = false;
        setIsSubmitting(false);
      }, 1800);
    }
  }, [defaultSeat, onClose, onSuccess, shiftName, studentId, studentName, isSubmitting]);

  // Stamp verification trigger
  const handleStampSuccess = useCallback(() => {
    if (isLockedRef.current) return;
    isLockedRef.current = true;
    setTouchState("success");

    // 1. Play audio chime
    playNotificationChime().catch(() => {});

    // 2. Haptic vibration (double pulse)
    if (typeof window !== "undefined" && window.navigator && window.navigator.vibrate) {
      try {
        window.navigator.vibrate([100, 60, 160]);
      } catch {}
    }

    // 3. Mark in Supabase
    executeAttendance();
  }, [executeAttendance]);

  // Process 3-point capacitive touch
  const handleTouch = useCallback(
    (e: React.TouchEvent) => {
      if (isLockedRef.current || touchState === "success") return;

      const touches = Array.from(e.touches).map((t) => ({
        clientX: t.clientX,
        clientY: t.clientY,
      }));

      // A physical capacitive touch stamp has 3 conductive nodes
      if (touches.length >= 3) {
        // Prevent default screen zoom / pull-to-refresh
        if (e.cancelable) e.preventDefault();

        const matchResult = matchStampPattern(touches.slice(0, 3), stampPattern);

        if (matchResult.isMatch) {
          handleStampSuccess();
        } else {
          // Stamp pattern mismatch
          if (typeof window !== "undefined" && window.navigator && window.navigator.vibrate) {
            try {
              window.navigator.vibrate([60, 60, 60]);
            } catch {}
          }
          setTouchState("mismatch");
          setFeedbackText(matchResult.reason || "Stamp pattern mismatch. Use the official Genius Library stamp.");
          setTimeout(() => {
            setTouchState("idle");
            setFeedbackText("");
          }, 1500);
        }
      }
    },
    [handleStampSuccess, stampPattern, touchState]
  );

  // Desktop simulator fallback (for development / testing without touchscreen)
  const handleSimulatePress = () => {
    if (isLockedRef.current || touchState === "success") return;
    handleStampSuccess();
  };

  if (!isOpen) return null;

  return (
    <div
      ref={containerRef}
      onTouchStart={handleTouch}
      onTouchMove={handleTouch}
      className="fixed inset-0 z-[999999] bg-black text-white select-none touch-none cursor-crosshair flex flex-col items-center justify-center overflow-hidden animate-fadeIn"
      style={{ backgroundColor: "#000000" }}
    >
      {/* Discreet Exit Button in Top Bar */}
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-10">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-white text-xs font-semibold border border-zinc-800 transition active:scale-95 cursor-pointer"
        >
          <X className="h-4 w-4" />
          <span>Exit</span>
        </button>
      </div>

      {/* STATE 1: IDLE / BLANK BLACK SCREEN — MENTION ONLY: "Press Library Stamp Here" */}
      {touchState === "idle" && (
        <div className="flex flex-col items-center justify-center text-center px-6 pointer-events-none select-none">
          {/* Subtle Stamp Target Guide Ring */}
          <div className="relative mb-8 flex items-center justify-center">
            {/* Ambient Pulse Ring */}
            <div className="absolute h-40 w-40 sm:h-48 sm:w-48 rounded-full border border-dashed border-zinc-800/80 animate-ping opacity-30" />
            <div className="relative flex h-32 w-32 sm:h-40 sm:w-40 items-center justify-center rounded-full border-2 border-dashed border-zinc-700/60 bg-zinc-950/40">
              {/* 3 Conductive Pin Targets */}
              <div className="absolute top-4 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-zinc-700/40 border border-zinc-600/30" />
              <div className="absolute bottom-6 left-6 w-3 h-3 rounded-full bg-zinc-700/40 border border-zinc-600/30" />
              <div className="absolute bottom-6 right-6 w-3 h-3 rounded-full bg-zinc-700/40 border border-zinc-600/30" />
              
              <div className="h-10 w-10 rounded-full border border-zinc-800 flex items-center justify-center">
                <div className="h-2.5 w-2.5 rounded-full bg-emerald-500/50 animate-pulse" />
              </div>
            </div>
          </div>

          {/* User Requested Exact Minimal Text */}
          <h1 className="text-xl sm:text-3xl font-black text-zinc-200 tracking-wider uppercase">
            Press Library Stamp Here
          </h1>

          <p className="text-xs sm:text-sm text-zinc-500 mt-2.5 font-medium tracking-wide">
            Touch the physical 3-point conductive stamp firmly onto this screen
          </p>

          {stampPattern && (
            <p className="text-[10px] text-zinc-600 mt-4 font-mono">
              Pattern Locked: {stampPattern.name || "Master Library Stamp"}
            </p>
          )}
        </div>
      )}

      {/* STATE 2: SUCCESS — VIBRANT GREEN RITE CHECK (✓) ANIMATION */}
      {touchState === "success" && (
        <div className="flex flex-col items-center justify-center text-center px-6 pointer-events-none select-none animate-scaleIn">
          {/* Glowing Green Halo & Rite Check (✓) */}
          <div className="relative mb-6 flex items-center justify-center">
            {/* Emerald ambient blur */}
            <div className="absolute h-48 w-48 rounded-full bg-emerald-500/30 blur-3xl animate-pulse" />
            
            {/* Outer expanding ring */}
            <div className="absolute h-36 w-36 rounded-full border-4 border-emerald-500/40 animate-ping opacity-40" />

            {/* Vibrant Green Circle with Rite Check (✓) */}
            <div className="relative flex h-32 w-32 sm:h-36 sm:w-36 items-center justify-center rounded-full bg-gradient-to-tr from-emerald-600 via-emerald-500 to-teal-400 text-white shadow-[0_0_50px_rgba(16,185,129,0.7)] ring-8 ring-emerald-500/20">
              <svg 
                className="w-20 h-20 sm:w-22 sm:h-22 stroke-white fill-none stroke-[3.5] stroke-linecap-round stroke-linejoin-round"
                viewBox="0 0 24 24"
              >
                <path 
                  d="M5 13l4 4L19 7" 
                  style={{
                    strokeDasharray: 50,
                    strokeDashoffset: 0,
                    animation: "drawCheck 0.4s ease-out forwards",
                  }}
                />
              </svg>
            </div>
          </div>

          {/* Green Status Announcement */}
          <h2 className="text-2xl sm:text-4xl font-black text-emerald-400 tracking-tight">
            ✓ Stamp Verified
          </h2>

          <p className="text-sm sm:text-base font-bold text-zinc-200 mt-2">
            {attendanceAction === "checked_out"
              ? "Check-Out Successfully Recorded"
              : "Attendance Marked Successfully"}
          </p>

          {/* Student Info Pill */}
          <div className="mt-5 inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-950/80 border border-emerald-500/30 text-xs font-semibold text-emerald-300 shadow-inner">
            <span>{studentName}</span>
            <span>•</span>
            <span>{seatAssigned ? `Desk #${seatAssigned}` : shiftName}</span>
            <span>•</span>
            <span className="font-mono">
              {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        </div>
      )}

      {/* STATE 3: MISMATCH / ERROR */}
      {touchState === "mismatch" && (
        <div className="flex flex-col items-center justify-center text-center px-6 pointer-events-none select-none animate-fadeIn">
          <div className="h-24 w-24 rounded-full bg-rose-500/10 border-2 border-rose-500/40 text-rose-500 flex items-center justify-center mb-5 animate-bounce">
            <AlertCircle className="h-12 w-12" />
          </div>

          <h3 className="text-xl sm:text-2xl font-black text-rose-400">
            Stamp Pattern Mismatch
          </h3>

          <p className="text-xs sm:text-sm text-zinc-400 mt-2 max-w-xs font-medium">
            {feedbackText || "The pressed pattern does not match the authorized Genius Library stamp. Please try again."}
          </p>
        </div>
      )}

      {/* Desktop / Fallback Simulator Button */}
      {touchState === "idle" && (
        <div className="absolute bottom-6 left-0 right-0 flex justify-center px-4">
          <button
            onClick={handleSimulatePress}
            className="px-4 py-2 rounded-xl bg-zinc-900/60 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs font-medium border border-zinc-800/80 transition active:scale-95 cursor-pointer"
          >
            💻 Testing on PC? Click here to simulate Stamp
          </button>
        </div>
      )}
    </div>
  );
}
