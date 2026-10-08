"use client";

/**
 * [WEB • PAGE] Admin Dashboard Shell
 *
 * Sidebar navigation + role guard (only admins/master admin pass),
 * brand header from BRAND_CONFIG.
 */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { 
  LayoutGrid, 
  Users, 
  UserCheck, 
  Award,
  Armchair, 
  MessageSquare, 
  Receipt, 
  FileText, 
  BarChart2, 
  UserCog, 
  Settings, 
  LogOut, 
  Bell, 
  Search, 
  ChevronDown, 
  Menu, 
  X,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  QrCode
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { BrandLogo } from "@/components/BrandLogo";
import { AdminStudentQrScannerModal } from "@/components/AdminStudentQrScannerModal";
import { 
  getNotifications, 
  getMessages,
  markNotificationAsRead, 
  markAllNotificationsAsRead,
  clearAllNotifications, 
  NotificationRecord 
} from "@/lib/api";
import { 
  requestNotificationPermission, 
  getNotificationPermission, 
  triggerNativeNotification, 
  subscribeToNotificationBroadcast 
} from "@/lib/pushNotify";
import { recordUserActivity, checkInactivityExpiry, clearInactivityTracking, getSavedUserRole, saveUserRole } from "@/lib/authInactivity";
import { BRAND_CONFIG, isMasterAdminEmail } from "@/lib/config";

function WhatsAppIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
    </svg>
  );
}

const SIDEBAR_SECTIONS = [
  {
    group: "",
    items: [
      { label: "Dashboard", href: "/admin", icon: LayoutGrid },
    ]
  },
  {
    group: "LIBRARY MANAGEMENT",
    items: [
      { label: "Students", href: "/admin/students", icon: Users },
      { label: "Attendance", href: "/admin/attendance", icon: UserCheck },
      { label: "Exam Results", href: "/admin/results", icon: Award },
      { label: "Seats", href: "/admin/seats", icon: Armchair },
      { label: "Messages", href: "/admin/messages", icon: MessageSquare },
      { label: "WhatsApp Bot", href: "/admin/whatsapp", icon: WhatsAppIcon },
    ]
  },
  {
    group: "REPORTS & ANALYTICS",
    items: [
      { label: "Fees & Expenses Management", href: "/admin/fees", icon: Receipt },
      { label: "Reports", href: "/admin/reports", icon: FileText },
      { label: "Analytics", href: "/admin/analytics", icon: BarChart2 },
    ]
  },
  {
    group: "SETTINGS",
    items: [
      { label: "Staff", href: "/admin/staff", icon: UserCog },
      { label: "Settings", href: "/admin/settings", icon: Settings },
    ]
  }
];

