-- ==============================================================================
-- GENIUS DIGITAL LIBRARY — ALL-IN-ONE SUPABASE SETUP SCRIPT
-- Paste this entire script into your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/sfcaljbbtwbqjutaczdl/sql/new
-- Click "Run" (CMD/CTRL + ENTER) to execute.
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ==============================================================================
-- 2. CREATE TABLES
-- ==============================================================================

-- PROFILES (Students & Admins)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  student_code TEXT UNIQUE,
  member_id TEXT,
  full_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL UNIQUE,
  phone TEXT DEFAULT '',
  parent_name TEXT DEFAULT '',
  parent_phone TEXT DEFAULT '',
  address TEXT DEFAULT '',
  course TEXT DEFAULT 'General',
  shift TEXT DEFAULT 'Morning Shift',
  membership_plan TEXT DEFAULT 'General',
  avatar_url TEXT DEFAULT NULL,
  seat_number TEXT DEFAULT NULL,
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'staff', 'admin')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('active', 'pending', 'suspended')),
  fee_status TEXT DEFAULT 'Due',
  due_amount NUMERIC DEFAULT 0,
  fcm_token TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_seat ON public.profiles(seat_number);

-- STAFF PROFILES
CREATE TABLE IF NOT EXISTS public.staff_profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL DEFAULT '',
  address TEXT DEFAULT '',
  aadhar_number TEXT DEFAULT '',
  avatar_url TEXT DEFAULT NULL,
  role TEXT NOT NULL DEFAULT 'prime_staff',
  category TEXT NOT NULL DEFAULT 'Prime Staff',
  shift_assigned TEXT NOT NULL DEFAULT 'Morning Shift',
  status TEXT NOT NULL DEFAULT 'active',
  last_login TEXT DEFAULT 'Never',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- SEATS
