"use client";

/**
 * [WEB • COMPONENT] Stamp Calibration Tool
 *
 * Admin UI to register the physical stamp touch pattern.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { 
  X, 
  Check, 
  RotateCcw, 
  Sliders, 
  Sparkles, 
  AlertCircle, 
  CheckCircle2, 
  ShieldCheck,
  Smartphone,
  ChevronRight,
  HelpCircle
} from "lucide-react";
import { 
  extractStampGeometry, 
  matchStampPattern, 
  getRegisteredStampPattern, 
  saveRegisteredStampPattern, 
  clearRegisteredStampPattern,
  type StampGeometry, 
  type StampPattern,
  type PatternMatchResult
} from "@/lib/stampPattern";
import { playNotificationChime } from "@/lib/pushNotify";

interface AdminStampCalibrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (pattern: StampPattern | null) => void;
}

export function AdminStampCalibrationModal({
  isOpen,
  onClose,
  onSaved,
}: AdminStampCalibrationModalProps) {
  const [activeMode, setActiveMode] = useState<"calibrate" | "test">("calibrate");
  const [currentSavedPattern, setCurrentSavedPattern] = useState<StampPattern | null>(null);

  // Calibration state
  const [capturedGeometry, setCapturedGeometry] = useState<StampGeometry | null>(null);
  const [showConfirmPopup, setShowConfirmPopup] = useState(false);
  const [stampName, setStampName] = useState("Genius Master Desk Stamp");
  const [tolerancePercent, setTolerancePercent] = useState(20);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessNotice, setSaveSuccessNotice] = useState<string | null>(null);

  // Live Test state
  const [testResult, setTestResult] = useState<PatternMatchResult | null>(null);
  const [isTestLocked, setIsTestLocked] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch active saved pattern on modal open
  useEffect(() => {
    if (!isOpen) {
      setCapturedGeometry(null);
      setShowConfirmPopup(false);
      setTestResult(null);
      setIsTestLocked(false);
      return;
    }

    getRegisteredStampPattern().then((pat) => {
      setCurrentSavedPattern(pat);
      if (pat) {
        setStampName(pat.name || "Genius Master Desk Stamp");
        setTolerancePercent(Math.round((pat.tolerance || 0.2) * 100));
      }
    });

    const handleUpdate = (e: any) => {
      setCurrentSavedPattern(e.detail);
    };
    window.addEventListener("stamp_pattern_updated", handleUpdate);
    return () => window.removeEventListener("stamp_pattern_updated", handleUpdate);
  }, [isOpen]);

  // Handle ESC key to exit
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isSaving) {
        if (showConfirmPopup) {
          setShowConfirmPopup(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isSaving, onClose, showConfirmPopup]);

  // Handle 3-point touch in CALIBRATE mode
  const handleCalibrateTouch = useCallback((e: React.TouchEvent) => {
    if (showConfirmPopup || isSaving) return;
    if (e.cancelable) e.preventDefault();

    const touches = Array.from(e.touches).map((t) => ({
      clientX: t.clientX,
      clientY: t.clientY,
      x: t.clientX,
      y: t.clientY,
    }));

    if (touches.length >= 3) {
      const geo = extractStampGeometry(touches.slice(0, 3));
      if (geo) {
        setCapturedGeometry(geo);
        setShowConfirmPopup(true);

        // Haptic feedback & audio chime
        if (typeof window !== "undefined" && window.navigator && window.navigator.vibrate) {
          try { window.navigator.vibrate([70, 40, 100]); } catch {}
        }
        playNotificationChime().catch(() => {});
      }
    }
  }, [isSaving, showConfirmPopup]);

  // Handle 3-point touch in TEST mode
  const handleTestTouch = useCallback((e: React.TouchEvent) => {
    if (isTestLocked) return;
    if (e.cancelable) e.preventDefault();

    const touches = Array.from(e.touches).map((t) => ({
      clientX: t.clientX,
      clientY: t.clientY,
    }));

    if (touches.length >= 3) {
      setIsTestLocked(true);
      const res = matchStampPattern(touches.slice(0, 3), currentSavedPattern);
      setTestResult(res);

      if (res.isMatch) {
        playNotificationChime().catch(() => {});
        if (typeof window !== "undefined" && window.navigator && window.navigator.vibrate) {
          try { window.navigator.vibrate([100, 50, 150]); } catch {}
        }
      } else {
        if (typeof window !== "undefined" && window.navigator && window.navigator.vibrate) {
          try { window.navigator.vibrate([80, 80]); } catch {}
        }
      }

      // Auto-reset test canvas after 2.2 seconds for next stamp test
      setTimeout(() => {
        setTestResult(null);
        setIsTestLocked(false);
      }, 2200);
    }
  }, [currentSavedPattern, isTestLocked]);

  // Save Calibrated Pattern to Supabase
  const handleConfirmAndCapture = async () => {
    if (!capturedGeometry) return;
    setIsSaving(true);

    const newPattern: StampPattern = {
      id: "master",
      name: stampName.trim() || "Genius Master Desk Stamp",
      ratios: capturedGeometry.ratios,
      nominalPerimeter: capturedGeometry.perimeter,
      tolerance: tolerancePercent / 100,
      updatedAt: new Date().toISOString(),
      updatedBy: "Admin",
    };

    const res = await saveRegisteredStampPattern(newPattern);
    setIsSaving(false);

    if (res.success) {
      setCurrentSavedPattern(newPattern);
      setShowConfirmPopup(false);
      setSaveSuccessNotice("✓ Stamp Pattern Successfully Captured & Saved in Supabase!");
      if (onSaved) onSaved(newPattern);
      setTimeout(() => setSaveSuccessNotice(null), 3500);
    }
  };

  // Reset Pattern to Default Mode
  const handleResetPattern = async () => {
    if (!confirm("Are you sure you want to clear the registered stamp pattern? Default mode will accept any 3-point conductive stamp.")) return;
    await clearRegisteredStampPattern();
    setCurrentSavedPattern(null);
    setCapturedGeometry(null);
    setSaveSuccessNotice("Reset to default: Any valid 3-point conductive stamp is accepted.");
    if (onSaved) onSaved(null);
    setTimeout(() => setSaveSuccessNotice(null), 3000);
  };

  // PC Simulation: Trigger Capture
  const handleSimulateCalibrate = () => {
    if (showConfirmPopup || isSaving) return;
    const simulatedGeo: StampGeometry = {
      sideLengths: [52, 68, 85],
      ratios: [1.308, 1.635],
      perimeter: 205,
      points: [
        { x: 140, y: 70 },
        { x: 195, y: 140 },
        { x: 85, y: 155 },
      ],
    };
    setCapturedGeometry(simulatedGeo);
    setShowConfirmPopup(true);
    playNotificationChime().catch(() => {});
  };

  // PC Simulation: Test Stamp
  const handleSimulateTest = () => {
    if (isTestLocked) return;
    setIsTestLocked(true);
    const simulatedPoints = [
      { clientX: 100, clientY: 100 },
      { clientX: 152, clientY: 168 },
      { clientX: 55, clientY: 185 },
    ];
    const res = matchStampPattern(simulatedPoints, currentSavedPattern);
    setTestResult(res);

    if (res.isMatch) {
      playNotificationChime().catch(() => {});
    }

    setTimeout(() => {
      setTestResult(null);
      setIsTestLocked(false);
    }, 2200);
  };

  if (!isOpen) return null;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[999999] bg-black text-white select-none touch-none overflow-hidden flex flex-col justify-between animate-fadeIn"
      style={{ backgroundColor: "#000000" }}
    >
      {/* ========================================================================= */}
      {/* 1. TOP HEADER OVERLAY (MINIMAL & SLEEK) */}
      {/* ========================================================================= */}
      <div className="relative z-20 flex items-center justify-between p-4 sm:p-6 bg-gradient-to-b from-black via-black/80 to-transparent">
        {/* Left: Mode Switcher */}
        <div className="flex items-center gap-2 bg-zinc-900/90 border border-zinc-800 p-1 rounded-2xl shadow-lg">
          <button
            onClick={() => {
              setActiveMode("calibrate");
              setTestResult(null);
            }}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-black transition cursor-pointer ${
              activeMode === "calibrate"
                ? "bg-amber-500 text-black shadow-md shadow-amber-500/20"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <Sliders className="h-3.5 w-3.5" />
            <span>Set Stamp Pattern</span>
          </button>

          <button
            onClick={() => {
              setActiveMode("test");
              setShowConfirmPopup(false);
            }}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-black transition cursor-pointer ${
              activeMode === "test"
                ? "bg-emerald-500 text-black shadow-md shadow-emerald-500/20"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>Test Stamp UI</span>
          </button>
        </div>

        {/* Center: Status Badge (Hidden on very small screens) */}
        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-900/80 border border-zinc-800 text-xs">
          <div className={`h-2 w-2 rounded-full ${currentSavedPattern ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`} />
          <span className="text-zinc-300 font-medium">
            {currentSavedPattern
              ? `Locked: ${currentSavedPattern.name} [${currentSavedPattern.ratios.join(", ")}]`
              : "Default Mode (Accepting any 3-point stamp)"}
          </span>
          {currentSavedPattern && (
            <button
              onClick={handleResetPattern}
              title="Reset stamp to default"
              className="text-[10px] text-rose-400 hover:text-rose-300 underline ml-1 cursor-pointer"
            >
              Reset
            </button>
          )}
        </div>

        {/* Right: Exit Button */}
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white text-xs font-bold transition active:scale-95 cursor-pointer shadow-lg"
        >
          <X className="h-4 w-4" />
          <span>Exit</span>
        </button>
      </div>

      {/* SUCCESS TOAST NOTICE */}
      {saveSuccessNotice && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-40 px-5 py-2.5 rounded-2xl bg-emerald-500 text-black font-black text-xs shadow-2xl flex items-center gap-2 animate-bounce">
          <Check className="h-4 w-4 stroke-[3]" />
          <span>{saveSuccessNotice}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. CENTER CANVAS (FULL BLACK SCREEN TOUCH AREA) */}
      {/* ========================================================================= */}
      <div
        onTouchStart={activeMode === "calibrate" ? handleCalibrateTouch : handleTestTouch}
        onTouchMove={activeMode === "calibrate" ? handleCalibrateTouch : handleTestTouch}
        className="flex-1 flex flex-col items-center justify-center text-center px-6 relative cursor-crosshair select-none"
      >
        {/* Subtle Background Radial Grid */}
        <div className="absolute inset-0 bg-[radial-gradient(#222_1px,transparent_1px)] [background-size:24px_24px] opacity-40 pointer-events-none" />

        {/* ------------------------------------------------------------- */}
        {/* VIEW A: CALIBRATION MODE — "Press Stamp Here" */}
        {/* ------------------------------------------------------------- */}
        {activeMode === "calibrate" && !showConfirmPopup && (
          <div className="relative z-10 pointer-events-none select-none flex flex-col items-center">
            {/* Guide Ring with 3 Target Pins */}
            <div className="relative mb-8 flex items-center justify-center">
              <div className="absolute h-44 w-44 sm:h-52 sm:w-52 rounded-full border border-dashed border-amber-500/20 animate-ping opacity-30" />
              <div className="relative flex h-36 w-36 sm:h-44 sm:w-44 items-center justify-center rounded-full border-2 border-dashed border-amber-500/50 bg-zinc-950/60 shadow-[0_0_40px_rgba(245,158,11,0.15)]">
                {/* 3 Conductive Pin Nodes */}
                <div className="absolute top-5 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-amber-500/60 border border-amber-400 shadow-sm" />
                <div className="absolute bottom-6 left-6 w-4 h-4 rounded-full bg-amber-500/60 border border-amber-400 shadow-sm" />
                <div className="absolute bottom-6 right-6 w-4 h-4 rounded-full bg-amber-500/60 border border-amber-400 shadow-sm" />

                <div className="h-10 w-10 rounded-full border border-amber-500/30 flex items-center justify-center">
                  <div className="h-3 w-3 rounded-full bg-amber-400 animate-pulse" />
                </div>
              </div>
            </div>

            {/* User Requested Exact Minimal Prompt */}
            <h1 className="text-2xl sm:text-4xl font-black text-amber-400 tracking-wider uppercase">
              Press Stamp Here
            </h1>

            <p className="text-xs sm:text-sm text-zinc-400 mt-2.5 font-medium max-w-sm">
              Press the library physical 3-point conductive stamp firmly onto this screen to capture its geometric pattern.
            </p>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* VIEW B: TEST MODE — Full Black Test UI */}
        {/* ------------------------------------------------------------- */}
        {activeMode === "test" && (
          <div className="relative z-10 pointer-events-none select-none flex flex-col items-center">
            {!testResult ? (
              <div className="flex flex-col items-center">
                <div className="relative mb-8 flex items-center justify-center">
                  <div className="absolute h-44 w-44 sm:h-52 sm:w-52 rounded-full border border-dashed border-emerald-500/20 animate-ping opacity-30" />
                  <div className="relative flex h-36 w-36 sm:h-44 sm:w-44 items-center justify-center rounded-full border-2 border-dashed border-emerald-500/50 bg-zinc-950/60 shadow-[0_0_40px_rgba(16,185,129,0.15)]">
                    <Smartphone className="h-12 w-12 text-emerald-400/80" />
                  </div>
                </div>

                <h2 className="text-2xl sm:text-4xl font-black text-emerald-400 tracking-wider uppercase">
                  Press Stamp Here to Test
                </h2>

                <p className="text-xs sm:text-sm text-zinc-400 mt-2.5 font-medium max-w-sm">
                  Touch the physical stamp to verify that the calibrated pattern is recognized and attendance unlocks.
                </p>

                {currentSavedPattern && (
                  <p className="text-xs text-zinc-500 mt-3 font-mono">
                    Target: {currentSavedPattern.name} • Match Tol: ±{Math.round((currentSavedPattern.tolerance || 0.2) * 100)}%
                  </p>
                )}
              </div>
            ) : testResult.isMatch ? (
              /* MATCH SUCCESS: Vibrant Green Rite Check (✓) */
              <div className="flex flex-col items-center animate-scaleIn">
                <div className="relative mb-6 flex items-center justify-center">
                  <div className="absolute h-48 w-48 rounded-full bg-emerald-500/30 blur-3xl animate-pulse" />
                  <div className="relative flex h-32 w-32 sm:h-36 sm:w-36 items-center justify-center rounded-full bg-gradient-to-tr from-emerald-600 via-emerald-500 to-teal-400 text-white shadow-[0_0_50px_rgba(16,185,129,0.7)] ring-8 ring-emerald-500/20">
                    <svg className="w-20 h-20 stroke-white fill-none stroke-[3.5] stroke-linecap-round stroke-linejoin-round" viewBox="0 0 24 24">
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                </div>

                <h3 className="text-2xl sm:text-4xl font-black text-emerald-400 tracking-tight">
                  ✓ Stamp Verified ({testResult.score}% Match)
                </h3>

                <p className="text-sm font-bold text-zinc-200 mt-2">
                  Pattern Matches Registered Library Stamp
                </p>

                <div className="mt-4 px-4 py-1.5 rounded-full bg-emerald-950/80 border border-emerald-500/30 text-xs font-mono text-emerald-300">
                  Measured Ratios: [{testResult.measured?.ratios.join(", ")}] • Valid
                </div>
              </div>
            ) : (
              /* MISMATCH ERROR */
              <div className="flex flex-col items-center animate-bounce">
                <div className="h-24 w-24 rounded-full bg-rose-500/20 border-2 border-rose-500 text-rose-400 flex items-center justify-center mb-5">
                  <AlertCircle className="h-12 w-12" />
                </div>

                <h3 className="text-2xl sm:text-3xl font-black text-rose-400">
                  Pattern Mismatch ({testResult.score}% Match)
                </h3>

                <p className="text-xs sm:text-sm text-zinc-400 mt-2 max-w-sm">
                  {testResult.reason || "The pressed stamp pattern does not match the calibrated ratios."}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 3. CONFIRMATION POPUP MODAL (SHOWN WHEN ADMIN PRESSES STAMP) */}
      {/* ========================================================================= */}
      {showConfirmPopup && capturedGeometry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
          <div className="relative w-full max-w-lg rounded-3xl bg-[#171D28] border-2 border-amber-500/50 p-6 text-white shadow-2xl shadow-amber-500/10 animate-scaleIn">
            
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-amber-400">
                    Stamp Pattern Detected!
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Review captured geometry before saving
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowConfirmPopup(false)}
                className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Geometric Wireframe Visualizer */}
            <div className="my-5 p-4 rounded-2xl bg-black border border-zinc-800 flex flex-col items-center justify-center relative overflow-hidden">
              <div className="text-[10px] font-mono uppercase text-zinc-500 mb-2">
                Captured Triangle Wireframe
              </div>

              {capturedGeometry.points && (
                <svg className="w-48 h-36">
                  {/* Center normalized points in SVG view */}
                  {(() => {
                    const pts = capturedGeometry.points!;
                    const minX = Math.min(...pts.map(p => p.x));
                    const maxX = Math.max(...pts.map(p => p.x));
                    const minY = Math.min(...pts.map(p => p.y));
                    const maxY = Math.max(...pts.map(p => p.y));
                    const spanX = Math.max(1, maxX - minX);
                    const spanY = Math.max(1, maxY - minY);
                    const scale = Math.min(130 / spanX, 85 / spanY);

                    const norm = pts.map(p => ({
                      x: 25 + (p.x - minX) * scale,
                      y: 20 + (p.y - minY) * scale,
                    }));

                    return (
                      <g>
                        <polygon
                          points={norm.map(p => `${p.x},${p.y}`).join(" ")}
                          fill="rgba(245, 158, 11, 0.2)"
                          stroke="#f59e0b"
                          strokeWidth="2.5"
                          strokeDasharray="4 2"
                        />
                        {norm.map((p, idx) => (
                          <g key={idx}>
                            <circle cx={p.x} cy={p.y} r="6" fill="#f59e0b" />
                            <circle cx={p.x} cy={p.y} r="12" fill="rgba(245, 158, 11, 0.3)" />
                            <text x={p.x + 9} y={p.y - 5} fill="#fcd34d" fontSize="9" fontWeight="bold">
                              P{idx + 1}
                            </text>
                          </g>
                        ))}
                      </g>
                    );
                  })()}
                </svg>
              )}

              {/* Data Table */}
              <div className="w-full grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-zinc-800/80 text-xs">
                <div className="p-2 rounded-xl bg-zinc-900 border border-zinc-800">
                  <span className="text-[10px] text-zinc-400 block">Side Distances:</span>
                  <span className="font-mono font-bold text-amber-300">
                    {capturedGeometry.sideLengths.join("px, ")}px
                  </span>
                </div>
                <div className="p-2 rounded-xl bg-zinc-900 border border-zinc-800">
                  <span className="text-[10px] text-zinc-400 block">Scale Invariant Ratios:</span>
                  <span className="font-mono font-bold text-emerald-400">
                    [{capturedGeometry.ratios.join(", ")}]
                  </span>
                </div>
              </div>
            </div>

            {/* Stamp Name Input */}
            <div className="space-y-3 text-xs mb-4">
              <div>
                <label className="block text-zinc-300 font-bold mb-1">Stamp Device Name:</label>
                <input
                  type="text"
                  value={stampName}
                  onChange={(e) => setStampName(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-black border border-zinc-700 text-white font-medium focus:outline-none focus:border-amber-500 text-xs"
                />
              </div>

              {/* Tolerance Selector */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-zinc-300 font-bold">Match Ratio Tolerance:</label>
                  <span className="font-mono text-amber-400 font-bold">±{tolerancePercent}%</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="35"
                  value={tolerancePercent}
                  onChange={(e) => setTolerancePercent(parseInt(e.target.value, 10))}
                  className="w-full accent-amber-500 cursor-pointer"
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  setShowConfirmPopup(false);
                  setCapturedGeometry(null);
                }}
                className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-bold transition cursor-pointer"
              >
                Re-press Stamp
              </button>

              <button
                onClick={handleConfirmAndCapture}
                disabled={isSaving}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-black text-xs font-black shadow-lg shadow-amber-500/20 active:scale-95 transition cursor-pointer"
              >
                <Check className="h-4 w-4 stroke-[3]" />
                <span>{isSaving ? "Saving to Supabase..." : "Confirm & Capture"}</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. BOTTOM BAR (SET STAMP MATCH RATIO & CONTROLS) */}
      {/* ========================================================================= */}
      <div className="relative z-20 p-4 sm:p-5 bg-gradient-to-t from-black via-black/95 to-transparent border-t border-zinc-900 flex flex-col sm:flex-row items-center justify-between gap-4">
        
        {/* Left: Stamp Match Ratio Option */}
        <div className="w-full sm:w-auto flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-zinc-300 font-bold shrink-0">
            <Sliders className="h-4 w-4 text-amber-400" />
            <span>Stamp Match Ratio:</span>
            <span className="font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
              ±{tolerancePercent}%
            </span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-48">
            <input
              type="range"
              min="10"
              max="35"
              value={tolerancePercent}
              onChange={(e) => setTolerancePercent(parseInt(e.target.value, 10))}
              className="w-full accent-amber-500 cursor-pointer"
            />
          </div>

          <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-zinc-400">
            <button
              onClick={() => setTolerancePercent(15)}
              className={`px-2 py-0.5 rounded-md text-[10px] font-bold border transition cursor-pointer ${
                tolerancePercent === 15 ? "bg-amber-500 text-black border-amber-500" : "bg-zinc-900 border-zinc-800 text-zinc-400"
              }`}
            >
              Strict 15%
            </button>
            <button
              onClick={() => setTolerancePercent(20)}
              className={`px-2 py-0.5 rounded-md text-[10px] font-bold border transition cursor-pointer ${
                tolerancePercent === 20 ? "bg-amber-500 text-black border-amber-500" : "bg-zinc-900 border-zinc-800 text-zinc-400"
              }`}
            >
              Std 20%
            </button>
            <button
              onClick={() => setTolerancePercent(25)}
              className={`px-2 py-0.5 rounded-md text-[10px] font-bold border transition cursor-pointer ${
                tolerancePercent === 25 ? "bg-amber-500 text-black border-amber-500" : "bg-zinc-900 border-zinc-800 text-zinc-400"
              }`}
            >
              Relaxed 25%
            </button>
          </div>
        </div>

        {/* Right: PC Simulation Test & Quick Action Buttons */}
        <div className="w-full sm:w-auto flex items-center justify-between sm:justify-end gap-2.5">
          {activeMode === "calibrate" ? (
            <button
              onClick={handleSimulateCalibrate}
              className="px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-amber-300 text-xs font-semibold border border-zinc-800 transition active:scale-95 cursor-pointer"
            >
              💻 Simulate Stamp (PC)
            </button>
          ) : (
            <button
              onClick={handleSimulateTest}
              className="px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-emerald-300 text-xs font-semibold border border-zinc-800 transition active:scale-95 cursor-pointer"
            >
              💻 Simulate Test (PC)
            </button>
          )}

          {activeMode === "calibrate" ? (
            <button
              onClick={() => setActiveMode("test")}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs font-bold border border-emerald-500/40 transition active:scale-95 cursor-pointer"
            >
              <span>Test Stamp UI</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              onClick={() => setActiveMode("calibrate")}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-bold border border-amber-500/40 transition active:scale-95 cursor-pointer"
            >
              <span>Back to Calibrate</span>
            </button>
          )}
        </div>

      </div>

    </div>
  );
}
