"use client";

/**
 * [WEB • COMPONENT] Public Navbar
 *
 * Top navigation for marketing pages with login CTA.
 */
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandLogo } from "./BrandLogo";
import { BRAND_CONFIG, isMasterAdminEmail } from "@/lib/config";
import { createClient } from "@/lib/supabase/client";
import { checkInactivityExpiry, getSavedUserRole } from "@/lib/authInactivity";
import {
  Menu,
  X,
  LogIn,
  LayoutDashboard,
  MapPin,
  Phone,
  Home,
  Info,
  Image as ImageIcon,
  Clock,
  PhoneCall
} from "lucide-react";

export function Navbar() {
  const pathname = usePathname();
  const [sessionUser, setSessionUser] = useState<{ role: string; href: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const { isExpired } = checkInactivityExpiry();
          if (!isExpired) {
            const savedRole = getSavedUserRole() || session.user.user_metadata?.role;
            const isAdmin = isMasterAdminEmail(session.user.email) || savedRole === "admin";
            setSessionUser({
              role: isAdmin ? "Admin" : (savedRole === "staff" ? "Staff" : "Dashboard"),
              href: isAdmin ? "/admin/" : (savedRole === "staff" ? "/staff/" : "/student/"),
            });
          }
        }
      } catch {}
    })();
  }, []);
  
  // Determine if a link is active for the bottom bar
  const isActive = (path: string) => {
    if (path === "/" && pathname === "/") return true;
    if (path !== "/" && pathname.includes(path)) return true;
    return false; // Very basic active state logic
  };

  return (
    <>
      {/* Desktop Top Navbar & Mobile Header */}
      <header className="sticky top-0 z-50 w-full border-b border-[#E5E7EB]/60 bg-white/95 backdrop-blur-md dark:border-[#0A2E5C] dark:bg-[#0A2E5C]/95 transition-colors">
        {/* Top Banner with Sanskrit motto & Location - Hidden on mobile */}
        <div className="hidden md:block bg-[#0A2E5C] px-4 py-1.5 text-center text-xs font-semibold text-white border-b border-[#FFC107]/30">
          <div className="mx-auto flex max-w-7xl items-center justify-between">
            <span className="inline-flex items-center gap-2">
              <span className="text-[#FFC107] font-bold">|| विद्या विनयेन शोभते ||</span>
              <span className="text-zinc-500">•</span>
              <span className="inline-flex items-center gap-1.5 text-zinc-300">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span>Madhupur's Premium Digital Library • <strong>Open 24/7</strong></span>
              </span>
            </span>
            <div className="flex items-center gap-4 text-xs text-zinc-300">
              <span className="inline-flex items-center gap-1 text-[#FFC107]">
                <MapPin className="h-3.5 w-3.5" /> {BRAND_CONFIG.location}
              </span>
              <span className="inline-flex items-center gap-1">
                <Phone className="h-3.5 w-3.5 text-[#FFC107]" /> {BRAND_CONFIG.phone}
              </span>
            </div>
          </div>
        </div>

        <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8 py-3">
          {/* Brand Logo - Visible everywhere */}
          <div className="flex items-center">
            <BrandLogo variant="navbar" size="lg" showText={false} />
          </div>

          {/* Navigation Links - Centered (Hidden on mobile) */}
          <div className="hidden md:flex flex-1 justify-center items-center gap-8 text-sm font-semibold text-[#6B7280] dark:text-zinc-300">
            <Link href="/" className="hover:text-[#0B5ED7] transition-colors">
              Home
            </Link>
            <Link href="/#about" className="hover:text-[#0B5ED7] transition-colors">
              About Us
            </Link>
            <Link href="/#gallery" className="hover:text-[#0B5ED7] transition-colors">
              Gallery
            </Link>
            <Link href="/#shifts" className="hover:text-[#0B5ED7] transition-colors">
              Plans
            </Link>
            <Link href="/#contact" className="hover:text-[#0B5ED7] transition-colors">
              Contact Us
            </Link>
          </div>

          {/* Action Button - Dynamic Dashboard or Login Button */}
          <div className="flex items-center">
            {sessionUser ? (
              <Link
                href={sessionUser.href}
                className="inline-flex items-center gap-1.5 md:gap-2 rounded-xl bg-linear-to-r from-[#0B5ED7] to-[#FFC107] px-3.5 py-2 md:px-5 md:py-2.5 text-[11px] md:text-xs font-black text-[#0A2E5C] shadow-sm hover:opacity-95 transition-all active:scale-95"
              >
                <LayoutDashboard className="h-3.5 w-3.5" />
                <span>{sessionUser.role} Portal</span>
              </Link>
            ) : (
              <Link
                href="/login/"
                className="inline-flex items-center gap-1.5 md:gap-2 rounded-xl bg-[#0A2E5C] px-3.5 py-2 md:px-5 md:py-2.5 text-[11px] md:text-xs font-bold text-[#FFC107] border border-[#FFC107]/40 shadow-sm hover:bg-[#141A24] transition-all active:scale-95 hover:shadow-md"
              >
                <LogIn className="h-3.5 w-3.5 text-[#FFC107]" />
                <span>Login</span>
              </Link>
            )}
          </div>
        </nav>
      </header>

      {/* Mobile Bottom Navigation Bar (Hidden on desktop) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 border-t border-[#E5E7EB]/70 shadow-[0_-6px_20px_rgba(0,0,0,0.06)] dark:bg-[#0A2E5C]/95 dark:border-zinc-800 backdrop-blur-md py-1 px-1.5 pb-[calc(0.25rem+env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-around max-w-md mx-auto">
          
          <Link href="/" className="flex flex-col items-center justify-center gap-0.5 group active:scale-90 transition-transform select-none py-0.5 px-2 cursor-pointer focus:outline-none">
            <div className={`flex h-8 w-8 items-center justify-center rounded-xl transition-all duration-200 shadow-xs ${isActive("/") ? "bg-linear-to-tr from-[#0B5ED7] to-[#FFC107] text-[#0A2E5C] shadow-sm shadow-[#0B5ED7]/30 scale-105" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 group-hover:bg-[#FFC107]/20 group-hover:text-[#0B5ED7]"}`}>
              <Home className={`h-4 w-4 ${isActive("/") ? "stroke-[2.5]" : "stroke-[1.75]"}`} />
            </div>
            <span className={`text-[9.5px] tracking-tight leading-none ${isActive("/") ? "font-black text-[#0B5ED7] dark:text-[#FFC107]" : "font-semibold text-zinc-500 dark:text-zinc-400"}`}>Home</span>
          </Link>
          
          <Link href="/#about" className="flex flex-col items-center justify-center gap-0.5 group active:scale-90 transition-transform select-none py-0.5 px-2 cursor-pointer focus:outline-none">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 group-hover:bg-[#FFC107]/20 group-hover:text-[#0B5ED7] transition-all duration-200 shadow-xs">
              <Info className="h-4 w-4 stroke-[1.75]" />
            </div>
            <span className="text-[9.5px] tracking-tight leading-none font-semibold text-zinc-500 dark:text-zinc-400">About</span>
          </Link>

          <Link href="/#gallery" className="flex flex-col items-center justify-center gap-0.5 group active:scale-90 transition-transform select-none py-0.5 px-2 cursor-pointer focus:outline-none">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 group-hover:bg-[#FFC107]/20 group-hover:text-[#0B5ED7] transition-all duration-200 shadow-xs">
              <ImageIcon className="h-4 w-4 stroke-[1.75]" />
            </div>
            <span className="text-[9.5px] tracking-tight leading-none font-semibold text-zinc-500 dark:text-zinc-400">Gallery</span>
          </Link>

          <Link href="/#shifts" className="flex flex-col items-center justify-center gap-0.5 group active:scale-90 transition-transform select-none py-0.5 px-2 cursor-pointer focus:outline-none">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 group-hover:bg-[#FFC107]/20 group-hover:text-[#0B5ED7] transition-all duration-200 shadow-xs">
              <Clock className="h-4 w-4 stroke-[1.75]" />
            </div>
            <span className="text-[9.5px] tracking-tight leading-none font-semibold text-zinc-500 dark:text-zinc-400">Plans</span>
          </Link>

          <Link href="/#contact" className="flex flex-col items-center justify-center gap-0.5 group active:scale-90 transition-transform select-none py-0.5 px-2 cursor-pointer focus:outline-none">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 group-hover:bg-[#FFC107]/20 group-hover:text-[#0B5ED7] transition-all duration-200 shadow-xs">
              <PhoneCall className="h-4 w-4 stroke-[1.75]" />
            </div>
            <span className="text-[9.5px] tracking-tight leading-none font-semibold text-zinc-500 dark:text-zinc-400">Contact</span>
          </Link>

        </div>
      </nav>
    </>
  );
}
