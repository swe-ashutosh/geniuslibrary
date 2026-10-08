# Project Structure — Every File Explained

A guided map of the whole codebase. Every source file starts with a `[TAG]` header comment
that matches the entries below, and every large file is split into numbered
`SECTION n · NAME` banners so you always know what the code under a banner does.

**The golden rule of this repo:** [`white-label.config.ts`](./white-label.config.ts) is the
single file you edit to run the platform for any library client. Everything below reads from it.

---

## 1 · The Big Picture (how data flows)

```
                      ┌─────────────────────────────────────┐
                      │  white-label.config.ts (ONE FILE)   │
                      │  brand · colors · GPS · fees · UPI  │
                      │  Supabase · Firebase · Cloudflare   │
                      └──────────────┬──────────────────────┘
                                     │ imported by
        ┌────────────────────────────┼─────────────────────────────┐
        ▼                            ▼                             ▼
 apps/web (Next.js)          apps/api (Cloudflare          .github/workflows
 static export                Worker REST API)              deploy.yml (CI)
        │                            │                             │
        │  lib/supabase/*            │  lib/db (D1 backup)         │ reads WL_*
        ▼                            ▼                             ▼
   ┌──────────────────┐      ┌──────────────┐            Cloudflare Pages + Worker
   │ SUPABASE (sole   │      │ CLOUDFLARE D1│            (deploy on every push)
   │ primary database)│      │ (cold backup)│
   └──────────────────┘      └──────────────┘
        ▲                            ▲
        │  Firebase (FCM push + analytics) connects to the browser + Worker
```

**Supabase connection step (browser):** `lib/supabase/client.ts` builds one singleton
client from `BRAND_CONFIG.supabase` → used by every page for auth + data.

**Supabase connection step (Worker):** `apps/api/src/index.ts` SECTION 2 builds a client
from the same credentials to verify JWTs and read/write the primary DB.

**Firebase connection step:** `lib/firebase.ts` (browser, FCM tokens) and
`apps/api/src/fcm.ts` (server, sending pushes) — both read `white-label.config.ts`.

---

## 2 · Root Files

| File | What it does |
|---|---|
| `white-label.config.ts` | **THE config.** Brand, colors, GPS, fees/shifts, UPI/bank, SEO, Supabase + Firebase + Cloudflare credentials, email sender, FCM service account. Only file to edit for a new client. |
| `package.json` | pnpm monorepo scripts (`dev`, `build`, `lint` — run in every app). |
| `pnpm-workspace.yaml` | Declares `apps/*` as the pnpm workspace. |
| `supabase_schema.sql` | Run once in a fresh Supabase project: creates all tables, storage buckets, RLS policies and triggers. |
| `README.md` | Short intro + white-label pointer. |
| `NEW_LIBRARY_SETUP_GUIDE.md` | Step-by-step guide to clone → rebrand → deploy for a new client. |
| `PROJECT_STRUCTURE.md` | This file. |
| `AGENTS.md` | Coding rules for AI agents (Supabase-only, pnpm-only, minimal code). |

## 3 · `scripts/`

| File | What it does |
|---|---|
| `white-label.mjs` | Reads `white-label.config.ts` and emits derived artifacts: `env` mode prints `WL_*` variables for the GitHub Action; `pwa` mode regenerates `apps/web/public/pwa-config.js` + `manifest.json`. Runs automatically before web `dev`/`build`. |

## 4 · `apps/web` — the frontend (Next.js 16, static export)

### 4.1 Build & config

| File | What it does |
|---|---|
| `next.config.ts` | Static export (`output: "export"`), trailing slash, and `NEXT_PUBLIC_*` env defaults baked from `white-label.config.ts`. |
| `tsconfig.json` | TypeScript setup. `@/*` → `src/*`, `@wl` → root `white-label.config.ts`. |
| `package.json` | `dev`/`build` scripts; both regenerate the PWA files from the master config first. |

### 4.2 `src/lib` — connections & services (the heart)

