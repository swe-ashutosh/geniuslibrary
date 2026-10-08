-- =================================================================
-- Genius Library — Complete Supabase Database Schema
-- Run this in your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/assporfoexjigcpvmkdv/sql
-- =================================================================

-- 1. Create Tables First
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  student_code TEXT,
  member_id TEXT,
  full_name TEXT,
  email TEXT UNIQUE,
  phone TEXT,
  parent_name TEXT,
  parent_phone TEXT,
  address TEXT,
  course TEXT DEFAULT 'General',
  shift TEXT DEFAULT 'Morning Shift',
  membership_plan TEXT DEFAULT 'General',
  seat_number TEXT,
  fee_status TEXT DEFAULT 'Due',
  due_amount NUMERIC DEFAULT 0,
  role TEXT DEFAULT 'student' CHECK (role IN ('admin', 'staff', 'student')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('active', 'pending', 'suspended')),
  avatar_url TEXT,
  fcm_token TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.staff_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL DEFAULT '',
  address TEXT DEFAULT '',
  aadhar_number TEXT DEFAULT '',
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'prime_staff',
  category TEXT NOT NULL DEFAULT 'Prime Staff',
  shift_assigned TEXT NOT NULL DEFAULT 'Morning Shift',
  status TEXT NOT NULL DEFAULT 'active',
  last_login TEXT DEFAULT 'Never',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.attendance (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  student_name TEXT NOT NULL,
  date TEXT NOT NULL,
  check_in TEXT NOT NULL,
  check_out TEXT,
  status TEXT DEFAULT 'present',
  seat_number TEXT,
  shift_name TEXT,
  photo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fees (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  student_name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'Monthly Seat Fee',
  amount NUMERIC NOT NULL,
  paid BOOLEAN NOT NULL DEFAULT false,
  paid_at TIMESTAMPTZ,
  due_date TEXT,
  description TEXT,
  receipt_no TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.messages (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  student_name TEXT NOT NULL,
  student_email TEXT,
  sender_role TEXT NOT NULL DEFAULT 'student',
  sender_name TEXT NOT NULL,
  message TEXT NOT NULL,
  recipient_role TEXT DEFAULT 'all',
  recipient_name TEXT,
  recipient_id TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.seats (
  id TEXT PRIMARY KEY,
  seat_number TEXT NOT NULL UNIQUE,
  zone TEXT NOT NULL DEFAULT 'General',
  shift_id TEXT,
  is_available BOOLEAN NOT NULL DEFAULT true,
  current_student_id TEXT,
  current_student_name TEXT,
  occupied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Helper Functions
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.is_staff_or_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'staff')
  ) OR EXISTS (
    SELECT 1 FROM public.staff_profiles
    WHERE id = auth.uid() AND status = 'active'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_profiles ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies
DROP POLICY IF EXISTS "Allow reading profiles" ON public.profiles;
CREATE POLICY "Allow reading profiles" ON public.profiles FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS "Allow updating profiles" ON public.profiles;
CREATE POLICY "Allow updating profiles" ON public.profiles FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow attendance all" ON public.attendance;
CREATE POLICY "Allow attendance all" ON public.attendance FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow fees all" ON public.fees;
CREATE POLICY "Allow fees all" ON public.fees FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow messages all" ON public.messages;
CREATE POLICY "Allow messages all" ON public.messages FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow reading seats" ON public.seats;
CREATE POLICY "Allow reading seats" ON public.seats FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS "Allow updating seats" ON public.seats;
CREATE POLICY "Allow updating seats" ON public.seats FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow reading staff" ON public.staff_profiles;
CREATE POLICY "Allow reading staff" ON public.staff_profiles FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS "Allow updating staff" ON public.staff_profiles;
CREATE POLICY "Allow updating staff" ON public.staff_profiles FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

-- 5. Auto-Profile Trigger for Signups
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (
    id, full_name, email, phone, parent_name, parent_phone, address,
    course, shift, membership_plan, seat_number, role, status
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    COALESCE(NEW.raw_user_meta_data->>'parent_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'parent_phone', ''),
    COALESCE(NEW.raw_user_meta_data->>'address', ''),
    COALESCE(NEW.raw_user_meta_data->>'course', 'General'),
    COALESCE(NEW.raw_user_meta_data->>'shift', 'Morning Shift'),
    COALESCE(NEW.raw_user_meta_data->>'membership_plan', 'General'),
    NEW.raw_user_meta_data->>'seat_number',
    CASE WHEN NEW.email = 'geniuslibrary@gmail.com' THEN 'admin' ELSE 'student' END,
    CASE WHEN NEW.email = 'geniuslibrary@gmail.com' THEN 'active' ELSE 'pending' END
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
    updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 6. Storage Bucket for Student Profile Avatars
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public Avatar Access" ON storage.objects;
CREATE POLICY "Public Avatar Access" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Allow Avatar Uploads" ON storage.objects;
CREATE POLICY "Allow Avatar Uploads" ON storage.objects FOR ALL USING (bucket_id = 'avatars') WITH CHECK (bucket_id = 'avatars');

-- 7. Pre-populate 100 Library Study Seats (with ON CONFLICT safety)
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
