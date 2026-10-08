"use client";

/**
 * [WEB • PAGE] Update Password
 *
 * Sets a new password from the reset link.
 */
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";
import { Lock, ArrowRight, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { unlockAccountAfterPasswordReset } from "@/lib/security";

function UpdatePasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const emailParam = searchParams.get("email") || "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [isUpdated, setIsUpdated] = useState(false);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (password.length < 6) {
      setErrorMsg("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg("Passwords do not match.");
      return;
    }

    setIsLoading(true);

    const supabase = createClient();
    const { data: updateData, error } = await supabase.auth.updateUser({ password });

    setIsLoading(false);

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    // Unlock the account from the 5-attempt security lock
    const targetEmail = emailParam || updateData.user?.email;
    unlockAccountAfterPasswordReset(targetEmail);

    setIsUpdated(true);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#141A24] flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] bg-[#FFC107]/10 blur-[100px] pointer-events-none rounded-full" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center relative z-10">
        <div className="flex justify-center">
          <BrandLogo variant="navbar" size="lg" />
        </div>
        <h1 className="mt-4 text-2xl font-black tracking-tight text-[#0A2E5C] dark:text-white">
          Set new password
        </h1>
        <p className="mt-1 text-xs text-[#0B5ED7]">
          Your new password must be different from previously used passwords.
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md px-4 relative z-10">
        <div className="rounded-3xl border border-[#E5E7EB] bg-white p-6 sm:p-8 shadow-xl shadow-[#0A2E5C]/5 backdrop-blur-md dark:border-zinc-800 dark:bg-[#0A2E5C]">

          {isUpdated ? (
            <div className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 mb-4">
                <CheckCircle2 className="h-6 w-6 text-emerald-600" />
              </div>
              <h3 className="text-lg font-bold text-[#0A2E5C] dark:text-white mb-2">Password updated!</h3>
              <p className="text-xs text-[#6B7280] dark:text-zinc-400 mb-6">
                Your password has been successfully reset. You can now sign in with your new password.
              </p>
              <Link
                href="/login"
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#0A2E5C] py-3 text-xs font-bold text-[#FFC107] border border-[#FFC107]/40 shadow-md hover:bg-[#141A24] transition active:scale-95"
              >
                Sign in
              </Link>
            </div>
          ) : (
            <>
              {errorMsg && (
                <div className="mb-4 rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs text-rose-800">
                  {errorMsg}
                </div>
              )}

              <form onSubmit={handleUpdate} className="space-y-5">
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
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
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
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full rounded-xl border border-[#E5E7EB] bg-[#F8FAFC]/50 py-2.5 pl-10 pr-3 text-xs text-[#0A2E5C] placeholder-zinc-400 focus:border-[#FFC107] focus:outline-none focus:ring-2 focus:ring-[#FFC107]/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white transition-all"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#0A2E5C] py-3 text-xs font-bold text-[#FFC107] border border-[#FFC107]/40 shadow-md hover:bg-[#141A24] transition active:scale-95 mt-2"
                >
                  {isLoading ? (
                    <span>Updating password...</span>
                  ) : (
                    <>
                      <span>Update Password</span>
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </form>
            </>
          )}

          <div className="mt-8 text-center text-xs text-[#0A2E5C] dark:text-zinc-300">
            Remember your password?{" "}
            <Link href="/login" className="font-bold text-[#0B5ED7] hover:text-[#FFC107] transition-colors">
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function UpdatePasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <UpdatePasswordForm />
    </Suspense>
  );
}
