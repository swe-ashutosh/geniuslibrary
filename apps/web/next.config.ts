/**
 * [WEB • CONFIG] Next.js Build Configuration
 *
 * Static export (output: "export") for Cloudflare Pages + trailing slash.
 * Bakes NEXT_PUBLIC_* env defaults from the root white-label.config.ts.
 */

import type { NextConfig } from "next";
import { WL } from "../../white-label.config";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  env: {
    // Defaults come from the root white-label.config.ts; env vars win.
    NEXT_PUBLIC_SUPABASE_URL:
      process.env.NEXT_PUBLIC_SUPABASE_URL || WL.supabase.url,
    NEXT_PUBLIC_SUPABASE_ANON_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      WL.supabase.anonKey,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || WL.supabase.anonKey,
    NEXT_PUBLIC_API_URL:
      process.env.NEXT_PUBLIC_API_URL || WL.cloudflare.apiUrl,
    // INTERNAL_API_SECRET_KEY intentionally NOT exposed to the client bundle.
    // Frontend authenticates via Supabase JWT tokens only.
  },
};

export default nextConfig;
