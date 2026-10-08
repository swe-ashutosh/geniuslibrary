/**
 * [WEB • PAGE] Privacy Policy (Legal)
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
  title: `Privacy Policy | ${BRAND_CONFIG.fullName}`,
  description: `Privacy policy and student personal data protection practices for ${BRAND_CONFIG.fullName}, ${BRAND_CONFIG.location}.`,
  path: "/privacy-policy/",
});

export default function PrivacyPolicyPage() {
  const breadcrumbs = [
    { name: "Home", path: "/" },
    { name: "Privacy Policy", path: "/privacy-policy/" },
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <JsonLd data={breadcrumbLd(breadcrumbs)} />
      <Navbar />
      <PageHeader title="Privacy Policy" description="How we collect, use, and protect your data." />
      
      <main className="mx-auto max-w-4xl px-4 pt-12 pb-28 sm:py-16 sm:px-6 lg:px-8">
        <div className="space-y-8 text-zinc-700 text-lg leading-relaxed">
          <p>
            At {BRAND_CONFIG.name}, we are committed to protecting your personal information and your right to privacy.
          </p>
          
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-[#0A2E5C]">1. Information We Collect</h2>
            <p>We collect personal information that you provide to us when you register on our platform, such as:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Name and contact details (email, phone number)</li>
              <li>Government-issued ID proofs (for physical access verification)</li>
              <li>Payment information (processed securely via our payment partners)</li>
            </ul>
          </div>

          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-[#0A2E5C]">2. How We Use Your Information</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>To manage your library subscription and seat allocations.</li>
              <li>To send administrative information, such as facility updates and policy changes.</li>
              <li>To ensure the physical security of our premises (via CCTV and entry logs).</li>
            </ul>
          </div>

          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-[#0A2E5C]">3. Data Sharing</h2>
            <p>
              We do not sell your personal information to third parties. We may share data with service providers who perform services for us (e.g., payment processing, SMS notifications).
            </p>
          </div>

          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-[#0A2E5C]">4. Data Security</h2>
            <p>
              We implement appropriate technical and organizational security measures to protect your personal data from unauthorized access, loss, or destruction.
            </p>
          </div>

          <p className="mt-8 font-medium">
            If you have any questions about our privacy practices, please contact us at <strong className="text-[#0B5ED7]">{BRAND_CONFIG.email}</strong>.
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
