import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { BRAND_CONFIG } from "@/lib/config";

export const metadata: Metadata = pageMetadata({
  title: `Staff Desk Portal | ${BRAND_CONFIG.fullName}`,
  description: `Staff portal for attendance, registration, and desk management at ${BRAND_CONFIG.fullName}.`,
  path: "/staff/",
  noindex: true,
});

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
