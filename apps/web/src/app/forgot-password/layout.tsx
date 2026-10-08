import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { BRAND_CONFIG } from "@/lib/config";

export const metadata: Metadata = pageMetadata({
  title: `Forgot Password | ${BRAND_CONFIG.fullName}`,
  description: `Reset your account password for ${BRAND_CONFIG.fullName}.`,
  path: "/forgot-password/",
  noindex: true,
});

export default function ForgotPasswordLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
