"use client";

/**
 * [WEB • PAGE] Student Section Error Boundary
 *
 * (Small helper file — see code comments below.)
 */
import { useEffect } from "react";
import Link from "next/link";
import { RotateCcw, Home, AlertCircle } from "lucide-react";

export default function StudentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Student Portal Error Caught]:", error);
  }, [error]);

  return (
    <div className="p-6 sm:p-10 flex flex-col items-center justify-center min-h-[60vh] text-center">
      <div className="max-w-md w-full rounded-3xl border border-[#FFC107]/40 bg-white dark:bg-[#0A2E5C] p-8 shadow-xl space-y-4">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 dark:bg-amber-950/50 text-[#0B5ED7] dark:text-[#FFC107] border border-[#FFC107]/30">
          <AlertCircle className="h-7 w-7" />
        </div>

        <h2 className="text-xl font-bold text-[#0A2E5C] dark:text-white">
          Student Portal Notice
        </h2>

        <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
          We could not load this section right now. Your seat and enrollment details are safely stored.
        </p>

        <div className="pt-3 flex flex-col sm:flex-row items-center justify-center gap-2.5">
          <button
            onClick={() => reset()}
            type="button"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-[#0A2E5C] text-[#FFC107] border border-[#FFC107]/40 px-4 py-2.5 text-xs font-bold hover:bg-[#141A24] transition-all cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Reload Desk</span>
          </button>
          <Link
            href="/student"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-[#F8FAFC] text-[#0A2E5C] border border-[#E5E7EB] px-4 py-2.5 text-xs font-bold hover:bg-[#E5E7EB]/30 dark:bg-zinc-800 dark:text-zinc-200 dark:border-zinc-700 transition-all"
          >
            <Home className="h-3.5 w-3.5" />
            <span>Dashboard</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
