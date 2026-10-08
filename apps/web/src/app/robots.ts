/**
 * [WEB • APP] Robots Route (/robots.txt)
 *
 * Allows public pages, disallows /admin/, /staff/, /student/, /auth/.
 */

import type { MetadataRoute } from "next";
import { BRAND_CONFIG } from "@/lib/config";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = BRAND_CONFIG.siteUrl;

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin/",
        "/staff/",
        "/student/",
        "/auth/",
        "/attendance/",
        "/forgot-password/",
        "/update-password/",
      ],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
