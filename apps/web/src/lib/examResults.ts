/**
 * [WEB • LIB] Library Exams & Results
 *
 * Library Exams & Results Management System
 * Genius Library Madhupur
 * 
 * Provides:
 * 1. Admin Exam Creation & Schedule (Mock tests, Weekly tests, Competitive exam series)
 * 2. Answer Key Publishing (PDF link, question-by-question keys, solutions)
 * 3. Student Marks & Rank Management (Auto-ranks, pass/fail thresholds, remarks)
 * 4. Student Scorecard & Result Ingestion for Student Activity Panel
 * 5. Full Real-Time Sync via Supabase Single Source of Truth
 */

import { createClient } from "@/lib/supabase/client";
import { BRAND_CONFIG } from "@/lib/config";

export interface LibraryExam {
  id: string;
  title: string;
  category: string; // e.g., "BPSC / State PSC", "UPSC Prelims", "SSC / Railway", "General Studies", "Banking"
  examDate: string; // e.g. "2026-09-20" or "Sep 20, 2026"
  durationMinutes: number;
  totalMarks: number;
  passingMarks: number;
  status: "Draft" | "Published";
  answerKeyUrl?: string; // Direct PDF/Cloud link
  answerKeyText?: string; // Quick question answers, e.g. "1-A, 2-C, 3-B, 4-D..."
  description?: string;
  createdAt: string;
}

export interface StudentExamMark {
  id: string;
  examId: string;
  examTitle?: string;
  studentId: string;
  studentName: string;
  studentCode?: string;
  studentEmail?: string;
  seatNumber?: string;
  marksObtained: number;
  totalMarks: number;
  percentage: number;
  rank?: number;
  status: "Pass" | "Fail";
  remarks?: string;
  submittedAt?: string;
}

export interface StudentExamResultItem {
  exam: LibraryExam;
  mark?: StudentExamMark;
  rank?: number;
  totalAppeared: number;
}

const EXAMS_STORAGE_KEY = "genius_library_exams_data";
const MARKS_STORAGE_KEY = "genius_library_marks_data";

export const DEFAULT_LIBRARY_EXAMS: LibraryExam[] = [];
export const DEFAULT_STUDENT_MARKS: StudentExamMark[] = [];

/**
 * Sync exams and marks from Supabase
 * Single source of truth across all devices
 */
export async function syncExamsAndMarksFromSupabase(): Promise<{
  exams: LibraryExam[];
  marks: StudentExamMark[];
}> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .in("student_id", ["SYSTEM_EXAM", "SYSTEM_EXAM_MARK"]);

    if (!error && Array.isArray(data)) {
      const fetchedExams: LibraryExam[] = [];
      const fetchedMarks: StudentExamMark[] = [];

      data.forEach((row: any) => {
        try {
          const parsed = typeof row.message === "string" ? JSON.parse(row.message) : row.message;
          if (row.student_id === "SYSTEM_EXAM" && parsed && parsed.id) {
            fetchedExams.push(parsed);
          } else if (row.student_id === "SYSTEM_EXAM_MARK" && parsed && parsed.id) {
            fetchedMarks.push(parsed);
          }
        } catch (e) {
          console.warn("Failed to parse synced exam message:", e);
        }
      });

      // Merge with any existing local data (preferring server data)
      const currentExams = getLibraryExams();
      const examMap = new Map<string, LibraryExam>();
      currentExams.forEach((e) => examMap.set(e.id, e));
      fetchedExams.forEach((e) => examMap.set(e.id, e));
      const mergedExams = Array.from(examMap.values());

      const currentMarks = getAllExamMarks();
      const markMap = new Map<string, StudentExamMark>();
      currentMarks.forEach((m) => markMap.set(m.id, m));
      fetchedMarks.forEach((m) => markMap.set(m.id, m));
      const mergedMarks = Array.from(markMap.values());

      if (typeof window !== "undefined") {
        localStorage.setItem(EXAMS_STORAGE_KEY, JSON.stringify(mergedExams));
        localStorage.setItem(MARKS_STORAGE_KEY, JSON.stringify(mergedMarks));
      }

      return { exams: mergedExams, marks: mergedMarks };
    }
  } catch (err) {
    console.warn("Error syncing exams from Supabase:", err);
  }

  return { exams: getLibraryExams(), marks: getAllExamMarks() };
}