| File | What it does |
|---|---|
| `lib/config.ts` | **SECTION 1-9 mirror the master config.** Maps `white-label.config.ts` → `BRAND_CONFIG` (env vars win). Every page/component imports `BRAND_CONFIG` from here. Also `isMasterAdminEmail()`. |
| `lib/supabase/client.ts` | **Supabase connection (browser).** SECTION 1 credentials → SECTION 2 cookie-backup helpers (PWA session survival) → SECTION 3 singleton client factory. |
| `lib/supabase/server.ts` | Supabase connection for Server Components / Route Handlers (`@supabase/ssr` + Next cookies). |
| `lib/supabase/admin.ts` | Supabase connection with SERVICE ROLE key (bypasses RLS). Server-only — never import in client code. |
| `lib/supabase/storage.ts` | Supabase Storage: SECTION 1 canvas image compression (<200KB) → SECTION 2 uploads (avatars, staff photos, attendance photos) → SECTION 3 old-photo auto-pruning. |
| `lib/firebase.ts` | **Firebase connection.** SECTION 1 app init from `BRAND_CONFIG.firebase` → SECTION 2 FCM token registration → SECTION 3 token sync to Supabase + Worker → SECTION 4 foreground messages + app badge. |
| `lib/api.ts` | **Unified API client** — every screen's data layer. SECTION 1 data models → SECTION 2 HTTP client (auth token + ETag cache) → SECTION 3 offline localStorage fallback → SECTION 4 core methods (4a shifts/seats, 4b attendance/disputes, 4c books, 4d fees) → SECTION 5-11 expenses, holidays, students, messages, staff, notifications, DB/storage admin. |
| `lib/pushNotify.ts` | Native OS notifications: SECTION 1 chime/permission → SECTION 2 popup trigger via Service Worker → SECTION 3 cross-tab broadcast. |
| `lib/security.ts` | Login lockout + signup throttling (client-side brute-force protection). |
| `lib/authInactivity.ts` | One-login-per-day policy, midnight IST expiry, inactivity logout. |
| `lib/stampPattern.ts` | Anti-proxy: registers the physical stamp's 3-point touch pattern and matches it at check-in. |
| `lib/examResults.ts` | Library exams + marks + result cards (Supabase-backed). |
| `lib/store.ts` | Frontend view models for the seat matrix UI. |

### 4.3 `src/app` — routes (App Router)

**Root / public**

| File | What it does |
|---|---|
| `layout.tsx` | Root layout: fonts, SEO/OG metadata from `BRAND_CONFIG`, manifest link, network preconnects, pages.dev → domain redirect, mounts `PWAProvider`. |
| `page.tsx` | Landing page (SSG): hero, 3D tour, amenities, testimonials, FAQ, map — plus full SEO metadata and JSON-LD, all from `BRAND_CONFIG`. |
| `manifest.ts` / `sitemap.ts` / `robots.ts` / `icon.tsx` | PWA manifest, sitemap.xml, robots.txt, favicon — generated from config. |
| `login/page.tsx` | Supabase email/password login; routes admins to `/admin`. |
| `signup/page.tsx` | Student self-registration (pending admin approval). |
| `forgot-password/page.tsx` / `update-password/page.tsx` | Password reset flow. |
| `auth/callback/page.tsx` | Exchanges auth codes for a session, routes by role. |
| `attendance/page.tsx` | Public QR attendance gate with GPS geofence verification. |
| `library-rules/page.tsx`, `contact-support/page.tsx`, legal pages | Static content pages (branding from config). |
| `staff/page.tsx` | Staff portal: desk check-in/out + cash fee collection. |
| `error.tsx`, `global-error.tsx`, `not-found.tsx` | Error boundaries + 404. |

**Admin dashboard (`/admin/*`, guarded by role)**

| File | What it does |
|---|---|
| `admin/layout.tsx` | Dashboard shell: sidebar, role guard, brand header. |
| `admin/page.tsx` | Home: today's stats, occupancy, WhatsApp reminders. |
| `admin/students/page.tsx` | Directory: approvals, status, ID cards. |
| `admin/attendance/page.tsx` | QR scanner, live log, manual entries. |
| `admin/fees/page.tsx` | Fee records, payments, invoices. |
| `admin/seats/page.tsx` | Seat matrix: allocate/vacate, lockers, disputes. |
| `admin/messages/page.tsx` | 2-way chat inbox. |
| `admin/analytics/page.tsx` | Attendance/revenue/occupancy charts. |
| `admin/reports/page.tsx` | Operational reports + exports. |
| `admin/results/page.tsx` | Create exams, enter marks. |
| `admin/staff/page.tsx` | Staff directory + access control. |
| `admin/settings/page.tsx` | Library profile, shifts, holidays, storage status. |

