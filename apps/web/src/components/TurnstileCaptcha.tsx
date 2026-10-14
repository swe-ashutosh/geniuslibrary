"use client";

/**
 * [WEB • COMPONENT] Cloudflare Turnstile Captcha
 *
 * Explicit render mode for Cloudflare Turnstile bot verification.
 * Automatically loads the Turnstile script, binds to a container ref,
 * and emits verification token to the parent form.
 */

import { useEffect, useRef, useState } from "react";
import { BRAND_CONFIG } from "@/lib/config";
import { ShieldCheck } from "lucide-react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement | string,
        params: {
          sitekey: string;
          callback?: (token: string) => void;
          "error-callback"?: (error?: any) => void;
          "expired-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
          size?: "normal" | "compact" | "flexible";
          action?: string;
        }
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
    onloadTurnstileCallback?: () => void;
  }
}

interface TurnstileCaptchaProps {
  onVerify: (token: string) => void;
  onExpire?: () => void;
  onError?: (err?: any) => void;
  action?: string;
  className?: string;
}

export function TurnstileCaptcha({
  onVerify,
  onExpire,
  onError,
  action,
  className = "",
}: TurnstileCaptchaProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const siteKey = BRAND_CONFIG.turnstile?.siteKey || "0x4AAAAAAFVrc9ySGNSBNz1-";

  useEffect(() => {
    let isMounted = true;

    // Function to render turnstile once script is available
    const renderWidget = () => {
      if (!isMounted || !containerRef.current || !window.turnstile) return;

      // Clean up previous widget instance if present
      if (widgetIdRef.current) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {}
        widgetIdRef.current = null;
      }

      try {
        const id = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          callback: (token: string) => {
            if (isMounted) onVerify(token);
          },
          "expired-callback": () => {
            if (isMounted && onExpire) onExpire();
          },
          "error-callback": (error: any) => {
            if (isMounted && onError) onError(error);
          },
          theme: "auto",
          size: "normal",
          action: action || "form_submit",
        });
        widgetIdRef.current = id;
        setIsLoaded(true);
      } catch (err) {
        console.warn("[Turnstile] Render warning:", err);
      }
    };

    // If script is already in document
    const existingScript = document.querySelector(
      'script[src^="https://challenges.cloudflare.com/turnstile/v0/api.js"]'
    );

    if (window.turnstile) {
      renderWidget();
    } else if (existingScript) {
      existingScript.addEventListener("load", renderWidget);
    } else {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.onload = () => {
        if (isMounted) renderWidget();
      };
      document.head.appendChild(script);
    }

    return () => {
      isMounted = false;
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {}
        widgetIdRef.current = null;
      }
    };
  }, [siteKey, action, onVerify, onExpire, onError]);

  return (
    <div className={`flex flex-col items-center justify-center my-2 ${className}`}>
      <div ref={containerRef} className="min-h-[65px] flex items-center justify-center" />
      <div className="flex items-center gap-1.5 mt-1.5 text-[10px] font-semibold text-zinc-400">
        <ShieldCheck className="h-3 w-3 text-emerald-600" />
        <span>Protected by Cloudflare Turnstile</span>
      </div>
    </div>
  );
}
