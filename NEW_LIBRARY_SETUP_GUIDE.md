# White-Label Library Setup Guide (Single-Config Workflow)

This repository is a modular, production-ready **Digital Library Management Platform** (Next.js 16 static export, Supabase, Cloudflare Pages + Workers).

**One file drives the whole product:** [`white-label.config.ts`](./white-label.config.ts)

> Clone → edit `white-label.config.ts` → replace the icon files → create your cloud accounts → push to GitHub. The GitHub Action deploys web + API using the values from that file.

---

## 📋 Architecture & Mandates

- **Single config file:** [`white-label.config.ts`](./white-label.config.ts) is the only repo file you edit for a new client. Branding, colors, GPS, fees, shifts, UPI/bank, SEO, Supabase/Firebase/Cloudflare endpoints — everything lives there.
- **Env vars always win:** any `NEXT_PUBLIC_*` variable set on a hosting dashboard overrides the config file. See [`apps/web/.env.example`](./apps/web/.env.example).
- **Database:** **Supabase PostgreSQL** is the sole and exclusive primary database ([`supabase_schema.sql`](./supabase_schema.sql)).
- **Package manager:** strictly `pnpm`.
- **Deployment:** GitHub Action → Cloudflare Pages (web) + Cloudflare Worker (API). Static export also works on Vercel/Render.

---

## 🚀 Setup Steps for a New Library Client

### Step 1: Clone & Install

```bash
git clone <YOUR_GIT_REPO_URL> new-library-platform
cd new-library-platform
pnpm install
```

### Step 2: Edit `white-label.config.ts` (THE main step)

Open [`white-label.config.ts`](./white-label.config.ts) and replace every value for the new client:

| Section | What to change |
|---|---|
| **1. Brand identity** | Name, Hindi name, tagline, address, phone, email, admin email, site URL, domain names |
| **2. SEO extras** | Keywords + alternate names (city-specific) |
| **3. Colors** | Theme palette (keep `apps/web/src/app/globals.css` `@theme` in sync) |
| **4. GPS** | Latitude / longitude / geofence radius of the new library |
| **5. Fees & shifts** | Membership fees, shift timings, amenities list |
| **6. Payment** | New UPI ID, payee name, bank account details |
| **7. Google Maps** | Create a fresh Maps embed for the new location, paste URL |
| **8. Services** | Supabase URL + anon key, Firebase web config + VAPID key, Cloudflare API URL + Pages project + Worker name, email sender, push fallback texts |
| **9. FCM service account** | Firebase service-account credentials (prefer setting these as Worker env vars instead) |

> ⚠️ `NEXT_PUBLIC_ADMIN_EMAIL` (section 1) is special: that user automatically gets **master admin rights** across the whole dashboard. Set it to the new client's admin email.

### Step 3: Replace Brand Assets

Replace in `apps/web/public/` (regenerating `pwa-config.js`/`manifest.json` is automatic):

| File | Resolution | Purpose |
|---|---|---|
| `icon.png` | 512×512 PNG | PWA icon, receipt header |
| `logo.png` / `navbarlogo.png` | 256×256 PNG | Navbar/footer logos |
| `favicon.ico` | 32×32 ICO | Browser tab |
| `apple-touch-icon.png` | 180×180 PNG | iOS bookmark |
| `icon-192.png`, `icon-512.png`, `icon-maskable-*.png` | PNG | PWA icons |
| `library-hall.jpg`, `library-cubicle.jpg`, `library-lounge.jpg` | 1200×630 | Landing gallery |

### Step 4: Create Supabase (database)

