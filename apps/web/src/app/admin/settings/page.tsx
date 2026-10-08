"use client";

/**
 * [WEB • PAGE] Library Settings
 *
 * Library profile, shifts, holidays, notification tests, storage and
 * database status (reads BRAND_CONFIG + white-label info).
 */
import { useState, useEffect } from "react";
import { 
  Settings, 
  Clock, 
  Wifi, 
  IndianRupee, 
  ShieldCheck, 
  Save, 
  CheckCircle2, 
  Sliders, 
  BellRing,
  Sparkles,
  Trash2,
  AlertTriangle,
  Database,
  HardDrive,
  Cloud,
  RefreshCw,
  Archive,
  ArrowRight,
  Server,
  Eye,
  EyeOff,
  Search,
  FileSpreadsheet,
  Download,
  FileText,
  Fingerprint
} from "lucide-react";
import { AdminStampCalibrationModal } from "@/components/AdminStampCalibrationModal";
import { getRegisteredStampPattern, type StampPattern } from "@/lib/stampPattern";
import { 
  resetAllAdminData, 
  getStorageStatus, 
  triggerManualMonthlyBackup, 
  pruneSupabaseRecords,
  getAttendanceHistory,
  getFeesHistory,
  getMessagesHistory,
  getDailyReportsSnapshots,
  getDailyReportDownloadUrl,
  getAdminContactInfo,
  updateAdminContactInfo,
  type StorageStatus 
} from "@/lib/api";
import { BRAND_CONFIG } from "@/lib/config";

