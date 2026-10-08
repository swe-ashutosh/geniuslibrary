-- =================================================================
-- Genius Library — Production Security Fixes Migration
-- Apply this in your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/lzwcadfubtcfqvwigdnd/sql
-- =================================================================

-- 1. Helper function: is_staff_or_admin
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

-- 2. Harden public.seats RLS
-- Anyone can view seats (needed for seat availability matrix on landing/login)
DROP POLICY IF EXISTS "Allow reading seats" ON public.seats;
CREATE POLICY "Allow reading seats" 
ON public.seats FOR SELECT 
TO authenticated, anon 
USING (true);

-- Only authenticated staff or administrators can modify seats (allocate, vacate, update)
DROP POLICY IF EXISTS "Allow updating seats" ON public.seats;
DROP POLICY IF EXISTS "Staff and Admin seat management" ON public.seats;
CREATE POLICY "Staff and Admin seat management" 
ON public.seats FOR ALL 
TO authenticated 
USING (public.is_staff_or_admin()) 
WITH CHECK (public.is_staff_or_admin());

-- 3. Harden public.profiles RLS
-- Profile creation is handled safely by the handle_new_user() SECURITY DEFINER trigger.
-- Remove anon direct insertion access.
DROP POLICY IF EXISTS "Allow profile insert" ON public.profiles;
CREATE POLICY "Allow profile insert"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id OR public.is_admin());

-- 4. Harden storage.objects RLS (avatars bucket)
-- Avatars can be viewed publicly
DROP POLICY IF EXISTS "Public Avatar Access" ON storage.objects;
CREATE POLICY "Public Avatar Access" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'avatars');

-- Only authenticated users can upload avatar files
DROP POLICY IF EXISTS "Allow Avatar Uploads" ON storage.objects;
CREATE POLICY "Allow Avatar Uploads" 
ON storage.objects FOR INSERT 
TO authenticated
WITH CHECK (bucket_id = 'avatars' AND auth.uid() IS NOT NULL);

-- Only authenticated users can update avatars
DROP POLICY IF EXISTS "Allow Avatar Updates" ON storage.objects;
CREATE POLICY "Allow Avatar Updates" 
ON storage.objects FOR UPDATE 
TO authenticated
USING (bucket_id = 'avatars' AND auth.uid() IS NOT NULL);

-- Only owner or admin can delete avatar files
DROP POLICY IF EXISTS "Allow Avatar Deletes" ON storage.objects;
CREATE POLICY "Allow Avatar Deletes" 
ON storage.objects FOR DELETE 
TO authenticated
USING (bucket_id = 'avatars' AND (auth.uid() IS NOT NULL));
