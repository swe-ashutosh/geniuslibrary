/**
 * [WEB • APP] Root Layout & Global Metadata
 *
 * Fonts, SEO/OG metadata from BRAND_CONFIG, PWA manifest link, network
 * preconnects, pages.dev → custom domain redirect, mounts PWAProvider.
 */

import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { BRAND_CONFIG } from "@/lib/config";
import { PWAProvider } from "@/components/PWAProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: BRAND_CONFIG.colors.darkNavy,
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  metadataBase: new URL(BRAND_CONFIG.siteUrl),
  title: {
    default: BRAND_CONFIG.seoTitle,
    template: `%s | ${BRAND_CONFIG.fullName}`,
  },
  description: BRAND_CONFIG.description,
  keywords: BRAND_CONFIG.seoKeywords,
  authors: [{ name: "Abhishek Genius Library", url: BRAND_CONFIG.siteUrl }],
  creator: BRAND_CONFIG.fullName,
  publisher: BRAND_CONFIG.fullName,
  applicationName: BRAND_CONFIG.fullName,
  alternates: {
    canonical: BRAND_CONFIG.siteUrl,
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
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: BRAND_CONFIG.fullName,
  },
  openGraph: {
    siteName: BRAND_CONFIG.fullName,
    type: "website",
    locale: "en_IN",
    url: BRAND_CONFIG.siteUrl,
    title: BRAND_CONFIG.seoTitle,
    description: BRAND_CONFIG.description,
    images: [
      {
        url: `${BRAND_CONFIG.siteUrl}/library-hall.jpg`,
        width: 1200,
        height: 630,
        alt: `${BRAND_CONFIG.fullName} - Best 24/7 Library in Madhupur, Sonbhadra`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: BRAND_CONFIG.seoTitle,
    description: BRAND_CONFIG.description,
    images: [`${BRAND_CONFIG.siteUrl}/library-hall.jpg`],
  },
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
  other: {
    "mobile-web-app-capable": "yes",
    "geo.region": "IN-UP",
    "geo.placename": "Madhupur, Sonbhadra",
    "geo.position": `${BRAND_CONFIG.gps.latitude};${BRAND_CONFIG.gps.longitude}`,
    "ICBM": `${BRAND_CONFIG.gps.latitude}, ${BRAND_CONFIG.gps.longitude}`,
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon-48.png", sizes: "48x48", type: "image/png" },
      { url: "/icon-96.png", sizes: "96x96", type: "image/png" },
      { url: "/icon-144.png", sizes: "144x144", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/icon-192.png",
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* Core Web Vitals: Priority Hints (Preconnect & DNS-Prefetch) */}
        <link rel="preconnect" href={BRAND_CONFIG.supabase.url} crossOrigin="anonymous" />
        <link rel="dns-prefetch" href={BRAND_CONFIG.supabase.url} />
        <link rel="preconnect" href={BRAND_CONFIG.apiUrl} crossOrigin="anonymous" />
        <link rel="dns-prefetch" href={BRAND_CONFIG.apiUrl} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />

        {/* LCP Optimization: Preload Critical App Icon with High Priority */}
        <link rel="preload" href="/icon.png" as="image" type="image/png" fetchPriority="high" />

      </head>
      <body className="min-h-full flex flex-col font-sans selection:bg-pink-500 selection:text-white">
        {/* Deferred Non-Blocking Navigation Sanitizer */}
        <Script
          id="domain-sanitizer"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(){try{if(window.location.hostname==='${BRAND_CONFIG.pagesDevSubdomain}.pages.dev'){var target='${BRAND_CONFIG.siteUrl}'+window.location.pathname+window.location.search+window.location.hash;window.location.replace(target);}}catch(e){}})();`,
          }}
        />
        {children}
        <PWAProvider />
      </body>
    </html>
  );
}
