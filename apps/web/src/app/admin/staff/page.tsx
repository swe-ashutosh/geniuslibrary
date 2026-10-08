"use client";

/**
 * [WEB • PAGE] Staff Management
 *
 * Prime/sub staff directory, roles and access control.
 */
import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { 
  Users, 
  UserCog, 
  Plus, 
  ShieldCheck, 
  Mail, 
  Phone, 
  Key, 
  CheckCircle2, 
  Lock, 
  Trash2,
  Edit3,
  ExternalLink,
  Clock,
  X,
  Check,
  Award,
  QrCode,
  IndianRupee,
  MessageSquare,
  UserPlus,
  Ban,
  RefreshCw,
  Sparkles,
  MapPin,
  CreditCard,
  Camera,
  Eye,
  EyeOff,
  Upload
} from "lucide-react";
import Link from "next/link";
import { 
  getStaffMembers, 
  createStaffMember, 
  updateStaffMember, 
  deleteStaffMember, 
  StaffMember 
} from "@/lib/api";
import { uploadStaffPhoto } from "@/lib/supabase/storage";

export default function AdminStaffPage() {
  const [mounted, setMounted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [staffList, setStaffList] = useState<StaffMember[]>([]);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const addPhotoInputRef = useRef<HTMLInputElement>(null);
  const editPhotoInputRef = useRef<HTMLInputElement>(null);

  const [newStaff, setNewStaff] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    aadharNumber: "",
    avatarUrl: "",
    role: "prime_staff" as "prime_staff" | "sub_staff",
    category: "Prime Staff" as "Prime Staff" | "Sub Staff",
    shiftAssigned: "Morning Shift (06:00 AM - 02:00 PM)",
    password: "",
  });

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = await getStaffMembers();
      setStaffList(data || []);
    } catch (e) {
      console.error("Failed to load staff list:", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setMounted(true);
    loadData();
  }, []);

  const handlePhotoUpload = async (file: File, isEdit: boolean) => {
    try {
      setIsUploadingPhoto(true);
      const identifier = isEdit
        ? editingStaff?.id || editingStaff?.email || "staff"
        : newStaff.email.trim() || newStaff.name.trim() || "new-staff";
      const res = await uploadStaffPhoto(file, identifier);
      if (res.url) {
        if (isEdit && editingStaff) {
          setEditingStaff({ ...editingStaff, avatarUrl: res.url });
        } else {
          setNewStaff((prev) => ({ ...prev, avatarUrl: res.url! }));
        }
        showToast("✓ Staff photo uploaded successfully!");
      } else if (res.error) {
        alert("Photo upload notice: " + res.error);
      }
    } catch (err: any) {
      alert("Failed to upload photo: " + (err?.message || "Unknown error"));
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleAddStaff = async () => {
    if (!newStaff.name.trim() || !newStaff.email.trim()) {
      alert("Please enter staff member's name and email.");
      return;
    }

    if (!newStaff.password || newStaff.password.length < 6) {
      alert("Password must be at least 6 characters long for Supabase authentication.");
      return;
    }

    setIsSubmitting(true);
    const category = newStaff.role === "prime_staff" ? "Prime Staff" : "Sub Staff";

    try {
      const res = await createStaffMember({
        name: newStaff.name.trim(),
        email: newStaff.email.trim().toLowerCase(),
        phone: newStaff.phone.trim() || "+91 98765 00000",
        address: newStaff.address.trim(),
        aadharNumber: newStaff.aadharNumber.trim(),
        avatarUrl: newStaff.avatarUrl || undefined,
        role: newStaff.role,
        category: category,
        shiftAssigned: newStaff.shiftAssigned,
        password: newStaff.password,
        status: "active",
      });

      if (res.success) {
        showToast(`✓ Staff account "${newStaff.name}" created in Supabase!`);
        setIsAddModalOpen(false);
        setNewStaff({
          name: "",
          email: "",
          phone: "",
          address: "",
          aadharNumber: "",
          avatarUrl: "",
          role: "prime_staff",
          category: "Prime Staff",
          shiftAssigned: "Morning Shift (06:00 AM - 02:00 PM)",
          password: "",
        });
        await loadData();
      } else {
        alert("Failed to create staff member: " + (res.error || "Unknown error"));
      }
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateStaff = async () => {
    if (!editingStaff) return;
    setIsSubmitting(true);
    try {
      const res = await updateStaffMember(editingStaff.id, {
        name: editingStaff.name,
        email: editingStaff.email,
        phone: editingStaff.phone,
        address: editingStaff.address,
        aadharNumber: editingStaff.aadharNumber,
        avatarUrl: editingStaff.avatarUrl,
        role: editingStaff.role,
        category: editingStaff.role === "prime_staff" ? "Prime Staff" : "Sub Staff",
        shiftAssigned: editingStaff.shiftAssigned,
        password: editingStaff.password ? editingStaff.password : undefined,
        status: editingStaff.status,
      });

      if (res.success) {
        showToast(`Staff member "${editingStaff.name}" updated successfully.`);
        setEditingStaff(null);
        await loadData();
      } else {
        alert("Failed to update staff member: " + (res.error || "Unknown error"));
      }
    } catch (err: any) {
      alert("Error updating staff: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteStaff = async (id: string, name: string) => {
    if (window.confirm(`Are you sure you want to remove ${name} from the staff directory?`)) {
      try {
        await deleteStaffMember(id);
        showToast(`Staff member "${name}" removed.`);
        await loadData();
      } catch (err: any) {
        alert("Error removing staff: " + err.message);
      }
    }
  };

  const handleToggleStatus = async (id: string) => {
    const target = staffList.find(s => s.id === id);
    if (!target) return;
    const nextStatus = target.status === "active" ? "on_leave" : "active";
    try {
      await updateStaffMember(id, { status: nextStatus });
      setStaffList(prev => prev.map(s => s.id === id ? { ...s, status: nextStatus } : s));
      showToast(`Staff status set to ${nextStatus === "active" ? "Active (On Duty)" : "On Leave"}.`);
    } catch (err: any) {
      alert("Error toggling status: " + err.message);
    }
  };

  const primeStaffCount = staffList.filter(s => s.role === "prime_staff").length;
  const subStaffCount = staffList.filter(s => s.role === "sub_staff").length;
  const activeStaffCount = staffList.filter(s => s.status === "active").length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-3xl bg-[#F8FAFC]/60 dark:bg-[#0A2E5C] border border-[#E5E7EB] dark:border-zinc-800 p-6 shadow-xs">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-[#0A2E5C] dark:text-white flex items-center gap-2">
            Staff & Duty Management (ADMIN)
          </h1>
          <p className="text-xs sm:text-sm text-zinc-500 mt-1">
            Provision and configure <strong>Prime Staff</strong> and <strong>Sub Staff</strong> tiers with granular counter permissions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            className="p-2.5 rounded-xl border border-[#E5E7EB] bg-white text-xs font-bold text-zinc-600 hover:bg-[#F8FAFC] dark:border-zinc-700 dark:bg-[#0A2E5C] dark:text-zinc-300 cursor-pointer"
            title="Refresh staff"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </button>
          <Link
            href="/staff"
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] bg-white text-xs font-bold text-[#0A2E5C] shadow-xs hover:bg-[#F8FAFC] dark:border-zinc-800 dark:bg-[#0A2E5C] dark:text-white"
          >
            <ExternalLink className="h-4 w-4 text-[#0B5ED7]" /> Open Staff Panel
          </Link>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0A2E5C] text-[#FFC107] text-xs font-black shadow-md hover:bg-[#141A24] cursor-pointer"
          >
            <Plus className="h-4 w-4" /> Add Staff Member
          </button>
        </div>
      </div>

      {/* Toast Feedback */}
      {toastMsg && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-300 text-emerald-900 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-200 text-xs font-bold flex items-center justify-between shadow-sm animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span>{toastMsg}</span>
          </div>
          <button onClick={() => setToastMsg(null)} className="hover:opacity-75">✕</button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {/* Total Staff */}
        <div className="rounded-3xl border border-[#E5E7EB] bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C]">
          <div className="flex items-start justify-between mb-4">
            <p className="text-xs font-bold text-zinc-500">Total Staff Team</p>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0A2E5C] text-white shadow-sm">
              <Users className="h-5 w-5" />
            </div>
          </div>
          <div className="flex items-end justify-between">
            <div>
              <p className="text-3xl font-black text-[#0A2E5C] dark:text-white">{staffList.length}</p>
              <p className="text-[10px] font-semibold text-zinc-400 mt-1">Verified Staff Records</p>
            </div>
            <div className="text-[10px] font-bold text-emerald-600 flex items-center gap-0.5">
              <span>●</span> Active
            </div>
          </div>
        </div>

        {/* Prime Staff Count */}
        <div className="rounded-3xl border border-[#FFC107]/40 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C]">
          <div className="flex items-start justify-between mb-4">
            <p className="text-xs font-bold text-[#0B5ED7] dark:text-[#FFC107]">Prime Staff</p>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FFC107] text-[#0A2E5C] shadow-sm font-black text-xs">
              <Sparkles className="h-5 w-5" />
            </div>
          </div>
          <div className="flex items-end justify-between">
            <div>
              <p className="text-3xl font-black text-[#0A2E5C] dark:text-white">{primeStaffCount}</p>
              <p className="text-[10px] font-semibold text-zinc-400 mt-1">Full Counter Access</p>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200">
              Tier 1
            </span>
          </div>
        </div>

        {/* Sub Staff Count */}
        <div className="rounded-3xl border border-blue-200 bg-white p-5 shadow-xs dark:border-blue-900/30 dark:bg-[#0A2E5C]">
          <div className="flex items-start justify-between mb-4">
            <p className="text-xs font-bold text-blue-700 dark:text-blue-300">Sub Staff</p>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400 shadow-sm font-black text-xs">
              <Award className="h-5 w-5" />
            </div>
          </div>
          <div className="flex items-end justify-between">
            <div>
              <p className="text-3xl font-black text-[#0A2E5C] dark:text-white">{subStaffCount}</p>
              <p className="text-[10px] font-semibold text-zinc-400 mt-1">Attendance &amp; Exam Results</p>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200">
              Tier 2
            </span>
          </div>
        </div>

        {/* Active on Duty */}
        <div className="rounded-3xl border border-emerald-200 bg-white p-5 shadow-xs dark:border-emerald-900/30 dark:bg-[#0A2E5C]">
          <div className="flex items-start justify-between mb-4">
            <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400">On Duty Today</p>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400 shadow-sm font-black text-xs">
              <ShieldCheck className="h-5 w-5" />
            </div>
          </div>
          <div className="flex items-end justify-between">
            <div>
              <p className="text-3xl font-black text-[#0A2E5C] dark:text-white">{activeStaffCount}</p>
              <p className="text-[10px] font-semibold text-zinc-400 mt-1">Ready for Scans & Issues</p>
            </div>
            <span className="text-[10px] font-bold text-emerald-600">
              {staffList.length > 0 ? `${Math.round((activeStaffCount / staffList.length) * 100)}%` : "0%"}
            </span>
          </div>
        </div>
      </div>

      {/* Staff Directory Cards */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-black text-[#0A2E5C] dark:text-white flex items-center gap-2">
            <Users className="h-5 w-5 text-[#0B5ED7]" /> Staff Members Directory
          </h2>
          <span className="text-xs text-zinc-500 font-semibold">
            {staffList.length} Accounts Registered
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {staffList.map((member) => {
            const isPrime = member.role === "prime_staff";
            return (
              <div 
                key={member.id}
                className={`rounded-3xl border p-5 shadow-xs flex flex-col justify-between space-y-4 hover:shadow-md transition bg-white dark:bg-[#0A2E5C] ${
                  isPrime 
                    ? "border-[#FFC107]/60 dark:border-[#FFC107]/40" 
                    : "border-zinc-200 dark:border-zinc-800"
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      {member.avatarUrl ? (
                        <img
                          src={member.avatarUrl}
                          alt={member.name}
                          className="h-12 w-12 rounded-2xl object-cover border border-[#FFC107]/40 shadow-xs shrink-0"
                        />
                      ) : (
                        <div className="h-12 w-12 rounded-2xl bg-[#0A2E5C] text-[#FFC107] border border-[#FFC107]/30 font-bold flex items-center justify-center text-sm shadow-xs shrink-0">
                          {member.name
                            .split(" ")
                            .map((n) => n[0])
                            .slice(0, 2)
                            .join("")
                            .toUpperCase() || "ST"}
                        </div>
                      )}
                      <div>
                        <h3 className="font-bold text-sm text-[#0A2E5C] dark:text-white">
                          {member.name}
                        </h3>
                        <div className="mt-1 flex items-center gap-1.5">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black ${
                              isPrime
                                ? "bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300"
                                : "bg-blue-100 text-blue-900 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-300"
                            }`}
                          >
                            {isPrime ? <Sparkles className="h-3 w-3" /> : <Award className="h-3 w-3" />}
                            {isPrime ? "PRIME STAFF" : "SUB STAFF"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleToggleStatus(member.id)}
                      className={`px-2 py-0.5 text-[10px] font-bold rounded-full border cursor-pointer shrink-0 ${
                        member.status === "active"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300"
                          : "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-300"
                      }`}
                      title="Click to toggle status"
                    >
                      {member.status === "active" ? "● On Duty" : "○ On Leave"}
                    </button>
                  </div>

                  {/* Contact & Verification Info */}
                  <div className="mt-4 space-y-2 text-xs text-zinc-600 dark:text-zinc-300">
                    <div className="flex items-center gap-2">
                      <Mail className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                      <span className="truncate">{member.email}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                      <span>{member.phone}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                      <span className="text-[11px] font-medium">{member.shiftAssigned}</span>
                    </div>
                    {member.address && (
                      <div className="flex items-center gap-2">
                        <MapPin className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                        <span className="truncate text-[11px]">{member.address}</span>
                      </div>
                    )}
                    {member.aadharNumber && (
                      <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-500">
                        <CreditCard className="h-3.5 w-3.5 text-[#0B5ED7] shrink-0" />
                        <span>
                          Aadhar: •••• •••• {member.aadharNumber.replace(/\s+/g, '').slice(-4)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Operational Capabilities Pills */}
                  <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-2">
                      Allowed Counter Privileges:
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900">
                        ✓ Attendance Scans
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900">
                        ✓ Exam Results Desk
                      </span>
                      {isPrime ? (
                        <>
                          <span className="px-2 py-0.5 rounded-md bg-[#FFC107]/15 text-[#0B5ED7] text-[10px] font-bold border border-[#FFC107]/30 dark:text-[#FFC107]">
                            ✓ Seat Allotment
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-[#FFC107]/15 text-[#0B5ED7] text-[10px] font-bold border border-[#FFC107]/30 dark:text-[#FFC107]">
                            ✓ Monthly Fees Only
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-[#FFC107]/15 text-[#0B5ED7] text-[10px] font-bold border border-[#FFC107]/30 dark:text-[#FFC107]">
                            ✓ 2-Way Messages
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 text-[10px] font-bold border border-purple-200 dark:bg-purple-950/30 dark:border-purple-900 dark:text-purple-300">
                            ✓ Add & Approve Students
                          </span>
                        </>
                      ) : (
                        <span className="px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-500 text-[10px] font-bold border border-zinc-200 dark:bg-zinc-800 dark:border-zinc-700">
                          🔒 Restricted from Fees, Seats, Msgs, Approvals
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between text-[11px] text-zinc-400">
                  <span>Last active: {member.lastLogin || "Never"}</span>
                  <div className="flex items-center gap-1">
                    <button 
                      onClick={() => setEditingStaff(member)}
                      className="text-zinc-500 hover:text-[#0B5ED7] dark:hover:text-[#FFC107] p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                      title="Edit Staff Member"
                    >
                      <Edit3 className="h-4 w-4" />
                    </button>
                    <button 
                      onClick={() => handleDeleteStaff(member.id, member.name)}
                      className="text-rose-500 hover:text-rose-700 p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                      title="Remove"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Role Comparison Matrix */}
      <div className="rounded-3xl border border-[#E5E7EB] bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-[#0A2E5C]">
        <div className="mb-4">
          <h3 className="text-sm font-black text-[#0A2E5C] dark:text-white flex items-center gap-2">
            <Lock className="h-4 w-4 text-[#0B5ED7]" /> Access Rights & Privileges Matrix
          </h3>
          <p className="text-xs text-zinc-500 mt-1">
            Exact permission tier enforcement across Prime Staff vs Sub Staff counter access.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-700 text-zinc-400 text-[10px] uppercase">
                <th className="py-3 px-4">Feature / Operation</th>
                <th className="py-3 px-4 text-center">Sub Staff</th>
                <th className="py-3 px-4 text-center">Prime Staff</th>
                <th className="py-3 px-4 text-center">Super Admin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 font-medium text-zinc-700 dark:text-zinc-300">
              <tr>
                <td className="py-3 px-4 font-bold flex items-center gap-2">
                  <QrCode className="h-3.5 w-3.5 text-emerald-600" /> Student Attendance & Gate Check-in/Out
                </td>
                <td className="py-3 px-4 text-center text-emerald-600 font-bold">✓ Full Access</td>
                <td className="py-3 px-4 text-center text-emerald-600 font-bold">✓ Full Access</td>
                <td className="py-3 px-4 text-center text-emerald-600 font-bold">✓ Full Access</td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-bold flex items-center gap-2">
                  <Award className="h-3.5 w-3.5 text-blue-600" /> Exam Results &amp; Answer Keys
                </td>
                <td className="py-3 px-4 text-center text-emerald-600 font-bold">✓ Full Access</td>
                <td className="py-3 px-4 text-center text-emerald-600 font-bold">✓ Full Access</td>
                <td className="py-3 px-4 text-center text-emerald-600 font-bold">✓ Full Access</td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-bold flex items-center gap-2">
                  <ShieldCheck className="h-3.5 w-3.5 text-amber-600" /> Seat Layout & Desk Allotment
                </td>
                <td className="py-3 px-4 text-center text-rose-500 font-bold">✗ Restricted</td>
                <td className="py-3 px-4 text-center text-emerald-600 font-bold">✓ Full Access</td>
                <td className="py-3 px-4 text-center text-emerald-600 font-bold">✓ Full Access</td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-bold flex items-center gap-2">
                  <IndianRupee className="h-3.5 w-3.5 text-emerald-600" /> Student Fees Collection
                </td>
                <td className="py-3 px-4 text-center text-rose-500 font-bold">✗ Restricted</td>
                <td className="py-3 px-4 text-center text-[#0B5ED7] font-bold">
                  ✓ Monthly Records Only
                </td>
                <td className="py-3 px-4 text-center text-emerald-600 font-bold">✓ All-time & Analytics</td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-bold flex items-center gap-2">
                  <MessageSquare className="h-3.5 w-3.5 text-blue-600" /> 2-Way Student Live Chat
                </td>
                <td className="py-3 px-4 text-center text-rose-500 font-bold">✗ Restricted</td>
                <td className="py-3 px-4 text-center text-emerald-600 font-bold">✓ Full Access</td>
                <td className="py-3 px-4 text-center text-emerald-600 font-bold">✓ Full Access</td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-bold flex items-center gap-2">
                  <UserPlus className="h-3.5 w-3.5 text-purple-600" /> Add New Student & Approve Pending
                </td>
                <td className="py-3 px-4 text-center text-rose-500 font-bold">✗ Restricted</td>
                <td className="py-3 px-4 text-center text-emerald-600 font-bold">✓ Full Access</td>
                <td className="py-3 px-4 text-center text-emerald-600 font-bold">✓ Full Access</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Staff Modal (via createPortal) */}
      {isAddModalOpen && mounted && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-fadeIn overflow-y-auto">
          <div className="relative w-full max-w-lg rounded-3xl border border-[#E5E7EB] bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-[#0A2E5C] space-y-4 my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <h3 className="text-base font-black text-[#0A2E5C] dark:text-white flex items-center gap-2">
                <UserCog className="h-5 w-5 text-[#0B5ED7]" /> Generate Staff Account
              </h3>
              <button onClick={() => setIsAddModalOpen(false)} className="rounded-full p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-white">✕</button>
            </div>

            <div className="space-y-4">
              {/* Photo Upload */}
              <div className="flex items-center gap-4 p-3 rounded-2xl bg-[#F8FAFC]/50 dark:bg-zinc-800/60 border border-[#E5E7EB]/70 dark:border-zinc-700">
                <input
                  type="file"
                  ref={addPhotoInputRef}
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handlePhotoUpload(file, false);
                  }}
                />
                {newStaff.avatarUrl ? (
                  <img
                    src={newStaff.avatarUrl}
                    alt="Staff preview"
                    className="h-16 w-16 rounded-2xl object-cover border-2 border-[#FFC107] shadow-xs shrink-0"
                  />
                ) : (
                  <div className="h-16 w-16 rounded-2xl bg-zinc-200 dark:bg-zinc-700 flex flex-col items-center justify-center text-zinc-500 dark:text-zinc-400 shrink-0 border border-dashed border-zinc-300 dark:border-zinc-600">
                    <Camera className="h-6 w-6" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-[#0A2E5C] dark:text-white">Staff Profile Photo</p>
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Compressed automatically & saved to Supabase storage.
                  </p>
                  <button
                    type="button"
                    disabled={isUploadingPhoto}
                    onClick={() => addPhotoInputRef.current?.click()}
                    className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-[#0A2E5C] text-[#FFC107] hover:bg-[#141A24] cursor-pointer disabled:opacity-50"
                  >
                    {isUploadingPhoto ? (
                      <>
                        <RefreshCw className="h-3 w-3 animate-spin" /> Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="h-3 w-3" /> {newStaff.avatarUrl ? "Change Photo" : "Upload Photo"}
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Name & Email */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-zinc-500 block mb-1">Full Name *</label>
                  <input
                    type="text"
                    placeholder="e.g. Rajesh Sharma"
                    value={newStaff.name}
                    onChange={(e) => setNewStaff({ ...newStaff, name: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-[#E5E7EB] bg-[#F8FAFC]/50 text-xs text-[#0A2E5C] dark:border-zinc-700 dark:bg-zinc-800 dark:text-white focus:outline-none focus:border-[#FFC107]"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-zinc-500 block mb-1">Email ID (Login User ID) *</label>
                  <input
                    type="email"
                    placeholder="staff@thegenius.com"
                    value={newStaff.email}
                    onChange={(e) => setNewStaff({ ...newStaff, email: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-[#E5E7EB] bg-[#F8FAFC]/50 text-xs text-[#0A2E5C] dark:border-zinc-700 dark:bg-zinc-800 dark:text-white focus:outline-none focus:border-[#FFC107]"
                  />
                </div>
              </div>

              {/* Password & Phone */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-zinc-500 block mb-1">
                    Password (Supabase Auth) *
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder="Min 6 characters"
                      value={newStaff.password}
                      onChange={(e) => setNewStaff({ ...newStaff, password: e.target.value })}
                      className="w-full p-2.5 pr-9 rounded-xl border border-[#E5E7EB] bg-[#F8FAFC]/50 text-xs font-mono text-[#0A2E5C] dark:border-zinc-700 dark:bg-zinc-800 dark:text-white focus:outline-none focus:border-[#FFC107]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="text-[10px] text-zinc-400 mt-1">Staff will use this password to sign in.</p>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-zinc-500 block mb-1">Mobile Number *</label>
                  <input
                    type="tel"
                    placeholder="+91 98765 43210"
                    value={newStaff.phone}
                    onChange={(e) => setNewStaff({ ...newStaff, phone: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-[#E5E7EB] bg-[#F8FAFC]/50 text-xs text-[#0A2E5C] dark:border-zinc-700 dark:bg-zinc-800 dark:text-white focus:outline-none focus:border-[#FFC107]"
                  />
                </div>
              </div>

              {/* Address & Aadhar */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-zinc-500 block mb-1">Residential Address</label>
                  <input
                    type="text"
                    placeholder="e.g. Flat 301, Civil Lines, Kota"
                    value={newStaff.address}
                    onChange={(e) => setNewStaff({ ...newStaff, address: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-[#E5E7EB] bg-[#F8FAFC]/50 text-xs text-[#0A2E5C] dark:border-zinc-700 dark:bg-zinc-800 dark:text-white focus:outline-none focus:border-[#FFC107]"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-zinc-500 block mb-1">Aadhar Card Number</label>
                  <input
                    type="text"
                    placeholder="12-digit UIDAI Number"
                    maxLength={14}
                    value={newStaff.aadharNumber}
                    onChange={(e) => setNewStaff({ ...newStaff, aadharNumber: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-[#E5E7EB] bg-[#F8FAFC]/50 text-xs font-mono text-[#0A2E5C] dark:border-zinc-700 dark:bg-zinc-800 dark:text-white focus:outline-none focus:border-[#FFC107]"
                  />
                </div>
              </div>

              {/* Role & Shift */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-zinc-500 block mb-1">Staff Role Category *</label>
                  <select
                    value={newStaff.role}
                    onChange={(e) => {
                      const r = e.target.value as "prime_staff" | "sub_staff";
                      setNewStaff({ 
                        ...newStaff, 
                        role: r, 
                        category: r === "prime_staff" ? "Prime Staff" : "Sub Staff" 
                      });
                    }}
                    className="w-full p-2.5 rounded-xl border border-[#E5E7EB] bg-[#F8FAFC]/50 text-xs font-bold text-[#0A2E5C] dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                  >
                    <option value="prime_staff">⭐ Prime Staff (Counter, Fees, Seats, Approvals)</option>
                    <option value="sub_staff">📖 Sub Staff (Attendance &amp; Exam Results ONLY)</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-zinc-500 block mb-1">Shift Assigned *</label>
                  <select
                    value={newStaff.shiftAssigned}
                    onChange={(e) => setNewStaff({ ...newStaff, shiftAssigned: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-[#E5E7EB] bg-[#F8FAFC]/50 text-xs font-bold text-[#0A2E5C] dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                  >
                    <option value="Morning Shift (06:00 AM - 02:00 PM)">Morning Shift (06:00 AM - 02:00 PM)</option>
                    <option value="Evening Shift (02:00 PM - 10:00 PM)">Evening Shift (02:00 PM - 10:00 PM)</option>
                    <option value="Full Access / All Shifts">Full Access / All Shifts</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleAddStaff}
                className="px-5 py-2.5 rounded-xl bg-[#0A2E5C] text-[#FFC107] text-xs font-black hover:bg-[#141A24] cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Creating in Supabase...
                  </>
                ) : (
                  "Create Staff Account"
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Edit Staff Modal (via createPortal) */}
      {editingStaff && mounted && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-fadeIn overflow-y-auto">
          <div className="relative w-full max-w-lg rounded-3xl border border-[#E5E7EB] bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-[#0A2E5C] space-y-4 my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <h3 className="text-base font-black text-[#0A2E5C] dark:text-white flex items-center gap-2">
                <Edit3 className="h-5 w-5 text-[#0B5ED7]" /> Edit Staff Member
              </h3>
              <button onClick={() => setEditingStaff(null)} className="rounded-full p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-white">✕</button>
            </div>

            <div className="space-y-4">
              {/* Photo Upload in Edit */}
              <div className="flex items-center gap-4 p-3 rounded-2xl bg-[#F8FAFC]/50 dark:bg-zinc-800/60 border border-[#E5E7EB]/70 dark:border-zinc-700">
                <input
                  type="file"
                  ref={editPhotoInputRef}
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handlePhotoUpload(file, true);
                  }}
                />
                {editingStaff.avatarUrl ? (
                  <img
                    src={editingStaff.avatarUrl}
                    alt="Staff preview"
                    className="h-16 w-16 rounded-2xl object-cover border-2 border-[#FFC107] shadow-xs shrink-0"
                  />
                ) : (
                  <div className="h-16 w-16 rounded-2xl bg-zinc-200 dark:bg-zinc-700 flex flex-col items-center justify-center text-zinc-500 dark:text-zinc-400 shrink-0 border border-dashed border-zinc-300 dark:border-zinc-600">
                    <Camera className="h-6 w-6" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-[#0A2E5C] dark:text-white">Profile Photo</p>
                  <button
                    type="button"
                    disabled={isUploadingPhoto}
                    onClick={() => editPhotoInputRef.current?.click()}
                    className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-[#0A2E5C] text-[#FFC107] hover:bg-[#141A24] cursor-pointer disabled:opacity-50"
                  >
                    {isUploadingPhoto ? (
                      <>
                        <RefreshCw className="h-3 w-3 animate-spin" /> Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="h-3 w-3" /> {editingStaff.avatarUrl ? "Change Photo" : "Upload Photo"}
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-zinc-500 block mb-1">Full Name:</label>
                  <input
                    type="text"
                    value={editingStaff.name}
                    onChange={(e) => setEditingStaff({ ...editingStaff, name: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-[#E5E7EB] bg-[#F8FAFC]/50 text-xs text-[#0A2E5C] dark:border-zinc-700 dark:bg-zinc-800 dark:text-white focus:outline-none focus:border-[#FFC107]"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-zinc-500 block mb-1">Email Address (Login ID):</label>
                  <input
                    type="email"
                    value={editingStaff.email}
                    onChange={(e) => setEditingStaff({ ...editingStaff, email: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-[#E5E7EB] bg-[#F8FAFC]/50 text-xs text-[#0A2E5C] dark:border-zinc-700 dark:bg-zinc-800 dark:text-white focus:outline-none focus:border-[#FFC107]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-zinc-500 block mb-1">Phone Number:</label>
                  <input
                    type="text"
                    value={editingStaff.phone}
                    onChange={(e) => setEditingStaff({ ...editingStaff, phone: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-[#E5E7EB] bg-[#F8FAFC]/50 text-xs text-[#0A2E5C] dark:border-zinc-700 dark:bg-zinc-800 dark:text-white focus:outline-none focus:border-[#FFC107]"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-zinc-500 block mb-1">Reset Password (Optional):</label>
                  <input
                    type="password"
                    placeholder="Leave empty to keep unchanged"
                    value={editingStaff.password || ""}
                    onChange={(e) => setEditingStaff({ ...editingStaff, password: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-[#E5E7EB] bg-[#F8FAFC]/50 text-xs font-mono text-[#0A2E5C] dark:border-zinc-700 dark:bg-zinc-800 dark:text-white focus:outline-none focus:border-[#FFC107]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-zinc-500 block mb-1">Residential Address:</label>
                  <input
                    type="text"
                    placeholder="Address"
                    value={editingStaff.address || ""}
                    onChange={(e) => setEditingStaff({ ...editingStaff, address: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-[#E5E7EB] bg-[#F8FAFC]/50 text-xs text-[#0A2E5C] dark:border-zinc-700 dark:bg-zinc-800 dark:text-white focus:outline-none focus:border-[#FFC107]"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-zinc-500 block mb-1">Aadhar Number:</label>
                  <input
                    type="text"
                    placeholder="Aadhar Number"
                    value={editingStaff.aadharNumber || ""}
                    onChange={(e) => setEditingStaff({ ...editingStaff, aadharNumber: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-[#E5E7EB] bg-[#F8FAFC]/50 text-xs font-mono text-[#0A2E5C] dark:border-zinc-700 dark:bg-zinc-800 dark:text-white focus:outline-none focus:border-[#FFC107]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-zinc-500 block mb-1">Role Category:</label>
                  <select
                    value={editingStaff.role}
                    onChange={(e) => {
                      const r = e.target.value as "prime_staff" | "sub_staff";
                      setEditingStaff({ 
                        ...editingStaff, 
                        role: r, 
                        category: r === "prime_staff" ? "Prime Staff" : "Sub Staff" 
                      });
                    }}
                    className="w-full p-2.5 rounded-xl border border-[#E5E7EB] bg-[#F8FAFC]/50 text-xs font-bold text-[#0A2E5C] dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                  >
                    <option value="prime_staff">⭐ Prime Staff (Attendance, Seats, Exam Results, Monthly Fees, Messages, Add &amp; Approve)</option>
                    <option value="sub_staff">📖 Sub Staff (Attendance &amp; Exam Results ONLY)</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-zinc-500 block mb-1">Shift Assigned:</label>
                  <select
                    value={editingStaff.shiftAssigned}
                    onChange={(e) => setEditingStaff({ ...editingStaff, shiftAssigned: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-[#E5E7EB] bg-[#F8FAFC]/50 text-xs font-bold text-[#0A2E5C] dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                  >
                    <option value="Morning Shift (06:00 AM - 02:00 PM)">Morning Shift (06:00 AM - 02:00 PM)</option>
                    <option value="Evening Shift (02:00 PM - 10:00 PM)">Evening Shift (02:00 PM - 10:00 PM)</option>
                    <option value="Full Access / All Shifts">Full Access / All Shifts</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setEditingStaff(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleUpdateStaff}
                className="px-5 py-2.5 rounded-xl bg-[#0A2E5C] text-[#FFC107] text-xs font-black hover:bg-[#141A24] cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Saving Changes...
                  </>
                ) : (
                  "Save Changes"
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