const MOBILE_BOTTOM_NAV = [
  { label: "Dashboard", href: "/admin", icon: LayoutGrid },
  { label: "Students", href: "/admin/students", icon: Users },
  { label: "Seats", href: "/admin/seats", icon: Armchair },
  { label: "Attendance", href: "/admin/attendance", icon: UserCheck },
  { label: "Fees", href: "/admin/fees", icon: Receipt },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifDropdownOpen, setNotifDropdownOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [qrScannerOpen, setQrScannerOpen] = useState(false);

  // Auto-close mobile drawer on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  // Auto-close on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileMenuOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const notifRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Helper to extract first letters for avatar fallback
  const getInitials = (name: string): string => {
    if (!name) return "A";
    const cleaned = name.trim().replace(/[^a-zA-Z0-9\s]/g, "");
    const parts = cleaned.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return (cleaned.slice(0, 2) || "A").toUpperCase();
  };

  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [adminUser, setAdminUser] = useState({
    name: "Admin",
    role: "Library Admin",
    email: BRAND_CONFIG.adminEmail,
    avatarUrl: "",
  });

  const authCheckedRef = useRef(false);

  // Auth & Admin Role Check - Checked once on layout mount, not on every page transition
  useEffect(() => {
    if (authCheckedRef.current) return;
    async function checkAuth() {
      authCheckedRef.current = true;

      recordUserActivity();

      const supabase = createClient();
      // Fast check: get local cached session (<1ms)
      const { data: { session } } = await supabase.auth.getSession();
      let user = session?.user;

      if (!user) {
        const { data: { user: authUser }, error } = await supabase.auth.getUser();
        if (error || !authUser) {
          clearInactivityTracking();
          router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
          return;
        }
        user = authUser;
      }

      const role = user.user_metadata?.role;
      const isAdmin = isMasterAdminEmail(user.email) || role === "admin";

      if (!isAdmin) {
        if (role === "staff") {
          router.replace("/staff");
        } else {
          router.replace("/student");
        }
        return;
      }

      // Valid admin confirmed: unlock immediately and cache role
      saveUserRole("admin");
      setIsCheckingAuth(false);

      const meta = user.user_metadata || {};
      let avatarUrl = meta.avatar_url || meta.picture || "";
      let adminName = meta.full_name || meta.name || user.email?.split("@")[0] || "Library Admin";

      setAdminUser((prev) => ({
        ...prev,
        name: adminName,
        email: user.email || BRAND_CONFIG.adminEmail,
        avatarUrl: avatarUrl || prev.avatarUrl,
      }));

      // Background: load custom uploaded avatar from profiles if present without blocking layout
      Promise.resolve(
        supabase
          .from("profiles")
          .select("avatar_url, full_name")
          .eq("id", user.id)
          .maybeSingle()
      ).then(({ data: profile }: any) => {
        if (profile) {
          setAdminUser((prev) => ({
            ...prev,
            name: profile.full_name || prev.name,
            avatarUrl: profile.avatar_url || prev.avatarUrl,
          }));
        }
      }).catch(() => {});
    }

    checkAuth();
  }, [router]);

  // Dynamic Notifications State & Sync
  const [adminNotifications, setAdminNotifications] = useState<NotificationRecord[]>([]);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState<number>(0);
  const [notificationPermission, setNotificationPermission] = useState<string>("default");

  const loadAdminNotifications = async () => {
    try {
      const [data, msgs] = await Promise.all([
        getNotifications({ role: "admin" }).catch(() => []),
        getMessages().catch(() => [])
      ]);
      setAdminNotifications(data || []);
      const unread = (msgs || []).filter((m: any) => m.senderRole === "student" && !m.isRead).length;
      setUnreadMessagesCount(unread);
    } catch (e) {
      console.warn("Error fetching admin notifications or messages:", e);
    }
  };

  useEffect(() => {
    setNotificationPermission(getNotificationPermission());
    loadAdminNotifications();

    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        loadAdminNotifications();
      }
    }, 120000);

    const unsubscribe = subscribeToNotificationBroadcast((payload: any) => {
      if (payload.recipientRole === "admin" || payload.recipientRole === "all") {
        loadAdminNotifications();
        triggerNativeNotification({
          title: payload.title || "Admin Notification",
          body: payload.message || payload.body || "",
          url: payload.actionUrl || payload.url || "/admin",
        });
      }
    });

    // Supabase Realtime for cross-device instant notification sync
    const supabase = createClient();
    const channel = supabase
      .channel("admin_system_notifs")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (change: any) => {
          const row = change.new;
          if (row && row.student_id === "SYSTEM_NOTIF") {
            const role = row.recipient_role;
            if (role === "admin" || role === "all") {
              loadAdminNotifications();
              try {
                const parsed = typeof row.message === "string" ? JSON.parse(row.message) : row.message;
                triggerNativeNotification({
                  title: parsed.title || row.student_name || "Admin Alert",
                  body: parsed.message || "",
                  url: parsed.actionUrl || "/admin",
                });
              } catch {
                triggerNativeNotification({
                  title: row.student_name || "Admin Alert",
                  body: row.message || "",
                  url: "/admin",
                });
              }
            }
          }
        }
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      unsubscribe();
      supabase.removeChannel(channel);
    };
  }, []);

  const unreadCount = adminNotifications.filter((n) => !n.isRead).length;

  const handleMarkAllRead = async () => {
    await markAllNotificationsAsRead({ role: "admin" });
    setAdminNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  };

  const handleClearAll = async () => {
    await clearAllNotifications({ role: "admin" });
    setAdminNotifications([]);
  };

  const handleNotificationClick = async (n: NotificationRecord) => {
    if (!n.isRead) {
      await markNotificationAsRead(n.id);
      setAdminNotifications((prev) =>
        prev.map((item) => (item.id === n.id ? { ...item, isRead: true } : item))
      );
    }
    setNotifDropdownOpen(false);
    if (n.actionUrl) {
      router.push(n.actionUrl);
    }
  };

  const handleEnablePush = async () => {
    const res = await requestNotificationPermission();
    setNotificationPermission(res);
    if (res === "granted") {
      triggerNativeNotification({
        title: "🔔 Native Popups Active",
        body: "You will receive desktop and mobile popups for all library events.",
        url: "/admin",
      });
    }
  };

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

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setNotifDropdownOpen(false);
      }
      if (userRef.current && !userRef.current.contains(event.target as Node)) {
        setUserDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Keyboard shortcut Ctrl+K or Cmd+K
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setSearchModalOpen(true);
      }
      if (e.key === "Escape") {
        setSearchModalOpen(false);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    clearInactivityTracking();
    router.push("/login");
  };

  const isNavActive = (href: string) => {
    if (href === "/admin") {
      return pathname === "/admin";
    }
    return pathname.startsWith(href);
  };

  if (isCheckingAuth) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#0A2E5C] text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#FFC107] border-t-transparent" />
          <p className="text-xs font-bold tracking-wider text-[#FFC107]">Verifying Admin Access...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#F3F4F6] dark:bg-[#141A24]">
      <meta name="robots" content="noindex, nofollow" />
      <title>{`Admin Portal | ${BRAND_CONFIG.fullName}`}</title>
      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 z-50 bg-[#0A2E5C]/80 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* ========================================================================= */}
      {/* 1. SIDEBAR (MATCHING IMAGE 1 WITH BRAND COLORS) */}
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
              <p className="text-[11px] font-semibold text-[#FFC107] mt-1 leading-none">Digital Library</p>
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
          {SIDEBAR_SECTIONS.map((section, idx) => (
            <div key={idx}>
              {section.group && (
                <p className="px-3 text-[10px] font-black uppercase tracking-wider text-[#0B5ED7] mb-2">
                  {section.group}
                </p>
              )}
              <nav className="space-y-1">
                {section.items.map((item) => {
                  const active = isNavActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3.5 rounded-2xl px-3.5 py-2.5 text-xs font-bold transition-all ${
                        active 
                          ? "bg-linear-to-r from-[#0B5ED7] to-[#FFC107] text-[#0A2E5C] shadow-lg shadow-[#0B5ED7]/25 font-black scale-[1.01]" 
                          : "text-zinc-400 hover:bg-white/5 hover:text-[#FFC107] font-medium"
                      }`}
                    >
                      <item.icon className={`h-4 w-4 shrink-0 ${active ? "text-[#0A2E5C]" : "text-zinc-400"}`} />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </nav>
            </div>
          ))}
        </div>

        {/* Bottom Profile Card & Logout matching Image 1 */}
        <div className="border-t border-zinc-800/80 p-4 space-y-3 bg-[#111620]">
          <div className="flex items-center gap-3 rounded-2xl bg-[#0A2E5C] p-3 border border-zinc-800">
            {adminUser.avatarUrl ? (
              <img 
                src={adminUser.avatarUrl} 
                alt={adminUser.name}
                onError={() => setAdminUser(prev => ({ ...prev, avatarUrl: "" }))}
                className="h-10 w-10 shrink-0 rounded-full object-cover border border-[#FFC107]/50 shadow-xs"
              />
            ) : (
              <div 
                className="h-10 w-10 shrink-0 rounded-full bg-gradient-to-br from-[#FFC107] to-[#0B5ED7] text-[#0A2E5C] flex items-center justify-center font-black text-xs shadow-xs border border-[#FFC107]/60 select-none"
                title={adminUser.name}
              >
                {getInitials(adminUser.name)}
              </div>
            )}
            <div className="flex-1 overflow-hidden">
              <p className="truncate text-xs font-black text-white">{adminUser.name}</p>
              <p className="truncate text-[10px] font-medium text-zinc-400">{adminUser.role}</p>
            </div>
          </div>

          <button 
            onClick={handleLogout}
            className="flex w-full items-center gap-3 px-3 py-2 text-xs font-bold text-zinc-400 hover:text-rose-400 hover:bg-white/5 rounded-xl transition cursor-pointer"
          >
            <LogOut className="h-4 w-4" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* ========================================================================= */}
      {/* 2. MAIN VIEWPORT & NAVBAR (PIXEL-PERFECT TO IMAGE 2) */}
      {/* ========================================================================= */}
      <div className="flex flex-1 flex-col overflow-hidden">
        
        {/* Top Header Navbar */}
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-zinc-200/80 bg-white px-3 sm:px-6 dark:border-zinc-800 dark:bg-[#0A2E5C] relative z-30 shadow-xs">
          
          {/* Left Side: Mobile -> Hamburger + Fixed Brand Logo; Desktop -> Global Search Input + QR Scanner Button */}
          <div className="flex items-center gap-2.5 sm:gap-3 flex-1 min-w-0 max-w-xl">
            {/* Mobile Hamburger Menu Button */}
            <button 
              className="lg:hidden flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800/90 dark:hover:bg-zinc-700 text-[#0A2E5C] dark:text-[#FFC107] border border-zinc-200/80 dark:border-zinc-700/60 transition cursor-pointer shrink-0 shadow-xs active:scale-95"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open Navigation Sidebar Menu"
              title="Open Navigation Menu"
            >
              <Menu className="h-5 w-5 stroke-[2.2]" />
            </button>

            {/* Mobile Fixed Brand Logo */}
            <div className="lg:hidden flex items-center shrink-0">
              <BrandLogo variant="navbar" size="h15" href="/admin" />
            </div>

            {/* Desktop Global Search Input Box with Ctrl+K badge AND QR Scanner Button Beside It */}
            <div className="hidden lg:flex items-center gap-2.5 flex-1">
              <div 
                onClick={() => setSearchModalOpen(true)}
                className="relative flex-1 items-center justify-between rounded-2xl border border-zinc-200/80 bg-[#F3F4F6]/70 px-3.5 py-2 text-xs text-zinc-500 hover:border-zinc-300 dark:border-zinc-700/80 dark:bg-zinc-800/60 dark:text-zinc-400 cursor-pointer shadow-2xs transition-colors flex"
              >
                <div className="flex items-center gap-2.5">
                  <Search className="h-4 w-4 text-zinc-400" />
                  <span className="text-xs text-zinc-400">Search students, exam results, members...</span>
                </div>
                <kbd className="hidden sm:inline-block rounded-lg bg-zinc-200/80 dark:bg-zinc-700 px-2 py-0.5 font-mono text-[10px] font-bold text-zinc-600 dark:text-zinc-300 shadow-2xs">
                  Ctrl + K
                </kbd>
              </div>

              {/* Desktop QR Scanner Button Beside Searchbar */}
              <button
                onClick={() => setQrScannerOpen(true)}
                className="flex items-center gap-2 px-3.5 py-2 rounded-2xl border border-[#FFC107]/50 bg-gradient-to-r from-[#0A2E5C] to-[#2B3548] text-[#FFC107] hover:text-white hover:border-[#FFC107] transition-all shadow-sm group cursor-pointer shrink-0"
                title="Scan Student QR Pass"
                aria-label="Scan Student QR Pass"
              >
                <div className="relative flex items-center justify-center">
                  <QrCode className="h-4 w-4 text-[#FFC107] group-hover:scale-110 transition-transform" />
                  <span className="absolute -top-1 -right-1 flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#FFC107] opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#0B5ED7]"></span>
                  </span>
                </div>
                <span className="text-xs font-bold tracking-tight">Scan QR</span>
              </button>
            </div>
          </div>

          {/* Right Side: Notification Bell (Red 4), Messages (Brown dot), Admin Avatar */}
          <div className="flex items-center gap-1 sm:gap-3 shrink-0">

            {/* 1. Notifications with Dynamic Badge */}
            <div className="relative" ref={notifRef}>
              <button 
                onClick={() => setNotifDropdownOpen(!notifDropdownOpen)}
                className="relative flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl text-zinc-700 hover:bg-[#F3F4F6] dark:text-zinc-300 dark:hover:bg-zinc-800 transition cursor-pointer"
                title="Notifications"
                aria-label="Notifications"
              >
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 sm:top-1.5 right-1 sm:right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-black text-white shadow-xs animate-pulse">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>

              {notifDropdownOpen && (
                <div className="absolute right-0 mt-2 w-88 rounded-3xl border border-[#E5E7EB] bg-white p-4 shadow-2xl dark:border-zinc-800 dark:bg-[#0A2E5C] z-50 animate-fadeIn">
                  <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800 mb-2.5">
                    <h4 className="text-xs font-bold text-[#0A2E5C] dark:text-white flex items-center gap-1.5">
                      <Bell className="h-3.5 w-3.5 text-[#0B5ED7]" /> Notifications & Alerts
                    </h4>
                    <div className="flex items-center gap-1.5">
                      {unreadCount > 0 && (
                        <>
                          <span className="text-[10px] font-bold text-rose-600 bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 rounded">
                            {unreadCount} New
                          </span>
                          <button
                            onClick={handleMarkAllRead}
                            className="text-[10px] font-bold text-[#0B5ED7] dark:text-[#FFC107] hover:underline cursor-pointer"
                          >
                            Mark read
                          </button>
                        </>
                      )}
                      {adminNotifications.length > 0 && (
                        <button
                          onClick={handleClearAll}
                          className="text-[10px] font-bold text-zinc-400 hover:text-rose-600 hover:underline cursor-pointer ml-1"
                        >
                          Clear all
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Enable Native OS/PWA Popups Banner if not yet granted */}
                  {notificationPermission !== "granted" && (
                    <div className="mb-2.5 p-2.5 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 flex items-center justify-between gap-2">
                      <div className="text-[11px] text-amber-900 dark:text-amber-200 leading-tight">
                        <span className="font-bold">Turn on Native Popups</span>
                        <p className="text-[10px] text-amber-700 dark:text-amber-400">Get instant lockscreen & sound alerts</p>
                      </div>
                      <button
                        onClick={handleEnablePush}
                        className="px-2.5 py-1 text-[10px] font-bold rounded-xl bg-[#0A2E5C] text-[#FFC107] hover:bg-black transition active:scale-95 cursor-pointer shrink-0"
                      >
                        Enable
                      </button>
                    </div>
                  )}

                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {adminNotifications.length === 0 ? (
                      <div className="py-8 text-center text-xs text-zinc-400 space-y-1">
                        <Bell className="h-6 w-6 mx-auto text-zinc-300 dark:text-zinc-600" />
                        <p className="font-semibold text-zinc-600 dark:text-zinc-300">No notifications yet</p>
                        <p className="text-[10px]">Student signups, fee receipts & messages will appear here.</p>
                      </div>
                    ) : (
                      adminNotifications.map((n) => (
                        <div
                          key={n.id}
                          onClick={() => handleNotificationClick(n)}
                          className={`p-2.5 rounded-2xl border transition cursor-pointer ${
                            !n.isRead
                              ? "border-[#FFC107]/60 bg-[#FFC107]/10 dark:border-[#FFC107]/40 dark:bg-[#FFC107]/10"
                              : "border-zinc-200/70 bg-[#F8FAFC]/40 dark:border-zinc-800 dark:bg-zinc-800/40 hover:bg-[#F8FAFC] dark:hover:bg-zinc-800/70"
                          } text-xs`}
                        >
                          <div className="flex justify-between items-start gap-1">
                            <p className="font-bold text-[#0A2E5C] dark:text-white text-[11px] flex items-center gap-1.5">
                              {!n.isRead && (
                                <span className="h-1.5 w-1.5 rounded-full bg-rose-500 shrink-0" />
                              )}
                              {n.title}
                            </p>
                            <span className="text-[9px] text-zinc-400 shrink-0">
                              {formatRelativeTime(n.createdAt)}
                            </span>
                          </div>
                          <p className="text-[10px] text-zinc-600 dark:text-zinc-300 mt-0.5 leading-relaxed">
                            {n.message}
                          </p>
                        </div>
                      ))
                    )}
                  </div>

                  <Link 
                    href="/admin/messages" 
                    onClick={() => setNotifDropdownOpen(false)}
                    className="mt-3 block text-center text-[11px] font-bold text-[#0B5ED7] dark:text-[#FFC107] hover:underline"
                  >
                    Open Live Communications & Messages →
                  </Link>
                </div>
              )}
            </div>

            {/* 2. Message Icon with Dynamic Unread Badge */}
            <Link 
              href="/admin/messages"
              className="relative flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl text-zinc-700 hover:bg-[#F3F4F6] dark:text-zinc-300 dark:hover:bg-zinc-800 transition"
              title={unreadMessagesCount > 0 ? `${unreadMessagesCount} Unread Messages` : "Student Messages & Broadcasts"}
            >
              <MessageSquare className="h-5 w-5" />
              {unreadMessagesCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-rose-500 text-[9px] font-black text-white shadow-xs animate-pulse">
                  {unreadMessagesCount > 9 ? "9+" : unreadMessagesCount}
                </span>
              )}
            </Link>

            {/* Vertical Divider (Desktop Only) */}
            <div className="h-7 w-px bg-zinc-200 dark:bg-zinc-800 hidden sm:block" />

            {/* 3. Admin User Profile Badge / Pill with Chevron */}
            <div className="relative" ref={userRef}>
              <button 
                onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                className="flex items-center gap-2 sm:gap-2.5 rounded-2xl p-1 sm:p-1.5 hover:bg-[#F3F4F6] dark:hover:bg-zinc-800 transition cursor-pointer"
                title="Admin Account Menu"
              >
                {adminUser.avatarUrl ? (
                  <img 
                    src={adminUser.avatarUrl} 
                    alt={adminUser.name}
                    onError={() => setAdminUser(prev => ({ ...prev, avatarUrl: "" }))}
                    className="h-8 w-8 sm:h-9 sm:w-9 rounded-full object-cover border-2 border-[#FFC107]/50 shadow-xs shrink-0"
                  />
                ) : (
                  <div 
                    className="h-8 w-8 sm:h-9 sm:w-9 rounded-full bg-gradient-to-br from-[#FFC107] to-[#0B5ED7] text-[#0A2E5C] flex items-center justify-center font-black text-xs shadow-xs border-2 border-[#FFC107]/60 shrink-0 select-none"
                    title={adminUser.name}
                  >
                    {getInitials(adminUser.name)}
                  </div>
                )}
                <div className="text-left hidden md:block">
                  <p className="text-xs font-black text-[#0A2E5C] dark:text-white leading-tight">{adminUser.name}</p>
                  <p className="text-[10px] text-zinc-400 font-medium leading-tight">{adminUser.role}</p>
                </div>
                <ChevronDown className="h-3.5 w-3.5 text-zinc-400 hidden sm:block" />
              </button>

              {userDropdownOpen && (
                <div className="absolute right-0 mt-2 w-64 rounded-2xl border border-[#E5E7EB] bg-white p-3 shadow-2xl dark:border-zinc-800 dark:bg-[#0A2E5C] z-50 animate-fadeIn">
                  <div className="p-2 border-b border-zinc-100 dark:border-zinc-800 mb-2 flex items-center gap-3">
                    {adminUser.avatarUrl ? (
                      <img 
                        src={adminUser.avatarUrl} 
                        alt={adminUser.name}
                        onError={() => setAdminUser(prev => ({ ...prev, avatarUrl: "" }))}
                        className="h-9 w-9 rounded-full object-cover border border-[#FFC107]/50 shadow-xs shrink-0"
                      />
                    ) : (
                      <div className="h-9 w-9 rounded-full bg-gradient-to-br from-[#FFC107] to-[#0B5ED7] text-[#0A2E5C] flex items-center justify-center font-black text-xs shadow-xs border border-[#FFC107]/60 shrink-0 select-none">
                        {getInitials(adminUser.name)}
                      </div>
                    )}
                    <div className="overflow-hidden">
                      <p className="text-xs font-bold text-[#0A2E5C] dark:text-white truncate">{adminUser.name}</p>
                      <p className="text-[10px] text-zinc-400 truncate">{adminUser.email}</p>
                      <span className="inline-block mt-0.5 text-[9px] font-bold text-[#0B5ED7] dark:text-[#FFC107] bg-[#FFC107]/20 px-2 py-0.2 rounded border border-[#FFC107]/40">
                        Super Administrator
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Link
                      href="/admin/settings"
                      onClick={() => setUserDropdownOpen(false)}
                      className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-[#F3F4F6] dark:hover:bg-zinc-800 rounded-xl"
                    >
                      <Settings className="h-3.5 w-3.5 text-[#0B5ED7]" /> Library Settings
                    </Link>
                    <Link
                      href="/admin/staff"
                      onClick={() => setUserDropdownOpen(false)}
                      className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-[#F3F4F6] dark:hover:bg-zinc-800 rounded-xl"
                    >
                      <UserCog className="h-3.5 w-3.5 text-[#0B5ED7]" /> Staff & Duty Roles
                    </Link>
                  </div>

                  <div className="border-t border-zinc-100 dark:border-zinc-800 mt-2 pt-2">
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-xl transition cursor-pointer"
                    >
                      <LogOut className="h-3.5 w-3.5" /> Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>

          </div>
        </header>

        {/* Page Content area */}
        <main className="flex-1 overflow-y-auto pb-28 lg:pb-8">
          {/* Mobile Shifted Search Bar with Placeholder & QR Scanner Icon (Scrolls with page content) */}
          <div className="lg:hidden border-b border-zinc-200/80 bg-white/95 dark:bg-[#0A2E5C]/95 backdrop-blur-md px-3 py-2 shadow-2xs mb-2">
            <div className="flex items-center gap-2 max-w-md mx-auto">
              {/* Search Input with Placeholder */}
              <div 
                onClick={() => setSearchModalOpen(true)}
                className="flex-1 flex items-center gap-2.5 rounded-2xl border border-zinc-200/90 dark:border-zinc-700/80 bg-[#F3F4F6]/90 dark:bg-zinc-800/80 px-3.5 py-2 text-xs text-zinc-500 dark:text-zinc-400 cursor-pointer shadow-2xs active:scale-[0.99] transition-transform"
              >
                <Search className="h-4 w-4 text-zinc-400 shrink-0" />
                <span className="text-xs text-zinc-400 truncate">Search students, exam results, members...</span>
              </div>

              {/* QR Scanner Icon Button */}
              <button
                onClick={() => setQrScannerOpen(true)}
                className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-tr from-[#0B5ED7] to-[#FFC107] text-[#0A2E5C] shadow-md shadow-[#0B5ED7]/25 hover:scale-105 active:scale-95 transition-transform cursor-pointer shrink-0"
                title="Scan Student QR Pass"
                aria-label="Scan Student QR Pass"
              >
                <QrCode className="h-4 w-4 text-[#0A2E5C] stroke-[2.5]" />
              </button>
            </div>
          </div>

          <div className="p-4 sm:p-6 lg:p-8 pt-2 sm:pt-4 lg:pt-8">
            {children}
          </div>
        </main>

        {/* Mobile Bottom Navigation Bar styled like Native App Icons */}
        <div className="lg:hidden fixed bottom-0 left-0 right-0 border-t border-zinc-200/80 bg-white/95 backdrop-blur-md px-1.5 py-1 z-30 dark:bg-[#0A2E5C]/95 dark:border-zinc-800 shadow-[0_-6px_20px_rgba(0,0,0,0.06)] pb-[calc(0.25rem+env(safe-area-inset-bottom))]">
          <div className="flex justify-around items-center max-w-md mx-auto">
            {MOBILE_BOTTOM_NAV.map((item) => {
              const active = isNavActive(item.href);
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="cursor-pointer focus:outline-none py-0.5 px-2"
                >
                  <div className="flex flex-col items-center justify-center gap-0.5 group active:scale-90 transition-transform select-none">
                    {/* App Icon Container */}
                    <div className={`
                      flex h-8 w-8 items-center justify-center rounded-xl transition-all duration-200 shadow-xs
                      ${active 
                        ? "bg-linear-to-tr from-[#0B5ED7] to-[#FFC107] text-[#0A2E5C] shadow-sm shadow-[#0B5ED7]/30 scale-105" 
                        : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 group-hover:bg-[#FFC107]/20 group-hover:text-[#0B5ED7]"
                      }
                    `}>
                      <Icon className={`h-4 w-4 ${active ? "stroke-[2.5]" : "stroke-[1.75]"}`} />
                    </div>
                    {/* App Label */}
                    <span className={`text-[9.5px] tracking-tight leading-none ${active ? "font-black text-[#0B5ED7] dark:text-[#FFC107]" : "font-semibold text-zinc-500 dark:text-zinc-400"}`}>
                      {item.label}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

      </div>

      {/* Quick Search Modal (Ctrl + K) */}
      {searchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/60 backdrop-blur-xs p-4">
          <div className="relative w-full max-w-lg rounded-3xl border border-zinc-200 bg-white p-4 shadow-2xl dark:border-zinc-800 dark:bg-[#0A2E5C] space-y-3">
            <div className="flex items-center gap-3 pb-3 border-b border-zinc-100 dark:border-zinc-800">
              <Search className="h-5 w-5 text-zinc-400" />
              <input
                ref={searchInputRef}
                autoFocus
                type="text"
                placeholder="Search students, exam results, desk #, invoices..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-sm font-medium bg-transparent focus:outline-none text-[#0A2E5C] dark:text-white"
              />
              <button 
                onClick={() => setSearchModalOpen(false)}
                className="text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-white"
              >
                ESC
              </button>
            </div>

            <div className="space-y-1">
              <p className="text-[10px] font-bold uppercase text-zinc-400 px-2">Quick Navigation Shortcuts</p>
              {[
                { name: "Manage Students", href: "/admin/students", icon: Users },
                { name: "Live Attendance Register", href: "/admin/attendance", icon: UserCheck },
                { name: "Seat Matrix & Desk QRs", href: "/admin/seats", icon: Armchair },
                { name: "WhatsApp Bot Console", href: "/admin/whatsapp", icon: WhatsAppIcon },
                { name: "Exam Results & Answer Keys", href: "/admin/results", icon: Award },
                { name: "Fees & Payment Invoices", href: "/admin/fees", icon: Receipt },
              ].map((item, i) => (
                <Link
                  key={i}
                  href={item.href}
                  onClick={() => setSearchModalOpen(false)}
                  className="flex items-center justify-between p-2.5 rounded-xl hover:bg-[#F3F4F6] dark:hover:bg-zinc-800 text-xs font-bold text-[#0A2E5C] dark:text-white transition"
                >
                  <div className="flex items-center gap-2.5">
                    <item.icon className="h-4 w-4 text-[#0B5ED7]" />
                    <span>{item.name}</span>
                  </div>
                  <span className="text-[10px] text-zinc-400 font-mono">Jump →</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Student QR Inspection & Live Action Modal */}
      <AdminStudentQrScannerModal
        isOpen={qrScannerOpen}
        onClose={() => setQrScannerOpen(false)}
      />
    </div>
  );
}
