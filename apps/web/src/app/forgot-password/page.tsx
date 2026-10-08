"use client";

/**
 * [WEB • PAGE] Forgot Password
 *
 * Sends Supabase password-reset email.
 */
import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BrandLogo } from "@/components/BrandLogo";
import { 
  Mail, 
  ArrowRight,
  CheckCircle2,
  KeyRound,
  Lock,
  RefreshCw,
  ExternalLink,
  X,
  ShieldCheck
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

function ForgotPasswordForm() {
  const searchParams = useSearchParams();
  const emailParam = searchParams.get("email") || "";
  const [email, setEmail] = useState(emailParam);
  const [otpCode, setOtpCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [step, setStep] = useState<"request" | "verify" | "success">("request");
  const [errorMsg, setErrorMsg] = useState("");
  
  // Google OAuth detection modal state
  const [showGoogleModal, setShowGoogleModal] = useState(false);
  const [googleUserEmail, setGoogleUserEmail] = useState("");

  useEffect(() => {
    if (emailParam && !email) {
      setEmail(emailParam);
    }
  }, [emailParam]);

  const handleGoogleSignIn = async () => {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${location.origin}/student/`,
      },
    });
  };

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) return;

    setIsLoading(true);
    setErrorMsg("");

    // 1. Check whether this account was registered via Google OAuth
    try {
      const checkRes = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "https://genius-library-api.geniuslibrary.workers.dev"}/api/auth/provider-check?email=${encodeURIComponent(cleanEmail)}`
      );
      const checkData = await checkRes.json();
      
      if (checkData?.isGoogle) {
        setIsLoading(false);
        setGoogleUserEmail(cleanEmail);
        setShowGoogleModal(true);
        return;
      }
    } catch {
      // Fallback local check from Supabase profiles
      try {
        const supabase = createClient();
        const { data: profile } = await supabase
          .from("profiles")
          .select("auth_provider, avatar_url")
          .eq("email", cleanEmail)
          .maybeSingle();

        if (profile?.auth_provider === "google" || profile?.avatar_url?.includes("googleusercontent.com")) {
          setIsLoading(false);
          setGoogleUserEmail(cleanEmail);
          setShowGoogleModal(true);
          return;
        }
      } catch {}
    }

    // 2. Standard Email/Password user: Send OTP via Supabase Auth
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo: `${location.origin}/update-password?email=${encodeURIComponent(cleanEmail)}`,
    });

    setIsLoading(false);

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    setStep("verify");
  };

  const handleVerifyOtpAndReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (!otpCode || otpCode.trim().length < 6) {
      setErrorMsg("Please enter the complete 6-digit OTP code.");
      return;
    }

    if (newPassword.length < 6) {
      setErrorMsg("Password must be at least 6 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg("Passwords do not match.");
      return;
    }

    setIsVerifying(true);
    const cleanEmail = email.trim().toLowerCase();
    const supabase = createClient();

    try {
      // 1. Verify recovery OTP token
      const { error: otpError } = await supabase.auth.verifyOtp({
        email: cleanEmail,
        token: otpCode.trim(),
        type: "recovery",
      });

      if (otpError) {
        setIsVerifying(false);
        setErrorMsg(otpError.message || "Invalid or expired OTP code.");
        return;
      }

      // 2. Set new password for the verified user session
      const { error: pwdError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      setIsVerifying(false);

      if (pwdError) {
        setErrorMsg(pwdError.message);
        return;
      }

      setStep("success");
    } catch (err: any) {
      setIsVerifying(false);
      setErrorMsg(err.message || "An unexpected error occurred.");
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#141A24] flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      {/* Background Decorative */}
      <div className="absolute top-1/3 left-1/2 -trangray-x-1/2 -trangray-y-1/2 w-[500px] h-[300px] bg-[#FFC107]/10 blur-[100px] pointer-events-none rounded-full" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center relative z-10">
        <div className="flex justify-center">
          <BrandLogo variant="navbar" size="lg" />
        </div>
        <h1 className="mt-4 text-2xl font-black tracking-tight text-[#0A2E5C] dark:text-white">
          {step === "verify" ? "Enter OTP Code" : step === "success" ? "Password Reset Complete" : "Reset your password"}
        </h1>
        <p className="mt-1 text-xs text-[#0B5ED7]">
          {step === "verify" 
            ? "Enter the 6-digit OTP sent to your email to set a new password." 
            : "Enter your registered email address to receive an OTP & reset link."}
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md px-4 relative z-10">
        <div className="rounded-3xl border border-[#E5E7EB] bg-white p-6 sm:p-8 shadow-xl shadow-[#0A2E5C]/5 backdrop-blur-md dark:border-zinc-800 dark:bg-[#0A2E5C]">
          
          {errorMsg && (
            <div className="mb-4 rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs text-rose-800 dark:bg-rose-950/40 dark:border-rose-900/50 dark:text-rose-300">
              {errorMsg}
            </div>
          )}

          {step === "success" ? (
            <div className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/60 mb-4">
                <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h3 className="text-lg font-bold text-[#0A2E5C] dark:text-white mb-2">Password Updated!</h3>
              <p className="text-xs text-[#6B7280] dark:text-zinc-400 mb-6">
                Your password has been successfully reset. You can now log in with your new credentials.
              </p>
              <Link
                href="/login"
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#0A2E5C] py-3 text-xs font-bold text-[#FFC107] border border-[#FFC107]/40 shadow-md hover:bg-[#141A24] transition active:scale-95"
              >
                Sign In Now
              </Link>
            </div>
          ) : step === "verify" ? (
            <form onSubmit={handleVerifyOtpAndReset} className="space-y-4">
              <div className="rounded-xl bg-[#F8FAFC]/80 dark:bg-zinc-800/80 p-3 text-[11px] text-zinc-600 dark:text-zinc-300">
                A 6-digit OTP code was sent to <strong className="text-[#0A2E5C] dark:text-white">{email}</strong>.
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#0A2E5C] dark:text-zinc-200 mb-1.5">
                  6-Digit OTP Code
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-zinc-400">
                    <KeyRound className="h-4 w-4" />
                  </div>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                    placeholder="123456"
                    className="w-full rounded-xl border border-[#E5E7EB] bg-[#F8FAFC]/50 py-2.5 pl-10 pr-3 text-sm font-mono tracking-widest text-[#0A2E5C] placeholder-zinc-400 focus:border-[#FFC107] focus:outline-none focus:ring-2 focus:ring-[#FFC107]/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#0A2E5C] dark:text-zinc-200 mb-1.5">
                  New Password
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-zinc-400">
                    <Lock className="h-4 w-4" />
                  </div>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-xl border border-[#E5E7EB] bg-[#F8FAFC]/50 py-2.5 pl-10 pr-3 text-xs text-[#0A2E5C] placeholder-zinc-400 focus:border-[#FFC107] focus:outline-none focus:ring-2 focus:ring-[#FFC107]/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#0A2E5C] dark:text-zinc-200 mb-1.5">
                  Confirm New Password
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-zinc-400">
                    <Lock className="h-4 w-4" />
                  </div>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-xl border border-[#E5E7EB] bg-[#F8FAFC]/50 py-2.5 pl-10 pr-3 text-xs text-[#0A2E5C] placeholder-zinc-400 focus:border-[#FFC107] focus:outline-none focus:ring-2 focus:ring-[#FFC107]/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white transition-all"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isVerifying}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#0A2E5C] py-3 text-xs font-bold text-[#FFC107] border border-[#FFC107]/40 shadow-md hover:bg-[#141A24] transition active:scale-95 cursor-pointer mt-1"
              >
                {isVerifying ? (
                  <span>Verifying & Resetting...</span>
                ) : (
                  <>
                    <span>Verify OTP & Set Password</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setStep("request")}
                  className="text-xs text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 cursor-pointer"
                >
                  Change Email
                </button>
                <button
                  type="button"
                  onClick={handleRequestOtp}
                  disabled={isLoading}
                  className="text-xs font-bold text-[#0B5ED7] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className={`h-3 w-3 ${isLoading ? "animate-spin" : ""}`} /> Resend OTP
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleRequestOtp} className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-[#0A2E5C] dark:text-zinc-200 mb-1.5">
                  Registered Email Address
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
                    placeholder="john@example.com"
                    className="w-full rounded-xl border border-[#E5E7EB] bg-[#F8FAFC]/50 py-2.5 pl-10 pr-3 text-xs text-[#0A2E5C] placeholder-zinc-400 focus:border-[#FFC107] focus:outline-none focus:ring-2 focus:ring-[#FFC107]/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white transition-all"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#0A2E5C] py-3 text-xs font-bold text-[#FFC107] border border-[#FFC107]/40 shadow-md hover:bg-[#141A24] transition active:scale-95 cursor-pointer mt-2"
              >
                {isLoading ? (
                  <span>Sending OTP code...</span>
                ) : (
                  <>
                    <span>Send OTP & Reset Link</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>
          )}

          <div className="mt-8 text-center text-xs text-[#0A2E5C] dark:text-zinc-300">
            Remember your password?{" "}
            <Link href="/login" className="font-bold text-[#0B5ED7] hover:text-[#FFC107] transition-colors">
              Sign in
            </Link>
          </div>
        </div>
      </div>

      {/* Google Sign-In Account Detected Modal */}
      {showGoogleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-md rounded-3xl bg-white dark:bg-[#0A2E5C] border border-[#E5E7EB] dark:border-zinc-800 p-6 sm:p-8 shadow-2xl text-center">
            <button
              type="button"
              onClick={() => setShowGoogleModal(false)}
              className="absolute top-4 right-4 h-8 w-8 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-zinc-700 dark:hover:text-white flex items-center justify-center transition cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Google Logo */}
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 shadow-sm mb-4">
              <svg className="h-7 w-7" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.65v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.14z"/>
                <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.26v3.15C3.29 21.43 7.37 24 12 24z"/>
                <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.26C.46 8.17 0 9.97 0 12s.46 3.83 1.26 5.42l4.02-3.15z"/>
                <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.37 0 3.29 2.57 1.26 6.58l4.02 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
              </svg>
            </div>

            <h3 className="text-lg font-black text-[#0A2E5C] dark:text-white mb-1.5">
              Google Sign-In Account
            </h3>
            <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed mb-4">
              The student account for <strong className="text-[#0A2E5C] dark:text-white font-bold">{googleUserEmail}</strong> was created using <strong>Google Sign-In</strong>.
            </p>

            <div className="rounded-2xl bg-[#F8F7F4] dark:bg-zinc-800/80 border border-[#EAE3D9] dark:border-zinc-700/60 p-4 text-left text-xs text-zinc-600 dark:text-zinc-300 mb-6 space-y-2">
              <div className="flex items-start gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                <p>
                  You do not have a separate library password. Your account is verified securely by Google.
                </p>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-amber-500 font-bold text-sm leading-none shrink-0 mt-0.5">💡</span>
                <p>
                  To change or reset your password, you must update your <strong>Google / Gmail Account Password</strong> directly in your Google Security settings.
                </p>
              </div>
            </div>

            <div className="space-y-2.5">
              <a
                href="https://myaccount.google.com/signinoptions/password"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#0A2E5C] dark:bg-[#FFC107] py-3 text-xs font-bold text-[#FFC107] dark:text-[#0A2E5C] shadow-md hover:bg-[#141A24] dark:hover:bg-[#a88f72] transition active:scale-95 cursor-pointer"
              >
                <span>Open Google to Change Password</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </a>

              <button
                type="button"
                onClick={handleGoogleSignIn}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 py-2.5 text-xs font-bold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition active:scale-95 cursor-pointer"
              >
                <span>Continue with Google Sign-In</span>
              </button>

              <button
                type="button"
                onClick={() => setShowGoogleModal(false)}
                className="w-full text-xs font-semibold text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 py-1 transition cursor-pointer"
              >
                Back / Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <ForgotPasswordForm />
    </Suspense>
  );
}
