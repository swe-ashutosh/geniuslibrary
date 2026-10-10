'use client';

/**
 * [WEB • PAGE] Auth Callback
 *
 * Exchanges OAuth/reset codes for a session, then routes by role; also
 * handles the pages.dev → custom domain redirect.
 */
import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { saveUserRole, recordUserActivity } from '@/lib/authInactivity';
import { BRAND_CONFIG, isMasterAdminEmail } from "@/lib/config";

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    async function processAuth() {
      // If callback landed on .pages.dev due to Supabase fallback, bounce immediately to active domain!
      if (typeof window !== 'undefined' && window.location.hostname === `${BRAND_CONFIG.pagesDevSubdomain}.pages.dev`) {
        const target = BRAND_CONFIG.siteUrl + window.location.pathname + window.location.search + window.location.hash;
        window.location.replace(target);
        return;
      }

      const supabase = createClient();
      const code = searchParams.get('code');
      const errParam = searchParams.get('error_description') || searchParams.get('error');
      const rawNext = searchParams.get('next') || '/student/';
      const next = rawNext.endsWith('/') ? rawNext : `${rawNext}/`;

      if (errParam) {
        console.error('[AuthCallback] OAuth provider returned error:', errParam);
        router.replace(`/login/?error=oauth_error&msg=${encodeURIComponent(errParam)}`);
        return;
      }

      // Determine user session: Supabase browser client with detectSessionInUrl may have
      // already exchanged the code automatically. Check getUser first to avoid race conditions.
      let currentUser = null;
      const { data: initialUser } = await supabase.auth.getUser();

      if (initialUser?.user) {
        currentUser = initialUser.user;
      } else if (code) {
        const { data: exchangeData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          console.warn('[AuthCallback] exchangeCodeForSession notice:', exchangeError.message);
          // If auto-exchange completed in parallel or session is already active, verify before failing
          const { data: retryUser } = await supabase.auth.getUser();
          const { data: retrySession } = await supabase.auth.getSession();
          if (retryUser?.user || retrySession?.session?.user) {
            currentUser = retryUser?.user || retrySession?.session?.user;
          } else {
            router.replace(`/login/?error=oauth_error&msg=${encodeURIComponent(exchangeError.message)}`);
            return;
          }
        } else {
          currentUser = exchangeData.user;
        }
      } else {
        const { data: fallbackUser } = await supabase.auth.getUser();
        currentUser = fallbackUser?.user || null;
      }

      if (!currentUser) {
        router.replace('/login/?error=oauth_error');
        return;
      }

      const user = currentUser;

      const userEmail = user.email || '';

      // 1. Admin check
      if (isMasterAdminEmail(userEmail)) {
        saveUserRole('admin');
        recordUserActivity(true);
        router.replace('/admin/');
        return;
      }

      // 2. Staff check
      const { data: staffProfile } = await supabase
        .from('staff_profiles')
        .select('role, status')
        .eq('email', userEmail.toLowerCase())
        .maybeSingle();

      if (staffProfile && staffProfile.status === 'active') {
        saveUserRole('staff');
        recordUserActivity(true);
        router.replace('/staff/');
        return;
      }

      // 3. Student profile check (Supabase profiles is the sole primary database)
      let profile: any = null;
      const { data: pById } = await supabase
        .from('profiles')
        .select('id, full_name, phone, status, role')
        .eq('id', user.id)
        .maybeSingle();

      if (pById) {
        profile = pById;
      } else if (userEmail) {
        const { data: pByEmail } = await supabase
          .from('profiles')
          .select('id, full_name, phone, status, role')
          .eq('email', userEmail.toLowerCase())
          .maybeSingle();

        if (pByEmail) {
          profile = pByEmail;
          try {
            await supabase.from('profiles').update({ id: user.id, updated_at: new Date().toISOString() }).eq('email', userEmail.toLowerCase());
          } catch {}
        }
      }

      const hasRegisteredPhone = Boolean(profile?.phone && String(profile.phone).trim().length > 0);

      // CRITICAL: When student logs in without signup:
      // Do NOT create/leave ghost pending student on admin panel, and do NOT redirect to student page!
      if (!profile || !hasRegisteredPhone) {
        // Delete ghost profile row created by trigger so it never shows in admin pending
        try {
          await supabase.from('profiles').delete().eq('id', user.id);
        } catch {}

        // Notify backend cleanup to remove ghost auth user
        try {
          const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://genius-library-api.geniuslibrary.workers.dev';
          fetch(`${apiUrl}/api/auth/cleanup-unregistered`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.id, email: userEmail }),
          }).catch(() => {});
        } catch {}

        await supabase.auth.signOut();
        router.replace(`/login/?error=not_registered&email=${encodeURIComponent(userEmail)}`);
        return;
      }

      // If registered but pending admin approval:
      if (profile.status === 'pending') {
        await supabase.auth.signOut();
        router.replace(`/login/?error=pending_approval&email=${encodeURIComponent(userEmail)}&name=${encodeURIComponent(profile.full_name || '')}`);
        return;
      }

      // If suspended:
      if (profile.status === 'suspended') {
        await supabase.auth.signOut();
        router.replace(`/login/?error=suspended&email=${encodeURIComponent(userEmail)}`);
        return;
      }

      // ONLY approved/active students are allowed into student dashboard
      if (profile.status === 'active') {
        saveUserRole('student');
        recordUserActivity(true);
        router.replace(next);
        return;
      }

      // Fallback
      await supabase.auth.signOut();
      router.replace(`/login/?error=not_approved&email=${encodeURIComponent(userEmail)}`);
    }

    processAuth();
  }, [router, searchParams]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#F8FAFC] p-4 text-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#FFC107] border-t-transparent" />
        <p className="text-sm font-bold tracking-wide text-[#0A2E5C]">Authenticating Session...</p>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#FFC107] border-t-transparent" />
      </div>
    }>
      <AuthCallbackContent />
    </Suspense>
  );
}
