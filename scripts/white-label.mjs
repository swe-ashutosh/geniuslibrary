#!/usr/bin/env node
/**
 * white-label helper — reads /white-label.config.ts (the single source of truth)
 * and emits derived artifacts so CI and static PWA files follow the same config.
 *
 * Usage:
 *   node scripts/white-label.mjs env   # GitHub Actions: prints KEY=VALUE lines (append to $GITHUB_ENV)
 *   node scripts/white-label.mjs pwa   # Regenerates apps/web/public/pwa-config.js and manifest.json
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG_PATH = join(ROOT, "white-label.config.ts");

/**
 * The config file is a plain object literal, so we evaluate it directly
 * instead of regex-parsing (robust to formatting changes).
 */
function loadWL() {
  const src = readFileSync(CONFIG_PATH, "utf8");
  const start = src.indexOf("export const WL = ") + "export const WL = ".length;
  const end = src.lastIndexOf("as const;");
  if (start < 20 || end <= start) {
    throw new Error(`Could not locate the WL object in ${CONFIG_PATH}`);
  }
  const literal = src.slice(start, end).trim().replace(/;\s*$/, "");
  // The literal contains only data (strings, numbers, arrays, objects) — no code.
  return new Function(`"use strict"; return (${literal});`)();
}

const wl = loadWL();

function cmdEnv() {
  const lines = [
    `WL_SITE_URL=${wl.siteUrl}`,
    `WL_PRIMARY_DOMAIN=${wl.primaryDomain}`,
    `WL_API_URL=${wl.cloudflare.apiUrl}`,
    `WL_PAGES_PROJECT=${wl.cloudflare.pagesProjectName}`,
    `WL_WORKER_NAME=${wl.cloudflare.workerName}`,
    `WL_SUPABASE_URL=${wl.supabase.url}`,
    `WL_SUPABASE_ANON_KEY=${wl.supabase.anonKey}`,
  ];
  process.stdout.write(lines.join("\n") + "\n");
}

function cmdPwa() {
  const publicDir = join(ROOT, "apps", "web", "public");

  // 1. pwa-config.js — consumed by firebase-messaging-sw.js and sw.js
  const pwaConfig = `// AUTO-GENERATED from /white-label.config.ts — DO NOT EDIT BY HAND.
// Regenerate with: node scripts/white-label.mjs pwa
self.PWA_CONFIG = {
  brand: {
    fullName: ${JSON.stringify(wl.fullName)},
    shortName: ${JSON.stringify(wl.shortName)},
    fallbackTitle: ${JSON.stringify(wl.notifications.fallbackTitle)},
    fallbackBody: ${JSON.stringify(wl.notifications.fallbackBody)},
  },
  firebase: ${JSON.stringify(wl.firebase, null, 2)},
};
`;
  writeFileSync(join(publicDir, "pwa-config.js"), pwaConfig);

  // 2. manifest.json — precached by sw.js (the canonical manifest is the
  //    /manifest.webmanifest route in src/app/manifest.ts, this mirrors it).
  const manifest = {
    name: wl.fullName,
    short_name: wl.shortName,
    description: wl.description,
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["standalone"],
    prefer_related_applications: false,
    background_color: wl.colors.darkNavy,
    theme_color: wl.colors.darkNavy,
    orientation: "portrait",
    categories: ["education", "productivity", "utilities"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  writeFileSync(join(publicDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

  console.log("[white-label] Generated apps/web/public/pwa-config.js and manifest.json");
}

const mode = process.argv[2];
if (mode === "env") cmdEnv();
else if (mode === "pwa") cmdPwa();
else {
  console.error("Usage: node scripts/white-label.mjs <env|pwa>");
  process.exit(1);
}
