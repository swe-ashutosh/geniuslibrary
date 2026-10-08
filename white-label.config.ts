/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  WHITE-LABEL MASTER CONFIG — THE ONLY FILE YOU EDIT FOR A NEW CLIENT ║
 * ╠══════════════════════════════════════════════════════════════════════╣
 * ║  Clone repo → edit THIS file → replace apps/web/public/ icons        ║
 * ║  → create Supabase/Firebase/Cloudflare accounts → push to GitHub.   ║
 * ║  The GitHub Action deploys web + API using the values below.        ║
 * ║                                                                      ║
 * ║  Every value here can be OVERRIDDEN by NEXT_PUBLIC_* env vars at    ║
 * ║  build/deploy time (see apps/web/src/lib/config.ts). Env vars win,  ║
 * ║  this file is the baked-in default.                                  ║
 * ║                                                                      ║
 * ║  SECURITY: This file is committed to git, so it holds ONLY public    ║
 * ║  client-side credentials (Supabase anon key, Firebase web config,    ║
 * ║  VAPID public key). True secrets (service-role key, Resend key,      ║
 * ║  API secret, FCM service-account key) live ONLY on hosting           ║
 * ║  dashboards / server-side files, never here.                         ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */

export const WL = {
  // ═══════════════════════════════════════════════════════════════
  // 1. BRAND IDENTITY
  // ═══════════════════════════════════════════════════════════════

  /** Short display name (navbar brand, headers) */
  name: "GENIUS",
  /** Subtitle under the name */
  subtitle: "LIBRARY SONBHADRA",
  /** Compact name used in PWA short_name, notifications, compact UI */
  shortName: "Genius Library",
  /** Marketing tagline */
  tagline: "Premium Self-Study & Knowledge Center",
  /** Hindi display name (hero sections) */
  hindiName: "जीनियस लाईब्रेरी",
  /** Full name used in titles, emails, invoices, legal text */
  fullName: "Genius Library",
  /** SEO <title> for the landing page */
  seoTitle: "Genius Library | Best Library in Madhupur, Sonbhadra",
  /** SEO meta description */
  description:
    "An institutional digital repository blending traditional cultural values with modern smart education. 24/7 AC Study Hall, High-Speed Optical Fiber, Dedicated Power Desks, and Intelligent RFID/QR Access.",
  /** Footer "about us" paragraph */
  aboutText:
    "Genius Library bridges the literary warmth of quiet study spaces with next-generation automation and digital convenience.",
  /** City/Location name (invoices, GPS check-in, SEO) */
  location: "Madhupur, Sonbhadra",
  /** Full postal address */
  address: "Madhupur, Sonbhadra, Uttar Pradesh - 231216",
  /** Display phone */
  phone: "+91 9935066685",
  /** Phone digits only (tel: links, WhatsApp) */
  rawPhone: "9935066685",
  /** Default prefilled WhatsApp enquiry message */
  whatsappMessage: "Hello! I want to check seat availability at Genius Library Madhupur.",
  /** Public contact email */
  email: "geniuslibrarymadhupur@gmail.com",
  /** Admin email — this user automatically gets master admin rights */
  adminEmail: "geniuslibrarymadhupur@gmail.com",
  /** Production site URL (sitemap, robots, canonical, OG) */
  siteUrl: "https://geniuslibrary.librarywale.in",
  /** Primary custom domain (API CORS fallback, redirect checks) */
  primaryDomain: "https://geniuslibrary.com",
  /** pages.dev subdomain to auto-redirect to siteUrl (empty = disabled) */
  pagesDevSubdomain: "geniuslibrary",
  /** App version shown in settings */
  appVersion: "1.0.0",

  // ═══════════════════════════════════════════════════════════════
  // 2. SEO EXTRAS
  // ═══════════════════════════════════════════════════════════════

  seoKeywords: [
    "genius library",
    "the genius library",
    "genius library",
    "genius library",
    "genius library madhupur",
    "the genius library madhupur",
    "genius library madhupur",
    "genius library madhupur",
    "best library in madhupur",
    "library in madhupur",
    "best library in sonbhadra",
    "library in sonbhadra",
    "best library in madhupur sonbhadra",
    "library in madhupur sonbhadra",
    "genius library sonbhadra",
    "genius library sonbhadra",
    "digital library in sonbhadra",
    "self study library near me",
    "24 hours library in sonbhadra",
    "reading room madhupur",
    "study center in madhupur sonbhadra",
    "study center in robertsganj sonbhadra",
    "जीनियस लाइब्रेरी",
    "जीनियस लाइब्रेरी मधुपुर",
    "सोनभद्र लाइब्रेरी",
  ],
  alternateNames: [
    "Abhishek Genius Library",
    "Genius Library",
    "Genius Library Madhupur",
    "जीनियस लाइब्रेरी",
  ],

  // ═══════════════════════════════════════════════════════════════
  // 3. THEME COLORS (keep globals.css @theme in sync when changing)
  // ═══════════════════════════════════════════════════════════════

  colors: {
    darkNavy: "#0A2E5C",
    primaryGold: "#FFC107",
    primaryGoldHover: "#FF8A00",
    lightGray: "#E5E7EB",
    primaryBlue: "#0B5ED7",
    gray: "#6B7280",
    ivory: "#F8FAFC",
    success: "#10B981",
    error: "#EF4444",
    warning: "#F59E0B",
  },

  // ═══════════════════════════════════════════════════════════════
  // 4. GPS GEOFENCING (student check-in verification)
  // ═══════════════════════════════════════════════════════════════

  gps: {
    latitude: 24.830547,
    longitude: 83.058394,
    rangeMeters: 200,
  },

  // ═══════════════════════════════════════════════════════════════
  // 5. MEMBERSHIP, FEES & SHIFTS (24/7 Open • Zero Rigid Shifts)
  // ═══════════════════════════════════════════════════════════════

  currencySymbol: "₹",
  countryCode: "+91",
  fees: {
    standard3hr: 300,
    prime6hr: 500,
    reserveMini: 500,
    reserveBig: 600,
    reserveLocker: 700,
    nightShiftUltra: 500,
  },
  shifts: [
    {
      id: "plan-standard-3hr",
      name: "Standard (3 Hours Pass)",
      category: "Shift-Based Plans (Hourly Packages)",
      time: "Any 3 Hours / Flexible 24/7",
      fee: 300,
      tag: "Flexible",
      bestFor: "Short study sessions, quick revision, or students with limited daily time.",
    },
    {
      id: "plan-prime-6hr",
      name: "Pro / Prime (6 Hours Pass)",
      category: "Shift-Based Plans (Hourly Packages)",
      time: "Any 6 Hours / Flexible 24/7",
      fee: 500,
      tag: "Popular",
      bestFor: "Regular students who need half-day focused seating and environment.",
    },
    {
      id: "plan-reserve-mini",
      name: "Elite / Reserve Mini",
      category: "Reserved Seat Plans (Dedicated Seating)",
      time: "24/7 Dedicated Assigned Desk",
      fee: 500,
      tag: "Dedicated",
      bestFor: "Standard reserved seating for consistent daily focus.",
    },
    {
      id: "plan-reserve-big",
      name: "Prime / Reserve Big",
      category: "Reserved Seat Plans (Dedicated Seating)",
      time: "24/7 Premium Large Reserved Desk",
      fee: 600,
      tag: "Most Popular",
      bestFor: "Extra space / premium large reserved seating for maximum comfort.",
    },
    {
      id: "plan-reserve-locker",
      name: "Max / Reserve Locker",
      category: "Reserved Seat Plans (Dedicated Seating)",
      time: "24/7 Reserved Desk + Personal Locker",
      fee: 700,
      tag: "VIP Access",
      bestFor: "Reserved seating + dedicated personal locker facility for books and belongings.",
    },
    {
      id: "plan-night-ultra",
      name: "Night Shift Ultra",
      category: "Special Shift",
      time: "10:00 PM – 06:00 AM (8 Hours)",
      fee: 500,
      tag: "Night Owls",
      bestFor: "Night owls, competitive exam aspirants, and late-night focused studators.",
    },
  ],
  amenities: [
    { icon: "Wifi", title: "Dual Gigabit Optical Fiber", desc: "300 Mbps high-speed dual backup connection with zero downtime." },
    { icon: "Zap", title: "100% Inverter Power Backup", desc: "Uninterrupted power with dedicated charging points on each desk." },
    { icon: "Snowflake", title: "Centralized Climate Control", desc: "Silent dual split inverters maintaining a pleasant 23°C atmosphere." },
    { icon: "ShieldCheck", title: "24/7 CCTV & RFID Turnstile", desc: "Biometric and smart QR gate pass check-in with high security." },
    { icon: "Droplets", title: "RO UV Water & Hot Kettle", desc: "Pure chilled, normal, and hot drinking water station." },
    { icon: "BookOpen", title: "Ergonomic Lumbar Chairs", desc: "Orthopedic high-back mesh chairs for long 12+ hours study comfort." },
  ],

  // ═══════════════════════════════════════════════════════════════
  // 6. PAYMENT / UPI / BANK (student fee collections)
  // ═══════════════════════════════════════════════════════════════

  payment: {
    upiId: "geniuslibrary@upi",
    upiPayeeName: "Genius Library",
    bankName: "State Bank of India",
    accountNumber: "XXXXXXXX4321",
    ifscCode: "SBIN0001234",
    branch: "Madhupur Branch",
  },

  // ═══════════════════════════════════════════════════════════════
  // 7. GOOGLE MAPS (landing page embed — create a fresh embed per client)
  // ═══════════════════════════════════════════════════════════════

  mapsEmbedUrl:
    "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3620.9744722157093!2d83.05839399999999!3d24.830546599999995!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x398e57fc7a6e14b9%3A0xac45030efb6cde47!2sGenius%20Library!5e0!3m2!1sen!2sin!4v1791393783071!5m2!1sen!2sin",

  // ═══════════════════════════════════════════════════════════════
  // 8. SERVICE CONNECTIONS (public client-side credentials)
  // ═══════════════════════════════════════════════════════════════

  /** Supabase — sole database. URL + anon key are safe to expose publicly. */
  supabase: {
    url: "https://sfcaljbbtwbqjutaczdl.supabase.co",
    anonKey: "sb_publishable__1OrHuPIyPjYX1eAFF4Iiw_OALS76eP",
  },

  /** Firebase — web (client) config for Analytics + Cloud Messaging. */
  firebase: {
    apiKey: "AIzaSyDoZmpI8t4tLoadZfnwrBNdPDSfRLzmZgY",
    authDomain: "geniuslibrary-8f90d.firebaseapp.com",
    projectId: "geniuslibrary-8f90d",
    storageBucket: "geniuslibrary-8f90d.firebasestorage.app",
    messagingSenderId: "294407958890",
    appId: "1:294407958890:web:75e6bb9137347cb86cf513",
    measurementId: "G-PS45SF9Q5T",
    /** VAPID public key for web push subscriptions */
    vapidPublicKey:
      "BMmftFwVwN_EApwZiKJ7ab2NsU3wWnV2tj1fOkb5SF8pnJssWI-MFJQ79DAlOgv4Ajq7hduW48cyp4yw5ekTKBs",
  },

  /** Cloudflare deployment identities (used by CI + clients). */
  cloudflare: {
    /** Base URL of the API Worker */
    apiUrl: "https://genius-library-api.geniuslibrarymadhupur.workers.dev",
    /** Cloudflare Pages project name (CI: pages deploy --project-name) */
    pagesProjectName: "geniuslibrary",
    /** API Worker name (CI: wrangler deploy --name) */
    workerName: "genius-library-api",
  },

  /** Transactional email sender (Resend). Verified domain required. */
  emailFrom: {
    fromName: "Genius Library",
    fromAddress: "noreply@geniuslibrary.librarywale.in",
  },

  /** Social profile URLs (empty = icon hidden in footer). WhatsApp falls back to the library phone. */
  social: {
    instagram: "",
    youtube: "",
    facebook: "",
    x: "",
    whatsapp: "",
  },

  /** Default fallback texts for push notifications */
  notifications: {
    fallbackTitle: "Genius Library",
    fallbackBody: "New alert from Genius Library.",
  },

} as const;

export default WL;
