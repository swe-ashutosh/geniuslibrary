"use client";

/**
 * [WEB • PAGE] Exam Results Manager
 *
 * Create library exams and enter/publish student marks.
 */
import { useState, useEffect } from "react";
import { 
  Award, 
  Plus, 
  Search, 
  FileText, 
  CheckCircle2, 
  Clock, 
  Trash2, 
  Edit3, 
  KeyRound, 
  Users, 
  Trophy, 
  ChevronRight, 
  ExternalLink, 
  Download, 
  X, 
  Check, 
  AlertCircle,
  Percent,
  Sparkles,
  BarChart2,
  Calendar,
  Layers,
  Eye
} from "lucide-react";
import { 
  LibraryExam, 
  StudentExamMark, 
  getLibraryExams, 
  saveLibraryExam, 
  deleteLibraryExam, 
  getMarksForExam, 
  saveStudentMark, 
  deleteStudentMark,
  getAllExamMarks,
  syncExamsAndMarksFromSupabase
} from "@/lib/examResults";
import { getStudents, Student, createNotification } from "@/lib/api";
import { triggerNativeNotification } from "@/lib/pushNotify";

export default function AdminResultsPage() {
  const [exams, setExams] = useState<LibraryExam[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [mounted, setMounted] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Modal States
  const [isExamModalOpen, setIsExamModalOpen] = useState(false);
  const [editingExam, setEditingExam] = useState<LibraryExam | null>(null);

  const [isMarksModalOpen, setIsMarksModalOpen] = useState(false);
  const [selectedExamForMarks, setSelectedExamForMarks] = useState<LibraryExam | null>(null);
  const [examMarksList, setExamMarksList] = useState<StudentExamMark[]>([]);

  const [isAnswerKeyModalOpen, setIsAnswerKeyModalOpen] = useState(false);
  const [selectedExamForAnswerKey, setSelectedExamForAnswerKey] = useState<LibraryExam | null>(null);

  // Form States for Exam
  const [examTitle, setExamTitle] = useState("");
  const [examCategory, setExamCategory] = useState("General Studies");
  const [examDate, setExamDate] = useState("");
  const [examDuration, setExamDuration] = useState<number | "">(120);
  const [examTotalMarks, setExamTotalMarks] = useState<number | "">(100);
  const [examPassingMarks, setExamPassingMarks] = useState<number | "">(40);
  const [examStatus, setExamStatus] = useState<"Draft" | "Published">("Published");
  const [examDescription, setExamDescription] = useState("");

  // Form States for Marks Entry
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [marksObtained, setMarksObtained] = useState<number | "">(0);
  const [studentRemarks, setStudentRemarks] = useState("");

  // Form States for Answer Key
  const [answerKeyUrl, setAnswerKeyUrl] = useState("");
  const [answerKeyText, setAnswerKeyText] = useState("");

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  const loadData = async () => {
    try {
      const synced = await syncExamsAndMarksFromSupabase();
      setExams(synced.exams);
    } catch {
      const loadedExams = getLibraryExams();
      setExams(loadedExams);
    }

    try {
      const studentData = await getStudents();
      setStudents(studentData || []);
    } catch (err) {
      console.warn("Could not fetch students list:", err);
    }
  };

  useEffect(() => {
    setMounted(true);
    loadData();
  }, []);

  // Filtered exams
  const filteredExams = exams.filter((e) => {
    const matchesSearch = 
      e.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.category.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCat = filterCategory === "all" || e.category === filterCategory;
    return matchesSearch && matchesCat;
  });

  // Calculate 6 Key Metrics
  const todayStr = new Date().toISOString().split("T")[0];
  // An exam is considered conducted ONLY if its date has passed/today or marks have been recorded
  const conductedExams = exams.filter(e => (e.examDate || "") <= todayStr || getMarksForExam(e.id).length > 0);
  const totalExamsCount = conductedExams.length;
  // Result published: only for conducted exams that are published with marks or answer key
  const publishedExamsCount = conductedExams.filter(e => e.status === "Published" && (getMarksForExam(e.id).length > 0 || !!e.answerKeyUrl || !!e.answerKeyText || (e.examDate || "") < todayStr)).length;
  const withAnswerKeyCount = exams.filter(e => !!e.answerKeyUrl || !!e.answerKeyText).length;
  const enrolledStudentsCount = students.length;

  // Next Exam (nearest upcoming exam date)
  const upcomingExams = exams
    .filter(e => (e.examDate || "") >= todayStr && getMarksForExam(e.id).length === 0)
    .sort((a, b) => (a.examDate || "").localeCompare(b.examDate || ""));
  const nextExam = upcomingExams[0] || (exams.length > 0 ? exams[0] : null);

  // Topper across all exams
  const allMarks = getAllExamMarks();
  const sortedMarks = [...allMarks].sort((a, b) => (b.percentage || 0) - (a.percentage || 0));
  const topperRecord = sortedMarks.length > 0 ? sortedMarks[0] : null;

  // Handle Open Create / Edit Exam
  const handleOpenExamModal = (exam?: LibraryExam) => {
    if (exam) {
      setEditingExam(exam);
      setExamTitle(exam.title);
      setExamCategory(exam.category);
      setExamDate(exam.examDate);
      setExamDuration(exam.durationMinutes);
      setExamTotalMarks(exam.totalMarks);
      setExamPassingMarks(exam.passingMarks);
      setExamStatus(exam.status);
      setExamDescription(exam.description || "");
    } else {
      setEditingExam(null);
      setExamTitle("");
      setExamCategory("General Studies");
      setExamDate(new Date().toISOString().split("T")[0]);
      setExamDuration(120);
      setExamTotalMarks(100);
      setExamPassingMarks(40);
      setExamStatus("Published");
      setExamDescription("");
    }
    setIsExamModalOpen(true);
  };

  // Handle Save Exam
  const handleSaveExam = (e: React.FormEvent) => {
    e.preventDefault();
    if (!examTitle.trim()) return;

    const newExam: LibraryExam = {
      id: editingExam ? editingExam.id : `exam-${Date.now()}`,
      title: examTitle.trim(),
      category: examCategory,
      examDate: examDate || new Date().toISOString().split("T")[0],
      durationMinutes: Number(examDuration) || 120,
      totalMarks: Number(examTotalMarks) || 100,
      passingMarks: Number(examPassingMarks) || 40,
      status: examStatus,
      description: examDescription.trim(),
      answerKeyUrl: editingExam ? editingExam.answerKeyUrl : "",
      answerKeyText: editingExam ? editingExam.answerKeyText : "",
      createdAt: editingExam ? editingExam.createdAt : new Date().toISOString(),
    };

    const updated = saveLibraryExam(newExam);
    setExams(updated);
    setIsExamModalOpen(false);
    showToast(editingExam ? "Exam details updated successfully!" : "New Exam created and scheduled!");

    // Send notification to students if published
    if (newExam.status === "Published") {
      const isNew = !editingExam;
      createNotification({
        recipientRole: "student",
        title: isNew ? "📝 New Exam Scheduled" : "Exam Updated",
        message: `${newExam.title} (${newExam.category}) has been published. Date: ${newExam.examDate}.`,
        type: "general",
        actionUrl: "/student/tasks",
      }).catch(console.error);
    }
  };

  // Handle Delete Exam
  const handleDeleteExam = (id: string) => {
    if (confirm("Are you sure you want to delete this exam? All student marks for this exam will also be removed.")) {
      const updated = deleteLibraryExam(id);
      setExams(updated);
      showToast("Exam deleted successfully.");
    }
  };

  // Handle Open Marks Modal
  const handleOpenMarksModal = (exam: LibraryExam) => {
    setSelectedExamForMarks(exam);
    const marks = getMarksForExam(exam.id);
    setExamMarksList(marks);
    setSelectedStudentId("");
    setMarksObtained(0);
    setStudentRemarks("");
    setIsMarksModalOpen(true);
  };

  // Handle Add Student Mark
  const handleAddStudentMark = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedExamForMarks || !selectedStudentId) return;

    const studentObj = students.find((s) => s.id === selectedStudentId);
    const sName = studentObj ? studentObj.fullName : "Student Member";
    const sEmail = studentObj ? studentObj.email : "";
    const sSeat = studentObj?.seatNumber || "";
    const sCode = studentObj?.studentCode || `SDL-${selectedStudentId.slice(0, 4).toUpperCase()}`;

    const scoreNum = Number(marksObtained);
    const totalNum = selectedExamForMarks.totalMarks;
    const pct = Math.round((scoreNum / totalNum) * 1000) / 10;
    const isPass = scoreNum >= selectedExamForMarks.passingMarks;

    const newMark: StudentExamMark = {
      id: `mark-${Date.now()}`,
      examId: selectedExamForMarks.id,
      studentId: selectedStudentId,
      studentName: sName,
      studentEmail: sEmail,
      studentCode: sCode,
      seatNumber: sSeat,
      marksObtained: scoreNum,
      totalMarks: totalNum,
      percentage: pct,
      status: isPass ? "Pass" : "Fail",
      remarks: studentRemarks.trim() || (isPass ? "Good performance" : "Needs revision"),
      submittedAt: new Date().toISOString(),
    };

    saveStudentMark(newMark);
    const reloaded = getMarksForExam(selectedExamForMarks.id);
    setExamMarksList(reloaded);
    setSelectedStudentId("");
    setMarksObtained(0);
    setStudentRemarks("");
    showToast(`Marks for ${sName} saved successfully!`);
  };

  // Handle Delete Student Mark
  const handleDeleteMark = (markId: string) => {
    if (!selectedExamForMarks) return;
    deleteStudentMark(markId);
    const reloaded = getMarksForExam(selectedExamForMarks.id);
    setExamMarksList(reloaded);
    showToast("Student mark record removed.");
  };

  // Handle Open Answer Key Modal
  const handleOpenAnswerKeyModal = (exam: LibraryExam) => {
    setSelectedExamForAnswerKey(exam);
    setAnswerKeyUrl(exam.answerKeyUrl || "");
    setAnswerKeyText(exam.answerKeyText || "");
    setIsAnswerKeyModalOpen(true);
  };

  // Handle Save Answer Key
  const handleSaveAnswerKey = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedExamForAnswerKey) return;

    const updatedExam: LibraryExam = {
      ...selectedExamForAnswerKey,
      answerKeyUrl: answerKeyUrl.trim(),
      answerKeyText: answerKeyText.trim(),
    };

    const updated = saveLibraryExam(updatedExam);
    setExams(updated);
    setIsAnswerKeyModalOpen(false);
    showToast("Official Answer Key published to student portal!");

    createNotification({
      recipientRole: "student",
      title: "🔑 Official Answer Key Published",
      message: `The official answer key for ${updatedExam.title} is now available.`,
      type: "general",
      actionUrl: "/student/tasks",
    }).catch(console.error);
  };

  if (!mounted) return null;

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-2xl bg-[#0A2E5C] px-4 py-3 text-xs font-bold text-white shadow-xl border border-[#FFC107]/40 animate-slideUp">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-[#0A2E5C] dark:text-white flex items-center gap-2.5">
            <Award className="h-6 w-6 text-[#0B5ED7] dark:text-[#FFC107]" />
            Exam Results & Answer Keys Desk
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Conduct offline library tests, publish official answer keys, and manage student scorecards
          </p>
        </div>

        <button
          onClick={() => handleOpenExamModal()}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#0A2E5C] px-4 py-2.5 text-xs font-bold text-[#FFC107] hover:bg-[#141A24] transition-all shadow-md active:scale-95 cursor-pointer dark:bg-white dark:text-[#0A2E5C] dark:hover:bg-zinc-200"
        >
          <Plus className="h-4 w-4" />
          <span>Conduct New Exam</span>
        </button>
      </div>

      {/* 6 KPIs Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        {/* 1. Total Exam */}
        <div className="rounded-3xl border border-[#E5E7EB] bg-white p-4 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C]">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Total Exam</span>
            <div className="p-2 rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400">
              <FileText className="h-4 w-4" />
            </div>
          </div>
          <h3 className="text-xl sm:text-2xl font-black text-[#0A2E5C] dark:text-white mt-2">{totalExamsCount}</h3>
          <p className="text-[10px] text-zinc-400 mt-0.5">Conducted offline</p>
        </div>

        {/* 2. Next Exam */}
        <div className="rounded-3xl border border-[#E5E7EB] bg-white p-4 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C]">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Next Exam</span>
            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400">
              <Calendar className="h-4 w-4" />
            </div>
          </div>
          <h3 className="text-sm sm:text-base font-black text-indigo-600 dark:text-indigo-400 mt-2 truncate" title={nextExam?.title || "None Scheduled"}>
            {nextExam ? (nextExam.examDate || nextExam.title) : "None"}
          </h3>
          <p className="text-[10px] text-zinc-400 mt-0.5 truncate">{nextExam ? nextExam.title : "No upcoming test"}</p>
        </div>

        {/* 3. Answer Key Live */}
        <div className="rounded-3xl border border-[#E5E7EB] bg-white p-4 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C]">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Answer Key Live</span>
            <div className="p-2 rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400">
              <KeyRound className="h-4 w-4" />
            </div>
          </div>
          <h3 className="text-xl sm:text-2xl font-black text-amber-600 dark:text-amber-400 mt-2">{withAnswerKeyCount}</h3>
          <p className="text-[10px] text-zinc-400 mt-0.5">Keys published</p>
        </div>

        {/* 4. Result Published */}
        <div className="rounded-3xl border border-[#E5E7EB] bg-white p-4 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C]">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Result Published</span>
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <h3 className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-2">{publishedExamsCount}</h3>
          <p className="text-[10px] text-zinc-400 mt-0.5">Live on portal</p>
        </div>

        {/* 5. Enrolled Students */}
        <div className="rounded-3xl border border-[#E5E7EB] bg-white p-4 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C]">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Enrolled Students</span>
            <div className="p-2 rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-950/50 dark:text-purple-400">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <h3 className="text-xl sm:text-2xl font-black text-purple-600 dark:text-purple-400 mt-2">{enrolledStudentsCount || students.length}</h3>
          <p className="text-[10px] text-zinc-400 mt-0.5">Test candidates</p>
        </div>

        {/* 6. Topper */}
        <div className="rounded-3xl border border-[#E5E7EB] bg-white p-4 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C]">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Topper</span>
            <div className="p-2 rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400">
              <Trophy className="h-4 w-4" />
            </div>
          </div>
          <h3 className="text-sm sm:text-base font-black text-amber-600 dark:text-amber-400 mt-2 truncate" title={topperRecord?.studentName || "No Marks Yet"}>
            {topperRecord ? topperRecord.studentName.split(" ")[0] : "—"}
          </h3>
          <p className="text-[10px] text-zinc-400 mt-0.5 truncate">
            {topperRecord ? `${topperRecord.marksObtained}/${topperRecord.totalMarks} (${topperRecord.percentage}%)` : "No tests yet"}
          </p>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl bg-white p-3 shadow-xs border border-[#E5E7EB] dark:border-zinc-800 dark:bg-[#0A2E5C]">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search exams by title, category, or syllabus..."
            className="w-full pl-9 pr-4 py-2 text-xs rounded-xl bg-[#F4F1EA]/60 dark:bg-zinc-800/60 border border-[#E5E7EB]/70 dark:border-zinc-700 text-[#0A2E5C] dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#0B5ED7]/30"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          {["all", "General Studies", "BPSC / State PSC", "SSC / Railway"].map((cat) => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                filterCategory === cat
                  ? "bg-[#0A2E5C] text-[#FFC107] dark:bg-white dark:text-[#0A2E5C]"
                  : "bg-[#F8FAFC] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 hover:bg-zinc-200"
              }`}
            >
              {cat === "all" ? "All Categories" : cat}
            </button>
          ))}
        </div>
      </div>

      {/* Exams Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredExams.length === 0 ? (
          <div className="col-span-full rounded-3xl border border-dashed border-[#E5E7EB] p-12 text-center bg-white dark:border-zinc-800 dark:bg-[#0A2E5C]">
            <Award className="h-10 w-10 text-zinc-300 dark:text-zinc-600 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-[#0A2E5C] dark:text-white">No exams found</h3>
            <p className="text-xs text-zinc-400 mt-1">Click &quot;Conduct New Exam&quot; to schedule your first library mock test.</p>
          </div>
        ) : (
          filteredExams.map((exam) => {
            const marks = getMarksForExam(exam.id);
            const evaluatedCount = marks.length;
            const topScore = marks.length > 0 ? marks[0].marksObtained : 0;
            const hasKey = !!(exam.answerKeyUrl || exam.answerKeyText);

            return (
              <div
                key={exam.id}
                className="rounded-3xl border border-[#E5E7EB] bg-white p-5 shadow-xs transition-all hover:shadow-md dark:border-zinc-800 dark:bg-[#0A2E5C] flex flex-col justify-between space-y-4"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-[#F8FAFC] dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
                      {exam.category}
                    </span>
                    <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                      (exam.examDate || "") > todayStr
                        ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                        : exam.status === "Published"
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                          : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                    }`}>
                      {(exam.examDate || "") > todayStr 
                        ? "Upcoming (Scheduled)" 
                        : exam.status === "Published" 
                          ? "Conducted (Published)" 
                          : "Draft"}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-sm font-black text-[#0A2E5C] dark:text-white leading-snug">
                      {exam.title}
                    </h3>
                    <p className="text-[11px] text-zinc-400 flex items-center gap-1.5 mt-1">
                      <Calendar className="h-3 w-3" /> Exam Date: {exam.examDate} • {exam.durationMinutes} Mins
                    </p>
                  </div>

                  {exam.description && (
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-2">
                      {exam.description}
                    </p>
                  )}

                  {/* Summary Metric Strip */}
                  <div className="grid grid-cols-3 gap-2 p-2.5 rounded-2xl bg-[#F8FAFC]/70 dark:bg-zinc-800/70 text-center border border-zinc-200/50 dark:border-zinc-700/50">
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-400">Total Marks</p>
                      <p className="text-xs font-black text-[#0A2E5C] dark:text-white mt-0.5">{exam.totalMarks}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-400">Evaluated</p>
                      <p className="text-xs font-black text-blue-600 dark:text-blue-400 mt-0.5">{evaluatedCount} Students</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-400">Top Score</p>
                      <p className="text-xs font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
                        {topScore > 0 ? `${topScore}` : "--"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Actions Row */}
                <div className="space-y-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                  <div className="grid grid-cols-2 gap-2">
                    {/* Enter / Manage Marks Button */}
                    <button
                      onClick={() => handleOpenMarksModal(exam)}
                      className="flex items-center justify-center gap-1.5 rounded-xl bg-linear-to-r from-[#0B5ED7] to-[#FFC107] px-3 py-2 text-xs font-black text-[#0A2E5C] hover:opacity-95 transition shadow-xs cursor-pointer active:scale-95"
                    >
                      <Trophy className="h-3.5 w-3.5" />
                      <span>Enter Marks ({evaluatedCount})</span>
                    </button>

                    {/* Answer Key Button */}
                    <button
                      onClick={() => handleOpenAnswerKeyModal(exam)}
                      className={`flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition shadow-xs cursor-pointer active:scale-95 ${
                        hasKey
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"
                          : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200"
                      }`}
                    >
                      <KeyRound className="h-3.5 w-3.5" />
                      <span>{hasKey ? "Answer Key (Live)" : "Set Answer Key"}</span>
                    </button>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-1">
                    <button
                      onClick={() => handleOpenExamModal(exam)}
                      className="text-zinc-500 hover:text-zinc-900 dark:hover:text-white font-medium flex items-center gap-1 cursor-pointer"
                    >
                      <Edit3 className="h-3 w-3" /> Edit Info
                    </button>

                    <button
                      onClick={() => handleDeleteExam(exam.id)}
                      className="text-rose-500 hover:text-rose-700 font-medium flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="h-3 w-3" /> Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ========================================================================= */}
      {/* 1. CREATE / EDIT EXAM MODAL */}
      {/* ========================================================================= */}
      {isExamModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="w-full max-w-lg rounded-3xl border border-[#E5E7EB] bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-[#0A2E5C] space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
              <h2 className="text-base font-black text-[#0A2E5C] dark:text-white flex items-center gap-2">
                <Award className="h-5 w-5 text-[#0B5ED7] dark:text-[#FFC107]" />
                {editingExam ? "Edit Library Exam" : "Conduct New Library Exam"}
              </h2>
              <button 
                onClick={() => setIsExamModalOpen(false)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveExam} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-zinc-700 dark:text-zinc-300 mb-1">Exam Title / Test Name</label>
                <input
                  type="text"
                  required
                  value={examTitle}
                  onChange={(e) => setExamTitle(e.target.value)}
                  placeholder="e.g. Weekly All-India GS Mock Test #15"
                  className="w-full h-10 px-3 rounded-xl bg-[#F4F1EA]/60 dark:bg-zinc-800/60 border border-[#E5E7EB]/70 dark:border-zinc-700 text-[#0A2E5C] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0B5ED7]/30"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-zinc-700 dark:text-zinc-300 mb-1">Target Exam Category</label>
                  <select
                    value={examCategory}
                    onChange={(e) => setExamCategory(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl bg-[#F4F1EA]/60 dark:bg-zinc-800/60 border border-[#E5E7EB]/70 dark:border-zinc-700 text-[#0A2E5C] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0B5ED7]/30"
                  >
                    <option value="General Studies">General Studies</option>
                    <option value="BPSC / State PSC">BPSC / State PSC</option>
                    <option value="SSC / Railway">SSC / Railway</option>
                    <option value="UPSC Prelims">UPSC Prelims</option>
                    <option value="Banking & Finance">Banking & Finance</option>
                    <option value="General Mock Test">General Mock Test</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-zinc-700 dark:text-zinc-300 mb-1">Exam Date</label>
                  <input
                    type="date"
                    required
                    value={examDate}
                    onChange={(e) => setExamDate(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl bg-[#F4F1EA]/60 dark:bg-zinc-800/60 border border-[#E5E7EB]/70 dark:border-zinc-700 text-[#0A2E5C] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0B5ED7]/30"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-zinc-700 dark:text-zinc-300 mb-1">Duration (Mins)</label>
                  <input
                    type="number"
                    value={examDuration}
                    onChange={(e) => setExamDuration(e.target.value === "" ? "" : Number(e.target.value))}
                    className="w-full h-10 px-3 rounded-xl bg-[#F4F1EA]/60 dark:bg-zinc-800/60 border border-[#E5E7EB]/70 dark:border-zinc-700 text-[#0A2E5C] dark:text-white focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-zinc-700 dark:text-zinc-300 mb-1">Total Marks</label>
                  <input
                    type="number"
                    value={examTotalMarks}
                    onChange={(e) => setExamTotalMarks(e.target.value === "" ? "" : Number(e.target.value))}
                    className="w-full h-10 px-3 rounded-xl bg-[#F4F1EA]/60 dark:bg-zinc-800/60 border border-[#E5E7EB]/70 dark:border-zinc-700 text-[#0A2E5C] dark:text-white focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-zinc-700 dark:text-zinc-300 mb-1">Passing Marks</label>
                  <input
                    type="number"
                    value={examPassingMarks}
                    onChange={(e) => setExamPassingMarks(e.target.value === "" ? "" : Number(e.target.value))}
                    className="w-full h-10 px-3 rounded-xl bg-[#F4F1EA]/60 dark:bg-zinc-800/60 border border-[#E5E7EB]/70 dark:border-zinc-700 text-[#0A2E5C] dark:text-white focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-zinc-700 dark:text-zinc-300 mb-1">Results Publishing Status</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="status"
                      checked={examStatus === "Published"}
                      onChange={() => setExamStatus("Published")}
                    />
                    <span className="font-bold text-emerald-600">Published (Visible on student panel)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="status"
                      checked={examStatus === "Draft"}
                      onChange={() => setExamStatus("Draft")}
                    />
                    <span className="font-bold text-amber-600">Draft (Admin only)</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block font-bold text-zinc-700 dark:text-zinc-300 mb-1">Syllabus / Instructions</label>
                <textarea
                  rows={3}
                  value={examDescription}
                  onChange={(e) => setExamDescription(e.target.value)}
                  placeholder="Details about sections, negative marking, or exam hall guidelines..."
                  className="w-full p-3 rounded-xl bg-[#F4F1EA]/60 dark:bg-zinc-800/60 border border-[#E5E7EB]/70 dark:border-zinc-700 text-[#0A2E5C] dark:text-white focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsExamModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-[#0A2E5C] text-[#FFC107] font-black hover:bg-black dark:bg-white dark:text-[#0A2E5C] shadow-md"
                >
                  {editingExam ? "Save Changes" : "Create Exam"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. MANAGE STUDENT MARKS & RANKS MODAL */}
      {/* ========================================================================= */}
      {isMarksModalOpen && selectedExamForMarks && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="w-full max-w-3xl rounded-3xl border border-[#E5E7EB] bg-white p-5 sm:p-6 shadow-2xl dark:border-zinc-800 dark:bg-[#0A2E5C] flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
              <div>
                <h2 className="text-base font-black text-[#0A2E5C] dark:text-white flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-amber-500" />
                  Student Marks & Leaderboard Desk
                </h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {selectedExamForMarks.title} (Max: {selectedExamForMarks.totalMarks} Marks, Pass: {selectedExamForMarks.passingMarks})
                </p>
              </div>
              <button 
                onClick={() => setIsMarksModalOpen(false)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Quick Add Marks Form */}
            <form onSubmit={handleAddStudentMark} className="mt-4 p-4 rounded-2xl bg-[#F8FAFC]/80 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
              <div className="sm:col-span-2">
                <label className="block font-bold text-zinc-700 dark:text-zinc-300 mb-1">Select Student</label>
                <select
                  required
                  value={selectedStudentId}
                  onChange={(e) => setSelectedStudentId(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-[#0A2E5C] dark:text-white focus:outline-none"
                >
                  <option value="">-- Choose Student --</option>
                  {students.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.fullName} ({st.seatNumber ? `Seat ${st.seatNumber}` : "No Seat"}) - {st.phone}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                  Marks Obtained (/{selectedExamForMarks.totalMarks})
                </label>
                <input
                  type="number"
                  step="0.5"
                  required
                  min={0}
                  max={selectedExamForMarks.totalMarks}
                  value={marksObtained}
                  onChange={(e) => setMarksObtained(e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder="e.g. 78.5"
                  className="w-full h-9 px-3 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-[#0A2E5C] dark:text-white font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-zinc-700 dark:text-zinc-300 mb-1">Remarks / Note</label>
                <input
                  type="text"
                  value={studentRemarks}
                  onChange={(e) => setStudentRemarks(e.target.value)}
                  placeholder="e.g. Excellent in GS"
                  className="w-full h-9 px-3 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-[#0A2E5C] dark:text-white"
                />
              </div>

              <div className="sm:col-span-4 flex justify-end">
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0A2E5C] text-[#FFC107] font-black text-xs hover:bg-black dark:bg-white dark:text-[#0A2E5C] cursor-pointer shadow-xs active:scale-95"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Save Student Marks</span>
                </button>
              </div>
            </form>

            {/* Marks Table */}
            <div className="mt-4 flex-1 overflow-y-auto">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-[#0A2E5C] dark:text-white">
                  Evaluated Students ({examMarksList.length})
                </span>
                <span className="text-[10px] text-zinc-400">Ranks auto-computed by marks</span>
              </div>

              {examMarksList.length === 0 ? (
                <div className="py-8 text-center text-xs text-zinc-400 border border-dashed rounded-2xl border-zinc-300 dark:border-zinc-700">
                  No marks entered for this exam yet. Select a student above to input scores.
                </div>
              ) : (
                <div className="border border-zinc-200 dark:border-zinc-700 rounded-2xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#F8FAFC] dark:bg-zinc-800 text-[10px] uppercase font-bold text-zinc-500">
                      <tr>
                        <th className="p-2.5 text-center w-12">Rank</th>
                        <th className="p-2.5">Student</th>
                        <th className="p-2.5">Marks</th>
                        <th className="p-2.5">Percentage</th>
                        <th className="p-2.5">Status</th>
                        <th className="p-2.5">Remarks</th>
                        <th className="p-2.5 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                      {examMarksList.map((m) => (
                        <tr key={m.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                          <td className="p-2.5 text-center font-black">
                            <span className={`inline-flex items-center justify-center h-6 w-6 rounded-full text-[11px] ${
                              m.rank === 1 ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-extrabold" :
                              m.rank === 2 ? "bg-gray-200 text-gray-800 dark:bg-gray-800 dark:text-gray-200 font-bold" :
                              m.rank === 3 ? "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300 font-bold" :
                              "text-zinc-500"
                            }`}>
                              #{m.rank}
                            </span>
                          </td>
                          <td className="p-2.5 font-bold text-[#0A2E5C] dark:text-white">
                            <div>{m.studentName}</div>
                            <span className="text-[10px] text-zinc-400 font-normal">
                              {m.seatNumber ? `Seat ${m.seatNumber}` : m.studentCode}
                            </span>
                          </td>
                          <td className="p-2.5 font-black text-[#0A2E5C] dark:text-white">
                            {m.marksObtained} / {m.totalMarks}
                          </td>
                          <td className="p-2.5 font-bold text-zinc-600 dark:text-zinc-300">
                            {m.percentage}%
                          </td>
                          <td className="p-2.5">
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                              m.status === "Pass"
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                : "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                            }`}>
                              {m.status}
                            </span>
                          </td>
                          <td className="p-2.5 text-[11px] text-zinc-500 max-w-[140px] truncate">
                            {m.remarks || "--"}
                          </td>
                          <td className="p-2.5 text-right">
                            <button
                              onClick={() => handleDeleteMark(m.id)}
                              className="p-1 rounded-lg text-zinc-400 hover:text-rose-500 transition cursor-pointer"
                              title="Delete Marks"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800 flex justify-end">
              <button
                onClick={() => setIsMarksModalOpen(false)}
                className="px-5 py-2 rounded-xl bg-[#0A2E5C] text-[#FFC107] font-bold text-xs hover:bg-black dark:bg-white dark:text-[#0A2E5C]"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. SET ANSWER KEY MODAL */}
      {/* ========================================================================= */}
      {isAnswerKeyModalOpen && selectedExamForAnswerKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="w-full max-w-lg rounded-3xl border border-[#E5E7EB] bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-[#0A2E5C] space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
              <h2 className="text-base font-black text-[#0A2E5C] dark:text-white flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-amber-500" />
                Publish Official Answer Key
              </h2>
              <button 
                onClick={() => setIsAnswerKeyModalOpen(false)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveAnswerKey} className="space-y-4 text-xs">
              <div>
                <p className="font-bold text-[#0A2E5C] dark:text-white">{selectedExamForAnswerKey.title}</p>
                <p className="text-[11px] text-zinc-400">Date: {selectedExamForAnswerKey.examDate} • Category: {selectedExamForAnswerKey.category}</p>
              </div>

              <div>
                <label className="block font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                  Answer Key PDF / Cloud Drive Link (Optional)
                </label>
                <input
                  type="url"
                  value={answerKeyUrl}
                  onChange={(e) => setAnswerKeyUrl(e.target.value)}
                  placeholder="https://drive.google.com/file/... or PDF link"
                  className="w-full h-10 px-3 rounded-xl bg-[#F4F1EA]/60 dark:bg-zinc-800/60 border border-[#E5E7EB]/70 dark:border-zinc-700 text-[#0A2E5C] dark:text-white focus:outline-none"
                />
                <p className="text-[10px] text-zinc-400 mt-1">Students can view and download this solution PDF from their portal.</p>
              </div>

              <div>
                <label className="block font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                  Question-by-Question Answer Keys (e.g. 1-B, 2-C, 3-A, 4-D...)
                </label>
                <textarea
                  rows={4}
                  value={answerKeyText}
                  onChange={(e) => setAnswerKeyText(e.target.value)}
                  placeholder="1-B, 2-C, 3-A, 4-D, 5-B, 6-A, 7-C, 8-D, 9-A, 10-C..."
                  className="w-full p-3 font-mono rounded-xl bg-[#F4F1EA]/60 dark:bg-zinc-800/60 border border-[#E5E7EB]/70 dark:border-zinc-700 text-[#0A2E5C] dark:text-white focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsAnswerKeyModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-linear-to-r from-emerald-600 to-teal-600 text-white font-black hover:opacity-95 shadow-md active:scale-95"
                >
                  Publish Answer Key
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
