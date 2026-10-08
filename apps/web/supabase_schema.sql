-- =================================================================
-- Genius Library — Supabase Auth, Profiles & Storage
-- Run this in your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/lzwcadfubtcfqvwigdnd/sql
-- =================================================================

-- 1. Create Profiles Table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT UNIQUE,
  phone TEXT,
  parent_name TEXT,
  parent_phone TEXT,
  address TEXT,
  course TEXT,
  shift TEXT,
  membership_plan TEXT DEFAULT 'General',
  seat_number TEXT,
  fee_status TEXT DEFAULT 'Due',
  due_amount NUMERIC DEFAULT 0,
  role TEXT DEFAULT 'student' CHECK (role IN ('admin', 'staff', 'student')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('active', 'pending', 'suspended')),
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Ensure columns exist if table was already created
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS membership_plan TEXT DEFAULT 'General';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS seat_number TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS fee_status TEXT DEFAULT 'Due';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS due_amount NUMERIC DEFAULT 0;

-- 1b. Create Seats Table in Supabase (Mirrors D1 seat matrix)
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

ALTER TABLE public.seats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow reading seats" ON public.seats;
CREATE POLICY "Allow reading seats" ON public.seats FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS "Allow updating seats" ON public.seats;
DROP POLICY IF EXISTS "Staff and Admin seat management" ON public.seats;
CREATE POLICY "Staff and Admin seat management" 
ON public.seats FOR ALL 
TO authenticated 
USING (public.is_staff_or_admin()) 
WITH CHECK (public.is_staff_or_admin());


-- 2. Auto-Profile Trigger for Signups
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (
    id, 
    full_name, 
    email, 
    phone, 
    parent_name, 
    parent_phone, 
    address, 
    course, 
    shift, 
    membership_plan,
    seat_number,
    role,
    status
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    COALESCE(NEW.raw_user_meta_data->>'parent_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'parent_phone', ''),
    COALESCE(NEW.raw_user_meta_data->>'address', ''),
    COALESCE(NEW.raw_user_meta_data->>'course', ''),
    COALESCE(NEW.raw_user_meta_data->>'shift', 'morning'),
    COALESCE(NEW.raw_user_meta_data->>'membership_plan', 'General'),
    NEW.raw_user_meta_data->>'seat_number',
    -- SECURITY ENFORCEMENT: Only the master administrator email can ever receive 'admin' role
    -- All other registrations are strictly forced to 'student' and 'pending' status
    CASE 
      WHEN NEW.email = 'geniuslibrary@gmail.com' THEN 'admin'
      ELSE 'student'
    END,
    CASE 
      WHEN NEW.email = 'geniuslibrary@gmail.com' THEN 'active'
      ELSE 'pending'
    END
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    phone = EXCLUDED.phone,
    parent_name = EXCLUDED.parent_name,
    parent_phone = EXCLUDED.parent_phone,
    address = EXCLUDED.address,
    course = EXCLUDED.course,
    shift = EXCLUDED.shift,
    membership_plan = EXCLUDED.membership_plan,
    seat_number = COALESCE(EXCLUDED.seat_number, public.profiles.seat_number),
    -- Keep existing role and status safe against overwrite attacks
    role = public.profiles.role,
    status = public.profiles.status,
    updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger to prevent regular users from elevating their role or approving themselves
CREATE OR REPLACE FUNCTION public.protect_role_and_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT public.is_admin() THEN
    IF NEW.role <> OLD.role THEN
      RAISE EXCEPTION 'Security violation: Only administrators can modify user roles.';
    END IF;
    IF NEW.status <> OLD.status THEN
      RAISE EXCEPTION 'Security violation: Only administrators can modify approval status.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_protect_role_and_status ON public.profiles;
CREATE TRIGGER tr_protect_role_and_status
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_role_and_status();

-- 3. Row Level Security (RLS) Policies
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Helper function to check admin role safely without causing infinite policy recursion
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper function to check staff or admin role safely
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

-- Policy: Allow users to read their own profile, and admin/staff to read all profiles
DROP POLICY IF EXISTS "Allow reading profiles" ON public.profiles;
CREATE POLICY "Allow reading profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (
  auth.uid() = id OR public.is_admin() OR public.is_staff_or_admin()
);

-- Policy: Allow authenticated users to insert their own profile on signup
DROP POLICY IF EXISTS "Allow profile insert" ON public.profiles;
CREATE POLICY "Allow profile insert"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id OR public.is_admin());

