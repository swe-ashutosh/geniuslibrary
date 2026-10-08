/**
 * [WEB • APP] 404 Page
 *
 * (Small helper file — see code comments below.)
 */

import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";
import { Home, ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <main className="min-h-screen bg-[#F8FAFC] dark:bg-[#141A24] flex flex-col items-center justify-center p-4 text-center selection:bg-[#FFC107] selection:text-[#0A2E5C]">
      <div className="max-w-md w-full rounded-3xl border border-[#E5E7EB] bg-white p-8 shadow-xl dark:border-zinc-800 dark:bg-[#0A2E5C] text-center space-y-4">
        <div className="flex justify-center mb-2">
          <BrandLogo variant="navbar" size="lg" />
        </div>

        <div className="text-6xl font-black text-[#FFC107]">404</div>

        <h1 className="text-xl font-black text-[#0A2E5C] dark:text-white">
          Page Not Found
        </h1>

        <p className="text-xs text-[#6B7280] dark:text-zinc-300 leading-relaxed">
          The page or desk portal you are looking for might have been moved, renamed, or is temporarily unavailable.
        </p>

        <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/"
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#0A2E5C] text-[#FFC107] border border-[#FFC107]/40 px-5 py-3 text-xs font-bold hover:bg-[#141A24] transition-all shadow-md active:scale-95"
          >
            <Home className="h-4 w-4" />
            <span>Return to Homepage</span>
          </Link>
          <Link
            href="/student"
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#F8FAFC] text-[#0A2E5C] border border-[#E5E7EB] px-5 py-3 text-xs font-bold hover:bg-[#E5E7EB]/30 dark:bg-zinc-800 dark:text-zinc-200 dark:border-zinc-700 transition-all"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Student Desk</span>
          </Link>
        </div>
      </div>
    </main>
  );
}
