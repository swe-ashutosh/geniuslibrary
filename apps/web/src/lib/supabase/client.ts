/**
 * [WEB • LIB • CORE] Supabase Connection (Browser)
 *
 * Creates the singleton Supabase browser client (primary database)
 * with cookie backup/restore so auth sessions survive PWA restarts.
 */

import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { BRAND_CONFIG } from '@/lib/config'

// ══════════════════════════════════════════════════════════════
// SECTION 1 · CONNECTION CREDENTIALS
// URL + anon key from BRAND_CONFIG (white-label.config.ts / env overrides).
// ══════════════════════════════════════════════════════════════
const supabaseUrl = BRAND_CONFIG.supabase.url
const supabaseAnonKey = BRAND_CONFIG.supabase.anonKey

let cachedClient: SupabaseClient | null = null

const LS_COOKIE_PREFIX = 'sb_cookie_backup_'

/**
 * Parses raw document.cookie string into name/value pairs
 */
// ══════════════════════════════════════════════════════════════
// SECTION 2 · COOKIE BACKUP HELPERS
// Supabase auth cookies are mirrored into localStorage so the PWA
// session survives restarts where document.cookie was cleared.
// ══════════════════════════════════════════════════════════════
function parseDocumentCookies(): { name: string; value: string }[] {
  if (typeof document === 'undefined') return []
  const pairs = document.cookie.split(';')
  const result: { name: string; value: string }[] = []

  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i].trim()
    if (!pair) continue
    const eqIdx = pair.indexOf('=')
    if (eqIdx !== -1) {
      const name = pair.slice(0, eqIdx).trim()
      let value = pair.slice(eqIdx + 1).trim()
      try {
        value = decodeURIComponent(value)
      } catch {}
      result.push({ name, value })
    }
  }
  return result
}

/**
 * Creates or retrieves the singleton Supabase client for browser and PWA environments.
 * Uses a dual-storage bridge (document.cookie + localStorage backup) so sessions survive
 * mobile taskbar clearing, PWA standalone reboots, and aggressive browser cookie purges.
 */
// ══════════════════════════════════════════════════════════════
// SECTION 3 · CLIENT FACTORY
// Singleton browser client — the app's PRIMARY database connection.
// ══════════════════════════════════════════════════════════════
export function createClient(): SupabaseClient {
  if (typeof window === 'undefined') {
    // SSR / prerendering fallback
    return createBrowserClient(supabaseUrl, supabaseAnonKey)
  }

  if (cachedClient) {
    return cachedClient
  }

  cachedClient = createBrowserClient(supabaseUrl, supabaseAnonKey, {
    isSingleton: true,
    cookieOptions: {
      name: 'genius_auth_v2',
      maxAge: 24 * 60 * 60, // 24 hours daily session lifetime
      path: '/',
      sameSite: 'lax',
    },
    cookies: {
      getAll() {
        const docCookies = parseDocumentCookies()
        const cookieMap = new Map<string, string>()

        // 1. Populate from document.cookie
        docCookies.forEach(({ name, value }) => {
          if (name && value) {
            cookieMap.set(name, value)
          }
        })

        // 2. Read from localStorage backup (critical for mobile PWA standalone task-clearing)
        try {
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i)
            if (key && key.startsWith(LS_COOKIE_PREFIX)) {
              const cookieName = key.slice(LS_COOKIE_PREFIX.length)
              const backupValue = localStorage.getItem(key)

              if (backupValue && !cookieMap.has(cookieName)) {
                // Restore cookie to document.cookie so browser networking also sees it
                try {
                  const maxAgeSec = 24 * 60 * 60
                  document.cookie = `${encodeURIComponent(cookieName)}=${encodeURIComponent(backupValue)}; path=/; max-age=${maxAgeSec}; SameSite=Lax`
                } catch {}
                cookieMap.set(cookieName, backupValue)
              }
            }
          }
        } catch (e) {
          console.warn('[SupabaseClient] LocalStorage backup read notice:', e)
        }

        return Array.from(cookieMap.entries()).map(([name, value]) => ({ name, value }))
      },
      setAll(setCookies) {
        setCookies.forEach(({ name, value, options }) => {
          const maxAge = options?.maxAge ?? 24 * 60 * 60
          const path = options?.path ?? '/'
          const sameSite = options?.sameSite ?? 'Lax'

          // 1. Write to document.cookie
          if (typeof document !== 'undefined') {
            try {
              document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; path=${path}; max-age=${maxAge}; SameSite=${sameSite}`
            } catch {}
          }

          // 2. Write to localStorage backup for indestructible PWA session persistence
          try {
            const lsKey = LS_COOKIE_PREFIX + name
            if (maxAge === 0 || !value) {
              localStorage.removeItem(lsKey)
            } else {
              localStorage.setItem(lsKey, value)
            }
          } catch {}
        })
      },
    },
  })

  return cachedClient
}
