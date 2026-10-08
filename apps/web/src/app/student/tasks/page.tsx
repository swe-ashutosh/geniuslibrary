"use client";

/**
 * [WEB • PAGE] Exams & Tasks
 *
 * Take library mock tests and view declared results.
 */
import { useState, useEffect } from "react";
import { BRAND_CONFIG } from "@/lib/config";
import { 
  CheckSquare, 
  Plus, 
  Trash2, 
  Clock, 
  Play, 
  Pause, 
  RotateCcw, 
  Sparkles, 
  CheckCircle2,
  Calendar,
  Flame,
  Target,
  Award,
  BarChart2,
  Trophy,
  FileText,
  Eye,
  X,
  Printer,
  ChevronRight,
  TrendingUp,
  Percent,
  Check,
  AlertCircle,
  KeyRound,
  ExternalLink,
  Download
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { 
  LibraryExam, 
  StudentExamMark, 
  getLibraryExams, 
  getResultsForStudent,
  fetchResultsForStudent
} from "@/lib/examResults";

interface TaskItem {
  id: string;
  title: string;
  category: string;
  completed: boolean;
  priority: "low" | "medium" | "high";
  targetTime?: string;
}

interface StudentExamResultItem {
  exam: LibraryExam;
  mark?: StudentExamMark;
  rank?: number;
  totalAppeared: number;
}

export default function StudentActivityPage() {
  const [activeTab, setActiveTab] = useState<"tasks" | "results">("results");
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [mounted, setMounted] = useState(false);
  const [studentExams, setStudentExams] = useState<StudentExamResultItem[]>([]);
  
  // Modals
  const [selectedScorecard, setSelectedScorecard] = useState<StudentExamResultItem | null>(null);
  const [selectedAnswerKeyExam, setSelectedAnswerKeyExam] = useState<LibraryExam | null>(null);

  // Load persistent personal tasks from local storage
  useEffect(() => {
    setMounted(true);
    try {
      const saved = localStorage.getItem("genius_student_study_tasks");
      if (saved) {
        setTasks(JSON.parse(saved));
      }
    } catch {}

    // Load student exams and marks with Supabase sync
    async function loadExams() {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        let studentCode = "";
        let fullName = user?.user_metadata?.full_name || "";
        if (user) {
          const { data: profile } = await supabase.from("profiles").select("student_code, full_name").eq("id", user.id).maybeSingle();
          if (profile) {
            studentCode = profile.student_code || "";
            if (profile.full_name) fullName = profile.full_name;
          }
        }
        const results = await fetchResultsForStudent({
          id: user?.id,
          email: user?.email,
          studentCode,
          fullName,
        });
        setStudentExams(results);
      } catch {
        setStudentExams(getResultsForStudent({}));
      }
    }
    loadExams();
  }, []);

  const saveTasks = (newTasks: TaskItem[]) => {
    setTasks(newTasks);
    try {
      localStorage.setItem("genius_student_study_tasks", JSON.stringify(newTasks));
    } catch {}
  };

  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskCategory, setNewTaskCategory] = useState("General");
  const [newTaskPriority, setNewTaskPriority] = useState<"low" | "medium" | "high">("medium");

  // Pomodoro Timer State (25 mins standard study session)
  const [pomodoroSeconds, setPomodoroSeconds] = useState(25 * 60);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [completedPomodoros, setCompletedPomodoros] = useState(0);

  useEffect(() => {
    let interval: any = null;
    if (isTimerRunning && pomodoroSeconds > 0) {
      interval = setInterval(() => {
        setPomodoroSeconds((prev) => prev - 1);
      }, 1000);
    } else if (pomodoroSeconds === 0 && isTimerRunning) {
      setIsTimerRunning(false);
      setCompletedPomodoros((p) => p + 1);
      alert("🎉 Great job! 25-minute study sprint completed. Take a 5-minute break.");
      setPomodoroSeconds(25 * 60);
    }
    return () => clearInterval(interval);
  }, [isTimerRunning, pomodoroSeconds]);

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const handleToggleTask = (id: string) => {
    saveTasks(tasks.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)));
  };

  const handleDeleteTask = (id: string) => {
    saveTasks(tasks.filter((t) => t.id !== id));
  };

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    const newTask: TaskItem = {
      id: `t-${Date.now()}`,
      title: newTaskTitle.trim(),
      category: newTaskCategory,
      completed: false,
      priority: newTaskPriority,
      targetTime: "1 hr",
    };

    saveTasks([newTask, ...tasks]);
    setNewTaskTitle("");
  };

  // Metrics for exams
  const evaluatedExams = studentExams.filter((item) => item.mark !== undefined);
  const totalExamsTaken = evaluatedExams.length;
  const avgScore = totalExamsTaken > 0 
    ? Math.round(evaluatedExams.reduce((acc, curr) => acc + (curr.mark?.percentage || 0), 0) / totalExamsTaken)
    : 0;
  const bestRank = totalExamsTaken > 0
    ? Math.min(...evaluatedExams.map((e) => e.mark?.rank || 999))
    : "--";

  if (!mounted) return null;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-[#0A2E5C] dark:text-white flex items-center gap-2.5">
            <Award className="h-6 w-6 text-[#0B5ED7] dark:text-[#FFC107]" />
            Student Activity &amp; Exam Results
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Check your mock test scores, rank in library, answer keys, and manage study goals
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center rounded-2xl bg-[#F8FAFC] p-1 dark:bg-zinc-800 border border-[#E5E7EB]/70 dark:border-zinc-700 self-start sm:self-auto">
          <button
            onClick={() => setActiveTab("results")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === "results"
                ? "bg-[#0A2E5C] text-[#FFC107] shadow-sm dark:bg-white dark:text-[#0A2E5C]"
                : "text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white"
            }`}
          >
            <Trophy className="h-3.5 w-3.5" />
            <span>Exam Results &amp; Answer Keys</span>
          </button>

          <button
            onClick={() => setActiveTab("tasks")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === "tasks"
                ? "bg-[#0A2E5C] text-[#FFC107] shadow-sm dark:bg-white dark:text-[#0A2E5C]"
                : "text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white"
            }`}
          >
            <CheckSquare className="h-3.5 w-3.5" />
            <span>Study Goals &amp; Focus</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: LIBRARY EXAM RESULTS & MOCK TESTS */}
      {/* ========================================================================= */}
      {activeTab === "results" && (
        <div className="space-y-6 animate-fadeIn">
          {/* Metrics Top Row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {[
              { label: "Tests Attempted", val: `${totalExamsTaken}`, sub: "Library Conducted", icon: FileText, color: "blue" },
              { label: "Average Score", val: `${avgScore}%`, sub: "Across all tests", icon: Percent, color: "emerald" },
              { label: "Top Library Rank", val: bestRank === 999 ? "--" : `#${bestRank}`, sub: "Among batch students", icon: Trophy, color: "amber" },
              { label: "Upcoming Tests", val: `${studentExams.filter(e => !e.mark).length}`, sub: "Scheduled in hall", icon: Calendar, color: "purple" },
            ].map((m, idx) => (
              <div key={idx} className="rounded-3xl border border-[#E5E7EB] bg-white p-4 sm:p-5 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C]">
                <div className="flex items-center gap-2 mb-2">
                  <div className={`p-2 rounded-xl ${
                    m.color === "blue" ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300" :
                    m.color === "emerald" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" :
                    m.color === "amber" ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" :
                    "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300"
                  }`}>
                    <m.icon className="h-4 w-4" />
                  </div>
                </div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">{m.label}</p>
                <h3 className="text-xl sm:text-2xl font-black text-[#0A2E5C] dark:text-white mt-0.5">{m.val}</h3>
                <p className="text-[10px] text-zinc-500">{m.sub}</p>
              </div>
            ))}
          </div>

          {/* List of Conducted Exams */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-black text-[#0A2E5C] dark:text-white flex items-center gap-2">
                <Trophy className="h-4 w-4 text-[#0B5ED7] dark:text-[#FFC107]" />
                Library Mock Tests &amp; Official Results
              </h2>
              <span className="text-xs text-zinc-400">Official Evaluation Desk</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {studentExams.map((item) => {
                const { exam, mark } = item;
                const hasKey = !!(exam.answerKeyUrl || exam.answerKeyText);
                const isDeclared = !!mark;

                return (
                  <div 
                    key={exam.id}
                    className="rounded-3xl border border-[#E5E7EB] bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C] flex flex-col justify-between space-y-4 transition-all hover:shadow-md"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-[#F8FAFC] dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
                          {exam.category}
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          isDeclared
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" 
                            : "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300"
                        }`}>
                          {isDeclared ? "Result Declared" : "Under Evaluation"}
                        </span>
                      </div>

                      <h3 className="text-sm font-black text-[#0A2E5C] dark:text-white leading-snug">
                        {exam.title}
                      </h3>

                      <p className="text-[11px] text-zinc-400 flex items-center gap-1.5">
                        <Calendar className="h-3 w-3" /> Conducted: {exam.examDate} • {exam.durationMinutes} Mins
                      </p>
                    </div>

                    {isDeclared && mark ? (
                      <div className="p-3.5 rounded-2xl bg-[#F8FAFC]/70 dark:bg-zinc-800/60 border border-zinc-200/60 dark:border-zinc-700/60 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-zinc-500 font-medium">Your Score:</span>
                          <span className="font-black text-[#0A2E5C] dark:text-white text-sm">
                            {mark.marksObtained} / {mark.totalMarks} <span className="text-[10px] font-semibold text-emerald-600">({mark.percentage}%)</span>
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-xs">
                          <span className="text-zinc-500 font-medium">Library Rank:</span>
                          <span className="font-extrabold text-blue-600 dark:text-blue-400">
                            Rank #{mark.rank || 1} <span className="text-[10px] text-zinc-400">(Top Performer)</span>
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-xs">
                          <span className="text-zinc-500 font-medium">Result Status:</span>
                          <span className={`font-bold px-2 py-0.5 rounded text-[10px] ${
                            mark.status === "Pass" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                          }`}>
                            {mark.status}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="p-3.5 rounded-2xl bg-purple-50/60 dark:bg-purple-950/20 border border-purple-200/60 dark:border-purple-800/40 text-xs text-purple-800 dark:text-purple-300 space-y-1">
                        <p className="font-bold flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5" /> Exam Date: {exam.examDate}
                        </p>
                        <p className="text-[11px] text-purple-600 dark:text-purple-400 leading-relaxed">
                          Conducted at {BRAND_CONFIG.fullName} examination hall. Marks will be declared here once evaluated.
                        </p>
                      </div>
                    )}

                    {/* Action Buttons: View Scorecard & Answer Key */}
                    <div className="pt-1 flex flex-col sm:flex-row items-center gap-2">
                      {isDeclared && (
                        <button
                          onClick={() => setSelectedScorecard(item)}
                          className="w-full flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-[#0A2E5C] p-2 text-xs font-bold text-[#FFC107] hover:bg-[#141A24] transition shadow-xs cursor-pointer"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          <span>View Scorecard</span>
                        </button>
                      )}

                      {hasKey ? (
                        <button
                          onClick={() => setSelectedAnswerKeyExam(exam)}
                          className="w-full sm:w-auto flex items-center justify-center gap-1.5 rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 p-2 text-xs font-bold hover:bg-emerald-100 transition shadow-xs cursor-pointer"
                        >
                          <KeyRound className="h-3.5 w-3.5" />
                          <span>Answer Key</span>
                        </button>
                      ) : (
                        <div className="text-[11px] text-zinc-400 font-medium px-2 py-1">
                          Key Coming Soon
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: STUDY GOALS & POMODORO */}
      {/* ========================================================================= */}
      {activeTab === "tasks" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fadeIn">
          {/* Left Col: Task Input & Task List */}
          <div className="lg:col-span-2 space-y-6">
            {/* Create Goal Form */}
            <div className="rounded-3xl border border-[#E5E7EB] bg-white p-5 sm:p-6 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C]">
              <h2 className="text-sm font-black text-[#0A2E5C] dark:text-white flex items-center gap-2 mb-4">
                <Target className="h-4 w-4 text-[#0B5ED7] dark:text-[#FFC107]" />
                Add Daily Target or Study Goal
              </h2>

              <form onSubmit={handleAddTask} className="space-y-3">
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    placeholder="e.g. Modern History Spectrum Ch 4-6..."
                    className="flex-1 h-10 px-3.5 text-xs rounded-xl bg-[#F4F1EA]/80 dark:bg-zinc-800/80 border border-[#E5E7EB]/70 dark:border-zinc-700 text-[#0A2E5C] dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#0B5ED7]/30"
                  />

                  <select
                    value={newTaskCategory}
                    onChange={(e) => setNewTaskCategory(e.target.value)}
                    className="h-10 px-3 text-xs rounded-xl bg-[#F4F1EA]/80 dark:bg-zinc-800/80 border border-[#E5E7EB]/70 dark:border-zinc-700 text-[#0A2E5C] dark:text-white focus:outline-none"
                  >
                    <option value="General">General</option>
                    <option value="General Studies">General Studies</option>
                    <option value="Reasoning">Reasoning</option>
                    <option value="Quant / Maths">Quant / Maths</option>
                    <option value="Current Affairs">Current Affairs</option>
                  </select>

                  <button
                    type="submit"
                    className="h-10 px-5 rounded-xl bg-[#0A2E5C] text-[#FFC107] text-xs font-black hover:bg-black transition active:scale-95 shadow-xs cursor-pointer flex items-center justify-center gap-1.5 dark:bg-white dark:text-[#0A2E5C]"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Add Goal</span>
                  </button>
                </div>
              </form>
            </div>

            {/* Task Items List */}
            <div className="space-y-3">
              {tasks.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-[#E5E7EB] p-10 text-center bg-white dark:border-zinc-800 dark:bg-[#0A2E5C]">
                  <CheckSquare className="h-8 w-8 text-zinc-300 dark:text-zinc-600 mx-auto mb-2" />
                  <p className="text-xs font-bold text-zinc-500">No active goals for today</p>
                  <p className="text-[11px] text-zinc-400 mt-0.5">Set a syllabus chapter or test practice target above.</p>
                </div>
              ) : (
                tasks.map((task) => (
                  <div
                    key={task.id}
                    className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all ${
                      task.completed
                        ? "bg-[#F8FAFC]/50 border-zinc-200 dark:bg-zinc-900/40 dark:border-zinc-800 opacity-60"
                        : "bg-white border-[#E5E7EB] shadow-xs dark:bg-[#0A2E5C] dark:border-zinc-800"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleToggleTask(task.id)}
                        className={`h-5 w-5 rounded-lg border flex items-center justify-center transition cursor-pointer ${
                          task.completed
                            ? "bg-emerald-500 border-emerald-500 text-white"
                            : "border-zinc-300 dark:border-zinc-600 hover:border-emerald-500"
                        }`}
                      >
                        {task.completed && <Check className="h-3 w-3 stroke-[3]" />}
                      </button>

                      <div>
                        <p className={`text-xs font-bold ${task.completed ? "line-through text-zinc-400" : "text-[#0A2E5C] dark:text-white"}`}>
                          {task.title}
                        </p>
                        <span className="text-[10px] text-zinc-400">{task.category}</span>
                      </div>
                    </div>

                    <button
                      onClick={() => handleDeleteTask(task.id)}
                      className="p-1.5 text-zinc-400 hover:text-rose-500 rounded-lg transition cursor-pointer"
                      title="Delete Goal"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right Col: Pomodoro Timer Widget */}
          <div className="space-y-6">
            <div className="rounded-3xl border border-[#E5E7EB] bg-linear-to-b from-white to-[#F8FAFC] p-6 shadow-xs dark:border-zinc-800 dark:from-[#0A2E5C] dark:to-zinc-900 text-center">
              <div className="inline-flex items-center gap-2 rounded-xl bg-orange-100 dark:bg-orange-950/60 px-3 py-1 text-xs font-bold text-orange-700 dark:text-orange-300 mb-4">
                <Flame className="h-4 w-4" />
                <span>Pomodoro Focus Sprint</span>
              </div>

              <div className="my-6">
                <span className="text-5xl sm:text-6xl font-black font-mono tracking-tight text-[#0A2E5C] dark:text-white">
                  {formatTimer(pomodoroSeconds)}
                </span>
                <p className="text-xs text-zinc-400 mt-2 font-medium">Standard 25 min silent study cycle</p>
              </div>

              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => setIsTimerRunning(!isTimerRunning)}
                  className={`inline-flex items-center gap-2 px-6 py-3 rounded-2xl text-xs font-black shadow-md transition active:scale-95 cursor-pointer ${
                    isTimerRunning
                      ? "bg-amber-500 text-white hover:bg-amber-600"
                      : "bg-[#0A2E5C] text-[#FFC107] hover:bg-black dark:bg-white dark:text-[#0A2E5C]"
                  }`}
                >
                  {isTimerRunning ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  <span>{isTimerRunning ? "Pause Sprint" : "Start Sprint"}</span>
                </button>

                <button
                  onClick={() => {
                    setIsTimerRunning(false);
                    setPomodoroSeconds(25 * 60);
                  }}
                  className="p-3 rounded-2xl border border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-100 transition dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 cursor-pointer"
                  title="Reset Timer"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-6 pt-4 border-t border-zinc-200 dark:border-zinc-700 flex justify-between text-xs text-zinc-500">
                <span>Completed Cycles:</span>
                <span className="font-bold text-[#0A2E5C] dark:text-white">{completedPomodoros} Sprints ({completedPomodoros * 25} mins)</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. OFFICIAL ANSWER KEY MODAL */}
      {/* ========================================================================= */}
      {selectedAnswerKeyExam && (
        <div 
          onClick={() => setSelectedAnswerKeyExam(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-fadeIn"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-3xl border border-[#E5E7EB] bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-[#0A2E5C] space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-amber-500" />
                <h3 className="text-base font-black text-[#0A2E5C] dark:text-white">
                  Official Test Answer Key
                </h3>
              </div>
              <button 
                onClick={() => setSelectedAnswerKeyExam(null)}
                className="p-1.5 rounded-full text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-1">
              <h4 className="text-sm font-bold text-[#0A2E5C] dark:text-white">
                {selectedAnswerKeyExam.title}
              </h4>
              <p className="text-xs text-zinc-400">
                Category: {selectedAnswerKeyExam.category} • Date: {selectedAnswerKeyExam.examDate}
              </p>
            </div>

            {selectedAnswerKeyExam.answerKeyUrl && (
              <a
                href={selectedAnswerKeyExam.answerKeyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs font-bold hover:bg-emerald-100 transition shadow-xs"
              >
                <span className="flex items-center gap-2">
                  <Download className="h-4 w-4" />
                  <span>Download / View Official Answer Key PDF</span>
                </span>
                <ExternalLink className="h-4 w-4" />
              </a>
            )}

            {selectedAnswerKeyExam.answerKeyText ? (
              <div className="space-y-2">
                <p className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                  Question-Wise Solution Keys:
                </p>
                <div className="p-3.5 rounded-2xl bg-[#F4F1EA] dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 font-mono text-xs text-[#0A2E5C] dark:text-zinc-200 leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">
                  {selectedAnswerKeyExam.answerKeyText}
                </div>
              </div>
            ) : !selectedAnswerKeyExam.answerKeyUrl && (
              <div className="py-6 text-center text-xs text-zinc-400">
                Official Answer Key has not been released yet for this test.
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedAnswerKeyExam(null)}
                className="px-5 py-2 rounded-xl bg-[#0A2E5C] text-xs font-bold text-[#FFC107] hover:bg-black transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. DETAILED SCORECARD POPUP MODAL */}
      {/* ========================================================================= */}
      {selectedScorecard && selectedScorecard.mark && (
        <div 
          onClick={() => setSelectedScorecard(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-fadeIn"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-3xl border border-[#E5E7EB] bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-[#0A2E5C] space-y-5 animate-scaleUp max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-4">
              <div>
                <span className="text-[10px] font-black uppercase text-[#0B5ED7] dark:text-[#FFC107] tracking-wider">
                  {BRAND_CONFIG.fullName} • Exam Cell
                </span>
                <h3 className="text-base font-black text-[#0A2E5C] dark:text-white mt-0.5">
                  Official Scorecard &amp; Rank
                </h3>
              </div>
              <button 
                onClick={() => setSelectedScorecard(null)}
                className="p-1.5 rounded-full text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Test Details */}
            <div className="rounded-2xl bg-[#F8FAFC] dark:bg-zinc-800/60 p-4 space-y-1 border border-zinc-200/70 dark:border-zinc-700">
              <h4 className="text-sm font-black text-[#0A2E5C] dark:text-white">
                {selectedScorecard.exam.title}
              </h4>
              <p className="text-xs text-zinc-500">
                Conducted: {selectedScorecard.exam.examDate} • Category: {selectedScorecard.exam.category}
              </p>
            </div>

            {/* Score Grid */}
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 p-3 bg-white dark:bg-zinc-800">
                <p className="text-[10px] text-zinc-400 font-bold uppercase">Marks</p>
                <p className="text-xl font-black text-blue-600 dark:text-blue-400">
                  {selectedScorecard.mark.marksObtained}/{selectedScorecard.mark.totalMarks}
                </p>
              </div>
              <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 p-3 bg-white dark:bg-zinc-800">
                <p className="text-[10px] text-zinc-400 font-bold uppercase">Rank</p>
                <p className="text-xl font-black text-amber-500">
                  #{selectedScorecard.mark.rank || 1} <span className="text-[10px] text-zinc-400">/ {selectedScorecard.totalAppeared}</span>
                </p>
              </div>
              <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 p-3 bg-white dark:bg-zinc-800">
                <p className="text-[10px] text-zinc-400 font-bold uppercase">Percentage</p>
                <p className="text-xl font-black text-emerald-600 dark:text-emerald-400">
                  {selectedScorecard.mark.percentage}%
                </p>
              </div>
            </div>

            {/* Mentor Remark */}
            <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 text-xs text-amber-900 dark:text-amber-200">
              <p className="font-bold mb-0.5">Faculty / Admin Evaluation Feedback:</p>
              <p className="text-[11px] leading-relaxed">{selectedScorecard.mark.remarks || "Good performance in test."}</p>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => window.print()}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-300 bg-white py-2.5 text-xs font-bold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white cursor-pointer"
              >
                <Printer className="h-4 w-4" /> Print Result Slip
              </button>
              <button
                onClick={() => setSelectedScorecard(null)}
                className="px-5 py-2.5 rounded-xl bg-[#0A2E5C] text-xs font-bold text-[#FFC107] hover:bg-black transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
