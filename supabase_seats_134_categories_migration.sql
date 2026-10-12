-- ==============================================================================
-- GENIUS LIBRARY MADHUPUR • SEAT MATRIX MIGRATION (134 DESKS)
-- 
-- Categories:
-- 1. Small Desks: 1 to 54 (54 desks)
-- 2. Medium Desks: 55 to 104 (50 desks)
-- 3. Large with Locker: 105 to 134 (30 desks, with secure lockers)
--
-- Flexible Desk Policy:
-- Unreserved / Flexible pass holders can occupy any available free desk.
-- ==============================================================================

-- 1. Ensure columns exist on public.seats
ALTER TABLE public.seats ADD COLUMN IF NOT EXISTS has_locker BOOLEAN DEFAULT false;
ALTER TABLE public.seats ADD COLUMN IF NOT EXISTS zone TEXT DEFAULT 'General';

-- 2. Seed / Upsert the 134 Library Desks with correct categories & locker flags
INSERT INTO public.seats (id, seat_number, zone, has_locker, is_available)
SELECT 
  'seat-' || i,
  LPAD(i::text, 2, '0'),
  CASE 
    WHEN i BETWEEN 1 AND 54 THEN 'Small'
    WHEN i BETWEEN 55 AND 104 THEN 'Medium'
    ELSE 'Large with Locker'
  END,
  CASE 
    WHEN i BETWEEN 105 AND 134 THEN true
    ELSE false
  END,
  true
FROM generate_series(1, 134) AS i
ON CONFLICT (seat_number) DO UPDATE SET
  zone = EXCLUDED.zone,
  has_locker = EXCLUDED.has_locker;

-- 3. Ensure RLS policies allow authenticated and anon users to select, insert, update, and delete seats
ALTER TABLE public.seats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "seats_read_all" ON public.seats;
CREATE POLICY "seats_read_all" ON public.seats 
  FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS "seats_admin_all" ON public.seats;
CREATE POLICY "seats_admin_all" ON public.seats 
  FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
