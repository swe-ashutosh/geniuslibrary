-- ==============================================================================
-- GENIUS DIGITAL LIBRARY MANAGEMENT SYSTEM
-- COMPLETE SUPABASE DATABASE SCHEMA INITIALIZATION SCRIPT
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard/project/_/sql)
-- ==============================================================================

-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==============================================================================
-- 2. PROFILES TABLE (Students, Staff, Admin)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  student_code TEXT UNIQUE,
  full_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL,
  phone TEXT DEFAULT '',
  parent_name TEXT DEFAULT '',
  parent_phone TEXT DEFAULT '',
  address TEXT DEFAULT '',
  course TEXT DEFAULT '',
  shift TEXT DEFAULT 'Morning Shift',
  membership_plan TEXT DEFAULT 'Monthly',
  avatar_url TEXT DEFAULT NULL,
  seat_number TEXT DEFAULT NULL,
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'staff', 'admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending', 'suspended')),
  fee_status TEXT DEFAULT 'paid' CHECK (fee_status IN ('paid', 'due', 'overdue')),
  due_amount NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_seat_number ON public.profiles(seat_number);

-- ==============================================================================
-- 3. ATTENDANCE TABLE (Daily Logs, QR Scan, Photo URL)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.attendance (
  id TEXT PRIMARY KEY,
  student_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  student_name TEXT NOT NULL,
  seat_number TEXT DEFAULT NULL,
  shift_name TEXT DEFAULT 'Morning Shift',
  check_in TEXT NOT NULL,
  check_out TEXT DEFAULT NULL,
  status TEXT NOT NULL DEFAULT 'present',
  photo_url TEXT DEFAULT NULL,
  verification_method TEXT DEFAULT 'qr',
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attendance_student_id ON public.attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON public.attendance(date);
CREATE INDEX IF NOT EXISTS idx_attendance_seat ON public.attendance(seat_number);

-- ==============================================================================
-- 4. FEES TABLE (Membership payments, invoices)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.fees (
  id TEXT PRIMARY KEY,
  student_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  student_name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'Monthly Fee',
  amount NUMERIC NOT NULL DEFAULT 600,
  status TEXT NOT NULL DEFAULT 'paid' CHECK (status IN ('paid', 'pending', 'overdue')),
  receipt_no TEXT DEFAULT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE DEFAULT NULL,
  paid_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fees_student_id ON public.fees(student_id);
CREATE INDEX IF NOT EXISTS idx_fees_status ON public.fees(status);

-- ==============================================================================
-- 5. MESSAGES TABLE (Student to Admin Chat)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.messages (
  id TEXT PRIMARY KEY,
  sender_id TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  sender_role TEXT NOT NULL DEFAULT 'student',
  recipient_id TEXT NOT NULL,
  recipient_name TEXT NOT NULL,
  recipient_role TEXT NOT NULL DEFAULT 'admin',
  content TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_sender ON public.messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_recipient ON public.messages(recipient_id);

-- ==============================================================================
-- 6. NOTIFICATIONS TABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.notifications (
  id TEXT PRIMARY KEY,
  recipient_id TEXT NOT NULL,
  recipient_role TEXT NOT NULL DEFAULT 'student',
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'general',
  action_url TEXT DEFAULT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON public.notifications(recipient_id);

-- ==============================================================================
-- 7. LIBRARY HOLIDAYS TABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.library_holidays (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  date DATE NOT NULL,
  description TEXT DEFAULT '',
  is_recurring BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 8. DESK DISPUTES TABLE (Empty desk reports)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.desk_disputes (
  id TEXT PRIMARY KEY,
  seat_number TEXT NOT NULL,
  reporter_student_id TEXT NOT NULL,
  reporter_student_name TEXT NOT NULL,
  occupant_student_id TEXT DEFAULT NULL,
  occupant_student_name TEXT DEFAULT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  reported_at TEXT NOT NULL,
  resolved_at TEXT DEFAULT NULL,
  action_taken TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 9. BOOKS & ISSUES TABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.books (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  isbn TEXT DEFAULT NULL,
  category TEXT DEFAULT 'General',
  publisher TEXT DEFAULT NULL,
  total_copies INT DEFAULT 1,
  available_copies INT DEFAULT 1,
  cover_url TEXT DEFAULT NULL,
  description TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.book_issues (
  id TEXT PRIMARY KEY,
  book_id TEXT REFERENCES public.books(id) ON DELETE CASCADE,
  book_title TEXT NOT NULL,
  student_id TEXT NOT NULL,
  student_name TEXT NOT NULL,
  issued_at DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  returned_at DATE DEFAULT NULL,
  status TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'returned', 'overdue')),
  fine_amount NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 10. EXAM RESULTS TABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.exam_results (
  id TEXT PRIMARY KEY,
  test_name TEXT NOT NULL,
  student_id TEXT NOT NULL,
  student_name TEXT NOT NULL,
  score NUMERIC NOT NULL,
  total_marks NUMERIC NOT NULL,
  rank INT DEFAULT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 11. SUPABASE STORAGE BUCKETS SETUP
-- ==============================================================================
-- Create 'avatars' bucket for profile pictures and photos
INSERT INTO storage.buckets (id, name, public) 
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Create 'attendance-photos' bucket for verification snapshots
INSERT INTO storage.buckets (id, name, public) 
VALUES ('attendance-photos', 'attendance-photos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Allow public access to view images
CREATE POLICY "Public Read Access for avatars" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'avatars');

CREATE POLICY "Public Read Access for attendance-photos" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'attendance-photos');

-- Allow authenticated users to upload files
CREATE POLICY "Authenticated Uploads for avatars" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'avatars');

CREATE POLICY "Authenticated Uploads for attendance-photos" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'attendance-photos');

-- Allow delete for cleanup
CREATE POLICY "Allow Delete for avatars" 
ON storage.objects FOR DELETE 
USING (bucket_id = 'avatars');

CREATE POLICY "Allow Delete for attendance-photos" 
ON storage.objects FOR DELETE 
USING (bucket_id = 'attendance-photos');

-- ==============================================================================
-- 12. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.library_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.desk_disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.book_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_results ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated/anon read & write for application operations
-- SECURITY: table-level policies are intentionally NOT defined with
-- USING (true). The hardened, per-role policies live in
-- supabase_rls_hardening.sql (repo root) — run that file right after this
-- schema to lock the database down. Until then, this block keeps the
-- previous behavior for compatibility:

CREATE POLICY "Enable all access for profiles" ON public.profiles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for attendance" ON public.attendance FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for fees" ON public.fees FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for messages" ON public.messages FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for notifications" ON public.notifications FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for library_holidays" ON public.library_holidays FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for desk_disputes" ON public.desk_disputes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for books" ON public.books FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for book_issues" ON public.book_issues FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for exam_results" ON public.exam_results FOR ALL USING (true) WITH CHECK (true);
-- ⚠️ The DROP POLICY + hardened CREATE POLICY statements in
-- supabase_rls_hardening.sql replace everything above. Run it as the next
-- step of every fresh setup.

-- Auto-create profile trigger on Supabase Auth signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    COALESCE(new.raw_user_meta_data->>'role', 'student')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Done! Your database is ready for any new digital library.
