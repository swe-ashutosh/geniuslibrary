-- ==============================================================================
-- GENIUS LIBRARY - STUDENT DEMOGRAPHICS & SERVICE LIFECYCLE MIGRATION
-- Run this script in the Supabase SQL Editor:
-- https://supabase.com/dashboard/project/_/sql
-- ==============================================================================

-- 1. Add DOB, Gender, Join Date, Continue Date, and Service Pause columns to public.profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS dob TEXT DEFAULT NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS gender TEXT DEFAULT 'Male';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS join_date TEXT DEFAULT NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS continue_date TEXT DEFAULT NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_service_stopped BOOLEAN DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS service_stopped_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS service_stop_reason TEXT DEFAULT NULL;

-- 2. Backfill existing profiles join_date from created_at if join_date is null
UPDATE public.profiles 
SET join_date = TO_CHAR(created_at, 'YYYY-MM-DD')
WHERE join_date IS NULL;

-- 3. Create index for fast status and service state queries
CREATE INDEX IF NOT EXISTS idx_profiles_service_stopped ON public.profiles(is_service_stopped);
CREATE INDEX IF NOT EXISTS idx_profiles_continue_date ON public.profiles(continue_date);
