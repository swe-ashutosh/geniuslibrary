"use client";

/**
 * [WEB • PAGE] Student Portal Shell
 *
 * Bottom navigation, profile header and auth/role guard for all
 * student pages.
 */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BrandLogo } from "@/components/BrandLogo";
import { 
  LayoutDashboard, 
  UserCheck, 
  Award, 
  IndianRupee,
  MessageSquare,
  CheckSquare,
  LogOut,
  Bell,
  X,
  Menu,
  User,
  ShieldCheck,
  ChevronDown,
  Sparkles,
  ExternalLink,
  Search,
  QrCode,
  Camera,
  Phone,
  MapPin,
  Users,
  CheckCircle,
  Clock,
  Settings,
  Download,
  KeyRound,
  Newspaper,
  Trash2
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { 
  getStudents, 
  getAnnouncements,
  getNotifications, 
  markNotificationAsRead, 
  markAllNotificationsAsRead, 
  clearAllNotifications,
  deleteNotification,
  NotificationRecord,
  smartQrScanAttendance,
  sanitizeSeatNumber
} from "@/lib/api";
import { LiveAttendanceCameraModal } from "@/components/LiveAttendanceCameraModal";
import { recordUserActivity, checkInactivityExpiry, clearInactivityTracking, getSavedUserRole, saveUserRole } from "@/lib/authInactivity";
import { 
  requestNotificationPermission, 
  getNotificationPermission, 
  triggerNativeNotification, 
  subscribeToNotificationBroadcast 
} from "@/lib/pushNotify";
import { uploadAvatar } from "@/lib/supabase/storage";
import { BRAND_CONFIG, isMasterAdminEmail } from "@/lib/config";
import { enrollStudentInExam } from "@/lib/examResults";
import QRCode from "qrcode";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/student/", icon: LayoutDashboard },
  { label: "Attendance", href: "/student/attendance/", icon: UserCheck },
  { label: "Fees", href: "/student/fees/", icon: IndianRupee },
  { label: "Activity & Results", href: "/student/tasks/", icon: Award },
  { label: "News & Blogs", href: "/student/news/", icon: Newspaper },
  { label: "Messages", href: "/student/messages/", icon: MessageSquare },
];

const MOBILE_BOTTOM_NAV = [
  { label: "Dashboard", href: "/student/", icon: LayoutDashboard },
  { label: "Attendance", href: "/student/attendance/", icon: UserCheck },
  { label: "Fees", href: "/student/fees/", icon: IndianRupee },
  { label: "Activity", href: "/student/tasks/", icon: Award },
  { label: "News", href: "/student/news/", icon: Newspaper },
];