**Student portal (`/student/*`, guarded)**

| File | What it does |
|---|---|
| `student/layout.tsx` | Portal shell: bottom nav, profile header, guard. |
| `student/page.tsx` | Digital ID card (QR), seat/fee/attendance status. |
| `student/attendance/page.tsx` | Personal attendance history. |
| `student/fees/page.tsx` | Dues, receipts, UPI deep-link payment. |
| `student/messages/page.tsx` | Chat with admin/staff. |
| `student/news/page.tsx` | Announcements feed. |
| `student/tasks/page.tsx` | Take mock tests, view results. |

### 4.4 `src/components` — shared UI

| File | What it does |
|---|---|
| `BrandLogo.tsx` | SVG logo + name (colors from config). |
| `Navbar.tsx` / `Footer.tsx` | Public marketing chrome. |
| `ScrollTourHero.tsx` | Scroll-driven 3D tour hero with CTAs. |
| `PageHeader.tsx` | Reusable title/description header. |
| `SeatMatrixView.tsx` | Seat occupancy grid renderer. |
| `VirtualizedList.tsx` | Windowed list for long tables. |
| `PWAProvider.tsx` | Service-worker registration, install prompt, foreground push popups. |
| `FeeInvoiceModal.tsx` | Printable invoice with UPI QR (payment details from config). |
| `AdminStudentQrScannerModal.tsx` | Camera QR scanner for attendance/ID. |
| `LiveAttendanceCameraModal.tsx` | Silent verification photo capture. |
| `FullscreenStampAttendance.tsx` | Physical-stamp check-in flow. |
| `AdminStampCalibrationModal.tsx` | Register the stamp touch pattern. |

### 4.5 `public/` — static assets

| File | What it does |
|---|---|
| `icon*.png`, `logo.png`, `favicon.ico`, `apple-touch-icon.png` | Replace these per client. |
| `pwa-config.js` | **AUTO-GENERATED** from the master config (firebase web config + brand fallbacks for the service workers). Do not edit. |
| `manifest.json` | **AUTO-GENERATED** mirror of the manifest route (precached by sw.js). |
| `sw.js` | Offline cache + native push fallback service worker (reads `pwa-config.js`). |
| `firebase-messaging-sw.js` | FCM background push handler (reads `pwa-config.js`). |

## 5 · `apps/api` — the backend (Cloudflare Worker, Hono)

| File | What it does |
|---|---|
| `src/index.ts` | **The whole REST API in 19 numbered sections:** 1 CORS security → 2 Supabase connection → 3 health → 4 students → 5 shifts → 6 seats → 7 attendance (QR + disputes) → 8 books → 9 fees → 10 announcements → 11 dashboard stats → 12 messages → 13 staff → 14 notifications → 15 FCM push → 16 daily backup engine → 17 monthly archival → 18 storage/pruning admin → 19 worker export (fetch + cron). |
| `src/db/schema.ts` | Drizzle schema for D1 — the COLD BACKUP mirror of Supabase. |
| `src/db/index.ts` | Drizzle client factory over D1. |
| `src/email.ts` | Resend emails: fee receipts, welcome mail, daily admin report (branded HTML from config). |
| `src/fcm.ts` | FCM v1 push sender (service-account OAuth2; env vars first, config fallback). |
| `src/reportGenerator.ts` | CSV + PDF report generation for backups. |
| `wrangler.jsonc` | Worker config: name, D1 binding, cron triggers. Per-account `database_id` is the one value not in the master config. |

## 6 · Where to change what (cheat sheet)

| I want to change... | Edit |
|---|---|
| Library name, phone, address, admin email | `white-label.config.ts` SECTION 1 |
| Fees, shifts, amenities | `white-label.config.ts` SECTION 5 |
| UPI / bank details | `white-label.config.ts` SECTION 6 |
| Supabase / Firebase / API connection | `white-label.config.ts` SECTION 8 (+9 for FCM secret) |
| Colors app-wide | `white-label.config.ts` SECTION 3 **and** `globals.css` `@theme` |
| Logos / icons | `apps/web/public/` image files |
| Landing page marketing copy | `apps/web/src/app/page.tsx` (names/contacts still come from config) |
| What a page shows | the `page.tsx` under `src/app/...` (see section 4.3) |
| A REST endpoint | `apps/api/src/index.ts` — jump to its numbered SECTION banner |
