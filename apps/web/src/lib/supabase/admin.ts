/**
 * [WEB • LIB] Supabase Connection (Service Role / Admin)
 *
 * Client with SERVICE ROLE KEY that bypasses RLS. SERVER-ONLY:
 * never import from client components.
 */

import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/**
 * Creates a Supabase client with the SERVICE ROLE KEY for admin operations.
 * This bypasses RLS and should ONLY be used in server-side Route Handlers.
 * NEVER import this in client components.
 */
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

  if (!serviceRoleKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not set. Add it to your .env.local file. ' +
      'Find it in Supabase Dashboard → Settings → API Keys → service_role.'
    )
  }

  return createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