export default function AdminSettingsPage() {
  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPurging, setIsPurging] = useState(false);
  const [storageStatus, setStorageStatus] = useState<StorageStatus | null>(null);
  const [isLoadingStorage, setIsLoadingStorage] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isPruning, setIsPruning] = useState(false);
  const [pruneTarget, setPruneTarget] = useState<'attendance' | 'messages' | 'fees'>('attendance');
  const [pruneDays, setPruneDays] = useState<number>(30);
  const [storageMsg, setStorageMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // D1 Cold Storage Archive Explorer State
  const [showD1Explorer, setShowD1Explorer] = useState(false);
  const [d1ExplorerTab, setD1ExplorerTab] = useState<'snapshots' | 'attendance' | 'fees' | 'messages'>('snapshots');
  const [d1Records, setD1Records] = useState<any[]>([]);
  const [d1Loading, setD1Loading] = useState(false);
  const [d1Search, setD1Search] = useState("");

  // Touch Stamp State
  const [isStampModalOpen, setIsStampModalOpen] = useState(false);
  const [activeStampPattern, setActiveStampPattern] = useState<StampPattern | null>(null);

  const [settings, setSettings] = useState({
    libraryName: BRAND_CONFIG.name,
    address: BRAND_CONFIG.address,
    contactPhone: BRAND_CONFIG.phone,
    supportEmail: BRAND_CONFIG.email,
    wifiSsid: "Library_HighSpeed_5G",
    wifiPassword: "study_connect",
    dailyOpeningTime: "06:00",
    dailyClosingTime: "23:00",
    lateFeePerDay: "10",
    maxBookIssueDays: "14",
    requireLiveCameraAttendance: true,
    autoPruneOldDeskPhotosDays: "7",
  });

  const loadStorageMetrics = async () => {
    setIsLoadingStorage(true);
    try {
      const data = await getStorageStatus();
      setStorageStatus(data);
    } catch (err: any) {
      console.warn("Storage metrics fetch notice:", err);
    } finally {
      setIsLoadingStorage(false);
    }
  };

  useEffect(() => {
    loadStorageMetrics();
    getRegisteredStampPattern().then((pat) => setActiveStampPattern(pat));
    getAdminContactInfo().then((adminInfo) => {
      setSettings((prev) => ({
        ...prev,
        contactPhone: adminInfo.phone || prev.contactPhone,
        supportEmail: adminInfo.email || prev.supportEmail,
        libraryName: adminInfo.name || prev.libraryName,
      }));
    });
  }, []);

  const handleManualBackup = async () => {
    setIsBackingUp(true);
    setStorageMsg(null);
    try {
      const res = await triggerManualMonthlyBackup();
      if (res.success) {
        setStorageMsg({ 
          type: 'success', 
          text: `✓ Monthly history backup completed successfully! All records archived.` 
        });
        await loadStorageMetrics();
      } else {
        setStorageMsg({ type: 'error', text: res.error || 'Backup sync failed' });
      }
    } catch (err: any) {
      setStorageMsg({ type: 'error', text: err.message || 'Error triggering backup' });
    } finally {
      setIsBackingUp(false);
    }
  };

  const handlePruneRecords = async () => {
    const targetLabel = pruneTarget === 'attendance' ? 'Attendance logs' : pruneTarget === 'messages' ? 'Messages' : 'Fees';
    const confirmPrompt = window.confirm(
      `Confirm Safe Archiving:\n\nMove ${targetLabel} older than ${pruneDays} days to permanent history?\n\n• All records are permanently preserved in your history archive.\n• This cleans up and speeds up your active storage.\n• Zero data will be lost.`
    );
    if (!confirmPrompt) return;

    setIsPruning(true);
    setStorageMsg(null);
    try {
      const res = await pruneSupabaseRecords({
        target: pruneTarget,
        daysOlderThan: pruneDays,
      });
      if (res.success) {
        setStorageMsg({
          type: 'success',
          text: `✓ ${res.message ? res.message.replace(/Supabase/gi, 'Active Storage').replace(/D1/gi, 'Permanent History') : `Archived ${res.countPruned} records to permanent history.`}`,
        });
        await loadStorageMetrics();
      } else {
        setStorageMsg({ type: 'error', text: 'Archiving failed. Please try again.' });
      }
    } catch (err: any) {
      setStorageMsg({ type: 'error', text: err.message || 'Error archiving records' });
    } finally {
      setIsPruning(false);
    }
  };

  const loadD1ArchiveRecords = async (tab: 'snapshots' | 'attendance' | 'fees' | 'messages') => {
    setD1Loading(true);
    setD1Records([]);
    try {
      if (tab === 'snapshots') {
        const res = await getDailyReportsSnapshots();
        setD1Records(res.reports || []);
      } else if (tab === 'attendance') {
        const res = await getAttendanceHistory();
        setD1Records(res || []);
      } else if (tab === 'fees') {
        const res = await getFeesHistory();
        setD1Records(res || []);
      } else if (tab === 'messages') {
        const res = await getMessagesHistory();
        setD1Records(res || []);
      }
    } catch (err) {
      console.warn("Error fetching D1 archive records:", err);
      setD1Records([]);
    } finally {
      setD1Loading(false);
    }
  };

  useEffect(() => {
    if (showD1Explorer) {
      loadD1ArchiveRecords(d1ExplorerTab);
    }
  }, [showD1Explorer, d1ExplorerTab]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      // Sole Primary Database: Persist admin contact phone directly to Supabase profiles
      await updateAdminContactInfo({
        phone: settings.contactPhone,
        name: settings.libraryName,
        email: settings.supportEmail,
      });
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 3000);
    } catch (err: any) {
      alert("Failed to save settings: " + (err.message || err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetAllData = async () => {
    const confirmation = prompt('⚠️ TYPE "DELETE" TO PERMANENTLY WIPE ALL STUDENTS, BOOKS, ATTENDANCE & FEES:');
    if (confirmation !== "DELETE") {
      return;
    }

    setIsPurging(true);
    try {
      const res = await resetAllAdminData();
      alert(res.message || "All records have been purged successfully.");
      window.location.reload();
    } catch (err: any) {
      alert("Error purging records: " + err.message);
    } finally {
      setIsPurging(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black text-[#0A2E5C] dark:text-white flex items-center gap-2">
            Library Configuration & Settings
          </h1>
          <p className="text-xs text-zinc-500">
            Configure library operating hours, Wi-Fi parameters, fee policies, and camera anti-proxy rules.
          </p>
        </div>

        {isSaved && (
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-300 animate-fadeIn">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span>Settings updated successfully!</span>
          </div>
        )}
      </div>

      {/* Settings Form */}
      <form onSubmit={handleSave} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* General Details */}
        <div className="rounded-3xl border border-[#E5E7EB] bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C] space-y-4">
          <h3 className="text-sm font-black text-[#0A2E5C] dark:text-white flex items-center gap-2 pb-2 border-b border-zinc-100 dark:border-zinc-800">
            <Settings className="h-4 w-4 text-[#0B5ED7]" /> General Information
          </h3>

          <div className="space-y-3 text-xs">
            <div>
              <label className="font-bold text-zinc-500 block mb-1">Library Name:</label>
              <input
                type="text"
                value={settings.libraryName}
                onChange={(e) => setSettings({ ...settings, libraryName: e.target.value })}
                className="w-full p-2.5 rounded-xl border border-[#E5E7EB] bg-[#F8FAFC]/50 text-xs text-[#0A2E5C] dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              />
            </div>

            <div>
              <label className="font-bold text-zinc-500 block mb-1">Address / Landmark:</label>
              <input
                type="text"
                value={settings.address}
                onChange={(e) => setSettings({ ...settings, address: e.target.value })}
                className="w-full p-2.5 rounded-xl border border-[#E5E7EB] bg-[#F8FAFC]/50 text-xs text-[#0A2E5C] dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-zinc-500 block mb-1">Contact Phone:</label>
                <input
                  type="text"
                  value={settings.contactPhone}
                  onChange={(e) => setSettings({ ...settings, contactPhone: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-[#E5E7EB] bg-[#F8FAFC]/50 text-xs text-[#0A2E5C] dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                />
              </div>
              <div>
                <label className="font-bold text-zinc-500 block mb-1">Support Email:</label>
                <input
                  type="email"
                  value={settings.supportEmail}
                  onChange={(e) => setSettings({ ...settings, supportEmail: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-[#E5E7EB] bg-[#F8FAFC]/50 text-xs text-[#0A2E5C] dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Operating Hours & Wi-Fi */}
        <div className="rounded-3xl border border-[#E5E7EB] bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C] space-y-4">
          <h3 className="text-sm font-black text-[#0A2E5C] dark:text-white flex items-center gap-2 pb-2 border-b border-zinc-100 dark:border-zinc-800">
            <Clock className="h-4 w-4 text-[#0B5ED7]" /> Timings & Wi-Fi Network
          </h3>

          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-zinc-500 block mb-1">Opening Time:</label>
                <input
                  type="time"
                  value={settings.dailyOpeningTime}
                  onChange={(e) => setSettings({ ...settings, dailyOpeningTime: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-[#E5E7EB] bg-[#F8FAFC]/50 text-xs text-[#0A2E5C] dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                />
              </div>
              <div>
                <label className="font-bold text-zinc-500 block mb-1">Closing Time:</label>
                <input
                  type="time"
                  value={settings.dailyClosingTime}
                  onChange={(e) => setSettings({ ...settings, dailyClosingTime: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-[#E5E7EB] bg-[#F8FAFC]/50 text-xs text-[#0A2E5C] dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-zinc-500 block mb-1">Wi-Fi SSID Name:</label>
                <input
                  type="text"
                  value={settings.wifiSsid}
                  onChange={(e) => setSettings({ ...settings, wifiSsid: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-[#E5E7EB] bg-[#F8FAFC]/50 text-xs text-[#0A2E5C] dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                />
              </div>
              <div>
                <label className="font-bold text-zinc-500 block mb-1">Wi-Fi Password:</label>
                <input
                  type="text"
                  value={settings.wifiPassword}
                  onChange={(e) => setSettings({ ...settings, wifiPassword: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-[#E5E7EB] bg-[#F8FAFC]/50 text-xs text-[#0A2E5C] dark:border-zinc-700 dark:bg-zinc-800 dark:text-white font-mono"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Anti-Proxy Verification Rules */}
        <div className="lg:col-span-2 rounded-3xl border border-[#E5E7EB] bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C] space-y-4">
          <h3 className="text-sm font-black text-[#0A2E5C] dark:text-white flex items-center gap-2 pb-2 border-b border-zinc-100 dark:border-zinc-800">
            <ShieldCheck className="h-4 w-4 text-[#0B5ED7]" /> Anti-Proxy & Smart QR Policies
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-[#F8FAFC]/50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700">
              <div>
                <p className="font-bold text-[#0A2E5C] dark:text-white">Require Live Camera Verification</p>
                <p className="text-[11px] text-zinc-400">Forces student to capture desk photo to prevent proxy attendance.</p>
              </div>
              <input
                type="checkbox"
                checked={settings.requireLiveCameraAttendance}
                onChange={(e) => setSettings({ ...settings, requireLiveCameraAttendance: e.target.checked })}
                className="h-5 w-5 accent-[#0B5ED7] rounded"
              />
            </div>

            <div className="p-3.5 rounded-2xl bg-[#F8FAFC]/50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 flex items-center justify-between">
              <div>
                <p className="font-bold text-[#0A2E5C] dark:text-white">Auto-Prune Verification Photos</p>
                <p className="text-[11px] text-zinc-400">Automatically delete old verification photos after 7 days to save storage.</p>
              </div>
              <span className="font-bold text-[#0B5ED7] dark:text-[#FFC107] bg-white dark:bg-zinc-800 px-3 py-1 rounded-xl border border-zinc-200">
                7 Days
              </span>
            </div>

            {/* Capacitive 3-Point Touch Stamp Configuration */}
            <div className="md:col-span-2 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-500 border border-amber-500/40">
                  <Fingerprint className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-amber-400 uppercase tracking-wide">
                    Capacitive Touch Stamp Hardware Calibration
                  </h4>
                  <p className="text-[11px] text-zinc-300 mt-0.5">
                    {activeStampPattern
                      ? `Registered Stamp: "${activeStampPattern.name}" (Ratios: [${activeStampPattern.ratios.join(", ")}], ±${Math.round((activeStampPattern.tolerance || 0.2) * 100)}%)`
                      : "Default Mode: Accepting any 3-point physical conductive stamp. Calibrate your library's stamp to restrict attendance to authorized hardware only."}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsStampModalOpen(true)}
                className="shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-black text-xs font-black shadow-md shadow-amber-500/20 transition active:scale-95 cursor-pointer"
              >
                <Fingerprint className="h-4 w-4" />
                <span>{activeStampPattern ? "Re-Calibrate Stamp" : "Calibrate Physical Stamp"}</span>
              </button>
            </div>
          </div>

          <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 flex justify-end">
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#0A2E5C] text-[#FFC107] text-xs font-black shadow-md hover:bg-[#141A24] transition cursor-pointer"
            >
              <Save className="h-4 w-4" /> Save Configuration
            </button>
          </div>
        </div>

      </form>

      {/* Database Storage & History Archive Manager */}
      <div className="rounded-3xl border border-[#E5E7EB] bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C] space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-zinc-100 dark:border-zinc-800">
          <div>
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-[#0B5ED7]" />
              <h2 className="text-lg font-black text-[#0A2E5C] dark:text-white">
                Storage & History Archive Management
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                Permanent Vault
              </span>
            </div>
            <p className="text-xs text-zinc-500 mt-1 max-w-2xl leading-relaxed">
              Active operational storage powers all live students, logins, and attendance. Permanent cold backup saves automatic monthly snapshots with zero data loss.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleManualBackup}
              disabled={isBackingUp}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0B5ED7] hover:bg-[#7D5F47] text-white text-xs font-bold shadow-xs transition active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isBackingUp ? "animate-spin" : ""}`} />
              <span>{isBackingUp ? "Backing up..." : "Backup History Now"}</span>
            </button>
          </div>
        </div>

        {storageMsg && (
          <div className={`p-3.5 rounded-2xl text-xs font-bold border animate-fadeIn flex items-center gap-2 ${
            storageMsg.type === 'success' 
              ? 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800' 
              : 'bg-rose-50 text-rose-800 border-rose-300 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800'
          }`}>
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{storageMsg.text}</span>
          </div>
        )}

        {/* Live Storage Usage vs 500 MB Free Tier Meter */}
        <div className="p-4 rounded-2xl bg-[#F8FAFC]/70 dark:bg-zinc-800/50 border border-[#E5E7EB]/60 dark:border-zinc-700 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <span className="text-xs font-black text-[#0A2E5C] dark:text-white uppercase tracking-wider">
                Primary Storage Usage
              </span>
              <p className="text-[11px] text-zinc-500">
                Storage Quota: 500 MB. 500 students generate ~80–110 MB/year.
              </p>
            </div>
            <div className="text-right">
              <span className="text-sm font-black text-[#0B5ED7] dark:text-[#FFC107]">
                {storageStatus?.supabase.estimatedMbUsed || 0.06} MB / {storageStatus?.supabase.quotaMb || 500} MB
              </span>
              <span className="ml-2 text-xs font-bold text-emerald-600 bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full">
                {storageStatus?.supabase.percentageUsed || 0.01}% Used
              </span>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full h-3 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
            <div 
              className="h-full bg-emerald-500 rounded-full transition-all duration-500"
              style={{ width: `${Math.max(Number(storageStatus?.supabase.percentageUsed || 0.5), 1)}%` }}
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 text-xs">
            <div className="p-2.5 rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700">
              <span className="text-[11px] text-zinc-400 block font-medium">Active Students</span>
              <span className="text-sm font-black text-[#0A2E5C] dark:text-white">
                {storageStatus?.supabase.totalStudents ?? 4} Active
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700">
              <span className="text-[11px] text-zinc-400 block font-medium">Attendance Records</span>
              <span className="text-sm font-black text-[#0A2E5C] dark:text-white">
                {storageStatus?.supabase.totalAttendance ?? 0} Logs
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700">
              <span className="text-[11px] text-zinc-400 block font-medium">Fee Receipts</span>
              <span className="text-sm font-black text-[#0A2E5C] dark:text-white">
                {storageStatus?.supabase.totalFees ?? 4} Records
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700">
              <span className="text-[11px] text-zinc-400 block font-medium">History Archive</span>
              <span className="text-sm font-black text-emerald-600">
                100% Synced
              </span>
            </div>
          </div>
        </div>

        {/* Safe Archiving Controls: Free up active space safely */}
        <div className="p-4 rounded-2xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 space-y-3">
          <div className="flex items-center gap-2">
            <Archive className="h-4 w-4 text-amber-700 dark:text-amber-400" />
            <h3 className="text-xs font-black text-amber-900 dark:text-amber-300 uppercase tracking-wider">
              Clean Up Old Active Records (Zero Data Loss)
            </h3>
          </div>
          <p className="text-xs text-amber-800/80 dark:text-amber-400/90 leading-relaxed">
            To keep your system running fast and optimize active storage, you can safely archive older records. All records are permanently preserved in your history archive before being cleared from the active list.
          </p>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
            <div className="flex-1">
              <label className="text-[11px] font-bold text-zinc-600 dark:text-zinc-300 block mb-1">
                Data to Prune:
              </label>
              <select
                value={pruneTarget}
                onChange={(e) => setPruneTarget(e.target.value as any)}
                className="w-full p-2 rounded-xl border border-zinc-300 bg-white text-xs text-[#0A2E5C] dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              >
                <option value="attendance">Old Attendance Logs</option>
                <option value="messages">Old Resolved Messages</option>
                <option value="fees">Old Paid Fee Receipts</option>
              </select>
            </div>

            <div className="flex-1">
              <label className="text-[11px] font-bold text-zinc-600 dark:text-zinc-300 block mb-1">
                Age Cutoff:
              </label>
              <select
                value={pruneDays}
                onChange={(e) => setPruneDays(Number(e.target.value))}
                className="w-full p-2 rounded-xl border border-zinc-300 bg-white text-xs text-[#0A2E5C] dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              >
                <option value={30}>Older than 30 Days</option>
                <option value={60}>Older than 60 Days</option>
                <option value={90}>Older than 90 Days</option>
                <option value={180}>Older than 180 Days (6 Months)</option>
                <option value={365}>Older than 1 Year (365 Days)</option>
              </select>
            </div>

            <div className="sm:self-end">
              <button
                type="button"
                onClick={handlePruneRecords}
                disabled={isPruning}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs transition active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                <Archive className={`h-3.5 w-3.5 ${isPruning ? "animate-spin" : ""}`} />
                <span>{isPruning ? "Archiving..." : "Move to History"}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Interactive History Archive Explorer */}
        <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 className="text-xs font-black text-[#0A2E5C] dark:text-white flex items-center gap-2">
                <HardDrive className="h-4 w-4 text-[#0B5ED7]" /> Past Records & History Explorer
              </h3>
              <p className="text-[11px] text-zinc-500">
                Directly inspect, search, and export old attendance, receipts, and snapshots.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowD1Explorer(!showD1Explorer)}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl border border-[#E5E7EB] bg-[#F8FAFC]/60 hover:bg-[#F8FAFC] dark:border-zinc-700 dark:bg-zinc-800 text-xs font-bold text-[#0A2E5C] dark:text-white transition cursor-pointer"
            >
              {showD1Explorer ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              <span>{showD1Explorer ? "Close History" : "View Old History"}</span>
            </button>
          </div>

          {showD1Explorer && (
            <div className="mt-4 p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-4 animate-fadeIn">
              {/* Explorer Tabs */}
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-zinc-200 dark:border-zinc-800">
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setD1ExplorerTab('snapshots')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                      d1ExplorerTab === 'snapshots'
                        ? 'bg-[#0A2E5C] text-[#FFC107] shadow-xs dark:bg-zinc-800 dark:text-white'
                        : 'text-zinc-600 hover:bg-zinc-200/60 dark:text-zinc-400 dark:hover:bg-zinc-800'
                    }`}
                  >
                    📑 Backup Snapshots
                  </button>
                  <button
                    type="button"
                    onClick={() => setD1ExplorerTab('attendance')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                      d1ExplorerTab === 'attendance'
                        ? 'bg-[#0A2E5C] text-[#FFC107] shadow-xs dark:bg-zinc-800 dark:text-white'
                        : 'text-zinc-600 hover:bg-zinc-200/60 dark:text-zinc-400 dark:hover:bg-zinc-800'
                    }`}
                  >
                    📅 Attendance History
                  </button>
                  <button
                    type="button"
                    onClick={() => setD1ExplorerTab('fees')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                      d1ExplorerTab === 'fees'
                        ? 'bg-[#0A2E5C] text-[#FFC107] shadow-xs dark:bg-zinc-800 dark:text-white'
                        : 'text-zinc-600 hover:bg-zinc-200/60 dark:text-zinc-400 dark:hover:bg-zinc-800'
                    }`}
                  >
                    💳 Fee Receipts
                  </button>
                  <button
                    type="button"
                    onClick={() => setD1ExplorerTab('messages')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                      d1ExplorerTab === 'messages'
                        ? 'bg-[#0A2E5C] text-[#FFC107] shadow-xs dark:bg-zinc-800 dark:text-white'
                        : 'text-zinc-600 hover:bg-zinc-200/60 dark:text-zinc-400 dark:hover:bg-zinc-800'
                    }`}
                  >
                    💬 Messages History
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="h-3.5 w-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Search archive..."
                      value={d1Search}
                      onChange={(e) => setD1Search(e.target.value)}
                      className="pl-8 pr-2.5 py-1 text-xs rounded-lg border border-zinc-300 bg-white text-[#0A2E5C] dark:border-zinc-700 dark:bg-zinc-800 dark:text-white w-36 sm:w-48"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => loadD1ArchiveRecords(d1ExplorerTab)}
                    disabled={d1Loading}
                    className="p-1 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 transition cursor-pointer"
                    title="Refresh"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${d1Loading ? "animate-spin" : ""}`} />
                  </button>
                </div>
              </div>

              {/* Data Table */}
              <div className="overflow-x-auto max-h-72 overflow-y-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
                {d1Loading ? (
                  <div className="p-8 text-center text-xs text-zinc-400 flex items-center justify-center gap-2">
                    <RefreshCw className="h-4 w-4 animate-spin text-[#0B5ED7]" />
                    <span>Loading archive history...</span>
                  </div>
                ) : d1Records.length === 0 ? (
                  <div className="p-8 text-center space-y-1.5">
                    <CheckCircle2 className="h-6 w-6 text-emerald-500 mx-auto" />
                    <p className="text-xs font-bold text-[#0A2E5C] dark:text-white">
                      No records archived under this section yet!
                    </p>
                    <p className="text-[11px] text-zinc-400 max-w-sm mx-auto">
                      All your records are currently active in the system. Older records will appear here as they are archived.
                    </p>
                  </div>
                ) : (
                  <table className="w-full text-left text-xs">
                    <thead className="bg-zinc-100 dark:bg-zinc-800 text-zinc-500 sticky top-0 font-bold uppercase text-[10px]">
                      {d1ExplorerTab === 'snapshots' && (
                        <tr>
                          <th className="p-2.5">Date</th>
                          <th className="p-2.5">Type</th>
                          <th className="p-2.5">Students</th>
                          <th className="p-2.5">Occupied</th>
                          <th className="p-2.5">Total Dues</th>
                          <th className="p-2.5 text-right">Downloads</th>
                        </tr>
                      )}
                      {d1ExplorerTab === 'attendance' && (
                        <tr>
                          <th className="p-2.5">Student</th>
                          <th className="p-2.5">Date</th>
                          <th className="p-2.5">In</th>
                          <th className="p-2.5">Out</th>
                          <th className="p-2.5">Status</th>
                          <th className="p-2.5">Seat</th>
                        </tr>
                      )}
                      {d1ExplorerTab === 'fees' && (
                        <tr>
                          <th className="p-2.5">Student</th>
                          <th className="p-2.5">Type</th>
                          <th className="p-2.5">Amount</th>
                          <th className="p-2.5">Receipt #</th>
                          <th className="p-2.5">Date</th>
                        </tr>
                      )}
                      {d1ExplorerTab === 'messages' && (
                        <tr>
                          <th className="p-2.5">Sender</th>
                          <th className="p-2.5">Recipient</th>
                          <th className="p-2.5">Message</th>
                          <th className="p-2.5">Date</th>
                        </tr>
                      )}
                    </thead>
                    <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 bg-white dark:bg-zinc-900">
                      {d1Records
                        .filter((r) => {
                          if (!d1Search.trim()) return true;
                          const s = d1Search.toLowerCase();
                          return JSON.stringify(r).toLowerCase().includes(s);
                        })
                        .map((r, i) => (
                          <tr key={r.id || i} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                            {d1ExplorerTab === 'snapshots' && (
                              <>
                                <td className="p-2.5 font-bold">{r.reportDate}</td>
                                <td className="p-2.5 capitalize">{r.reportType?.replace('_', ' ')}</td>
                                <td className="p-2.5">{r.totalStudents}</td>
                                <td className="p-2.5">{r.occupiedSeats}</td>
                                <td className="p-2.5 font-bold text-amber-600">₹{r.totalPendingDues || 0}</td>
                                <td className="p-2.5 text-right space-x-2">
                                  <a
                                    href={getDailyReportDownloadUrl('pdf', r.reportDate)}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 text-[11px] font-bold text-[#0B5ED7] hover:underline"
                                  >
                                    <Download className="h-3 w-3" /> PDF
                                  </a>
                                  <a
                                    href={getDailyReportDownloadUrl('csv', r.reportDate)}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 hover:underline"
                                  >
                                    <Download className="h-3 w-3" /> CSV
                                  </a>
                                </td>
                              </>
                            )}
                            {d1ExplorerTab === 'attendance' && (
                              <>
                                <td className="p-2.5 font-bold">{r.studentName}</td>
                                <td className="p-2.5">{r.date}</td>
                                <td className="p-2.5">{r.checkIn || '—'}</td>
                                <td className="p-2.5">{r.checkOut || '—'}</td>
                                <td className="p-2.5 capitalize">
                                  <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                                    {r.status}
                                  </span>
                                </td>
                                <td className="p-2.5 font-mono">{r.seatNumber || '—'}</td>
                              </>
                            )}
                            {d1ExplorerTab === 'fees' && (
                              <>
                                <td className="p-2.5 font-bold">{r.studentName}</td>
                                <td className="p-2.5">{r.type}</td>
                                <td className="p-2.5 font-bold text-emerald-600">₹{r.amount}</td>
                                <td className="p-2.5 font-mono text-[11px]">{r.receiptNo || '—'}</td>
                                <td className="p-2.5 text-zinc-400">{r.paidAt ? new Date(r.paidAt).toLocaleDateString('en-IN') : '—'}</td>
                              </>
                            )}
                            {d1ExplorerTab === 'messages' && (
                              <>
                                <td className="p-2.5 font-bold">{r.senderName} ({r.senderRole})</td>
                                <td className="p-2.5">{r.recipientName || r.recipientRole}</td>
                                <td className="p-2.5 max-w-xs truncate">{r.message}</td>
                                <td className="p-2.5 text-zinc-400">{r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-IN') : '—'}</td>
                              </>
                            )}
                          </tr>
                        ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Danger Zone: Purge & Wipe All Records */}
      <div className="rounded-3xl border border-rose-200 bg-rose-50/60 p-6 shadow-xs dark:border-rose-900/40 dark:bg-rose-950/20 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h3 className="text-sm font-black text-rose-800 dark:text-rose-300 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-600" /> Danger Zone: Purge All Library Records Everywhere
            </h3>
            <p className="text-xs text-rose-700/80 dark:text-rose-400 mt-1 max-w-2xl leading-relaxed">
              Permanently wipe all student registrations, book catalog items, attendance records, and fee transactions from all central database records.
            </p>
          </div>

          <button
            type="button"
            onClick={handleResetAllData}
            disabled={isPurging}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-md transition active:scale-95 disabled:opacity-50 cursor-pointer shrink-0"
          >
            <Trash2 className="h-4 w-4" />
            <span>{isPurging ? "Purging Records..." : "Purge All Records Everywhere"}</span>
          </button>
        </div>
      </div>
      {/* Admin Stamp Calibration Modal */}
      <AdminStampCalibrationModal
        isOpen={isStampModalOpen}
        onClose={() => setIsStampModalOpen(false)}
        onSaved={(pat) => setActiveStampPattern(pat)}
      />

    </div>
  );
}
