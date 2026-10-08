/**
 * [WEB • PAGE] Refund Policy (Legal)
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
  title: `Refund & Cancellation Policy | ${BRAND_CONFIG.fullName}`,
  description: `Subscription refund and desk cancellation policy for ${BRAND_CONFIG.fullName}, ${BRAND_CONFIG.location}.`,
  path: "/refund-policy/",
});

export default function RefundPolicyPage() {
  const breadcrumbs = [
    { name: "Home", path: "/" },
    { name: "Refund Policy", path: "/refund-policy/" },
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <JsonLd data={breadcrumbLd(breadcrumbs)} />
      <Navbar />
      <PageHeader title="Refund & Cancellation Policy" description="Our commitment to fair and transparent transactions." />
      
      <main className="mx-auto max-w-4xl px-4 pt-12 pb-28 sm:py-16 sm:px-6 lg:px-8">
        <div className="space-y-8 text-zinc-700 text-lg leading-relaxed">
          <p>
            This Refund Policy outlines the terms under which refunds are provided for subscriptions and services purchased at {BRAND_CONFIG.fullName}.
          </p>
          
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-[#0A2E5C]">1. Subscription Cancellations</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>Monthly subscriptions can be cancelled at any time, but are non-refundable for the current active month.</li>
              <li>Quarterly or Annual subscriptions cancelled mid-term will be refunded on a pro-rata basis, minus a cancellation fee of 15% of the remaining value.</li>
            </ul>
          </div>

          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-[#0A2E5C]">2. Trial Periods</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>If a free trial period is offered, you will not be charged if you cancel before the trial expires.</li>
            </ul>
          </div>

          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-[#0A2E5C]">3. Exceptional Circumstances</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>Refunds due to prolonged library closure (e.g., government mandates, severe maintenance issues) will be processed automatically on a pro-rata basis.</li>
            </ul>
          </div>

          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-[#0A2E5C]">4. Processing Time</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>Approved refunds will be processed within 5-7 business days and credited to the original payment method.</li>
            </ul>
          </div>

          <p className="mt-8 font-medium">
            For refund requests, please contact our support desk or email us at <strong className="text-[#0B5ED7]">{BRAND_CONFIG.email}</strong>.
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