/**
 * Get all library exams (from local cache)
 */
export function getLibraryExams(): LibraryExam[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(EXAMS_STORAGE_KEY);
    if (!raw) return [];
    const parsed: LibraryExam[] = JSON.parse(raw);
    const filtered = (parsed || []).filter((e) => !e.id?.startsWith("exam-0"));
    if (filtered.length !== (parsed || []).length) {
      localStorage.setItem(EXAMS_STORAGE_KEY, JSON.stringify(filtered));
    }
    return filtered;
  } catch {
    return [];
  }
}

/**
 * Save or update an exam (persists locally and to Supabase)
 */
export function saveLibraryExam(exam: LibraryExam): LibraryExam[] {
  const current = getLibraryExams();
  const existingIdx = current.findIndex((e) => e.id === exam.id);
  let updated: LibraryExam[];

  if (existingIdx !== -1) {
    updated = [...current];
    updated[existingIdx] = exam;
  } else {
    updated = [exam, ...current];
  }

  try {
    localStorage.setItem(EXAMS_STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn("Failed to persist exam locally:", err);
  }

  // Push to Supabase asynchronously
  try {
    const supabase = createClient();
    supabase
      .from("messages")
      .upsert({
        id: `exam_${exam.id}`,
        student_id: "SYSTEM_EXAM",
        student_name: exam.title,
        student_email: BRAND_CONFIG.adminEmail || BRAND_CONFIG.email,
        sender_role: "admin",
        sender_name: "Library Admin",
        message: JSON.stringify(exam),
        recipient_role: "all",
        is_read: true,
      })
      .then(
        ({ error }) => {
          if (error) console.warn("Failed to sync exam to Supabase:", error.message);
        },
        (err) => console.error("Failed to sync exam to Supabase:", err)
      );
  } catch (e) {
    console.warn("Supabase client unavailable for exam sync:", e);
  }

  return updated;
}

/**
 * Delete an exam and its associated marks (locally and from Supabase)
 */
export function deleteLibraryExam(examId: string): LibraryExam[] {
  const current = getLibraryExams();
  const updated = current.filter((e) => e.id !== examId);
  try {
    localStorage.setItem(EXAMS_STORAGE_KEY, JSON.stringify(updated));
    const allMarks = getAllExamMarks().filter((m) => m.examId !== examId);
    localStorage.setItem(MARKS_STORAGE_KEY, JSON.stringify(allMarks));
  } catch {}

  // Delete from Supabase
  try {
    const supabase = createClient();
    supabase
      .from("messages")
      .delete()
      .then(
        () => {},
        (err) => console.error("Failed to delete exam from Supabase:", err)
      );
  } catch (e) {
    console.warn("Failed to delete exam from Supabase:", e);
  }

  return updated;
}

/**
 * Get all marks
 */
export function getAllExamMarks(): StudentExamMark[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(MARKS_STORAGE_KEY);
    if (!raw) return [];
    const parsed: StudentExamMark[] = JSON.parse(raw);
    const filtered = (parsed || []).filter(
      (m) => !m.id?.startsWith("mark-0") && !m.studentId?.startsWith("student-sample")
    );
    if (filtered.length !== (parsed || []).length) {
      localStorage.setItem(MARKS_STORAGE_KEY, JSON.stringify(filtered));
    }
    return filtered;
  } catch {
    return [];
  }
}

/**
 * Get marks for a specific exam with auto-sorted ranks
 */
export function getMarksForExam(examId: string): StudentExamMark[] {
  const allMarks = getAllExamMarks();
  const examMarks = allMarks.filter((m) => m.examId === examId);

  // Sort descending by marks obtained to compute real ranks
  examMarks.sort((a, b) => b.marksObtained - a.marksObtained);
  examMarks.forEach((m, idx) => {
    m.rank = idx + 1;
  });

  return examMarks;
}

/**
 * Save or update a single student mark, recalculating ranks
 * (persists locally and to Supabase)
 */
