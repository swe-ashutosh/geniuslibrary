"use client";

/**
 * [WEB • APP] Global Error Boundary
 *
 * Last-resort UI when even the root layout crashes.
 */
import { useEffect } from "react";
import Link from "next/link";
import { BRAND_CONFIG } from "@/lib/config";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Fatal Global Error Caught]:", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen bg-[#0A2E5C] text-white flex flex-col items-center justify-center p-4 font-sans">
        <div className="max-w-md w-full rounded-3xl border border-[#FFC107]/40 bg-[#141A24] p-8 text-center shadow-2xl space-y-5">
          <div className="text-3xl">⚠️</div>
          <h1 className="text-xl font-black text-[#FFC107]">
            {BRAND_CONFIG.fullName}
          </h1>
          <p className="text-xs text-[#E5E7EB] leading-relaxed">
            The system encountered a critical layout error. The error has been logged for maintenance.
          </p>

          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => reset()}
              type="button"
              className="w-full rounded-xl bg-[#FFC107] text-[#0A2E5C] px-5 py-2.5 text-xs font-bold hover:bg-[#E5E7EB] transition active:scale-95"
            >
              Try Reloading
            </button>
            <Link
              href="/"
              className="w-full rounded-xl border border-white/20 bg-white/10 px-5 py-2.5 text-xs font-bold hover:bg-white/20 transition"
            >
              Go to Home
            </Link>
          </div>

          <p className="text-[11px] text-zinc-400">
            Desk Helpline: {BRAND_CONFIG.phone}
          </p>
        </div>
      </body>
    </html>
  );
}
