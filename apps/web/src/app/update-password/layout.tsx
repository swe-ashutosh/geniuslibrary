import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { BRAND_CONFIG } from "@/lib/config";

export const metadata: Metadata = pageMetadata({
  title: `Update Password | ${BRAND_CONFIG.fullName}`,
  description: `Set your new account password for ${BRAND_CONFIG.fullName}.`,
  path: "/update-password/",
  noindex: true,
});

export default function UpdatePasswordLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
