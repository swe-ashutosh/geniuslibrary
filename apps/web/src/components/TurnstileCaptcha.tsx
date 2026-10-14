"use client";

/**
 * [WEB • COMPONENT] Cloudflare Turnstile Captcha
 *
 * Explicit render mode for Cloudflare Turnstile bot verification.
 * Automatically loads the Turnstile script, binds to a container ref,
 * handles token lifecycle (refresh, expiry, error), and emits
 * verification tokens to the parent form without unwanted re-renders.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { BRAND_CONFIG } from "@/lib/config";
import { ShieldCheck, RefreshCw, AlertCircle, CheckCircle2 } from "lucide-react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement | string,
        params: {
          sitekey: string;
          callback?: (token: string) => void;
          "error-callback"?: (errorCode?: any) => void;
          "expired-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
          size?: "normal" | "compact" | "flexible";
          action?: string;
          "refresh-expired"?: "auto" | "manual" | "never";
          retry?: "auto" | "never";
          "retry-interval"?: number;
        }
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
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
  const [status, setStatus] = useState<"idle" | "verifying" | "verified" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Keep callback references stable to prevent unnecessary widget teardown
  const onVerifyRef = useRef(onVerify);
  onVerifyRef.current = onVerify;

  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const siteKey = BRAND_CONFIG.turnstile?.siteKey || "0x4AAAAAAFVrc9ySGNSBNz1-";

  const renderWidget = useCallback(() => {
    if (!containerRef.current || !window.turnstile) return;

    // Clean up previous instance if any
    if (widgetIdRef.current) {
      try {
        window.turnstile.remove(widgetIdRef.current);
      } catch {}
      widgetIdRef.current = null;
    }

    setStatus("verifying");
    setErrorMessage(null);

    try {
      const id = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        callback: (token: string) => {
          setStatus("verified");
          setErrorMessage(null);
          onVerifyRef.current?.(token);
        },
        "expired-callback": () => {
          setStatus("idle");
          onExpireRef.current?.();
        },
        "error-callback": (errorCode: any) => {
          console.warn("[Turnstile] Verification error code:", errorCode);
          setStatus("error");
          if (errorCode === "110200" || String(errorCode).includes("110200")) {
            setErrorMessage("Domain not registered in Cloudflare Turnstile dashboard.");
          } else {
            setErrorMessage("Verification challenge failed. Please retry.");
          }
          onErrorRef.current?.(errorCode);
        },
        theme: "auto",
        size: "normal",
        action: action || "form_submit",
        "refresh-expired": "auto",
        retry: "auto",
        "retry-interval": 3000,
      });
      widgetIdRef.current = id;
    } catch (err) {
      console.warn("[Turnstile] Render exception:", err);
      setStatus("error");
      setErrorMessage("Could not load captcha widget.");
    }
  }, [siteKey, action]);

  const handleRetry = useCallback(() => {
    if (widgetIdRef.current && window.turnstile) {
      try {
        window.turnstile.reset(widgetIdRef.current);
        setStatus("verifying");
        setErrorMessage(null);
        return;
      } catch {}
    }
    renderWidget();
  }, [renderWidget]);

  useEffect(() => {
    let isMounted = true;

    const existingScript = document.querySelector(
      'script[src^="https://challenges.cloudflare.com/turnstile/v0/api.js"]'
    );

    if (window.turnstile) {
      renderWidget();
    } else if (existingScript) {
      const onLoad = () => {
        if (isMounted) renderWidget();
      };
      existingScript.addEventListener("load", onLoad);
      return () => {
        existingScript.removeEventListener("load", onLoad);
      };
    } else {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.onload = () => {
        if (isMounted) renderWidget();
      };
      script.onerror = () => {
        if (isMounted) {
          setStatus("error");
          setErrorMessage("Failed to load Cloudflare Turnstile script.");
        }
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
  }, [renderWidget]);

  return (
    <div className={`flex flex-col items-center justify-center my-2 ${className}`}>
      {/* Turnstile Target Container */}
      <div
        ref={containerRef}
        className="min-h-[65px] flex items-center justify-center transition-opacity"
      />

      {/* Error & Retry Fallback */}
      {status === "error" && (
        <div className="flex items-center gap-2 mt-2 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-xs">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{errorMessage || "Security check failed."}</span>
          <button
            type="button"
            onClick={handleRetry}
            className="inline-flex items-center gap-1 font-bold underline hover:no-underline ml-1 cursor-pointer"
          >
            <RefreshCw className="h-3 w-3" />
            Retry
          </button>
        </div>
      )}

      {/* Helper Footer */}
      <div className="flex items-center gap-1.5 mt-1.5 text-[10px] font-semibold text-zinc-400">
        {status === "verified" ? (
          <>
            <CheckCircle2 className="h-3 w-3 text-emerald-500" />
            <span className="text-emerald-600 dark:text-emerald-400">Security Check Passed</span>
          </>
        ) : (
          <>
            <ShieldCheck className="h-3 w-3 text-emerald-600" />
            <span>Protected by Cloudflare Turnstile</span>
          </>
        )}
      </div>
    </div>
  );
}
