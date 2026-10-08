/**
 * [WEB • PAGE] Terms & Conditions (Legal)
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
  title: `Terms & Conditions | ${BRAND_CONFIG.fullName}`,
  description: `Membership rules, facility policies, and terms of service for ${BRAND_CONFIG.fullName}, ${BRAND_CONFIG.location}.`,
  path: "/terms-conditions/",
});

export default function TermsConditionsPage() {
  const breadcrumbs = [
    { name: "Home", path: "/" },
    { name: "Terms & Conditions", path: "/terms-conditions/" },
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <JsonLd data={breadcrumbLd(breadcrumbs)} />
      <Navbar />
      <PageHeader title="Terms & Conditions" description="The rules governing the use of our services." />
      
      <main className="mx-auto max-w-4xl px-4 pt-12 pb-28 sm:py-16 sm:px-6 lg:px-8">
        <div className="space-y-8 text-zinc-700 text-lg leading-relaxed">
          <p>
            By accessing and using {BRAND_CONFIG.fullName}, you accept and agree to be bound by the terms and provisions of this agreement.
          </p>
          
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-[#0A2E5C]">1. Membership and Access</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>Membership is granted exclusively to the registered individual and is non-transferable.</li>
              <li>Members must carry their digital or physical ID pass to enter the premises.</li>
              <li>We reserve the right to revoke membership for violation of library rules.</li>
            </ul>
          </div>

          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-[#0A2E5C]">2. Use of Facilities</h2>
            <p>
              The facilities, including high-speed internet, power outlets, and reading desks, are provided "as is". We strive for 100% uptime but are not liable for temporary outages due to circumstances beyond our control.
            </p>
          </div>

          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-[#0A2E5C]">3. Liability</h2>
            <p>
              {BRAND_CONFIG.fullName} is not responsible for the loss, theft, or damage of personal belongings left on the premises. Members are advised to keep their valuables secure.
            </p>
          </div>

          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-[#0A2E5C]">4. Modifications</h2>
            <p>
              We reserve the right to modify these terms at any time. Changes will be communicated via email or notices within the facility. Continued use of the library after such modifications constitutes your acknowledgement and acceptance of the new terms.
            </p>
          </div>

          <p className="mt-8 font-medium">
            If you have any questions regarding these terms, please reach out to us at <strong className="text-[#0B5ED7]">{BRAND_CONFIG.email}</strong>.
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
