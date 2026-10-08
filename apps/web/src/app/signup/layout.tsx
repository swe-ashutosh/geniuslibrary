import type { Metadata } from "next";
import { pageMetadata, breadcrumbLd, JsonLd } from "@/lib/seo";
import { BRAND_CONFIG } from "@/lib/config";

export const metadata: Metadata = pageMetadata({
  title: `Student Registration & Admission | ${BRAND_CONFIG.fullName}`,
  description: `Online registration for self-study desks and shifts at ${BRAND_CONFIG.fullName}, ${BRAND_CONFIG.location}. Choose your shift, reserved desk, and register instantly.`,
  path: "/signup/",
});

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  const breadcrumbs = [
    { name: "Home", path: "/" },
    { name: "Sign Up", path: "/signup/" },
  ];

  return (
    <>
      <JsonLd data={breadcrumbLd(breadcrumbs)} />
      {children}
    </>
  );
}
