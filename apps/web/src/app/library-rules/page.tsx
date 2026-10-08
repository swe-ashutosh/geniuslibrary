/**
 * [WEB • PAGE] Library Rules (Static Content)
 *
 * (Small helper file — see code comments below.)
 */

import type { Metadata } from "next";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { PageHeader } from "@/components/PageHeader";
import { pageMetadata, breadcrumbLd, JsonLd } from "@/lib/seo";
import { BRAND_CONFIG } from "@/lib/config";

export const metadata: Metadata = pageMetadata({
  title: `Library Rules & Regulations | ${BRAND_CONFIG.fullName}`,
  description: `Official guidelines and rules for silent study halls, desk allocation, internet usage, and discipline at ${BRAND_CONFIG.fullName}, ${BRAND_CONFIG.location}.`,
  path: "/library-rules/",
});

export default function LibraryRulesPage() {
  const breadcrumbs = [
    { name: "Home", path: "/" },
    { name: "Library Rules", path: "/library-rules/" },
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <JsonLd data={breadcrumbLd(breadcrumbs)} />
      <Navbar />
      <PageHeader title="Library Rules & Guidelines" description="Guidelines for maintaining a peaceful, productive study environment." />
      
      <main className="mx-auto max-w-4xl px-4 pt-12 pb-28 sm:py-16 sm:px-6 lg:px-8">
        <div className="space-y-8 text-zinc-700 text-lg leading-relaxed">
          <p>
            Welcome to {BRAND_CONFIG.fullName}. To ensure a productive and harmonious environment for all members, we ask that you adhere to the following rules:
          </p>
          
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-[#0A2E5C]">1. Silence and Decorum</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>Maintain strict silence within the study halls.</li>
              <li>Use designated discussion areas or the lounge for conversations.</li>
              <li>Mobile phones must be kept on silent mode at all times.</li>
            </ul>
          </div>

          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-[#0A2E5C]">2. Seat Allocation</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>Please occupy only the seat assigned to your booking.</li>
              <li>Do not leave personal belongings unattended for extended periods to reserve unbooked seats.</li>
            </ul>
          </div>

          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-[#0A2E5C]">3. Food and Beverages</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>Only water bottles with secure lids are allowed in the study halls.</li>
              <li>All other food and beverages must be consumed in the lounge area.</li>
            </ul>
          </div>

          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-[#0A2E5C]">4. Cleanliness and Damage</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>Members are responsible for keeping their desk area clean.</li>
              <li>Any damage to library property (books, furniture, IT equipment) will be charged to the member.</li>
            </ul>
          </div>

          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-[#0A2E5C]">5. Digital Access</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>Use the high-speed WiFi for educational and research purposes only.</li>
              <li>Do not share your WiFi credentials with non-members.</li>
            </ul>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
