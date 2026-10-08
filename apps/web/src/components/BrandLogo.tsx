/**
 * [WEB • COMPONENT] Library Logo (SVG)
 *
 * Vector logo with gradients + name text, all colors from BRAND_CONFIG.
 */

import Image from "next/image";
import Link from "next/link";
import { BRAND_CONFIG } from "@/lib/config";

interface BrandLogoProps {
  variant?: "full" | "icon" | "navbar";
  className?: string;
  imgClassName?: string;
  href?: string | null | false;
  size?: "sm" | "md" | "h13" | "h15" | "lg" | "xl" | "2xl";
  darkBackground?: boolean;
  showText?: boolean;
}

export function BrandLogo({ 
  variant = "navbar", 
  className = "", 
  imgClassName = "",
  href = "/", 
  size = "md",
  darkBackground = false,
  showText = false
}: BrandLogoProps) {
  const heights: Record<string, string> = {
    sm: "h-8",
    md: "h-11",
    h13: "h-13",
    h15: "h-15",
    lg: "h-14",
    xl: "h-16",
    "2xl": "h-20",
  };

  const imageSizes: Record<string, { width: number; height: number }> = {
    sm: { width: 140, height: 36 },
    md: { width: 180, height: 44 },
    h13: { width: 210, height: 52 },
    h15: { width: 240, height: 60 },
    lg: { width: 220, height: 56 },
    xl: { width: 300, height: 64 },
    "2xl": { width: 360, height: 80 },
  };

  const content = (
    <div className={`flex items-center gap-3 select-none ${className}`}>
      {variant === "icon" ? (
        <div className="relative flex items-center justify-center rounded-xl bg-[#0A2E5C] p-1.5 shadow-md border border-[#FFC107]/40">
          <Image
            src="/icon.png"
            alt={BRAND_CONFIG.fullName}
            width={44}
            height={44}
            className="rounded-lg object-contain"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        </div>
      ) : variant === "navbar" ? (
        <div className="flex items-center gap-3">
          <div className="relative flex items-center">
            <Image
              src="/navbaricon.png"
              alt={BRAND_CONFIG.fullName}
              width={imageSizes[size]?.width || 210}
              height={imageSizes[size]?.height || 52}
              className={`${imgClassName || heights[size] || "h-13"} w-auto object-contain drop-shadow-xs`}
              priority
            />
          </div>
          {showText && (
            <div className="flex flex-col">
              <span className={`text-base sm:text-lg font-black tracking-tight ${darkBackground ? "text-white" : "text-[#0A2E5C] dark:text-white"}`}>
                {BRAND_CONFIG.name} <span className="text-[#FFC107]">{BRAND_CONFIG.subtitle}</span>
              </span>
              <span className="text-[10px] font-semibold text-[#0B5ED7] tracking-wider">
                {BRAND_CONFIG.hindiName}
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-3.5">
          <Image
            src="/logo.png"
            alt={BRAND_CONFIG.fullName}
            width={52}
            height={52}
            className="rounded-xl border border-[#FFC107]/50 shadow-md object-contain bg-[#0A2E5C]/5"
            priority
          />
          {showText && (
            <div className="flex flex-col">
              <span className={`text-lg font-black tracking-tight ${darkBackground ? "text-white" : "text-[#0A2E5C] dark:text-white"}`}>
                {BRAND_CONFIG.name} <span className="text-[#FFC107]">{BRAND_CONFIG.subtitle}</span>
              </span>
              <span className="text-xs text-[#0B5ED7] font-medium">
                {BRAND_CONFIG.hindiName}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="inline-flex items-center transition-transform hover:opacity-90 active:scale-[0.99]">
        {content}
      </Link>
    );
  }

  return content;
}
