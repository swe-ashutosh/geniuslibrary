-- ═══════════════════════════════════════════════════════════════════════
-- THE GENIUS DIGITAL LIBRARY — RLS HARDENING MIGRATION
-- ═══════════════════════════════════════════════════════════════════════
-- Run this ONCE in Supabase SQL Editor (existing projects).
-- Fresh projects get the same policies automatically via supabase_schema.sql.
--
-- WHY: the original schema shipped with USING (true) policies on every
-- table, which means RLS was effectively OFF. Anyone with the public anon
-- key (it ships in the browser bundle by design) could read/modify/delete
-- ALL rows: student profiles, fees, attendance, messages.
--
-- WHAT THIS DOES:
--   1. Helper functions is_admin() / is_staff_or_admin() (recursion-safe).
--   2. Per-table policies: students see only their own rows; staff/admin
--      see everything; anonymous users get nothing on private tables.
--   3. Storage: attendance photos no longer publicly readable.
--
-- REQUIRED AFTER APPLYING (or the QR gate + backups stop writing):
--   Set SUPABASE_SERVICE_ROLE_KEY on the Cloudflare Worker
--   (Worker -> Settings -> Variables and Secrets). The Worker prefers it
--   automatically and uses it for trusted server-side writes.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. HELPER FUNCTIONS (SECURITY DEFINER avoids RLS recursion) ────────

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
  );
$$;

-- ── 2. PROFILES ─────────────────────────────────────────────────────────
-- Students can see their own row + admin/staff contact profiles (for chat).
-- Everyone else's data (other students) is hidden. Inserts happen via the
-- handle_new_user() trigger; users may insert their own row as fallback.

DROP POLICY IF EXISTS "Enable all access for profiles" ON public.profiles;

CREATE POLICY "profiles_select_own_and_staff"
ON public.profiles FOR SELECT
TO authenticated
USING (
  id = auth.uid()
  OR is_staff_or_admin()
  OR role IN ('admin', 'staff')
);

CREATE POLICY "profiles_insert_self"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_update_self_or_staff"
ON public.profiles FOR UPDATE
TO authenticated
USING (id = auth.uid() OR is_staff_or_admin())
WITH CHECK (id = auth.uid() OR is_staff_or_admin());

CREATE POLICY "profiles_delete_admin"
ON public.profiles FOR DELETE
TO authenticated
USING (is_admin());

-- ── 3. ATTENDANCE ───────────────────────────────────────────────────────
-- Students read their own rows. Writes are staff/admin only; the public QR
-- gate writes through the Worker using the service-role key (trusted).

DROP POLICY IF EXISTS "Enable all access for attendance" ON public.attendance;

CREATE POLICY "attendance_select_own_or_staff"
ON public.attendance FOR SELECT
TO authenticated
USING (student_id = auth.uid() OR is_staff_or_admin());

CREATE POLICY "attendance_write_staff"
ON public.attendance FOR INSERT
TO authenticated
WITH CHECK (is_staff_or_admin());

CREATE POLICY "attendance_update_staff"
ON public.attendance FOR UPDATE
TO authenticated
USING (is_staff_or_admin())
WITH CHECK (is_staff_or_admin());

CREATE POLICY "attendance_delete_staff"
ON public.attendance FOR DELETE
TO authenticated
USING (is_staff_or_admin());

-- ── 4. FEES ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Enable all access for fees" ON public.fees;

CREATE POLICY "fees_select_own_or_staff"
ON public.fees FOR SELECT
TO authenticated
USING (student_id = auth.uid() OR is_staff_or_admin());

CREATE POLICY "fees_write_staff"
ON public.fees FOR INSERT
TO authenticated
WITH CHECK (is_staff_or_admin());

CREATE POLICY "fees_update_staff"
ON public.fees FOR UPDATE
TO authenticated
USING (is_staff_or_admin())
WITH CHECK (is_staff_or_admin());

CREATE POLICY "fees_delete_staff"
ON public.fees FOR DELETE
TO authenticated
USING (is_staff_or_admin());

-- ── 5. MESSAGES (2-way chat) ────────────────────────────────────────────
-- Both participants read a thread; only the sender (or staff/admin) writes.

DROP POLICY IF EXISTS "Enable all access for messages" ON public.messages;

CREATE POLICY "messages_select_participants"
ON public.messages FOR SELECT
TO authenticated
USING (
  sender_id = auth.uid()::text
  OR recipient_id = auth.uid()::text
  OR is_staff_or_admin()
);

CREATE POLICY "messages_insert_self"
ON public.messages FOR INSERT
TO authenticated
WITH CHECK (sender_id = auth.uid()::text OR is_staff_or_admin());

CREATE POLICY "messages_update_staff"
ON public.messages FOR UPDATE
TO authenticated
USING (is_staff_or_admin())
WITH CHECK (is_staff_or_admin());

CREATE POLICY "messages_delete_staff"
ON public.messages FOR DELETE
TO authenticated
USING (is_staff_or_admin());

