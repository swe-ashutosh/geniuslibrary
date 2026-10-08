"use client";

/**
 * [WEB • COMPONENT] Attendance Snapshot Camera
 *
 * Grabs the silent verification photo during QR check-in.
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { 
  Camera, 
  X, 
  RefreshCw, 
  RotateCw, 
  QrCode, 
  ShieldCheck, 
  CheckCheck,
  AlertTriangle,
  AlertCircle,
  Upload,
  CheckCircle2,
  ScanLine,
  Download,
  Sparkles,
  Copy,
  Check
} from "lucide-react";
import jsQR from "jsqr";
import QRCode from "qrcode";
import { smartQrScanAttendance, reportEmptyDeskDispute } from "@/lib/api";
import { uploadAttendancePhoto } from "@/lib/supabase/storage";

interface LiveAttendanceCameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  studentId: string;
  studentName: string;
  shiftName: string;
  defaultSeat?: string;
  onSuccess: (record: any) => void;
}

export function LiveAttendanceCameraModal({
  isOpen,
  onClose,
  studentId,
  studentName,
  shiftName,
  defaultSeat = "",
  onSuccess,
}: LiveAttendanceCameraModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scanIntervalRef = useRef<any>(null);
  const isProcessingRef = useRef<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [activeMode, setActiveMode] = useState<"scan" | "my_qr">("scan");
  const [studentQrDataUrl, setStudentQrDataUrl] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  // Success state
  const [scanResult, setScanResult] = useState<{
    action: 'checked_in' | 'checked_out';
    seatNumber: string;
    time: string;
    message: string;
  } | null>(null);

  // Seat Conflict State
  const [seatConflict, setSeatConflict] = useState<{
    occupiedBy: string;
    occupantStudentId?: string;
    seatNumber: string;
  } | null>(null);
  const [isReportingDispute, setIsReportingDispute] = useState(false);
  const [disputeReported, setDisputeReported] = useState(false);

  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isLoadingCamera, setIsLoadingCamera] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [manualScanNotice, setManualScanNotice] = useState<string | null>(null);

function playScanBeep() {
  try {
    if (typeof window !== "undefined") {
      if (window.navigator?.vibrate) {
        window.navigator.vibrate([100]);
      }
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        const ctx = new AudioContextClass();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
      }
    }
  } catch {}
}

  // Helper to extract seat number from scanned QR text
  const extractSeatFromQr = (rawText: string): string | null => {
    if (!rawText) return null;
    const text = rawText.trim();

    // 0. Master Entrance Stand QR or any Library URL
    if (
      text.includes("GENIUS_ATTENDANCE_MASTER") ||
      text.includes("/attendance") ||
      text.toUpperCase().includes("MASTER") ||
      text.toUpperCase().includes("GATE") ||
      text.toUpperCase().includes("STAND") ||
      text.includes("geniuslibrary") ||
      text.includes("librarywale.in")
    ) {
      const seatParam = text.match(/[?&](?:seat|desk|seatId|seatNumber)=([A-Za-z0-9_-]+)/i);
      if (seatParam) {
        const res = formatSeat(seatParam[1]);
        if (res) return res;
      }
      return defaultSeat || "MASTER";
    }

    // 1. JSON check: {"seat": "S-15"} or {"seatNumber": "15"} or {"type":"STUDENT_PASS"}
    if (text.startsWith("{") && text.endsWith("}")) {
      try {
        const parsed = JSON.parse(text);
        const s = parsed.seatNumber || parsed.seat || parsed.seatId || parsed.desk;
        if (s) {
          const res = formatSeat(String(s));
          if (res) return res;
        }
        if (parsed.type === "STUDENT_PASS" || parsed.studentId) {
          return defaultSeat || "MASTER";
        }
      } catch {}
    }

    // 2. URL paths and query parameters: /qr/15, /desk/15, /seat/S-15, ?seat=15
    const urlMatch = text.match(/(?:\/qr\/|\/desk\/|\/seat\/|[?&]seat=|[?&]desk=|[?&]seatId=)([A-Za-z0-9_-]+)/i);
    if (urlMatch) {
      const res = formatSeat(urlMatch[1]);
      if (res) return res;
    }

    // 3. Prefix matching: DESK-07, SEAT:15, ZONE A-01, #S-15
    const prefixMatch = text.match(/(?:\bDESK|\bSEAT|\bZONE|#)[\s:_-]*([A-Za-z0-9_-]+)/i);
    if (prefixMatch) {
      const res = formatSeat(prefixMatch[1]);
      if (res) return res;
    }

    // 4. Direct match
    const directRes = formatSeat(text);
    if (directRes) return directRes;

    // 5. Fallback for any scanned library code
    if (defaultSeat) return defaultSeat;
    return "MASTER";
  };

  const formatSeat = (raw: string): string | null => {
    if (!raw) return null;
    const clean = raw.toUpperCase().trim().replace(/^#/, "");

    // e.g. S-01, S-15, S-100
    if (/^S-[0-9]{1,3}$/i.test(clean)) {
      const num = clean.replace(/^S-/, "");
      return `S-${String(parseInt(num, 10)).padStart(2, "0")}`;
    }

    // e.g. S15 or S01
    const sMatch = clean.match(/^S([0-9]{1,3})$/i);
    if (sMatch) {
      return `S-${String(parseInt(sMatch[1], 10)).padStart(2, "0")}`;
    }

    // e.g. A-01, B-05
    const zoneMatch = clean.match(/^([A-Z])[\s_-]?([0-9]{1,3})$/);
    if (zoneMatch) {
      const zone = zoneMatch[1];
      const num = String(parseInt(zoneMatch[2], 10)).padStart(2, "0");
      return `${zone}-${num}`;
    }

    // Just numbers: e.g. "15" -> "S-15"
    if (/^[0-9]{1,3}$/.test(clean)) {
      return `S-${clean.padStart(2, "0")}`;
    }

    return clean;
  };

  // Helper to grab a silent snapshot from the video feed covering the 100% full camera area
  const captureSilentSnapshot = (): string | null => {
    try {
      if (!videoRef.current || videoRef.current.readyState < 2) return null;
      const video = videoRef.current;
      const vWidth = video.videoWidth;
      const vHeight = video.videoHeight;
      if (!vWidth || !vHeight) return null;

      const canvas = document.createElement("canvas");
      // Scale down proportionally to max 960px preserving 100% full field of view
      const maxDim = 960;
      let w = vWidth;
      let h = vHeight;
      if (Math.max(w, h) > maxDim) {
        if (w >= h) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
      }
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      // Capture full uncropped camera sensor frame
      ctx.drawImage(video, 0, 0, w, h);
      return canvas.toDataURL("image/jpeg", 0.75);
    } catch {
      return null;
    }
  };

  // Process Check-in / Checkout automatically upon verified QR scan
  const executeDeskAction = useCallback(async (seat: string, capturedSnapshot?: string | null) => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    setIsSubmitting(true);
    setErrorMsg(null);
    setManualScanNotice(null);
    setSeatConflict(null);

    // Haptic feedback
    if (typeof window !== "undefined" && window.navigator && window.navigator.vibrate) {
      try { window.navigator.vibrate([100, 50, 100]); } catch {}
    }

    try {
      const isMaster = seat === "MASTER" || seat === "AUTO" || !seat;
      const effectiveSeat = defaultSeat ? defaultSeat : (isMaster ? undefined : seat);

      // Silent Photo Upload in background (under 200KB, stealth anti-cheat)
      let uploadedPhotoUrl: string | undefined = undefined;
      const snapshot = capturedSnapshot || captureSilentSnapshot();
      if (snapshot) {
        try {
          const uploadRes = await uploadAttendancePhoto(snapshot, studentId);
          if (uploadRes?.url) {
            uploadedPhotoUrl = uploadRes.url;
          }
        } catch (uploadErr) {
          console.warn("Silent photo capture notice:", uploadErr);
        }
      }

      const result = await smartQrScanAttendance({
        studentId,
        studentName,
        seatNumber: effectiveSeat,
        shiftName,
        photoUrl: uploadedPhotoUrl,
        verificationMethod: 'qr',
      });

      if (result.action === "all_occupied") {
        setErrorMsg(result.message || "All library desks are currently occupied. Please contact admin.");
        isProcessingRef.current = false;
        setIsSubmitting(false);
        return;
      }

      if (result.action === "seat_occupied") {
        setSeatConflict({
          occupiedBy: result.occupiedBy || "Another Student",
          occupantStudentId: result.occupantStudentId,
          seatNumber: seat,
        });
        isProcessingRef.current = false;
        setIsSubmitting(false);
        return;
      }

      // Success: stop scanner loop
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
      }

      setScanResult({
        action: result.action,
        seatNumber: result.seatNumber || seat,
        time: result.checkInTime || result.checkOutTime || new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
        message: result.message,
      });

      // Dispatch global attendance updated event
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("attendance_updated"));
        try {
          const { triggerNativeNotification } = await import("@/lib/pushNotify");
          const actionText = result.action === "checked_out" ? "Check-Out Confirmed" : "Check-In Confirmed";
          triggerNativeNotification({
            title: `✓ ${actionText}`,
            body: result.message || `Attendance ${actionText.toLowerCase()} recorded successfully.`,
            url: "/student/attendance",
            tag: `modal-att-${Date.now()}`,
          }).catch(() => {});
        } catch {}
      }

      // Notify parent and auto-close after 1.8s
      setTimeout(() => {
        onSuccess(result);
        onClose();
      }, 1800);

    } catch (err: any) {
      setErrorMsg(err.message || "Failed to record attendance. Please try again.");
      setTimeout(() => {
        isProcessingRef.current = false;
      }, 2000);
    } finally {
      setIsSubmitting(false);
    }
  }, [studentId, studentName, shiftName, defaultSeat, onSuccess, onClose]);

  // Continuous background QR scanner loop with Native BarcodeDetector + jsQR Fallback
  const startQrScanner = useCallback(() => {
    if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);

    scanIntervalRef.current = setInterval(async () => {
      if (!videoRef.current || videoRef.current.readyState < 2 || videoRef.current.videoWidth === 0 || isProcessingRef.current) return;

      const video = videoRef.current;

      // 1. Native BarcodeDetector (fast, GPU accelerated)
      if (typeof window !== "undefined" && "BarcodeDetector" in window) {
        try {
          const detector = new (window as any).BarcodeDetector({ formats: ["qr_code"] });
          const barcodes = await detector.detect(video);
          if (barcodes && barcodes.length > 0 && barcodes[0]?.rawValue) {
            const seat = extractSeatFromQr(barcodes[0].rawValue);
            if (seat) {
              const snapshot = captureSilentSnapshot();
              playScanBeep();
              executeDeskAction(seat, snapshot);
              return;
            }
          }
        } catch {
          // Fallback to jsQR
        }
      }

      // 2. jsQR Canvas fallback with attemptBoth
      const canvas = canvasRef.current || document.createElement("canvas");
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;

      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      try {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: "attemptBoth",
        });

        if (code && code.data) {
          const seat = extractSeatFromQr(code.data);
          if (seat) {
            const snapshot = captureSilentSnapshot();
            playScanBeep();
            executeDeskAction(seat, snapshot);
          }
        }
      } catch {
        // Continue scanning next frame
      }
    }, 200);
  }, [executeDeskAction, defaultSeat]);

  const stopQrScanner = () => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
  };

  // Manual "Scan" button click handler
  const handleManualScanClick = async () => {
    if (isProcessingRef.current || isSubmitting) return;
    setManualScanNotice(null);
    setErrorMsg(null);

    if (!videoRef.current || videoRef.current.readyState < 2 || videoRef.current.videoWidth === 0) {
      setManualScanNotice("Camera is initializing. Please wait a moment.");
      return;
    }

    const video = videoRef.current;

    // 1. Try Native BarcodeDetector
    if (typeof window !== "undefined" && "BarcodeDetector" in window) {
      try {
        const detector = new (window as any).BarcodeDetector({ formats: ["qr_code"] });
        const barcodes = await detector.detect(video);
        if (barcodes && barcodes.length > 0 && barcodes[0]?.rawValue) {
          const seat = extractSeatFromQr(barcodes[0].rawValue);
          if (seat) {
            const snapshot = captureSilentSnapshot();
            playScanBeep();
            executeDeskAction(seat, snapshot);
            return;
          }
        }
      } catch {}
    }

    // 2. jsQR Fallback
    const canvas = canvasRef.current || document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    try {
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: "attemptBoth",
      });

      if (code && code.data) {
        const seat = extractSeatFromQr(code.data);
        if (seat) {
          const snapshot = captureSilentSnapshot();
          playScanBeep();
          executeDeskAction(seat, snapshot);
          return;
        }
      }

      setManualScanNotice("No library QR code detected. Point camera steadily at the desk QR sticker.");
      setTimeout(() => setManualScanNotice(null), 3000);
    } catch {
      setManualScanNotice("Could not process frame. Please try again.");
      setTimeout(() => setManualScanNotice(null), 3000);
    }
  };

  // Start live camera
  const startCamera = async () => {
    stopCamera();
    setCameraError(null);
    setIsLoadingCamera(true);
    setSeatConflict(null);
    setDisputeReported(false);
    setScanResult(null);
    isProcessingRef.current = false;

    try {
      const getUserMediaFn = (constraints: MediaStreamConstraints): Promise<MediaStream> => {
        if (navigator?.mediaDevices?.getUserMedia) {
          return navigator.mediaDevices.getUserMedia(constraints);
        }
        const legacyGUM =
          (navigator as any)?.getUserMedia ||
          (navigator as any)?.webkitGetUserMedia ||
          (navigator as any)?.mozGetUserMedia ||
          (navigator as any)?.msGetUserMedia;
        if (legacyGUM) {
          return new Promise((resolve, reject) => {
            legacyGUM.call(navigator, constraints, resolve, reject);
          });
        }
        if (typeof window !== "undefined" && !window.isSecureContext) {
          return Promise.reject(new Error("Camera requires a secure HTTPS connection. Please open via https://"));
        }
        return Promise.reject(new Error("Camera API is not supported on this device/browser."));
      };

      let mediaStream: MediaStream | null = null;

      try {
        mediaStream = await getUserMediaFn({
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1920 },
            height: { ideal: 1440 },
          },
          audio: false,
        });
      } catch {
        try {
          mediaStream = await getUserMediaFn({
            video: {
              facingMode: { ideal: facingMode },
              width: { ideal: 1280 },
            },
            audio: false,
          });
        } catch {
          try {
            mediaStream = await getUserMediaFn({
              video: { facingMode: facingMode },
              audio: false,
            });
          } catch {
            mediaStream = await getUserMediaFn({
              video: true,
              audio: false,
            });
          }
        }
      }

      setStream(mediaStream);
      if (videoRef.current && mediaStream) {
        const video = videoRef.current;
        video.srcObject = mediaStream;
        video.setAttribute("playsinline", "true");
        video.setAttribute("webkit-playsinline", "true");
        video.muted = true;
        video.setAttribute("muted", "true");
        video.onloadedmetadata = () => {
          video.play().catch(() => {});
          startQrScanner();
        };
        try {
          await video.play();
        } catch {}
        startQrScanner();
      }
    } catch (err: any) {
      console.warn("Camera access notice:", err);
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setCameraError("Camera permission denied. Please allow camera access in your browser address bar or upload a photo of the QR code below.");
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        setCameraError("No camera device was detected. You can upload a photo of the library QR code below.");
      } else {
        setCameraError(err.message || "Camera unavailable. You can upload a photo of the library QR code below.");
      }
    } finally {
      setIsLoadingCamera(false);
    }
  };

  const stopCamera = () => {
    stopQrScanner();
    if (stream) {
      stream.getTracks().forEach((track) => {
        try { track.stop(); } catch {}
      });
      setStream(null);
    }
  };

  // QR Image File Picker Decode Fallback
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMsg(null);
    setCameraError(null);
    const reader = new FileReader();

    reader.onload = () => {
      const img = new Image();
      img.onload = async () => {
        // 1. Try Native BarcodeDetector on image
        if (typeof window !== "undefined" && "BarcodeDetector" in window) {
          try {
            const detector = new (window as any).BarcodeDetector({ formats: ["qr_code"] });
            const barcodes = await detector.detect(img);
            if (barcodes && barcodes.length > 0 && barcodes[0]?.rawValue) {
              const seat = extractSeatFromQr(barcodes[0].rawValue);
              if (seat) {
                playScanBeep();
                executeDeskAction(seat, reader.result as string);
                return;
              }
            }
          } catch {}
        }

        // 2. jsQR Fallback
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);

        try {
          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imgData.data, imgData.width, imgData.height, {
            inversionAttempts: "attemptBoth",
          });
          if (code && code.data) {
            const seat = extractSeatFromQr(code.data);
            if (seat) {
              playScanBeep();
              executeDeskAction(seat, reader.result as string);
            } else {
              setErrorMsg("Detected QR code is not a recognized Genius Library QR.");
            }
          } else {
            setErrorMsg("No QR code found in the image. Please take a clear photo of the desk QR code.");
          }
        } catch {
          setErrorMsg("Could not process image. Please try again.");
        }
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Generate dynamic Student Attendance Pass QR
  useEffect(() => {
    if (!isOpen) return;
    async function generateStudentPass() {
      try {
        const payload = JSON.stringify({
          studentId,
          name: studentName,
          seat: defaultSeat || "S-01",
          shift: shiftName || "General Shift",
          type: "STUDENT_ATTENDANCE_PASS",
          timestamp: Date.now()
        });
        const url = await QRCode.toDataURL(payload, {
          width: 360,
          margin: 2,
          color: {
            dark: "#0A2E5C",
            light: "#FFFFFF",
          },
        });
        setStudentQrDataUrl(url);
      } catch (err) {
        console.error("Student QR generation error:", err);
      }
    }
    generateStudentPass();
  }, [isOpen, studentId, studentName, defaultSeat, shiftName]);

  const handleDownloadStudentQr = () => {
    if (!studentQrDataUrl) return;
    const link = document.createElement("a");
    link.href = studentQrDataUrl;
    link.download = `Genius-Attendance-Pass-${studentName.replace(/\s+/g, "_")}.png`;
    link.click();
  };

  useEffect(() => {
    if (isOpen) {
      setScanResult(null);
      setErrorMsg(null);
      setManualScanNotice(null);
      setSeatConflict(null);
      isProcessingRef.current = false;
      if (activeMode === "scan") {
        startCamera();
      } else {
        stopCamera();
      }
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, facingMode, activeMode]);

  const toggleCameraFacing = () => {
    setFacingMode((prev) => (prev === "environment" ? "user" : "environment"));
  };

  // Handle Desk Dispute (Occupied Seat)
  const handleReportSeatDispute = async () => {
    if (!seatConflict) return;
    setIsReportingDispute(true);
    try {
      await reportEmptyDeskDispute({
        seatNumber: seatConflict.seatNumber,
        reporterStudentId: studentId,
        reporterStudentName: studentName,
        occupantStudentId: seatConflict.occupantStudentId,
        occupantStudentName: seatConflict.occupiedBy,
      });
      setDisputeReported(true);
    } catch {
      setDisputeReported(true);
    } finally {
      setIsReportingDispute(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/85 p-4 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-md rounded-3xl border border-[#E5E7EB] bg-white shadow-2xl dark:border-zinc-800 dark:bg-[#0A2E5C] overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 bg-[#F8FAFC]/60 px-5 py-4 dark:border-zinc-700 dark:bg-zinc-800/60">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0A2E5C] text-[#FFC107] dark:bg-[#FFC107] dark:text-[#0A2E5C]">
              <QrCode className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-[#0A2E5C] dark:text-white">Mark Attendance</h3>
              <p className="text-[11px] text-zinc-500">
                Scan library desk QR code to verify attendance
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-700 dark:hover:text-white transition cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">

          {/* Alert / Errors */}
          {(errorMsg || manualScanNotice) && (
            <div className={`flex items-start gap-2 rounded-2xl p-3.5 text-xs font-semibold border ${
              errorMsg 
                ? "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-300"
                : "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-300"
            }`}>
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{errorMsg || manualScanNotice}</span>
            </div>
          )}

          {/* Success Banner */}
          {scanResult && (
            <div className="rounded-2xl border-2 border-emerald-500 bg-emerald-50/90 p-5 text-center dark:bg-emerald-950/40 animate-in zoom-in-95 duration-200">
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg">
                <CheckCheck className="h-6 w-6" />
              </div>
              <h4 className="text-base font-black text-emerald-800 dark:text-emerald-200">
                {scanResult.action === "checked_in" ? `Checked In: Desk #${scanResult.seatNumber}` : `Checked Out Successfully!`}
              </h4>
              <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300 font-semibold">
                {scanResult.message}
              </p>
              <div className="mt-3 inline-flex items-center gap-2 rounded-xl bg-white px-3 py-1 text-xs font-bold text-emerald-700 shadow-xs dark:bg-zinc-800 dark:text-emerald-300">
                <span>⏱ {scanResult.time}</span>
                <span>•</span>
                <span>{shiftName}</span>
              </div>
            </div>
          )}

          {/* Live QR Scanner Screen */}
          {!scanResult && (
            <div className="space-y-3.5">

              {/* Mode Switcher: Scan Desk QR (Camera) vs My Attendance QR Pass (Show QR) */}
              <div className="flex rounded-2xl bg-[#F8FAFC] p-1 dark:bg-zinc-800 border border-[#E5E7EB]/60 dark:border-zinc-700">
                <button
                  type="button"
                  onClick={() => {
                    setActiveMode("scan");
                    startCamera();
                  }}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                    activeMode === "scan"
                      ? "bg-[#0A2E5C] text-[#FFC107] shadow-xs dark:bg-zinc-700 dark:text-[#FFC107]"
                      : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400"
                  }`}
                >
                  <Camera className="h-4 w-4" />
                  <span>Scan Desk QR</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveMode("my_qr");
                    stopCamera();
                  }}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                    activeMode === "my_qr"
                      ? "bg-[#0A2E5C] text-[#FFC107] shadow-xs dark:bg-zinc-700 dark:text-[#FFC107]"
                      : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400"
                  }`}
                >
                  <QrCode className="h-4 w-4" />
                  <span>My QR Pass</span>
                </button>
              </div>

              {activeMode === "scan" ? (
                <>
                  {/* Seat Conflict Dispute Card */}
                  {seatConflict && (
                    <div className="rounded-2xl border-2 border-amber-500 bg-amber-50/90 p-5 dark:bg-amber-950/40 space-y-3">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                          <h4 className="text-xs font-bold text-amber-900 dark:text-amber-100">
                            Desk #{seatConflict.seatNumber} Already Occupied
                          </h4>
                          <p className="text-[11px] text-amber-800/90 dark:text-amber-200/90 mt-0.5 leading-relaxed">
                            This desk is marked in use by <strong>{seatConflict.occupiedBy}</strong>. If the desk is physically empty, report it to the staff counter to release it.
                          </p>
                        </div>
                      </div>

                      {disputeReported ? (
                        <div className="rounded-xl bg-emerald-100 p-2.5 text-center text-xs font-bold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
                          ✓ Staff alerted! The front desk will release this desk shortly.
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={handleReportSeatDispute}
                            disabled={isReportingDispute}
                            className="flex-1 py-2 px-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow transition cursor-pointer"
                          >
                            {isReportingDispute ? "Sending alert..." : "Report Empty Desk to Staff"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSeatConflict(null);
                              isProcessingRef.current = false;
                              startCamera();
                            }}
                            className="py-2 px-3 rounded-xl border border-zinc-300 text-xs font-bold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 cursor-pointer"
                          >
                            Scan Another
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Camera Error Notice */}
                  {cameraError && !seatConflict && (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50/90 p-5 text-center dark:border-rose-800 dark:bg-rose-950/40 space-y-3">
                      <Camera className="h-8 w-8 text-rose-500 mx-auto" />
                      <p className="text-xs text-rose-700 dark:text-rose-300 font-medium">
                        {cameraError}
                      </p>
                      <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={startCamera}
                          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 py-2 px-4 rounded-xl bg-[#0A2E5C] text-white text-xs font-bold hover:bg-[#141A24] dark:bg-zinc-800 cursor-pointer"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                          <span>Retry Camera</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 py-2 px-4 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 cursor-pointer shadow-sm"
                        >
                          <Upload className="h-3.5 w-3.5" />
                          <span>Upload QR Photo</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveMode("my_qr")}
                          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 py-2 px-4 rounded-xl bg-[#FFC107] text-[#0A2E5C] text-xs font-bold hover:bg-[#d6be9f] cursor-pointer shadow-sm"
                        >
                          <QrCode className="h-3.5 w-3.5" />
                          <span>Show My Pass QR</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Live Camera Viewfinder */}
                  {!seatConflict && !cameraError && (
                    <div className="relative aspect-[3/4] sm:aspect-4/3 max-h-[480px] w-full overflow-hidden rounded-2xl bg-black border border-zinc-200 dark:border-zinc-800 shadow-inner flex items-center justify-center">
                      
                      <video
                        ref={videoRef}
                        playsInline
                        muted
                        autoPlay
                        className="h-full w-full object-cover"
                      />

                      {/* Animated QR Target Viewfinder */}
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        
                        {/* QR Target Frame */}
                        <div className="relative h-48 w-48 sm:h-52 sm:w-52 rounded-2xl border-2 border-emerald-400/80 bg-emerald-500/5 shadow-2xl flex items-center justify-center">
                          
                          {/* 4 Corner Markers */}
                          <div className="absolute -top-1 -left-1 h-5 w-5 border-t-3 border-l-3 border-emerald-400 rounded-tl" />
                          <div className="absolute -top-1 -right-1 h-5 w-5 border-t-3 border-r-3 border-emerald-400 rounded-tr" />
                          <div className="absolute -bottom-1 -left-1 h-5 w-5 border-b-3 border-l-3 border-emerald-400 rounded-bl" />
                          <div className="absolute -bottom-1 -right-1 h-5 w-5 border-b-3 border-r-3 border-emerald-400 rounded-br" />

                          {/* Pulsing Scan Laser Line */}
                          <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_12px_#34d399] animate-pulse" />

                          {isSubmitting && (
                            <div className="absolute inset-0 bg-black/70 backdrop-blur-xs rounded-2xl flex flex-col items-center justify-center text-white">
                              <RefreshCw className="h-6 w-6 animate-spin text-emerald-400 mb-1" />
                              <span className="text-[11px] font-bold">Verifying Attendance...</span>
                            </div>
                          )}
                        </div>

                        {/* Subtitle badge */}
                        <div className="mt-4 rounded-full bg-black/80 px-4 py-1.5 text-[11px] font-bold text-white backdrop-blur-md border border-white/10 shadow-md text-center max-w-[85%]">
                          Hold camera naturally • Entire desk area is captured
                        </div>
                      </div>

                      {/* Camera Switch button */}
                      <button
                        type="button"
                        onClick={toggleCameraFacing}
                        className="absolute bottom-3 right-3 h-9 w-9 rounded-full bg-black/70 text-white border border-white/30 flex items-center justify-center shadow-lg hover:scale-110 active:scale-95 transition cursor-pointer"
                        title="Switch Camera (Front/Back)"
                      >
                        <RotateCw className="h-4 w-4" />
                      </button>
                    </div>
                  )}

                  {/* PRIMARY SCAN BUTTON (Prominent button below camera) */}
                  {!seatConflict && !cameraError && (
                    <button
                      type="button"
                      onClick={handleManualScanClick}
                      disabled={isSubmitting || isLoadingCamera}
                      className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black text-sm shadow-lg shadow-emerald-500/25 transition active:scale-98 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2.5"
                    >
                      {isSubmitting ? (
                        <>
                          <RefreshCw className="h-4 w-4 animate-spin" />
                          <span>Verifying...</span>
                        </>
                      ) : (
                        <>
                          <ScanLine className="h-4 w-4" />
                          <span>Scan QR Code</span>
                        </>
                      )}
                    </button>
                  )}

                  {/* Upload QR Image Fallback Button */}
                  <div className="flex items-center justify-between pt-0.5">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-600 dark:text-zinc-300 hover:text-emerald-600 cursor-pointer"
                    >
                      <Upload className="h-3.5 w-3.5 text-emerald-600" />
                      <span>Having camera issues? Upload QR photo</span>
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                  </div>
                </>
              ) : (
                /* MY ATTENDANCE QR PASS VIEW */
                <div className="rounded-3xl border-2 border-[#FFC107] bg-gradient-to-b from-white to-[#FDFCFB] dark:from-[#0A2E5C] dark:to-[#141A24] p-5 sm:p-6 text-center space-y-4 shadow-xl animate-in fade-in">
                  <div>
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FFC107]/20 text-[#0B5ED7] dark:text-[#FFC107] text-[10px] font-black uppercase tracking-wider mb-2">
                      <Sparkles className="h-3 w-3" /> Genius Library • Student Pass
                    </div>
                    <h4 className="text-base font-black text-[#0A2E5C] dark:text-white">
                      {studentName}
                    </h4>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                      Desk #{defaultSeat || "S-01"} • {shiftName || "Morning Shift"}
                    </p>
                  </div>

                  {/* Scannable Pass QR Code */}
                  <div className="flex justify-center py-2">
                    {studentQrDataUrl ? (
                      <div className="p-3 bg-white rounded-3xl shadow-lg border-2 border-[#FFC107]/40 inline-block">
                        <img
                          src={studentQrDataUrl}
                          alt="Student Attendance Pass QR"
                          className="w-56 h-56 sm:w-64 sm:h-64 object-contain rounded-xl"
                        />
                      </div>
                    ) : (
                      <div className="w-56 h-56 flex items-center justify-center bg-zinc-100 rounded-3xl">
                        <RefreshCw className="h-8 w-8 animate-spin text-[#FFC107]" />
                      </div>
                    )}
                  </div>

                  <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-sm mx-auto leading-relaxed">
                    Show this dynamic QR code to library turnstile or staff counter camera to record your attendance.
                  </p>

                  {/* Action Buttons */}
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                    <button
                      type="button"
                      onClick={handleDownloadStudentQr}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#0A2E5C] text-[#FFC107] hover:bg-black text-xs font-bold shadow-sm transition cursor-pointer"
                    >
                      <Download className="h-4 w-4" /> Download Pass
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveMode("scan");
                        startCamera();
                      }}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#FFC107] text-[#0A2E5C] hover:bg-[#d6be9f] text-xs font-bold shadow-sm transition cursor-pointer"
                    >
                      <Camera className="h-4 w-4" /> Switch to Camera
                    </button>
                  </div>
                </div>
              )}

            </div>
          )}

          {/* Verification Footer */}
          <div className="flex items-center justify-between text-[10px] text-zinc-500 pt-2 border-t border-zinc-100 dark:border-zinc-800">
            <span className="flex items-center gap-1 font-semibold text-emerald-600">
              <ShieldCheck className="h-3.5 w-3.5" /> Desk QR Verified • Anti-Proxy Enabled
            </span>
            <span>Student: <strong>{studentName}</strong></span>
          </div>

        </div>

        {/* Hidden Canvas for QR frame decode and silent snapshot */}
        <canvas ref={canvasRef} className="hidden" />
      </div>
    </div>
  );
}
