/**
 * [WEB • PAGE] Landing Page (SSG)
 *
 * Marketing homepage: hero, scroll 3D tour, amenities, gallery,
 * testimonials, FAQ, map + contact. Full SEO metadata + JSON-LD
 * structured data, all branding from BRAND_CONFIG.
 */

import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { HeroBanner } from "@/components/HeroBanner";
import { BRAND_CONFIG } from "@/lib/config";
import {
  Sparkles,
  Wifi,
  Zap,
  Snowflake,
  ShieldCheck,
  Droplets,
  BookOpen,
  ArrowRight,
  User,
  Phone,
  MapPin,
  ChevronRight,
  Award,
  Trophy,
  KeyRound,
  Clock,
  HelpCircle,
  Compass,
  CheckCircle,
  ExternalLink
} from "lucide-react";

// -------------------------------------------------------------
// SEO / AEO / GEO METADATA (SSG - Static Site Generation)
// -------------------------------------------------------------
export const metadata: Metadata = {
  metadataBase: new URL(BRAND_CONFIG.siteUrl),
  title: BRAND_CONFIG.seoTitle,
  description: BRAND_CONFIG.description,
  keywords: BRAND_CONFIG.seoKeywords,
  authors: [
    { name: BRAND_CONFIG.fullName },
    { name: "Abhishek Genius Library" },
  ],
  creator: BRAND_CONFIG.fullName,
  publisher: BRAND_CONFIG.fullName,
  category: "Education & Public Study Facility",
  alternates: {
    canonical: BRAND_CONFIG.siteUrl + "/",
  },
  openGraph: {
    type: "website",
    locale: "en_IN",
    url: BRAND_CONFIG.siteUrl,
    siteName: BRAND_CONFIG.fullName,
    title: BRAND_CONFIG.seoTitle,
    description: BRAND_CONFIG.description,
    images: [
      {
        url: "/library-hall.jpg",
        width: 1200,
        height: 630,
        alt: BRAND_CONFIG.fullName + " Modern 24/7 Study Hall in " + BRAND_CONFIG.location,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: BRAND_CONFIG.seoTitle,
    description: BRAND_CONFIG.description,
    images: ["/library-hall.jpg"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

// -------------------------------------------------------------
// CURATED LIBRARY MOCK TESTS & COMPETITIVE EXAM SERIES
// -------------------------------------------------------------
const DEMO_LIBRARY_EXAMS = [
  {
    id: "ex-1",
    title: "BPSC Prelims Full Mock Test Series",
    category: "Civil Services / PCS",
    totalMarks: 150,
    duration: "120 Mins",
    tag: "Weekly Offline Simulation",
    status: "Answer Key Live",
  },
  {
    id: "ex-2",
    title: "SSC CGL Tier-1 Speed & Accuracy Drill",
    category: "Staff Selection / SSC",
    totalMarks: 200,
    duration: "60 Mins",
    tag: "Full Negative Marking Test",
    status: "Scorecards Declared",
  },
  {
    id: "ex-3",
    title: "UP Police Constable Standard Assessment",
    category: "State Police Exams",
    totalMarks: 300,
    duration: "120 Mins",
    tag: "OMR Based Mock Exam",
    status: "Answer Key Live",
  },
  {
    id: "ex-4",
    title: "Banking IBPS PO Prelims Speed Drill",
    category: "Banking / IBPS",
    totalMarks: 100,
    duration: "60 Mins",
    tag: "Sectional Cutoff Test",
    status: "Scorecards Declared",
  },
  {
    id: "ex-5",
    title: "Railway RRB NTPC General Awareness Mock",
    category: "Railways / RRB",
    totalMarks: 100,
    duration: "90 Mins",
    tag: "Speed Test Series",
    status: "Answer Key Live",
  },
  {
    id: "ex-6",
    title: "Monthly All-India Library Scholarship Challenge",
    category: "Scholarship & Merit",
    totalMarks: 200,
    duration: "120 Mins",
    tag: "Top 3 Rankers Get Fee Waivers",
    status: "Next Test Scheduled",
  },
];

// -------------------------------------------------------------
// AEO / FAQ KNOWLEDGE BASE
// -------------------------------------------------------------
const FAQS = [
  {
    question: "Which is the best library in Madhupur Sonbhadra?",
    answer:
      BRAND_CONFIG.fullName + " is widely rated as the #1 and best self-study library in Madhupur, Sonbhadra. It features 300 Mbps high-speed dual optical fiber Wi-Fi, fully air-conditioned silent study halls, dedicated private cubicles with personal charging ports, 100% uninterrupted inverter & generator power backup, and regular offline mock test assessments for UPSC, PCS, SSC, NEET, and JEE aspirants.",
  },
  {
    question: `Where is ${BRAND_CONFIG.fullName} located in Sonbhadra?`,
    answer:
      BRAND_CONFIG.fullName + " is located at Main Market Road, Madhupur, District Sonbhadra, Uttar Pradesh 231216. It is conveniently situated near central transport routes with ample two-wheeler and four-wheeler parking.",
  },
  {
    question: "What are the shift timings and is the library open 24 hours?",
    answer:
      "Yes, " + BRAND_CONFIG.fullName + " is operational 24 hours a day, 365 days a year. We do not have rigid morning or evening constraints. We offer flexible hourly packages: Standard 3 Hours (₹300/mo) and Pro/Prime 6 Hours (₹500/mo), Special Night Shift Ultra (₹500/mo), and 24/7 Dedicated Reserved Seating: Elite Mini (₹500/mo), Prime Big (₹600/mo), and Max Locker (₹700/mo).",
  },
  {
    question: "What facilities are provided to students at the library?",
    answer:
      "Facilities include 300 Mbps high-speed dual optical fiber Wi-Fi, 100% uninterrupted inverter & generator power backup, fully air-conditioned silent study hall, ergonomic cushioned chairs, dedicated study cubicles with personal charging sockets & reading lamps, RO chilled & warm drinking water, 24/7 CCTV surveillance, and a reference book collection for competitive exams.",
  },
  {
    question: `What are the monthly fees for ${BRAND_CONFIG.shortName}?`,
    answer:
      BRAND_CONFIG.fullName + " offers affordable monthly student subscriptions starting from just ₹300/month with zero admission fee and zero security deposit. Every student receives high-speed Wi-Fi, power backup, and full access to library amenities.",
  },
  {
    question: "Do I get a permanent fixed desk for my shift?",
    answer:
      "Yes. Every enrolled student is assigned a dedicated desk number for their designated shift, ensuring your study space is always reserved and ready when you arrive.",
  },
  {
    question: "How can I book a seat or contact administration?",
    answer:
      `You can reserve a seat online via our Student Portal or contact the front desk directly by calling or messaging on WhatsApp at ${BRAND_CONFIG.phone}.`,
  },
];

// -------------------------------------------------------------
// HOMEPAGE COMPONENT (100% SSG - Zero Dynamic DB Latency)
// -------------------------------------------------------------
export default function HomePage() {
  // 1. Google Search Site Name Schema (schema.org/WebSite)
  // Ensures Google displays "Genius Library" as the site title above the URL!
  const websiteStructuredData = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": BRAND_CONFIG.siteUrl + "/#website",
    name: BRAND_CONFIG.fullName,
    alternateName: [
      ...BRAND_CONFIG.alternateNames,
      "Best Library in " + BRAND_CONFIG.location,
      "Library in " + BRAND_CONFIG.location,
    ],
    url: BRAND_CONFIG.siteUrl + "/",
    publisher: {
      "@type": "Organization",
      "@id": BRAND_CONFIG.siteUrl + "/#organization",
      name: BRAND_CONFIG.fullName,
      logo: {
        "@type": "ImageObject",
        url: BRAND_CONFIG.siteUrl + "/icon-512.png",
        width: 512,
        height: 512,
      },
    },
  };

  // 2. Schema.org LocalBusiness / Library structured data for GEO & Local SEO
  const libraryStructuredData = {
    "@context": "https://schema.org",
    "@type": ["Library", "LocalBusiness", "EducationalOrganization"],
    "@id": BRAND_CONFIG.siteUrl + "/#library",
    name: BRAND_CONFIG.fullName,
    alternateName: [
      ...BRAND_CONFIG.alternateNames,
      "Best Library in " + BRAND_CONFIG.location,
    ],
    description: BRAND_CONFIG.description,
    url: BRAND_CONFIG.siteUrl,
    telephone: "+91" + BRAND_CONFIG.rawPhone,
    email: BRAND_CONFIG.email,
    contactPoint: {
      "@type": "ContactPoint",
      telephone: "+91" + BRAND_CONFIG.rawPhone,
      contactType: "customer support",
      email: BRAND_CONFIG.email,
      availableLanguage: ["Hindi", "English"],
      areaServed: "IN",
    },
    priceRange: "₹300 - ₹700",
    currenciesAccepted: "INR",
    paymentAccepted: "Cash, UPI, PhonePe, Google Pay, Net Banking",
    image: BRAND_CONFIG.siteUrl + "/library-hall.jpg",
    logo: BRAND_CONFIG.siteUrl + "/icon-512.png",
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: "4.9",
      reviewCount: "198",
      bestRating: "5",
      worstRating: "1",
    },
    address: {
      "@type": "PostalAddress",
      streetAddress: "Main Market Road, Madhupur",
      addressLocality: "Madhupur, Sonbhadra",
      addressRegion: "Uttar Pradesh",
      postalCode: "231216",
      addressCountry: "IN",
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: BRAND_CONFIG.gps.latitude,
      longitude: BRAND_CONFIG.gps.longitude,
    },
    openingHoursSpecification: [
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: [
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday",
          "Sunday",
        ],
        opens: "00:00",
        closes: "23:59",
      },
    ],
    amenityFeature: [
      { "@type": "LocationFeatureSpecification", name: "High-Speed Optical Fiber Wi-Fi", value: true },
      { "@type": "LocationFeatureSpecification", name: "Air Conditioned Study Hall", value: true },
      { "@type": "LocationFeatureSpecification", name: "100% Inverter & Power Backup", value: true },
      { "@type": "LocationFeatureSpecification", name: "Dedicated Charging Ports per Desk", value: true },
      { "@type": "LocationFeatureSpecification", name: "RO Chilled & Warm Drinking Water", value: true },
      { "@type": "LocationFeatureSpecification", name: "24/7 CCTV Security", value: true },
      { "@type": "LocationFeatureSpecification", name: "Ergonomic Chairs", value: true },
      { "@type": "LocationFeatureSpecification", name: "Competitive Exam Reference Library", value: true },
    ],
    areaServed: [
      { "@type": "AdministrativeArea", name: "Madhupur" },
      { "@type": "AdministrativeArea", name: "Sonbhadra" },
      { "@type": "AdministrativeArea", name: "Robertsganj" },
      { "@type": "AdministrativeArea", name: "Ghorawal" },
      { "@type": "AdministrativeArea", name: "Chopan" },
      { "@type": "AdministrativeArea", name: "Uttar Pradesh" },
    ],
  };

  // 3. Schema.org FAQ structured data for AEO (Perplexity, Google SGE, AI Overviews)
  const faqStructuredData = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };

  return (
    <main className="min-h-screen bg-[#F8FAFC] text-[#0A2E5C] dark:bg-[#141A24] dark:text-zinc-100 flex flex-col selection:bg-[#FFC107] selection:text-[#0A2E5C]">
      {/* Inject Structured Data for Google Site Name, Local SEO, Rating Stars & AI Engines */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteStructuredData) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(libraryStructuredData) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqStructuredData) }}
      />

      <Navbar />

      {/* ------------------------------------------------------------- */}
      {/* 1. DISTINCTIVE HERO BANNER WITH INSTANT ADMISSION & TOUR CTA */}
      {/* ------------------------------------------------------------- */}
      <HeroBanner />

      {/* Key Quick Metrics Band */}
      <section className="relative z-10 -mt-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mb-12">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center bg-[#0A2E5C] text-white p-4 sm:p-6 rounded-3xl border border-[#FFC107]/30 shadow-2xl backdrop-blur-md">
          <div className="p-3 rounded-2xl bg-white/5 border border-white/5">
            <div className="text-2xl sm:text-3xl font-black text-[#FFC107]">48</div>
            <div className="text-xs font-semibold text-zinc-300 mt-0.5">Dedicated Desks</div>
          </div>
          <div className="p-3 rounded-2xl bg-white/5 border border-white/5">
            <div className="text-2xl sm:text-3xl font-black text-[#FFC107]">300 Mbps</div>
            <div className="text-xs font-semibold text-zinc-300 mt-0.5">Dual Optical Fiber</div>
          </div>
          <div className="p-3 rounded-2xl bg-white/5 border border-white/5">
            <div className="text-2xl sm:text-3xl font-black text-[#FFC107]">100%</div>
            <div className="text-xs font-semibold text-zinc-300 mt-0.5">Power & Inverter Backup</div>
          </div>
          <div className="p-3 rounded-2xl bg-white/5 border border-white/5">
            <div className="text-2xl sm:text-3xl font-black text-[#FFC107]">24x7</div>
            <div className="text-xs font-semibold text-zinc-300 mt-0.5">Open All 365 Days</div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- */}
      {/* 2. ABOUT US & GEO PROXIMITY SECTION */}
      {/* ------------------------------------------------------------- */}
      <section
        id="about"
        aria-label={`About ${BRAND_CONFIG.fullName}`}
        className="py-16 bg-[#F8FAFC] dark:bg-[#141A24] border-b border-[#E5E7EB]/60 dark:border-zinc-800"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <div>
              <span className="text-xs font-bold uppercase tracking-widest text-[#0B5ED7]">
                Who We Are • Local Legacy
              </span>
              <h2 className="text-3xl font-extrabold text-[#0A2E5C] dark:text-white mt-1 mb-6">
                Redefining the Self-Study Experience in Madhupur, Sonbhadra
              </h2>
              <div className="space-y-4 text-sm text-[#6B7280] dark:text-zinc-300 leading-relaxed">
                <p>
                  At <strong>{BRAND_CONFIG.fullName} ({BRAND_CONFIG.hindiName})</strong>, we believe that
                  unbroken focus in a calm, disciplined environment is the cornerstone of academic excellence.
                  Established in Madhupur, District Sonbhadra, our facility bridges traditional scholarly values
                  with high-speed modern educational infrastructure.
                </p>
                <p>
                  Built specifically for candidates preparing for <strong>UPSC, State PCS, SSC CGL, Banking,
                  NEET, JEE, and Board Examinations</strong>, our facility eliminates ambient distractions.
                  With high-speed dual optical fiber, ergonomic lumbar-support chairs, and individual desk
                  charging points, you can study comfortably for 10 to 12 hours every day.
                </p>
                <p>
                  Centrally located in Madhupur, Sonbhadra, we are the only dedicated study library in the
                  sub-division providing a fully air-conditioned silent hall, 100% power backup, and round-the-clock
                  security monitoring.
                </p>
              </div>

              {/* GEO Key Highlights */}
              <div className="mt-6 grid grid-cols-2 gap-3 pt-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-[#0A2E5C] dark:text-zinc-200">
                  <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>Central Madhupur Location</span>
                </div>
                <div className="flex items-center gap-2 text-xs font-semibold text-[#0A2E5C] dark:text-zinc-200">
                  <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>Pin-Drop Silence Zone</span>
                </div>
                <div className="flex items-center gap-2 text-xs font-semibold text-[#0A2E5C] dark:text-zinc-200">
                  <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>24/7 CCTV Monitored</span>
                </div>
                <div className="flex items-center gap-2 text-xs font-semibold text-[#0A2E5C] dark:text-zinc-200">
                  <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>Safe for Female Aspirants</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-4">
                <div className="rounded-2xl overflow-hidden shadow-md">
                  <Image
                    src="/library-hall.jpg"
                    alt={`${BRAND_CONFIG.fullName} Study Hall in ${BRAND_CONFIG.location}`}
                    width={400}
                    height={300}
                    className="object-cover w-full h-48 hover:scale-105 transition-transform duration-500"
                  />
                </div>
                <div className="rounded-2xl overflow-hidden shadow-md">
                  <Image
                    src="/library-lounge.jpg"
                    alt="Digital Library Reading Area Madhupur"
                    width={400}
                    height={300}
                    className="object-cover w-full h-32 hover:scale-105 transition-transform duration-500"
                  />
                </div>
              </div>
              <div className="rounded-2xl overflow-hidden shadow-md mt-8">
                <Image
                  src="/library-cubicle.jpg"
                  alt={`Ergonomic Study Desk and Cubicle at ${BRAND_CONFIG.shortName}`}
                  width={400}
                  height={500}
                  className="object-cover w-full h-full hover:scale-105 transition-transform duration-500"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- */}
      {/* 3. GALLERY SECTION */}
      {/* ------------------------------------------------------------- */}
      <section
        id="gallery"
        aria-label="Library Study Hall Gallery"
        className="py-14 bg-white dark:bg-[#0A2E5C]/40 border-y border-[#E5E7EB]/60 dark:border-zinc-800"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <span className="text-xs font-bold uppercase tracking-widest text-[#0B5ED7]">
              Study Hall Tour
            </span>
            <h2 className="text-2xl sm:text-3xl font-black text-[#0A2E5C] dark:text-white mt-1">
              Explore Our Study Infrastructure
            </h2>
            <p className="text-xs sm:text-sm text-[#6B7280] dark:text-zinc-400 mt-2">
              Comfortable, sound-insulated cubicles and spacious reading spaces tailored for long, intensive revision sessions.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="overflow-hidden rounded-3xl border border-[#E5E7EB] shadow-xl group">
              <div className="relative aspect-[4/3] w-full">
                <Image
                  src="/library-hall.jpg"
                  alt={`Spacious Silent Study Hall at ${BRAND_CONFIG.fullName}`}
                  fill
                  sizes="(max-width: 768px) 100vw, 33vw"
                  className="object-cover group-hover:scale-105 transition-transform duration-700"
                />
              </div>
            </div>

            <div className="overflow-hidden rounded-3xl border border-[#E5E7EB] shadow-xl group">
              <div className="relative aspect-[4/3] w-full">
                <Image
                  src="/library-cubicle.jpg"
                  alt="Premium Study Cubicle with Individual Socket"
                  fill
                  sizes="(max-width: 768px) 100vw, 33vw"
                  className="object-cover group-hover:scale-105 transition-transform duration-700"
                />
              </div>
            </div>

            <div className="overflow-hidden rounded-3xl border border-[#E5E7EB] shadow-xl group md:col-span-2 lg:col-span-1">
              <div className="relative aspect-[4/3] w-full">
                <Image
                  src="/library-lounge.jpg"
                  alt="Digital Library Lounge and Discussion Space"
                  fill
                  sizes="(max-width: 768px) 100vw, 33vw"
                  className="object-cover group-hover:scale-105 transition-transform duration-700"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- */}
      {/* 4. MEMBERSHIP PLANS & PRICING (24/7 Open • Zero Rigid Shifts) */}
      {/* ------------------------------------------------------------- */}
      <section
        id="shifts"
        aria-label="24/7 Flexible Study Plans and Dedicated Seating Subscriptions"
        className="py-16 bg-[#F8FAFC] dark:bg-[#141A24]"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <span className="text-xs font-bold uppercase tracking-widest text-[#0B5ED7]">
              Open 24/7 • No Rigid Shifts • Zero Admission Fee
            </span>
            <h2 className="text-3xl font-extrabold text-[#0A2E5C] dark:text-white mt-1">
              Membership Plans &amp; Pricing
            </h2>
            <p className="text-xs sm:text-sm text-[#6B7280] dark:text-zinc-400 mt-1">
              Operational 24 hours a day, 365 days a year. No morning or evening restrictions, choose flexible hourly passes or dedicated 24/7 reserved seating.
            </p>
          </div>

          {/* 1. Shift-Based Plans (Hourly Packages) */}
          <div className="mb-10">
            <div className="flex items-center gap-2 mb-4">
              <span className="px-2.5 py-1 rounded-lg bg-blue-100 text-[#0B5ED7] dark:bg-blue-950/60 dark:text-blue-300 text-xs font-black uppercase tracking-wider">
                1. Shift-Based Plans
              </span>
              <h3 className="text-lg font-bold text-[#0A2E5C] dark:text-white">
                Hourly Packages (Flexible 24/7 Daily Slots)
              </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {BRAND_CONFIG.shifts
                .filter((s) => s.category === "Shift-Based Plans (Hourly Packages)")
                .map((shift) => (
                  <div
                    key={shift.id}
                    className="relative flex flex-col justify-between rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C] hover:shadow-md transition-all"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs uppercase font-bold text-[#0B5ED7]">{shift.tag}</span>
                        <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                          24/7 Open Access
                        </span>
                      </div>

                      <h4 className="text-lg font-bold text-[#0A2E5C] dark:text-white mt-2">
                        {shift.name}
                      </h4>
                      <p className="text-xs text-[#6B7280] dark:text-zinc-400 mt-1">
                        Timing: <strong>{shift.time}</strong>
                      </p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-300 mt-1 font-medium">
                        <strong>Best for:</strong> {shift.bestFor}
                      </p>

                      <div className="mt-4 flex items-baseline gap-1">
                        <span className="text-3xl font-black text-[#0A2E5C] dark:text-white">
                          ₹{shift.fee}
                        </span>
                        <span className="text-xs text-[#0B5ED7]">/month</span>
                      </div>

                      <ul className="mt-5 space-y-2 border-t border-[#E5E7EB]/60 pt-4 text-xs text-[#6B7280] dark:text-zinc-300">
                        <li className="flex items-center gap-2">
                          <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
                          Flexible daily study hours
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
                          High-Speed Optical Wi-Fi &amp; Full AC
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
                          100% Inverter &amp; Generator Power Backup
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
                          RO Water &amp; Silent Study Atmosphere
                        </li>
                      </ul>
                    </div>

                    <div className="mt-6">
                      <Link
                        href="/login/?role=student"
                        className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold transition bg-[#F8FAFC] text-[#0A2E5C] border border-[#E5E7EB] hover:bg-[#E5E7EB]/30 dark:bg-zinc-800 dark:text-zinc-200"
                      >
                        <span>Choose {shift.name}</span>
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {/* 2. Reserved Seat Plans (Dedicated Seating) */}
          <div className="mb-10">
            <div className="flex items-center gap-2 mb-4">
              <span className="px-2.5 py-1 rounded-lg bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300 text-xs font-black uppercase tracking-wider">
                2. Reserved Seat Plans
              </span>
              <h3 className="text-lg font-bold text-[#0A2E5C] dark:text-white">
                Dedicated Seating (24/7 Fixed Permanent Desk)
              </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {BRAND_CONFIG.shifts
                .filter((s) => s.category === "Reserved Seat Plans (Dedicated Seating)")
                .map((shift) => {
                  const isBest = shift.id === "plan-reserve-big";
                  const isLocker = shift.id === "plan-reserve-locker";
                  return (
                    <div
                      key={shift.id}
                      className={`relative flex flex-col justify-between rounded-2xl border p-6 transition-all ${
                        isBest
                          ? "border-[#FFC107] bg-white shadow-xl shadow-[#FFC107]/10 dark:bg-[#0A2E5C] ring-2 ring-[#FFC107]"
                          : isLocker
                          ? "border-purple-300 dark:border-purple-800 bg-white shadow-xs dark:bg-[#0A2E5C]"
                          : "border-[#E5E7EB] bg-white shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C] hover:shadow-md"
                      }`}
                    >
                      {isBest && (
                        <span className="absolute -top-3 right-6 rounded-full bg-[#0A2E5C] px-3 py-0.5 text-[11px] font-bold text-[#FFC107] border border-[#FFC107] shadow-xs">
                          🔥 Most Popular
                        </span>
                      )}
                      {isLocker && (
                        <span className="absolute -top-3 right-6 rounded-full bg-purple-900 px-3 py-0.5 text-[11px] font-bold text-purple-200 border border-purple-400 shadow-xs">
                          💎 Desk + Personal Locker
                        </span>
                      )}

                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs uppercase font-bold text-[#0B5ED7]">{shift.tag}</span>
                          <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                            Fixed Reserved
                          </span>
                        </div>

                        <h4 className="text-lg font-bold text-[#0A2E5C] dark:text-white mt-2">
                          {shift.name}
                        </h4>
                        <p className="text-xs text-[#6B7280] dark:text-zinc-400 mt-1">
                          Timing: <strong>{shift.time}</strong>
                        </p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-300 mt-1 font-medium">
                          <strong>Feature:</strong> {shift.bestFor}
                        </p>

                        <div className="mt-4 flex items-baseline gap-1">
                          <span className="text-3xl font-black text-[#0A2E5C] dark:text-white">
                            ₹{shift.fee}
                          </span>
                          <span className="text-xs text-[#0B5ED7]">/month</span>
                        </div>

                        <ul className="mt-5 space-y-2 border-t border-[#E5E7EB]/60 pt-4 text-xs text-[#6B7280] dark:text-zinc-300">
                          <li className="flex items-center gap-2">
                            <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
                            Permanent Dedicated Seat Assigned
                          </li>
                          <li className="flex items-center gap-2">
                            <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
                            {isLocker ? "Private Lockable Cabinet / Locker" : "Personal Charging Socket & Lamp"}
                          </li>
                          <li className="flex items-center gap-2">
                            <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
                            Unrestricted 24x7 Entry &amp; Exit
                          </li>
                          <li className="flex items-center gap-2">
                            <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
                            Ergonomic High-Back Comfort Chair
                          </li>
                        </ul>
                      </div>

                      <div className="mt-6">
                        <Link
                          href="/login/?role=student"
                          className={`w-full inline-flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold transition ${
                            isBest
                              ? "bg-[#0A2E5C] text-[#FFC107] border border-[#FFC107] hover:bg-[#141A24]"
                              : "bg-[#F8FAFC] text-[#0A2E5C] border border-[#E5E7EB] hover:bg-[#E5E7EB]/30 dark:bg-zinc-800 dark:text-zinc-200"
                          }`}
                        >
                          <span>Reserve {shift.name}</span>
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* 3. Special Shift */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <span className="px-2.5 py-1 rounded-lg bg-indigo-100 text-indigo-900 dark:bg-indigo-950/60 dark:text-indigo-300 text-xs font-black uppercase tracking-wider">
                3. Special Shift
              </span>
              <h3 className="text-lg font-bold text-[#0A2E5C] dark:text-white">
                Night Shift Ultra (Late Night Silent Study)
              </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {BRAND_CONFIG.shifts
                .filter((s) => s.category === "Special Shift")
                .map((shift) => (
                  <div
                    key={shift.id}
                    className="relative flex flex-col justify-between rounded-2xl border border-indigo-200 dark:border-indigo-900 bg-white p-6 shadow-xs dark:bg-[#0A2E5C] hover:shadow-md transition-all md:col-span-2"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs uppercase font-extrabold text-indigo-600 dark:text-indigo-400">{shift.tag}</span>
                          <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                            High Security • CCTV Guarded
                          </span>
                        </div>
                        <h4 className="text-xl font-bold text-[#0A2E5C] dark:text-white mt-1">
                          {shift.name}
                        </h4>
                        <p className="text-xs text-[#6B7280] dark:text-zinc-400 mt-1">
                          Timing: <strong>{shift.time}</strong>
                        </p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-300 mt-1 font-medium">
                          <strong>Best for:</strong> {shift.bestFor}
                        </p>
                      </div>

                      <div className="flex items-baseline gap-1 sm:text-right shrink-0">
                        <span className="text-3xl font-black text-[#0A2E5C] dark:text-white">
                          ₹{shift.fee}
                        </span>
                        <span className="text-xs text-[#0B5ED7]">/month</span>
                      </div>
                    </div>

                    <div className="mt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                      <div className="text-xs text-[#6B7280] dark:text-zinc-300">
                        ✓ Absolute pin-drop silence, optimal temperature control, warm water kettle and round-the-clock emergency support.
                      </div>
                      <Link
                        href="/login/?role=student"
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl px-5 py-2.5 text-xs font-bold transition bg-[#0A2E5C] text-white hover:bg-[#141A24] shrink-0"
                      >
                        <span>Enroll for {shift.name}</span>
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- */}
      {/* 5. LIBRARY MOCK TESTS & EXAM ASSESSMENT SERIES */}
      {/* ------------------------------------------------------------- */}
      <section
        id="exams"
        aria-label="Library Mock Tests and Exam Assessments"
        className="py-16 bg-white dark:bg-[#0A2E5C]/50 border-y border-[#E5E7EB]/60 dark:border-zinc-800"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <span className="text-xs font-bold uppercase tracking-widest text-[#0B5ED7]">
              Test Hall &amp; Assessment Desk
            </span>
            <h2 className="text-3xl font-black text-[#0A2E5C] dark:text-white mt-1">
              Regular Library Mock Tests &amp; Answer Keys
            </h2>
            <p className="text-xs sm:text-sm text-[#6B7280] dark:text-zinc-400 mt-1">
              Enrolled members participate in weekly offline simulation tests in the library with real OMR evaluation, instant digital answer keys, and student rank tracking on the student portal.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {DEMO_LIBRARY_EXAMS.map((ex) => (
              <div
                key={ex.id}
                className="rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC]/50 p-5 shadow-xs transition hover:bg-white hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900/50 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="rounded-xl bg-[#0A2E5C] p-2.5 text-[#FFC107]">
                      <Award className="h-5 w-5" />
                    </div>
                    <span className="rounded-full bg-[#FFC107]/20 px-2.5 py-0.5 text-[10px] font-bold text-[#0A2E5C] dark:text-[#FFC107]">
                      {ex.category}
                    </span>
                  </div>

                  <h3 className="mt-3 text-base font-bold text-[#0A2E5C] dark:text-white line-clamp-1">
                    {ex.title}
                  </h3>
                  <p className="text-xs text-[#0B5ED7] mt-0.5">Duration: {ex.duration} • Total: {ex.totalMarks} Marks</p>
                  <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mt-1">
                    Format: {ex.tag}
                  </p>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-[#E5E7EB]/60 pt-3 text-[11px] text-[#6B7280] dark:text-zinc-400">
                  <span className="flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400">
                    <KeyRound className="h-3.5 w-3.5" /> {ex.status}
                  </span>
                  <Link 
                    href="/login/?role=student"
                    className="font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400"
                  >
                    View Scores →
                  </Link>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 text-center">
            <p className="text-xs text-[#0B5ED7]">
              * Mock tests are conducted on designated Sundays and weekday evenings inside the library premises for all registered students.
            </p>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- */}
      {/* 6. WORLD-CLASS AMENITIES (AEO & GEO Feature Breakdown) */}
      {/* ------------------------------------------------------------- */}
      <section
        id="amenities"
        aria-label="Library Amenities and Infrastructure"
        className="py-16 bg-[#F8FAFC] dark:bg-[#141A24]"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <span className="text-xs font-bold uppercase tracking-widest text-[#0B5ED7]">
              World-Class Infrastructure
            </span>
            <h2 className="text-3xl font-extrabold text-[#0A2E5C] dark:text-white mt-1">
              Engineered for Serious Aspirants
            </h2>
            <p className="text-xs sm:text-sm text-[#6B7280] dark:text-zinc-400 mt-1">
              Everything you need for uninterrupted, high-concentration 10+ hours study sessions in Sonbhadra.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {BRAND_CONFIG.amenities.map((item, idx) => {
              return (
                <div
                  key={idx}
                  className="rounded-2xl border border-[#E5E7EB] bg-white p-6 transition-all hover:shadow-lg dark:border-zinc-800 dark:bg-zinc-900/50"
                >
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#0A2E5C] text-[#FFC107] shadow-xs">
                    {idx === 0 && <Wifi className="h-6 w-6" />}
                    {idx === 1 && <Zap className="h-6 w-6" />}
                    {idx === 2 && <Snowflake className="h-6 w-6" />}
                    {idx === 3 && <ShieldCheck className="h-6 w-6" />}
                    {idx === 4 && <Droplets className="h-6 w-6" />}
                    {idx === 5 && <BookOpen className="h-6 w-6" />}
                  </div>
                  <h3 className="text-lg font-bold text-[#0A2E5C] dark:text-white">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-xs sm:text-sm text-[#6B7280] dark:text-zinc-400 leading-relaxed">
                    {item.desc}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- */}
      {/* 7. STUDENT SUCCESS STORIES / REVIEWS */}
      {/* ------------------------------------------------------------- */}
      <section
        id="testimonials"
        aria-label="Student Reviews and Testimonials"
        className="py-16 bg-gradient-to-b from-[#F8FAFC] to-[#E5E7EB]/30 dark:from-[#141A24] dark:to-[#0A2E5C]"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <span className="text-xs font-bold uppercase tracking-widest text-[#0B5ED7]">
              Scholar Success Stories
            </span>
            <h2 className="text-3xl font-extrabold text-[#0A2E5C] dark:text-white mt-1">
              What Our Scholars Say
            </h2>
            <p className="text-xs sm:text-sm text-[#6B7280] dark:text-zinc-400 mt-2">
              Hear from aspirants achieving their goals at {BRAND_CONFIG.fullName}, {BRAND_CONFIG.location}.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="relative rounded-3xl border border-[#FFC107]/30 bg-white p-8 shadow-xs transition-all hover:shadow-xl dark:border-zinc-800 dark:bg-zinc-900 group">
              <div className="flex text-[#FFC107] mb-4">
                {[1, 2, 3, 4, 5].map((star) => (
                  <svg key={star} className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                ))}
              </div>
              <p className="text-sm text-[#6B7280] dark:text-zinc-300 italic mb-6 leading-relaxed relative z-10">
                &quot;The silent zone is exactly what I needed for my UPSC preparation. The optical fiber is fast, and the ergonomic chairs make 10-hour study stretches comfortable.&quot;
              </p>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0A2E5C] text-[#FFC107] font-bold text-sm">
                  AR
                </div>
                <div>
                  <p className="text-sm font-bold text-[#0A2E5C] dark:text-white">Ananya Rajput</p>
                  <p className="text-xs text-[#0B5ED7]">Civil Services Aspirant • Madhupur</p>
                </div>
              </div>
            </div>

            <div className="relative rounded-3xl border border-[#FFC107]/30 bg-white p-8 shadow-xs transition-all hover:shadow-xl dark:border-zinc-800 dark:bg-zinc-900 group md:-trangray-y-4">
              <div className="flex text-[#FFC107] mb-4">
                {[1, 2, 3, 4, 5].map((star) => (
                  <svg key={star} className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                ))}
              </div>
              <p className="text-sm text-[#6B7280] dark:text-zinc-300 italic mb-6 leading-relaxed relative z-10">
                &quot;Best digital library in Sonbhadra district! Dedicated power sockets at every desk and 100% inverter backup means no interruptions during online lectures.&quot;
              </p>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0B5ED7] text-white font-bold text-sm">
                  VS
                </div>
                <div>
                  <p className="text-sm font-bold text-[#0A2E5C] dark:text-white">Vikram Sharma</p>
                  <p className="text-xs text-[#0B5ED7]">Engineering &amp; Coding Aspirant • Sonbhadra</p>
                </div>
              </div>
            </div>

            <div className="relative rounded-3xl border border-[#FFC107]/30 bg-white p-8 shadow-xs transition-all hover:shadow-xl dark:border-zinc-800 dark:bg-zinc-900 group">
              <div className="flex text-[#FFC107] mb-4">
                {[1, 2, 3, 4, 5].map((star) => (
                  <svg key={star} className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                ))}
              </div>
              <p className="text-sm text-[#6B7280] dark:text-zinc-300 italic mb-6 leading-relaxed relative z-10">
                &quot;The study cubicles are extremely well-designed. Safe atmosphere, very cooperative management, and clean drinking water facilities.&quot;
              </p>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0A2E5C] text-[#FFC107] font-bold text-sm">
                  PK
                </div>
                <div>
                  <p className="text-sm font-bold text-[#0A2E5C] dark:text-white">Priya Kumari</p>
                  <p className="text-xs text-[#0B5ED7]">NEET / Medical Aspirant • Sonbhadra</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- */}
      {/* 8. AEO OPTIMIZED FAQ SECTION (ANSWER ENGINE OPTIMIZATION) */}
      {/* ------------------------------------------------------------- */}
      <section
        id="faq"
        aria-label="Frequently Asked Questions"
        className="py-16 bg-white dark:bg-[#0A2E5C]/40"
      >
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <span className="text-xs font-bold uppercase tracking-widest text-[#0B5ED7] inline-flex items-center gap-1.5">
              <HelpCircle className="h-3.5 w-3.5" />
              Direct Answers • FAQ
            </span>
            <h2 className="text-3xl font-extrabold text-[#0A2E5C] dark:text-white mt-1">
              Frequently Asked Questions
            </h2>
            <p className="text-xs sm:text-sm text-[#6B7280] dark:text-zinc-400 mt-2">
              Authoritative answers about admission, shift timings, rules, and facilities at {BRAND_CONFIG.fullName}.
            </p>
          </div>

          <div className="space-y-4">
            {FAQS.map((faq, index) => (
              <article
                key={index}
                className="rounded-2xl border border-[#E5E7EB]/60 bg-[#F8FAFC]/50 p-6 dark:border-zinc-800 dark:bg-zinc-900/50"
              >
                <h3 className="text-base sm:text-lg font-bold text-[#0A2E5C] dark:text-white mb-2 flex items-start gap-2.5">
                  <span className="text-[#0B5ED7] font-black shrink-0">Q.</span>
                  <span>{faq.question}</span>
                </h3>
                <p className="text-xs sm:text-sm text-[#6B7280] dark:text-zinc-300 pl-6 leading-relaxed">
                  {faq.answer}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- */}
      {/* 9. GEO LOCATION & PHYSICAL CONTACT (LOCAL SEO / GEO) */}
      {/* ------------------------------------------------------------- */}
      <section
        id="contact"
        aria-label="Physical Location and Contact in Madhupur Sonbhadra"
        className="pt-16 pb-28 sm:pb-16 bg-[#F8FAFC] dark:bg-[#0A2E5C]/60 border-t border-[#E5E7EB]/60 dark:border-zinc-800"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
            <div>
              <span className="text-xs font-bold uppercase tracking-widest text-[#0B5ED7] inline-flex items-center gap-1.5">
                <Compass className="h-3.5 w-3.5" />
                Geographic Presence • Local Sonbhadra Hub
              </span>
              <h2 className="text-3xl font-black text-[#0A2E5C] dark:text-white mt-1">
                Visit Us in Madhupur, Sonbhadra
              </h2>
              <p className="text-xs sm:text-sm text-[#6B7280] dark:text-zinc-400 mt-2 leading-relaxed">
                Conveniently located on Main Road, Madhupur in Sonbhadra district. Easily accessible from Robertsganj,
                Ghorawal, and surrounding regional centres with dedicated parking.
              </p>

              <div className="mt-6 space-y-4 text-xs sm:text-sm">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-[#0A2E5C] p-2.5 text-[#FFC107] shrink-0">
                    <MapPin className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-[#0A2E5C] dark:text-white">Physical Address</h3>
                    <p className="text-[#6B7280] dark:text-zinc-300 font-medium">
                      {BRAND_CONFIG.address}
                    </p>
                    <p className="text-[11px] text-[#0B5ED7] mt-0.5">
                      District: Sonbhadra • Uttar Pradesh, PIN: 231216
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-[#0A2E5C] p-2.5 text-[#FFC107] shrink-0">
                    <Phone className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-[#0A2E5C] dark:text-white">Direct Desk Helpline &amp; WhatsApp</h3>
                    <p className="text-[#6B7280] dark:text-zinc-300 font-medium">
                      {BRAND_CONFIG.phone}
                    </p>
                    <p className="text-[11px] text-[#0B5ED7] mt-0.5">
                      Front Desk Available 06:00 AM – 10:00 PM for on-spot seat allocation
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-[#0A2E5C] p-2.5 text-[#FFC107] shrink-0">
                    <Clock className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-[#0A2E5C] dark:text-white">Operating Hours</h3>
                    <p className="text-[#6B7280] dark:text-zinc-300 font-medium">
                      Open 24 Hours • 365 Days a Year (Flexible Hourly Passes &amp; 24/7 Dedicated Seating)
                    </p>
                  </div>
                </div>
              </div>

              {/* Direct Actions */}
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <a
                  href={`https://wa.me/${BRAND_CONFIG.phone.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(BRAND_CONFIG.whatsappMessage)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl bg-[#25D366] hover:bg-[#1EBE5D] text-white px-5 py-3 text-xs font-bold shadow-md shadow-[#25D366]/20 transition-all active:scale-95"
                >
                  <Phone className="h-4 w-4" />
                  <span>WhatsApp Desk</span>
                </a>

                <a
                  href="https://maps.app.goo.gl"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl border border-[#FFC107] bg-[#0A2E5C] text-[#FFC107] hover:bg-[#141A24] px-5 py-3 text-xs font-bold transition-all"
                >
                  <ExternalLink className="h-4 w-4" />
                  <span>Get Driving Directions</span>
                </a>
              </div>
            </div>

            {/* Google Maps Embed with Verified GPS Geofence */}
            <div className="rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] p-6 shadow-md dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex items-center justify-between mb-4 border-b border-[#E5E7EB] pb-3 dark:border-zinc-800">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span className="text-xs font-bold uppercase text-[#0A2E5C] dark:text-zinc-300">
                    GPS Geofence Proximity
                  </span>
                </div>
                <span className="text-[11px] font-mono text-zinc-500">
                  Lat: {BRAND_CONFIG.gps.latitude} • Lng: {BRAND_CONFIG.gps.longitude}
                </span>
              </div>

              <div className="aspect-video w-full rounded-xl overflow-hidden border border-[#E5E7EB]/60 shadow-inner">
                <iframe
                  title={`Google Maps Location of ${BRAND_CONFIG.fullName} ${BRAND_CONFIG.location}`}
                  src={BRAND_CONFIG.mapsEmbedUrl}
                  className="w-full h-full border-0"
                  allowFullScreen={false}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                ></iframe>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
