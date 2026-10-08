"use client";

/**
 * [WEB • PAGE] Admin Section Error Boundary
 *
 * (Small helper file — see code comments below.)
 */
import { useEffect } from "react";
import Link from "next/link";
import { RotateCcw, LayoutDashboard, AlertCircle } from "lucide-react";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Admin Module Error Caught]:", error);
  }, [error]);

  return (
    <div className="p-6 sm:p-10 flex flex-col items-center justify-center min-h-[60vh] text-center">
      <div className="max-w-md w-full rounded-3xl border border-rose-200 dark:border-rose-900/50 bg-white dark:bg-[#0A2E5C] p-8 shadow-xl space-y-4">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 border border-rose-200 dark:border-rose-800">
          <AlertCircle className="h-7 w-7" />
        </div>

        <h2 className="text-xl font-bold text-[#0A2E5C] dark:text-white">
          Admin Console Notice
        </h2>

        <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
          The requested admin view encountered an unexpected issue while retrieving data. Your administration session remains active.
        </p>

        <div className="pt-3 flex flex-col sm:flex-row items-center justify-center gap-2.5">
          <button
            onClick={() => reset()}
            type="button"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-[#0A2E5C] text-[#FFC107] border border-[#FFC107]/40 px-4 py-2.5 text-xs font-bold hover:bg-[#141A24] transition-all cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Retry Action</span>
          </button>
          <Link
            href="/admin"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 px-4 py-2.5 text-xs font-bold hover:bg-zinc-200 transition-all"
          >
            <LayoutDashboard className="h-3.5 w-3.5" />
            <span>Admin Home</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
