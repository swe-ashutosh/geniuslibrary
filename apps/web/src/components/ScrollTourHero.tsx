"use client";

/**
 * [WEB • COMPONENT] Landing Hero + 3D Tour
 *
 * Scroll-driven library tour, WhatsApp/book-desk CTAs from BRAND_CONFIG.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { 
  ArrowRight, 
  Sparkles, 
  Play, 
  Pause, 
  Volume2, 
  VolumeX, 
  MapPin, 
  Wifi, 
  Snowflake, 
  Zap, 
  BookOpen, 
  ShieldCheck,
  ChevronDown
} from "lucide-react";
import { BRAND_CONFIG } from "@/lib/config";

const TOUR_STEPS = [
  { id: "gate", label: "Library Gate", start: 0, end: 0.25, icon: MapPin },
  { id: "entrance", label: "Glass Door Entry", start: 0.25, end: 0.45, icon: Sparkles },
  { id: "reception", label: "Counseling Desk", start: 0.45, end: 0.65, icon: ShieldCheck },
  { id: "hall", label: "Silent Study Hall", start: 0.65, end: 0.85, icon: Snowflake },
  { id: "desks", label: "Personal Cabins & Books", start: 0.85, end: 1.0, icon: BookOpen },
];

export function ScrollTourHero() {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const targetTimeRef = useRef<number>(0);
  const rafIdRef = useRef<number | null>(null);

  const [mounted, setMounted] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [isPlayingAuto, setIsPlayingAuto] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Smooth video timeline interpolation loop (Lerp for 60fps cinematic feel)
  useEffect(() => {
    let active = true;
    const loop = () => {
      if (!active) return;
      const video = videoRef.current;
      if (video && video.duration && !isPlayingAuto) {
        const diff = targetTimeRef.current - video.currentTime;
        // Smoothly approach target time (lerp factor 0.18)
        if (Math.abs(diff) > 0.02) {
          video.currentTime += diff * 0.18;
        }
      }
      rafIdRef.current = requestAnimationFrame(loop);
    };

    rafIdRef.current = requestAnimationFrame(loop);
    return () => {
      active = false;
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    };
  }, [isPlayingAuto]);

  // Handle Scroll to update scrub target
  useEffect(() => {
    const handleScroll = () => {
      if (!containerRef.current || isPlayingAuto) return;
      const rect = containerRef.current.getBoundingClientRect();
      const totalScrollable = containerRef.current.offsetHeight - window.innerHeight;
      if (totalScrollable <= 0) return;

      const progress = Math.min(Math.max(-rect.top / totalScrollable, 0), 1);
      setScrollProgress(progress);

      const video = videoRef.current;
      if (video && video.duration) {
        targetTimeRef.current = progress * video.duration;
      }

      // Determine step
      const stepIdx = TOUR_STEPS.findIndex(
        (s) => progress >= s.start && progress <= s.end
      );
      if (stepIdx !== -1) setCurrentStepIndex(stepIdx);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, [isPlayingAuto]);

  // Auto-play / Pause toggle
  const toggleAutoPlay = () => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlayingAuto) {
      video.pause();
      setIsPlayingAuto(false);
    } else {
      setIsMuted(false);
      video.muted = false;
      video.play().then(() => {
        setIsPlayingAuto(true);
      }).catch(() => {
        video.muted = true;
        setIsMuted(true);
        video.play();
        setIsPlayingAuto(true);
      });
    }
  };

  // Jump to specific tour section
  const jumpToStep = (index: number) => {
    if (!containerRef.current) return;
    const step = TOUR_STEPS[index];
    const totalScrollable = containerRef.current.offsetHeight - window.innerHeight;
    const targetY = containerRef.current.offsetTop + step.start * totalScrollable;
    window.scrollTo({ top: targetY, behavior: "smooth" });
  };

  const CurrentStepIcon = TOUR_STEPS[currentStepIndex]?.icon || MapPin;

  return (
    <section 
      ref={containerRef}
      id="hero"
      aria-label="3D Interactive Library Tour"
      className="relative h-[340vh] sm:h-[360vh] bg-[#0E131C] text-white selection:bg-[#FFC107] selection:text-[#0E131C]"
    >
      {/* Sticky Fullscreen 3D Viewport (100dvh for mobile address bar stability) */}
      <div className="sticky top-0 h-[100dvh] w-full overflow-hidden flex flex-col justify-between">
        
        {/* Layer 1: Background Video Container */}
        <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
          {/* Subtle Ambient Background Gradient */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#0E131C] via-[#141A24]/70 to-[#0E131C] pointer-events-none" />
          
          {/* Responsive Video:
              - On Mobile: object-contain inside an upper container so the 16:9 frame is 100% visible, never cut off!
              - On Desktop: sm:object-cover for widescreen fullscreen immersion!
          */}
          <video
            ref={videoRef}
            src="/library-tour.mp4"
            playsInline
            muted={isMuted}
            preload="auto"
            onLoadedMetadata={() => setIsVideoLoaded(true)}
            className="w-full h-full object-contain sm:object-cover select-none pointer-events-none filter contrast-[1.05] brightness-95"
          />

          {/* Vignette Overlays for Visual Depth */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0E131C] via-transparent to-[#0E131C]/90 pointer-events-none" />
          <div className="hidden sm:block absolute inset-0 bg-radial from-transparent via-black/20 to-black/70 pointer-events-none" />
        </div>

        {/* Layer 2: Top Progress & Tour Stepper Bar */}
        <div className="relative z-20 w-full pt-16 sm:pt-24 px-3 sm:px-6 pointer-events-none">
          <div className="max-w-4xl mx-auto flex items-center justify-between gap-2 sm:gap-3">
            
            {/* Mobile: Compact Step Indicator Pill */}
            <div className="sm:hidden pointer-events-auto flex items-center gap-1.5 bg-black/75 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/15 text-xs font-bold text-[#E5E7EB] shadow-lg">
              <CurrentStepIcon className="w-3.5 h-3.5 text-[#FFC107] shrink-0" />
              <span className="truncate max-w-[155px]">
                {currentStepIndex + 1}/5: {TOUR_STEPS[currentStepIndex].label}
              </span>
            </div>

            {/* Desktop: Full 5-Step Buttons */}
            <div className="hidden sm:flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar pointer-events-auto bg-black/60 backdrop-blur-md p-1.5 rounded-full border border-white/10 shadow-lg">
              {TOUR_STEPS.map((step, idx) => {
                const Icon = step.icon;
                const isActive = currentStepIndex === idx;
                return (
                  <button
                    key={step.id}
                    onClick={() => jumpToStep(idx)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                      isActive 
                        ? "bg-[#FFC107] text-[#0E131C] shadow-md shadow-[#FFC107]/30 scale-105" 
                        : "text-zinc-300 hover:text-white hover:bg-white/10"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span>{step.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Controls (Sound + Auto Tour) */}
            <div className="flex items-center gap-1.5 sm:gap-2 pointer-events-auto shrink-0">
              <button
                onClick={() => {
                  const video = videoRef.current;
                  if (video) {
                    video.muted = !isMuted;
                    setIsMuted(!isMuted);
                  }
                }}
                title={isMuted ? "Unmute Audio" : "Mute Audio"}
                className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full bg-black/75 backdrop-blur-md border border-white/15 text-white hover:bg-white/20 transition cursor-pointer"
              >
                {isMuted ? <VolumeX className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Volume2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#FFC107]" />}
              </button>

              <button
                onClick={toggleAutoPlay}
                className="flex items-center gap-1 sm:gap-1.5 px-3 sm:px-3.5 py-1.5 rounded-full bg-black/75 backdrop-blur-md border border-white/15 text-xs font-bold text-white hover:bg-white/20 transition cursor-pointer"
              >
                {isPlayingAuto ? (
                  <>
                    <Pause className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-400" />
                    <span>Pause</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-emerald-400 fill-emerald-400" />
                    <span>Auto Tour</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Thin Gold Progress Track */}
          <div className="max-w-4xl mx-auto mt-2 h-1 bg-white/20 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-[#FFC107] to-[#E3D3C1] transition-all duration-150"
              style={{ width: `${scrollProgress * 100}%` }}
            />
          </div>
        </div>

        {/* Spacer for Middle Viewport (Keeps video clean and visible on mobile) */}
        <div className="flex-1 pointer-events-none" />

        {/* Layer 3: Dynamic Storytelling Content Cards (Positioned neatly at bottom above mobile nav) */}
        <div className="relative z-20 w-full pb-20 sm:pb-10 px-3 sm:px-6 pointer-events-none flex justify-center">
          
          {/* PHASE 1: Library Entrance & Street Gate (0% - 25%) */}
          <div 
            className={`w-full max-w-xl transition-all duration-500 ${
              scrollProgress < 0.22 
                ? "opacity-100 trangray-y-0 scale-100" 
                : "opacity-0 trangray-y-8 scale-95 hidden"
            }`}
          >
            <div className="bg-black/80 sm:bg-black/65 backdrop-blur-xl p-4 sm:p-6 rounded-3xl border border-white/15 shadow-2xl text-center">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-[#FFC107]/50 bg-black/50 px-3 py-1 text-[11px] font-bold text-[#FFC107] mb-2 sm:mb-3">
                <Sparkles className="h-3 w-3 text-[#FFC107]" />
                <span>|| विद्या विनयेन शोभते ||</span>
              </div>

              <h1 className="text-xl sm:text-3xl md:text-4xl font-black tracking-tight text-white">
                {BRAND_CONFIG.hindiName}
                <span className="block text-sm sm:text-xl text-[#FFC107] font-medium mt-0.5 sm:mt-1">
                  {BRAND_CONFIG.fullName}
                </span>
              </h1>

              <p className="text-xs sm:text-sm text-zinc-300 mt-1.5 sm:mt-2 leading-relaxed">
                Sonbhadra&apos;s premier 24/7 digital study hall in <strong className="text-white">Main Market, Madhupur</strong>.
              </p>

              <div className="mt-3 flex items-center justify-center gap-1.5 text-xs font-bold text-[#FFC107] animate-bounce">
                <span>Scroll Down To Enter Gate</span>
                <ChevronDown className="w-4 h-4" />
              </div>
            </div>
          </div>

          {/* PHASE 2: Entering Glass Door & Signboard (25% - 48%) */}
          <div 
            className={`w-full max-w-xl transition-all duration-500 ${
              scrollProgress >= 0.22 && scrollProgress < 0.48 
                ? "opacity-100 trangray-y-0 scale-100" 
                : "opacity-0 trangray-y-8 scale-95 hidden"
            }`}
          >
            <div className="bg-black/80 sm:bg-black/65 backdrop-blur-xl p-4 sm:p-6 rounded-3xl border border-white/15 shadow-2xl text-center">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-[11px] font-bold border border-emerald-500/40 mb-2">
                <ShieldCheck className="w-3.5 h-3.5" /> Biometric &amp; Smart Gate
              </div>

              <h2 className="text-lg sm:text-2xl font-black text-white">
                Step Inside A World of Silent Focus
              </h2>

              <p className="text-xs sm:text-sm text-zinc-300 mt-1.5 leading-relaxed">
                Automated glass entrance, sound-dampened acoustic hall, and 100% disciplined self-study environment.
              </p>
            </div>
          </div>

          {/* PHASE 3: Counseling Desk & Reception (48% - 70%) */}
          <div 
            className={`w-full max-w-xl transition-all duration-500 ${
              scrollProgress >= 0.48 && scrollProgress < 0.70 
                ? "opacity-100 trangray-y-0 scale-100" 
                : "opacity-0 trangray-y-8 scale-95 hidden"
            }`}
          >
            <div className="bg-black/80 sm:bg-black/65 backdrop-blur-xl p-4 sm:p-6 rounded-3xl border border-white/15 shadow-2xl text-center">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FFC107]/20 text-[#E5E7EB] text-[11px] font-bold border border-[#FFC107]/40 mb-2">
                <Zap className="w-3.5 h-3.5 text-[#FFC107]" /> Dedicated Student Support
              </div>

              <h2 className="text-lg sm:text-2xl font-black text-white">
                Front Desk &amp; Dedicated Counseling
              </h2>

              <p className="text-xs sm:text-sm text-zinc-300 mt-1.5 leading-relaxed">
                Instant registration, reserved desk allocations, locker facilities, and daily newspapers.
              </p>
            </div>
          </div>

          {/* PHASE 4: Silent Study Hall & Desks (70% - 88%) */}
          <div 
            className={`w-full max-w-xl transition-all duration-500 ${
              scrollProgress >= 0.70 && scrollProgress < 0.88 
                ? "opacity-100 trangray-y-0 scale-100" 
                : "opacity-0 trangray-y-8 scale-95 hidden"
            }`}
          >
            <div className="bg-black/80 sm:bg-black/65 backdrop-blur-xl p-4 sm:p-6 rounded-3xl border border-white/15 shadow-2xl text-center">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 text-[11px] font-bold border border-blue-500/40 mb-2">
                <Snowflake className="w-3.5 h-3.5" /> 24/7 Fully Air-Conditioned
              </div>

              <h2 className="text-lg sm:text-2xl font-black text-white">
                Ergonomic Desks &amp; 300 Mbps Fiber
              </h2>

              <p className="text-xs sm:text-sm text-zinc-300 mt-1.5 leading-relaxed">
                Individual charging sockets, personal LED lamps, high-back cushion chairs, and pin-drop silence.
              </p>
            </div>
          </div>

          {/* PHASE 5: Bookshelf & Final CTA (88% - 100%) */}
          <div 
            className={`w-full max-w-xl transition-all duration-500 ${
              scrollProgress >= 0.88 
                ? "opacity-100 trangray-y-0 scale-100 pointer-events-auto" 
                : "opacity-0 trangray-y-8 scale-95 hidden pointer-events-none"
            }`}
          >
            <div className="bg-black/85 sm:bg-black/75 backdrop-blur-xl p-4 sm:p-6 rounded-3xl border border-white/20 shadow-2xl text-center">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FFC107]/30 text-[#E3D3C1] text-[11px] font-bold border border-[#FFC107]/60 mb-2">
                <Sparkles className="w-3.5 h-3.5 text-[#FFC107]" /> Admission Open All Shifts
              </div>

              <h2 className="text-lg sm:text-3xl font-black text-white">
                Reserve Your Study Desk Today
              </h2>

              <p className="text-xs sm:text-sm text-zinc-300 mt-1 leading-relaxed">
                Choose your shift (Morning, Afternoon, Evening or 24H) and begin your journey.
              </p>

              <div className="mt-3.5 flex flex-wrap items-center justify-center gap-2">
                <Link
                  href="/login/?role=student"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#FFC107] px-4 py-2.5 text-xs font-black text-[#0E131C] shadow-lg shadow-[#FFC107]/30 hover:bg-[#E5E7EB] transition-all active:scale-95 cursor-pointer"
                >
                  <span>Book Desk Online</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>

                <a
                  href={`https://wa.me/${BRAND_CONFIG.phone.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(`Hello! I watched the 3D library tour and would like to reserve a study desk at ${BRAND_CONFIG.fullName}, ${BRAND_CONFIG.location}.`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#25D366] hover:bg-[#1EBE5D] text-white px-4 py-2.5 text-xs font-bold shadow-md shadow-[#25D366]/30 transition-all active:scale-95 cursor-pointer"
                >
                  <span>WhatsApp Admission</span>
                </a>
              </div>
            </div>
          </div>

        </div>

      </div>
    </section>
  );
}
