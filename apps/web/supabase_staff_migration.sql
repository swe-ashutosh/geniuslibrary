-- =================================================================
-- Staff Profiles Migration — Run in Supabase SQL Editor
-- https://supabase.com/dashboard/project/lzwcadfubtcfqvwigdnd/sql
-- =================================================================

-- 1. Create Staff Profiles Table
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

-- 2. Enable RLS
ALTER TABLE public.staff_profiles ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies
DROP POLICY IF EXISTS "Staff read" ON public.staff_profiles;
CREATE POLICY "Staff read" ON public.staff_profiles FOR SELECT
  TO authenticated USING (public.is_admin() OR auth.uid() = id);

DROP POLICY IF EXISTS "Staff insert" ON public.staff_profiles;
CREATE POLICY "Staff insert" ON public.staff_profiles FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Staff update" ON public.staff_profiles;
CREATE POLICY "Staff update" ON public.staff_profiles FOR UPDATE
  TO authenticated USING (public.is_admin() OR auth.uid() = id)
  WITH CHECK (public.is_admin() OR auth.uid() = id);

DROP POLICY IF EXISTS "Staff delete" ON public.staff_profiles;
CREATE POLICY "Staff delete" ON public.staff_profiles FOR DELETE
  TO authenticated USING (public.is_admin());
