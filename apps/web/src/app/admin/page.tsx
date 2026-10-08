"use client";

/**
 * [WEB • PAGE] Admin Home (Dashboard)
 *
 * Today's stats, occupancy, recent activity and WhatsApp reminder
 * actions for overdue books/fees.
 */
import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Users, Calendar, Award, IndianRupee,
  ChevronRight, CalendarDays, TrendingUp, AlertTriangle,
  Clock, Plus, Activity, UserPlus, Wallet,
  CheckCircle2, ArrowUpRight, ShieldAlert, Sparkles, Armchair,
  RotateCcw, Lightbulb, Send, MessageSquare, List, Grid3X3,
  CalendarX2, DoorClosed, DoorOpen, BellRing, Check, X,
  Phone, MessageCircle, CreditCard
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { 
  getDashboardStats, getStudents, getFees, getAttendance, DashboardStats, createNotification,
  getLibraryHolidays, declareLibraryHoliday, removeLibraryHoliday, LibraryHoliday 
} from "@/lib/api";
import { getLibraryExams, getAllExamMarks, LibraryExam, syncExamsAndMarksFromSupabase } from "@/lib/examResults";
import { triggerNativeNotification } from "@/lib/pushNotify";
import { BRAND_CONFIG, isMasterAdminEmail } from "@/lib/config";