-- ── 6. NOTIFICATIONS ────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Enable all access for notifications" ON public.notifications;

CREATE POLICY "notifications_select_recipient"
ON public.notifications FOR SELECT
TO authenticated
USING (recipient_id = auth.uid()::text OR is_staff_or_admin());

CREATE POLICY "notifications_insert_staff"
ON public.notifications FOR INSERT
TO authenticated
WITH CHECK (is_staff_or_admin());

CREATE POLICY "notifications_update_recipient"
ON public.notifications FOR UPDATE
TO authenticated
USING (recipient_id = auth.uid()::text OR is_staff_or_admin())
WITH CHECK (recipient_id = auth.uid()::text OR is_staff_or_admin());

CREATE POLICY "notifications_delete_staff"
ON public.notifications FOR DELETE
TO authenticated
USING (is_staff_or_admin());

-- ── 7. LIBRARY HOLIDAYS (public info: anyone can read) ──────────────────

DROP POLICY IF EXISTS "Enable all access for library_holidays" ON public.library_holidays;

CREATE POLICY "holidays_select_public"
ON public.library_holidays FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "holidays_write_staff"
ON public.library_holidays FOR ALL
TO authenticated
USING (is_staff_or_admin())
WITH CHECK (is_staff_or_admin());

-- ── 8. DESK DISPUTES ────────────────────────────────────────────────────
-- Students can report a dispute and see their own reports.

DROP POLICY IF EXISTS "Enable all access for desk_disputes" ON public.desk_disputes;

CREATE POLICY "disputes_select_involved_or_staff"
ON public.desk_disputes FOR SELECT
TO authenticated
USING (
  reporter_student_id = auth.uid()::text
  OR occupant_student_id = auth.uid()::text
  OR is_staff_or_admin()
);

CREATE POLICY "disputes_insert_own"
ON public.desk_disputes FOR INSERT
TO authenticated
WITH CHECK (
  reporter_student_id = auth.uid()::text
  OR is_staff_or_admin()
);

CREATE POLICY "disputes_update_staff"
ON public.desk_disputes FOR UPDATE
TO authenticated
USING (is_staff_or_admin())
WITH CHECK (is_staff_or_admin());

CREATE POLICY "disputes_delete_staff"
ON public.desk_disputes FOR DELETE
TO authenticated
USING (is_staff_or_admin());

-- ── 9. BOOKS (catalog is public info) ───────────────────────────────────

DROP POLICY IF EXISTS "Enable all access for books" ON public.books;

CREATE POLICY "books_select_public"
ON public.books FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "books_write_staff"
ON public.books FOR ALL
TO authenticated
USING (is_staff_or_admin())
WITH CHECK (is_staff_or_admin());

-- ── 10. BOOK ISSUES ─────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Enable all access for book_issues" ON public.book_issues;

CREATE POLICY "book_issues_select_own_or_staff"
ON public.book_issues FOR SELECT
TO authenticated
USING (student_id = auth.uid()::text OR is_staff_or_admin());

CREATE POLICY "book_issues_write_staff"
ON public.book_issues FOR ALL
TO authenticated
USING (is_staff_or_admin())
WITH CHECK (is_staff_or_admin());

-- ── 11. EXAM RESULTS ────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Enable all access for exam_results" ON public.exam_results;

CREATE POLICY "exam_results_select_own_or_staff"
ON public.exam_results FOR SELECT
TO authenticated
USING (student_id = auth.uid()::text OR is_staff_or_admin());

CREATE POLICY "exam_results_write_staff"
ON public.exam_results FOR ALL
TO authenticated
USING (is_staff_or_admin())
WITH CHECK (is_staff_or_admin());

-- ── 12. STORAGE: attendance photos are NOT public ───────────────────────

DROP POLICY IF EXISTS "Public Read Access for attendance-photos" ON storage.objects;
CREATE POLICY "attendance_photos_read_authenticated"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'attendance-photos');

DROP POLICY IF EXISTS "Authenticated Uploads for attendance-photos" ON storage.objects;
CREATE POLICY "attendance_photos_upload_staff"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'attendance-photos' AND is_staff_or_admin());

DROP POLICY IF EXISTS "Allow Delete for attendance-photos" ON storage.objects;
CREATE POLICY "attendance_photos_delete_staff"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'attendance-photos' AND is_staff_or_admin());

-- Avatars stay publicly readable (profile photos render in chat/directory),
-- but only the owner uploads into their own folder.
DROP POLICY IF EXISTS "Authenticated Uploads for avatars" ON storage.objects;
CREATE POLICY "avatars_upload_owner"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- ═══════════════════════════════════════════════════════════════════════
-- VERIFY (run after applying — every row should be FULLY enabled)
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';
-- SELECT tablename, policyname, cmd FROM pg_policies WHERE schemaname = 'public';
-- ═══════════════════════════════════════════════════════════════════════