-- Policy: Allow users to update their own profile, and admin to update all profiles (approve, assign seats, etc.)
DROP POLICY IF EXISTS "Allow profile update" ON public.profiles;
CREATE POLICY "Allow profile update"
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id OR public.is_admin())
WITH CHECK (auth.uid() = id OR public.is_admin());

-- Policy: Allow admins to delete profiles
DROP POLICY IF EXISTS "Allow profile delete" ON public.profiles;
CREATE POLICY "Allow profile delete"
ON public.profiles FOR DELETE
TO authenticated
USING (public.is_admin());

-- 4. Supabase Storage Bucket for Profile Pictures (Avatars)
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Storage RLS Policies (Allow public view and authenticated uploads for avatars)
DROP POLICY IF EXISTS "Public Avatar Access" ON storage.objects;
CREATE POLICY "Public Avatar Access" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Allow Avatar Uploads" ON storage.objects;
CREATE POLICY "Allow Avatar Uploads" 
ON storage.objects FOR INSERT 
TO authenticated
WITH CHECK (bucket_id = 'avatars' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Allow Avatar Updates" ON storage.objects;
CREATE POLICY "Allow Avatar Updates" 
ON storage.objects FOR UPDATE 
TO authenticated
USING (bucket_id = 'avatars' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Allow Avatar Deletes" ON storage.objects;
CREATE POLICY "Allow Avatar Deletes" 
ON storage.objects FOR DELETE 
TO authenticated
USING (bucket_id = 'avatars' AND (auth.uid() IS NOT NULL));

-- 5. Seed Admin Profile
INSERT INTO public.profiles (id, full_name, email, role, status)
SELECT id, 'Library Admin', email, 'admin', 'active'
FROM auth.users
WHERE email = 'geniuslibrary@gmail.com'
ON CONFLICT (id) DO UPDATE SET role = 'admin', status = 'active';

-- 6. Safe & Clean Deletion: When admin removes a student from profiles, also delete auth user and related records
CREATE OR REPLACE FUNCTION public.delete_student_user(target_user_id UUID)
RETURNS void AS $$
BEGIN
  -- Prevent accidental deletion of Admin
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = target_user_id AND email = 'geniuslibrary@gmail.com') THEN
    RAISE EXCEPTION 'Cannot delete primary admin account';
  END IF;

  -- 1. Delete from profiles
  DELETE FROM public.profiles WHERE id = target_user_id;

  -- 2. Delete from auth.users (removes credentials so unneeded data is safely purged)
  DELETE FROM auth.users WHERE id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: Whenever a profile is deleted, automatically remove the auth.user to keep Supabase clean
CREATE OR REPLACE FUNCTION public.handle_profile_deleted()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.email <> 'geniuslibrary@gmail.com' THEN
    DELETE FROM auth.users WHERE id = OLD.id;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_profile_deleted ON public.profiles;
CREATE TRIGGER on_profile_deleted
  AFTER DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_profile_deleted();

-- =================================================================
-- 7. Live Attendance Table in Supabase (Primary Live Store)
-- =================================================================
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
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow reading attendance" ON public.attendance;
CREATE POLICY "Allow reading attendance" 
ON public.attendance FOR SELECT 
TO authenticated 
USING (
  auth.uid()::text = student_id OR public.is_admin() OR public.is_staff_or_admin()
);

DROP POLICY IF EXISTS "Allow inserting attendance" ON public.attendance;
CREATE POLICY "Allow inserting attendance" 
ON public.attendance FOR INSERT 
TO authenticated 
WITH CHECK (
  auth.uid()::text = student_id OR public.is_admin() OR public.is_staff_or_admin()
);

DROP POLICY IF EXISTS "Allow updating attendance" ON public.attendance;
CREATE POLICY "Allow updating attendance" 
ON public.attendance FOR UPDATE 
TO authenticated 
USING (
  auth.uid()::text = student_id OR public.is_admin() OR public.is_staff_or_admin()
)
WITH CHECK (
  auth.uid()::text = student_id OR public.is_admin() OR public.is_staff_or_admin()
);

