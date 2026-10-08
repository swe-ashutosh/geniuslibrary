/**
 * [WEB • APP] PWA Manifest Route (/manifest.webmanifest)
 *
 * App name, icons, theme colors — generated from BRAND_CONFIG.
 */

import type { MetadataRoute } from "next";
import { BRAND_CONFIG } from "@/lib/config";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND_CONFIG.fullName,
    short_name: BRAND_CONFIG.shortName,
    description: BRAND_CONFIG.description,
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["standalone"],
    prefer_related_applications: false,
    background_color: BRAND_CONFIG.colors.darkNavy,
    theme_color: BRAND_CONFIG.colors.darkNavy,
    orientation: "portrait",
    categories: ["education", "productivity", "utilities"],
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
    shortcuts: [
      {
        name: "Student Portal",
        short_name: "Student",
        url: "/student/",
        description: "Access your desk, attendance, and fee status",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Messages & Inquiries",
        short_name: "Messages",
        url: "/student/messages/",
        description: "Live chat with Library Administration and Staff",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Admin Portal",
        short_name: "Admin",
        url: "/admin/",
        description: "Manage students, seats, attendance, and fees",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
    ],
  };
}
