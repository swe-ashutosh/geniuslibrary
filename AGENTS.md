<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Agent Execution Guidelines & Rules

## 1. Database Enforcement: USE ONLY SUPABASE (STRICT MANDATE)
* **Single Source of Truth:** ALWAYS use **Supabase** (`@supabase/supabase-js`, `@/lib/supabase/client`) as the sole and exclusive primary database for all features across the application.
* **Strictly Prohibited:** NEVER use Cloudflare D1, SQLite, or secondary databases for core application data, states, holidays, announcements, seats, fees, or student profiles. Do not build split-brain or dual-sync logic across two databases. Everything must be saved and queried directly from Supabase.
* If a table or column is needed for a new feature, use Supabase PostgreSQL tables directly.

## 2. Package Manager Enforcement (CRITICAL)
* **Always use `pnpm`**: Never use `npm`, `npx` (unless using `pnpm dlx` or package execution equivalents), or `yarn` for installing dependencies, running scripts, or managing packages. 
* Always check workspace configurations and use `pnpm --filter [package]` when running commands in the monorepo.

## 3. Zero-Duplication Check (Token Saver)
* **Scan First:** Before creating any new component, file, button, or UI element, scan the existing workspace to verify it does not already exist.
* **Reuse Over Recreate:** If a matching pattern, component, or utility function is found, reuse or extend it instead of writing duplicate code. Never reinvent the wheel if a solution already exists in the repo.

## 4. Minimalist Code & Elegance (Simplicity First)
* **Less is More:** Always aim for the solution with the minimum necessary lines of code. Avoid bloated, over-engineered architectures for simple problems. 
* **Leverage Native APIs/Libraries:** Utilize built-in methods or standard libraries natively before writing massive custom functions to solve standard problems.

## 5. Auto-Structure Protocol (Token Saver)
* When given a casual, unstructured request (e.g., "make a page with stats and info"), **automatically parse it** internally into a clean execution blueprint before coding:
  - **Goal:** [Target feature/page]
  - **Key Sections:** [Extracted list of UI elements, stats, data]
  - **Constraints:** [Tailwind, Next.js, Cloudflare compatible, pnpm-only, no duplicates]
* **Output Style:** Skip conversational filler, avoid redundant explanations, and output clean, production-ready code directly. Conserve tokens wherever possible.

## 6. Deployment Safety
* Verify compatibility with Next.js App Router and Cloudflare Workers (Edge runtime) before proposing code changes.

# Response style

| Rule | Meaning |
|---|---|
| No over-explain | Get to the point. Skip extra background. |
| Simple words | Use easy words. Avoid heavy jargon. |
| Hinglish in chat | Chat replies use a Hindi + English mix. |
| English in the repo | Every file in the repo stays in English. |
| No long paragraphs | Break the answer into short pieces. |
| Points and tables | Use bullets or tables. |
| Proper spacing | Leave space between lines. Do not pack text together. |
| Crisp | Say only what is needed. |
| No em-dashes | Do not use an em-dash. Use a comma or a period. |

Apply this to every response: code, explanation, and discussion.

