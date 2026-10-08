"use client";

/**
 * [WEB • COMPONENT] Hero Banner
 *
 * Distinctive, high-impact hero banner for Genius Library Madhupur.
 * Features high-resolution interior photography, real-time availability badges,
 * shift cards, and instant CTAs (Online Booking, WhatsApp, 3D Video Tour Modal).
 */

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { 
  Sparkles, 
  ArrowRight, 
  CheckCircle2, 
  Play, 
  X, 
  Wifi, 
  Snowflake, 
  Zap, 
  ShieldCheck, 
  MapPin, 
  Phone,
  Clock
} from "lucide-react";
import { BRAND_CONFIG } from "@/lib/config";

export function HeroBanner() {
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);

  const cleanPhone = BRAND_CONFIG.phone.replace(/[^0-9]/g, "");
  const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(
    `Hello! I want to check seat availability at ${BRAND_CONFIG.fullName}, ${BRAND_CONFIG.location}.`
  )}`;

  return (
    <section className="relative bg-[#0A2E5C] dark:bg-[#0E131C] text-white overflow-hidden">
      {/* Hero Background Image with Gradient Overlay */}
      <div className="absolute inset-0 z-0">
        <Image
          src="/hero-banner.jpg"
          alt={`${BRAND_CONFIG.fullName} Modern Study Hall in ${BRAND_CONFIG.location}`}
          fill
          priority
          quality={90}
          className="object-cover object-center filter brightness-[0.75] contrast-[1.05]"
        />
        {/* Multilayered Gradients for High Readability and Brand Colors */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#0A2E5C]/95 via-[#0A2E5C]/85 to-[#0A2E5C]/60 dark:from-[#0E131C]/98 dark:via-[#0E131C]/90 dark:to-[#0E131C]/65" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0A2E5C] via-transparent to-black/40 dark:from-[#0E131C]" />
      </div>

      {/* Content Container */}
      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-28 pb-16 sm:pt-36 sm:pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
          
          {/* Left Column: Heading, Taglines, Badges, CTAs */}
          <div className="lg:col-span-7 space-y-6">
            
            {/* Top Badge: Sanskrit Motto & Location */}
            <div className="inline-flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FFC107]/20 border border-[#FFC107]/50 px-3.5 py-1 text-xs font-bold text-[#FFC107] backdrop-blur-md">
                <Sparkles className="h-3.5 w-3.5 text-[#FFC107] animate-pulse" />
                <span>॥ विद्या विनयेन शोभते ॥</span>
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-white/10 border border-white/20 px-3 py-1 text-xs font-semibold text-zinc-200 backdrop-blur-md">
                <MapPin className="h-3 w-3 text-[#FFC107]" />
                <span>{BRAND_CONFIG.location}</span>
              </span>
            </div>

            {/* Main Title */}
            <div className="space-y-2">
              <p className="text-sm sm:text-base font-bold tracking-wider text-[#FFC107] uppercase">
                {BRAND_CONFIG.hindiName}
              </p>
              <h1 className="text-3xl sm:text-5xl md:text-6xl font-black tracking-tight leading-[1.1] text-white">
                Quiet Mind. <br />
                <span className="bg-gradient-to-r from-[#FFC107] via-amber-200 to-white bg-clip-text text-transparent">
                  Unstoppable Focus.
                </span>
              </h1>
            </div>

            {/* Sub-description */}
            <p className="text-sm sm:text-base text-zinc-200 max-w-xl leading-relaxed font-normal">
              Madhupur&apos;s premier 24/7 air-conditioned digital study library. 
              Personal wooden cabins, 300 Mbps dual fiber, ergonomic mesh chairs, 
              and 100% power backup for serious aspirants.
            </p>

            {/* Key Value Badges */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1 text-xs text-zinc-200 font-semibold">
              <div className="flex items-center gap-2 bg-black/30 backdrop-blur-md px-3 py-2 rounded-xl border border-white/10">
                <CheckCircle2 className="h-4 w-4 text-[#FFC107] shrink-0" />
                <span>Pin-Drop Silence</span>
              </div>
              <div className="flex items-center gap-2 bg-black/30 backdrop-blur-md px-3 py-2 rounded-xl border border-white/10">
                <Wifi className="h-4 w-4 text-sky-400 shrink-0" />
                <span>300 Mbps Dual Fiber</span>
              </div>
              <div className="flex items-center gap-2 bg-black/30 backdrop-blur-md px-3 py-2 rounded-xl border border-white/10">
                <Zap className="h-4 w-4 text-amber-400 shrink-0" />
                <span>100% Power Backup</span>
              </div>
              <div className="flex items-center gap-2 bg-black/30 backdrop-blur-md px-3 py-2 rounded-xl border border-white/10">
                <Snowflake className="h-4 w-4 text-cyan-300 shrink-0" />
                <span>Central AC Hall</span>
              </div>
              <div className="flex items-center gap-2 bg-black/30 backdrop-blur-md px-3 py-2 rounded-xl border border-white/10">
                <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
                <span>Safe for Girls (CCTV)</span>
              </div>
              <div className="flex items-center gap-2 bg-black/30 backdrop-blur-md px-3 py-2 rounded-xl border border-white/10">
                <Clock className="h-4 w-4 text-purple-300 shrink-0" />
                <span>24x7 Open All 365 Days</span>
              </div>
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-wrap items-center gap-3 pt-3">
              <Link
                href="/login/?role=student"
                className="inline-flex items-center gap-2 rounded-2xl bg-[#FFC107] hover:bg-[#ffcd38] text-[#0A2E5C] font-black px-6 py-3.5 text-sm shadow-xl shadow-[#FFC107]/25 transition-all transform hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
              >
                <span>Reserve Your Desk</span>
                <ArrowRight className="h-4 w-4" />
              </Link>

              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-2xl bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold px-5 py-3.5 text-sm shadow-lg shadow-[#25D366]/20 transition-all transform hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
              >
                <Phone className="h-4 w-4" />
                <span>WhatsApp Enquiry</span>
              </a>

              <button
                type="button"
                onClick={() => setIsVideoModalOpen(true)}
                className="inline-flex items-center gap-2 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-semibold px-4 py-3.5 text-sm border border-white/20 backdrop-blur-md transition-all cursor-pointer"
              >
                <Play className="h-4 w-4 text-[#FFC107] fill-[#FFC107]" />
                <span>Watch 3D Tour</span>
              </button>
            </div>

            {/* Live Indicator */}
            <div className="flex items-center gap-2 text-xs text-zinc-300 pt-1">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <span>Seats booking live for Morning, Evening &amp; 24H shifts</span>
            </div>
          </div>

          {/* Right Column: Live Glassmorphic Shift & Seat Status Card */}
          <div className="lg:col-span-5">
            <div className="relative rounded-3xl bg-black/60 dark:bg-black/75 backdrop-blur-xl border border-white/20 p-6 sm:p-7 shadow-2xl space-y-5">
              
              {/* Card Header */}
              <div className="flex items-center justify-between border-b border-white/15 pb-4">
                <div>
                  <span className="text-xs uppercase font-extrabold tracking-wider text-[#FFC107]">
                    24/7 Admission Live
                  </span>
                  <h3 className="text-lg font-black text-white">Membership Plans &amp; Pricing</h3>
                </div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Open 24/7</span>
                </div>
              </div>

              {/* Shift Options List */}
              <div className="space-y-2">
                <div className="flex items-center justify-between p-2.5 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition">
                  <div>
                    <div className="text-xs font-bold text-white flex items-center gap-1.5">
                      <span>Standard (3 Hours Pass)</span>
                      <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-blue-400/20 text-blue-300 font-semibold">Flexible</span>
                    </div>
                    <div className="text-[11px] text-zinc-300">Any 3 Hours Daily • 24/7 Access</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-black text-[#FFC107]">₹300<span className="text-xs font-normal text-zinc-400">/mo</span></div>
                  </div>
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition">
                  <div>
                    <div className="text-xs font-bold text-white flex items-center gap-1.5">
                      <span>Pro / Prime (6 Hours Pass)</span>
                      <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-300 font-semibold">Popular</span>
                    </div>
                    <div className="text-[11px] text-zinc-300">Any 6 Hours Daily • 24/7 Access</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-black text-[#FFC107]">₹500<span className="text-xs font-normal text-zinc-400">/mo</span></div>
                  </div>
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-2xl bg-[#FFC107]/10 border border-[#FFC107]/30 hover:bg-[#FFC107]/15 transition">
                  <div>
                    <div className="text-xs font-bold text-white flex items-center gap-1.5">
                      <span>Prime / Reserve Big</span>
                      <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-emerald-400/20 text-emerald-300 font-semibold">Most Popular</span>
                    </div>
                    <div className="text-[11px] text-zinc-300">24/7 Premium Large Reserved Desk</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-black text-[#FFC107]">₹600<span className="text-xs font-normal text-zinc-400">/mo</span></div>
                  </div>
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-2xl bg-purple-500/10 border border-purple-500/30 hover:bg-purple-500/15 transition">
                  <div>
                    <div className="text-xs font-bold text-white flex items-center gap-1.5">
                      <span>Max / Reserve Locker</span>
                      <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-purple-400/20 text-purple-300 font-semibold">VIP</span>
                    </div>
                    <div className="text-[11px] text-zinc-300">24/7 Reserved Desk + Personal Locker</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-black text-[#FFC107]">₹700<span className="text-xs font-normal text-zinc-400">/mo</span></div>
                  </div>
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition">
                  <div>
                    <div className="text-xs font-bold text-white flex items-center gap-1.5">
                      <span>Night Shift Ultra</span>
                      <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-indigo-400/20 text-indigo-300 font-semibold">Night Owls</span>
                    </div>
                    <div className="text-[11px] text-zinc-300">10:00 PM – 06:00 AM (8 Hours)</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-black text-[#FFC107]">₹500<span className="text-xs font-normal text-zinc-400">/mo</span></div>
                  </div>
                </div>
              </div>

              {/* Card Footer Link */}
              <div className="pt-1">
                <Link
                  href="/login/?role=student"
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-[#0B5ED7] to-[#0A2E5C] hover:from-[#0d6efd] hover:to-[#0B5ED7] text-white text-xs font-bold border border-white/20 transition shadow-md"
                >
                  <span>Check Real-Time Seat Matrix</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Video Tour Modal */}
      {isVideoModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="relative w-full max-w-4xl bg-[#0E131C] rounded-3xl overflow-hidden border border-white/20 shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-black/40">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-[#FFC107]" />
                <h4 className="text-sm font-bold text-white">
                  3D Virtual Tour • {BRAND_CONFIG.fullName} ({BRAND_CONFIG.location})
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setIsVideoModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white transition cursor-pointer"
                aria-label="Close Tour Video"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Video Player */}
            <div className="aspect-video w-full bg-black">
              <video
                src="/library-tour.mp4"
                controls
                autoPlay
                playsInline
                className="w-full h-full object-contain"
              />
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-black/40 border-t border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs">
              <span className="text-zinc-300">
                Experience the atmosphere before visiting in person.
              </span>
              <div className="flex items-center gap-2">
                <Link
                  href="/login/?role=student"
                  onClick={() => setIsVideoModalOpen(false)}
                  className="rounded-xl bg-[#FFC107] text-[#0A2E5C] font-black px-4 py-2 hover:bg-white transition"
                >
                  Book Seat Now
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
