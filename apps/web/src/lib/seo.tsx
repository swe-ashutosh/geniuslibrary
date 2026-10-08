/**
 * [WEB • LIB • SEO] Page Metadata & Schema Helpers
 *
 * pageMetadata()  → drop-in `export const metadata` for any route: unique
 *                   title + description, canonical URL, OpenGraph/Twitter
 *                   cards, optional robots noindex.
 * breadcrumbLd()  → Schema.org BreadcrumbList JSON-LD object.
 *
 * Usage (server component or route layout):
 *   export const metadata = pageMetadata({
 *     title: "Library Rules | X Library",
 *     description: "...",
 *     path: "/library-rules/",
 *   });
 */
import type { Metadata } from "next";
import { BRAND_CONFIG } from "./config";

type PageMetaInput = {
  /** Full <title> — include the brand name for uniqueness */
  title: string;
  /** Unique meta description (150–160 chars ideal) */
  description: string;
  /** Route path WITH trailing slash, e.g. "/library-rules/" (root = "/") */
  path: string;
  /** Set true for utility/private pages that must never appear in search */
  noindex?: boolean;
};

export function pageMetadata({ title, description, path, noindex }: PageMetaInput): Metadata {
  const url = `${BRAND_CONFIG.siteUrl}${path}`;
  const ogImage = `${BRAND_CONFIG.siteUrl}/library-hall.jpg`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: BRAND_CONFIG.fullName,
      type: "website",
      locale: "en_IN",
      images: [{ url: ogImage, width: 1200, height: 630, alt: `${BRAND_CONFIG.fullName} Study Hall` }],
    },
    twitter: { card: "summary_large_image", title, description },
    ...(noindex ? { robots: { index: false, follow: false } } : {}),
  };
}

/** Schema.org BreadcrumbList — render via a JSON-LD <script> tag. */
export function breadcrumbLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: `${BRAND_CONFIG.siteUrl}${it.path}`,
    })),
  };
}

/** Server-renderable JSON-LD script node (XSS-safe unicode escape). */
export function JsonLd({ data }: { data: object }) {
  const safeJson = JSON.stringify(data).replace(/</g, "\\u003c");
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: safeJson }}
    />
  );
}
