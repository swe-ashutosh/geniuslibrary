/**
 * [WEB • PAGE] Contact & Support
 *
 * Contact details, WhatsApp and map links from BRAND_CONFIG.
 */

import type { Metadata } from "next";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { PageHeader } from "@/components/PageHeader";
import { MapPin, Phone, Mail, MessageCircle } from "lucide-react";
import { BRAND_CONFIG } from "@/lib/config";
import { pageMetadata, breadcrumbLd, JsonLd } from "@/lib/seo";
import Link from "next/link";

export const metadata: Metadata = pageMetadata({
  title: `Contact & Support | ${BRAND_CONFIG.fullName}`,
  description: `Get in touch with ${BRAND_CONFIG.fullName}, ${BRAND_CONFIG.location}. Phone: ${BRAND_CONFIG.phone}, WhatsApp support, library location, and desk enquiry.`,
  path: "/contact-support/",
});

export default function ContactSupportPage() {
  const breadcrumbs = [
    { name: "Home", path: "/" },
    { name: "Contact Support", path: "/contact-support/" },
  ];

  const contactSchema = {
    "@context": "https://schema.org",
    "@type": "ContactPage",
    name: `Contact ${BRAND_CONFIG.fullName}`,
    description: `Contact and customer support for ${BRAND_CONFIG.fullName}`,
    url: `${BRAND_CONFIG.siteUrl}/contact-support/`,
    mainEntity: {
      "@type": "Library",
      name: BRAND_CONFIG.fullName,
      telephone: BRAND_CONFIG.phone,
      email: BRAND_CONFIG.email,
      address: {
        "@type": "PostalAddress",
        streetAddress: BRAND_CONFIG.address,
        addressLocality: BRAND_CONFIG.location,
        addressRegion: "Uttar Pradesh",
        addressCountry: "IN",
      },
    },
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <JsonLd data={breadcrumbLd(breadcrumbs)} />
      <JsonLd data={contactSchema} />
      <Navbar />
      <PageHeader title="Contact Support" description="We're here to help you." />
      
      <main className="mx-auto max-w-4xl px-4 pt-12 pb-28 sm:py-16 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          
          <div>
            <h2 className="text-2xl font-bold text-[#0A2E5C] mb-6">Get in Touch</h2>
            <p className="text-zinc-600 mb-8 leading-relaxed">
              Have a question about your membership, seat allocation, or facing a technical issue? Reach out to our support team directly.
            </p>
            
            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <div className="bg-[#0A2E5C] p-3 rounded-lg text-[#FFC107]">
                  <MapPin className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-[#0A2E5C]">Visit Us</h3>
                  <p className="text-zinc-600 mt-1">{BRAND_CONFIG.address}</p>
                </div>
              </div>
              
              <div className="flex items-start gap-4">
                <div className="bg-[#0A2E5C] p-3 rounded-lg text-[#FFC107]">
                  <Phone className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-[#0A2E5C]">Call Us</h3>
                  <p className="text-zinc-600 mt-1">{BRAND_CONFIG.phone} (06:00 AM - 10:00 PM)</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="bg-[#0A2E5C] p-3 rounded-lg text-[#FFC107]">
                  <Mail className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-[#0A2E5C]">Email Us</h3>
                  <p className="text-zinc-600 mt-1">{BRAND_CONFIG.email}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-xl p-8 border border-zinc-100">
            <h2 className="text-xl font-bold text-[#0A2E5C] mb-6">Fastest Support</h2>
            <p className="text-zinc-600 mb-8">
              For immediate assistance regarding desk availability or quick queries, WhatsApp is the fastest way to reach our desk manager.
            </p>
            <Link 
              href={BRAND_CONFIG.social.whatsapp || (BRAND_CONFIG.rawPhone ? `https://wa.me/91${BRAND_CONFIG.rawPhone.replace(/\D/g, '').slice(-10)}?text=${encodeURIComponent(BRAND_CONFIG.whatsappMessage)}` : "#")}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#0B5ED7] px-6 py-4 text-lg font-bold text-white transition hover:bg-[#FFC107] shadow-md hover:shadow-xl"
            >
              <MessageCircle className="h-6 w-6" />
              Chat on WhatsApp Now
            </Link>
          </div>

        </div>
      </main>
      <Footer />
    </div>
  );
}