export default function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [userSidebarOpen, setUserSidebarOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [profileDetailsOpen, setProfileDetailsOpen] = useState(false);
  const [isUploadingModalAvatar, setIsUploadingModalAvatar] = useState(false);
  const [qrPassUrl, setQrPassUrl] = useState<string>("");

  const notifRef = useRef<HTMLDivElement>(null);
  const avatarModalInputRef = useRef<HTMLInputElement>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [isGlobalScannerOpen, setIsGlobalScannerOpen] = useState(false);

  const handleOpenScanner = () => {
    setIsGlobalScannerOpen(true);
  };

  useEffect(() => {
    const handleOpenScannerEvent = () => setIsGlobalScannerOpen(true);

    window.addEventListener("open_student_qr_scanner", handleOpenScannerEvent);

    return () => {
      window.removeEventListener("open_student_qr_scanner", handleOpenScannerEvent);
    };
  }, []);

  // Auto-close mobile navigation drawer on route change
  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  // Close mobile drawer on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileNavOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && searchQuery.trim()) {
      router.push(`/student/tasks?search=${encodeURIComponent(searchQuery.trim())}`);
    }
  };


  const [userProfile, setUserProfile] = useState<{
    id?: string;
    studentCode?: string;
    fullName: string;
    email: string;
    phone?: string;
    parentName?: string;
    parentPhone?: string;
    address?: string;
    seatNumber?: string | null;
    role: string;
    avatarUrl?: string | null;
    shift?: string;
    course?: string;
    status?: string;
    dueAmount?: number;
  }>({
    fullName: "Student Member",
    email: "",
    phone: "",
    parentName: "",
    parentPhone: "",
    address: "",
    seatNumber: null,
    role: "STUDENT",
    avatarUrl: null,
    shift: "Morning",
    course: "Civil Services / Competitive Exams",
    status: "active",
    dueAmount: 0,
    studentCode: "SDL-2026-001",
  });

  // Generate dynamic QR pass for student sidebar
  useEffect(() => {
    if (userProfile.fullName || userProfile.email) {
      const studentPassPayload = JSON.stringify({
        type: "STUDENT_PASS",
        studentId: userProfile.id || userProfile.studentCode || "SDL-2026-001",
        studentCode: userProfile.studentCode || "SDL-2026-001",
        name: userProfile.fullName,
        email: userProfile.email,
        phone: userProfile.phone,
        course: userProfile.course,
        shift: userProfile.shift,
        seat: userProfile.seatNumber,
        status: userProfile.status,
        validTill: "2026-10-31",
      });

      QRCode.toDataURL(studentPassPayload, {
        width: 320,
        margin: 1,
        color: {
          dark: "#0A2E5C",
          light: "#FFFFFF",
        },
      })
        .then(setQrPassUrl)
        .catch(console.error);
    }
  }, [userProfile]);

  // Background Web NFC Listener (Student opens app and taps physical NFC sticker at library)
  useEffect(() => {
    if (typeof window === "undefined" || !("NDEFReader" in window) || !userProfile.id) return;
    let isSubscribed = true;

    const startBackgroundNfc = async () => {
      try {
        // @ts-ignore
        const ndef = new window.NDEFReader();
        await ndef.scan();
        ndef.addEventListener("reading", async (event: any) => {
          if (!isSubscribed) return;
          
          const rawSerial = event.serialNumber || "";
          const normalize = (s: string) => (s || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
          const ALLOWED = ["53:D4:B6:CD:53:00:01", "53:98:3A:CD:53:00:01"];
          const isMatch = ALLOWED.some(a => normalize(a) === normalize(rawSerial));
          if (!isMatch) {
            console.warn("[NFC Background] Non-library tag tapped:", rawSerial);
            return;
          }

          let tagData = "MASTER";
          if (event.message?.records) {
            for (const record of event.message.records) {
              if (record.recordType === "text" || record.recordType === "url") {
                const decoder = new TextDecoder(record.encoding || "utf-8");
                tagData = decoder.decode(record.data);
                break;
              }
            }
          }
          if (typeof window !== "undefined" && window.navigator && window.navigator.vibrate) {
            try { window.navigator.vibrate([100, 50, 100]); } catch {}
          }
          try {
            const parsedSeat = sanitizeSeatNumber(tagData);
            // If student already has an assigned/reserved seat, preserve it!
            const effectiveSeat = sanitizeSeatNumber(userProfile.seatNumber) || parsedSeat || undefined;
            const res = await smartQrScanAttendance({
              studentId: userProfile.id!,
              studentName: userProfile.fullName,
              shiftName: userProfile.shift,
              seatNumber: effectiveSeat,
              verificationMethod: "nfc",
            });
            const actionText = res.action === "checked_out" ? "Checked Out" : "Checked In";
            triggerNativeNotification({
              title: `✓ NFC Verified: ${actionText}`,
              body: res.message || `${actionText} successfully recorded at ${res.checkInTime || res.checkOutTime || "now"}.`,
              url: "/student/attendance",
              tag: `nfc-att-${Date.now()}`,
            }).catch(() => {});
            window.dispatchEvent(new CustomEvent("attendance_updated"));
          } catch (e: any) {
            console.warn("[NFC Background] Scan error:", e);
          }
        });
      } catch {
        // Standby silently
      }
    };

    startBackgroundNfc();

    return () => {
      isSubscribed = false;
    };
  }, [userProfile.id, userProfile.fullName, userProfile.shift, userProfile.seatNumber]);

  const handleModalAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userProfile.id) return;

    setIsUploadingModalAvatar(true);
    try {
      const { url, error } = await uploadAvatar(file, userProfile.id);
      if (url) {
        if (typeof window !== "undefined") {
          localStorage.setItem(`genius_custom_avatar_${userProfile.id}`, url);
        }
        setUserProfile((prev) => ({ ...prev, avatarUrl: url }));
        window.dispatchEvent(new CustomEvent("student_avatar_updated", { detail: { avatarUrl: url } }));
      }
    } catch (err) {
      console.error("Avatar upload failed:", err);
    } finally {
      setIsUploadingModalAvatar(false);
    }
  };

  const [notifications, setNotifications] = useState<any[]>([]);
  const [studentNotifications, setStudentNotifications] = useState<NotificationRecord[]>([]);
  const [notificationPermission, setNotificationPermission] = useState<string>("default");
  const [currentStudentId, setCurrentStudentId] = useState<string>("");
  const [currentStudentEmail, setCurrentStudentEmail] = useState<string>("");
  const [studentRegisteredAt, setStudentRegisteredAt] = useState<string>("");
  const [livePopupAlert, setLivePopupAlert] = useState<{
    title: string;
    body: string;
    url: string;
    type: string;
    examId?: string;
    examTitle?: string;
  } | null>(null);
  const [enrolledToast, setEnrolledToast] = useState<string | null>(null);
  const [enrollSubmitting, setEnrollSubmitting] = useState(false);
  const [dismissedPermPrompt, setDismissedPermPrompt] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    try {
      return sessionStorage.getItem("genius_notif_prompt_dismissed") === "1";
    } catch {
      return false;
    }
  });
  const recentNotifKeys = useRef(new Set<string>());

  const dispatchStudentAlert = (alertData: {
    title: string;
    body: string;
    url: string;
    type?: string;
    dedupeKey?: string;
    examId?: string;
    examTitle?: string;
  }) => {
    if (alertData.dedupeKey) {
      if (recentNotifKeys.current.has(alertData.dedupeKey)) return;
      recentNotifKeys.current.add(alertData.dedupeKey);
      setTimeout(() => recentNotifKeys.current.delete(alertData.dedupeKey!), 8000);
    }

    triggerNativeNotification({
      title: alertData.title,
      body: alertData.body,
      url: alertData.url,
    });

    setLivePopupAlert({
      title: alertData.title,
      body: alertData.body,
      url: alertData.url,
      type: alertData.type || "general",
      examId: alertData.examId,
      examTitle: alertData.examTitle,
    });
  };

  useEffect(() => {
    if (!livePopupAlert) return;
    const timer = setTimeout(() => {
      setLivePopupAlert(null);
    }, 7000);
    return () => clearTimeout(timer);
  }, [livePopupAlert]);

  const formatRelativeTime = (dateStr?: string | null) => {
    if (!dateStr) return "Just now";
    try {
      const d = new Date(dateStr);
      const now = new Date();
      const diffSec = Math.floor((now.getTime() - d.getTime()) / 1000);
      if (diffSec < 60) return "Just now";
      if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
      if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
      return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
    } catch {
      return "Recent";
    }
  };

  const fetchStudentNotifications = async (sId?: string, sEmail?: string) => {
    const targetId = sId || currentStudentId;
    const targetEmail = sEmail || currentStudentEmail;
    try {
      const [notifs, liveAnn] = await Promise.all([
        getNotifications({ role: "student", recipientId: targetId, registeredAfter: studentRegisteredAt || undefined }),
        getAnnouncements().catch(() => []),
      ]);

      setStudentNotifications(notifs || []);

      const notifItems = (notifs || []).map((n: any) => {
        let dest = n.actionUrl;
        if (!dest) {
          const lowerTitle = (n.title || "").toLowerCase();
          const lowerMsg = (n.message || "").toLowerCase();
          if (
            lowerTitle.includes("message") || 
            lowerTitle.includes("reply") || 
            lowerTitle.includes("admin") ||
            lowerMsg.includes("reply") || 
            lowerMsg.includes("message") || 
            lowerMsg.includes("chat")
          ) {
            dest = "/student/messages";
          } else if (lowerTitle.includes("fee") || lowerMsg.includes("fee") || lowerTitle.includes("payment")) {
            dest = "/student/fees";
          } else if (lowerTitle.includes("task") || lowerTitle.includes("exam") || lowerTitle.includes("result")) {
            dest = "/student/tasks";
          } else if (lowerTitle.includes("attendance") || lowerTitle.includes("desk")) {
            dest = "/student/attendance";
          } else {
            dest = "/student/messages";
          }
        }
        return {
          id: n.id,
          title: n.title,
          desc: n.message,
          time: formatRelativeTime(n.createdAt),
          unread: !n.isRead,
          actionUrl: dest,
          isDbNotif: true,
        };
      });

      let readAnnIds: string[] = [];
      if (typeof window !== "undefined") {
        try {
          readAnnIds = JSON.parse(localStorage.getItem("genius_read_announcements") || "[]");
        } catch {}
      }

      const annItems = (liveAnn || []).map((a: any) => ({
        id: a.id,
        title: a.title,
        desc: a.message,
        time: a.createdAt ? formatRelativeTime(a.createdAt) : "Recent",
        unread: !readAnnIds.includes(a.id) && (a.priority === "high" || a.priority === "urgent"),
        actionUrl: "/student/messages",
        isDbNotif: false,
      }));

      setNotifications([...notifItems, ...annItems]);
    } catch (err) {
      console.warn("Error fetching student notifications:", err);
    }
  };

  useEffect(() => {
    setNotificationPermission(getNotificationPermission());

    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        if (currentStudentId || currentStudentEmail) {
          fetchStudentNotifications(currentStudentId, currentStudentEmail);
        }
      }
    }, 120000);

    const unsubscribe = subscribeToNotificationBroadcast((payload: any) => {
      const role = (payload.recipientRole || "all").toLowerCase();
      const isForStudent = role === "student" || role === "all" || role === "students" || role.includes("student");
      const isTarget =
        !payload.recipientId ||
        payload.recipientId === currentStudentId ||
        (currentStudentEmail &&
          payload.recipientId.toLowerCase() === currentStudentEmail.toLowerCase());

      if (isForStudent && isTarget) {
        fetchStudentNotifications(currentStudentId, currentStudentEmail);
        dispatchStudentAlert({
          title: payload.title || "Library Alert",
          body: payload.message || payload.body || "",
          url: payload.actionUrl || payload.url || "/student",
          type: payload.type || "general",
          examId: payload.examId || (typeof payload.id === "string" && payload.id.startsWith("exam-") ? payload.id.replace("exam-", "") : undefined),
          examTitle: payload.examTitle || payload.title,
          dedupeKey: `broadcast_${payload.id || payload.title}_${payload.createdAt || ""}`,
        });
      }
    });

    // Supabase Realtime for cross-device instant notification sync
    const supabase = createClient();
    const channel = supabase
      .channel(`student_realtime_stream_${currentStudentId || "guest"}_${Math.random().toString(36).substring(2, 6)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        (change: any) => {
          const row = change.new;
          if (!row) return;

          const dedupeKey = `row_${row.id || ""}_${row.created_at || ""}`;

          // CASE 1: Standard System Notification
          if (row.student_id === "SYSTEM_NOTIF") {
            const role = (row.recipient_role || "all").toLowerCase();
            const isForStudent = role === "student" || role === "all" || role === "students" || role.includes("student");
            const isTarget =
              !row.recipient_id ||
              row.recipient_id === currentStudentId ||
              (currentStudentEmail &&
                row.recipient_id.toLowerCase() === currentStudentEmail.toLowerCase());

            if (isForStudent && isTarget) {
              fetchStudentNotifications(currentStudentId, currentStudentEmail);
              let notifTitle = row.student_name || "Library Alert";
              let notifBody = row.message || "";
              let notifUrl = "/student";
              let notifType = row.sender_name || "general";
              let examId: string | undefined = undefined;
              let examTitle: string | undefined = undefined;

              try {
                const parsed = typeof row.message === "string" ? JSON.parse(row.message) : row.message;
                if (parsed && typeof parsed === "object") {
                  notifTitle = parsed.title || notifTitle;
                  notifBody = parsed.message || notifBody;
                  notifUrl = parsed.actionUrl || notifUrl;
                  notifType = parsed.type || notifType;
                  examId = parsed.examId;
                  examTitle = parsed.examTitle;
                }
              } catch {}

              dispatchStudentAlert({
                title: notifTitle,
                body: notifBody,
                url: notifUrl,
                type: notifType,
                examId,
                examTitle,
                dedupeKey,
              });
            }
          }

          // CASE 2: Broadcast Announcement from Admin
          else if (row.student_id === "SYSTEM_ANNOUNCEMENT") {
            const role = (row.recipient_role || "all").toLowerCase();
            const isForStudent = role === "all" || role === "student" || role.includes("all") || role.includes("student");

            if (isForStudent) {
              fetchStudentNotifications(currentStudentId, currentStudentEmail);
              const notifTitle = row.student_name ? `📢 ${row.student_name}` : "📢 New Library Announcement";
              const notifBody = row.message || "A new library announcement has been broadcast.";
              const notifUrl = "/student/messages";

              dispatchStudentAlert({
                title: notifTitle,
                body: notifBody,
                url: notifUrl,
                type: "announcement",
                dedupeKey,
              });

              if (typeof window !== "undefined") {
                window.dispatchEvent(new CustomEvent("genius_announcement_updated"));
              }
            }
          }

          // CASE 3: Exam Released or Scheduled
          else if (row.student_id === "SYSTEM_EXAM") {
            try {
              const exam = typeof row.message === "string" ? JSON.parse(row.message) : row.message;
              if (exam && (exam.status === "Published" || !exam.status)) {
                fetchStudentNotifications(currentStudentId, currentStudentEmail);
                const notifTitle = `📝 New Exam: ${exam.title || row.student_name}`;
                const notifBody = `${exam.category ? `[${exam.category}] ` : ""}Exam Date: ${exam.examDate || "Scheduled"}. Tap to enroll & check syllabus.`;
                const notifUrl = "/student/tasks";

                dispatchStudentAlert({
                  title: notifTitle,
                  body: notifBody,
                  url: notifUrl,
                  type: "exam",
                  examId: exam.id,
                  examTitle: exam.title || row.student_name,
                  dedupeKey,
                });

                if (typeof window !== "undefined") {
                  window.dispatchEvent(new CustomEvent("genius_exams_updated"));
                }
              }
            } catch {}
          }

          // CASE 4: Student Exam Mark Released
          else if (row.student_id === "SYSTEM_EXAM_MARK") {
            try {
              const mark = typeof row.message === "string" ? JSON.parse(row.message) : row.message;
              const isMatch =
                mark &&
                ((mark.studentId && mark.studentId === currentStudentId) ||
                 (mark.studentEmail && currentStudentEmail && mark.studentEmail.toLowerCase() === currentStudentEmail.toLowerCase()));

              if (isMatch) {
                fetchStudentNotifications(currentStudentId, currentStudentEmail);
                const notifTitle = `🏆 Exam Score Declared!`;
                const notifBody = `Score: ${mark.marksObtained}/${mark.totalMarks} (${mark.percentage}%). Status: ${mark.status}. Tap to view scorecard.`;
                const notifUrl = "/student/tasks";

                dispatchStudentAlert({
                  title: notifTitle,
                  body: notifBody,
                  url: notifUrl,
                  type: "exam_result",
                  dedupeKey,
                });

                if (typeof window !== "undefined") {
                  window.dispatchEvent(new CustomEvent("genius_exams_updated"));
                }
              }
            } catch {}
          }
        }
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [currentStudentId, currentStudentEmail]);

  const handleStudentNotificationClick = async (n: any) => {
    if (n.isDbNotif && n.unread) {
      try {
        await markNotificationAsRead(n.id);
      } catch {}
      setStudentNotifications((prev) =>
        prev.map((item) => (item.id === n.id ? { ...item, isRead: true } : item))
      );
    }
    if (!n.isDbNotif && typeof window !== "undefined") {
      try {
        const readAnnIds: string[] = JSON.parse(localStorage.getItem("genius_read_announcements") || "[]");
        if (!readAnnIds.includes(n.id)) {
          readAnnIds.push(n.id);
          localStorage.setItem("genius_read_announcements", JSON.stringify(readAnnIds));
        }
      } catch {}
    }
    setNotifications((prev) =>
      prev.map((item) => (item.id === n.id ? { ...item, unread: false } : item))
    );
    setNotificationsOpen(false);
    if (n.actionUrl) {
      router.push(n.actionUrl);
    }
  };

  const handleMarkAllStudentRead = async () => {
    if (currentStudentId) {
      try {
        await markAllNotificationsAsRead({ role: "student", recipientId: currentStudentId });
      } catch {}
    }
    if (typeof window !== "undefined") {
      try {
        const allIds = notifications.map((n) => n.id);
        localStorage.setItem("genius_read_announcements", JSON.stringify(allIds));
      } catch {}
    }
    setStudentNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setNotifications((prev) => prev.map((n) => ({ ...n, unread: false })));
  };

  const handleClearAllStudentNotifications = async () => {
    if (currentStudentId) {
      try {
        await clearAllNotifications({ role: "student", recipientId: currentStudentId });
      } catch {}
    }
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem("genius_read_announcements");
      } catch {}
    }
    setStudentNotifications([]);
    setNotifications([]);
  };

  const handleDeleteStudentNotification = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await deleteNotification(id);
    setStudentNotifications((prev) => prev.filter((n) => n.id !== id));
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const handleEnableStudentPush = async () => {
    const res = await requestNotificationPermission();
    setNotificationPermission(res);
    if (res === "granted") {
      triggerNativeNotification({
        title: "🔔 Native Popups Active",
        body: "You will receive desktop and mobile fee reminders and message alerts.",
        url: "/student",
      });
    }
  };

  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const userLoadedRef = useRef(false);

  useEffect(() => {
    if (userLoadedRef.current) return;
    async function loadUser() {
      userLoadedRef.current = true;

      recordUserActivity();

      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      
      if (!user) {
        // Fallback check
        const { data: { user: authUser }, error } = await supabase.auth.getUser();
        if (error || !authUser) {
          router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
          return;
        }
      }

      const activeUser = (user || (await supabase.auth.getUser()).data.user)!;
      const meta = activeUser.user_metadata || {};
      const isAdmin = isMasterAdminEmail(activeUser.email) || meta.role === "admin";
      if (isAdmin) {
        saveUserRole("admin");
        router.replace("/admin");
        return;
      }

      // 1. Fetch live student profile directly from Supabase (Single source of truth)
      try {
        let profile: any = null;
        const byId = await supabase
          .from("profiles")
          .select("*")
          .eq("id", activeUser.id)
          .maybeSingle();

        if (byId.data) {
          profile = byId.data;
        } else if (activeUser.email) {
          const byEmail = await supabase
            .from("profiles")
            .select("*")
            .eq("email", activeUser.email)
            .maybeSingle();
          if (byEmail.data) {
            profile = byEmail.data;
            // Sync auth user id to profile for permanent resolution
            void supabase.from("profiles").update({ id: activeUser.id }).eq("email", activeUser.email);
          }
        }

        // Verification check 1: Student profile exists
        if (!profile) {
          await supabase.auth.signOut();
          router.replace(`/login?error=not_registered&email=${encodeURIComponent(activeUser.email || "")}`);
          return;
        }

        // Verification check 2: Suspended
        if (profile.status === "suspended") {
          await supabase.auth.signOut();
          router.replace(`/login?error=suspended&email=${encodeURIComponent(activeUser.email || "")}`);
          return;
        }

        // Verification check 3: Pending Admin Approval
        if (profile.status === "pending") {
          await supabase.auth.signOut();
          router.replace(`/login?error=pending_approval&email=${encodeURIComponent(activeUser.email || "")}`);
          return;
        }

        // Verification check 4: Any status other than active
        if (profile.status !== "active") {
          await supabase.auth.signOut();
          router.replace(`/login?error=not_approved&email=${encodeURIComponent(activeUser.email || "")}`);
          return;
        }

        // ONLY approved active students get to view the student portal!
        saveUserRole("student");
        setCurrentStudentId(activeUser.id);
        setCurrentStudentEmail(activeUser.email || "");
        setStudentRegisteredAt((profile as any)?.created_at || activeUser.created_at || "");

        const cachedAvatar = typeof window !== "undefined" ? localStorage.getItem(`genius_custom_avatar_${activeUser.id}`) : null;
        const studentAvatar = cachedAvatar || profile.avatar_url || meta.custom_avatar || meta.avatar_url || null;

        setUserProfile({
          id: activeUser.id,
          studentCode: profile.student_code || "SDL-2026-001",
          fullName: profile.full_name || meta.full_name || activeUser.email?.split("@")[0] || "Student Member",
          email: activeUser.email || "",
          phone: profile.phone || meta.phone || "",
          parentName: profile.parent_name || meta.parent_name || "",
          parentPhone: profile.parent_phone || meta.parent_phone || "",
          address: profile.address || meta.address || "Madhupur, Sonbhadra",
          shift: profile.shift || meta.shift || "Morning",
          course: profile.course || meta.course || "Competitive Exams",
          avatarUrl: studentAvatar,
          seatNumber: profile.seat_number || null,
          status: profile.status || "active",
          dueAmount: Number(profile.due_amount || 0),
          role: "STUDENT",
        });

        fetchStudentNotifications(activeUser.id, activeUser.email || "");
        setIsCheckingAuth(false);
      } catch (err) {
        console.error("Failed to verify student profile:", err);
        await supabase.auth.signOut();
        router.replace("/login?error=auth_error");
      }
    }
    loadUser();
  }, [router]);

  // Listen to student avatar updates from anywhere in the student dashboard
  useEffect(() => {
    const handleAvatarUpdated = (e: any) => {
      const newUrl = e.detail?.avatarUrl;
      if (newUrl) {
        if (typeof window !== "undefined" && userProfile.id) {
          localStorage.setItem(`genius_custom_avatar_${userProfile.id}`, newUrl);
        }
        setUserProfile((prev) => ({ ...prev, avatarUrl: newUrl }));
      }
    };
    window.addEventListener("student_avatar_updated", handleAvatarUpdated);
    return () => window.removeEventListener("student_avatar_updated", handleAvatarUpdated);
  }, [userProfile.id]);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setNotificationsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    clearInactivityTracking();
    router.push("/login/");
  };

  const getInitials = (name: string) => {
    const parts = name.trim().split(" ");
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.slice(0, 2).toUpperCase() || "ST";
  };

  const isNavActive = (href: string) => {
    const normalizedPath = pathname.endsWith('/') ? pathname : `${pathname}/`;
    const normalizedHref = href.endsWith('/') ? href : `${href}/`;
    if (normalizedHref === "/student/") {
      return normalizedPath === "/student/";
    }
    return normalizedPath.startsWith(normalizedHref);
  };

  if (isCheckingAuth) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#F8FAFC] dark:bg-[#0A2E5C]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#0B5ED7] border-t-transparent" />
          <p className="text-xs font-bold tracking-wider text-[#0B5ED7] dark:text-[#FFC107]">Loading Student Portal...</p>
        </div>
      </div>
    );
  }

    return (
    <div className="flex h-screen overflow-hidden bg-[#F8FAFC] dark:bg-[#141A24]">
      <meta name="robots" content="noindex, nofollow" />
      <title>{`Student Portal | ${BRAND_CONFIG.fullName}`}</title>


      {/* Desktop-Only Sidebar: No Sidebar on Mobile per Requirements */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col bg-[#0A2E5C]">
        <div className="flex h-16 items-center px-6 border-b border-zinc-800/50 justify-between">
          <BrandLogo variant="navbar" size="md" href="/student" darkBackground />
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-6 scrollbar-none">
          <p className="px-3 text-[10px] font-black uppercase tracking-wider text-zinc-500 mb-2">
            Student Menu
          </p>
          <nav className="space-y-1.5">
            {NAV_ITEMS.map((item) => {
              const active = isNavActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-xl px-4 py-3 text-xs font-bold transition-all ${
                    active 
                      ? "bg-[#141A24] text-[#FFC107] border border-[#FFC107]/40 shadow-sm" 
                      : "text-zinc-400 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <item.icon className={`h-4 w-4 ${active ? "text-[#FFC107]" : "text-zinc-400"}`} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* User Profile in Sidebar */}
        <div className="border-t border-zinc-800 p-4">
          <div className="flex items-center gap-3 rounded-2xl bg-white/5 p-3">
            {userProfile.avatarUrl ? (
              <img 
                src={userProfile.avatarUrl} 
                alt={userProfile.fullName}
                className="h-10 w-10 shrink-0 rounded-xl object-cover border border-[#FFC107]/40"
              />
            ) : (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFC107] text-xs font-black text-[#0A2E5C]">
                {getInitials(userProfile.fullName)}
              </div>
            )}
            <div className="flex-1 overflow-hidden">
              <p className="truncate text-xs font-bold text-white">{userProfile.fullName}</p>
              <p className="truncate text-[10px] font-semibold text-zinc-400 capitalize">
                {userProfile.shift} Shift
              </p>
            </div>
          </div>


          <button 
            onClick={handleLogout}
            className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-700/60 bg-transparent py-2 text-xs font-bold text-zinc-400 hover:bg-white/5 hover:text-white transition-colors cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        
        {/* HEADER NAVBAR: Desktop Searchbar & Right Side Notification, Message, User Icon */}
        <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-[#E5E7EB]/60 bg-white px-4 sm:px-6 dark:border-zinc-800 dark:bg-[#0A2E5C] relative z-30 shadow-xs">
          
          {/* Mobile Hamburger Menu + Brand Logo */}
          <div className="lg:hidden flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 text-[#0A2E5C] dark:text-[#FFC107] border border-zinc-200/80 dark:border-zinc-700/60 transition cursor-pointer shrink-0 shadow-xs active:scale-95"
              aria-label="Open Navigation Sidebar Menu"
              title="Open Navigation Menu"
            >
              <Menu className="h-5 w-5 stroke-[2.2]" />
            </button>
            <BrandLogo variant="navbar" size="h15" href="/student" />
          </div>

          {/* Desktop Searchbar with Integrated QR Attendance Scanner (Hidden on Mobile, Shifted Down) */}
          <div className="hidden lg:flex items-center gap-3 flex-1 max-w-md sm:max-w-lg">
            <div className="relative w-full flex items-center">
              <Search className="absolute left-3.5 h-4 w-4 text-zinc-400 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search exams, results, tasks..."
                className="w-full h-10 pl-9.5 pr-26 sm:pr-28 rounded-xl bg-[#F4F1EA]/70 dark:bg-zinc-800/80 border border-[#E5E7EB]/70 dark:border-zinc-700 text-xs sm:text-sm text-[#0A2E5C] dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#0B5ED7]/30 focus:border-[#0B5ED7] transition-all shadow-2xs"
              />
              <button
                type="button"
                onClick={handleOpenScanner}
                className="absolute right-1.5 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-linear-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-[11px] font-bold shadow-xs transition-all active:scale-95 cursor-pointer"
                title="Scan Desk QR for Attendance Check-In"
              >
                <QrCode className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Scan QR</span>
              </button>
            </div>
          </div>

          {/* Right Side: Notification Icon, Message Icon, User Avatar Icon */}
          <div className="flex items-center gap-2 sm:gap-3">

            {/* 1. Notifications Dropdown (Replaces News in topbar) */}
            <div className="relative" ref={notifRef}>
              <button 
                onClick={() => setNotificationsOpen(!notificationsOpen)}
                className={`relative flex h-9 w-9 items-center justify-center rounded-xl bg-[#F8FAFC] dark:bg-zinc-800 text-zinc-600 hover:text-[#0A2E5C] dark:text-zinc-300 dark:hover:text-white transition cursor-pointer ${
                  notificationsOpen ? "border border-[#FFC107] text-[#0B5ED7] dark:text-[#FFC107]" : ""
                }`}
                title="Library Notifications & Announcements"
                aria-label="Notifications"
              >
                <Bell className="h-4 w-4" />
                {notifications.some(n => n.unread) ? (
                  <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[8px] font-black text-white shadow-xs animate-pulse">
                    {notifications.filter(n => n.unread).length}
                  </span>
                ) : (
                  <span className="absolute top-1.5 right-1.5 flex h-1.5 w-1.5 rounded-full bg-zinc-300 dark:bg-zinc-600" />
                )}
              </button>

              {/* Notifications Dropdown Modal */}
              {notificationsOpen && (
                <div className="fixed inset-x-3 top-16 sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-96 rounded-3xl border border-[#E5E7EB] bg-white p-4 shadow-2xl dark:border-zinc-800 dark:bg-[#0A2E5C] z-[100] animate-slideUp max-w-sm sm:max-w-none mx-auto sm:mx-0 max-h-[85vh] flex flex-col">
                  <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800 shrink-0">
                    <div className="flex items-center gap-2">
                      <Bell className="h-4 w-4 text-[#0B5ED7] dark:text-[#FFC107]" />
                      <h3 className="text-xs font-black text-[#0A2E5C] dark:text-white">
                        Notifications & Alerts
                      </h3>
                      {notifications.some(n => n.unread) && (
                        <span className="rounded-full bg-rose-500 px-1.5 py-0.2 text-[9px] font-black text-white">
                          {notifications.filter(n => n.unread).length} new
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {notifications.some(n => n.unread) && (
                        <button
                          onClick={handleMarkAllStudentRead}
                          className="text-[10px] font-bold text-[#0B5ED7] dark:text-[#FFC107] hover:underline cursor-pointer"
                        >
                          Mark all read
                        </button>
                      )}
                      {notifications.length > 0 && (
                        <button
                          onClick={handleClearAllStudentNotifications}
                          className="text-[10px] font-bold text-zinc-400 hover:text-rose-600 hover:underline cursor-pointer"
                        >
                          Clear all
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Enable Native OS/PWA Popups Banner if not yet granted */}
                  {notificationPermission !== "granted" && (
                    <div className="mt-2.5 mb-1 p-2.5 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 flex items-center justify-between gap-2 shrink-0">
                      <div className="text-[11px] text-amber-900 dark:text-amber-200 leading-tight">
                        <span className="font-bold">Turn on Native Popups</span>
                        <p className="text-[10px] text-amber-700 dark:text-amber-400">Get exam releases & broadcast popup alerts</p>
                      </div>
                      <button
                        onClick={handleEnableStudentPush}
                        className="px-2.5 py-1 text-[10px] font-bold rounded-xl bg-[#0A2E5C] text-[#FFC107] hover:bg-black transition active:scale-95 cursor-pointer shrink-0"
                      >
                        Enable
                      </button>
                    </div>
                  )}

                  <div className="mt-3 flex-1 overflow-y-auto space-y-2 pr-1 max-h-72">
                    {notifications.length === 0 ? (
                      <div className="py-6 text-center text-xs text-zinc-400">
                        No notifications at this time.
                      </div>
                    ) : (
                      notifications.slice(0, 8).map((notif) => (
                        <div
                          key={notif.id}
                          onClick={() => handleStudentNotificationClick(notif)}
                          className={`p-2.5 rounded-2xl transition cursor-pointer text-xs group relative ${
                            notif.unread
                              ? "bg-[#F4F1EA] dark:bg-zinc-800/80 border border-[#E5E7EB]/70 dark:border-zinc-700"
                              : "hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-1">
                            <h4 className="font-bold text-[#0A2E5C] dark:text-white leading-tight flex-1 pr-1">
                              {notif.title}
                            </h4>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="text-[9px] text-zinc-400 whitespace-nowrap">{notif.time}</span>
                              <button
                                type="button"
                                onClick={(e) => handleDeleteStudentNotification(e, notif.id)}
                                className="opacity-70 sm:opacity-0 sm:group-hover:opacity-100 p-0.5 text-zinc-400 hover:text-rose-600 transition cursor-pointer"
                                title="Delete Notification"
                                aria-label="Delete Notification"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 line-clamp-2">
                            {notif.desc}
                          </p>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="mt-3 pt-2 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between text-[11px]">
                    <Link
                      href="/student/messages"
                      onClick={() => setNotificationsOpen(false)}
                      className="text-xs font-bold text-[#0B5ED7] dark:text-[#FFC107] hover:underline"
                    >
                      All Messages
                    </Link>
                    {notifications.length > 0 && (
                      <button
                        onClick={handleClearAllStudentNotifications}
                        className="text-[10px] font-bold text-rose-500 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300 hover:underline cursor-pointer"
                      >
                        Clear All
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* 2. Messages & Notifications */}
            <Link 
              href="/student/messages"
              className={`relative flex h-9 w-9 items-center justify-center rounded-xl bg-[#F8FAFC] dark:bg-zinc-800 text-zinc-600 hover:text-[#0A2E5C] dark:text-zinc-300 dark:hover:text-white transition ${
                pathname.startsWith("/student/messages") ? "border border-[#FFC107] text-[#0B5ED7] dark:text-[#FFC107]" : ""
              }`}
              title="Messages & Chat"
            >
              <MessageSquare className="h-4 w-4" />
            </Link>

            {/* 3. User Avatar Button: Opens Slide-Over Profile Sidebar */}
            <button 
              onClick={() => setUserSidebarOpen(true)}
              className="flex items-center gap-1.5 sm:gap-2 rounded-xl p-1 hover:bg-[#F8FAFC] dark:hover:bg-zinc-800 transition cursor-pointer"
              title="Open Student Profile & Pass"
              aria-label="Open Student Profile & Pass"
            >
              {userProfile.avatarUrl ? (
                <img 
                  src={userProfile.avatarUrl} 
                  alt={userProfile.fullName}
                  className="h-8 w-8 rounded-full object-cover border-2 border-[#FFC107] shadow-xs"
                />
              ) : (
                <div className="h-8 w-8 rounded-full bg-[#0A2E5C] text-[#FFC107] border border-[#FFC107]/40 flex items-center justify-center text-xs font-black shadow-xs">
                  {getInitials(userProfile.fullName)}
                </div>
              )}
              <ChevronDown className="h-3.5 w-3.5 text-zinc-400 hidden sm:block" />
            </button>

          </div>
        </header>

        {/* Page Content area: Mobile Search Bar is placed inside main so it scrolls naturally with content */}
        <main className="flex-1 overflow-y-auto pb-24 lg:pb-8">
          {/* Mobile Shifted Search Bar with QR Scanner Icon (Scrolls naturally with page content) */}
          <div className="lg:hidden border-b border-[#E5E7EB]/60 bg-white/95 dark:bg-[#0A2E5C]/95 backdrop-blur-md px-3 py-2 shadow-2xs mb-2">
            <div className="flex items-center gap-2 max-w-md mx-auto">
              {/* Search Input with Placeholder */}
              <div className="relative flex-1 flex items-center">
                <Search className="absolute left-3 h-4 w-4 text-zinc-400 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="Search records, exam results, tasks..."
                  className="w-full h-9 pl-9 pr-3 rounded-xl bg-[#F4F1EA]/80 dark:bg-zinc-800/80 border border-[#E5E7EB]/70 dark:border-zinc-700 text-xs text-[#0A2E5C] dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#0B5ED7]/30 focus:border-[#0B5ED7] transition-all shadow-2xs"
                />
              </div>

              {/* QR Scanner Icon Button */}
              <button
                type="button"
                onClick={handleOpenScanner}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-linear-to-tr from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-md shadow-emerald-600/25 active:scale-95 transition-transform cursor-pointer shrink-0"
                title="Scan Desk QR for Attendance Check-In"
                aria-label="Scan Desk QR for Attendance Check-In"
              >
                <QrCode className="h-4 w-4 stroke-[2.5]" />
              </button>
            </div>
          </div>

          <div className="p-4 sm:p-6 lg:p-8 pt-2 sm:pt-4 lg:pt-8">
            {children}
          </div>
        </main>

        {/* MOBILE VIEW FIXED BOTTOM BAR MENU: Dashboard, Attendance, Fees, Books, Tasks */}
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 dark:bg-[#0A2E5C]/95 backdrop-blur-md border-t border-[#E5E7EB]/70 dark:border-zinc-800 py-1 px-1.5 shadow-[0_-6px_20px_rgba(0,0,0,0.06)] pb-[calc(0.25rem+env(safe-area-inset-bottom))]">
          <nav className="flex items-center justify-around max-w-md mx-auto">
            {MOBILE_BOTTOM_NAV.map((item) => {
              const active = isNavActive(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex flex-col items-center justify-center gap-0.5 group active:scale-90 transition-transform select-none py-0.5 px-2 cursor-pointer focus:outline-none"
                >
                  <div className={`
                    flex h-8 w-8 items-center justify-center rounded-xl transition-all duration-200 shadow-xs
                    ${active
                      ? "bg-linear-to-tr from-[#0B5ED7] to-[#FFC107] text-[#0A2E5C] shadow-sm shadow-[#0B5ED7]/30 scale-105"
                      : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 group-hover:bg-[#FFC107]/20 group-hover:text-[#0B5ED7]"
                    }
                  `}>
                    <Icon className={`h-4 w-4 ${active ? "text-[#0A2E5C] stroke-[2.5]" : ""}`} />
                  </div>
                  <span className={`text-[10px] tracking-tight ${active ? "font-bold text-[#0B5ED7] dark:text-[#FFC107]" : "font-medium text-zinc-500 dark:text-zinc-400"}`}>
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </nav>
        </div>

      </div>

      {/* Mobile Student Navigation Drawer Overlay */}
      {mobileNavOpen && (
        <div 
          className="fixed inset-0 z-50 bg-[#0A2E5C]/80 backdrop-blur-sm lg:hidden transition-opacity"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      {/* Mobile Student Navigation Drawer Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-[60] flex w-64 flex-col bg-[#0A2E5C] text-white transition-transform duration-300 ease-in-out lg:hidden border-r border-zinc-800/80 shadow-2xl
        ${mobileNavOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Drawer Header */}
        <div className="flex h-16 items-center px-5 border-b border-zinc-800/60 justify-between">
          <BrandLogo variant="navbar" size="md" href="/student" darkBackground />
          <button 
            type="button"
            onClick={() => setMobileNavOpen(false)}
            className="p-1.5 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
            aria-label="Close Navigation Menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Student Nav Links */}
        <div className="flex-1 overflow-y-auto px-4 py-6 scrollbar-none space-y-1.5">
          <p className="px-3 text-[10px] font-black uppercase tracking-wider text-[#FFC107] mb-2">
            Student Menu
          </p>
          {NAV_ITEMS.map((item) => {
            const active = isNavActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileNavOpen(false)}
                className={`flex items-center gap-3 rounded-xl px-4 py-3 text-xs font-bold transition-all ${
                  active 
                    ? "bg-[#141A24] text-[#FFC107] border border-[#FFC107]/40 shadow-sm font-black" 
                    : "text-zinc-400 hover:bg-white/5 hover:text-white"
                }`}
              >
                <item.icon className={`h-4 w-4 ${active ? "text-[#FFC107]" : "text-zinc-400"}`} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>

        {/* Bottom User profile card + Logout */}
        <div className="border-t border-zinc-800/80 p-4 space-y-2 bg-[#111620]">
          <button
            type="button"
            onClick={() => {
              setMobileNavOpen(false);
              setUserSidebarOpen(true);
            }}
            className="w-full flex items-center gap-3 p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-left transition cursor-pointer"
          >
            <div className="h-9 w-9 rounded-full bg-[#0A2E5C] border border-[#FFC107]/50 flex items-center justify-center text-[#FFC107] font-black text-xs shrink-0">
              {getInitials(userProfile.fullName)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-white truncate">{userProfile.fullName}</p>
              <p className="text-[10px] text-zinc-400">View ID Pass & Profile →</p>
            </div>
          </button>


          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-rose-400 hover:bg-rose-500/10 rounded-xl transition cursor-pointer"
          >
            <LogOut className="h-4 w-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Slide-Over User Profile & Pass Sidebar Drawer */}
      {userSidebarOpen && (
        <div className="fixed inset-0 z-50 flex justify-end animate-fadeIn">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={() => setUserSidebarOpen(false)}
          />

          {/* Drawer Panel */}
          <div className="relative z-10 w-full max-w-sm sm:max-w-md bg-white dark:bg-[#0A2E5C] shadow-2xl border-l border-[#E5E7EB]/70 dark:border-zinc-800 flex flex-col h-full animate-slideLeft">
            
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 dark:border-zinc-800 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-xl bg-[#FFC107]/20 text-[#0B5ED7] dark:text-[#FFC107] flex items-center justify-center">
                  <User className="h-4.5 w-4.5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-[#0A2E5C] dark:text-white">Student Account</h3>
                  <p className="text-[10px] text-zinc-400">{BRAND_CONFIG.fullName}</p>
                </div>
              </div>
              <button
                onClick={() => setUserSidebarOpen(false)}
                className="p-1.5 rounded-xl text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
                aria-label="Close Sidebar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5 scrollbar-thin">
              
              {/* 1. FIRST GRID: COMPACT USER PROFILE WITH DROPDOWN */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-black uppercase tracking-wider text-[#0B5ED7] dark:text-[#FFC107] flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5" /> Student Profile
                  </p>
                  <button
                    type="button"
                    onClick={() => setProfileDetailsOpen(!profileDetailsOpen)}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-[#0B5ED7] dark:text-[#FFC107] hover:text-[#7D5F46] dark:hover:text-[#E5E7EB] transition cursor-pointer"
                  >
                    <span>{profileDetailsOpen ? "Hide Details" : "View Details"}</span>
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${profileDetailsOpen ? "rotate-180" : ""}`} />
                  </button>
                </div>

                {/* Profile Card with Avatar, Info & Dropdown Details */}
                <div className="p-3.5 rounded-2xl bg-[#F4F1EA]/70 dark:bg-zinc-800/60 border border-[#E5E7EB]/60 dark:border-zinc-700 shadow-2xs">
                  <div className="flex items-center gap-3">
                    <div className="relative shrink-0">
                      <div className="h-13 w-13 rounded-2xl p-0.5 bg-gradient-to-br from-[#0B5ED7] via-[#FFC107] to-[#7D5F46] shadow-sm">
                        {userProfile.avatarUrl ? (
                          <img
                            src={userProfile.avatarUrl}
                            alt={userProfile.fullName}
                            className="h-full w-full rounded-[14px] object-cover bg-white dark:bg-zinc-800"
                          />
                        ) : (
                          <div className="h-full w-full rounded-[14px] bg-[#0A2E5C] text-[#FFC107] flex items-center justify-center text-base font-black">
                            {getInitials(userProfile.fullName)}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => avatarModalInputRef.current?.click()}
                        disabled={isUploadingModalAvatar}
                        className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-[#0A2E5C] text-[#FFC107] border border-white dark:border-zinc-800 flex items-center justify-center shadow hover:scale-110 active:scale-95 transition-all cursor-pointer"
                        title="Upload Photo"
                      >
                        {isUploadingModalAvatar ? (
                          <span className="animate-spin text-[7px]">⏳</span>
                        ) : (
                          <Camera className="h-2.5 w-2.5" />
                        )}
                      </button>
                      <input
                        ref={avatarModalInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleModalAvatarUpload}
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <h4 className="text-sm font-black text-[#0A2E5C] dark:text-white truncate">
                          {userProfile.fullName}
                        </h4>
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 text-[9px] font-bold text-emerald-800 dark:text-emerald-300 shrink-0">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          ACTIVE
                        </span>
                      </div>
                      <p className="text-[11px] text-[#0B5ED7] dark:text-[#FFC107] font-bold mt-0.5">
                        ID: {userProfile.studentCode || "SDL-2026-001"}
                      </p>
                      <p className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate">
                        {userProfile.email || "student@genius.edu"}
                      </p>
                    </div>
                  </div>

                  {/* Dropdown Profile Details List */}
                  {profileDetailsOpen && (
                    <div className="grid grid-cols-2 gap-2 text-[11px] pt-3 mt-3 border-t border-[#E5E7EB]/60 dark:border-zinc-700/60">
                      <div className="p-2 rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-700">
                        <span className="text-[9px] font-bold text-zinc-400 uppercase block">Course</span>
                        <strong className="text-[#0A2E5C] dark:text-zinc-200 truncate block mt-0.5">{userProfile.course || "Competitive Exams"}</strong>
                      </div>

                      <div className="p-2 rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-700">
                        <span className="text-[9px] font-bold text-zinc-400 uppercase block">Shift</span>
                        <strong className="text-[#0B5ED7] dark:text-[#FFC107] truncate block mt-0.5">{userProfile.shift || "Morning"} Shift</strong>
                      </div>

                      <div className="p-2 rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-700">
                        <span className="text-[9px] font-bold text-zinc-400 uppercase block">Desk / Seat</span>
                        <strong className="text-purple-600 dark:text-purple-400 font-mono block mt-0.5">{userProfile.seatNumber ? `#${userProfile.seatNumber}` : "Flexible Desk"}</strong>
                      </div>

                      <div className="p-2 rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-700">
                        <span className="text-[9px] font-bold text-zinc-400 uppercase block">Phone</span>
                        <strong className="text-zinc-700 dark:text-zinc-300 truncate block mt-0.5">{userProfile.phone || "Not set"}</strong>
                      </div>

                      <div className="p-2 rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-700 col-span-2">
                        <span className="text-[9px] font-bold text-zinc-400 uppercase block">Guardian / Parent</span>
                        <strong className="text-zinc-700 dark:text-zinc-300 block mt-0.5">{userProfile.parentName || "N/A"} {userProfile.parentPhone ? `(${userProfile.parentPhone})` : ""}</strong>
                      </div>

                      <div className="p-2 rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-700 col-span-2">
                        <span className="text-[9px] font-bold text-zinc-400 uppercase block">Address</span>
                        <strong className="text-zinc-700 dark:text-zinc-300 block mt-0.5">{userProfile.address || "Madhupur, Sonbhadra"}</strong>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* 2. SECOND SECTION: DIGITAL PASS ID (UPGRADED VERTICAL SMART CARD) */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-black uppercase tracking-wider text-[#0B5ED7] dark:text-[#FFC107] flex items-center gap-1.5">
                    <QrCode className="h-3.5 w-3.5" /> Digital Pass ID
                  </p>
                  <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/60 px-2 py-0.5 rounded-full">
                    Official Pass
                  </span>
                </div>

                {/* Vertical Smart Digital ID Card */}
                <div className="rounded-3xl border border-[#FFC107]/40 bg-gradient-to-b from-[#0A2E5C] via-[#161C26] to-[#0E131B] p-5 text-white shadow-xl relative overflow-hidden text-center flex flex-col items-center">
                  {/* Decorative ambient background glows */}
                  <div className="absolute -top-16 left-1/2 -translate-x-1/2 w-48 h-48 bg-[#FFC107]/10 rounded-full blur-2xl pointer-events-none" />
                  <div className="absolute -bottom-16 left-1/2 -translate-x-1/2 w-48 h-48 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />

                  {/* Pass Header */}
                  <div className="relative z-10 w-full pb-3 border-b border-white/10 flex flex-col items-center gap-0.5">
                    <p className="text-[8px] font-black tracking-[0.25em] text-[#FFC107] uppercase">
                      THE GENIUS DIGITAL LIBRARY
                    </p>
                    <span className="text-[9px] font-medium tracking-wide text-zinc-400">
                      Digital Student Access Pass
                    </span>
                  </div>

                  {/* Student Details Stack */}
                  <div className="relative z-10 mt-3.5 flex flex-col items-center">
                    <h5 className="text-base font-black text-white tracking-tight">
                      {userProfile.fullName}
                    </h5>

                    <div className="flex items-center justify-center gap-1.5 flex-wrap mt-1">
                      <span className="px-2 py-0.5 rounded-md bg-[#FFC107]/20 text-[#FFC107] text-[10px] font-bold border border-[#FFC107]/30">
                        ID: {userProfile.studentCode || "SDL-2026-001"}
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300 text-[10px] font-bold border border-purple-500/30 font-mono">
                        {userProfile.seatNumber ? `Desk #${userProfile.seatNumber}` : "Flexi Desk"}
                      </span>
                    </div>

                    <p className="text-[11px] text-zinc-300 mt-1 font-medium">
                      {userProfile.shift || "Morning"} Shift • {userProfile.course || "Competitive Exams"}
                    </p>
                  </div>

                  {/* Vertical Scannable QR Code */}
                  <div className="relative z-10 my-3.5">
                    <div className="bg-white p-3 rounded-2xl shadow-xl border-2 border-[#FFC107]/40 inline-block transition-transform hover:scale-102">
                      {qrPassUrl ? (
                        <img
                          src={qrPassUrl}
                          alt="Digital Pass QR"
                          className="h-44 w-44 object-contain rounded-lg"
                        />
                      ) : (
                        <div className="h-44 w-44 flex flex-col items-center justify-center bg-zinc-100 rounded-lg text-zinc-400">
                          <QrCode className="h-10 w-10 animate-pulse mb-2 text-zinc-400" />
                          <span className="text-[10px] font-medium">Generating Pass...</span>
                        </div>
                      )}
                    </div>
                    <p className="text-[9.5px] text-zinc-400 mt-2 font-medium tracking-wide">
                      Scan at library gate & desk terminal
                    </p>
                  </div>

                  {/* Validity Status & Save QR Button */}
                  <div className="relative z-10 w-full pt-3 border-t border-white/10 flex flex-col gap-2.5">
                    <div className="flex items-center justify-between px-1 text-[10px]">
                      <span className="text-zinc-400">Validity:</span>
                      <span className="text-emerald-400 font-bold flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                        Active (Verified Member)
                      </span>
                    </div>

                    {qrPassUrl && (
                      <a
                        href={qrPassUrl}
                        download={`Genius-Library-Pass-${userProfile.fullName.replace(/\s+/g, "_")}.png`}
                        className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-xl bg-gradient-to-r from-[#0B5ED7] to-[#FFC107] hover:from-[#846349] hover:to-[#AF9476] text-[#0A2E5C] text-xs font-black shadow-md transition-all active:scale-98 cursor-pointer"
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span>Save Digital Pass QR</span>
                      </a>
                    )}
                  </div>
                </div>
              </div>

              {/* 3. THIRD SECTION: SETTINGS */}
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-[#0B5ED7] dark:text-[#FFC107] mb-2 flex items-center gap-1.5">
                  <Settings className="h-3.5 w-3.5" /> Settings & Security
                </p>

                <div className="space-y-1 rounded-2xl bg-[#F4F1EA]/60 dark:bg-zinc-800/40 p-2 border border-[#E5E7EB]/60 dark:border-zinc-700/60">
                  <Link
                    href="/update-password"
                    onClick={() => setUserSidebarOpen(false)}
                    className="flex items-center justify-between px-3 py-2 text-xs font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-white dark:hover:bg-zinc-800 rounded-xl transition"
                  >
                    <span className="flex items-center gap-2">
                      <KeyRound className="h-3.5 w-3.5 text-blue-500" />
                      Change Password & Security
                    </span>
                    <span className="text-[10px] text-zinc-400">→</span>
                  </Link>


                  <Link
                    href="/student/messages"
                    onClick={() => setUserSidebarOpen(false)}
                    className="flex items-center justify-between px-3 py-2 text-xs font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-white dark:hover:bg-zinc-800 rounded-xl transition"
                  >
                    <span className="flex items-center gap-2">
                      <MessageSquare className="h-3.5 w-3.5 text-amber-500" />
                      Notices & Announcements
                    </span>
                    <span className="text-[10px] text-zinc-400">→</span>
                  </Link>
                </div>
              </div>

              {/* 4. FOURTH SECTION: SIGN OUT */}
              <div className="pt-2">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-sm transition active:scale-95 cursor-pointer"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Sign Out</span>
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Global Camera Scanner Modal (Accessible across ALL student pages) */}
      <LiveAttendanceCameraModal
        isOpen={isGlobalScannerOpen}
        onClose={() => setIsGlobalScannerOpen(false)}
        studentId={userProfile.id || ""}
        studentName={userProfile.fullName || "Student"}
        shiftName={userProfile.shift || "Morning Shift"}
        defaultSeat={userProfile.seatNumber || ""}
        onSuccess={() => {
          setIsGlobalScannerOpen(false);
          window.dispatchEvent(new CustomEvent("attendance_updated"));
        }}
      />

      {/* Live In-App Native-Style Popup Alert Card */}
      {livePopupAlert && (
        <aside
          aria-label="Live Notification Alert"
          className="fixed top-4 right-4 sm:top-6 sm:right-6 z-[999] max-w-sm sm:max-w-md w-[calc(100%-2rem)] animate-slideDown shadow-2xl"
        >
          <div className="flex items-start gap-3 p-4 rounded-2xl bg-[#0A2E5C] text-white border-2 border-[#FFC107] ring-4 ring-black/20 backdrop-blur-md">
            <div className="h-10 w-10 rounded-xl bg-[#FFC107]/20 border border-[#FFC107]/50 flex items-center justify-center shrink-0 text-[#FFC107]">
              {livePopupAlert.type === "exam" || livePopupAlert.type === "exam_result" ? (
                <Award className="h-5 w-5" />
              ) : (
                <Bell className="h-5 w-5" />
              )}
            </div>
            <div className="flex-1 min-w-0 pr-1">
              <h4 className="text-xs sm:text-sm font-bold text-white line-clamp-1">
                {livePopupAlert.title}
              </h4>
              <p className="text-[11px] sm:text-xs text-zinc-200 mt-0.5 line-clamp-2">
                {livePopupAlert.body}
              </p>
              <div className="mt-2.5 flex items-center flex-wrap gap-2">
                {livePopupAlert.type === "exam" && livePopupAlert.examId ? (
                  <>
                    <button
                      disabled={enrollSubmitting}
                      onClick={async () => {
                        if (!livePopupAlert.examId) return;
                        setEnrollSubmitting(true);
                        try {
                          await enrollStudentInExam({
                            id: `enroll_${livePopupAlert.examId}_${userProfile.id || currentStudentId || "student"}`,
                            examId: livePopupAlert.examId,
                            examTitle: livePopupAlert.examTitle || livePopupAlert.title.replace(/^📝\s*(New Exam:\s*)?/i, ""),
                            studentId: userProfile.id || currentStudentId || "student",
                            studentName: userProfile.fullName || "Student Member",
                            studentEmail: userProfile.email || currentStudentEmail || "",
                            studentCode: userProfile.studentCode || undefined,
                            seatNumber: userProfile.seatNumber || undefined,
                          });
                          setLivePopupAlert(null);
                          setEnrolledToast(`✓ Enrolled successfully in ${livePopupAlert.examTitle || "the exam"}! Best of luck.`);
                          setTimeout(() => setEnrolledToast(null), 5000);
                        } catch (err) {
                          console.error(err);
                        } finally {
                          setEnrollSubmitting(false);
                        }
                      }}
                      className="px-3 py-1 text-[11px] font-black rounded-lg bg-emerald-400 text-emerald-950 hover:bg-emerald-300 transition active:scale-95 cursor-pointer shadow-xs disabled:opacity-50 flex items-center gap-1"
                    >
                      <CheckCircle className="h-3 w-3" />
                      <span>{enrollSubmitting ? "Enrolling..." : "Yes, Enroll Now"}</span>
                    </button>
                    <button
                      onClick={() => setLivePopupAlert(null)}
                      className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-white/10 text-zinc-200 hover:text-white hover:bg-white/20 transition cursor-pointer"
                    >
                      No, Skip
                    </button>
                    <button
                      onClick={() => {
                        const target = livePopupAlert.url;
                        setLivePopupAlert(null);
                        if (target) router.push(target);
                      }}
                      className="px-2.5 py-1 text-[11px] font-medium text-amber-300 hover:text-amber-200 underline transition cursor-pointer"
                    >
                      Details
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        const target = livePopupAlert.url;
                        setLivePopupAlert(null);
                        if (target) router.push(target);
                      }}
                      className="px-3 py-1 text-[11px] font-bold rounded-lg bg-[#FFC107] text-[#0A2E5C] hover:bg-amber-300 transition active:scale-95 cursor-pointer"
                    >
                      View Details
                    </button>
                    <button
                      onClick={() => setLivePopupAlert(null)}
                      className="px-2.5 py-1 text-[11px] font-medium text-zinc-300 hover:text-white transition cursor-pointer"
                    >
                      Dismiss
                    </button>
                  </>
                )}
              </div>
            </div>
            <button
              onClick={() => setLivePopupAlert(null)}
              className="text-zinc-400 hover:text-white transition p-1 cursor-pointer shrink-0"
              aria-label="Close alert"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </aside>
      )}

      {/* 1-Tap Enrollment Confirmation Toast */}
      {enrolledToast && (
        <aside
          aria-label="Enrollment Confirmation"
          className="fixed top-4 right-4 sm:top-6 sm:right-6 z-[999] max-w-sm w-[calc(100%-2rem)] animate-slideDown shadow-2xl"
        >
          <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-emerald-800 text-white border-2 border-emerald-400 ring-4 ring-black/20 shadow-xl">
            <div className="h-8 w-8 rounded-xl bg-emerald-700 border border-emerald-400/50 flex items-center justify-center shrink-0">
              <CheckCircle className="h-5 w-5 text-emerald-200" />
            </div>
            <p className="text-xs font-bold flex-1 leading-snug">{enrolledToast}</p>
            <button
              onClick={() => setEnrolledToast(null)}
              className="text-white/70 hover:text-white p-1 cursor-pointer shrink-0"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </aside>
      )}

      {/* Quick Permission Prompt Banner (if permission not granted and not dismissed) */}
      {notificationPermission !== "granted" && !dismissedPermPrompt && (
        <aside
          aria-label="Notification Permission"
          className="fixed bottom-16 sm:bottom-4 left-4 right-4 sm:left-auto sm:right-4 z-40 max-w-sm rounded-2xl bg-[#0A2E5C] text-white p-3 shadow-xl border border-[#FFC107]/50 flex items-center justify-between gap-3 animate-slideUp"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-8 w-8 rounded-xl bg-[#FFC107]/20 border border-[#FFC107]/40 flex items-center justify-center shrink-0 text-[#FFC107]">
              <Bell className="h-4 w-4" />
            </div>
            <div className="text-[11px] leading-tight min-w-0">
              <p className="font-bold text-white truncate">Enable Native Alerts</p>
              <p className="text-[10px] text-zinc-300 truncate">Get instant exam & notice popups</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={handleEnableStudentPush}
              className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-[#FFC107] text-[#0A2E5C] hover:bg-amber-300 transition active:scale-95 cursor-pointer"
            >
              Turn On
            </button>
            <button
              onClick={() => {
                setDismissedPermPrompt(true);
                try {
                  sessionStorage.setItem("genius_notif_prompt_dismissed", "1");
                } catch {}
              }}
              className="p-1 text-zinc-400 hover:text-white transition cursor-pointer"
              aria-label="Dismiss banner"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </aside>
      )}

    </div>
  );
}
