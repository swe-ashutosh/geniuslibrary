import type { Metadata } from "next";
import { pageMetadata, breadcrumbLd, JsonLd } from "@/lib/seo";
import { BRAND_CONFIG } from "@/lib/config";

export const metadata: Metadata = pageMetadata({
  title: `Student & Staff Login | ${BRAND_CONFIG.fullName}`,
  description: `Sign in to your student or administrative dashboard at ${BRAND_CONFIG.fullName}, ${BRAND_CONFIG.location}. Check attendance, seat number, and payment receipts.`,
  path: "/login/",
});

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  const breadcrumbs = [
    { name: "Home", path: "/" },
    { name: "Login", path: "/login/" },
  ];

  return (
    <>
      <JsonLd data={breadcrumbLd(breadcrumbs)} />
      {children}
    </>
  );
}
