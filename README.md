# Digital Library Platform - Monorepo (White-Label Ready)

Full-stack pnpm monorepo:

- `apps/web`: The Next.js frontend application (static export).
- `apps/api`: The Hono (Cloudflare Workers / Node.js) backend API.

## White-Label: One File to Rule Them All

[`white-label.config.ts`](./white-label.config.ts) is the **single source of truth** for the entire product: branding, colors, GPS geofencing, fees, shifts, UPI/bank details, SEO, and all service connections (Supabase, Firebase, Cloudflare, email sender).

Clone this repo, edit that one file, replace the icons in `apps/web/public/`, push to GitHub — the deploy pipeline and every page/component follow the config. Full walkthrough: [`NEW_LIBRARY_SETUP_GUIDE.md`](./NEW_LIBRARY_SETUP_GUIDE.md). Every file in the codebase is explained in [`PROJECT_STRUCTURE.md`](./PROJECT_STRUCTURE.md).

## Getting Started

```bash
pnpm install
pnpm run dev
```

- Web app: [http://localhost:3000](http://localhost:3000)
- API: [http://localhost:8787](http://localhost:8787)

Env vars are optional overrides only (see `apps/web/.env.example`); the config file carries working defaults.