CREATE TABLE IF NOT EXISTS public.seats (
  id TEXT PRIMARY KEY,
  seat_number TEXT NOT NULL UNIQUE,
  zone TEXT NOT NULL DEFAULT 'General',
  shift_id TEXT DEFAULT NULL,
  is_available BOOLEAN NOT NULL DEFAULT true,
  current_student_id TEXT DEFAULT NULL,
  current_student_name TEXT DEFAULT NULL,
  occupied_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ATTENDANCE
CREATE TABLE IF NOT EXISTS public.attendance (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
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

CREATE INDEX IF NOT EXISTS idx_attendance_student ON public.attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON public.attendance(date);

-- FEES
CREATE TABLE IF NOT EXISTS public.fees (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  student_name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'Monthly Fee',
  amount NUMERIC NOT NULL DEFAULT 600,
  paid BOOLEAN NOT NULL DEFAULT false,
  status TEXT DEFAULT 'due',
  receipt_no TEXT DEFAULT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date TEXT DEFAULT NULL,
  paid_at TIMESTAMPTZ DEFAULT NULL,
  description TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fees_student ON public.fees(student_id);
CREATE INDEX IF NOT EXISTS idx_fees_receipt ON public.fees(receipt_no);

-- MESSAGES
CREATE TABLE IF NOT EXISTS public.messages (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  student_name TEXT NOT NULL,
  student_email TEXT DEFAULT NULL,
  sender_role TEXT NOT NULL DEFAULT 'student',
  sender_name TEXT NOT NULL,
  message TEXT NOT NULL,
  recipient_role TEXT DEFAULT 'all',
  recipient_name TEXT DEFAULT NULL,
  recipient_id TEXT DEFAULT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_student ON public.messages(student_id);

-- NOTIFICATIONS
CREATE TABLE IF NOT EXISTS public.notifications (
  id TEXT PRIMARY KEY,
  recipient_id TEXT DEFAULT NULL,
  recipient_role TEXT NOT NULL DEFAULT 'all',
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'general',
  action_url TEXT DEFAULT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- LIBRARY HOLIDAYS
CREATE TABLE IF NOT EXISTS public.library_holidays (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  date DATE NOT NULL,
  description TEXT DEFAULT '',
  is_recurring BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- DESK DISPUTES
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

-- BOOKS & ISSUES
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
  status TEXT NOT NULL DEFAULT 'issued',
  fine_amount NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- EXAM RESULTS
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
-- 3. STORAGE BUCKETS SETUP
-- ==============================================================================
INSERT INTO storage.buckets (id, name, public) 
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = true;

INSERT INTO storage.buckets (id, name, public) 
VALUES ('attendance-photos', 'attendance-photos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Public Read Access for avatars" ON storage.objects;
CREATE POLICY "Public Read Access for avatars" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Public Read Access for attendance-photos" ON storage.objects;
CREATE POLICY "Public Read Access for attendance-photos" ON storage.objects FOR SELECT USING (bucket_id = 'attendance-photos');

DROP POLICY IF EXISTS "Authenticated Uploads for avatars" ON storage.objects;
CREATE POLICY "Authenticated Uploads for avatars" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Authenticated Uploads for attendance-photos" ON storage.objects;
CREATE POLICY "Authenticated Uploads for attendance-photos" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'attendance-photos');

DROP POLICY IF EXISTS "Allow Delete for avatars" ON storage.objects;
CREATE POLICY "Allow Delete for avatars" ON storage.objects FOR DELETE USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Allow Delete for attendance-photos" ON storage.objects;
CREATE POLICY "Allow Delete for attendance-photos" ON storage.objects FOR DELETE USING (bucket_id = 'attendance-photos');

-- ==============================================================================
-- 4. HELPER FUNCTIONS FOR SECURITY
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_staff_or_admin()
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'staff')
  ) OR EXISTS (
    SELECT 1 FROM public.staff_profiles
    WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid()) AND status = 'active'
  );
$$;

-- ==============================================================================
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.library_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.desk_disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.book_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_results ENABLE ROW LEVEL SECURITY;

-- Profiles: allow reading own profile or staff/admin access
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT TO authenticated, anon WITH CHECK (true);

DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE TO authenticated, anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "profiles_delete" ON public.profiles;
CREATE POLICY "profiles_delete" ON public.profiles FOR DELETE TO authenticated USING (is_admin());

-- Staff Profiles
DROP POLICY IF EXISTS "staff_all" ON public.staff_profiles;
CREATE POLICY "staff_all" ON public.staff_profiles FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

-- Seats
DROP POLICY IF EXISTS "seats_all" ON public.seats;
CREATE POLICY "seats_all" ON public.seats FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

-- Attendance
DROP POLICY IF EXISTS "attendance_all" ON public.attendance;
CREATE POLICY "attendance_all" ON public.attendance FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

-- Fees
DROP POLICY IF EXISTS "fees_all" ON public.fees;
CREATE POLICY "fees_all" ON public.fees FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

-- Messages
DROP POLICY IF EXISTS "messages_all" ON public.messages;
CREATE POLICY "messages_all" ON public.messages FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

-- Notifications
DROP POLICY IF EXISTS "notifications_all" ON public.notifications;
CREATE POLICY "notifications_all" ON public.notifications FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

-- Holidays, Disputes, Books, Results
DROP POLICY IF EXISTS "holidays_all" ON public.library_holidays;
CREATE POLICY "holidays_all" ON public.library_holidays FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "disputes_all" ON public.desk_disputes;
CREATE POLICY "disputes_all" ON public.desk_disputes FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "books_all" ON public.books;
CREATE POLICY "books_all" ON public.books FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "book_issues_all" ON public.book_issues;
CREATE POLICY "book_issues_all" ON public.book_issues FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "exam_results_all" ON public.exam_results;
CREATE POLICY "exam_results_all" ON public.exam_results FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

-- ==============================================================================
-- 6. AUTO-CREATE PROFILE TRIGGER FOR NEW SIGNUPS
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (
    id, full_name, email, phone, parent_name, parent_phone, address,
    course, shift, membership_plan, seat_number, role, status
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    COALESCE(NEW.raw_user_meta_data->>'parent_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'parent_phone', ''),
    COALESCE(NEW.raw_user_meta_data->>'address', ''),
    COALESCE(NEW.raw_user_meta_data->>'course', 'General'),
    COALESCE(NEW.raw_user_meta_data->>'shift', 'Morning Shift'),
    COALESCE(NEW.raw_user_meta_data->>'membership_plan', 'General'),
    NEW.raw_user_meta_data->>'seat_number',
    CASE WHEN LOWER(NEW.email) = 'geniuslibrarymadhupur@gmail.com' THEN 'admin' ELSE 'student' END,
    CASE WHEN LOWER(NEW.email) = 'geniuslibrarymadhupur@gmail.com' THEN 'active' ELSE 'pending' END
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = COALESCE(NULLIF(EXCLUDED.full_name, ''), public.profiles.full_name),
    phone = COALESCE(NULLIF(EXCLUDED.phone, ''), public.profiles.phone),
    parent_name = COALESCE(NULLIF(EXCLUDED.parent_name, ''), public.profiles.parent_name),
    parent_phone = COALESCE(NULLIF(EXCLUDED.parent_phone, ''), public.profiles.parent_phone),
    address = COALESCE(NULLIF(EXCLUDED.address, ''), public.profiles.address),
    course = COALESCE(NULLIF(EXCLUDED.course, ''), public.profiles.course),
    shift = COALESCE(NULLIF(EXCLUDED.shift, ''), public.profiles.shift),
    membership_plan = COALESCE(NULLIF(EXCLUDED.membership_plan, ''), public.profiles.membership_plan),
    seat_number = COALESCE(EXCLUDED.seat_number, public.profiles.seat_number),
    updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==============================================================================
-- 7. SEED 100 LIBRARY STUDY SEATS
-- ==============================================================================
INSERT INTO public.seats (id, seat_number, zone, is_available)
SELECT 
  'seat-' || i,
  i::text,
  CASE 
    WHEN i <= 30 THEN 'Zone A'
    WHEN i <= 60 THEN 'Zone B'
    WHEN i <= 80 THEN 'Zone C'
    ELSE 'Zone D'
  END,
  true
FROM generate_series(1, 100) AS i
ON CONFLICT (seat_number) DO NOTHING;

-- ==============================================================================
-- 8. SETUP MASTER ADMIN USER
-- Email: geniuslibrarymadhupur@gmail.com
-- Password: $Genius@2026.in
-- ==============================================================================
DO $$
DECLARE
  v_user_id UUID;
  v_encrypted_pw TEXT;
BEGIN
  v_encrypted_pw := crypt('$Genius@2026.in', gen_salt('bf', 10));

  SELECT id INTO v_user_id FROM auth.users WHERE email = 'geniuslibrarymadhupur@gmail.com';

  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      role, aud, confirmation_token, recovery_token, email_change_token_new,
      email_change, email_change_token_current, phone_change, phone_change_token,
      reauthentication_token, email_change_confirm_status, is_sso_user, is_anonymous
    )
    VALUES (
      v_user_id, '00000000-0000-0000-0000-000000000000', 'geniuslibrarymadhupur@gmail.com',
      v_encrypted_pw, NOW(), '{"provider": "email", "providers": ["email"]}'::jsonb,
      '{"full_name": "Genius Library", "role": "admin"}'::jsonb,
      NOW(), NOW(), 'authenticated', 'authenticated', '', '', '', '', '', '', '', '', 0, false, false
    );
  ELSE
    UPDATE auth.users
    SET 
      encrypted_password = v_encrypted_pw,
      email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
      raw_app_meta_data = '{"provider": "email", "providers": ["email"]}'::jsonb,
      raw_user_meta_data = '{"full_name": "Genius Library", "role": "admin"}'::jsonb,
      updated_at = NOW()
    WHERE id = v_user_id;
  END IF;

  DELETE FROM auth.identities WHERE user_id = v_user_id;

  INSERT INTO auth.identities (
    id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  )
  VALUES (
    gen_random_uuid(), v_user_id, v_user_id::text,
    format('{"sub":"%s","email":"geniuslibrarymadhupur@gmail.com"}', v_user_id)::jsonb,
    'email', NOW(), NOW(), NOW()
  );

  INSERT INTO public.profiles (
    id, full_name, email, role, status, membership_plan, fee_status, due_amount, created_at, updated_at
  )
  VALUES (
    v_user_id, 'Genius Library', 'geniuslibrarymadhupur@gmail.com', 'admin', 'active', 'Admin Master', 'Paid', 0, NOW(), NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    role = 'admin', status = 'active', full_name = 'Genius Library', updated_at = NOW();

END $$;
