"use client";

/**
 * [WEB • COMPONENT] Student QR Scanner
 *
 * Camera scanner modal used for attendance and ID verification.
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { 
  Camera, 
  X, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  RotateCw, 
  QrCode, 
  IndianRupee,
  Award,
  Trophy,
  Calendar,
  Clock,
  Phone,
  ArrowLeft,
  Search,
  Receipt,
  User,
  CheckCheck,
  Filter,
  ChevronRight,
  AlertTriangle,
  Send,
  Sparkles,
  Users,
  LogIn,
  LogOut,
  Download,
  Printer,
  Copy,
  Check
} from "lucide-react";
import jsQR from "jsqr";
import QRCode from "qrcode";
import { 
  getStudents, 
  getFees, 
  payFee, 
  clearStudentUpiClaims,
  getAttendance,
  recordCheckIn,
  recordCheckOut,
  StudentRecord,
  FeeRecord,
  AttendanceRecord,
  generateInvoiceNumber
} from "@/lib/api";
import { getResultsForStudent, StudentExamResultItem } from "@/lib/examResults";
import { createClient } from "@/lib/supabase/client";
import { isMasterAdminEmail } from "@/lib/config";

interface AdminStudentQrScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStudentUpdated?: () => void;
}

export function AdminStudentQrScannerModal({
  isOpen,
  onClose,
  onStudentUpdated,
}: AdminStudentQrScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scanIntervalRef = useRef<any>(null);
  const isProcessingRef = useRef<boolean>(false);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraTimeoutRef = useRef<any>(null);

  const [activeTab, setActiveTab] = useState<"scanner" | "lookup" | "generate_qr">("scanner");
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isLoadingCamera, setIsLoadingCamera] = useState(false);

  // QR Standee / Generator States
  const [qrTargetType, setQrTargetType] = useState<"master" | "desk" | "student">("master");
  const [selectedDeskNumber, setSelectedDeskNumber] = useState<string>("01");
  const [selectedStudentForQr, setSelectedStudentForQr] = useState<string>("");
  const [generatedQrDataUrl, setGeneratedQrDataUrl] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  // Student directory & filtering
  const [allStudents, setAllStudents] = useState<StudentRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [shiftFilter, setShiftFilter] = useState<"all" | "due" | "morning" | "afternoon" | "evening" | "fullday">("all");

  // Scanned Student Details & State
  const [selectedStudent, setSelectedStudent] = useState<StudentRecord | null>(null);
  const [studentFees, setStudentFees] = useState<FeeRecord[]>([]);
  const [studentExamResults, setStudentExamResults] = useState<StudentExamResultItem[]>([]);
  const [studentAttendance, setStudentAttendance] = useState<AttendanceRecord[]>([]);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [attendanceDesk, setAttendanceDesk] = useState<string>("01");

  // Action status states
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [notificationMsg, setNotificationMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const showNotification = (type: "success" | "error", text: string) => {
    setNotificationMsg({ type, text });
    setTimeout(() => setNotificationMsg(null), 4000);
  };

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

  // 1. Camera Lifecycle Management
  const stopCamera = useCallback(() => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (cameraTimeoutRef.current) {
      clearTimeout(cameraTimeoutRef.current);
      cameraTimeoutRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try { track.stop(); } catch {}
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsLoadingCamera(false);
  }, []);

  const startCamera = useCallback(async () => {
    stopCamera();
    setCameraError(null);
    setIsLoadingCamera(true);

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
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
      } catch (err1) {
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

      streamRef.current = mediaStream;

      if (videoRef.current && mediaStream) {
        const video = videoRef.current;
        video.srcObject = mediaStream;
        video.setAttribute("playsinline", "true");
        video.setAttribute("webkit-playsinline", "true");
        video.muted = true;
        video.setAttribute("muted", "true");
        video.onloadedmetadata = () => {
          video.play().catch(() => {});
        };
        try {
          await video.play();
        } catch (playErr) {
          console.warn("Video play notice:", playErr);
        }
      }
      setIsLoadingCamera(false);
    } catch (err: any) {
      console.warn("Camera start error:", err);
      setIsLoadingCamera(false);
      setCameraError(
        err.name === "NotAllowedError" || err.name === "PermissionDeniedError"
          ? "Camera permission denied. Please allow camera access in browser address bar, or use the manual search tab."
          : `Unable to access camera: ${err.message || "Camera device busy."}`
      );
    }
  }, [facingMode, stopCamera]);

  // RESET BY DEFAULT EACH TIME MODAL OPENS
  useEffect(() => {
    if (isOpen) {
      setSelectedStudent(null);
      setActiveTab("scanner");
      setSearchQuery("");
      setShiftFilter("all");
      setStudentFees([]);
      setStudentExamResults([]);
      setStudentAttendance([]);
      isProcessingRef.current = false;
      setCameraError(null);
    } else {
      stopCamera();
    }
  }, [isOpen, stopCamera]);

  // Start / stop camera based on tab & selectedStudent
  useEffect(() => {
    if (isOpen && activeTab === "scanner" && !selectedStudent) {
      startCamera();
    } else {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [isOpen, activeTab, facingMode, selectedStudent, startCamera, stopCamera]);

  // Generate QR Data URL whenever activeTab is "generate_qr" or target changes
  useEffect(() => {
    if (!isOpen || activeTab !== "generate_qr") return;
    async function generateCode() {
      let payload = "";
      const baseOrigin = typeof window !== "undefined" && window.location.origin 
        ? window.location.origin 
        : "https://genius.librarywale.in";

      if (qrTargetType === "master") {
        payload = `${baseOrigin}/attendance/?source=master_turnstile`;
      } else if (qrTargetType === "desk") {
        payload = `${baseOrigin}/attendance/?seat=${selectedDeskNumber}`;
      } else if (qrTargetType === "student") {
        const student = allStudents.find((s) => s.id === selectedStudentForQr) || allStudents[0];
        if (student) {
          payload = JSON.stringify({
            studentId: student.id,
            studentCode: student.studentCode || `STUD-${student.id.slice(0, 6)}`,
            name: student.fullName,
            seat: student.seatNumber || "01",
            phone: student.phone || "",
            type: "STUDENT_PASS"
          });
        } else {
          payload = "GENIUS_STUDENT_PASS";
        }
      }

      try {
        const url = await QRCode.toDataURL(payload, {
          width: 360,
          margin: 2,
          color: {
            dark: "#0A2E5C",
            light: "#FFFFFF",
          },
        });
        setGeneratedQrDataUrl(url);
      } catch (err) {
        console.error("QR generation error:", err);
      }
    }
    generateCode();
  }, [isOpen, activeTab, qrTargetType, selectedDeskNumber, selectedStudentForQr, allStudents]);

  const handleDownloadQr = () => {
    if (!generatedQrDataUrl) return;
    const link = document.createElement("a");
    link.href = generatedQrDataUrl;
    link.download = qrTargetType === "master"
      ? "Genius-Master-Gate-QR.png"
      : qrTargetType === "desk"
      ? `Genius-Desk-${selectedDeskNumber}-QR.png`
      : `Genius-Student-Pass-QR.png`;
    link.click();
    showNotification("success", "QR Code image downloaded successfully!");
  };

  const handlePrintQr = () => {
    if (!generatedQrDataUrl) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    const title = qrTargetType === "master"
      ? "Entrance Gate Turnstile Standee"
      : qrTargetType === "desk"
      ? `Desk #${selectedDeskNumber} Attendance Sticker`
      : "Student Attendance Pass";

    printWindow.document.write(`
      <html>
        <head>
          <title>${title} - Genius Library</title>
          <style>
            body { font-family: sans-serif; text-align: center; padding: 40px; margin: 0; background: #fff; color: #0A2E5C; }
            .card { border: 4px solid #FFC107; border-radius: 24px; padding: 30px; display: inline-block; max-width: 400px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
            h1 { font-size: 20px; margin: 0 0 6px 0; font-weight: 900; }
            h2 { font-size: 14px; margin: 0 0 16px 0; color: #0B5ED7; }
            img { width: 280px; height: 280px; border-radius: 12px; }
            p { font-size: 12px; color: #666; margin: 12px 0 0 0; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>Genius Library</h1>
            <h2>${title}</h2>
            <img src="${generatedQrDataUrl}" alt="Student QR Pass" />
            <p>Scan with phone camera to mark instant attendance</p>
          </div>
          <script>
            window.onload = function() { window.print(); window.close(); }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleCopyQrPayload = () => {
    let payload = "";
    const baseOrigin = typeof window !== "undefined" && window.location.origin 
      ? window.location.origin 
      : "https://genius.librarywale.in";

    if (qrTargetType === "master") {
      payload = `${baseOrigin}/attendance/?source=master_turnstile`;
    } else if (qrTargetType === "desk") {
      payload = `${baseOrigin}/attendance/?seat=${selectedDeskNumber}`;
    } else {
      payload = "Student Pass QR";
    }
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(payload);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
      showNotification("success", "Link / Payload copied to clipboard!");
    }
  };

  // Close handler that guarantees complete reset
  const handleModalClose = () => {
    stopCamera();
    setSelectedStudent(null);
    setActiveTab("scanner");
    setSearchQuery("");
    onClose();
  };

  // 2. Fetch all registered students for quick lookup (Zero mock data)
  useEffect(() => {
    if (!isOpen) return;
    async function loadDirectory() {
      try {
        const [list, feesList] = await Promise.all([
          getStudents(),
          getFees().catch(() => []),
        ]);
        const supabase = createClient();
        const { data: profiles } = await supabase.from("profiles").select("*");

        const studentMap = new Map<string, StudentRecord>();

        // Merge Supabase profiles
        if (profiles && profiles.length > 0) {
          profiles.forEach((p: any) => {
            if (p.role === "admin" || isMasterAdminEmail(p.email)) return;
            const code = p.student_code || p.studentCode || (p.id ? `SDL-2026-${String(p.id).slice(-4).toUpperCase()}` : "SDL-2026-001");
            
            const studentFees = (feesList || []).filter((f: any) => f.studentId === p.id || f.studentName?.toLowerCase() === p.full_name?.toLowerCase());
            const dueFees = studentFees.filter((f: any) => !f.paid);
            const totalDue = dueFees.reduce((sum: number, f: any) => sum + (f.amount || 0), 0);

            studentMap.set(p.id, {
              id: p.id,
              studentCode: code,
              fullName: p.full_name || "Library Member",
              email: p.email || "",
              phone: p.phone || "",
              course: p.course || "General Studies",
              shift: p.shift || "Standard (3 Hours Pass)",
              seatNumber: p.seat_number || p.seatNumber || null,
              status: p.status || "active",
              feeStatus: totalDue > 0 ? "Due" : "Paid",
              dueAmount: totalDue,
              avatarUrl: p.avatar_url,
            });
          });
        }

        // Merge enrolled students
        if (list && list.length > 0) {
          list.forEach((s) => {
            const studentFees = (feesList || []).filter((f: any) => f.studentId === s.id || f.studentName?.toLowerCase() === s.fullName?.toLowerCase());
            const dueFees = studentFees.filter((f: any) => !f.paid);
            const totalDue = dueFees.reduce((sum: number, f: any) => sum + (f.amount || 0), 0);

            studentMap.set(s.id, {
              ...s,
              feeStatus: totalDue > 0 ? "Due" : (s.feeStatus || "Paid"),
              dueAmount: totalDue > 0 ? totalDue : (s.dueAmount || 0),
            });
          });
        }

        setAllStudents(Array.from(studentMap.values()));
      } catch (err) {
        console.warn("loadDirectory notice:", err);
      }
    }
    loadDirectory();
  }, [isOpen]);

  // 3. QR Decoding Engine using Native BarcodeDetector + jsQR Fallback
  const scanQrFrame = useCallback(async () => {
    if (isProcessingRef.current || !videoRef.current) return;
    const video = videoRef.current;

    if (video.readyState < 2 || video.videoWidth === 0) return;

    // A. Native BarcodeDetector (instant, GPU accelerated)
    if (typeof window !== "undefined" && "BarcodeDetector" in window) {
      try {
        const detector = new (window as any).BarcodeDetector({ formats: ["qr_code"] });
        const barcodes = await detector.detect(video);
        if (barcodes && barcodes.length > 0 && barcodes[0]?.rawValue) {
          isProcessingRef.current = true;
          playScanBeep();
          handleQrFound(barcodes[0].rawValue);
          return;
        }
      } catch {
        // Fallback to jsQR
      }
    }

    // B. jsQR Canvas fallback with attemptBoth for inverted dark mode QRs
    const canvas = canvasRef.current || document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    try {
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: "attemptBoth",
      });

      if (code && code.data) {
        isProcessingRef.current = true;
        playScanBeep();
        handleQrFound(code.data);
      }
    } catch {
      // Ignore frame errors
    }
  }, []);

  useEffect(() => {
    if (isOpen && activeTab === "scanner" && !selectedStudent) {
      scanIntervalRef.current = setInterval(scanQrFrame, 200);
    } else if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }

    return () => {
      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    };
  }, [isOpen, activeTab, selectedStudent, scanQrFrame]);

  // 4. Handle Scanned QR String
  const handleQrFound = async (rawQr: string) => {
    try {
      let candidateId = "";
      let candidateCode = "";
      let candidatePhone = "";
      let candidateName = "";
      let parsedPayload: any = null;

      const trimmed = (rawQr || "").trim();

      if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
        try {
          parsedPayload = JSON.parse(trimmed);
          candidateId = parsedPayload.studentId || parsedPayload.id || "";
          candidateCode = parsedPayload.studentCode || parsedPayload.code || "";
          candidatePhone = parsedPayload.phone || "";
          candidateName = parsedPayload.name || parsedPayload.fullName || "";
        } catch {}
      }

      if (!candidateId && trimmed.includes("?")) {
        try {
          const urlParams = new URLSearchParams(trimmed.split("?")[1]);
          candidateId = urlParams.get("studentId") || urlParams.get("id") || "";
          candidateCode = urlParams.get("code") || urlParams.get("studentCode") || "";
          candidatePhone = urlParams.get("phone") || "";
        } catch {}
      }

      if (!candidateId && !candidateCode) {
        candidateCode = trimmed;
      }

      const cleanCode = (s: string) => (s || "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
      const targetCode = cleanCode(candidateCode);
      const targetPhone = (candidatePhone || candidateCode).replace(/[^0-9]/g, "");

      let matched = allStudents.find((s) => {
        if (candidateId && s.id === candidateId) return true;
        if (candidateCode && s.studentCode && cleanCode(s.studentCode) === targetCode) return true;
        if (candidateCode && s.id && cleanCode(s.id) === targetCode) return true;
        if (targetPhone.length >= 10 && s.phone && s.phone.replace(/[^0-9]/g, "").includes(targetPhone.slice(-10))) return true;
        if (candidateName && s.fullName && s.fullName.toLowerCase() === candidateName.toLowerCase()) return true;
        return false;
      });

      if (matched) {
        await loadStudentDetails(matched);
      } else {
        const supabase = createClient();
        let profile: any = null;

        const isUuid = (val: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

        if (isUuid(candidateId)) {
          const { data } = await supabase.from("profiles").select("*").eq("id", candidateId).maybeSingle();
          profile = data;
        }

        if (!profile && candidateCode) {
          const { data } = await supabase.from("profiles").select("*").ilike("student_code", candidateCode).maybeSingle();
          profile = data;
        }

        if (!profile && targetPhone.length >= 10) {
          const { data } = await supabase.from("profiles").select("*").ilike("phone", `%${targetPhone.slice(-10)}%`).maybeSingle();
          profile = data;
        }

        if (!profile && candidateName) {
          const { data } = await supabase.from("profiles").select("*").ilike("full_name", candidateName).maybeSingle();
          profile = data;
        }

        if (profile) {
          const studentObj: StudentRecord = {
            id: profile.id,
            studentCode: profile.student_code || (profile.phone ? `STUD202609${profile.phone.slice(-3)}` : "STUD-MBR"),
            fullName: profile.full_name || "Student Member",
            email: profile.email || "",
            phone: profile.phone || "",
            course: profile.course || "General Studies",
            shift: profile.shift || "Standard (3 Hours Pass)",
            seatNumber: profile.seat_number || "01",
            status: profile.status || "active",
            feeStatus: "Paid",
            dueAmount: 0,
            avatarUrl: profile.avatar_url,
          };
          await loadStudentDetails(studentObj);
        } else if (parsedPayload && (candidateName || candidateCode || candidateId)) {
          const studentObj: StudentRecord = {
            id: candidateId || `std-${Date.now()}`,
            studentCode: candidateCode || "SDL-2026-001",
            fullName: parsedPayload.name || parsedPayload.fullName || "Library Student",
            email: parsedPayload.email || "",
            phone: parsedPayload.phone || "",
            course: parsedPayload.course || "General Studies",
            shift: parsedPayload.shift || "Standard (3 Hours Pass)",
            seatNumber: parsedPayload.seat || "01",
            status: "active",
            feeStatus: "Paid",
            dueAmount: 0,
          };
          await loadStudentDetails(studentObj);
        } else {
          showNotification("error", `Scanned QR (${trimmed.slice(0, 24)}...) not found in member records.`);
          setTimeout(() => {
            isProcessingRef.current = false;
          }, 1500);
        }
      }
    } catch (err: any) {
      showNotification("error", `QR parsing error: ${err.message}`);
      setTimeout(() => {
        isProcessingRef.current = false;
      }, 1500);
    }
  };

  // 5. Load Comprehensive Details (Fees, Exam Results, Attendance)
  const loadStudentDetails = async (student: StudentRecord) => {
    setIsLoadingDetails(true);
    setSelectedStudent(student);
    stopCamera();

    try {
      const [feesData, attendanceData] = await Promise.all([
        getFees(student.id),
        getAttendance(student.id),
      ]);

      if ((!feesData || feesData.length === 0) && student.dueAmount && student.dueAmount > 0) {
        setStudentFees([
          {
            id: `fee-sample-${student.id}`,
            studentId: student.id,
            studentName: student.fullName,
            type: `${student.shift || "Monthly"} Seat Fee`,
            amount: student.dueAmount,
            paid: false,
            dueDate: new Date(Date.now() - 3 * 86400000).toISOString().split("T")[0],
            description: "Current month library study slot & amenities fee",
          }
        ]);
      } else {
        setStudentFees(feesData || []);
      }

      const examMarks = getResultsForStudent(student.id);
      setStudentExamResults(examMarks);

      setStudentAttendance(attendanceData || []);
      setAttendanceDesk(student.seatNumber || "01");
    } catch (err) {
      console.error("Failed to load full student details:", err);
    } finally {
      setIsLoadingDetails(false);
    }
  };

  // 6. Direct Action: Pay Fee
  const handleMarkFeePaid = async (feeId: string, amount: number) => {
    setActionLoading(`pay-${feeId}`);
    try {
      await payFee(feeId);
      
      setStudentFees((prev) =>
        prev.map((f) =>
          f.id === feeId
            ? {
                ...f,
                paid: true,
                paidAt: new Date().toISOString().split("T")[0],
                receiptNo: generateInvoiceNumber(studentFees.map((f) => f.receiptNo)),
              }
            : f
        )
      );

      if (selectedStudent) {
        setSelectedStudent({
          ...selectedStudent,
          feeStatus: "Paid",
          dueAmount: 0,
        });

        try {
          await clearStudentUpiClaims(selectedStudent.id);
          await clearStudentUpiClaims(selectedStudent.fullName);
        } catch (claimErr) {
          console.warn("Auto-clear claims notice:", claimErr);
        }
      }

      showNotification("success", `Payment of ₹${amount} received! Receipt generated.`);
      if (onStudentUpdated) onStudentUpdated();
    } catch (err: any) {
      showNotification("error", `Payment update failed: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };



  // 8. Direct Action: Attendance Check-In
  const handleCheckInAttendance = async () => {
    if (!selectedStudent) return;
    setActionLoading("attendance");
    try {
      const deskToUse = attendanceDesk || selectedStudent.seatNumber || "01";
      const res = await recordCheckIn({
        studentId: selectedStudent.id,
        studentName: selectedStudent.fullName,
        seatNumber: deskToUse,
        shiftName: selectedStudent.shift || "Standard (3 Hours Pass)",
      });

      const now = new Date();
      const todayDateStr = now.toISOString().split("T")[0];
      const timeStr = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });

      const newRecord: AttendanceRecord = (res as any)?.record || {
        id: `att-${Date.now()}`,
        studentId: selectedStudent.id,
        studentName: selectedStudent.fullName,
        seatNumber: deskToUse,
        shiftName: selectedStudent.shift || "Standard (3 Hours Pass)",
        checkIn: timeStr,
        checkOut: null,
        status: "present",
        date: todayDateStr,
      };

      setStudentAttendance((prev) => [newRecord, ...prev.filter((a) => a.date !== todayDateStr)]);
      showNotification("success", `Marked ${selectedStudent.fullName} Present at Desk #${deskToUse}!`);
      if (onStudentUpdated) onStudentUpdated();
    } catch (err: any) {
      showNotification("error", `Attendance check-in failed: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  // 9. Direct Action: Attendance Check-Out
  const handleCheckOutAttendance = async () => {
    if (!selectedStudent) return;
    setActionLoading("attendance");
    try {
      await recordCheckOut(selectedStudent.id);
      const now = new Date();
      const todayDateStr = now.toISOString().split("T")[0];
      const timeStr = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });

      setStudentAttendance((prev) =>
        prev.map((a) => (a.date === todayDateStr ? { ...a, checkOut: timeStr } : a))
      );
      showNotification("success", `Checked out ${selectedStudent.fullName} successfully! Desk released.`);
      if (onStudentUpdated) onStudentUpdated();
    } catch (err: any) {
      showNotification("error", `Attendance check-out failed: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  // Switch back to Scanner
  const handleBackToScanner = () => {
    setSelectedStudent(null);
    setStudentFees([]);
    setStudentExamResults([]);
    setStudentAttendance([]);
    isProcessingRef.current = false;
    setActiveTab("scanner");
    startCamera();
  };

  // Filtered Students for the redesigned manual tab
  const filteredStudents = allStudents.filter((student) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch = !q || 
      student.fullName?.toLowerCase().includes(q) ||
      student.phone?.includes(q) ||
      student.studentCode?.toLowerCase().includes(q) ||
      student.seatNumber?.toLowerCase().includes(q);

    if (!matchesSearch) return false;

    if (shiftFilter === "due") {
      return (student.dueAmount && student.dueAmount > 0) || student.feeStatus === "Due";
    }
    if (shiftFilter === "morning") {
      return student.shift?.toLowerCase().includes("morning");
    }
    if (shiftFilter === "afternoon") {
      return student.shift?.toLowerCase().includes("afternoon");
    }
    if (shiftFilter === "evening") {
      return student.shift?.toLowerCase().includes("evening");
    }
    if (shiftFilter === "fullday") {
      return student.shift?.toLowerCase().includes("full");
    }
    return true;
  });

  const pendingFees = studentFees.filter((f) => !f.paid);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-md p-3 sm:p-4 overflow-y-auto animate-fadeIn">
      {/* Hidden processing canvas for jsQR */}
      <canvas ref={canvasRef} className="hidden" />

      <div className="relative w-full max-w-2xl rounded-3xl border border-[#E5E7EB] bg-white shadow-2xl dark:border-zinc-800 dark:bg-[#0A2E5C] text-zinc-900 dark:text-white overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Header Bar - Updated Heading to "Students QR Scan" */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 dark:border-zinc-800 bg-[#FBFBFA] dark:bg-[#141A24]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-tr from-[#0B5ED7] to-[#FFC107] text-[#0A2E5C] shadow-md shadow-[#0B5ED7]/20 font-black">
              <QrCode className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-[#0A2E5C] dark:text-white tracking-tight">
                  Students QR Scan
                </h3>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#0B5ED7]/15 text-[#0B5ED7] dark:text-[#FFC107]">
                  Live Scanner
                </span>
              </div>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Scan digital student pass for fee status, book loans & attendance
              </p>
            </div>
          </div>

          <button
            onClick={handleModalClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-700 dark:hover:text-white transition cursor-pointer"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Floating Notification Toast */}
        {notificationMsg && (
          <div className={`mx-4 mt-3 p-3 rounded-2xl flex items-center gap-2.5 text-xs font-bold border transition-all ${
            notificationMsg.type === "success" 
              ? "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800" 
              : "bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800"
          }`}>
            {notificationMsg.type === "success" ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
            <span>{notificationMsg.text}</span>
          </div>
        )}

        {/* Mode Switcher Tabs (Only shown when not inspecting a student) */}
        {!selectedStudent && (
          <div className="px-5 pt-3 pb-2 border-b border-zinc-100 dark:border-zinc-800 flex flex-wrap items-center gap-2 bg-[#FDFCFB] dark:bg-[#18202D]">
            <button
              onClick={() => setActiveTab("scanner")}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === "scanner"
                  ? "bg-[#0A2E5C] text-[#FFC107] dark:bg-white/10 dark:text-white shadow-xs"
                  : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
            >
              <Camera className="h-4 w-4" />
              <span>Camera Scanner</span>
            </button>
            <button
              onClick={() => setActiveTab("generate_qr")}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === "generate_qr"
                  ? "bg-[#0A2E5C] text-[#FFC107] dark:bg-white/10 dark:text-white shadow-xs"
                  : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
            >
              <QrCode className="h-4 w-4" />
              <span>Generate / Show QR</span>
            </button>
            <button
              onClick={() => setActiveTab("lookup")}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === "lookup"
                  ? "bg-[#0A2E5C] text-[#FFC107] dark:bg-white/10 dark:text-white shadow-xs"
                  : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
            >
              <Users className="h-4 w-4" />
              <span>Manual Student Selection</span>
            </button>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
          
          {/* ========================================================================= */}
          {/* STATE A: NO STUDENT SELECTED YET -> TAB 1: CAMERA SCANNER */}
          {/* ========================================================================= */}
          {!selectedStudent && activeTab === "scanner" && (
            <div className="flex flex-col items-center justify-center space-y-4">
              
              {/* Camera Stream Viewport */}
              <div className="relative w-full max-w-md aspect-video sm:aspect-square sm:max-h-72 rounded-3xl overflow-hidden bg-black border-2 border-zinc-700/60 shadow-inner flex items-center justify-center">
                {isLoadingCamera && (
                  <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/85 backdrop-blur-xs gap-2.5 text-zinc-300 text-xs p-4 text-center">
                    <div className="h-9 w-9 animate-spin rounded-full border-2 border-[#FFC107] border-t-transparent" />
                    <span className="font-bold text-white">Opening camera stream...</span>
                    <span className="text-[10px] text-zinc-400">Point lens at student's Digital QR Pass</span>
                  </div>
                )}

                {cameraError ? (
                  <div className="p-6 text-center text-rose-400 space-y-3 z-10">
                    <AlertTriangle className="h-10 w-10 mx-auto text-rose-400" />
                    <p className="text-xs font-bold leading-relaxed">{cameraError}</p>
                    <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                      <button
                        onClick={() => startCamera()}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-zinc-800 text-xs font-bold text-white hover:bg-zinc-700 cursor-pointer border border-zinc-700"
                      >
                        <RefreshCw className="h-3.5 w-3.5" /> Retry Camera
                      </button>
                      <button
                        onClick={() => setActiveTab("generate_qr")}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#FFC107] text-xs font-bold text-[#0A2E5C] hover:bg-[#d6be9f] cursor-pointer"
                      >
                        <QrCode className="h-3.5 w-3.5" /> Show Library QR
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                    />

                    {/* Laser Scanner Line and Viewfinder Reticle */}
                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-6 z-10">
                      <div className="relative w-48 h-48 sm:w-56 sm:h-56 rounded-2xl border-2 border-[#FFC107]/90 shadow-[0_0_25px_rgba(191,164,134,0.35)] flex flex-col justify-between p-1">
                        <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-[#FFC107] to-transparent animate-pulse shadow-[0_0_12px_#FFC107]" />
                        <div className="text-center text-[10px] font-black tracking-wider text-[#FFC107] uppercase bg-black/75 backdrop-blur-xs py-1 px-2 rounded-lg border border-[#FFC107]/30">
                          Align Student Pass QR
                        </div>
                        <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-[#FFC107] to-transparent animate-pulse shadow-[0_0_12px_#FFC107]" />
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Clean Camera Controls (Flip Camera, Switch to QR, Manual Search) */}
              <div className="flex flex-wrap items-center justify-between w-full max-w-md px-2 gap-2">
                <button
                  onClick={() => setFacingMode((prev) => (prev === "environment" ? "user" : "environment"))}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 transition cursor-pointer"
                >
                  <RotateCw className="h-3.5 w-3.5" /> Flip
                </button>

                <button
                  onClick={() => setActiveTab("generate_qr")}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-[#FFC107]/20 hover:bg-[#FFC107]/30 text-[#0B5ED7] dark:text-[#FFC107] transition cursor-pointer"
                >
                  <QrCode className="h-3.5 w-3.5" /> Switch to Display QR
                </button>

                <button
                  onClick={() => setActiveTab("lookup")}
                  className="inline-flex items-center gap-1 text-xs font-bold text-zinc-500 dark:text-zinc-400 hover:text-[#0B5ED7] dark:hover:text-[#FFC107] hover:underline cursor-pointer"
                >
                  <Users className="h-3.5 w-3.5" /> Select Student Manually →
                </button>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* STATE A: NO STUDENT SELECTED YET -> TAB 2: GENERATE & DISPLAY LIBRARY QR  */}
          {/* ========================================================================= */}
          {!selectedStudent && activeTab === "generate_qr" && (
            <div className="space-y-4 animate-in fade-in">
              {/* Type Switcher: Gate Standee | Desk 01-100 | Student Card */}
              <div className="flex rounded-2xl bg-[#F8FAFC] p-1 dark:bg-zinc-800/80 border border-[#E5E7EB]/60 dark:border-zinc-700">
                <button
                  type="button"
                  onClick={() => setQrTargetType("master")}
                  className={`flex-1 py-2 text-xs font-bold rounded-xl transition cursor-pointer ${
                    qrTargetType === "master"
                      ? "bg-[#0A2E5C] text-[#FFC107] shadow-xs dark:bg-zinc-700 dark:text-[#FFC107]"
                      : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400"
                  }`}
                >
                  Gate Standee QR
                </button>
                <button
                  type="button"
                  onClick={() => setQrTargetType("desk")}
                  className={`flex-1 py-2 text-xs font-bold rounded-xl transition cursor-pointer ${
                    qrTargetType === "desk"
                      ? "bg-[#0A2E5C] text-[#FFC107] shadow-xs dark:bg-zinc-700 dark:text-[#FFC107]"
                      : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400"
                  }`}
                >
                  Desk QR (01-100)
                </button>
                <button
                  type="button"
                  onClick={() => setQrTargetType("student")}
                  className={`flex-1 py-2 text-xs font-bold rounded-xl transition cursor-pointer ${
                    qrTargetType === "student"
                      ? "bg-[#0A2E5C] text-[#FFC107] shadow-xs dark:bg-zinc-700 dark:text-[#FFC107]"
                      : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400"
                  }`}
                >
                  Student Card QR
                </button>
              </div>

              {/* Sub-selector for Desk Number or Student Dropdown */}
              {qrTargetType === "desk" && (
                <div className="flex items-center gap-2 p-3 rounded-2xl bg-[#FDFCFB] dark:bg-zinc-800/50 border border-[#E5E7EB]/70 dark:border-zinc-700">
                  <span className="text-xs font-bold text-zinc-600 dark:text-zinc-300">Choose Desk Number:</span>
                  <select
                    value={selectedDeskNumber}
                    onChange={(e) => setSelectedDeskNumber(e.target.value)}
                    className="flex-1 rounded-xl border border-[#E5E7EB] bg-white p-2 text-xs font-black text-[#0A2E5C] dark:bg-zinc-800 dark:text-white dark:border-zinc-700 focus:outline-none"
                  >
                    {Array.from({ length: 100 }, (_, i) => String(i + 1).padStart(2, "0")).map((dNum) => (
                      <option key={dNum} value={dNum}>
                        Desk #{dNum} (Study Slot)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {qrTargetType === "student" && (
                <div className="flex items-center gap-2 p-3 rounded-2xl bg-[#FDFCFB] dark:bg-zinc-800/50 border border-[#E5E7EB]/70 dark:border-zinc-700">
                  <span className="text-xs font-bold text-zinc-600 dark:text-zinc-300">Choose Student:</span>
                  <select
                    value={selectedStudentForQr}
                    onChange={(e) => setSelectedStudentForQr(e.target.value)}
                    className="flex-1 rounded-xl border border-[#E5E7EB] bg-white p-2 text-xs font-bold text-[#0A2E5C] dark:bg-zinc-800 dark:text-white dark:border-zinc-700 focus:outline-none"
                  >
                    <option value="">-- Choose Member from Directory --</option>
                    {allStudents.map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.fullName} ({st.studentCode}) • Desk {st.seatNumber || "Unassigned"}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* The Live Rendered QR Card */}
              <div className="rounded-3xl border-2 border-[#FFC107] bg-gradient-to-b from-white to-[#FDFCFB] dark:from-[#0A2E5C] dark:to-[#141A24] p-5 sm:p-6 text-center space-y-4 shadow-xl">
                <div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FFC107]/20 text-[#0B5ED7] dark:text-[#FFC107] text-[10px] font-black uppercase tracking-wider mb-2">
                    <Sparkles className="h-3 w-3" /> Genius Library • Madhupur
                  </div>
                  <h4 className="text-base font-black text-[#0A2E5C] dark:text-white">
                    {qrTargetType === "master"
                      ? "Main Turnstile Gate Standee QR"
                      : qrTargetType === "desk"
                      ? `Study Desk #${selectedDeskNumber} Sticker QR`
                      : "Student Attendance Pass QR"}
                  </h4>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    {qrTargetType === "master"
                      ? "Students scan this QR code with their phone camera to check-in/out at the entrance gate."
                      : qrTargetType === "desk"
                      ? `Stick this code on Desk #${selectedDeskNumber}. Students scan to confirm physical presence.`
                      : "Show this dynamic code to the front desk scanner or turnstile camera."}
                  </p>
                </div>

                {/* QR Image Display */}
                <div className="flex justify-center py-2">
                  {generatedQrDataUrl ? (
                    <div className="p-3 bg-white rounded-3xl shadow-lg border-2 border-[#FFC107]/40 inline-block">
                      <img
                        src={generatedQrDataUrl}
                        alt="Generated Genius QR Code"
                        className="w-56 h-56 sm:w-64 sm:h-64 object-contain rounded-xl"
                      />
                    </div>
                  ) : (
                    <div className="w-56 h-56 flex items-center justify-center bg-zinc-100 rounded-3xl">
                      <RefreshCw className="h-8 w-8 animate-spin text-[#FFC107]" />
                    </div>
                  )}
                </div>

                {/* Action Buttons: Download, Print, Copy, Switch to Camera */}
                <div className="flex flex-wrap items-center justify-center gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                  <button
                    type="button"
                    onClick={handleDownloadQr}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#0A2E5C] text-[#FFC107] hover:bg-black text-xs font-bold shadow-sm transition cursor-pointer"
                  >
                    <Download className="h-4 w-4" /> Download PNG
                  </button>
                  <button
                    type="button"
                    onClick={handlePrintQr}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 text-xs font-bold shadow-sm transition cursor-pointer"
                  >
                    <Printer className="h-4 w-4" /> Print Sticker
                  </button>
                  <button
                    type="button"
                    onClick={handleCopyQrPayload}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-bold transition cursor-pointer"
                  >
                    {isCopied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                    <span>{isCopied ? "Copied!" : "Copy Link"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("scanner")}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#FFC107] text-[#0A2E5C] hover:bg-[#d6be9f] text-xs font-bold shadow-sm transition cursor-pointer"
                  >
                    <Camera className="h-4 w-4" /> Back to Scanner
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* STATE A: NO STUDENT SELECTED YET -> TAB 2: REDESIGNED MANUAL SELECTION */}
          {/* ========================================================================= */}
          {!selectedStudent && activeTab === "lookup" && (
            <div className="space-y-4">
              
              {/* Top Search & Filter Bar */}
              <div className="space-y-2.5">
                <div className="relative flex items-center">
                  <Search className="absolute left-3.5 h-4 w-4 text-zinc-400" />
                  <input
                    type="text"
                    placeholder="Search by student name, student ID, phone or desk #..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-10 py-2.5 rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-[#F9FAFB] dark:bg-zinc-800/80 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#FFC107] text-zinc-900 dark:text-white"
                    autoFocus
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-3 text-zinc-400 hover:text-zinc-600 dark:hover:text-white text-xs font-bold"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {/* Filter Chips */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-[11px] font-bold">
                  {[
                    { id: "all", label: "All Members" },
                    { id: "due", label: "⚠️ Fees Due" },
                    { id: "morning", label: "🌅 Morning" },
                    { id: "afternoon", label: "☀️ Afternoon" },
                    { id: "evening", label: "🌙 Evening" },
                    { id: "fullday", label: "⭐ Full Day" },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setShiftFilter(tab.id as any)}
                      className={`px-3 py-1 rounded-xl shrink-0 transition-all cursor-pointer ${
                        shiftFilter === tab.id
                          ? "bg-[#0A2E5C] text-[#FFC107] dark:bg-[#FFC107] dark:text-[#0A2E5C] font-black shadow-xs"
                          : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Student Cards Grid (Redesigned Modern Cards) */}
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {filteredStudents.length === 0 ? (
                  <div className="py-12 text-center text-zinc-400 space-y-2">
                    <Users className="h-8 w-8 mx-auto opacity-40" />
                    <p className="text-xs font-bold">No students match "{searchQuery}"</p>
                    <button
                      onClick={() => {
                        setSearchQuery("");
                        setShiftFilter("all");
                      }}
                      className="text-xs font-bold text-[#0B5ED7] dark:text-[#FFC107] underline"
                    >
                      Clear filters
                    </button>
                  </div>
                ) : (
                  filteredStudents.map((student) => {
                    const isDue = (student.dueAmount && student.dueAmount > 0) || student.feeStatus === "Due";

                    return (
                      <div
                        key={student.id}
                        onClick={() => loadStudentDetails(student)}
                        className="group relative rounded-2xl border border-zinc-200 dark:border-zinc-800/90 bg-white dark:bg-zinc-800/50 p-3.5 hover:border-[#FFC107] dark:hover:border-[#FFC107] hover:shadow-md transition-all cursor-pointer flex items-center justify-between gap-3"
                      >
                        {/* Student Avatar & Identity */}
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="relative">
                            <div className="h-11 w-11 rounded-2xl bg-gradient-to-tr from-[#0A2E5C] to-[#2E3A52] text-[#FFC107] flex items-center justify-center font-black text-sm border border-[#FFC107]/40 shadow-xs group-hover:scale-105 transition-transform">
                              {student.fullName?.slice(0, 2).toUpperCase()}
                            </div>
                            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-[#0A2E5C]" />
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="text-xs font-black text-zinc-900 dark:text-white group-hover:text-[#0B5ED7] dark:group-hover:text-[#FFC107] transition-colors truncate">
                                {student.fullName}
                              </h4>
                              <span className="font-mono text-[9.5px] font-bold text-zinc-500 bg-zinc-100 dark:bg-zinc-700/60 dark:text-zinc-300 px-1.5 py-0.5 rounded">
                                {student.studentCode || "STUD-001"}
                              </span>
                            </div>

                            <div className="flex items-center gap-2 text-[10px] text-zinc-500 dark:text-zinc-400 mt-1 flex-wrap">
                              <span className="flex items-center gap-1">
                                <Phone className="h-2.5 w-2.5 text-zinc-400" />
                                {student.phone || "No phone"}
                              </span>
                              <span>•</span>
                              <span className="text-[#0B5ED7] dark:text-[#FFC107] font-bold">
                                {student.shift || "Standard (3 Hours Pass)"}
                              </span>
                              <span>•</span>
                              <span className="text-zinc-700 dark:text-zinc-300 font-semibold">
                                Desk #{student.seatNumber || "A-07"}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Status & Action CTA */}
                        <div className="text-right shrink-0 flex items-center gap-3">
                          <div>
                            {isDue ? (
                              <span className="inline-flex items-center gap-1 text-[10.5px] font-black px-2.5 py-1 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/50 dark:text-rose-400 dark:border-rose-900 shadow-2xs">
                                Due: ₹{student.dueAmount || 600}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10.5px] font-black px-2.5 py-1 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-900 shadow-2xs">
                                <CheckCircle2 className="h-3 w-3" /> Paid
                              </span>
                            )}
                          </div>

                          <div className="h-8 w-8 rounded-xl bg-zinc-100 group-hover:bg-[#FFC107] text-zinc-500 group-hover:text-[#0A2E5C] dark:bg-zinc-700 dark:text-zinc-300 flex items-center justify-center transition-all">
                            <ChevronRight className="h-4 w-4 stroke-[2.5]" />
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* STATE B: STUDENT SCANNED / SELECTED - COMPLETE ACTION VIEW */}
          {/* ========================================================================= */}
          {selectedStudent && (
            <div className="space-y-4">
              
              {/* 1. Student Identity Header Card */}
              <div className="relative rounded-2xl bg-gradient-to-r from-[#0A2E5C] via-[#283347] to-[#141A24] p-4 text-white border border-[#FFC107]/40 shadow-lg">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-2xl bg-gradient-to-tr from-[#0B5ED7] to-[#FFC107] text-[#0A2E5C] flex items-center justify-center font-black text-base shadow-md">
                      {selectedStudent.fullName?.slice(0, 2).toUpperCase() || "ST"}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-base font-black tracking-tight text-white">
                          {selectedStudent.fullName}
                        </h4>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                          {selectedStudent.status?.toUpperCase() || "ACTIVE"}
                        </span>
                      </div>
                      <p className="text-xs text-[#FFC107] font-medium mt-0.5">
                        Student ID: {selectedStudent.studentCode || selectedStudent.id} • {selectedStudent.phone || "No phone"}
                      </p>
                      <p className="text-[11px] text-zinc-300 mt-0.5">
                        {selectedStudent.course || "UPSC / Civil Services"} • Shift: <strong className="text-white">{selectedStudent.shift || "Standard (3 Hours Pass)"}</strong> • Desk: <strong className="text-white">#{selectedStudent.seatNumber || "A-07"}</strong>
                      </p>
                    </div>
                  </div>

                  {/* Back to Live Scanner Button */}
                  <button
                    onClick={handleBackToScanner}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold text-white transition border border-white/20 cursor-pointer"
                  >
                    <QrCode className="h-3.5 w-3.5 text-[#FFC107]" /> Scan Next
                  </button>
                </div>
              </div>

              {/* 2. ATTENDANCE STATUS & 1-TAP CHECK-IN/OUT ACTION */}
              {(() => {
                const todayDateStr = new Date().toISOString().split("T")[0];
                const todayAttendance = studentAttendance.find((a) => a.date === todayDateStr);
                const isCheckedIn = todayAttendance && !todayAttendance.checkOut;
                const isCompleted = todayAttendance && !!todayAttendance.checkOut;

                return (
                  <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-[#FBFBFA] dark:bg-[#141A24]/60 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-emerald-500" />
                        <h5 className="text-xs font-black uppercase tracking-wider text-zinc-800 dark:text-zinc-200">
                          Today's Attendance ({todayDateStr})
                        </h5>
                      </div>
                      
                      {isCheckedIn ? (
                        <span className="text-xs font-black text-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 px-2.5 py-0.5 rounded-full flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                          PRESENT IN LIBRARY
                        </span>
                      ) : isCompleted ? (
                        <span className="text-xs font-black text-blue-600 bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                          <CheckCheck className="h-3.5 w-3.5" /> CHECKED OUT
                        </span>
                      ) : (
                        <span className="text-xs font-black text-amber-600 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 px-2.5 py-0.5 rounded-full">
                          NOT CHECKED IN TODAY
                        </span>
                      )}
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 shadow-2xs">
                      <div className="space-y-1">
                        {isCheckedIn ? (
                          <>
                            <p className="text-xs font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                              <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                              <span>Active session at Desk #{todayAttendance?.seatNumber || selectedStudent.seatNumber || '01'}</span>
                            </p>
                            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                              Check-In time: <strong>{todayAttendance?.checkIn}</strong> • Shift: <strong>{selectedStudent.shift || "Morning"}</strong>
                            </p>
                          </>
                        ) : isCompleted ? (
                          <>
                            <p className="text-xs font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                              <CheckCheck className="h-4 w-4 text-blue-500 shrink-0" />
                              <span>Attendance completed today at Desk #{todayAttendance?.seatNumber || selectedStudent.seatNumber || '01'}</span>
                            </p>
                            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                              In: <strong>{todayAttendance?.checkIn}</strong> • Out: <strong>{todayAttendance?.checkOut}</strong>
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="text-xs font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                              <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
                              <span>Student has not marked attendance today</span>
                            </p>
                            <div className="flex items-center gap-2 pt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                              <span>Desk Allotment:</span>
                              <input
                                type="text"
                                value={attendanceDesk}
                                onChange={(e) => setAttendanceDesk(e.target.value.toUpperCase())}
                                placeholder="01"
                                className="w-16 px-2 py-0.5 rounded border border-zinc-300 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-700 font-mono text-xs font-bold text-center text-zinc-900 dark:text-white"
                              />
                              <span>({selectedStudent.shift || "Morning"})</span>
                            </div>
                          </>
                        )}
                      </div>

                      <div className="shrink-0 flex items-center gap-2">
                        {isCheckedIn ? (
                          <button
                            disabled={actionLoading === "attendance"}
                            onClick={handleCheckOutAttendance}
                            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white text-xs font-bold transition shadow-md shadow-amber-600/20 disabled:opacity-50 cursor-pointer"
                          >
                            {actionLoading === "attendance" ? (
                              <RefreshCw className="h-4 w-4 animate-spin" />
                            ) : (
                              <LogOut className="h-4 w-4" />
                            )}
                            <span>Check Out & Release Desk</span>
                          </button>
                        ) : (
                          <button
                            disabled={actionLoading === "attendance"}
                            onClick={handleCheckInAttendance}
                            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-bold transition shadow-md shadow-emerald-600/20 disabled:opacity-50 cursor-pointer"
                          >
                            {actionLoading === "attendance" ? (
                              <RefreshCw className="h-4 w-4 animate-spin" />
                            ) : (
                              <LogIn className="h-4 w-4" />
                            )}
                            <span>{isCompleted ? "Re-Check In" : "Mark Present & Check-In"}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* 3. LIVE FEE STATUS & DIRECT ACTION */}
              <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-[#FBFBFA] dark:bg-[#141A24]/60 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <IndianRupee className="h-4 w-4 text-amber-500" />
                    <h5 className="text-xs font-black uppercase tracking-wider text-zinc-800 dark:text-zinc-200">
                      Fee Payment Status
                    </h5>
                  </div>
                  
                  {pendingFees.length > 0 ? (
                    <span className="text-xs font-black text-rose-600 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 px-2.5 py-0.5 rounded-full">
                      OVERDUE / UNPAID
                    </span>
                  ) : (
                    <span className="text-xs font-black text-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5" /> ALL DUES CLEARED
                    </span>
                  )}
                </div>

                {pendingFees.length > 0 ? (
                  <div className="space-y-2">
                    {pendingFees.map((fee) => (
                      <div
                        key={fee.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl bg-white dark:bg-zinc-800 border border-rose-200 dark:border-rose-900/60 shadow-2xs"
                      >
                        <div>
                          <p className="text-xs font-bold text-zinc-900 dark:text-white">{fee.type || "Monthly Seat Fee"}</p>
                          <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
                            Due Date: {fee.dueDate || "Immediate"} • Amount: <strong className="text-rose-600 font-bold">₹{fee.amount}</strong>
                          </p>
                        </div>

                        <button
                          disabled={actionLoading === `pay-${fee.id}`}
                          onClick={() => handleMarkFeePaid(fee.id, fee.amount)}
                          className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-bold transition shadow-md shadow-emerald-600/20 disabled:opacity-50 cursor-pointer"
                        >
                          {actionLoading === `pay-${fee.id}` ? (
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Receipt className="h-3.5 w-3.5" />
                          )}
                          <span>Collect ₹{fee.amount} & Mark Paid</span>
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-900/40 text-xs text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
                    <div>
                      <p className="font-bold">Active Membership Pass is fully paid.</p>
                      <p className="text-[10px] opacity-80">Next billing cycle on 1st of next month.</p>
                    </div>
                    <CheckCheck className="h-5 w-5 text-emerald-600 shrink-0" />
                  </div>
                )}
              </div>

              {/* 3. EXAM RESULTS & MOCK TEST PERFORMANCE */}
              <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-[#FBFBFA] dark:bg-[#141A24]/60 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Award className="h-4 w-4 text-amber-500" />
                    <h5 className="text-xs font-black uppercase tracking-wider text-zinc-800 dark:text-zinc-200">
                      Exam Results &amp; Mock Tests ({studentExamResults.length} Assessed)
                    </h5>
                  </div>
                </div>

                {studentExamResults.some(r => !!r.mark) ? (
                  <div className="space-y-2">
                    {studentExamResults.filter(r => !!r.mark).map((result) => (
                      <div
                        key={result.exam.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 shadow-2xs"
                      >
                        <div>
                          <p className="text-xs font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                            {result.exam.title}
                            {result.mark && (
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                result.mark.status === "Pass"
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40"
                                  : "bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40"
                              }`}>
                                {result.mark.status}
                              </span>
                            )}
                          </p>
                          {result.mark && (
                            <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                              Score: <strong className="text-zinc-700 dark:text-zinc-200">{result.mark.marksObtained}/{result.exam.totalMarks} ({result.mark.percentage}%)</strong>
                              {result.rank && <span className="ml-2 font-bold text-amber-600">Library Rank: #{result.rank}</span>}
                              {result.mark.remarks && <span className="ml-2 italic text-zinc-400">"{result.mark.remarks}"</span>}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500 dark:text-zinc-400">
                    No mock test scores logged for this student yet. Admin can set marks in Results Desk.
                  </div>
                )}
              </div>

              {/* 5. RECENT ATTENDANCE LOGS (LAST FEW DAYS) */}
              <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-[#FBFBFA] dark:bg-[#141A24]/60 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-emerald-500" />
                    <h5 className="text-xs font-black uppercase tracking-wider text-zinc-800 dark:text-zinc-200">
                      Attendance History ({studentAttendance.length} records)
                    </h5>
                  </div>
                </div>

                <div className="space-y-1.5">
                  {studentAttendance.length === 0 ? (
                    <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500 dark:text-zinc-400">
                      No previous attendance records found for this student.
                    </div>
                  ) : (
                    studentAttendance.map((log) => (
                      <div
                        key={log.id}
                        className="flex items-center justify-between p-2.5 rounded-xl bg-white dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700/60 text-xs"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className={`h-2 w-2 rounded-full ${log.checkOut ? 'bg-blue-500' : 'bg-emerald-500'}`} />
                          <div>
                            <p className="font-bold text-zinc-800 dark:text-zinc-200">
                              {log.date}
                            </p>
                            <p className="text-[10px] text-zinc-400">
                              Desk: #{log.seatNumber || selectedStudent.seatNumber || "01"} • {log.shiftName || selectedStudent.shift || "24/7 Access"}
                            </p>
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="font-mono text-[11px] font-bold text-zinc-700 dark:text-zinc-300">
                            In: {log.checkIn} {log.checkOut ? `• Out: ${log.checkOut}` : "• (Active Now)"}
                          </span>
                          <p className="text-[9px] text-emerald-600 dark:text-emerald-400 font-bold uppercase">
                            {log.status || "present"}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* 5. QUICK ACTIONS FOOTER */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                {selectedStudent.phone && (
                  <a
                    href={`https://wa.me/${selectedStudent.phone}?text=${encodeURIComponent(
                      `Hello ${selectedStudent.fullName}, Greetings from Genius Library, Madhupur, Sonbhadra. Your desk inspection is complete. Fee Status: ${selectedStudent.feeStatus || 'Updated'}. Study diligently! 🙏`
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-bold hover:bg-emerald-100 transition"
                  >
                    <Send className="h-3.5 w-3.5" /> WhatsApp Student
                  </a>
                )}

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleBackToScanner}
                    className="px-3.5 py-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-xs font-bold text-zinc-700 dark:text-zinc-300 transition cursor-pointer"
                  >
                    ← Scan Another Student
                  </button>
                  <button
                    onClick={handleModalClose}
                    className="px-4 py-2 rounded-xl bg-[#0A2E5C] text-white text-xs font-bold hover:bg-black transition cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>

            </div>
          )}

        </div>

      </div>
    </div>
  );
}
