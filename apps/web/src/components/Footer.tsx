"use client";

/**
 * [WEB • COMPONENT] Public Footer
 *
 * Brand about text, contact and quick links (dynamically synced from Supabase).
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import { BrandLogo } from "./BrandLogo";
import { BRAND_CONFIG } from "@/lib/config";
import { getAdminContactInfo } from "@/lib/api";
import {
  MapPin,
  Phone,
  Mail,
  MessageCircle
} from "lucide-react";

export function Footer({ className = "" }: { className?: string } = {}) {
  const [phone, setPhone] = useState(BRAND_CONFIG.phone);
  const [rawPhone, setRawPhone] = useState(BRAND_CONFIG.rawPhone);

  useEffect(() => {
    getAdminContactInfo().then((info) => {
      if (info.phone) setPhone(info.phone);
      if (info.rawPhone) setRawPhone(info.rawPhone);
    });

    const handleUpdate = (e: any) => {
      if (e.detail?.phone) setPhone(e.detail.phone);
      if (e.detail?.rawPhone) setRawPhone(e.detail.rawPhone);
    };
    window.addEventListener("admin_contact_updated", handleUpdate);
    return () => window.removeEventListener("admin_contact_updated", handleUpdate);
  }, []);
  return (
    <footer className={`bg-[#0A2E5C] text-[#E5E7EB] ${className}`}>
      <div className="mx-auto max-w-7xl px-4 py-12 md:py-16 sm:px-6 lg:px-8 border-b border-[#FFC107]/30">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-4">

          {/* Col 1: Brand & Description */}
          <div className="space-y-6">
            <BrandLogo variant="navbar" size="lg" darkBackground />
            <p className="text-sm text-zinc-300 leading-relaxed font-medium">
              {BRAND_CONFIG.aboutText}
            </p>
            <div className="flex items-center gap-4 text-[#FFC107]">
              {BRAND_CONFIG.social.instagram && (
              <Link href={BRAND_CONFIG.social.instagram} target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="hover:text-white transition">
                <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" /></svg>
              </Link>
              )}
              {BRAND_CONFIG.social.youtube && (
<Link href={BRAND_CONFIG.social.youtube} target="_blank" rel="noopener noreferrer" aria-label="YouTube" className="hover:text-white transition">
                <svg aria-hidden="true" className="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.5 12 3.5 12 3.5s-7.505 0-9.377.55a3.016 3.016 0 0 0-2.122 2.136C0 8.07 0 12 0 12s0 3.93.501 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.55 9.377.55 9.377.55s7.505 0 9.377-.55a3.016 3.016 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" /></svg>
              </Link>
)}
              {BRAND_CONFIG.social.facebook && (
<Link href={BRAND_CONFIG.social.facebook} target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="hover:text-white transition">
                <svg aria-hidden="true" className="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.469h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.469h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" /></svg>
              </Link>
)}
              {BRAND_CONFIG.social.x && (
<Link href={BRAND_CONFIG.social.x} target="_blank" rel="noopener noreferrer" aria-label="X (Twitter)" className="hover:text-white transition">
                <svg aria-hidden="true" className="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
              </Link>
)}
              <Link href={BRAND_CONFIG.social.whatsapp} target="_blank" rel="noopener noreferrer" aria-label="Chat on WhatsApp" className="hover:text-white transition"><MessageCircle className="w-5 h-5" aria-hidden="true" /></Link>
            </div>
          </div>

          {/* Col 2: Quick Links */}
          <div>
            <p className="text-sm font-bold uppercase tracking-wider text-white mb-6">
              Quick Links
            </p>
            <ul className="space-y-3 text-sm text-[#E5E7EB] font-medium">
              <li><Link href="/" className="hover:text-[#FFC107] transition flex items-center gap-2"><span className="text-[#0B5ED7]">→</span> Home</Link></li>
              <li><Link href="/#about" className="hover:text-[#FFC107] transition flex items-center gap-2"><span className="text-[#0B5ED7]">→</span> About Us</Link></li>
              <li><Link href="/#shifts" className="hover:text-[#FFC107] transition flex items-center gap-2"><span className="text-[#0B5ED7]">→</span> Plans</Link></li>
              <li><Link href="/#gallery" className="hover:text-[#FFC107] transition flex items-center gap-2"><span className="text-[#0B5ED7]">→</span> Gallery</Link></li>
              <li><Link href="/#faq" className="hover:text-[#FFC107] transition flex items-center gap-2"><span className="text-[#0B5ED7]">→</span> FAQ</Link></li>
              <li><Link href="/#contact" className="hover:text-[#FFC107] transition flex items-center gap-2"><span className="text-[#0B5ED7]">→</span> Contact Us</Link></li>
            </ul>
          </div>

          {/* Col 3: Important Links */}
          <div>
            <p className="text-sm font-bold uppercase tracking-wider text-white mb-6">
              Important Links
            </p>
            <ul className="space-y-3 text-sm text-[#E5E7EB] font-medium">
              <li><Link href="/library-rules" className="hover:text-[#FFC107] transition flex items-center gap-2"><span className="text-[#0B5ED7]">→</span> Library Rules</Link></li>
              <li><Link href="/refund-policy" className="hover:text-[#FFC107] transition flex items-center gap-2"><span className="text-[#0B5ED7]">→</span> Refund Policy</Link></li>
              <li><Link href="/privacy-policy" className="hover:text-white transition flex items-center gap-2 font-bold text-[#FFC107]"><span className="text-[#0B5ED7]">→</span> Privacy Policy</Link></li>
              <li><Link href="/terms-conditions" className="hover:text-[#FFC107] transition flex items-center gap-2"><span className="text-[#0B5ED7]">→</span> Terms & Condition</Link></li>
              <li><Link href="/contact-support" className="hover:text-[#FFC107] transition flex items-center gap-2"><span className="text-[#0B5ED7]">→</span> Contact Support</Link></li>
            </ul>
          </div>

          {/* Col 4: Contact Us */}
          <div>
            <p className="text-sm font-bold uppercase tracking-wider text-white mb-6">
              Contact Us
            </p>
            <div className="space-y-4 text-sm text-[#E5E7EB] font-medium">
              <div className="flex items-start gap-3">
                <MapPin className="h-5 w-5 shrink-0 text-[#FFC107]" />
                <span>{BRAND_CONFIG.address}</span>
              </div>
              <div className="flex items-center gap-3">
                <Phone className="h-5 w-5 shrink-0 text-[#FFC107]" />
                <span>{phone}</span>
              </div>
              <div className="flex items-center gap-3">
                <Mail className="h-5 w-5 shrink-0 text-[#FFC107]" />
                <span>{BRAND_CONFIG.email}</span>
              </div>

              <Link
                href={rawPhone ? `https://wa.me/91${rawPhone.replace(/\D/g, '').slice(-10)}` : BRAND_CONFIG.social.whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-6 inline-flex items-center gap-2 rounded-md bg-[#0B5ED7] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#FFC107] shadow-md hover:shadow-xl"
              >
                <MessageCircle className="h-5 w-5" />
                Chat on WhatsApp
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom copyright */}
      <div className="mx-auto max-w-7xl px-4 pt-6 pb-24 md:py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-xs font-medium text-[#FFC107]">
          <p>{BRAND_CONFIG.copyright}</p>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3 text-[#0B5ED7]">
              {BRAND_CONFIG.social.instagram && (
                <Link href={BRAND_CONFIG.social.instagram} target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="hover:text-white transition">
                  <svg aria-hidden="true" className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" /></svg>
                </Link>
              )}
              {BRAND_CONFIG.social.youtube && (
                <Link href={BRAND_CONFIG.social.youtube} target="_blank" rel="noopener noreferrer" aria-label="YouTube" className="hover:text-white transition">
                  <svg aria-hidden="true" className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.5 12 3.5 12 3.5s-7.505 0-9.377.55a3.016 3.016 0 0 0-2.122 2.136C0 8.07 0 12 0 12s0 3.93.501 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.55 9.377.55 9.377.55s7.505 0 9.377-.55a3.016 3.016 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" /></svg>
                </Link>
              )}
              {BRAND_CONFIG.social.facebook && (
                <Link href={BRAND_CONFIG.social.facebook} target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="hover:text-white transition">
                  <svg aria-hidden="true" className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.469h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.469h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" /></svg>
                </Link>
              )}
              {BRAND_CONFIG.social.x && (
                <Link href={BRAND_CONFIG.social.x} target="_blank" rel="noopener noreferrer" aria-label="X (Twitter)" className="hover:text-white transition">
                  <svg aria-hidden="true" className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
                </Link>
              )}
              <Link href={BRAND_CONFIG.social.whatsapp} target="_blank" rel="noopener noreferrer" aria-label="Chat on WhatsApp" className="hover:text-white transition">
                <MessageCircle className="w-4 h-4" />
              </Link>
            </div>
            <span>Designed & Developed By <Link href="https://librarywale.in" target="_blank" rel="noopener noreferrer" className="hover:text-white transition underline">LibraryWale</Link></span>
          </div>
        </div>
      </div>
    </footer>
  );
}      