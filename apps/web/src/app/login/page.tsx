"use client";

/**
 * [WEB • PAGE] Login
 *
 * Email/password sign-in via Supabase Auth; admins land on /admin,
 * students on /student. Uses security.ts lockout.
 */
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import {
  User,
  Lock,
  ArrowRight,
  Clock,
  AlertCircle,
  CheckCircle2,
  ShieldAlert,
  X,
  Phone,
  HelpCircle,
  UserPlus,
  UserX,
  Mail,
  Eye,
  EyeOff
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { lookupStudent } from "@/lib/api";
import {
  getLoginSecurityStatus,
  recordFailedLoginAttempt,
  resetLoginAttempts
} from "@/lib/security";
import {
  recordUserActivity,
  checkInactivityExpiry,
  clearInactivityTracking,
  saveUserRole
} from "@/lib/authInactivity";
import { BRAND_CONFIG, isMasterAdminEmail } from "@/lib/config";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedSeat = searchParams.get("seat");
  const errorQuery = searchParams.get("error");
  const emailQuery = searchParams.get("email");

  const [email, setEmail] = useState(emailQuery || "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Modal States for Not Approved / Not Registered / Suspended / Account Locked
  const [showNotApprovedModal, setShowNotApprovedModal] = useState(false);
  const [showNotRegisteredModal, setShowNotRegisteredModal] = useState(false);
  const [showSuspendedModal, setShowSuspendedModal] = useState(false);
  const [showLockedModal, setShowLockedModal] = useState(false);
  const [lockedAccount, setLockedAccount] = useState("");
  const [unapprovedEmail, setUnapprovedEmail] = useState("");
  const [unapprovedName, setUnapprovedName] = useState("");
  const [unregisteredEmail, setUnregisteredEmail] = useState("");

  // Check if user already has an active session (e.g. after reopening app or clearing taskbar)
  useEffect(() => {
    async function checkExistingSession() {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const user = session.user;
          const role = user.user_metadata?.role;
          const isAdmin = isMasterAdminEmail(user.email) || role === "admin";
          
          if (isAdmin) {
            recordUserActivity(true);
            saveUserRole("admin");
            router.replace("/admin/");
            return;
          }
          if (role === "staff") {
            recordUserActivity(true);
            saveUserRole("staff");
            router.replace("/staff/");
            return;
          }

          // If an error query is present, do NOT auto-redirect student (show modal/warning)
          if (errorQuery) {
            return;
          }

          // Student: Verify status is active before auto-redirecting
          const { data: dbProfile } = await supabase
            .from("profiles")
            .select("status, phone")
            .eq("id", user.id)
            .maybeSingle();

          const hasPhone = Boolean(dbProfile?.phone && String(dbProfile.phone).trim().length > 0);

          if (!dbProfile || !hasPhone || dbProfile.status !== "active") {
            // Not active or unregistered: sign out and stay on login
            await supabase.auth.signOut();
            return;
          }

          saveUserRole("student");
          router.replace("/student/");
        }
      } catch (err) {
        console.warn("[Login] Session check notice:", err);
      }
    }

    checkExistingSession();
    try {
      router.prefetch("/admin/");
      router.prefetch("/student/");
      router.prefetch("/staff/");
    } catch {}
  }, [router, errorQuery]);

  useEffect(() => {
    if (emailQuery) {
      setEmail(emailQuery);
    }
  }, [emailQuery]);

  useEffect(() => {
    if (errorQuery === "not_registered") {
      if (emailQuery) setUnregisteredEmail(emailQuery);
      setShowNotRegisteredModal(true);
    } else if (errorQuery === "pending_approval") {
      if (emailQuery) setUnapprovedEmail(emailQuery);
      const nameQuery = searchParams.get("name");
      if (nameQuery) setUnapprovedName(nameQuery);
      setShowNotApprovedModal(true);
    } else if (errorQuery === "suspended") {
      if (emailQuery) setUnapprovedEmail(emailQuery);
      setShowSuspendedModal(true);
    } else if (errorQuery === "oauth_error") {
      const msgParam = searchParams.get("msg");
      setErrorMsg(msgParam ? `Google authentication failed: ${msgParam}` : "Google authentication failed. Please try again.");
    }
  }, [errorQuery, emailQuery, searchParams]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg("");

    const targetVal = email.trim();
    if (!targetVal) {
      setErrorMsg("Please enter your registered email address.");
      setIsLoading(false);
      return;
    }

    const cleanInput = targetVal.toLowerCase();
    const isMasterAdmin = isMasterAdminEmail(cleanInput);

    // 1. Security Check: Check if account is locked due to 5 consecutive failed attempts
    if (isMasterAdmin) {
      resetLoginAttempts(cleanInput);
    } else {
      const secStatus = getLoginSecurityStatus(cleanInput);
      if (secStatus.isLocked) {
        setLockedAccount(targetVal);
        setShowLockedModal(true);
        setErrorMsg("Account locked! 5 consecutive failed login attempts reached. Please use 'Forgot Password' below to verify your email and unlock your account.");
        setIsLoading(false);
        return;
      }
    }

    let authEmail = cleanInput;
    const supabase = createClient();

    // If input is phone number or mobile digits, gracefully resolve it
    if (!authEmail.includes("@")) {
      const cleanPhone = authEmail.replace(/[^0-9]/g, "").slice(-10);
      const adminPhoneDigits = (BRAND_CONFIG.rawPhone || "8423448899").replace(/[^0-9]/g, "").slice(-10);

      if (cleanPhone === adminPhoneDigits || cleanPhone === "8423448899") {
        authEmail = "geniuslibrarymadhupur@gmail.com";
      } else {
        try {
          const { data: pData } = await supabase
            .from("profiles")
            .select("email, role")
            .or(`phone.eq.${cleanPhone},phone.eq.+91 ${cleanPhone}`)
            .maybeSingle();

          if (pData?.email) {
            authEmail = pData.email.toLowerCase();
          } else {
            const matched = await lookupStudent({ phone: cleanPhone });
            if (matched && matched.email) {
              authEmail = matched.email.toLowerCase();
            } else {
              authEmail = `${cleanPhone}@geniusdigital.in`;
            }
          }
        } catch {
          authEmail = `${cleanPhone}@geniusdigital.in`;
        }
      }
    }

    let { data, error } = await supabase.auth.signInWithPassword({
      email: authEmail,
      password: password,
    });

    // If initial sign in fails and it is an admin account or geniuslibrarymadhupur@gmail.com, try fallback to geniuslibrary@gmail.com
    if (error && (authEmail === "geniuslibrarymadhupur@gmail.com" || isMasterAdmin || isMasterAdminEmail(authEmail))) {
      const fallbackResult = await supabase.auth.signInWithPassword({
        email: "geniuslibrary@gmail.com",
        password: password,
      });
      if (!fallbackResult.error && fallbackResult.data?.user) {
        data = fallbackResult.data;
        error = null;
      }
    }

    if (error) {
      console.error("[Login] signInWithPassword error:", error);

      // NEVER show student not-approved, suspended, or unregistered modals to admin!
      if (isMasterAdmin || isMasterAdminEmail(authEmail) || isMasterAdminEmail(targetVal)) {
        setErrorMsg("Incorrect password for Admin account. Please verify your credentials and try again.");
        setIsLoading(false);
        return;
      }

      // Check for server-side / schema / database failures
      if ((error.status && error.status >= 500) || error.message.toLowerCase().includes("database error") || error.message.toLowerCase().includes("schema")) {
        setErrorMsg(`Supabase Auth Service Error: ${error.message}. Please verify the database schema in Supabase SQL editor.`);
        setIsLoading(false);
        return;
      }

      // Check if this student is pending approval or suspended
      try {
        const trimmedEmail = authEmail;
        let pCheck: any = null;
        try {
          const { data } = await supabase
            .from("profiles")
            .select("id, status, full_name, role, email")
            .eq("email", trimmedEmail)
            .maybeSingle();
          pCheck = data;
        } catch {}

        // If this profile is admin, never show student modals
        if (pCheck?.role === "admin" || isMasterAdminEmail(pCheck?.email)) {
          setErrorMsg("Incorrect password for Admin account. Please verify your credentials and try again.");
          setIsLoading(false);
          return;
        }

        const matchedStudent = !pCheck ? await lookupStudent({ email: trimmedEmail }) : null;

        if (matchedStudent || pCheck) {
          const status = matchedStudent?.status || pCheck?.status;
          if (status === "pending") {
            setUnapprovedEmail(targetVal);
            setUnapprovedName(matchedStudent?.fullName || pCheck?.full_name || "");
            setShowNotApprovedModal(true);
            setIsLoading(false);
            return;
          }
          if (status === "suspended") {
            setUnapprovedEmail(targetVal);
            setShowSuspendedModal(true);
            setIsLoading(false);
            return;
          }
        } else {
          // Account is completely unregistered in the library!
          setUnregisteredEmail(targetVal);
          setShowNotRegisteredModal(true);
          setIsLoading(false);
          return;
        }
      } catch (err) {}

      // Incorrect password attempt -> Record failed login attempt for rate limiting
      const failedStatus = recordFailedLoginAttempt(targetVal);
      if (failedStatus.isLocked) {
        setLockedAccount(targetVal);
        setShowLockedModal(true);
        setErrorMsg("Account locked! 5 consecutive incorrect password attempts reached. Please use 'Forgot Password' below to reset your password and unlock your account.");
      } else {
        setErrorMsg(`Incorrect password. ${failedStatus.remainingAttempts} attempt${failedStatus.remainingAttempts === 1 ? '' : 's'} remaining before your account is locked for security.`);
      }
      setIsLoading(false);
      return;
    }

    // Success -> Clear failed attempt counter
    resetLoginAttempts(targetVal);

    const user = data.user;
    if (!user) {
      setErrorMsg("Login failed. Please try again.");
      setIsLoading(false);
      return;
    }

    // 1. Instant Navigation based on authenticated user session
    recordUserActivity(true);
    const role = user.user_metadata?.role;
    const isAdmin = isMasterAdminEmail(user.email) || isMasterAdminEmail(targetVal) || role === "admin";
    const assignedRole = isAdmin ? "admin" : (role === "staff" ? "staff" : "student");

    // Automatically request & sync native FCM push token for this user
    try {
      const { requestFCMToken, syncFCMTokenWithUser } = await import("@/lib/firebase");
      requestFCMToken().then((token) => {
        if (token) syncFCMTokenWithUser(token, assignedRole);
      }).catch(() => {});
    } catch {}

    if (isAdmin) {
      saveUserRole("admin");
      router.replace("/admin/");
      return;
    }

    if (role === "staff") {
      saveUserRole("staff");
      router.replace("/staff/");
      return;
    }

    // Student: Strictly verify active status BEFORE navigating to /student/
    let studentProfile: any = null;
    try {
      const { data: pData } = await supabase
        .from("profiles")
        .select("id, status, phone, full_name, role")
        .eq("id", user.id)
        .maybeSingle();
      studentProfile = pData;
    } catch {}

    if (studentProfile?.role === "admin") {
      saveUserRole("admin");
      router.replace("/admin/");
      return;
    }

    const hasPhone = Boolean(studentProfile?.phone && String(studentProfile.phone).trim().length > 0);

    if (!studentProfile || !hasPhone) {
      await supabase.auth.signOut();
      setUnregisteredEmail(targetVal);
      setShowNotRegisteredModal(true);
      setIsLoading(false);
      return;
    }

    if (studentProfile.status === "pending") {
      await supabase.auth.signOut();
      setUnapprovedEmail(targetVal);
      setUnapprovedName(studentProfile.full_name || "");
      setShowNotApprovedModal(true);
      setIsLoading(false);
      return;
    }

    if (studentProfile.status === "suspended") {
      await supabase.auth.signOut();
      setUnapprovedEmail(targetVal);
      setShowSuspendedModal(true);
      setIsLoading(false);
      return;
    }

    if (studentProfile.status !== "active") {
      await supabase.auth.signOut();
      setUnregisteredEmail(targetVal);
      setShowNotRegisteredModal(true);
      setIsLoading(false);
      return;
    }

    // ONLY approved/active students enter the student portal
    saveUserRole("student");
    router.replace("/student/");
  };

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    const supabase = createClient();
    const siteBase =
      typeof window !== "undefined" && window.location.origin
        ? window.location.origin
        : "https://genius.librarywale.in";

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${siteBase}/auth/callback/`,
      }
    });

    if (error) {
      setErrorMsg(error.message);
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#141A24] flex flex-col justify-center pt-8 sm:pt-12 pb-28 sm:pb-12 sm:px-6 lg:px-8">
      {/* Background Decorative */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] bg-[#FFC107]/10 blur-[100px] pointer-events-none rounded-full" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center relative z-10">
        <div className="flex justify-center">
          <BrandLogo variant="navbar" size="lg" />
        </div>
        <h1 className="mt-4 text-2xl font-black tracking-tight text-[#0A2E5C] dark:text-white">
          Sign in to your account
        </h1>
        <p className="mt-1 text-xs text-[#0B5ED7]">
          Welcome back! Please enter your details.
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md px-4 relative z-10">
        <div className="rounded-3xl border border-[#E5E7EB] bg-white p-6 sm:p-8 shadow-xl shadow-[#0A2E5C]/5 backdrop-blur-md dark:border-zinc-800 dark:bg-[#0A2E5C]">

          {/* Preset Seat Notification */}
          {preselectedSeat && (
            <div className="mb-6 rounded-xl border border-[#FFC107] bg-[#E5E7EB]/30 p-3 text-xs text-[#0A2E5C] dark:text-[#FFC107]">
              <span className="font-bold">Desk #{preselectedSeat} Selected!</span> Sign in to confirm your desk reservation.
            </div>
          )}

          {errorMsg && (
            <div className={`mb-6 rounded-2xl p-4 text-xs font-semibold flex items-start gap-3 shadow-sm border ${
              errorMsg.includes("waiting for verification") || errorMsg.includes("pending")
                ? "bg-amber-50 border-amber-300 text-amber-900 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-200"
                : "bg-rose-50 border-rose-300 text-rose-800 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-200"
            }`}>
              <Clock className="h-4 w-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
              <div className="leading-relaxed">{errorMsg}</div>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#0A2E5C] dark:text-zinc-200 mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-zinc-400">
                  <Mail className="h-4 w-4" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. geniuslibrarymadhupur@gmail.com"
                  className="w-full rounded-xl border border-[#E5E7EB] bg-[#F8FAFC]/50 py-2.5 pl-10 pr-3 text-xs text-[#0A2E5C] placeholder-zinc-400 focus:border-[#FFC107] focus:outline-none focus:ring-2 focus:ring-[#FFC107]/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white transition-all"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-[#0A2E5C] dark:text-zinc-200">
                  Password
                </label>
                <Link href="/forgot-password" className="text-xs font-semibold text-[#0B5ED7] hover:text-[#0A2E5C] dark:hover:text-[#FFC107] transition-colors">
                  Forgot Password?
                </Link>
              </div>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-zinc-400">
                  <Lock className="h-4 w-4" />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-[#E5E7EB] bg-[#F8FAFC]/50 py-2.5 pl-10 pr-10 text-xs text-[#0A2E5C] placeholder-zinc-400 focus:border-[#FFC107] focus:outline-none focus:ring-2 focus:ring-[#FFC107]/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer"
                  tabIndex={-1}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#0A2E5C] py-3 text-xs font-bold text-[#FFC107] border border-[#FFC107]/40 shadow-md hover:bg-[#141A24] transition active:scale-95 mt-2 cursor-pointer"
            >
              {isLoading ? (
                <span>Checking status & signing in...</span>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 flex items-center justify-center gap-3">
            <div className="h-px bg-[#E5E7EB] dark:bg-zinc-700 flex-1"></div>
            <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">or continue with</span>
            <div className="h-px bg-[#E5E7EB] dark:bg-zinc-700 flex-1"></div>
          </div>

          <div className="mt-6">
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={isLoading}
              className="w-full inline-flex items-center justify-center gap-3 rounded-xl bg-white border border-[#E5E7EB] py-2.5 text-xs font-bold text-[#0A2E5C] shadow-sm hover:bg-zinc-50 transition active:scale-95 dark:bg-zinc-900 dark:border-zinc-700 dark:text-white dark:hover:bg-zinc-800 cursor-pointer"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              Log In With Google
            </button>
          </div>

          <div className="mt-8 text-center text-xs text-[#0A2E5C] dark:text-zinc-300">
            Don't have an account?{" "}
            <Link href="/signup" className="font-bold text-[#0B5ED7] hover:text-[#FFC107] transition-colors">
              Sign up
            </Link>
          </div>

          <div className="mt-6 text-center text-[10px] text-zinc-400">
            <Link href="/" className="hover:text-[#0A2E5C] transition">
              ← Back to Home
            </Link>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* POPUP ALERT MODAL: APPLICATION PENDING ADMIN APPROVAL (NOT APPROVED)     */}
      {/* ========================================================================= */}
      {showNotApprovedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm animate-fadeIn">
          <div className="relative w-full max-w-md rounded-3xl border border-amber-300/80 bg-white p-6 sm:p-7 shadow-2xl dark:border-amber-700/60 dark:bg-[#0A2E5C] text-center">
            {/* Close Button */}
            <button
              onClick={() => setShowNotApprovedModal(false)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Glowing Amber Clock Icon */}
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400 mx-auto shadow-md shadow-amber-500/10">
              <Clock className="h-8 w-8 animate-pulse" />
            </div>

            <h2 className="mt-4 text-xl font-black text-[#0A2E5C] dark:text-white">
              Account Not Approved Yet
            </h2>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              {unapprovedName ? `Hello ${unapprovedName}, your registration` : "Your registration"} is currently awaiting verification and approval by the Library Admin.
            </p>

            {/* Details Box */}
            <div className="my-5 rounded-2xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/70 dark:bg-amber-950/20 p-4 text-left space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-zinc-500 font-medium">Status:</span>
                <span className="font-bold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/60 px-2.5 py-0.5 rounded-md text-[11px]">
                  🟡 Pending Admin Approval
                </span>
              </div>
              {unapprovedEmail && (
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500 font-medium">Account:</span>
                  <span className="font-mono font-bold text-[#0A2E5C] dark:text-zinc-200 truncate max-w-[210px]">{unapprovedEmail}</span>
                </div>
              )}
              <div className="pt-2 border-t border-amber-200/60 dark:border-amber-900/40 text-[11px] text-zinc-600 dark:text-zinc-300 leading-relaxed">
                ⚠️ You cannot access the Student Portal until your membership is approved by the Library Admin. Please wait for verification or visit the front desk.
              </div>
              <div className="flex items-center gap-1.5 text-[10.5px] text-zinc-500 dark:text-zinc-400">
                <Phone className="h-3.5 w-3.5 text-[#0B5ED7]" />
                <span>Desk Hotline: {BRAND_CONFIG.phone || "+91 8423448899"} (Madhupur, Sonbhadra)</span>
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setShowNotApprovedModal(false)}
                className="w-full py-3 rounded-xl bg-[#0A2E5C] text-[#FFC107] font-bold text-xs hover:bg-[#141A24] border border-[#FFC107]/40 transition shadow-md cursor-pointer"
              >
                Understood (Stay on Login)
              </button>
              <Link
                href="/contact-support"
                className="block text-center text-[11px] font-bold text-[#0B5ED7] hover:underline pt-1"
              >
                Need Urgent Assistance? Contact Front Desk →
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* POPUP ALERT MODAL: ACCOUNT NOT REGISTERED (FIRST REGISTER)               */}
      {/* ========================================================================= */}
      {showNotRegisteredModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm animate-fadeIn">
          <div className="relative w-full max-w-md rounded-3xl border border-[#FFC107]/50 bg-white p-6 sm:p-7 shadow-2xl dark:border-[#FFC107]/30 dark:bg-[#0A2E5C] text-center">
            {/* Close Button */}
            <button
              onClick={() => setShowNotRegisteredModal(false)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition cursor-pointer"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Glowing Icon */}
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10 text-[#0B5ED7] dark:text-[#FFC107] mx-auto shadow-md shadow-amber-500/10 border border-[#FFC107]/30">
              <UserX className="h-8 w-8 text-[#0B5ED7] dark:text-[#FFC107]" />
            </div>

            <h2 className="mt-4 text-xl font-black text-[#0A2E5C] dark:text-white">
              Account Not Registered
            </h2>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              No student admission record was found for this account. Please register first to enroll in the library.
            </p>

            {/* Details Box */}
            <div className="my-5 rounded-2xl border border-[#FFC107]/30 bg-amber-50/50 dark:bg-amber-950/20 p-4 text-left space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-zinc-500 font-medium">Status:</span>
                <span className="font-bold text-rose-700 dark:text-rose-300 bg-rose-100 dark:bg-rose-900/60 px-2.5 py-0.5 rounded-md text-[11px]">
                  🔴 Not Registered Yet
                </span>
              </div>
              {unregisteredEmail && (
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500 font-medium">Email:</span>
                  <span className="font-mono font-bold text-[#0A2E5C] dark:text-zinc-200 truncate max-w-[210px]">{unregisteredEmail}</span>
                </div>
              )}
              <div className="pt-2 border-t border-[#FFC107]/20 text-[11px] text-zinc-600 dark:text-zinc-300 leading-relaxed">
                👉 Please submit the student admission registration first. Once registered, your account will be verified and approved by the Library Admin.
              </div>
              <div className="flex items-center gap-1.5 text-[10.5px] text-zinc-500 dark:text-zinc-400">
                <Phone className="h-3.5 w-3.5 text-[#0B5ED7]" />
                <span>Desk Hotline: {BRAND_CONFIG.phone || "+91 8423448899"} (Madhupur, Sonbhadra)</span>
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-2">
              <Link
                href={`/signup${unregisteredEmail ? `?email=${encodeURIComponent(unregisteredEmail)}` : ""}`}
                className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl bg-gradient-to-r from-[#0B5ED7] to-[#FFC107] hover:from-[#7c5f47] hover:to-[#a98f73] text-white font-black text-xs shadow-lg shadow-[#0B5ED7]/25 transition cursor-pointer"
              >
                <UserPlus className="h-4 w-4" />
                <span>First Register / Complete Admission Now →</span>
              </Link>
              <button
                type="button"
                onClick={() => setShowNotRegisteredModal(false)}
                className="w-full py-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 font-semibold text-xs hover:bg-zinc-200 dark:hover:bg-zinc-700 transition cursor-pointer"
              >
                Understood (Stay on Login)
              </button>
              <Link
                href="/contact-support"
                className="block text-center text-[11px] font-bold text-[#0B5ED7] hover:underline pt-1"
              >
                Need Help with Registration? Contact Front Desk →
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* POPUP ALERT MODAL: ACCOUNT SUSPENDED                                      */}
      {/* ========================================================================= */}
      {showSuspendedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm animate-fadeIn">
          <div className="relative w-full max-w-md rounded-3xl border border-rose-300/80 bg-white p-6 sm:p-7 shadow-2xl dark:border-rose-700/60 dark:bg-[#0A2E5C] text-center">
            <button
              onClick={() => setShowSuspendedModal(false)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400 mx-auto shadow-md shadow-rose-500/10">
              <ShieldAlert className="h-8 w-8" />
            </div>

            <h3 className="mt-4 text-xl font-black text-[#0A2E5C] dark:text-white">
              Account Suspended
            </h3>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Your student membership has been temporarily suspended by the Library Administration.
            </p>

            <div className="my-5 rounded-2xl border border-rose-200 dark:border-rose-900/50 bg-rose-50/70 dark:bg-rose-950/20 p-4 text-left space-y-2 text-xs">
              <p className="text-rose-900 dark:text-rose-200 font-semibold">
                Please contact the library desk at Madhupur, Sonbhadra to resolve any pending fee dues or policy compliance issues.
              </p>
              <p className="text-[11px] text-zinc-500">Contact: {BRAND_CONFIG.phone || "+91 8423448899"}</p>
            </div>

            <button
              type="button"
              onClick={() => setShowSuspendedModal(false)}
              className="w-full py-3 rounded-xl bg-[#0A2E5C] text-white font-bold text-xs hover:bg-[#141A24] transition shadow-md cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* POPUP ALERT MODAL: ACCOUNT LOCKED DUE TO 5 FAILED ATTEMPTS                */}
      {/* ========================================================================= */}
      {showLockedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
          <div className="relative w-full max-w-md rounded-3xl border border-rose-400/80 bg-white p-6 sm:p-7 shadow-2xl dark:border-rose-700/60 dark:bg-[#0A2E5C] text-center">
            <button
              onClick={() => setShowLockedModal(false)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition cursor-pointer"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400 mx-auto shadow-md shadow-rose-500/10">
              <ShieldAlert className="h-8 w-8 animate-bounce" />
            </div>

            <h3 className="mt-4 text-xl font-black text-[#0A2E5C] dark:text-white">
              Account Locked for Security
            </h3>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              5 consecutive incorrect password attempts were detected. For your account protection, login has been locked.
            </p>

            <div className="my-5 rounded-2xl border border-rose-200 dark:border-rose-900/50 bg-rose-50/70 dark:bg-rose-950/20 p-4 text-left space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-zinc-500 font-medium">Locked Account:</span>
                <span className="font-mono font-bold text-rose-700 dark:text-rose-300 truncate max-w-[210px]">{lockedAccount || email}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-500 font-medium">Failed Attempts:</span>
                <span className="font-bold text-rose-600">5 of 5 reached</span>
              </div>
              <p className="pt-2 border-t border-rose-200/60 dark:border-rose-900/40 text-[11px] text-zinc-600 dark:text-zinc-300 leading-relaxed">
                🔒 <strong>How to unlock:</strong> Click <strong>&quot;Reset Password &amp; Unlock&quot;</strong> below. You will receive a secure email verification link to verify ownership and set a new password.
              </p>
            </div>

            <div className="space-y-2">
              <Link
                href={`/forgot-password?email=${encodeURIComponent(lockedAccount || email)}`}
                className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-md transition active:scale-95"
              >
                <Lock className="h-4 w-4" />
                <span>Reset Password &amp; Unlock Account</span>
              </Link>
              <button
                type="button"
                onClick={() => setShowLockedModal(false)}
                className="w-full py-2.5 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 font-medium"
              >
                Stay on Login
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <>
      <Navbar />
      <Suspense
        fallback={
          <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#141A24] flex flex-col justify-center pt-8 pb-28 text-center sm:px-6">
            <h1 className="text-2xl font-black text-[#0A2E5C] dark:text-white">
              Sign in to your account
            </h1>
            <p className="mt-2 text-xs text-[#0B5ED7]">Loading login form...</p>
          </div>
        }
      >
        <LoginForm />
      </Suspense>
      <Footer className="hidden md:block" />
    </>
  );
}
