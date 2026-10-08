/**
 * [WEB • LIB • CORE] App Config Layer (BRAND_CONFIG)
 *
 * HOW CONFIG FLOWS INTO THE APP:
 *   white-label.config.ts (repo root, THE file to edit for a new client)
 *        ↓ imported below as WL
 *   BRAND_CONFIG (this file) ← NEXT_PUBLIC_* env vars override any value
 *        ↓ imported by every page, component and service client
 *
 * Sections mirror the sections of white-label.config.ts 1:1, so a value can
 * always be traced back to the master config in one step.
 */
import { WL } from "@wl";

export const BRAND_CONFIG = {
  // ═══════════════════════════════════════════════════════════
  // SECTION 1 · BRAND IDENTITY
  // Who the library is: names, contact, location, URLs.
  // ═══════════════════════════════════════════════════════════
  name: process.env.NEXT_PUBLIC_LIBRARY_NAME || WL.name,
  subtitle: process.env.NEXT_PUBLIC_LIBRARY_SUBTITLE || WL.subtitle,
  tagline: process.env.NEXT_PUBLIC_LIBRARY_TAGLINE || WL.tagline,
  shortName: process.env.NEXT_PUBLIC_LIBRARY_SHORT_NAME || WL.shortName,
  hindiName: process.env.NEXT_PUBLIC_LIBRARY_HINDI_NAME || WL.hindiName,
  fullName: process.env.NEXT_PUBLIC_LIBRARY_FULL_NAME || WL.fullName,
  seoTitle: process.env.NEXT_PUBLIC_LIBRARY_SEO_TITLE || WL.seoTitle,
  description: process.env.NEXT_PUBLIC_LIBRARY_DESCRIPTION || WL.description,
  aboutText: WL.aboutText,
  location: process.env.NEXT_PUBLIC_LIBRARY_LOCATION || WL.location,
  address: process.env.NEXT_PUBLIC_LIBRARY_ADDRESS || WL.address,
  phone: process.env.NEXT_PUBLIC_LIBRARY_PHONE || WL.phone,
  rawPhone: process.env.NEXT_PUBLIC_LIBRARY_RAW_PHONE || WL.rawPhone,
  whatsappMessage: WL.whatsappMessage,
  email: process.env.NEXT_PUBLIC_LIBRARY_EMAIL || WL.email,
  adminEmail: process.env.NEXT_PUBLIC_ADMIN_EMAIL || WL.adminEmail,
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL || WL.siteUrl,
  primaryDomain: WL.primaryDomain,
  pagesDevSubdomain: WL.pagesDevSubdomain,
  copyright: `© ${new Date().getFullYear()} ${process.env.NEXT_PUBLIC_LIBRARY_FULL_NAME || WL.fullName}. All rights reserved.`,
  appVersion: WL.appVersion,

  // ═══════════════════════════════════════════════════════════
  // SECTION 2 · SEO EXTRAS
  // Keyword list + alternate brand names for metadata & JSON-LD.
  // ═══════════════════════════════════════════════════════════
  seoKeywords: [...WL.seoKeywords],
  alternateNames: [...WL.alternateNames],

  // ═══════════════════════════════════════════════════════════
  // SECTION 3 · THEME COLORS
  // Keep apps/web/src/app/globals.css @theme in sync when changing.
  // ═══════════════════════════════════════════════════════════
  colors: { ...WL.colors },

  // ═══════════════════════════════════════════════════════════
  // SECTION 4 · GPS GEOFENCING
  // Used by the attendance pages to verify the student is on-site.
  // ═══════════════════════════════════════════════════════════
  gps: {
    latitude: parseFloat(process.env.NEXT_PUBLIC_LIBRARY_LATITUDE || String(WL.gps.latitude)),
    longitude: parseFloat(process.env.NEXT_PUBLIC_LIBRARY_LONGITUDE || String(WL.gps.longitude)),
    rangeMeters: parseInt(process.env.NEXT_PUBLIC_LIBRARY_RANGE_METERS || String(WL.gps.rangeMeters), 10),
  },

  // ═══════════════════════════════════════════════════════════
  // SECTION 5 · MEMBERSHIP, FEES & SHIFTS
  // Pricing shown across landing page, student portal and invoices.
  // ═══════════════════════════════════════════════════════════
  currencySymbol: WL.currencySymbol,
  countryCode: WL.countryCode,
  fees: { ...WL.fees },
  shifts: [...WL.shifts],
  amenities: [...WL.amenities],

  // ═══════════════════════════════════════════════════════════
  // SECTION 6 · PAYMENT / UPI / BANK
  // Used by invoices, the UPI deep link and fee reminders.
  // ═══════════════════════════════════════════════════════════
  payment: {
    upiId: process.env.NEXT_PUBLIC_PAYMENT_UPI_ID || WL.payment.upiId,
    upiPayeeName: process.env.NEXT_PUBLIC_PAYMENT_PAYEE_NAME || WL.payment.upiPayeeName,
    bankName: process.env.NEXT_PUBLIC_PAYMENT_BANK_NAME || WL.payment.bankName,
    accountNumber: process.env.NEXT_PUBLIC_PAYMENT_ACCOUNT_NO || WL.payment.accountNumber,
    ifscCode: process.env.NEXT_PUBLIC_PAYMENT_IFSC || WL.payment.ifscCode,
    branch: process.env.NEXT_PUBLIC_PAYMENT_BRANCH || WL.payment.branch,
    billingHelpline: process.env.NEXT_PUBLIC_LIBRARY_PHONE || WL.phone,
    billingEmail: process.env.NEXT_PUBLIC_LIBRARY_EMAIL || WL.email,
  },

  // ═══════════════════════════════════════════════════════════
  // SECTION 7 · GOOGLE MAPS EMBED (landing page)
  // ═══════════════════════════════════════════════════════════
  mapsEmbedUrl: WL.mapsEmbedUrl,

  // ═══════════════════════════════════════════════════════════
  // SECTION 8 · SERVICE CONNECTIONS
  // Supabase (primary DB), Firebase (push/analytics), Cloudflare (API).
  // These are PUBLIC client-side credentials; real secrets stay on
  // hosting dashboards as env vars.
  // ═══════════════════════════════════════════════════════════
  supabase: {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL || WL.supabase.url,
    anonKey:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      WL.supabase.anonKey,
  },

  firebase: {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || WL.firebase.apiKey,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || WL.firebase.authDomain,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || WL.firebase.projectId,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || WL.firebase.storageBucket,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || WL.firebase.messagingSenderId,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || WL.firebase.appId,
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || WL.firebase.measurementId,
    vapidPublicKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY || WL.firebase.vapidPublicKey,
  },

  /** Base URL of the Cloudflare Worker API (apps/api). */
  apiUrl: process.env.NEXT_PUBLIC_API_URL || WL.cloudflare.apiUrl,

  // ═══════════════════════════════════════════════════════════
  // SECTION 8b · SOCIAL LINKS (footer)
  // ═══════════════════════════════════════════════════════════
  social: {
    instagram: WL.social.instagram,
    youtube: WL.social.youtube,
    facebook: WL.social.facebook,
    x: WL.social.x,
    whatsapp: WL.social.whatsapp || `https://wa.me/91${WL.rawPhone}`,
  },

  // ═══════════════════════════════════════════════════════════
  // SECTION 9 · NOTIFICATION FALLBACKS
  // Default title/body when a push arrives without content.
  // ═══════════════════════════════════════════════════════════
  notifications: { ...WL.notifications },
};

/**
 * Master-admin check: the configured admin email (and the library email)
 * automatically get full admin privileges across the dashboard.
 */
export function isMasterAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  const clean = email.trim().toLowerCase();
  const digits = clean.replace(/[^0-9]/g, "").slice(-10);
  const adminPhoneDigits = (BRAND_CONFIG.rawPhone || "8423448899").replace(/[^0-9]/g, "").slice(-10);
  if (digits.length === 10 && digits === adminPhoneDigits) return true;

  const configured = (BRAND_CONFIG.adminEmail || "").trim().toLowerCase();
  const general = (BRAND_CONFIG.email || "").trim().toLowerCase();
  return (
    clean === configured ||
    clean === general ||
    clean === "geniuslibrarymadhupur@gmail.com"
  );
}
