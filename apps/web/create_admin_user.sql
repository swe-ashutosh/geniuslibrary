-- =================================================================
-- Genius Library — Setup & Repair Master Admin Account
-- Email: geniuslibrarymadhupur@gmail.com
-- Password: $Genius@2026.in
-- Run this in your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/sfcaljbbtwbqjutaczdl/sql/new
-- =================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Step 1: Repair any NULL token/string columns across auth.users that cause
-- "500 Database error querying schema" in Supabase GoTrue Auth service
UPDATE auth.users
SET 
  confirmation_token = COALESCE(confirmation_token, ''),
  recovery_token = COALESCE(recovery_token, ''),
  email_change_token_new = COALESCE(email_change_token_new, ''),
  email_change = COALESCE(email_change, ''),
  email_change_token_current = COALESCE(email_change_token_current, ''),
  phone_change = COALESCE(phone_change, ''),
  phone_change_token = COALESCE(phone_change_token, ''),
  reauthentication_token = COALESCE(reauthentication_token, ''),
  email_change_confirm_status = COALESCE(email_change_confirm_status, 0),
  is_sso_user = COALESCE(is_sso_user, false),
  is_anonymous = COALESCE(is_anonymous, false)
WHERE confirmation_token IS NULL 
   OR recovery_token IS NULL 
   OR email_change_token_new IS NULL 
   OR email_change IS NULL
   OR email_change_token_current IS NULL
   OR reauthentication_token IS NULL;

-- Step 2: Insert or fully update the master Admin user
DO $$
DECLARE
  v_user_id UUID;
  v_encrypted_pw TEXT;
BEGIN
  -- 1. Generate encrypted password hash for $Genius@2026.in
  v_encrypted_pw := crypt('$Genius@2026.in', gen_salt('bf', 10));

  -- 2. Check if user already exists in auth.users
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'geniuslibrarymadhupur@gmail.com';

  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      id,
      instance_id,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      role,
      aud,
      confirmation_token,
      recovery_token,
      email_change_token_new,
      email_change,
      email_change_token_current,
      phone_change,
      phone_change_token,
      reauthentication_token,
      email_change_confirm_status,
      is_sso_user,
      is_anonymous
    )
    VALUES (
      v_user_id,
      '00000000-0000-0000-0000-000000000000',
      'geniuslibrarymadhupur@gmail.com',
      v_encrypted_pw,
      now(),
      '{"provider": "email", "providers": ["email"]}'::jsonb,
      '{"full_name": "Genius Library", "role": "admin"}'::jsonb,
      now(),
      now(),
      'authenticated',
      'authenticated',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      0,
      false,
      false
    );
  ELSE
    -- If user already exists, update password, confirm email, and ensure all tokens are non-null empty strings
    UPDATE auth.users
    SET 
      encrypted_password = v_encrypted_pw,
      email_confirmed_at = COALESCE(email_confirmed_at, now()),
      raw_app_meta_data = '{"provider": "email", "providers": ["email"]}'::jsonb,
      raw_user_meta_data = '{"full_name": "Genius Library", "role": "admin"}'::jsonb,
      confirmation_token = COALESCE(confirmation_token, ''),
      recovery_token = COALESCE(recovery_token, ''),
      email_change_token_new = COALESCE(email_change_token_new, ''),
      email_change = COALESCE(email_change, ''),
      email_change_token_current = COALESCE(email_change_token_current, ''),
      phone_change = COALESCE(phone_change, ''),
      phone_change_token = COALESCE(phone_change_token, ''),
      reauthentication_token = COALESCE(reauthentication_token, ''),
      email_change_confirm_status = COALESCE(email_change_confirm_status, 0),
      is_sso_user = COALESCE(is_sso_user, false),
      is_anonymous = COALESCE(is_anonymous, false),
      updated_at = now()
    WHERE id = v_user_id;
  END IF;

  -- 3. Clean and recreate identity record for email login
  DELETE FROM auth.identities WHERE user_id = v_user_id;

  INSERT INTO auth.identities (
    id,
    user_id,
    provider_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  )
  VALUES (
    gen_random_uuid(),
    v_user_id,
    v_user_id::text,
    format('{"sub":"%s","email":"geniuslibrarymadhupur@gmail.com"}', v_user_id)::jsonb,
    'email',
    now(),
    now(),
    now()
  );

  -- 4. Ensure Admin Profile exists in public.profiles
  INSERT INTO public.profiles (
    id,
    full_name,
    email,
    role,
    status,
    membership_plan,
    fee_status,
    due_amount,
    created_at,
    updated_at
  )
  VALUES (
    v_user_id,
    'Genius Library',
    'geniuslibrarymadhupur@gmail.com',
    'admin',
    'active',
    'Admin Master',
    'Paid',
    0,
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    role = 'admin',
    status = 'active',
    full_name = 'Genius Library',
    updated_at = now();

END $$;