export function saveStudentMark(mark: StudentExamMark): StudentExamMark[] {
  const allMarks = getAllExamMarks();
  const existingIdx = allMarks.findIndex(
    (m) => m.examId === mark.examId && (m.id === mark.id || (m.studentId && m.studentId === mark.studentId) || (m.studentEmail && m.studentEmail === mark.studentEmail))
  );

  let updated: StudentExamMark[];
  if (existingIdx !== -1) {
    updated = [...allMarks];
    updated[existingIdx] = { ...updated[existingIdx], ...mark };
  } else {
    updated = [mark, ...allMarks];
  }

  // Recalculate ranks for this exam
  const forThisExam = updated.filter((m) => m.examId === mark.examId);
  forThisExam.sort((a, b) => b.marksObtained - a.marksObtained);
  forThisExam.forEach((m, idx) => {
    m.rank = idx + 1;
  });

  try {
    localStorage.setItem(MARKS_STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn("Failed to persist mark:", err);
  }

  // Push to Supabase asynchronously
  try {
    const supabase = createClient();
    supabase
      .from("messages")
      .upsert({
        id: `mark_${mark.id}`,
        student_id: "SYSTEM_EXAM_MARK",
        student_name: mark.studentName || "Student",
        student_email: mark.studentEmail || "",
        sender_role: "admin",
        sender_name: "Library Admin",
        message: JSON.stringify(mark),
        recipient_role: "all",
        is_read: true,
      })
      .then(
        ({ error }) => {
          if (error) console.warn("Failed to sync mark to Supabase:", error.message);
        },
        (err) => console.error("Failed to sync mark to Supabase:", err)
      );
  } catch (e) {
    console.warn("Supabase client unavailable for mark sync:", e);
  }

  return updated;
}

/**
 * Delete a student mark record (locally and from Supabase)
 */
export function deleteStudentMark(markId: string): StudentExamMark[] {
  const allMarks = getAllExamMarks();
  const updated = allMarks.filter((m) => m.id !== markId);
  try {
    localStorage.setItem(MARKS_STORAGE_KEY, JSON.stringify(updated));
  } catch {}

  try {
    const supabase = createClient();
    supabase
      .from("messages")
      .delete()
      .then(
        () => {},
        (err) => console.error("Failed to delete mark from Supabase:", err)
      );
  } catch (e) {
    console.warn("Failed to delete mark from Supabase:", e);
  }

  return updated;
}

/**
 * Get all exam results for a specific student, matched by ID, email, or studentCode
 * (synchronous from cache)
 */
export function getResultsForStudent(criteria: string | {
  id?: string;
  email?: string;
  studentCode?: string;
  fullName?: string;
}): StudentExamResultItem[] {
  const exams = getLibraryExams();

  const cObj = typeof criteria === "string" 
    ? { id: criteria, email: criteria, studentCode: criteria, fullName: criteria }
    : (criteria || {});

  const cEmail = cObj.email?.toLowerCase().trim();
  const cId = cObj.id?.toLowerCase().trim();
  const cCode = cObj.studentCode?.toLowerCase().trim();
  const cName = cObj.fullName?.toLowerCase().trim();

  return exams
    .filter((e) => e.status === "Published" || e.status === "Draft")
    .map((exam) => {
      const examMarks = getMarksForExam(exam.id);
      const totalAppeared = examMarks.length;

      // Find mark belonging to this student
      const rawMark = examMarks.find((m) => {
        if (cEmail && m.studentEmail && m.studentEmail.toLowerCase().trim() === cEmail) return true;
        if (cId && m.studentId && m.studentId.toLowerCase().trim() === cId) return true;
        if (cCode && m.studentCode && m.studentCode.toLowerCase().trim() === cCode) return true;
        if (cName && m.studentName && m.studentName.toLowerCase().trim() === cName) return true;
        return false;
      });

      const mark = rawMark ? { ...rawMark, examTitle: exam.title } : undefined;

      return {
        exam,
        mark,
        rank: mark?.rank,
        totalAppeared: Math.max(totalAppeared, 1),
      };
    });
}

/**
 * Fetch and sync all exam results for a specific student directly from Supabase
 * (asynchronous real-time version for student dashboard & portal)
 */
export async function fetchResultsForStudent(criteria: string | {
  id?: string;
  email?: string;
  studentCode?: string;
  fullName?: string;
}): Promise<StudentExamResultItem[]> {
  await syncExamsAndMarksFromSupabase();
  return getResultsForStudent(criteria);
}
