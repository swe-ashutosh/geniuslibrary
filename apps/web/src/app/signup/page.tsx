"use client";

/**
 * [WEB • PAGE] Student Registration
 *
 * Self sign-up: creates Supabase auth user + profiles row (pending
 * admin approval) with throttling from security.ts.
 */
import { useState, Suspense, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { 
  User, 
  Lock, 
  Mail,
  Phone,
  ArrowRight,
  MapPin,
  BookOpen,
  Clock,
  Users,
  CheckCircle2,
  Sparkles,
  AlertCircle,
  Crown,
  ShieldCheck,
  RotateCcw,
  ChevronDown,
  Check,
  Camera,
  Upload,
  Trash2
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { createNotification, lookupStudent, generateStudentCode } from "@/lib/api";
import { triggerNativeNotification } from "@/lib/pushNotify";
import { uploadAvatar, fileToDataUrl, compressAndResizeImage } from "@/lib/supabase/storage";
import { checkSignupRateLimit, recordSignupAttempt } from "@/lib/security";

type MembershipPlan = "General" | "Reserved Seat" | "Trial Pass";

export interface ShiftPlanOption {
  id: string;
  name: string;
  time: string;
  price: number;
  duration: string;
  category: "general" | "reserved" | "trial" | "night";
  description: string;
}

export const GENERAL_SHIFTS: ShiftPlanOption[] = [
  {
    id: "standard_3hr",
    name: "Standard (3 Hours Pass)",
    time: "Flexible 24/7",
    price: 300,
    duration: "3 Hours / Day",
    category: "general",
    description: "Short study sessions, quick revision, flexible 24/7 access",
  },
  {
    id: "prime_6hr",
    name: "Pro / Prime (6 Hours Pass)",
    time: "Flexible 24/7",
    price: 500,
    duration: "6 Hours / Day",
    category: "general",
    description: "Regular students, half-day focused seating & calm environment",
  },
  {
    id: "night_ultra",
    name: "Night Shift Ultra",
    time: "10:00 PM - 06:00 AM",
    price: 500,
    duration: "8 Hours Night",
    category: "night",
    description: "Late-night focused study for exam aspirants and night owls",
  },
];

export const RESERVED_SHIFTS: ShiftPlanOption[] = [
  {
    id: "reserve_mini",
    name: "Elite / Reserve Mini",
    time: "24/7 Dedicated Seat",
    price: 500,
    duration: "24/7 Full Access",
    category: "reserved",
    description: "Standard reserved dedicated desk for consistent daily focus",
  },
  {
    id: "reserve_big",
    name: "Prime / Reserve Big",
    time: "24/7 Premium Large Desk",
    price: 600,
    duration: "24/7 Full Access",
    category: "reserved",
    description: "Extra space, premium large reserved seating for maximum comfort",
  },
  {
    id: "reserve_locker",
    name: "Max / Reserve Locker",
    time: "24/7 Seat + Locker",
    price: 700,
    duration: "24/7 Full Access",
    category: "reserved",
    description: "Personal reserved desk + dedicated locker facility for books & belongings",
  },
];

export const TRIAL_SHIFTS: ShiftPlanOption[] = [
  {
    id: "trial_3day",
    name: "3-Day Free Trial Pass",
    time: "Flexible 24/7",
    price: 0,
    duration: "3 Days Access",
    category: "trial",
    description: "100% Free 3-day test-drive pass across all flexible study zones",
  },
];

export const ALL_SHIFT_OPTIONS: ShiftPlanOption[] = [
  ...GENERAL_SHIFTS,
  ...RESERVED_SHIFTS,
  ...TRIAL_SHIFTS,
];

const SHIFT_OPTIONS = ALL_SHIFT_OPTIONS;

export default function SignupPage() {
  return (
    <>
      <Navbar />
      <Suspense
        fallback={
          <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#141A24] flex flex-col justify-center pt-8 pb-40 text-center sm:px-6">
            <h1 className="text-2xl font-black text-[#0A2E5C] dark:text-white">
              Student Registration & Admission
            </h1>
            <p className="mt-2 text-xs text-[#0B5ED7]">Loading registration form...</p>
          </div>
        }
      >
        <SignupForm />
      </Suspense>
      <Footer className="hidden md:block" />
    </>
  );
}

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isAdmin = searchParams.get("admin") === "true";
  const emailParam = searchParams.get("email") || "";

  const [signupMethod, setSignupMethod] = useState<"google" | "email">(
    isAdmin || emailParam ? "email" : "google"
  );

  const [name, setName] = useState("");
  const [email, setEmail] = useState(emailParam);
  const [phone, setPhone] = useState("");
  const [parentName, setParentName] = useState("");
  const [parentPhone, setParentPhone] = useState("");
  const [address, setAddress] = useState("");
  const [course, setCourse] = useState("");
  const [membershipPlan, setMembershipPlan] = useState<"General" | "Reserved Seat" | "Trial Pass">("General");
  const [shift, setShift] = useState("standard_3hr");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarSizeStr, setAvatarSizeStr] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressed = await compressAndResizeImage(file, 480, 0.78, 120 * 1024);
        setAvatarFile(compressed);
        setAvatarSizeStr(`${(compressed.size / 1024).toFixed(0)} KB`);
        const preview = await fileToDataUrl(compressed);
        setAvatarPreview(preview);
      } catch (err) {
        setAvatarFile(file);
        setAvatarSizeStr(null);
        try {
          const preview = await fileToDataUrl(file);
          setAvatarPreview(preview);
        } catch {}
      }
    }
  };

  const handleRemoveAvatar = () => {
    setAvatarFile(null);
    setAvatarPreview(null);
    setAvatarSizeStr(null);
    if (avatarInputRef.current) avatarInputRef.current.value = "";
  };
  
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isUpdatedApplication, setIsUpdatedApplication] = useState(false);

  // Custom Dropdown Open States and Refs
  const [isPlanDropdownOpen, setIsPlanDropdownOpen] = useState(false);
  const [isShiftDropdownOpen, setIsShiftDropdownOpen] = useState(false);
  const planDropdownRef = useRef<HTMLDivElement>(null);
  const shiftDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (planDropdownRef.current && !planDropdownRef.current.contains(event.target as Node)) {
        setIsPlanDropdownOpen(false);
      }
      if (shiftDropdownRef.current && !shiftDropdownRef.current.contains(event.target as Node)) {
        setIsShiftDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Dynamic fee calculation depending on BOTH Membership Plan & Shift
  const currentShiftObj = ALL_SHIFT_OPTIONS.find((s) => s.id === shift) || GENERAL_SHIFTS[0];
  const currentTotalFee = membershipPlan === "Trial Pass" 
    ? 0 
    : currentShiftObj.price;

  // Sync signup method if admin or email query param is detected
  useEffect(() => {
    if (isAdmin || emailParam) {
      setSignupMethod("email");
      if (emailParam) {
        setEmail(emailParam);
      }
    }
  }, [isAdmin, emailParam]);

  // Helper: Format names to only allow letters/spaces and auto-capitalize each word
  const formatNameInput = (value: string) => {
    const lettersOnly = value.replace(/[^a-zA-Z\s]/g, "");
    return lettersOnly.replace(/\b([a-z])/g, (char) => char.toUpperCase());
  };

  // Helper: Format phone numbers to only allow 10 digits
  const formatPhoneInput = (value: string) => {
    return value.replace(/\D/g, "").slice(0, 10);
  };

  // Check if returning from Google OAuth with pending details
  useEffect(() => {
    async function checkPendingOAuth() {
      const pendingData = sessionStorage.getItem("pending_student_signup");
      if (pendingData) {
        try {
          const parsed = JSON.parse(pendingData);
          const supabase = createClient();
          const { data: { user } } = await supabase.auth.getUser();
          
          if (user) {
            // Check if profile already exists by ID or email to avoid resetting active accounts
            let existingProfile: any = null;
            const { data: pById } = await supabase
              .from("profiles")
              .select("id, status, role")
              .eq("id", user.id)
              .maybeSingle();

            if (pById) {
              existingProfile = pById;
            } else if (user.email) {
              const { data: pByEmail } = await supabase
                .from("profiles")
                .select("id, status, role")
                .eq("email", user.email.toLowerCase())
                .maybeSingle();

              if (pByEmail) {
                existingProfile = pByEmail;
                try {
                  await supabase.from("profiles").update({ id: user.id }).eq("email", user.email.toLowerCase());
                } catch {}
              }
            }

            if (existingProfile && existingProfile.status === "active") {
              sessionStorage.removeItem("pending_student_signup");
              router.push("/student");
              return;
            }

            const isUpdated = existingProfile?.status === "pending";
            if (isUpdated) {
              setIsUpdatedApplication(true);
            }

            const formattedPhone = parsed.phone ? (parsed.phone.startsWith("+91") ? parsed.phone : `+91 ${parsed.phone}`) : "";
            const formattedParentPhone = parsed.parentPhone ? (parsed.parentPhone.startsWith("+91") ? parsed.parentPhone : `+91 ${parsed.parentPhone}`) : "";
            const matchedShift = ALL_SHIFT_OPTIONS.find((s) => s.id === parsed.shift) || GENERAL_SHIFTS[0];

            const studentName = parsed.name || user.user_metadata?.full_name || user.email?.split("@")[0] || "Student Member";
            const shiftName = `${matchedShift.name} (${matchedShift.time})`;
            const avatarUrl = parsed.avatarPreview || user.user_metadata?.avatar_url || null;

            // Direct save to Supabase profiles (Primary live database)
            try {
              await supabase.from("profiles").upsert({
                id: user.id,
                full_name: studentName,
                email: user.email,
                phone: formattedPhone,
                parent_name: parsed.parentName,
                parent_phone: formattedParentPhone,
                address: parsed.address,
                course: parsed.course || "General",
                membership_plan: parsed.membershipPlan || "General",
                shift: shiftName,
                avatar_url: avatarUrl,
                status: "pending",
                role: "student",
                fee_status: "Due",
                due_amount: parsed.membershipPlan === "Trial Pass" ? 0 : matchedShift.price,
                updated_at: new Date().toISOString(),
              });
            } catch (err) {
              console.warn("OAuth registration save warning:", err);
            }

            // Immediately show submitted screen
            sessionStorage.removeItem("pending_student_signup");
            setIsSubmitted(true);

            // Asynchronous background notifications
            const notifTitle = isUpdated ? "📝 Student Updated Registration" : "🎓 New Student Registration";
            const notifMsg = `${studentName} (${user.email}) ${isUpdated ? "updated their registration" : "registered"} via Google for ${parsed.membershipPlan || "General"} - ${shiftName}. Approval pending.`;
            createNotification({
              recipientRole: "admin",
              title: notifTitle,
              message: notifMsg,
              type: "signup",
              actionUrl: "/admin/students?modal=pending",
            }).catch(() => {});
          }
        } catch (e) {
          console.error("Error saving pending oauth data", e);
        }
      }
    }
    checkPendingOAuth();
  }, [router]);

  const validateCommonFields = () => {
    if (!name.trim()) {
      setErrorMsg("Please enter the student's full name (letters only).");
      return false;
    }
    if (phone.length !== 10) {
      setErrorMsg("Student Mobile Number must be exactly 10 digits.");
      return false;
    }
    if (!parentName.trim()) {
      setErrorMsg("Please enter the parent's / guardian's name (letters only).");
      return false;
    }
    if (parentPhone.length !== 10) {
      setErrorMsg("Parent's Mobile Number must be exactly 10 digits.");
      return false;
    }
    if (phone === parentPhone) {
      setErrorMsg("Student and Parent/Guardian mobile numbers cannot be the same.");
      return false;
    }
    if (!course.trim()) {
      setErrorMsg("Please specify the target exam or course (e.g. SSC, UP Police, UPSC).");
      return false;
    }
    if (!address.trim()) {
      setErrorMsg("Please provide your full residential address.");
      return false;
    }
    return true;
  };

  const resetForm = () => {
    setName("");
    setEmail("");
    setPhone("");
    setParentName("");
    setParentPhone("");
    setAddress("");
    setCourse("");
    setMembershipPlan("General");
    setShift("standard_3hr");
    setPassword("");
    setConfirmPassword("");
    setAvatarFile(null);
    setAvatarPreview(null);
    if (avatarInputRef.current) avatarInputRef.current.value = "";
    setIsSubmitted(false);
    setIsUpdatedApplication(false);
    setErrorMsg("");
  };

  const handleEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    const rateCheck = checkSignupRateLimit();
    if (!rateCheck.allowed) {
      setErrorMsg(`Registration rate limit reached. For security, please wait ${rateCheck.waitSeconds} seconds before attempting another registration.`);
      return;
    }

    if (!validateCommonFields()) return;

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password || !confirmPassword) {
      setErrorMsg("Please provide your email address and password.");
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg("Passwords do not match.");
      return;
    }
    if (password.length < 6) {
      setErrorMsg("Password must be at least 6 characters long.");
      return;
    }

    setIsLoading(true);
    const supabase = createClient();

    // 1. Check for Duplicate or Existing Profile / Student Record
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("id, email, status, role, phone")
      .eq("email", cleanEmail)
      .maybeSingle();

    let matchedExisting = existingProfile;

    if (!matchedExisting) {
      try {
        const matched = await lookupStudent({ email: cleanEmail });
        if (matched) {
          matchedExisting = {
            id: matched.id,
            email: matched.email,
            status: matched.status,
            role: matched.role || "student",
            phone: matched.phone,
          };
        }
      } catch {}
    }

    if (matchedExisting) {
      if (matchedExisting.status === "active") {
        setIsLoading(false);
        setErrorMsg("An active, approved account with this email address already exists. Please sign in directly.");
        return;
      }
      if (matchedExisting.status === "suspended") {
        setIsLoading(false);
        setErrorMsg("This student account is currently suspended. Please contact the library administration at Madhupur, Sonbhadra.");
        return;
      }
      // Status is "pending": The student is updating their existing pending application with latest form data!
    }

    const isExistingPending = matchedExisting?.status === "pending";
    if (isExistingPending) {
      setIsUpdatedApplication(true);
    }

    const fullPhone = `+91 ${phone}`;
    const fullParentPhone = `+91 ${parentPhone}`;
    const initialStatus = isAdmin ? "active" : "pending";
    const fullShiftName = `${currentShiftObj.name} (${currentShiftObj.time})`;

    let studentId = matchedExisting?.id;

    if (!studentId) {
      // 2. Perform Supabase Auth Sign Up for brand new applicant
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: cleanEmail,
        password: password,
        options: {
          data: {
            full_name: name,
            phone: fullPhone,
            parent_name: parentName,
            parent_phone: fullParentPhone,
            address: address,
            course: course,
            shift: fullShiftName,
            membership_plan: membershipPlan,
            seat_number: null,
            role: "student",
            status: initialStatus,
          },
        },
      });

      if (authError) {
        setIsLoading(false);
        if (
          authError.message.toLowerCase().includes("already registered") ||
          authError.message.toLowerCase().includes("user already exists") ||
          authError.message.toLowerCase().includes("unique")
        ) {
          setErrorMsg("An account with this email address already exists. Please sign in instead.");
        } else {
          setErrorMsg(authError.message);
        }
        return;
      }

      // Supabase anti-enumeration check: if identities is empty, the user already exists
      if (authData?.user && Array.isArray(authData.user.identities) && authData.user.identities.length === 0) {
        setIsLoading(false);
        setErrorMsg("An account with this email address already exists. Please sign in instead.");
        return;
      }

      const fallbackUuid = (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function")
        ? crypto.randomUUID()
        : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0;
            const v = c === "x" ? r : (r & 0x3) | 0x8;
            return v.toString(16);
          });
      studentId = authData?.user?.id || fallbackUuid;
    }

    // FAST SUBMISSION PIPELINE (Instant popup under 800ms)
    // 1. Instant Avatar URL from already-compressed preview in memory
    const finalAvatarUrl = avatarPreview || null;

    // 2. Direct Persistence: Save exclusively to Supabase profiles (Primary live database)
    try {
      let generatedStudentCode = "";
      try {
        const { data: existingProfiles } = await supabase.from("profiles").select("student_code");
        const existingCodes = (existingProfiles || []).map((p: any) => p.student_code);
        generatedStudentCode = generateStudentCode(existingCodes);
      } catch (codeErr) {
        console.warn("Failed to query existing student codes for sequence:", codeErr);
        generatedStudentCode = generateStudentCode([]);
      }

      const { error: upsertErr } = await supabase.from("profiles").upsert({
        id: studentId,
        student_code: generatedStudentCode,
        full_name: name,
        email: cleanEmail,
        phone: fullPhone,
        parent_name: parentName,
        parent_phone: fullParentPhone,
        address: address,
        course: course,
        shift: fullShiftName,
        membership_plan: membershipPlan,
        avatar_url: finalAvatarUrl,
        role: "student",
        status: initialStatus,
        fee_status: "Due",
        due_amount: currentTotalFee,
        updated_at: new Date().toISOString(),
      });

      if (upsertErr) {
        console.error("Student registration save error:", upsertErr);
        setIsLoading(false);
        setErrorMsg(`Failed to save registration: ${upsertErr.message}`);
        return;
      }
    } catch (saveErr: any) {
      console.error("Student registration save exception:", saveErr);
      setIsLoading(false);
      setErrorMsg(`Failed to save registration: ${saveErr?.message || "Unknown error"}`);
      return;
    }

    // 3. Immediately show the submitted popup! (Zero lag for user)
    setIsLoading(false);
    recordSignupAttempt();
    setIsSubmitted(true);

    // 4. Background tasks (Supabase bucket avatar upload & admin notifications)
    if (avatarFile && studentId) {
      uploadAvatar(avatarFile, studentId)
        .then(async (res) => {
          if (res?.url) {
            await supabase.from("profiles").update({ avatar_url: res.url }).eq("id", studentId);
          }
        })
        .catch(() => {});
    }

    const notifTitle = isExistingPending
      ? "📝 Student Updated Registration"
      : "🎓 New Student Registration";
    const notifMsg = isExistingPending
      ? `${name} (${cleanEmail}) updated their registration details for ${membershipPlan} - ${fullShiftName}.`
      : `${name} (${cleanEmail}) registered for ${membershipPlan} - ${fullShiftName}. Approval pending.`;

    createNotification({
      recipientRole: "admin",
      title: notifTitle,
      message: notifMsg,
      type: "signup",
      actionUrl: "/admin/students?modal=pending",
    }).catch(() => {});
  };

  const handleGoogleSignup = async () => {
    setErrorMsg("");
    
    if (!validateCommonFields()) return;

    setIsLoading(true);
    
    // Save student details to sessionStorage so it persists through Google OAuth redirect
    sessionStorage.setItem("pending_student_signup", JSON.stringify({
      name,
      phone: `+91 ${phone}`,
      parentName,
      parentPhone: `+91 ${parentPhone}`,
      address,
      course,
      membershipPlan,
      shift,
      avatarPreview,
    }));

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${location.origin}/signup/`,
      }
    });

    if (error) {
      setErrorMsg(error.message);
      setIsLoading(false);
    }
  };

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#141A24] flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div className="fixed top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] bg-[#FFC107]/10 blur-[100px] pointer-events-none rounded-full" />

        <div className="sm:mx-auto sm:w-full sm:max-w-md text-center relative z-10 px-4">
          <div className="rounded-3xl border border-[#E5E7EB] bg-white p-8 sm:p-10 shadow-xl shadow-[#0A2E5C]/5 backdrop-blur-md dark:border-zinc-800 dark:bg-[#0A2E5C]">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30 mb-6">
              <CheckCircle2 className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
            </div>
            
            <h1 className="text-2xl font-black tracking-tight text-[#0A2E5C] dark:text-white mb-2">
              {isAdmin 
                ? "Student Successfully Enrolled!" 
                : isUpdatedApplication 
                  ? "Application Details Updated!" 
                  : "Application Submitted!"}
            </h1>
            
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-8 leading-relaxed">
              {isAdmin ? (
                <>
                  Student <strong>{name}</strong> has been enrolled directly into <strong>{membershipPlan}</strong> ({currentShiftObj.name}) with <strong>Active Status</strong>.
                </>
              ) : isUpdatedApplication ? (
                <>
                  Your updated registration details for <strong>{membershipPlan}</strong> ({currentShiftObj.name}) have been saved and sent to the <strong>Library Admin for approval</strong>.
                </>
              ) : (
                <>
                  Your details have been received for <strong>{membershipPlan}</strong> ({currentShiftObj.name}) and sent to the <strong>Library Admin for approval</strong>.
                </>
              )}
            </p>

            <div className="space-y-3">
              {isAdmin ? (
                <>
                  <Link
                    href="/admin/students"
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-linear-to-r from-[#0B5ED7] to-[#FFC107] py-3.5 text-xs font-black text-[#0A2E5C] shadow-md hover:opacity-95 transition active:scale-95 cursor-pointer"
                  >
                    <span>Return to Admin Students</span>
                    <ArrowRight className="h-4 w-4" />
                  </Link>

                  <button
                    type="button"
                    onClick={resetForm}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#F8FAFC] py-3 text-xs font-bold text-[#0A2E5C] dark:bg-zinc-800 dark:text-zinc-200 border border-[#E5E7EB] dark:border-zinc-700 hover:bg-zinc-100 transition cursor-pointer"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>+ Enroll Another Student</span>
                  </button>
                </>
              ) : (
                <Link
                  href="/login"
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#0A2E5C] py-3.5 text-sm font-bold text-[#FFC107] border border-[#FFC107]/40 shadow-md hover:bg-[#141A24] transition active:scale-95 cursor-pointer"
                >
                  Go to Sign In
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#141A24] flex flex-col justify-center pt-8 sm:pt-12 pb-40 sm:pb-24 px-3 sm:px-6 lg:px-8">
      {/* Background Decorative */}
      <div className="fixed top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] bg-[#FFC107]/10 blur-[100px] pointer-events-none rounded-full" />

      <div className="sm:mx-auto sm:w-full sm:max-w-3xl text-center relative z-10">
        <div className="flex justify-center">
          <BrandLogo variant="navbar" size="lg" />
        </div>
        <h1 className="mt-4 text-2xl font-black tracking-tight text-[#0A2E5C] dark:text-white">
          {isAdmin ? "Admin Direct Student Admission" : "Student Registration"}
        </h1>
        <p className="mt-1 text-xs text-[#0B5ED7]">
          {isAdmin 
            ? "Direct student onboarding — active account created immediately with no approval queue." 
            : "Fill your details once and choose your membership plan & shift for instant admission."}
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-3xl px-4 relative z-10">
        <div className="rounded-3xl border border-[#E5E7EB] bg-white p-6 sm:p-8 shadow-xl shadow-[#0A2E5C]/5 backdrop-blur-md dark:border-zinc-800 dark:bg-[#0A2E5C]">
          
          {/* Admin Banner */}
          {isAdmin && (
            <div className="mb-6 rounded-2xl bg-[#0A2E5C] text-white p-4 border border-[#FFC107]/40 flex items-center justify-between shadow-md">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-[#FFC107]/20 flex items-center justify-center text-[#FFC107] shrink-0">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-black text-[#FFC107] uppercase tracking-wider">Admin Enrollment Mode</p>
                  <p className="text-[11px] text-zinc-300">Instant registration with Active status. Password can be set for the student.</p>
                </div>
              </div>
              <Link href="/admin/students" className="text-xs font-bold text-[#FFC107] hover:underline shrink-0 ml-3 hidden sm:inline-block">
                Back to Students →
              </Link>
            </div>
          )}

          {/* Method Selector Tabs */}
          <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-[#F8FAFC] dark:bg-zinc-800 mb-6 border border-[#E5E7EB]/60 dark:border-zinc-700">
            <button
              type="button"
              onClick={() => { setSignupMethod("google"); setErrorMsg(""); }}
              className={`flex items-center justify-center gap-1.5 sm:gap-2 py-2 sm:py-2.5 px-2 rounded-xl text-[11px] sm:text-xs font-bold transition-all cursor-pointer select-none ${
                signupMethod === "google"
                  ? "bg-white text-[#0A2E5C] shadow-sm dark:bg-[#0A2E5C] dark:text-white border border-[#E5E7EB]/40 dark:border-zinc-700"
                  : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400"
              }`}
            >
              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              <span className="truncate"><span className="hidden xs:inline sm:inline">Sign Up with </span>Google</span>
              <span className="text-[9px] font-extrabold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 px-1 py-0.5 rounded shrink-0 hidden xxs:inline-block">Fast</span>
            </button>

            <button
              type="button"
              onClick={() => { setSignupMethod("email"); setErrorMsg(""); }}
              className={`flex items-center justify-center gap-1.5 sm:gap-2 py-2 sm:py-2.5 px-2 rounded-xl text-[11px] sm:text-xs font-bold transition-all cursor-pointer select-none ${
                signupMethod === "email"
                  ? "bg-white text-[#0A2E5C] shadow-sm dark:bg-[#0A2E5C] dark:text-white border border-[#E5E7EB]/40 dark:border-zinc-700"
                  : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400"
              }`}
            >
              <Mail className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
              <span className="truncate">Email<span className="hidden xs:inline sm:inline"> & Password</span></span>
              {isAdmin && <span className="text-[9px] font-extrabold text-[#0B5ED7] bg-[#0B5ED7]/10 px-1 py-0.5 rounded shrink-0 hidden xxs:inline-block">Admin</span>}
            </button>
          </div>

          {errorMsg && (
            <div className="mb-6 rounded-2xl border border-rose-300 bg-rose-50 dark:bg-rose-950/40 dark:border-rose-800 p-4 text-xs font-semibold text-rose-800 dark:text-rose-200 flex items-start gap-3 shadow-sm">
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">
                {errorMsg}
                {errorMsg.includes("already exists") && (
                  <div className="mt-2">
                    <Link href="/login" className="inline-flex items-center gap-1 font-bold text-rose-900 dark:text-rose-100 underline hover:no-underline">
                      Click here to Sign In →
                    </Link>
                  </div>
                )}
              </div>
            </div>
          )}

          {signupMethod === "google" && !isAdmin && (
            <div className="mb-6 rounded-2xl bg-linear-to-r from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 p-4 border border-blue-200 dark:border-blue-900/40 flex items-center gap-3">
              <Sparkles className="h-5 w-5 text-blue-600 shrink-0" />
              <p className="text-xs text-blue-900 dark:text-blue-200 font-medium">
                <strong>No password needed!</strong> Fill your student details below and click <strong>Submit with Google</strong>. Only one account per verified email is allowed.
              </p>
            </div>
          )}

          <form onSubmit={signupMethod === "email" ? handleEmailSignup : (e) => { e.preventDefault(); handleGoogleSignup(); }} className="space-y-6">
            
            {/* 1. Student Information */}
            <div>
              <div className="flex items-center justify-between border-b border-[#E5E7EB] dark:border-zinc-700 pb-2 mb-4">
                <h3 className="text-sm font-bold text-[#0A2E5C] dark:text-[#FFC107]">Student Information</h3>
                <span className="text-[10px] text-zinc-500 flex items-center gap-1 font-medium">
                  <Sparkles className="h-3 w-3 text-[#FFC107]" /> Photo verified & stored securely
                </span>
              </div>

              {/* Profile Photo Uploader */}
              <div className="mb-5 p-4 rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC]/40 dark:bg-zinc-800/40 dark:border-zinc-700/80 flex flex-col sm:flex-row items-center gap-4">
                <div className="relative group shrink-0">
                  <div className="h-20 w-20 rounded-full border-2 border-[#FFC107] overflow-hidden bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shadow-md">
                    {avatarPreview ? (
                      <img src={avatarPreview} alt="Student Avatar Preview" className="h-full w-full object-cover" />
                    ) : (
                      <User className="h-10 w-10 text-zinc-400 dark:text-zinc-500" />
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-[#0B5ED7] text-white flex items-center justify-center shadow-sm hover:bg-[#7d6049] transition cursor-pointer"
                    title="Upload Photo"
                  >
                    <Camera className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="flex-1 text-center sm:text-left">
                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                    <p className="text-xs font-bold text-[#0A2E5C] dark:text-white">Profile Photo</p>
                    <span className="text-[10px] text-zinc-400 bg-white dark:bg-zinc-800 px-2 py-0.5 rounded-full border border-zinc-200 dark:border-zinc-700">Optional</span>
                    {avatarPreview && (
                      <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/50">
                        ✓ Compressed {avatarSizeStr ? `(${avatarSizeStr})` : "< 100 KB"} — Ready
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Upload a clear passport-size photo for your library ID card and attendance verification.
                  </p>
                  <div className="mt-2.5 flex items-center justify-center sm:justify-start gap-2">
                    <button
                      type="button"
                      onClick={() => avatarInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-[#0A2E5C] text-white hover:bg-zinc-800 dark:bg-[#FFC107] dark:text-[#0A2E5C] transition cursor-pointer shadow-xs"
                    >
                      <Upload className="h-3 w-3" />
                      {avatarPreview ? "Change Photo" : "Upload Photo"}
                    </button>
                    {avatarPreview && (
                      <button
                        type="button"
                        onClick={handleRemoveAvatar}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition cursor-pointer"
                      >
                        <Trash2 className="h-3 w-3" /> Remove
                      </button>
                    )}
                  </div>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarChange}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#0A2E5C] dark:text-zinc-200 mb-1.5">
                    Full Name <span className="text-rose-500">*</span> <span className="text-[10px] text-zinc-400 font-normal">(Letters only)</span>
                  </label>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-zinc-400">
                      <User className="h-4 w-4" />
                    </div>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(formatNameInput(e.target.value))}
                      placeholder="e.g. Ashutosh Kushwaha"
                      className="w-full rounded-xl border border-[#E5E7EB] bg-[#F8FAFC]/50 py-2.5 pl-10 pr-3 text-xs text-[#0A2E5C] placeholder-zinc-400 focus:border-[#FFC107] focus:outline-none focus:ring-2 focus:ring-[#FFC107]/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white transition-all capitalize"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#0A2E5C] dark:text-zinc-200 mb-1.5">
                    Student Mobile Number <span className="text-rose-500">*</span> <span className="text-[10px] text-zinc-400 font-normal">(10 digits)</span>
                  </label>
                  <div className="relative flex items-center">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                      <span className="text-xs font-bold font-mono text-zinc-500 dark:text-zinc-400 select-none">
                        +91
                      </span>
                    </div>
                    <input
                      type="tel"
                      required
                      maxLength={10}
                      value={phone}
                      onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
                      placeholder="98765 43210"
                      className="w-full rounded-xl border border-[#E5E7EB] bg-[#F8FAFC]/50 py-2.5 pl-13 pr-3 text-xs text-[#0A2E5C] placeholder-zinc-400 focus:border-[#FFC107] focus:outline-none focus:ring-2 focus:ring-[#FFC107]/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white transition-all font-mono font-bold"
                    />
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-[#0A2E5C] dark:text-zinc-200 mb-1.5">
                    Course / Target Exam <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-zinc-400">
                      <BookOpen className="h-4 w-4" />
                    </div>
                    <input
                      type="text"
                      required
                      value={course}
                      onChange={(e) => setCourse(e.target.value)}
                      placeholder="e.g. SSC / UP Police / UPSC / JEE / CA / NEET"
                      className="w-full rounded-xl border border-[#E5E7EB] bg-[#F8FAFC]/50 py-2.5 pl-10 pr-3 text-xs text-[#0A2E5C] placeholder-zinc-400 focus:border-[#FFC107] focus:outline-none focus:ring-2 focus:ring-[#FFC107]/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white transition-all"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Guardian Details */}
            <div>
              <h3 className="text-sm font-bold text-[#0A2E5C] dark:text-[#FFC107] mb-3 border-b border-[#E5E7EB] dark:border-zinc-700 pb-2">Parent / Guardian Details</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#0A2E5C] dark:text-zinc-200 mb-1.5">
                    Parent's Name <span className="text-rose-500">*</span> <span className="text-[10px] text-zinc-400 font-normal">(Letters only)</span>
                  </label>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-zinc-400">
                      <Users className="h-4 w-4" />
                    </div>
                    <input
                      type="text"
                      required
                      value={parentName}
                      onChange={(e) => setParentName(formatNameInput(e.target.value))}
                      placeholder="Father's / Mother's Name"
                      className="w-full rounded-xl border border-[#E5E7EB] bg-[#F8FAFC]/50 py-2.5 pl-10 pr-3 text-xs text-[#0A2E5C] placeholder-zinc-400 focus:border-[#FFC107] focus:outline-none focus:ring-2 focus:ring-[#FFC107]/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white transition-all capitalize"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#0A2E5C] dark:text-zinc-200 mb-1.5">
                    Parent's Mobile Number <span className="text-rose-500">*</span> <span className="text-[10px] text-zinc-400 font-normal">(10 digits)</span>
                  </label>
                  <div className="relative flex items-center">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                      <span className="text-xs font-bold font-mono text-zinc-500 dark:text-zinc-400 select-none">
                        +91
                      </span>
                    </div>
                    <input
                      type="tel"
                      required
                      maxLength={10}
                      value={parentPhone}
                      onChange={(e) => setParentPhone(formatPhoneInput(e.target.value))}
                      placeholder="98765 43210"
                      className="w-full rounded-xl border border-[#E5E7EB] bg-[#F8FAFC]/50 py-2.5 pl-13 pr-3 text-xs text-[#0A2E5C] placeholder-zinc-400 focus:border-[#FFC107] focus:outline-none focus:ring-2 focus:ring-[#FFC107]/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white transition-all font-mono font-bold"
                    />
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-[#0A2E5C] dark:text-zinc-200 mb-1.5">
                    Full Residential Address <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <div className="pointer-events-none absolute top-3 left-0 flex pl-3.5 text-zinc-400">
                      <MapPin className="h-4 w-4" />
                    </div>
                    <textarea
                      required
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="e.g. Main Road, Madhupur, Sonbhadra, Uttar Pradesh"
                      rows={2}
                      className="w-full rounded-xl border border-[#E5E7EB] bg-[#F8FAFC]/50 py-2.5 pl-10 pr-3 text-xs text-[#0A2E5C] placeholder-zinc-400 focus:border-[#FFC107] focus:outline-none focus:ring-2 focus:ring-[#FFC107]/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white transition-all resize-none"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Membership Plan & Shift Selection (Same Line / 2-Column Responsive Row with Dropdowns) */}
            <div>
              <h3 className="text-sm font-bold text-[#0A2E5C] dark:text-[#FFC107] mb-3 border-b border-[#E5E7EB] dark:border-zinc-700 pb-2">
                Plan & Shift Selection
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Left Column: Membership Plan Custom Dropdown */}
                <div ref={planDropdownRef}>
                  <label className="block text-xs font-semibold text-[#0A2E5C] dark:text-zinc-200 mb-1.5">
                    Membership Plan <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setIsPlanDropdownOpen(!isPlanDropdownOpen);
                      setIsShiftDropdownOpen(false);
                    }}
                    className={`w-full rounded-xl border bg-[#F8FAFC]/50 py-2.5 pl-10 pr-3 text-xs font-semibold text-[#0A2E5C] flex items-center justify-between dark:bg-zinc-800 dark:text-white transition-all text-left cursor-pointer ${
                      isPlanDropdownOpen
                        ? "border-[#FFC107] ring-2 ring-[#FFC107]/20 bg-white dark:bg-zinc-800"
                        : "border-[#E5E7EB] hover:border-[#FFC107]/60 dark:border-zinc-700"
                    }`}
                  >
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-zinc-400">
                      <Crown className="h-4 w-4 text-[#0B5ED7] dark:text-[#FFC107]" />
                    </div>
                    
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="font-bold text-[#0A2E5C] dark:text-white truncate">
                        {membershipPlan === "General" && "General Desk (Flexible Seating)"}
                        {membershipPlan === "Reserved Seat" && "Reserved Dedicated Desk"}
                        {membershipPlan === "Trial Pass" && "3-Day Free Trial Pass (FREE)"}
                      </span>
                    </div>

                    <ChevronDown className={`h-4 w-4 text-zinc-400 shrink-0 transition-transform duration-200 ${isPlanDropdownOpen ? "rotate-180 text-[#0B5ED7]" : ""}`} />
                  </button>

                  {/* Custom Dropdown Popover */}
                  {isPlanDropdownOpen && (
                    <div className="absolute z-[60] left-0 right-0 top-full mt-1.5 rounded-2xl border border-[#E5E7EB] bg-white dark:bg-[#0A2E5C] dark:border-zinc-700 shadow-2xl p-1.5 space-y-1 max-h-56 overflow-y-auto">
                      {[
                        { id: "General" as MembershipPlan, name: "General Desk", sub: "Flexible seating in 24/7 study zone", tag: "From ₹300", icon: BookOpen },
                        { id: "Reserved Seat" as MembershipPlan, name: "Reserved Seat", sub: "Dedicated desk (Mini / Big / Locker)", tag: "From ₹500", icon: Crown },
                        { id: "Trial Pass" as MembershipPlan, name: "3-Day Free Trial", sub: "100% Free 3-day test drive pass", tag: "FREE", icon: Sparkles },
                      ].map((plan) => {
                        const isSelected = membershipPlan === plan.id;
                        const IconComponent = plan.icon;
                        return (
                          <div
                            key={plan.id}
                            onClick={() => {
                              const newPlan = plan.id;
                              setMembershipPlan(newPlan);
                              if (newPlan === "Reserved Seat") {
                                if (!RESERVED_SHIFTS.some(s => s.id === shift)) {
                                  setShift(RESERVED_SHIFTS[0].id);
                                }
                              } else if (newPlan === "General") {
                                if (!GENERAL_SHIFTS.some(s => s.id === shift)) {
                                  setShift(GENERAL_SHIFTS[0].id);
                                }
                              } else if (newPlan === "Trial Pass") {
                                setShift(TRIAL_SHIFTS[0].id);
                              }
                              setIsPlanDropdownOpen(false);
                            }}
                            className={`p-2.5 rounded-xl cursor-pointer flex items-center justify-between gap-2 transition-all ${
                              isSelected
                                ? "bg-[#0A2E5C] text-white dark:bg-zinc-800"
                                : "hover:bg-[#F8FAFC] dark:hover:bg-zinc-800/60 text-[#0A2E5C] dark:text-zinc-200"
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 ${
                                isSelected ? "bg-[#FFC107]/20 text-[#FFC107]" : "bg-[#F8FAFC] text-zinc-500 dark:bg-zinc-700"
                              }`}>
                                <IconComponent className="h-3.5 w-3.5" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-bold leading-tight truncate">{plan.name}</p>
                                <p className={`text-[10px] truncate ${isSelected ? "text-zinc-300" : "text-zinc-500 dark:text-zinc-400"}`}>
                                  {plan.sub}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md font-mono ${
                                isSelected
                                  ? "bg-[#FFC107] text-[#0A2E5C]"
                                  : plan.tag === "FREE"
                                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                                  : "bg-zinc-100 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300"
                              }`}>
                                {plan.tag}
                              </span>
                              {isSelected && <Check className="h-3.5 w-3.5 text-[#FFC107]" />}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  </div>
                </div>

                {/* Right Column: Preferred Shift Custom Dropdown */}
                <div ref={shiftDropdownRef}>
                  <label className="block text-xs font-semibold text-[#0A2E5C] dark:text-zinc-200 mb-1.5">
                    {membershipPlan === "Reserved Seat"
                      ? "Reserved Seat Plan & Package"
                      : membershipPlan === "Trial Pass"
                      ? "Trial Pass Timing"
                      : "Preferred Shift & Timing"}{" "}
                    <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setIsShiftDropdownOpen(!isShiftDropdownOpen);
                      setIsPlanDropdownOpen(false);
                    }}
                    className={`w-full rounded-xl border bg-[#F8FAFC]/50 py-2.5 pl-10 pr-3 text-xs font-semibold text-[#0A2E5C] flex items-center justify-between dark:bg-zinc-800 dark:text-white transition-all text-left cursor-pointer ${
                      isShiftDropdownOpen
                        ? "border-[#FFC107] ring-2 ring-[#FFC107]/20 bg-white dark:bg-zinc-800"
                        : "border-[#E5E7EB] hover:border-[#FFC107]/60 dark:border-zinc-700"
                    }`}
                  >
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-zinc-400">
                      {membershipPlan === "Reserved Seat" ? (
                        <Crown className="h-4 w-4 text-[#0B5ED7] dark:text-[#FFC107]" />
                      ) : (
                        <Clock className="h-4 w-4 text-[#0B5ED7] dark:text-[#FFC107]" />
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 truncate">
                      <span className="font-bold text-[#0A2E5C] dark:text-white truncate">
                        {currentShiftObj.name}
                      </span>
                      <span className="text-[10px] text-zinc-500 dark:text-zinc-400 hidden xs:inline font-mono">
                        ({currentShiftObj.time})
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md font-mono ${
                        membershipPlan === "Trial Pass"
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                          : "bg-[#0B5ED7]/10 text-[#0B5ED7] dark:text-[#FFC107]"
                      }`}>
                        {currentTotalFee === 0 ? "FREE" : `₹${currentTotalFee}/mo`}
                      </span>
                      <ChevronDown className={`h-4 w-4 text-zinc-400 transition-transform duration-200 ${isShiftDropdownOpen ? "rotate-180 text-[#0B5ED7]" : ""}`} />
                    </div>
                  </button>

                  {/* Custom Dropdown Popover */}
                  {isShiftDropdownOpen && (
                    <div className="absolute z-[60] left-0 right-0 top-full mt-1.5 rounded-2xl border border-[#E5E7EB] bg-white dark:bg-[#0A2E5C] dark:border-zinc-700 shadow-2xl p-1.5 space-y-1 max-h-56 sm:max-h-64 overflow-y-auto">
                      {(membershipPlan === "Reserved Seat"
                        ? RESERVED_SHIFTS
                        : membershipPlan === "Trial Pass"
                        ? TRIAL_SHIFTS
                        : GENERAL_SHIFTS
                      ).map((sh) => {
                        const isSelected = shift === sh.id;
                        const priceLabel = sh.price === 0 ? "FREE" : `₹${sh.price}/mo`;

                        return (
                          <div
                            key={sh.id}
                            onClick={() => {
                              setShift(sh.id);
                              setIsShiftDropdownOpen(false);
                            }}
                            className={`p-2.5 rounded-xl cursor-pointer flex items-center justify-between gap-2 transition-all ${
                              isSelected
                                ? "bg-[#0A2E5C] text-white dark:bg-zinc-800"
                                : "hover:bg-[#F8FAFC] dark:hover:bg-zinc-800/60 text-[#0A2E5C] dark:text-zinc-200"
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <div className={`h-6.5 w-6.5 rounded-lg flex items-center justify-center shrink-0 ${
                                isSelected ? "bg-[#FFC107]/20 text-[#FFC107]" : "bg-[#F8FAFC] text-zinc-500 dark:bg-zinc-700"
                              }`}>
                                {membershipPlan === "Reserved Seat" ? (
                                  <Crown className="h-3.5 w-3.5" />
                                ) : (
                                  <Clock className="h-3.5 w-3.5" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-bold leading-tight truncate">{sh.name}</p>
                                <p className={`text-[10px] font-mono truncate ${isSelected ? "text-zinc-300" : "text-zinc-500 dark:text-zinc-400"}`}>
                                  {sh.time} • {sh.duration}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md font-mono ${
                                isSelected
                                  ? "bg-[#FFC107] text-[#0A2E5C]"
                                  : sh.price === 0
                                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                                  : "bg-zinc-100 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300"
                              }`}>
                                {priceLabel}
                              </span>
                              {isSelected && <Check className="h-3.5 w-3.5 text-[#FFC107]" />}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  </div>
                </div>


              </div>
            </div>

            {/* 4. Email & Password Fields (Only Shown/Active when Email Signup is chosen) */}
            {signupMethod === "email" && (
              <div className="space-y-4 pt-2 border-t border-[#E5E7EB] dark:border-zinc-700">
                <h3 className="text-sm font-bold text-[#0A2E5C] dark:text-[#FFC107] mb-3">Account Credentials</h3>
                <div>
                  <label className="block text-xs font-semibold text-[#0A2E5C] dark:text-zinc-200 mb-1.5">
                    Email Address <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-zinc-400">
                      <Mail className="h-4 w-4" />
                    </div>
                    <input
                      type="email"
                      required={signupMethod === "email"}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="student@example.com"
                      className="w-full rounded-xl border border-[#E5E7EB] bg-[#F8FAFC]/50 py-2.5 pl-10 pr-3 text-xs text-[#0A2E5C] placeholder-zinc-400 focus:border-[#FFC107] focus:outline-none focus:ring-2 focus:ring-[#FFC107]/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#0A2E5C] dark:text-zinc-200 mb-1.5">
                      Password <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-zinc-400">
                        <Lock className="h-4 w-4" />
                      </div>
                      <input
                        type="password"
                        required={signupMethod === "email"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full rounded-xl border border-[#E5E7EB] bg-[#F8FAFC]/50 py-2.5 pl-10 pr-3 text-xs text-[#0A2E5C] placeholder-zinc-400 focus:border-[#FFC107] focus:outline-none focus:ring-2 focus:ring-[#FFC107]/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#0A2E5C] dark:text-zinc-200 mb-1.5">
                      Confirm Password <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-zinc-400">
                        <Lock className="h-4 w-4" />
                      </div>
                      <input
                        type="password"
                        required={signupMethod === "email"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full rounded-xl border border-[#E5E7EB] bg-[#F8FAFC]/50 py-2.5 pl-10 pr-3 text-xs text-[#0A2E5C] placeholder-zinc-400 focus:border-[#FFC107] focus:outline-none focus:ring-2 focus:ring-[#FFC107]/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white transition-all"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="pt-4">
              {signupMethod === "google" ? (
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full inline-flex items-center justify-center gap-3 rounded-2xl bg-[#0A2E5C] py-3.5 text-xs font-black text-[#FFC107] border border-[#FFC107]/40 shadow-lg hover:bg-[#141A24] transition active:scale-95 cursor-pointer"
                >
                  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                  {isLoading ? "Redirecting to Google..." : "Sign Up with Google"}
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-linear-to-r from-[#0B5ED7] to-[#FFC107] py-3.5 text-xs font-black text-[#0A2E5C] shadow-lg hover:opacity-95 transition active:scale-95 cursor-pointer"
                >
                  {isLoading ? (
                    <span>Creating account...</span>
                  ) : (
                    <>
                      <span>{isAdmin ? "Enroll Student Directly" : "Submit Application"}</span>
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              )}
            </div>
          </form>

          {!isAdmin && (
            <div className="mt-8 text-center text-xs text-[#0A2E5C] dark:text-zinc-300">
              Already have an account?{" "}
              <Link href="/login" className="font-bold text-[#0B5ED7] hover:text-[#FFC107] transition-colors">
                Sign in
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


