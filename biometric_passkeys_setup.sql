-- ══════════════════════════════════════════════════════════════
-- BIOMETRIC WEBAUTHN PASSKEYS SETUP FOR GENIUS LIBRARY
-- Make sure to select ALL lines below and Run in Supabase SQL Editor.
-- ══════════════════════════════════════════════════════════════

-- 1. Create table if it doesn't already exist
CREATE TABLE IF NOT EXISTS public.user_passkeys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL,
  counter BIGINT DEFAULT 0,
  device_name TEXT DEFAULT 'Unknown Device',
  user_email TEXT,
  user_role TEXT DEFAULT 'student',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);

-- 2. Ensure all columns exist even if the table was created earlier
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'user_passkeys' AND column_name = 'device_name'
  ) THEN
    ALTER TABLE public.user_passkeys ADD COLUMN device_name TEXT DEFAULT 'Unknown Device';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'user_passkeys' AND column_name = 'user_email'
  ) THEN
    ALTER TABLE public.user_passkeys ADD COLUMN user_email TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'user_passkeys' AND column_name = 'user_role'
  ) THEN
    ALTER TABLE public.user_passkeys ADD COLUMN user_role TEXT DEFAULT 'student';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'user_passkeys' AND column_name = 'counter'
  ) THEN
    ALTER TABLE public.user_passkeys ADD COLUMN counter BIGINT DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'user_passkeys' AND column_name = 'last_used_at'
  ) THEN
    ALTER TABLE public.user_passkeys ADD COLUMN last_used_at TIMESTAMPTZ;
  END IF;
END $$;

-- 3. Indexes for instant lookup
CREATE INDEX IF NOT EXISTS idx_user_passkeys_user_id ON public.user_passkeys(user_id);
CREATE INDEX IF NOT EXISTS idx_user_passkeys_credential_id ON public.user_passkeys(credential_id);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.user_passkeys ENABLE ROW LEVEL SECURITY;

-- 5. Drop existing policies before creating to prevent duplicate policy errors
DROP POLICY IF EXISTS "Users can view their own passkeys" ON public.user_passkeys;
DROP POLICY IF EXISTS "Users can insert their own passkeys" ON public.user_passkeys;
DROP POLICY IF EXISTS "Users can update their own passkeys" ON public.user_passkeys;
DROP POLICY IF EXISTS "Users can delete their own passkeys" ON public.user_passkeys;
DROP POLICY IF EXISTS "Allow lookup by credential_id for login" ON public.user_passkeys;

-- 6. Create RLS Policies
CREATE POLICY "Users can view their own passkeys"
  ON public.user_passkeys
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own passkeys"
  ON public.user_passkeys
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own passkeys"
  ON public.user_passkeys
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own passkeys"
  ON public.user_passkeys
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Allow lookup by credential_id for login"
  ON public.user_passkeys
  FOR SELECT
  TO anon
  USING (true);