1. Create a project at [supabase.com](https://supabase.com).
2. Copy **Project URL** + **anon/publishable key** (Settings → API) into section 8 of `white-label.config.ts`.
3. Run the whole [`supabase_schema.sql`](./supabase_schema.sql) in the SQL Editor (tables, storage buckets, RLS, triggers).
4. **MANDATORY — run [`supabase_rls_hardening.sql`](./supabase_rls_hardening.sql) next.** This locks the database down so students can only read their own rows and anonymous users get nothing. Skipping this leaves every table world-writable to anyone holding the public anon key.
4. Create the admin user: Authentication → Users → **Add user** (auto-confirm ON), then promote them in SQL:

```sql
INSERT INTO public.profiles (id, full_name, email, role, status)
SELECT id, 'Library Super Admin', email, 'admin', 'active'
FROM auth.users
WHERE email = '<admin-email-from-config>'
ON CONFLICT (id) DO UPDATE SET role = 'admin', status = 'active';
```

### Step 5: Create Firebase (push notifications)

1. Create a project at [console.firebase.google.com](https://console.firebase.google.com) (Google Console), add a **Web app**.
2. Copy the web config (apiKey, projectId, appId, ...) + the **VAPID public key** (Project settings → Cloud Messaging → Web Push certificates) into section 8.
3. For server-side push, create a **service account** (Project settings → Service accounts) and either paste it into section 9 or, better, set `FCM_PROJECT_ID` / `FCM_CLIENT_EMAIL` / `FCM_PRIVATE_KEY` as env vars on the Cloudflare Worker.
4. Done — Google Analytics + FCM push connect automatically.

### Step 6: Create Cloudflare (hosting)

1. Create a **Pages project** + a **Worker** + (optionally) D1; note the names.
2. Put those names in section 8 (`cloudflare.pagesProjectName`, `cloudflare.workerName`, `cloudflare.apiUrl`).
3. Add `apps/api/wrangler.jsonc` D1 `database_id` for the new account (the only per-account value not in the config file).
4. Set Worker secrets/env vars (dashboard or `wrangler secret put`):
   `SUPABASE_SERVICE_ROLE_KEY` (**required** — the Worker uses it for trusted server-side writes like the public QR attendance gate and backups), plus `API_SECRET_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY`.
5. In GitHub repo **Settings → Secrets → Actions**, add: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`. Optional overrides: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_API_URL`.

### Step 7: Push to GitHub → Done

```bash
git add -A && git commit -m "Rebrand for <new client>" && git push origin main
```

The workflow deploys the Worker and the static web build; the build reads `white-label.config.ts`. Point the Cloudflare Pages custom domain to the client's domain and update `siteUrl`/`primaryDomain` in the config.

> **Render / Vercel instead of Cloudflare Pages?** Run `pnpm --filter web build`, publish `apps/web/out`, and optionally set the same env vars in the dashboard. The config file already contains working defaults.

### Step 8: Verify Locally (optional but recommended)

```bash
pnpm --filter web dev
```

Check: landing page shows the new name/address/phone, login works with the new admin, QR attendance scan works, test invoice shows the new UPI details.

---

## 🔄 What Reads the Config (data flow)

```
white-label.config.ts  (single source of truth, committed)
├── apps/web/next.config.ts        → bakes NEXT_PUBLIC_* defaults into the bundle
├── apps/web/src/lib/config.ts     → BRAND_CONFIG used by every page/component
│   ├── Supabase clients (browser)      ├─ Firebase web + FCM tokens
│   ├── Metadata (layout, manifest,     ├─ Invoices, stamps, notifications
│   │   sitemap, robots, SEO/JSON-LD)   ├─ GPS geofencing, fees, shifts, UPI
├── apps/api/src/*                 → Worker branding, CORS, admin email, emails,
│                                    PDF reports, FCM credentials (env wins)
├── scripts/white-label.mjs        → regenerates public/pwa-config.js + manifest.json
└── .github/workflows/deploy.yml   → Pages project name, Worker name, build env
```

## 🔐 Security Model (how this app stays safe)

The frontend is a fully static export — every page, including admin HTML/JS, is publicly downloadable. That is fine, because **security lives in three server-side layers**, not in the pages:

1. **Supabase RLS** (`supabase_rls_hardening.sql`) — students can only read/write their own rows; anonymous users get nothing. The public anon key in the browser bundle is safe by design because of this layer.
2. **Cloudflare Worker auth** — every mutating API endpoint requires a valid Supabase JWT (any signed-in user) or the `API_SECRET_KEY` header; admin-grade endpoints (fees receipts, pruning, backups, adding students, FCM test) require an **admin** JWT or the secret. Route guards in the UI are cosmetic only.
3. **Secrets discipline** — `white-label.config.ts` holds ONLY public-by-design credentials. True secrets (service-role key, Resend, FCM service account, API secret) exist only as Worker/dashboard env vars.

## 🌟 Features Ready Out-of-the-Box

1. **Anti-proxy QR attendance** — one-click scan + stealth photo snapshot, stored in Supabase Storage with auto-pruning.
2. **Dynamic seat matrix** — real-time allocation, locker + shift management.
3. **Automated fee & GST invoicing** — PDF invoices with library header + UPI QR, WhatsApp reminders.
4. **Student portal** — digital ID card with QR, offline PWA, mobile-first layout.
5. **Staff portal** (`/staff`) — desk check-in/out and cash collection.
