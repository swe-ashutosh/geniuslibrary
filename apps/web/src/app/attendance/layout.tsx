import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { BRAND_CONFIG } from "@/lib/config";

export const metadata: Metadata = pageMetadata({
  title: `Attendance Check-In Kiosk | ${BRAND_CONFIG.fullName}`,
  description: `Live QR attendance check-in kiosk for ${BRAND_CONFIG.fullName}.`,
  path: "/attendance/",
  noindex: true,
});

export default function AttendanceLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