export default function AdminDashboardOverview() {
  const [stats, setStats] = useState<DashboardStats>({
    totalSeats: 100,
    availableSeats: 100,
    occupiedSeats: 0,
    reservedSeats: 0,
    activeShiftsCount: 4,
    totalBooks: 0,
    booksIssuedCount: 0,
    attendanceTodayCount: 0,
  });

  const [totalStudentsCount, setTotalStudentsCount] = useState<number>(0);
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState<number>(0);
  const [pendingUpiClaimsCount, setPendingUpiClaimsCount] = useState<number>(0);
  const [todayRevenue, setTodayRevenue] = useState<number>(0);
  const [currentDateStr, setCurrentDateStr] = useState("");
  const [currentTimeStr, setCurrentTimeStr] = useState("");

  const [recentExams, setRecentExams] = useState<LibraryExam[]>([]);
  const [dueFees, setDueFees] = useState<any[]>([]);
  const [recentLogs, setRecentLogs] = useState<any[]>([]);
  const [shiftOverview, setShiftOverview] = useState([
    { name: 'Morning Shift', time: '06:00 AM - 12:00 PM', enrolled: 0, present: 0 },
    { name: 'Afternoon Shift', time: '12:00 PM - 06:00 PM', enrolled: 0, present: 0 },
    { name: 'Evening Shift', time: '06:00 PM - 10:00 PM', enrolled: 0, present: 0 },
    { name: 'Full Day Access', time: '06:00 AM - 10:00 PM', enrolled: 0, present: 0 },
  ]);

  const [dueFeesViewMode, setDueFeesViewMode] = useState<"table" | "grid">("table");
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [todayAttendanceList, setTodayAttendanceList] = useState<any[]>([]);

  // Library Holiday & Closure State
  const [holidays, setHolidays] = useState<LibraryHoliday[]>([]);
  const [isHolidayModalOpen, setIsHolidayModalOpen] = useState(false);
  const [isSubmittingHoliday, setIsSubmittingHoliday] = useState(false);
  const [holidayForm, setHolidayForm] = useState({
    date: new Date().toISOString().split("T")[0],
    title: "Official Holiday",
    reason: "The library will remain closed today. Desks and normal shifts will resume tomorrow.",
    notifyStudents: true,
  });

  const todayIsoDate = new Date().toISOString().split("T")[0];
  const todayHoliday = holidays.find((h) => h.date === todayIsoDate);

  // Count active students currently inside the library (checked in and not checked out)
  const currentlyInLibraryCount = useMemo(() => {
    return (todayAttendanceList || []).filter(
      (a: any) => a.checkOut === "In Progress" || !a.checkOut || a.checkOut === "—"
    ).length;
  }, [todayAttendanceList]);

  // 9 Intervals: 6 AM, 8 AM, 10 AM, 12 PM, 2 PM, 4 PM, 6 PM, 8 PM, 10 PM
  const timeLabels = ["6 AM", "8 AM", "10 AM", "12 PM", "2 PM", "4 PM", "6 PM", "8 PM", "10 PM"];

  const hourlyOccupancy = useMemo(() => {
    // If no seats occupied or no attendance records today, return 0% baseline
    const totalSeats = stats.totalSeats || 100;
    const hours = [6, 8, 10, 12, 14, 16, 18, 20, 22];

    return hours.map((hour, index) => {
      const x = (index / (hours.length - 1)) * 100; // 0 to 100
      
      // Count students checked in before or during this hour and not checked out before this hour
      let count = 0;
      if (todayAttendanceList && todayAttendanceList.length > 0) {
        todayAttendanceList.forEach((att: any) => {
          let checkInHour = 6;
          if (att.checkIn) {
            const timeParts = att.checkIn.split(":");
            if (timeParts.length >= 2) {
              let h = parseInt(timeParts[0], 10);
              const isPM = att.checkIn.toLowerCase().includes("pm");
              const isAM = att.checkIn.toLowerCase().includes("am");
              if (isPM && h < 12) h += 12;
              if (isAM && h === 12) h = 0;
              checkInHour = isNaN(h) ? 6 : h;
            }
          }

          let checkOutHour = 22;
          if (att.checkOut) {
            const timeParts = att.checkOut.split(":");
            if (timeParts.length >= 2) {
              let h = parseInt(timeParts[0], 10);
              const isPM = att.checkOut.toLowerCase().includes("pm");
              const isAM = att.checkOut.toLowerCase().includes("am");
              if (isPM && h < 12) h += 12;
              if (isAM && h === 12) h = 0;
              checkOutHour = isNaN(h) ? 22 : h;
            }
          }

          if (checkInHour <= hour && checkOutHour >= hour) {
            count++;
          }
        });
      } else if (stats.occupiedSeats > 0) {
        // Fallback to proportional active seats if only occupiedSeats stat is present
        count = Math.min(stats.occupiedSeats, totalSeats);
      }

      const percent = Math.min(100, Math.round((count / totalSeats) * 100));
      // SVG Y coordinate: 100 is 0% (bottom), 0 is 100% (top)
      const y = Math.max(5, 100 - percent);
      return { hour, label: timeLabels[index], percent, x, y };
    });
  }, [todayAttendanceList, stats.occupiedSeats, stats.totalSeats]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  const sendWhatsAppBookReminder = (student: string, phone: string, bookTitle: string, delay: string) => {
    const cleanPhone = (phone || "").replace(/[^0-9]/g, "");
    if (!cleanPhone) {
      showToast(`No phone number available for ${student}`);
      return;
    }
    const msg = encodeURIComponent(`Dear ${student},\n\nThis is a friendly reminder from *${BRAND_CONFIG.fullName}, ${BRAND_CONFIG.location}*.\n\nYour borrowed book *"${bookTitle}"* is currently overdue by *${delay}*.\nKindly return or renew the book at the library reception desk.\n\nThank you! 🙏`);
    window.open(`https://wa.me/${cleanPhone}?text=${msg}`, '_blank');
    showToast(`WhatsApp reminder opened for ${student}`);
  };

  const sendWhatsAppFeeReminder = (student: string, phone: string, feeType: string, amount: string, delay: string) => {
    const cleanPhone = (phone || "").replace(/[^0-9]/g, "");
    if (!cleanPhone) {
      showToast(`No phone number available for ${student}`);
      return;
    }
    const msg = encodeURIComponent(`Dear ${student},\n\nThis is a fee payment reminder from *${BRAND_CONFIG.fullName}, ${BRAND_CONFIG.location}*.\n\nYour payment of *${amount}* for *${feeType}* is pending (${delay}).\nPlease clear your dues at the library desk or via UPI online.\n\nThank you! 🙏`);
    window.open(`https://wa.me/${cleanPhone}?text=${msg}`, '_blank');
    showToast(`WhatsApp fee reminder opened for ${student}`);
  };

  const sendFeeReminderNotice = async (item: any) => {
    try {
      await createNotification({
        recipientRole: "student",
        recipientId: item.studentId || item.student,
        title: "💳 Library Fee Due Reminder",
        message: `Dear ${item.student}, your fee payment of ${item.amount} for ${item.feeType} is pending. Kindly clear your dues via UPI or at the library desk.`,
        type: "fee_reminder",
        actionUrl: "/student/fees",
      });
      triggerNativeNotification({
        title: "💳 Fee Reminder Dispatched",
        body: `Notice sent to ${item.student} for ${item.amount}.`,
        url: "/admin/fees",
      });
      showToast(`✓ Fee reminder notification sent to ${item.student}`);
    } catch {
      showToast(`Fee reminder sent to ${item.student}`);
    }
  };

  const handleDeclareHoliday = async () => {
    if (!holidayForm.title.trim()) {
      showToast("Please provide a title for the holiday / closure");
      return;
    }
    setIsSubmittingHoliday(true);
    try {
      const res = await declareLibraryHoliday({
        date: holidayForm.date,
        title: holidayForm.title,
        reason: holidayForm.reason,
        notifyStudents: holidayForm.notifyStudents,
      });
      if (res.success) {
        setHolidays((prev) => [res.holiday, ...prev.filter((h) => h.date !== res.holiday.date)]);
        setIsHolidayModalOpen(false);
        showToast(`✓ Library marked CLOSED for ${holidayForm.date}. All students notified.`);
        triggerNativeNotification({
          title: "🚨 Library Marked Closed",
          body: `Notice sent to all students for ${holidayForm.date}: ${holidayForm.title}`,
          url: "/admin",
        });
      }
    } catch (err: any) {
      showToast("Failed to declare holiday: " + (err.message || "Unknown error"));
    } finally {
      setIsSubmittingHoliday(false);
    }
  };

  const handleReopenLibrary = async () => {
    if (!todayHoliday) return;
    setIsSubmittingHoliday(true);
    try {
      await removeLibraryHoliday(todayHoliday.id || todayHoliday.date);
      setHolidays((prev) => prev.filter((h) => h.date !== todayHoliday.date && h.id !== todayHoliday.id));
      showToast("✓ Library is now marked OPEN today!");
      triggerNativeNotification({
        title: "✓ Library Reopened",
        body: "Library operations resumed for today.",
        url: "/admin",
      });
    } catch (err: any) {
      showToast("Failed to reopen library: " + (err.message || "Unknown error"));
    } finally {
      setIsSubmittingHoliday(false);
    }
  };

  useEffect(() => {
    const now = new Date();
    setCurrentDateStr(now.toLocaleDateString("en-IN", { weekday: "short", month: "short", day: "numeric", year: "numeric" }));
    setCurrentTimeStr(now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }));

    async function loadData() {
      try {
        const supabase = createClient();
        const [liveStats, feesList, attList, profilesRes, holidaysRes] = await Promise.all([
          getDashboardStats().catch(() => ({ totalSeats: 100, availableSeats: 100, occupiedSeats: 0, activeShiftsCount: 4, totalBooks: 0, booksIssuedCount: 0, attendanceTodayCount: 0 })),
          getFees().catch(() => []),
          getAttendance().catch(() => []),
          Promise.resolve(supabase.from("profiles").select("*")).then(res => res.data || []).catch(() => []),
          getLibraryHolidays().catch(() => []),
        ]);
        setStats(liveStats);
        // Sync exams from Supabase first (single source of truth across all devices)
        try {
          const synced = await syncExamsAndMarksFromSupabase();
          setRecentExams(synced.exams);
        } catch {
          setRecentExams(getLibraryExams());
        }
        setHolidays(holidaysRes || []);

        // Sole Primary Database: Supabase profiles
        let allProfiles: any[] = profilesRes || [];
        const validProfiles = allProfiles.filter((p: any) => 
          !isMasterAdminEmail(p.email) && 
          p.role !== "admin" &&
          (p.phone && String(p.phone).trim().length > 0)
        );

        // Strict rule: Total Students only includes approved/active members!
        const activeProfiles = validProfiles.filter((p: any) => p.status === "active");
        const pendingProfiles = validProfiles.filter((p: any) => p.status === "pending");

        setTotalStudentsCount(activeProfiles.length);
        setPendingApprovalsCount(pendingProfiles.length);

        // Build active student records for shifts overview
        const allStudentsList = activeProfiles.map((p: any) => ({
          id: p.id,
          name: p.full_name || "Student Member",
          shift: p.shift || p.shift_id || "Morning Shift",
        }));

        // Find which students checked in today
        const todayIsoDate = new Date().toISOString().split("T")[0];
        const todayAtt = (attList || []).filter((a: any) => !a.date || a.date === todayIsoDate);
        setTodayAttendanceList(todayAtt);
        const presentIds = new Set(todayAtt.map((a: any) => a.studentId));
        const presentNames = new Set(todayAtt.map((a: any) => (a.studentName || "").toLowerCase()));

        const isStudentPresent = (std: { id: string; name: string }) => {
          return presentIds.has(std.id) || (std.name && presentNames.has(std.name.toLowerCase()));
        };

        const morningStds = allStudentsList.filter((s) => {
          const sh = (s.shift || "").toLowerCase();
          return sh.includes("morning") || sh.includes("6-10") || sh.includes("6-12");
        });
        const morningPres = morningStds.filter(isStudentPresent).length;

        const afternoonStds = allStudentsList.filter((s) => {
          const sh = (s.shift || "").toLowerCase();
          return sh.includes("afternoon") || sh.includes("noon") || sh.includes("10-2") || sh.includes("12-6");
        });
        const afternoonPres = afternoonStds.filter(isStudentPresent).length;

        const eveningStds = allStudentsList.filter((s) => {
          const sh = (s.shift || "").toLowerCase();
          return sh.includes("evening") || sh.includes("2-6") || sh.includes("6-10 pm");
        });
        const eveningPres = eveningStds.filter(isStudentPresent).length;

        const fullDayStds = allStudentsList.filter((s) => {
          const sh = (s.shift || "").toLowerCase();
          return sh.includes("full");
        });
        const fullDayPres = fullDayStds.filter(isStudentPresent).length;

        setShiftOverview([
          { name: 'Morning Shift', time: '06:00 AM - 12:00 PM', enrolled: morningStds.length, present: morningPres },
          { name: 'Afternoon Shift', time: '12:00 PM - 06:00 PM', enrolled: afternoonStds.length, present: afternoonPres },
          { name: 'Evening Shift', time: '06:00 PM - 10:00 PM', enrolled: eveningStds.length, present: eveningPres },
          { name: 'Full Day Access', time: '06:00 AM - 10:00 PM', enrolled: fullDayStds.length, present: fullDayPres },
        ]);

        // -------------------------------------------------------------
        // Calculate Synchronized Seat Occupancy (Exact Sync with /admin/seats)
        // 100 Desks: Available = 100 - (Occupied + Reserved)
        // -------------------------------------------------------------
        const TOTAL_SEATS = 100;
        const assignedSeatsMap = new Map<string, { studentId: string; studentName: string }>();

        if (allProfiles && allProfiles.length > 0) {
          const nonAdmin = allProfiles.filter((p: any) => !isMasterAdminEmail(p.email) && p.role !== "admin");
          nonAdmin.forEach((p: any) => {
            if (p.seat_number) {
              const cleanSeat = String(p.seat_number).replace(/^S-/, "").toUpperCase().trim();
              if (cleanSeat) {
                assignedSeatsMap.set(cleanSeat, {
                  studentId: p.id,
                  studentName: p.full_name || "",
                });
              }
            }
          });
        }


        let occupiedSeatsCount = 0;
        let reservedSeatsCount = 0;

        assignedSeatsMap.forEach((studentInfo, seatId) => {
          const isCheckedInToday = todayAtt.some((a: any) => {
            const matchId = a.studentId === studentInfo.studentId;
            const matchName = studentInfo.studentName && (a.studentName || "").toLowerCase() === studentInfo.studentName.toLowerCase();
            const cleanAttSeat = a.seatNumber ? String(a.seatNumber).replace(/^S-/, "").toUpperCase().trim() : "";
            const matchSeat = cleanAttSeat === seatId;
            const isActive = a.status === "present" || a.status === "in_progress" || a.status === "completed" || !a.checkOut || a.checkOut === "In Progress" || a.checkOut === "—";
            return (matchId || matchName || matchSeat) && isActive;
          });

          if (isCheckedInToday) {
            occupiedSeatsCount++;
          } else {
            reservedSeatsCount++;
          }
        });

        const availableSeatsCount = Math.max(0, TOTAL_SEATS - (occupiedSeatsCount + reservedSeatsCount));

        setStats({
          ...liveStats,
          totalSeats: TOTAL_SEATS,
          availableSeats: availableSeatsCount,
          occupiedSeats: occupiedSeatsCount,
          reservedSeats: reservedSeatsCount,
        });



        const currDate = new Date();

        // Filter real due fees from both Supabase profiles and feesList
        const duesList: any[] = [];
        const seenStudentIds = new Set<string>();

        // 1. Dues from student profiles (Primary source of truth where student has fee_status === 'Due' or due_amount > 0)
        validProfiles.forEach((p: any) => {
          const isDue = p.fee_status === "Due" || (p.due_amount && Number(p.due_amount) > 0);
          if (isDue) {
            seenStudentIds.add(p.id);
            if (p.full_name) seenStudentIds.add(p.full_name.toLowerCase());
            const dueAmt = p.due_amount && Number(p.due_amount) > 0 ? Number(p.due_amount) : 800;
            const initials = (p.full_name || "ST").split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();
            const studentCode = p.student_code || p.member_id || `SDL-${(p.id || "").slice(-4).toUpperCase()}`;

            const joinDate = p.created_at || p.joined_at ? new Date(p.created_at || p.joined_at) : new Date(currDate.getTime() - 25 * 86400000);
            const daysOverdue = Math.max(0, Math.floor((currDate.getTime() - joinDate.getTime()) / (1000 * 60 * 60 * 24)));
            const isDefaulter = daysOverdue >= 60;
            const monthsOverdue = Math.floor(daysOverdue / 30);
            let statusText: "Pending" | "Overdue" | "Defaulter (2+ Mo)" = "Pending";
            if (isDefaulter) {
              statusText = "Defaulter (2+ Mo)";
            } else if (daysOverdue > 15) {
              statusText = "Overdue";
            }
            const formattedDueDate = joinDate.toLocaleDateString("en-IN", { 
              day: "2-digit", 
              month: "short", 
              year: "numeric" 
            });

            duesList.push({
              id: `due-${p.id}`,
              studentId: p.id,
              studentCode,
              student: p.full_name || "Student",
              initials: initials || "ST",
              phone: p.phone || "",
              avatarBg: "bg-amber-600",
              feeType: p.shift ? `${p.shift} Desk Fee` : "Monthly Seat Fee",
              amount: `₹${dueAmt.toLocaleString("en-IN")}`,
              rawAmount: dueAmt,
              dueDate: formattedDueDate,
              delay: statusText,
              isDefaulter,
              monthsOverdue: Math.max(1, monthsOverdue),
            });
          }
        });

        // 2. Dues from feesList (unpaid transactions not already added)
        (feesList || [])
          .filter((fee: any) => !fee.paid)
          .forEach((fee: any, idx: number) => {
            const matchName = fee.studentName && seenStudentIds.has(fee.studentName.toLowerCase());
            if (!seenStudentIds.has(fee.studentId) && !matchName) {
              const studentProfile = allProfiles.find((p: any) => p.id === fee.studentId || p.full_name?.toLowerCase() === fee.studentName?.toLowerCase());
              const phone = studentProfile?.phone || "";
              const initials = (fee.studentName || "ST").split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();
              const avatarColors = ["bg-amber-600", "bg-indigo-600", "bg-teal-600", "bg-pink-600", "bg-cyan-600"];
              const studentCode = studentProfile?.student_code || studentProfile?.member_id || fee.studentCode || `SDL-${(fee.studentId || `${idx}`).slice(-4).toUpperCase()}`;

              const feeDate = fee.dueDate ? new Date(fee.dueDate) : fee.createdAt ? new Date(fee.createdAt) : new Date(currDate.getTime() - 20 * 86400000);
              const daysOverdue = Math.max(0, Math.floor((currDate.getTime() - feeDate.getTime()) / (1000 * 60 * 60 * 24)));
              const isDefaulter = daysOverdue >= 60;
              const monthsOverdue = Math.floor(daysOverdue / 30);
              let statusText: "Pending" | "Overdue" | "Defaulter (2+ Mo)" = "Pending";
              if (isDefaulter) {
                statusText = "Defaulter (2+ Mo)";
              } else if (daysOverdue > 15) {
                statusText = "Overdue";
              }
              const formattedDueDate = feeDate.toLocaleDateString("en-IN", { 
                day: "2-digit", 
                month: "short", 
                year: "numeric" 
              });

              duesList.push({
                id: fee.id || `fee-${idx + 1}`,
                studentId: fee.studentId,
                studentCode,
                student: fee.studentName || "Student",
                initials: initials || "ST",
                phone: phone,
                avatarBg: avatarColors[idx % avatarColors.length],
                feeType: fee.type || "Monthly Seat Fee",
                amount: `₹${Number(fee.amount || 0).toLocaleString("en-IN")}`,
                rawAmount: Number(fee.amount || 0),
                dueDate: formattedDueDate,
                delay: statusText,
                isDefaulter,
                monthsOverdue: Math.max(1, monthsOverdue),
              });
            }
          });

        setDueFees(duesList);

        // Real revenue today
        const todayDateStr = currDate.toISOString().split("T")[0];
        const todayPaidFees = (feesList || []).filter((f: any) => f.paid && (f.paidAt?.startsWith(todayDateStr) || f.createdAt?.startsWith(todayDateStr)));
        const revenueTotal = todayPaidFees.reduce((sum: number, f: any) => sum + (f.amount || 0), 0);
        setTodayRevenue(revenueTotal);

        // Real pending UPI payment claims count
        const pendingClaims = (feesList || []).filter(
          (f: any) =>
            !f.paid &&
            (f.type === "UPI Claim" ||
              (f.receiptNo && f.receiptNo.startsWith("UTR-")) ||
              (f.description && /utr|upi\s*claim/i.test(f.description)))
        );
        setPendingUpiClaimsCount(pendingClaims.length);

        // Real system logs
        const logs: any[] = [];
        (attList || []).slice(0, 3).forEach((att: any, i: number) => {
          logs.push({
            id: `att-${att.id || i}`,
            title: "Attendance check-in",
            sub: `${att.studentName} (${att.seatNumber ? `Desk #${att.seatNumber}` : 'Library'})`,
            time: att.checkIn || "Today",
            icon: CheckCircle2,
            iconColor: "text-emerald-500",
            bg: "bg-emerald-50 dark:bg-emerald-950/50",
          });
        });

        const allMarks = getAllExamMarks();
        allMarks.slice(0, 3).forEach((mk: any, i: number) => {
          logs.push({
            id: `exam-log-${mk.id || i}`,
            title: "Exam score recorded",
            sub: `${mk.studentName} — ${mk.marksObtained}/${mk.totalMarks} (${mk.status})`,
            time: mk.submittedAt ? new Date(mk.submittedAt).toLocaleDateString("en-IN") : "Today",
            icon: Award,
            iconColor: "text-amber-500",
            bg: "bg-amber-50 dark:bg-amber-950/50",
          });
        });

        (todayPaidFees || []).slice(0, 3).forEach((fee: any, i: number) => {
          logs.push({
            id: `fee-${fee.id || i}`,
            title: "Fee collected",
            sub: `₹${fee.amount} from ${fee.studentName}`,
            time: fee.paidAt ? new Date(fee.paidAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "Today",
            icon: IndianRupee,
            iconColor: "text-amber-500",
            bg: "bg-amber-50 dark:bg-amber-950/50",
          });
        });
        setRecentLogs(logs);

      } catch (err) {
        console.error("Admin dashboard loadData error:", err);
      }
    }

    loadData();

    // Supabase Realtime synchronization for admin dashboard counters
    // DEBOUNCED: Prevents 5000+ API calls when profiles table changes rapidly (e.g. student signup)
    const supabase = createClient();
    let realtimeDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel("admin_dashboard_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles" },
        () => {
          // Debounce: Wait 10s of quiet before reloading to batch rapid changes
          if (realtimeDebounceTimer) clearTimeout(realtimeDebounceTimer);
          realtimeDebounceTimer = setTimeout(() => {
            if (document.visibilityState === "visible") {
              loadData();
            }
          }, 10000);
        }
      )
      .subscribe();

    const handleHolidayUpdate = () => {
      getLibraryHolidays().then((list) => setHolidays(list || []));
    };
    window.addEventListener("library_holiday_updated", handleHolidayUpdate);

    return () => {
      if (realtimeDebounceTimer) clearTimeout(realtimeDebounceTimer);
      supabase.removeChannel(channel);
      window.removeEventListener("library_holiday_updated", handleHolidayUpdate);
    };
  }, []);

  return (
    <div className="space-y-4 pb-8">
      {/* Sleek Compact Executive Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C]">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0A2E5C] text-[#FFC107] dark:bg-white/10 dark:text-white shadow-xs">
            <Award className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black text-[#0A2E5C] dark:text-white tracking-tight">
                Library Dashboard
              </h1>
              <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#0B5ED7]/10 text-[#0B5ED7] dark:bg-[#0B5ED7]/20 dark:text-[#FFC107]">
                Admin Portal
              </span>
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Live seat occupancy, mock tests &amp; results, shifts &amp; daily revenue
            </p>
          </div>
        </div>

        {/* Status & Live Timestamp Pills */}
        <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
          <div className="flex items-center gap-2 rounded-xl bg-[#F8F9FA] px-3 py-1.5 border border-[#E5E7EB]/60 dark:bg-zinc-800/60 dark:border-zinc-700/60">
            <CalendarDays className="h-3.5 w-3.5 text-[#0B5ED7] dark:text-[#FFC107]" />
            <span className="text-[11px] font-bold text-[#0A2E5C] dark:text-white">{currentDateStr || "Today"}</span>
            <span className="text-[10px] text-zinc-400">| {currentTimeStr || "Live"}</span>
          </div>

          {/* Interactive Active / Closed Toggle Switch */}
          {todayHoliday ? (
            <button
              onClick={handleReopenLibrary}
              disabled={isSubmittingHoliday}
              className="inline-flex items-center gap-2 rounded-xl border border-rose-300 bg-rose-50 hover:bg-rose-100 px-3 py-1.5 dark:border-rose-800 dark:bg-rose-950/60 transition active:scale-95 cursor-pointer shadow-xs disabled:opacity-50"
              title="Click toggle to Reopen Library today"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-600"></span>
              </span>
              <span className="text-[10px] font-black uppercase text-rose-700 dark:text-rose-300">
                Closed ({todayHoliday.title || "Holiday"})
              </span>
              {/* Toggle switch track (OFF/Closed) */}
              <span className="w-7 h-4 flex items-center bg-rose-300 dark:bg-rose-800 rounded-full p-0.5 transition-colors">
                <span className="bg-white w-3 h-3 rounded-full shadow-xs transform trangray-x-0 transition-transform" />
              </span>
            </button>
          ) : (
            <button
              onClick={() => {
                setHolidayForm({
                  date: new Date().toISOString().split("T")[0],
                  title: "Official Holiday",
                  reason: "The library will remain closed today. Attendance is exempt and normal desks resume tomorrow.",
                  notifyStudents: true,
                });
                setIsHolidayModalOpen(true);
              }}
              className="inline-flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 dark:bg-emerald-500/10 dark:border-emerald-500/30 transition active:scale-95 cursor-pointer shadow-xs"
              title="Click toggle to Close Library / Declare Holiday"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400">active</span>
              {/* Toggle switch track (ON/Active) */}
              <span className="w-7 h-4 flex items-center bg-emerald-500 rounded-full p-0.5 transition-colors">
                <span className="bg-white w-3 h-3 rounded-full shadow-xs transform trangray-x-3 transition-transform" />
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Declare Holiday Modal */}
      {isHolidayModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="relative w-full max-w-lg rounded-3xl bg-white dark:bg-[#0A2E5C] border border-[#E5E7EB] dark:border-zinc-700 p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400">
                  <CalendarX2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-[#0A2E5C] dark:text-white">
                    Close Library / Declare Holiday
                  </h3>
                  <p className="text-xs text-zinc-500">
                    Students will receive an instant notification and red alert banner.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsHolidayModalOpen(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Quick Presets */}
            <div>
              <label className="text-[11px] font-black uppercase tracking-wider text-zinc-400 block mb-2">
                Quick Reason Presets
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { title: "Weekly Off / Sunday", reason: "The library is closed for weekly scheduled off." },
                  { title: "Festival Holiday", reason: "The library is closed on the auspicious occasion of festival." },
                  { title: "Library Maintenance", reason: "Closed for deep cleaning, sanitation, and electrical maintenance." },
                  { title: "Severe Weather / Emergency", reason: "Closed due to heavy weather conditions. Please stay safe at home." },
                ].map((preset) => (
                  <button
                    key={preset.title}
                    type="button"
                    onClick={() => setHolidayForm((f) => ({ ...f, title: preset.title, reason: preset.reason }))}
                    className={`text-left p-2.5 rounded-xl border text-xs font-bold transition cursor-pointer ${
                      holidayForm.title === preset.title
                        ? "border-rose-500 bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                        : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300"
                    }`}
                  >
                    <p className="font-black truncate">{preset.title}</p>
                    <p className="text-[10px] font-normal text-zinc-500 dark:text-zinc-400 truncate mt-0.5">{preset.reason}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Form Fields */}
            <div className="space-y-3 pt-1">
              <div>
                <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300 block mb-1">
                  Holiday Date
                </label>
                <input
                  type="date"
                  value={holidayForm.date}
                  onChange={(e) => setHolidayForm((f) => ({ ...f, date: e.target.value }))}
                  className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-xs font-bold text-[#0A2E5C] dark:text-white"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300 block mb-1">
                  Holiday Title / Occasion
                </label>
                <input
                  type="text"
                  value={holidayForm.title}
                  onChange={(e) => setHolidayForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Festival Holiday / Sunday Off"
                  className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-xs font-bold text-[#0A2E5C] dark:text-white"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300 block mb-1">
                  Notice Details / Student Message
                </label>
                <textarea
                  rows={3}
                  value={holidayForm.reason}
                  onChange={(e) => setHolidayForm((f) => ({ ...f, reason: e.target.value }))}
                  placeholder="Notice shown on student dashboard and push notifications..."
                  className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-xs text-[#0A2E5C] dark:text-white"
                />
              </div>

              <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60">
                <input
                  type="checkbox"
                  id="notifyStudentsCheck"
                  checked={holidayForm.notifyStudents}
                  onChange={(e) => setHolidayForm((f) => ({ ...f, notifyStudents: e.target.checked }))}
                  className="h-4 w-4 rounded text-rose-600 focus:ring-rose-500 cursor-pointer"
                />
                <label htmlFor="notifyStudentsCheck" className="text-xs font-bold text-amber-900 dark:text-amber-200 cursor-pointer">
                  Broadcast instant notification &amp; show Red Alert banner to all students
                </label>
              </div>

              <p className="text-[11px] text-zinc-500">
                ℹ️ <strong>Attendance Protection:</strong> Declaring a holiday automatically excludes this date from student absent day calculations.
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-zinc-100 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setIsHolidayModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-bold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeclareHoliday}
                disabled={isSubmittingHoliday}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-md shadow-rose-600/20 cursor-pointer disabled:opacity-50"
              >
                <Check className="h-4 w-4" />
                <span>{isSubmittingHoliday ? "Publishing..." : "Confirm & Close Library"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6 Key Performance Metrics Cards (Linked to Admin Subpages) */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">

        {/* 1. Total Students */}
        <Link
          href="/admin/students"
          className="group rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-xs transition-all hover:scale-[1.02] hover:border-[#0B5ED7] hover:shadow-md dark:border-zinc-800 dark:bg-[#0A2E5C] flex flex-col justify-between cursor-pointer min-h-[160px]"
        >
          <div className="flex items-start justify-between">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
              <Users className="h-4 w-4" />
            </div>
            <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 group-hover:text-[#0B5ED7] transition-colors">
              <ChevronRight className="h-3.5 w-3.5 inline group-hover:trangray-x-0.5 transition-transform" />
            </span>
          </div>
          <div className="mt-3">
            <p className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">Total Students</p>
            <p className="text-2xl font-black text-[#0A2E5C] dark:text-white mt-0.5">{totalStudentsCount}</p>
            <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5 truncate">Registered members</p>
          </div>
          <div className="mt-3 pt-2 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between">
            <span className="text-[9px] font-bold text-indigo-600 dark:text-indigo-400 group-hover:underline">Manage Profiles</span>
            <ChevronRight className="h-3 w-3 text-indigo-400 group-hover:trangray-x-0.5 transition-transform" />
          </div>
        </Link>

        {/* 2. Pending Approvals */}
        <Link
          href="/admin/students?modal=pending"
          className="group rounded-2xl border border-amber-200/80 bg-amber-50/20 p-4 shadow-xs transition-all hover:scale-[1.02] hover:border-amber-400 hover:shadow-md dark:border-amber-900/40 dark:bg-amber-950/10 flex flex-col justify-between cursor-pointer min-h-[160px]"
        >
          <div className="flex items-start justify-between">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300 group-hover:bg-amber-600 group-hover:text-white transition-colors">
              <UserPlus className="h-4 w-4" />
            </div>
            <span className="text-[9px] font-bold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/50 px-1.5 py-0.5 rounded-md">
              Action
            </span>
          </div>
          <div className="mt-3">
            <p className="text-[11px] font-semibold text-amber-900 dark:text-amber-300/90">Pending Approvals</p>
            <p className="text-2xl font-black text-amber-900 dark:text-amber-200 mt-0.5">{pendingApprovalsCount}</p>
            <p className="text-[10px] text-amber-700/80 dark:text-amber-400/80 mt-0.5 truncate">Awaiting review</p>
          </div>
          <div className="mt-3 pt-2 border-t border-amber-200/40 dark:border-amber-900/40 flex items-center justify-between">
            <span className="text-[9px] font-bold text-amber-700 dark:text-amber-400 group-hover:underline">Verify Students</span>
            <ChevronRight className="h-3 w-3 text-amber-600 group-hover:trangray-x-0.5 transition-transform" />
          </div>
        </Link>

        {/* 3. Total Revenue */}
        <Link
          href="/admin/fees"
          className="group rounded-2xl border border-emerald-200/80 bg-emerald-50/20 p-4 shadow-xs transition-all hover:scale-[1.02] hover:border-emerald-400 hover:shadow-md dark:border-emerald-900/40 dark:bg-emerald-950/10 flex flex-col justify-between cursor-pointer min-h-[160px]"
        >
          <div className="flex items-start justify-between">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
              <Wallet className="h-4 w-4" />
            </div>
            <span className="text-[9px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/50 px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
              <ArrowUpRight className="h-2.5 w-2.5" /> Today
            </span>
          </div>
          <div className="mt-3">
            <p className="text-[11px] font-semibold text-emerald-900 dark:text-emerald-300/90">Total Revenue</p>
            <p className="text-2xl font-black text-emerald-900 dark:text-emerald-200 mt-0.5">₹{todayRevenue.toLocaleString("en-IN")}</p>
            <p className="text-[10px] font-medium text-amber-700 dark:text-amber-400 mt-0.5 truncate flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
              {pendingUpiClaimsCount} Pending UPI Claims
            </p>
          </div>
          <div className="mt-3 pt-2 border-t border-emerald-200/40 dark:border-emerald-900/40 flex items-center justify-between">
            <span className="text-[9px] font-bold text-emerald-700 dark:text-emerald-400 group-hover:underline">Verify Claims</span>
            <ChevronRight className="h-3 w-3 text-emerald-600 group-hover:trangray-x-0.5 transition-transform" />
          </div>
        </Link>

        {/* 4. Today's Attendance / Active in Library */}
        <Link
          href="/admin/attendance"
          className="group rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-xs transition-all hover:scale-[1.02] hover:border-emerald-500 hover:shadow-md dark:border-zinc-800 dark:bg-[#0A2E5C] flex flex-col justify-between cursor-pointer min-h-[160px]"
        >
          <div className="flex items-start justify-between">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
              <Calendar className="h-4 w-4" />
            </div>
            <span className="text-[9px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded-md flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Live Check-in
            </span>
          </div>
          <div className="mt-3">
            <p className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">Active In Library Now</p>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <p className="text-2xl font-black text-emerald-700 dark:text-emerald-400">{currentlyInLibraryCount}</p>
              <span className="text-[10px] font-bold text-zinc-400">/ {stats.attendanceTodayCount} checked-in</span>
            </div>
            <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5 truncate">
              {currentlyInLibraryCount} checked in right now
            </p>
          </div>
          <div className="mt-3 pt-2 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between">
            <span className="text-[9px] font-bold text-emerald-700 dark:text-emerald-400 group-hover:underline">Daily Register</span>
            <ChevronRight className="h-3 w-3 text-emerald-600 group-hover:trangray-x-0.5 transition-transform" />
          </div>
        </Link>

        {/* 5. Available Desks */}
        <Link
          href="/admin/seats"
          className="group rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-xs transition-all hover:scale-[1.02] hover:border-[#0B5ED7] hover:shadow-md dark:border-zinc-800 dark:bg-[#0A2E5C] flex flex-col justify-between cursor-pointer min-h-[160px]"
        >
          <div className="flex items-start justify-between">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-950/50 dark:text-purple-400 group-hover:bg-purple-600 group-hover:text-white transition-colors">
              <Armchair className="h-4 w-4" />
            </div>
            <span className="text-[9px] font-bold text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-900/50 px-1.5 py-0.5 rounded-md">
              Seats
            </span>
          </div>
          <div className="mt-3">
            <p className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">Available Desks</p>
            <p className="text-2xl font-black text-[#0A2E5C] dark:text-white mt-0.5">
              {stats.availableSeats} <span className="text-sm font-semibold text-zinc-400">/ {stats.totalSeats}</span>
            </p>
            <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5 truncate flex items-center gap-1.5 font-medium">
              <span className="text-blue-600 dark:text-blue-400 font-bold">{stats.occupiedSeats} checked in</span>
              <span>•</span>
              <span className="text-rose-500 dark:text-rose-400 font-bold">{stats.reservedSeats || 0} reserved</span>
            </p>
          </div>
          <div className="mt-3 pt-2 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between">
            <span className="text-[9px] font-bold text-purple-600 dark:text-purple-400 group-hover:underline">Seat Matrix</span>
            <ChevronRight className="h-3 w-3 text-purple-400 group-hover:trangray-x-0.5 transition-transform" />
          </div>
        </Link>

        {/* 6. Exam Results & Mock Tests */}
        <Link
          href="/admin/results"
          className="group rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-xs transition-all hover:scale-[1.02] hover:border-[#0B5ED7] hover:shadow-md dark:border-zinc-800 dark:bg-[#0A2E5C] flex flex-col justify-between cursor-pointer min-h-[160px]"
        >
          <div className="flex items-start justify-between">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400 group-hover:bg-amber-600 group-hover:text-white transition-colors">
              <Award className="h-4 w-4" />
            </div>
            <span className="text-[9px] font-bold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/50 px-1.5 py-0.5 rounded-md">
              Tests Desk
            </span>
          </div>
          <div className="mt-3">
            {(() => {
              const todayStr = new Date().toISOString().split("T")[0];
              const conductedExamsCount = recentExams.filter(e => (e.examDate || "") <= todayStr).length;
              const upcomingCount = recentExams.filter(e => (e.examDate || "") > todayStr).length;
              return (
                <>
                  <p className="text-2xl font-black text-[#0A2E5C] dark:text-white mt-0.5">
                    {conductedExamsCount} <span className="text-sm font-semibold text-zinc-400">Conducted</span>
                  </p>
                  <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5 truncate">
                    {upcomingCount > 0 ? `${upcomingCount} upcoming scheduled test${upcomingCount > 1 ? "s" : ""}` : `${recentExams.filter(e => e.status === "Published").length} published results`}
                  </p>
                </>
              );
            })()}
          </div>
          <div className="mt-3 pt-2 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between">
            <span className="text-[9px] font-bold text-amber-600 dark:text-amber-400 group-hover:underline">Results & Answer Keys</span>
            <ChevronRight className="h-3 w-3 text-amber-400 group-hover:trangray-x-0.5 transition-transform" />
          </div>
        </Link>

      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        <div className="lg:col-span-2 rounded-3xl border border-[#E5E7EB] bg-white p-4 sm:p-6 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-blue-50 p-1.5 dark:bg-blue-500/10">
                <Activity className="h-4 w-4 text-blue-500" />
              </div>
              <h3 className="text-sm font-bold text-[#0A2E5C] dark:text-white leading-tight">Hourly Seat Occupancy<br className="hidden sm:block" /> Trend</h3>
            </div>
            <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-500">
              Live Map<br className="hidden sm:block" /> Metrics <span className="relative flex h-2 w-2 ml-1"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span></span>
            </div>
          </div>

          {/* Simple SVG Line Chart */}
          <div className="relative h-40 sm:h-48 w-full border-b border-zinc-100 dark:border-zinc-800/50">
            <div className="absolute left-0 top-0 h-full flex flex-col justify-between text-[8px] font-bold text-zinc-400 pb-6">
              <span>100%</span><span>75%</span><span>50%</span><span>25%</span><span>0%</span>
            </div>
            <div className="absolute left-6 sm:left-8 right-0 h-full pb-6">
              <svg className="h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
                <defs>
                  <linearGradient id="blue-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.0" />
                  </linearGradient>
                </defs>
                {/* Area fill */}
                <path
                  d={`M0,100 L${hourlyOccupancy.map((pt) => `${pt.x},${pt.y}`).join(" L")} L100,100 Z`}
                  fill="url(#blue-grad)"
                />
                {/* Occupancy stroke */}
                <path
                  d={`M${hourlyOccupancy.map((pt) => `${pt.x},${pt.y}`).join(" L")}`}
                  fill="none"
                  stroke="#3B82F6"
                  strokeWidth="2.5"
                  vectorEffect="non-scaling-stroke"
                />
                {/* Point nodes */}
                {hourlyOccupancy.map((pt, idx) => (
                  <circle
                    key={idx}
                    cx={pt.x}
                    cy={pt.y}
                    r="2.5"
                    fill="#3B82F6"
                    className="transition-all duration-300 hover:r-4"
                  />
                ))}
              </svg>
            </div>
            <div className="absolute left-6 sm:left-8 right-0 bottom-0 flex justify-between text-[7px] sm:text-[8px] font-bold text-zinc-400 overflow-x-hidden">
              {timeLabels.map((lbl, idx) => (
                <span key={idx} className="truncate">{lbl}</span>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-[#E5E7EB] bg-white p-4 sm:p-6 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C]">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-[#0A2E5C] dark:text-[#FFC107]" />
              <h3 className="text-sm font-bold text-[#0A2E5C] dark:text-white">Active Shifts Overview</h3>
            </div>
            <Link href="/admin/attendance" className="text-[9px] font-bold text-[#0B5ED7] dark:text-[#FFC107] hover:underline flex items-center gap-0.5">
              4 Shifts →
            </Link>
          </div>

          <div className="space-y-3 pt-2">
            {shiftOverview.map((shift, i) => (
              <div key={i} className="flex items-center justify-between p-2.5 rounded-xl bg-[#F8FAFC]/50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700">
                <div>
                  <p className="text-xs font-bold text-[#0A2E5C] dark:text-white">{shift.name}</p>
                  <p className="text-[9px] text-zinc-400">{shift.time}</p>
                </div>
                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-md transition ${
                  shift.enrolled > 0
                    ? "text-emerald-700 bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"
                    : "text-zinc-500 bg-zinc-100 dark:bg-zinc-800/80 dark:text-zinc-400"
                }`}>
                  {shift.enrolled > 0 ? `${shift.present}/${shift.enrolled} Present` : "0 Students"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Library Mock Tests & Exam Results Widget */}
      <div className="rounded-3xl border border-[#E5E7EB] bg-white p-4 sm:p-5 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
              <Award className="h-3.5 w-3.5" />
            </div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm sm:text-base font-bold text-[#0A2E5C] dark:text-white">
                Library Mock Tests & Exam Results Desk
              </h3>
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[9px] sm:text-[10px] font-bold text-amber-600 dark:bg-amber-950/50 dark:text-amber-400">
                {recentExams.length} Exams Active
              </span>
            </div>
          </div>

          <Link
            href="/admin/results"
            className="text-xs font-bold text-[#0B5ED7] dark:text-[#FFC107] hover:underline flex items-center gap-1 group"
          >
            Manage Results Desk <ChevronRight className="h-3.5 w-3.5 group-hover:trangray-x-0.5 transition-transform" />
          </Link>
        </div>

        {/* Content with Limited Area & Internal Scrolling */}
        <div className="mt-3">
          {recentExams.length === 0 ? (
            <div className="py-8 text-center text-xs text-zinc-400">
              No exams scheduled yet. Click &quot;Manage Results Desk&quot; to conduct your first test.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {recentExams.slice(0, 3).map((exam) => (
                <div 
                  key={exam.id} 
                  className="p-4 rounded-2xl bg-[#F8FAFC]/80 dark:bg-zinc-800/60 border border-zinc-200/60 dark:border-zinc-700/60 flex flex-col justify-between space-y-3"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-white dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300">
                        {exam.category}
                      </span>
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                        exam.status === "Published" 
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" 
                          : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                      }`}>
                        {exam.status === "Published" ? "Upcoming" : exam.status}
                      </span>
                    </div>
                    <h4 className="text-xs font-black text-[#0A2E5C] dark:text-white mt-2 leading-snug">
                      {exam.title}
                    </h4>
                    {exam.status !== "Published" && (
                      <p className="text-[10px] text-zinc-400 mt-1 flex items-center gap-1">
                        <Calendar className="h-3 w-3" /> Date: {exam.examDate} • Max: {exam.totalMarks} Marks
                      </p>
                    )}
                  </div>

                  {exam.status === "Published" ? (
                    <div className="pt-2 border-t border-zinc-200/50 dark:border-zinc-700/50 flex items-center justify-between mt-auto">
                      <span className="text-[10px] font-medium text-zinc-500 flex items-center gap-1">
                        <Calendar className="h-3 w-3" /> Date: {exam.examDate} • {exam.totalMarks} Marks
                      </span>
                    </div>
                  ) : (
                    <div className="pt-2 border-t border-zinc-200/50 dark:border-zinc-700/50 flex items-center justify-between mt-auto">
                      <span className="text-[10px] font-medium text-zinc-500">
                        {exam.answerKeyUrl || exam.answerKeyText ? "Answer Key Live" : "No Key Yet"}
                      </span>
                      <Link
                        href="/admin/results"
                        className="text-[10px] font-black text-[#0B5ED7] dark:text-[#FFC107] hover:underline"
                      >
                        Enter Scores →
                      </Link>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 2. Due Fee Students Section (with Fixed Div Size & Mobile Scroll) */}
      <div className="rounded-3xl border border-[#E5E7EB] bg-white p-4 sm:p-5 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C]">
        {/* Header with Title, Count Badge & View Switcher */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
              <Wallet className="h-3.5 w-3.5" />
            </div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm sm:text-base font-bold text-[#0A2E5C] dark:text-white">
                Due Fee Students
              </h3>
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[9px] sm:text-[10px] font-bold text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
                {dueFees.length} Students Due
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-2">
            {/* Table / Grid Switcher */}
            <div className="flex items-center rounded-xl bg-[#F8FAFC] p-0.5 dark:bg-zinc-800/70 border border-[#E5E7EB]/60 dark:border-zinc-700">
              <button
                onClick={() => setDueFeesViewMode("table")}
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${dueFeesViewMode === "table"
                    ? "bg-white text-[#0A2E5C] shadow-xs dark:bg-zinc-700 dark:text-white"
                    : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
                  }`}
                title="Table View"
              >
                <List className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setDueFeesViewMode("grid")}
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${dueFeesViewMode === "grid"
                    ? "bg-white text-[#0A2E5C] shadow-xs dark:bg-zinc-700 dark:text-white"
                    : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
                  }`}
                title="Grid View"
              >
                <Grid3X3 className="h-3.5 w-3.5" />
              </button>
            </div>

            <Link
              href="/admin/fees"
              className="text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 flex items-center gap-1 group"
            >
              View All <ChevronRight className="h-3.5 w-3.5 group-hover:trangray-x-0.5 transition-transform" />
            </Link>
          </div>
        </div>

        {/* Content with Limited Area & Internal Scrolling */}
        <div className="mt-3">
          {dueFees.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="h-10 w-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mb-2 dark:bg-emerald-950/30 dark:text-emerald-400">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <p className="text-xs font-bold text-[#0A2E5C] dark:text-white">All fees clear</p>
              <p className="text-[11px] text-zinc-400">No student fee dues or overdue renewals pending at this time.</p>
            </div>
          ) : dueFeesViewMode === "table" ? (
            <div className="max-h-[340px] overflow-y-auto overflow-x-auto pr-1 rounded-2xl border border-zinc-100 dark:border-zinc-800">
              <table className="w-full text-left border-collapse min-w-[700px]">
                <thead className="sticky top-0 bg-[#FAF9F6] dark:bg-zinc-800/90 z-10 border-b border-zinc-200/70 dark:border-zinc-800 text-[10px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  <tr>
                    <th className="py-3 px-3">STUDENT ID</th>
                    <th className="py-3 px-3">STUDENT</th>
                    <th className="py-3 px-3">NUMBER</th>
                    <th className="py-3 px-3">TYPE</th>
                    <th className="py-3 px-3">AMOUNT</th>
                    <th className="py-3 px-3">DUE DATE</th>
                    <th className="py-3 px-3">STATUS</th>
                    <th className="py-3 px-3 text-center">ACTION</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 text-xs dark:divide-zinc-800/60">
                  {dueFees.map((item) => (
                    <tr key={item.id} className="hover:bg-zinc-50/70 dark:hover:bg-zinc-800/30 transition-colors">
                      {/* 1. Student ID */}
                      <td className="py-3 px-3 font-mono font-bold text-zinc-600 dark:text-zinc-300">
                        {item.studentCode}
                      </td>

                      {/* 2. Student */}
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <div className={`h-6 w-6 rounded-full ${item.avatarBg} text-white flex items-center justify-center text-[9px] font-bold shrink-0 shadow-xs`}>
                            {item.initials}
                          </div>
                          <span className="font-black text-[#0A2E5C] dark:text-white truncate max-w-[140px]">{item.student}</span>
                        </div>
                      </td>

                      {/* 3. Number */}
                      <td className="py-3 px-3 font-medium text-zinc-500 dark:text-zinc-400">
                        {item.phone || "—"}
                      </td>

                      {/* 4. Type */}
                      <td className="py-3 px-3">
                        <span className="inline-flex px-2 py-0.5 rounded-lg text-[10px] font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 truncate max-w-[140px]">
                          {item.feeType}
                        </span>
                      </td>

                      {/* 5. Amount */}
                      <td className="py-3 px-3 font-black text-rose-600 dark:text-rose-400">
                        {item.amount}
                      </td>

                      {/* 6. Due Date */}
                      <td className="py-3 px-3 text-zinc-500 dark:text-zinc-400 font-medium">
                        {item.dueDate}
                      </td>

                      {/* 7. Status */}
                      <td className="py-3 px-3">
                        {item.isDefaulter ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300 border border-red-200 dark:border-red-800">
                            <AlertTriangle className="h-3 w-3" /> Defaulter ({item.monthsOverdue}m+)
                          </span>
                        ) : item.delay === "Overdue" ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                            Overdue
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-900">
                            Pending
                          </span>
                        )}
                      </td>

                      {/* 8. Action: Single-click Call, WhatsApp & Collect Fee */}
                      <td className="py-3 px-3 text-center">
                        <div className="inline-flex items-center justify-center gap-1.5">
                          {/* 📞 Call */}
                          <a
                            href={item.phone ? `tel:${item.phone.replace(/[^0-9+]/g, "")}` : undefined}
                            onClick={(e) => {
                              if (!item.phone) {
                                e.preventDefault();
                                showToast("⚠️ Student phone number not available on record");
                              }
                            }}
                            className={`h-7 w-7 rounded-xl flex items-center justify-center transition active:scale-95 cursor-pointer shadow-2xs ${
                              item.phone 
                                ? "bg-sky-50 hover:bg-sky-100 text-sky-600 dark:bg-sky-950/60 dark:text-sky-400" 
                                : "bg-zinc-100 text-zinc-400 opacity-40 cursor-not-allowed"
                            }`}
                            title={item.phone ? `Call ${item.student}: ${item.phone}` : "No Phone Number"}
                          >
                            <Phone className="h-3.5 w-3.5" />
                          </a>

                          {/* 💬 WhatsApp */}
                          <button
                            onClick={() => sendWhatsAppFeeReminder(item.student, item.phone, item.feeType, item.amount, item.delay)}
                            disabled={!item.phone}
                            className="h-7 w-7 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 flex items-center justify-center transition active:scale-95 disabled:opacity-40 cursor-pointer shadow-2xs"
                            title={`Send WhatsApp Due Reminder to ${item.student}`}
                          >
                            <MessageCircle className="h-3.5 w-3.5" />
                          </button>

                          {/* 💳 Collect Payment */}
                          <Link
                            href="/admin/fees"
                            className="h-7 w-7 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400 flex items-center justify-center transition active:scale-95 cursor-pointer shadow-2xs"
                            title="Collect Fee in Fees Management"
                          >
                            <CreditCard className="h-3.5 w-3.5" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="max-h-[340px] overflow-y-auto pr-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {dueFees.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-[#FAF9F6]/50 dark:bg-zinc-800/40 p-3.5 shadow-xs hover:border-[#E5E7EB] transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-1.5 mb-2">
                        <div className="flex items-center gap-2">
                          <div className={`h-7 w-7 rounded-full ${item.avatarBg} text-white flex items-center justify-center text-[10px] font-bold shrink-0 shadow-xs`}>
                            {item.initials}
                          </div>
                          <div>
                            <p className="text-xs font-bold text-[#0A2E5C] dark:text-white leading-tight truncate max-w-[110px]">{item.student}</p>
                            <p className="text-[10px] text-zinc-400 font-mono">ID: {item.studentCode}</p>
                          </div>
                        </div>
                        {item.isDefaulter ? (
                          <span className="inline-flex items-center gap-0.5 rounded-md bg-red-100 px-1.5 py-0.5 text-[9px] font-black text-red-700 dark:bg-red-950 dark:text-red-300 shrink-0">
                            Defaulter
                          </span>
                        ) : item.delay === "Overdue" ? (
                          <span className="inline-flex items-center rounded-md bg-amber-100 px-1.5 py-0.5 text-[9px] font-black text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 shrink-0">
                            Overdue
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-md bg-rose-50 px-1.5 py-0.5 text-[9px] font-bold text-rose-700 border border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 shrink-0">
                            Pending
                          </span>
                        )}
                      </div>

                      <div className="p-2.5 rounded-xl bg-white dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700/60 mb-2.5 space-y-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-zinc-500 font-medium truncate max-w-[120px]">{item.feeType}</span>
                          <span className="font-black text-rose-600 dark:text-rose-400">{item.amount}</span>
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-zinc-400 font-medium pt-0.5 border-t border-zinc-100 dark:border-zinc-700/40">
                          <span>Phone: {item.phone || "—"}</span>
                          <span>Due: {item.dueDate}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-1.5 pt-2 border-t border-zinc-100 dark:border-zinc-700/50">
                      <div className="flex items-center gap-1.5">
                        <a
                          href={item.phone ? `tel:${item.phone.replace(/[^0-9+]/g, "")}` : undefined}
                          onClick={(e) => {
                            if (!item.phone) {
                              e.preventDefault();
                              showToast("⚠️ Student phone number not available");
                            }
                          }}
                          className={`h-7 w-7 rounded-lg flex items-center justify-center transition active:scale-95 cursor-pointer shadow-2xs ${
                            item.phone 
                              ? "bg-sky-50 hover:bg-sky-100 text-sky-600 dark:bg-sky-950/60 dark:text-sky-400" 
                              : "bg-zinc-100 text-zinc-400 opacity-40 cursor-not-allowed"
                          }`}
                          title={item.phone ? `Call ${item.phone}` : "No Phone"}
                        >
                          <Phone className="h-3.5 w-3.5" />
                        </a>
                        <button
                          onClick={() => sendWhatsAppFeeReminder(item.student, item.phone, item.feeType, item.amount, item.delay)}
                          disabled={!item.phone}
                          className="h-7 w-7 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 flex items-center justify-center transition active:scale-95 disabled:opacity-40 cursor-pointer shadow-2xs"
                          title="WhatsApp Reminder"
                        >
                          <MessageCircle className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <Link
                        href="/admin/fees"
                        className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-indigo-600 text-white py-1.5 text-[10px] font-bold hover:bg-indigo-700 transition shadow-xs"
                      >
                        <CreditCard className="h-3 w-3" />
                        Collect Fee
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Insights & Recent System Logs Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">

        {/* Quick Insights */}
        <div className="rounded-3xl border border-[#E5E7EB] bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C] flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
                <Lightbulb className="h-5 w-5" />
              </div>
              <h3 className="text-base font-bold text-[#0A2E5C] dark:text-white">Quick Insights</h3>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed max-w-lg">
              You can check the daily attendance, book issue trends, shift distribution, and membership growth from the analytics section.
            </p>
          </div>

          <div className="mt-6">
            <Link
              href="/admin/analytics"
              className="inline-flex items-center gap-2 rounded-xl bg-[#0A2E5C] px-4 py-2.5 text-xs font-bold text-white transition-all hover:bg-[#0A2E5C]/90 hover:scale-102 shadow-xs dark:bg-white dark:text-[#0A2E5C] dark:hover:bg-zinc-200"
            >
              <span>View Analytics</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        {/* Recent System Logs */}
        <div className="rounded-3xl border border-[#E5E7EB] bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C]">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
                <Clock className="h-4 w-4" />
              </div>
              <h3 className="text-base font-bold text-[#0A2E5C] dark:text-white">Recent System Logs</h3>
            </div>
            <Link
              href="/admin/audit-log"
              className="text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 flex items-center gap-1 group"
            >
              View All <ChevronRight className="h-3.5 w-3.5 group-hover:trangray-x-0.5 transition-transform" />
            </Link>
          </div>

          <div className="space-y-3">
            {recentLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <p className="text-xs font-medium text-zinc-400">No recent system activity recorded yet today.</p>
              </div>
            ) : (
              recentLogs.map((log) => {
                const IconComp = log.icon;
                return (
                  <div key={log.id} className="flex items-center justify-between p-2 rounded-xl hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${log.bg} ${log.iconColor} shrink-0`}>
                        <IconComp className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-[#0A2E5C] dark:text-white">{log.title}</p>
                        <p className="text-[10px] text-zinc-400">{log.sub}</p>
                      </div>
                    </div>
                    <span className="text-[10px] font-medium text-zinc-400 shrink-0">{log.time}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
