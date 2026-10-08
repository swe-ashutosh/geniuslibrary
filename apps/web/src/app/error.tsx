"use client";

/**
 * [WEB • APP] App-Level Error Boundary
 *
 * (Small helper file — see code comments below.)
 */
import { useEffect } from "react";
import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";
import { BRAND_CONFIG } from "@/lib/config";
import { RotateCcw, Home, AlertTriangle, MessageCircle } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log error securely for diagnostics
    console.error("[Application Error Caught]:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#141A24] flex flex-col items-center justify-center p-4 sm:p-6 text-center selection:bg-[#FFC107] selection:text-[#0A2E5C]">
      {/* Background glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] bg-[#FFC107]/10 blur-[120px] pointer-events-none rounded-full" />

      <div className="relative z-10 max-w-lg w-full rounded-3xl border border-[#E5E7EB] bg-white p-7 sm:p-9 shadow-2xl dark:border-zinc-800 dark:bg-[#0A2E5C] text-center">
        {/* Brand Header */}
        <div className="flex justify-center mb-6">
          <BrandLogo variant="navbar" size="lg" />
        </div>

        {/* Warning Icon */}
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10 text-[#0B5ED7] dark:text-[#FFC107] border border-[#FFC107]/30 mb-5 shadow-sm">
          <AlertTriangle className="h-8 w-8 text-[#0B5ED7] dark:text-[#FFC107]" />
        </div>

        <h1 className="text-xl sm:text-2xl font-black text-[#0A2E5C] dark:text-white">
          Something went wrong
        </h1>
        <p className="mt-2 text-xs sm:text-sm text-[#6B7280] dark:text-zinc-300 leading-relaxed">
          An unexpected issue occurred while processing your request. Don&apos;t worry, your data and account are safe.
        </p>

        {/* Error Reference Code (Safe without exposing internal stack trace) */}
        {error?.digest && (
          <div className="my-4 inline-block rounded-lg bg-zinc-100 dark:bg-zinc-800/80 px-3 py-1 font-mono text-[11px] text-zinc-500">
            Reference ID: {error.digest}
          </div>
        )}

        {/* Action Buttons */}
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={() => reset()}
            type="button"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-[#0A2E5C] text-[#FFC107] border border-[#FFC107]/40 px-5 py-3 text-xs font-bold shadow-md hover:bg-[#141A24] transition-all active:scale-95 cursor-pointer"
          >
            <RotateCcw className="h-4 w-4" />
            <span>Try Again</span>
          </button>

          <Link
            href="/"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-[#F8FAFC] text-[#0A2E5C] border border-[#E5E7EB] px-5 py-3 text-xs font-bold hover:bg-[#E5E7EB]/30 dark:bg-zinc-800 dark:text-zinc-200 dark:border-zinc-700 transition-all cursor-pointer"
          >
            <Home className="h-4 w-4" />
            <span>Go to Homepage</span>
          </Link>
        </div>

        {/* Support Help Desk */}
        <div className="mt-8 pt-5 border-t border-[#E5E7EB]/60 dark:border-zinc-800 flex items-center justify-center gap-2 text-xs text-[#0B5ED7]">
          <MessageCircle className="h-4 w-4" />
          <span>Need help? Contact Desk:</span>
          <a
            href={`https://wa.me/${BRAND_CONFIG.phone.replace(/[^0-9]/g, "")}?text=${encodeURIComponent("Hello Front Desk, I encountered a temporary glitch on the library website. Please assist me.")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold underline text-[#0A2E5C] dark:text-[#E5E7EB] hover:text-[#FFC107]"
          >
            WhatsApp Support
          </a>
        </div>
      </div>
    </div>
  );
}
