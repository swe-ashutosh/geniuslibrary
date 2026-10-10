"use client";

/**
 * [WEB • PAGE] Analytics Dashboard
 *
 * Attendance trends, revenue, occupancy and exam performance charts.
 */
import { useState, useEffect } from "react";
import Link from "next/link";
import { 
  BarChart3, Users, Award, UserCheck, Trophy, KeyRound, IndianRupee,
  Calendar, Building2, Download, TrendingUp, AlertCircle, Clock, CheckCircle2,
  Lightbulb, RefreshCw, ChevronRight, Layers, ArrowUpRight, ShieldCheck,
  AlertTriangle, FileText
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { isMasterAdminEmail } from "@/lib/config";
import { 
  getDashboardStats, 
  getStudents, 
  getFees, 
  getAttendance,
  DashboardStats,
  StudentRecord,
  FeeRecord,
  AttendanceRecord
} from "@/lib/api";
import { getLibraryExams, getAllExamMarks, LibraryExam, StudentExamMark } from "@/lib/examResults";

export default function AnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Real database metrics state
  const [totalStudents, setTotalStudents] = useState<number>(0);
  const [activeStudents, setActiveStudents] = useState<number>(0);
  const [newRegistrations, setNewRegistrations] = useState<number>(0);
  const [examsList, setExamsList] = useState<LibraryExam[]>([]);
  const [examMarksList, setExamMarksList] = useState<StudentExamMark[]>([]);
  const [feesCollected, setFeesCollected] = useState<number>(0);
  const [pendingFeesAmount, setPendingFeesAmount] = useState<number>(0);
  const [pendingFeesCount, setPendingFeesCount] = useState<number>(0);

  // Category breakdown & daily activity computed from live data
  const [categoryBreakdown, setCategoryBreakdown] = useState<{ name: string; pct: string; count: number; color: string }[]>([]);
  const [dailyActivity, setDailyActivity] = useState<{ day: string; marks: number; attendance: number }[]>([]);

  const loadLiveAnalytics = async () => {
    try {
      setRefreshing(true);
      const [
        stats,
        initialStudents,
        fees,
        attendanceList
      ] = await Promise.all([
        getDashboardStats().catch(() => ({ totalSeats: 48, availableSeats: 48, occupiedSeats: 0, activeShiftsCount: 4, totalBooks: 0, booksIssuedCount: 0, attendanceTodayCount: 0 })),
        getStudents().catch(() => []),
        getFees().catch(() => []),
        getAttendance().catch(() => [])
      ]);

      const exams = getLibraryExams();
      setExamsList(exams);
      const allMarks = getAllExamMarks();
      setExamMarksList(allMarks);

      // 1. Compute students from Supabase
      const studentMap = new Map<string, any>();
      (initialStudents || []).forEach(s => studentMap.set(s.id, s));

      try {
        const supabase = createClient();
        const { data: profiles } = await supabase.from("profiles").select("*");
        if (profiles && profiles.length > 0) {
          profiles.forEach((p: any) => {
            if (p.role === "admin" || isMasterAdminEmail(p.email)) return;
            studentMap.set(p.id, {
              id: p.id,
              fullName: p.full_name,
              status: p.status || "active",
              createdAt: p.created_at
            });
          });
        }
      } catch (err) {
        console.warn("Analytics profiles query note:", err);
      }

      const studentsList = Array.from(studentMap.values());
      const totalStd = studentsList.length;
      const activeStd = studentsList.filter(s => s.status === "active").length;

      // New registrations in current month
      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();
      const newRegs = studentsList.filter(s => {
        if (!s.createdAt) return false;
        const d = new Date(s.createdAt);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      }).length;

      setTotalStudents(totalStd);
      setActiveStudents(activeStd);
      setNewRegistrations(newRegs);

      // 2. Fees Collection
      const feesList = fees || [];
      const paidTotal = feesList
        .filter(f => f.paid)
        .reduce((sum, f) => sum + (f.amount || 0), 0);
      const pendingTotal = feesList
        .filter(f => !f.paid)
        .reduce((sum, f) => sum + (f.amount || 0), 0);
      const pendingCount = feesList.filter(f => !f.paid).length;

      setFeesCollected(paidTotal);
      setPendingFeesAmount(pendingTotal);
      setPendingFeesCount(pendingCount);

      // 3. Category breakdown from Exams
      const categories: Record<string, number> = {};
      if (exams.length > 0) {
        exams.forEach(ex => {
          const cat = ex.category || "General";
          categories[cat] = (categories[cat] || 0) + 1;
        });
      } else {
        categories["UPSC / BPSC"] = 1;
        categories["SSC CGL"] = 1;
      }

      const totalCategorized = Object.values(categories).reduce((a, b) => a + b, 0);
      const colorPalette = ["blue", "emerald", "purple", "amber", "rose"];
      const breakdown = Object.entries(categories).map(([name, count], idx) => {
        const pct = totalCategorized > 0 ? `${Math.round((count / totalCategorized) * 100)}%` : "0%";
        return {
          name,
          pct,
          count,
          color: colorPalette[idx % colorPalette.length]
        };
      });
      setCategoryBreakdown(breakdown);

      // 4. Last 7 days dynamic activity
      const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const last7DaysData = Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        const dayStr = d.toISOString().split("T")[0];
        const dayName = days[d.getDay()];

        const dayAttendance = (attendanceList || []).filter(a => a.date === dayStr).length;
        const dayMarks = allMarks.filter(m => m.submittedAt && m.submittedAt.startsWith(dayStr)).length;

        return {
          day: dayName,
          marks: dayMarks,
          attendance: dayAttendance
        };
      });
      setDailyActivity(last7DaysData);

    } catch (err) {
      console.error("Analytics load error:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadLiveAnalytics();
  }, []);

  const totalResultsDeclared = examMarksList.length;
  const answerKeysLiveCount = examsList.filter(e => !!e.answerKeyUrl || !!e.answerKeyText).length;
  const draftExamsCount = examsList.filter(e => e.status === "Draft").length;

  const metrics = [
    { 
      title: "Total Students", 
      value: String(totalStudents), 
      icon: Users, 
      color: "blue", 
      trend: totalStudents > 0 ? `${totalStudents} registered members` : "0 members registered" 
    },
    { 
      title: "Active Members", 
      value: String(activeStudents), 
      icon: UserCheck, 
      color: "purple", 
      trend: activeStudents > 0 ? `${activeStudents} accounts active` : "0 active members" 
    },
    { 
      title: "Mock Exams", 
      value: String(examsList.length), 
      icon: Award, 
      color: "emerald", 
      trend: examsList.length > 0 ? `${examsList.length} tests conducted` : "No exams created yet" 
    },
    { 
      title: "Results Declared", 
      value: String(totalResultsDeclared), 
      icon: Trophy, 
      color: "amber", 
      trend: totalResultsDeclared > 0 ? `${totalResultsDeclared} student scorecards` : "0 results declared" 
    },
    { 
      title: "Answer Keys Live", 
      value: String(answerKeysLiveCount), 
      icon: KeyRound, 
      color: "rose", 
      trend: answerKeysLiveCount > 0 ? `${answerKeysLiveCount} keys available` : "0 keys uploaded" 
    },
    { 
      title: "Fees Collected", 
      value: `₹${feesCollected.toLocaleString("en-IN")}`, 
      icon: IndianRupee, 
      color: "emerald", 
      trend: pendingFeesAmount > 0 ? `₹${pendingFeesAmount} pending dues` : "All fees clear" 
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-100/50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400">
            <BarChart3 className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black text-[#0A2E5C] dark:text-white">Library Analytics</h1>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span> Live Sync
              </span>
            </div>
            <p className="text-xs text-zinc-500">Real-time statistics calculated directly from central library records.</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button 
            onClick={loadLiveAnalytics}
            disabled={refreshing}
            className="flex items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-xs font-semibold shadow-xs hover:bg-[#F8FAFC] dark:border-zinc-800 dark:bg-[#0A2E5C] dark:hover:bg-zinc-800 transition cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-zinc-500 ${refreshing ? "animate-spin" : ""}`} />
            Refresh Data
          </button>
          <div className="flex items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-xs font-semibold shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C]">
            <Building2 className="h-4 w-4 text-zinc-400" />
            Main Library (Madhupur, Sonbhadra)
          </div>
          <button 
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-xl bg-[#0A2E5C] text-[#FFC107] px-4 py-2 text-xs font-bold shadow-xs hover:bg-[#141A24] transition cursor-pointer"
          >
            <Download className="h-4 w-4" />
            Export Report
          </button>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 sm:gap-4">
        {metrics.map((metric, idx) => {
          const Icon = metric.icon;
          return (
            <div 
              key={idx}
              className="rounded-3xl border border-[#E5E7EB] bg-white p-4 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C] transition hover:shadow-md"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">{metric.title}</span>
                <div className={`p-2 rounded-xl bg-${metric.color}-50 text-${metric.color}-600 dark:bg-${metric.color}-950/40 dark:text-${metric.color}-400`}>
                  <Icon className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-2 text-xl sm:text-2xl font-black text-[#0A2E5C] dark:text-white truncate">
                {metric.value}
              </p>
              <p className="mt-1 text-[10px] text-zinc-500 dark:text-zinc-400 truncate">
                {metric.trend}
              </p>
            </div>
          );
        })}
      </div>

      {/* Main Grid: Visuals & Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left 2 Cols: 7-Day Dynamic Chart & Exam Results Desk */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* 7-Day Activity Chart */}
          <div className="rounded-3xl border border-[#E5E7EB] bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C]">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-6">
              <div>
                <h3 className="text-base font-bold text-[#0A2E5C] dark:text-white">7-Day Study Hall & Exam Activity</h3>
                <p className="text-xs text-zinc-400">Daily student check-ins and mock test assessments.</p>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-300">
                  <span className="h-2.5 w-2.5 rounded-full bg-purple-500"></span> Attendance
                </span>
                <span className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-300">
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-500"></span> Scores Logged
                </span>
              </div>
            </div>

            {/* Custom Bar Visualization */}
            <div className="space-y-2">
              <div className="h-48 flex items-end justify-between gap-2 pt-6 pb-2 border-b border-[#E5E7EB]/60 dark:border-zinc-800">
                {dailyActivity.map((dayData, idx) => {
                  const maxVal = Math.max(...dailyActivity.map(d => Math.max(d.attendance, d.marks, 1)));
                  const attPct = Math.max(6, (dayData.attendance / maxVal) * 100);
                  const marksPct = Math.max(6, (dayData.marks / maxVal) * 100);

                  return (
                    <div key={idx} className="flex-1 flex flex-col items-center gap-1 h-full justify-end group">
                      <div className="flex items-end justify-center gap-1 w-full h-full pb-1">
                        <div 
                          className="w-1/2 max-w-[14px] bg-purple-500 rounded-t-sm transition-all group-hover:brightness-110" 
                          style={{ height: `${attPct}%` }}
                          title={`${dayData.attendance} Attendance Check-ins`}
                        ></div>
                        <div 
                          className="w-1/2 max-w-[14px] bg-amber-500 rounded-t-sm transition-all group-hover:brightness-110" 
                          style={{ height: `${marksPct}%` }}
                          title={`${dayData.marks} Exam Scores Logged`}
                        ></div>
                      </div>
                      <span className="text-[10px] font-bold text-zinc-400">{dayData.day}</span>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-between text-[10px] text-zinc-400 pt-3">
                <span>Calculated daily from live session check-ins and mock test evaluation events</span>
                <span className="font-semibold text-zinc-600 dark:text-zinc-300">Live 7-Day Window</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Library Mock Tests & Exam Results Table */}
            <div className="rounded-3xl border border-[#E5E7EB] bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C]">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Award className="h-4 w-4 text-emerald-500" />
                  <h3 className="text-sm font-bold text-[#0A2E5C] dark:text-white">Recent Mock Tests & Results</h3>
                </div>
                <Link href="/admin/results" className="text-[10px] font-bold text-blue-600 hover:text-blue-700">Results Desk →</Link>
              </div>

              {examsList.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <div className="h-10 w-10 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-400 mb-2 dark:bg-zinc-800">
                    <Award className="h-5 w-5" />
                  </div>
                  <p className="text-xs font-bold text-[#0A2E5C] dark:text-white">No mock tests configured yet</p>
                  <p className="text-[10px] text-zinc-400">Create library exams to declare scores and answer keys.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[11px]">
                    <thead className="border-b border-[#E5E7EB] text-zinc-400 dark:border-zinc-800">
                      <tr>
                        <th className="pb-2 font-bold uppercase"># Exam Title</th>
                        <th className="pb-2 font-bold uppercase">Category</th>
                        <th className="pb-2 font-bold uppercase text-right">Max Marks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E5E7EB]/40 dark:divide-zinc-800/50">
                      {examsList.slice(0, 5).map((exam, idx) => (
                        <tr key={exam.id}>
                          <td className="py-2.5 font-bold text-[#0A2E5C] dark:text-white flex items-center gap-2">
                            <span className="text-zinc-400">{idx + 1}</span>
                            <span className="truncate max-w-[130px]">{exam.title}</span>
                          </td>
                          <td className="py-2.5">
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                              {exam.category}
                            </span>
                          </td>
                          <td className="py-2.5 text-right font-black text-[#0A2E5C] dark:text-white">{exam.totalMarks}M</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Student Membership Activity */}
            <div className="rounded-3xl border border-[#E5E7EB] bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C]">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-purple-500" />
                  <h3 className="text-sm font-bold text-[#0A2E5C] dark:text-white">Membership Stats</h3>
                </div>
                <Link href="/admin/students" className="text-[10px] font-bold text-blue-600 hover:text-blue-700">View Directory →</Link>
              </div>
              
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="rounded-2xl border border-zinc-100 bg-[#F8FAFC]/40 p-3.5 dark:border-zinc-800 dark:bg-zinc-800/40">
                  <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">New This Month</p>
                  <p className="text-2xl font-black text-[#0A2E5C] dark:text-white mt-1">
                    {newRegistrations}
                  </p>
                  <p className="text-[10px] text-emerald-600 font-bold mt-0.5">Enrolled recently</p>
                </div>

                <div className="rounded-2xl border border-zinc-100 bg-[#F8FAFC]/40 p-3.5 dark:border-zinc-800 dark:bg-zinc-800/40">
                  <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Active Students</p>
                  <p className="text-2xl font-black text-[#0A2E5C] dark:text-white mt-1">
                    {activeStudents}
                  </p>
                  <p className="text-[10px] text-blue-600 font-bold mt-0.5">Approved & active</p>
                </div>
              </div>

              <div className="rounded-xl bg-zinc-50 p-3 text-xs text-zinc-600 dark:bg-zinc-800/50 dark:text-zinc-300">
                <div className="flex items-center justify-between mb-1 text-[11px] font-bold">
                  <span>Student Active Ratio</span>
                  <span className="text-[#0A2E5C] dark:text-white">
                    {totalStudents > 0 ? `${Math.round((activeStudents / totalStudents) * 100)}%` : "0%"}
                  </span>
                </div>
                <div className="w-full bg-zinc-200 h-2 rounded-full overflow-hidden dark:bg-zinc-700">
                  <div 
                    className="bg-purple-600 h-full rounded-full transition-all"
                    style={{ width: `${totalStudents > 0 ? (activeStudents / totalStudents) * 100 : 0}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Col: Exams by Category & Attention Required */}
        <div className="space-y-6">
          
          {/* Exams by Category */}
          <div className="rounded-3xl border border-[#E5E7EB] bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C]">
            <div className="flex items-center gap-2 mb-5">
              <Layers className="h-4 w-4 text-blue-500" />
              <h3 className="text-sm font-bold text-[#0A2E5C] dark:text-white">Exams by Category</h3>
            </div>
            
            {categoryBreakdown.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <p className="text-xs font-bold text-[#0A2E5C] dark:text-white">No categories found</p>
                <p className="text-[10px] text-zinc-400">Add mock tests in the results desk to view category distribution.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {categoryBreakdown.map((item, i) => (
                  <div key={i} className="space-y-1">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="text-[#0A2E5C] dark:text-zinc-200">{item.name}</span>
                      <span className="text-zinc-400 text-[11px]">{item.count} tests ({item.pct})</span>
                    </div>
                    <div className="w-full bg-zinc-100 h-1.5 rounded-full overflow-hidden dark:bg-zinc-800">
                      <div className={`h-full bg-${item.color}-500 rounded-full`} style={{ width: item.pct }}></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Attention Required */}
          <div className="rounded-3xl border border-[#E5E7EB] bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C]">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-rose-500" />
                <h3 className="text-sm font-bold text-[#0A2E5C] dark:text-white">Attention Required</h3>
              </div>
              <Link href="/admin/results" className="text-[10px] font-bold text-blue-600 hover:text-blue-700">Exam Desk →</Link>
            </div>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-2xl border border-amber-100 bg-amber-50/30 dark:border-amber-900/30 dark:bg-amber-900/10">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-900/50 dark:text-amber-400">
                    <IndianRupee className="h-4 w-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-[#0A2E5C] dark:text-white block">Pending Student Dues</span>
                    <span className="text-[10px] text-zinc-400">{pendingFeesCount} fee invoices</span>
                  </div>
                </div>
                <span className="text-base font-black text-amber-600 dark:text-amber-400">₹{pendingFeesAmount.toLocaleString("en-IN")}</span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-2xl border border-blue-100 bg-blue-50/30 dark:border-blue-900/30 dark:bg-blue-900/10">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400">
                    <KeyRound className="h-4 w-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-[#0A2E5C] dark:text-white block">Official Answer Keys</span>
                    <span className="text-[10px] text-zinc-400">Live for student review</span>
                  </div>
                </div>
                <span className="text-base font-black text-blue-600 dark:text-blue-400">{answerKeysLiveCount}</span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-2xl border border-emerald-100 bg-emerald-50/30 dark:border-emerald-900/30 dark:bg-emerald-900/10">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-900/50 dark:text-emerald-400">
                    <Trophy className="h-4 w-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-[#0A2E5C] dark:text-white block">Declared Scorecards</span>
                    <span className="text-[10px] text-zinc-400">Student marks assigned</span>
                  </div>
                </div>
                <span className="text-base font-black text-emerald-600 dark:text-emerald-400">{totalResultsDeclared}</span>
              </div>
            </div>
          </div>

        </div>
      </div>
      
      {/* Bottom Dynamic Recommendations Banner */}
      <div className="rounded-3xl border border-[#FFC107]/40 bg-[#0A2E5C] p-5 shadow-sm text-[#FFC107]">
        <div className="flex items-start gap-4">
          <div className="rounded-2xl bg-[#FFC107]/20 p-3 shrink-0">
            <Lightbulb className="h-6 w-6 text-[#E5E7EB]" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-white mb-2">Live Insights & Operational Health</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                <p className="text-[11px] text-zinc-300">
                  <strong className="text-white">Fee Ledger:</strong> {pendingFeesCount > 0 ? `₹${pendingFeesAmount} in outstanding fee dues to collect.` : "All active student fees are paid up to date."}
                </p>
              </div>
              <div className="flex items-start gap-2">
                <Award className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-[11px] text-zinc-300">
                  <strong className="text-white">Exam Assessment Desk:</strong> {examsList.length} library mock tests configured with {answerKeysLiveCount} published answer keys.
                </p>
              </div>
              <div className="flex items-start gap-2">
                <TrendingUp className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
                <p className="text-[11px] text-zinc-300">
                  <strong className="text-white">Member Growth:</strong> {totalStudents} total members registered ({activeStudents} active).
                </p>
              </div>
            </div>
          </div>
          <Link href="/admin/results" className="hidden md:block shrink-0 text-xs font-bold text-white hover:text-[#FFC107] transition border border-[#FFC107]/40 rounded-xl px-4 py-2">
            Exam Results Desk →
          </Link>
        </div>
      </div>
      
    </div>
  );
}
