"use client";

/**
 * [WEB • COMPONENT] Fee Invoice / Receipt
 *
 * Printable invoice with library header, GST-style breakdown and UPI
 * QR (details from BRAND_CONFIG.payment).
 */
import React, { useRef, useState } from "react";
import { 
  Printer, 
  Download, 
  X, 
  FileCheck,
  Check,
  Mail,
  ShieldCheck
} from "lucide-react";
import { BRAND_CONFIG } from "@/lib/config";

export interface InvoiceData {
  invoiceNo: string;
  date: string;
  time?: string;
  studentName: string;
  studentCode?: string;
  studentEmail?: string;
  studentPhone?: string;
  seatNo?: string;
  shift?: string;
  planName?: string;
  feeType: string;
  amount: number;
  totalDue?: number;
  remainingDue?: number;
  paymentMode: string;
  transactionId?: string;
  status: "Paid" | "Pending" | "Overdue" | "Partial";
  remarks?: string;
}

interface FeeInvoiceModalProps {
  invoice: InvoiceData | null;
  onClose: () => void;
  onEmail?: (invoice: InvoiceData) => void;
  isSendingEmail?: boolean;
}

function numberToWordsINR(num: number): string {
  if (num === 0) return "Zero";
  const a = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
    "Seventeen", "Eighteen", "Nineteen"
  ];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  const inWords = (n: number): string => {
    let str = "";
    if (n > 99) {
      str += a[Math.floor(n / 100)] + " Hundred ";
      n %= 100;
    }
    if (n > 19) {
      str += b[Math.floor(n / 10)] + " " + a[n % 10];
    } else if (n > 0) {
      str += a[n];
    }
    return str.trim();
  };

  const crore = Math.floor(num / 10000000);
  num %= 10000000;
  const lakh = Math.floor(num / 100000);
  num %= 100000;
  const thousand = Math.floor(num / 1000);
  num %= 1000;
  const remainder = Math.floor(num);

  let result = "";
  if (crore > 0) result += inWords(crore) + " Crore ";
  if (lakh > 0) result += inWords(lakh) + " Lakh ";
  if (thousand > 0) result += inWords(thousand) + " Thousand ";
  if (remainder > 0) result += inWords(remainder);

  return result.trim() + " Rupees Only";
}

export default function FeeInvoiceModal({
  invoice,
  onClose,
  onEmail,
  isSendingEmail = false
}: FeeInvoiceModalProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  if (!invoice) return null;

  const formattedInvoiceNo = (invoice.invoiceNo || "INV-2026-001").toUpperCase();
  const formattedDate = (!invoice.date || invoice.date.toLowerCase().includes("pending"))
    ? new Date().toLocaleDateString("en-IN", { day: '2-digit', month: 'short', year: 'numeric' })
    : invoice.date;

  const hasRemainingDue = invoice.remainingDue !== undefined && invoice.remainingDue > 0;
  const billedTotal = invoice.totalDue || (hasRemainingDue ? invoice.amount + (invoice.remainingDue || 0) : invoice.amount);
  const amountInWords = `${numberToWordsINR(invoice.amount)} Rupees Only${hasRemainingDue ? ` (Received - Remaining Due: ₹${invoice.remainingDue})` : ''}`;

  /**
   * Generates a guaranteed, self-contained, CSS-styled single A4 sheet.
   * Does NOT rely on external Tailwind classes that fail in isolated iframes.
   */
  const handlePrintOrDownload = () => {
    setIsGenerating(true);

    const printWindow = window.open("", "_blank", "width=850,height=1000");
    if (!printWindow) {
      // Fallback to iframe if popup is blocked
      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "0";
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow?.document;
      if (!doc) {
        setIsGenerating(false);
        return;
      }
      writeInvoiceDoc(doc, () => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => {
          setIsGenerating(false);
          if (document.body.contains(iframe)) document.body.removeChild(iframe);
        }, 1500);
      });
      return;
    }

    writeInvoiceDoc(printWindow.document, () => {
      printWindow.focus();
      printWindow.print();
      setIsGenerating(false);
    });
  };

  const writeInvoiceDoc = (doc: Document, onReady: () => void) => {
    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>Invoice_${invoice.invoiceNo}</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 10mm 12mm 10mm 12mm;
          }
          * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body {
            background: #ffffff;
            color: #0A2E5C;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
            font-size: 11px;
            line-height: 1.4;
          }
          .invoice-box {
            width: 100%;
            max-width: 186mm;
            margin: 0 auto;
            border: 1px solid #E5E7EB;
            border-radius: 12px;
            padding: 20px 24px;
            background: #ffffff;
          }
          /* Header */
          .header-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-bottom: 2px solid #0A2E5C;
            padding-bottom: 14px;
            margin-bottom: 14px;
          }
          .logo-group {
            display: flex;
            align-items: center;
            gap: 14px;
          }
          .logo-img {
            width: 60px;
            height: 60px;
            border-radius: 50%;
            object-fit: cover;
            border: 2px solid #FFC107;
          }
          .library-title {
            font-size: 17px;
            font-weight: 900;
            color: #0A2E5C;
            letter-spacing: 0.5px;
          }
          .library-sub {
            font-size: 10px;
            font-weight: 700;
            color: #0B5ED7;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-top: 1px;
          }
          .library-meta {
            font-size: 10px;
            color: #555555;
            margin-top: 2px;
            line-height: 1.35;
          }
          .invoice-badge-box {
            text-align: right;
          }
          .invoice-tag {
            display: inline-block;
            background: #0A2E5C;
            color: #FFC107;
            font-weight: 900;
            font-size: 10px;
            padding: 4px 10px;
            border-radius: 6px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .invoice-meta {
            margin-top: 6px;
            font-size: 10.5px;
            color: #555555;
            line-height: 1.4;
          }
          .invoice-meta strong {
            color: #0A2E5C;
          }

          /* Details Grid */
          .info-grid {
            display: flex;
            background: #FAF9F6;
            border: 1px solid #E5E7EB;
            border-radius: 8px;
            padding: 12px 14px;
            margin-bottom: 14px;
          }
          .info-col {
            flex: 1;
          }
          .info-col:first-child {
            border-right: 1px solid #E5E7EB;
            padding-right: 14px;
          }
          .info-col:last-child {
            padding-left: 14px;
          }
          .info-label {
            font-size: 9px;
            font-weight: 800;
            color: #0B5ED7;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 4px;
          }
          .student-name {
            font-size: 13px;
            font-weight: 800;
            color: #0A2E5C;
            margin-bottom: 3px;
          }
          .info-row {
            display: flex;
            justify-content: space-between;
            font-size: 10.5px;
            margin-top: 3px;
          }
          .info-row span:first-child {
            color: #666666;
          }
          .info-row span:last-child {
            font-weight: 600;
            color: #0A2E5C;
          }
          .paid-tag {
            background: #DEF7EC;
            color: #03543F;
            font-weight: 800;
            font-size: 9.5px;
            padding: 2px 6px;
            border-radius: 4px;
          }

          /* Table */
          table {
            width: 100%;
            border-collapse: collapse;
            border: 1px solid #E5E7EB;
            border-radius: 8px;
            overflow: hidden;
            margin-bottom: 14px;
          }
          th {
            background: #0A2E5C;
            color: #ffffff;
            font-size: 9.5px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            padding: 8px 10px;
            text-align: left;
          }
          th.text-center, td.text-center { text-align: center; }
          th.text-right, td.text-right { text-align: right; }
          td {
            padding: 8px 10px;
            font-size: 10.5px;
            border-bottom: 1px solid #E5E7EB;
          }
          .sub-text {
            font-size: 9.5px;
            color: #777777;
            margin-top: 1px;
          }
          .total-row td {
            font-size: 12px;
            font-weight: 900;
            background: #FAF9F6;
            color: #0A2E5C;
            border-top: 2px solid #0A2E5C;
          }

          /* Words Banner */
          .words-banner {
            display: flex;
            align-items: center;
            justify-content: space-between;
            background: #FFFBEB;
            border: 1px solid #FDE68A;
            border-radius: 8px;
            padding: 8px 12px;
            margin-bottom: 12px;
            font-size: 10.5px;
          }
          .words-banner strong {
            color: #0B5ED7;
            font-size: 9.5px;
            text-transform: uppercase;
          }
          .words-text {
            font-style: italic;
            font-weight: 800;
            color: #0A2E5C;
            margin-top: 2px;
          }

          /* Rules */
          .rules-box {
            border: 1px solid #E5E7EB;
            border-radius: 8px;
            padding: 8px 12px;
            margin-bottom: 14px;
            font-size: 9px;
            color: #555555;
          }
          .rules-box strong {
            color: #0A2E5C;
            text-transform: uppercase;
            font-size: 8.5px;
            letter-spacing: 0.5px;
          }
          .rules-box ul {
            padding-left: 14px;
            margin-top: 2px;
          }
          .rules-box li {
            margin-top: 1px;
          }

          /* Footer */
          .footer-row {
            display: flex;
            align-items: flex-end;
            justify-content: space-between;
            padding-top: 10px;
            border-top: 1px solid #E5E7EB;
          }
          .sign-box {
            text-align: center;
          }
          .sign-script {
            font-style: italic;
            font-weight: 800;
            font-size: 13px;
            color: #0A2E5C;
            border-bottom: 1px solid #999999;
            padding-bottom: 2px;
            display: inline-block;
          }
          .sign-label {
            font-size: 9.5px;
            font-weight: 800;
            text-transform: uppercase;
            color: #0A2E5C;
            margin-top: 3px;
            letter-spacing: 0.5px;
          }
        </style>
      </head>
      <body>
        <div class="invoice-box">
          
          <!-- Header -->
          <div class="header-row">
            <div class="logo-group">
              <img src="/icon.png" alt="Logo" class="logo-img" />
              <div>
                <div class="library-title">${BRAND_CONFIG.name.toUpperCase()}</div>
                <div class="library-sub">${BRAND_CONFIG.tagline}</div>
                <div class="library-meta">
                  ${BRAND_CONFIG.address}<br />
                  Helpline: <strong>${BRAND_CONFIG.phone}</strong> | Email: <strong>${BRAND_CONFIG.email}</strong>
                </div>
              </div>
            </div>

            <div class="invoice-badge-box">
              <span class="invoice-tag">Tax Invoice / Receipt</span>
              <div class="invoice-meta">
                <div>Invoice: <strong>${formattedInvoiceNo}</strong></div>
                <div>Date: <strong>${formattedDate}</strong></div>
                ${invoice.time ? `<div>Time: <strong>${invoice.time}</strong></div>` : ""}
              </div>
            </div>
          </div>

          <!-- Student & Desk Grid -->
          <div class="info-grid">
            <div class="info-col">
              <div class="info-label">Student / Member Information</div>
              <div class="student-name">${invoice.studentName}</div>
              ${invoice.studentCode ? `<div class="info-row"><span>Roll / ID:</span><span>${invoice.studentCode}</span></div>` : ""}
              ${invoice.studentPhone ? `<div class="info-row"><span>Phone:</span><span>${invoice.studentPhone}</span></div>` : ""}
              ${invoice.studentEmail ? `<div class="info-row"><span>Email:</span><span>${invoice.studentEmail}</span></div>` : ""}
            </div>

            <div class="info-col">
              <div class="info-label">Desk &amp; Payment Details</div>
              <div class="info-row"><span>Shift:</span><span>${invoice.shift || "Morning Shift (06:00 AM - 12:00 PM)"}</span></div>
              ${invoice.seatNo ? `<div class="info-row"><span>Seat / Desk:</span><span>${invoice.seatNo}</span></div>` : ""}
              <div class="info-row"><span>Payment Mode:</span><span>${invoice.paymentMode || "Digital Transfer / Online"}</span></div>
              ${invoice.transactionId ? `<div class="info-row"><span>Ref / Txn ID:</span><span>${invoice.transactionId}</span></div>` : ""}
              <div class="info-row" style="margin-top: 4px;">
                <span>Status:</span>
                ${hasRemainingDue 
                  ? `<span class="paid-tag" style="background: #FEF3C7; color: #92400E; font-weight: 800;">⚠ PARTIAL (Due: ₹${invoice.remainingDue})</span>` 
                  : `<span class="paid-tag">✓ PAID (Verified)</span>`}
              </div>
            </div>
          </div>

          <!-- Table -->
          <table>
            <thead>
              <tr>
                <th style="width: 30px;">#</th>
                <th>Description of Service &amp; Facilities</th>
                <th class="text-center" style="width: 140px;">Period / Shift</th>
                <th class="text-right" style="width: 80px;">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style="color: #888888; font-weight: 700;">01</td>
                <td>
                  <strong>${invoice.feeType || "General Plan - Monthly Seat Fee"}</strong>
                  <div class="sub-text">High-speed Wi-Fi, Air Conditioned Reading Hall, Power Backup, Dedicated Desk, RO Water</div>
                </td>
                <td class="text-center">${invoice.shift || "Morning Shift"}</td>
                <td class="text-right" style="font-weight: 700;">₹${invoice.amount.toLocaleString("en-IN")}.00</td>
              </tr>
              <tr>
                <td colspan="3" class="text-right" style="color: #666666;">Total Fee / Billed:</td>
                <td class="text-right font-weight: 600;">₹${billedTotal.toLocaleString("en-IN")}.00</td>
              </tr>
              <tr class="total-row">
                <td colspan="3" class="text-right" style="text-transform: uppercase; color: #03543F;">Amount Paid (Received):</td>
                <td class="text-right" style="color: #03543F;">₹${invoice.amount.toLocaleString("en-IN")}.00</td>
              </tr>
              ${hasRemainingDue ? `
              <tr style="background: #FFF5F5; color: #C53030; font-weight: 800;">
                <td colspan="3" class="text-right" style="text-transform: uppercase;">Remaining Balance Due:</td>
                <td class="text-right">₹${invoice.remainingDue?.toLocaleString("en-IN")}.00</td>
              </tr>` : `
              <tr>
                <td colspan="3" class="text-right" style="color: #666666; font-size: 9.5px;">Remaining Balance:</td>
                <td class="text-right" style="color: #03543F; font-size: 9.5px; font-weight: 700;">₹0.00 (All Cleared)</td>
              </tr>`}
            </tbody>
          </table>

          <!-- Amount In Words -->
          <div class="words-banner">
            <div>
              <strong>Amount in Words:</strong>
              <div class="words-text">${amountInWords}</div>
            </div>
            <div style="text-align: right;">
              <span style="color: #03543F; font-weight: 800;">🛡 Electronically Authenticated</span>
              <div style="font-size: 9px; color: #777777;">Valid without physical signature</div>
            </div>
          </div>

          <!-- Rules -->
          <div class="rules-box">
            <strong>Rules &amp; Payment Terms:</strong>
            <ul>
              <li>Library monthly seat fees are strictly non-refundable and non-transferable under any circumstances.</li>
              <li>Keep this digital receipt for entry verification, QR check-in, and seat renewal identification.</li>
              <li>Members must strictly adhere to library discipline, silence, and cleanliness protocols.</li>
            </ul>
          </div>

          <!-- Footer -->
          <div class="footer-row">
            <div>
              <div style="font-weight: 800; color: #0A2E5C;">Genius Library</div>
              <div style="font-size: 9px; color: #777777;">Designed for Serious Aspirants</div>
              <div style="font-size: 8.5px; color: #999999; margin-top: 2px;">Generated: ${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</div>
            </div>

            <div class="sign-box">
              <div class="sign-script">Genius Library</div>
              <div class="sign-label">Authorized Signatory</div>
              <div style="font-size: 8.5px; color: #888888;">Sonbhadra, Uttar Pradesh</div>
            </div>
          </div>

        </div>

        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 300);
          };
        </script>
      </body>
      </html>
    `);
    doc.close();
    if (onReady) onReady();
  };

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 p-2 sm:p-4 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
      
      {/* Container holding top action bar + Strict Single Page A4 Invoice */}
      <div className="relative w-full max-w-3xl my-auto flex flex-col items-center">
        
        {/* Floating Top Control Bar */}
        <div className="w-full flex items-center justify-between bg-[#0A2E5C] text-white px-4 sm:px-5 py-3 rounded-2xl shadow-xl mb-3 border border-[#FFC107]/40 no-print">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FFC107]/20 text-[#FFC107]">
              <FileCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-wide">Fee Payment Invoice (Single Page A4)</h2>
              <p className="text-[11px] text-[#FFC107]">Print or Save PDF without webpage header or multiple pages</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrintOrDownload}
              disabled={isGenerating}
              className="inline-flex items-center gap-2 rounded-xl bg-[#FFC107] hover:bg-[#a88d70] text-[#0A2E5C] px-4 py-2 text-xs font-black shadow-md transition cursor-pointer disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              <span>Download PDF / Print</span>
            </button>

            {onEmail && invoice.studentEmail && (
              <button
                onClick={() => onEmail(invoice)}
                disabled={isSendingEmail}
                className="hidden sm:inline-flex items-center gap-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white px-3.5 py-2 text-xs font-bold shadow-md transition cursor-pointer disabled:opacity-50"
                title={`Send receipt copy to ${invoice.studentEmail}`}
              >
                <Mail className={`h-4 w-4 ${isSendingEmail ? "animate-spin" : ""}`} />
                <span>Email Receipt</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="rounded-xl p-2 text-zinc-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
              title="Close Preview"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* THE STRICT SINGLE PAGE A4 INVOICE SHEET IN MODAL PREVIEW */}
        {/* ========================================================================= */}
        {/* ========================================================================= */}
        {/* THE STRICT SINGLE PAGE A4 INVOICE SHEET IN MODAL PREVIEW */}
        {/* ========================================================================= */}
        <div className="w-full bg-white text-zinc-900 rounded-2xl shadow-2xl p-3 sm:p-6 md:p-8 border border-[#E5E7EB] overflow-x-hidden max-h-[88vh] overflow-y-auto">
          
          <div className="space-y-4 max-w-[186mm] mx-auto min-w-0">
            
            {/* 1. Header: Circular App Icon Logo + Library Name & Metadata */}
            <div className="border-b-2 border-[#0A2E5C] pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
                
                {/* App Icon Logo & Organization Details */}
                <div className="flex items-start sm:items-center gap-3 min-w-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img 
                    src="/icon.png" 
                    alt="Genius Library" 
                    className="h-12 w-12 sm:h-15 sm:w-15 rounded-full object-cover shadow-xs border-2 border-[#FFC107] shrink-0 mt-0.5 sm:mt-0"
                  />
                  <div className="min-w-0 flex-1">
                    <h1 className="text-base sm:text-xl font-serif font-black tracking-tight text-[#0A2E5C] leading-tight break-words">
                      {BRAND_CONFIG.name.toUpperCase()}
                    </h1>
                    <p className="text-[9.5px] sm:text-[10px] font-bold text-[#0B5ED7] tracking-wider uppercase">
                      {BRAND_CONFIG.tagline}
                    </p>
                    <p className="text-[9.5px] sm:text-[10.5px] text-zinc-600 mt-0.5 leading-snug break-words">
                      {BRAND_CONFIG.address}
                    </p>
                    <p className="text-[9px] sm:text-[10px] text-zinc-600 leading-snug break-words">
                      Helpline: <span className="font-semibold text-zinc-800">{BRAND_CONFIG.phone}</span> | Email: <span className="font-semibold text-zinc-800">{BRAND_CONFIG.email}</span>
                    </p>
                  </div>
                </div>

                {/* Invoice Tag & Metadata */}
                <div className="flex sm:flex-col justify-between items-center sm:items-end border-t sm:border-t-0 pt-2 sm:pt-0 border-zinc-100 shrink-0">
                  <span className="inline-block rounded-md bg-[#0A2E5C] px-2.5 py-1 text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-[#FFC107]">
                    Tax Invoice / Receipt
                  </span>
                  <div className="mt-1 sm:mt-1.5 text-[10.5px] sm:text-[11px] space-y-0.5 text-right">
                    <p className="text-zinc-500">Invoice: <span className="font-mono font-black text-zinc-900">{formattedInvoiceNo}</span></p>
                    <p className="text-zinc-500">Date: <span className="font-semibold text-zinc-800">{formattedDate}</span></p>
                    {invoice.time && (
                      <p className="text-zinc-500">Time: <span className="font-semibold text-zinc-800">{invoice.time}</span></p>
                    )}
                  </div>
                </div>

              </div>
            </div>

            {/* 2. Compact Info Grid: Student & Desk Details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg bg-[#FAF9F6] p-3 text-[11px] border border-zinc-200">
              {/* Student Information */}
              <div className="space-y-1 sm:border-r border-zinc-200 sm:pr-3 border-b sm:border-b-0 pb-2 sm:pb-0">
                <p className="text-[9px] font-black uppercase tracking-wider text-[#0B5ED7]">
                  Student / Member Information
                </p>
                <div className="text-xs font-black text-[#0A2E5C]">
                  {invoice.studentName}
                </div>
                {invoice.studentCode && (
                  <p className="text-zinc-600">
                    ID / Roll No: <span className="font-mono font-bold text-zinc-900">{invoice.studentCode}</span>
                  </p>
                )}
                {invoice.studentPhone && (
                  <p className="text-zinc-600">
                    Phone: <span className="font-semibold text-zinc-800">{invoice.studentPhone}</span>
                  </p>
                )}
                {invoice.studentEmail && (
                  <p className="text-zinc-600 break-all">
                    Email: <span className="font-medium text-zinc-800">{invoice.studentEmail}</span>
                  </p>
                )}
              </div>

              {/* Allocation & Transaction Info */}
              <div className="space-y-1 sm:pl-1">
                <p className="text-[9px] font-black uppercase tracking-wider text-[#0B5ED7]">
                  Desk & Payment Details
                </p>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Shift:</span>
                  <span className="font-bold text-zinc-900">{invoice.shift || "Morning Shift"}</span>
                </div>
                {invoice.seatNo && (
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Seat / Desk:</span>
                    <span className="font-bold text-zinc-900">{invoice.seatNo}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-zinc-500">Payment Mode:</span>
                  <span className="font-bold text-zinc-900">{invoice.paymentMode || "Digital Transfer / Online"}</span>
                </div>
                {invoice.transactionId && (
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-500">Ref / Txn ID:</span>
                    <span className="font-mono font-semibold text-zinc-800 truncate max-w-[130px]">{invoice.transactionId}</span>
                  </div>
                )}
                <div className="flex justify-between items-center pt-0.5">
                  <span className="text-zinc-500">Status:</span>
                  {hasRemainingDue ? (
                    <span className="inline-flex items-center gap-1 font-black text-amber-900 bg-amber-100 px-2 py-0.5 rounded text-[10px]">
                      ⚠ PARTIAL (Due: ₹{invoice.remainingDue})
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-0.5 font-black text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded text-[10px]">
                      <Check className="h-3 w-3" /> PAID (Verified)
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* 3. Fee Itemization Table (Clean & Compact with Horizontal Scroll for Mobile) */}
            <div className="rounded-lg border border-zinc-200 overflow-x-auto">
              <table className="w-full min-w-[340px] text-left border-collapse text-[11px]">
                <thead>
                  <tr className="bg-[#0A2E5C] text-white text-[10px] font-bold uppercase tracking-wider">
                    <th className="py-2 px-3">#</th>
                    <th className="py-2 px-3">Description of Service & Facilities</th>
                    <th className="py-2 px-3 text-center">Period / Shift</th>
                    <th className="py-2 px-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200">
                  <tr>
                    <td className="py-2 px-3 font-bold text-zinc-400">01</td>
                    <td className="py-2 px-3">
                      <p className="font-bold text-[#0A2E5C]">{invoice.feeType || "Library Desk Fee & Reading Facilities"}</p>
                      <p className="text-[10px] text-zinc-500">
                        High-speed Wi-Fi, Air Conditioned Reading Hall, Power Backup, Dedicated Desk, RO Water
                      </p>
                    </td>
                    <td className="py-2 px-3 text-center font-medium text-zinc-600">
                      {invoice.shift || "Monthly Membership"}
                    </td>
                    <td className="py-2 px-3 text-right font-black text-zinc-900">
                      ₹{invoice.amount.toLocaleString("en-IN")}.00
                    </td>
                  </tr>
                  <tr className="bg-zinc-50 font-medium">
                    <td colSpan={3} className="py-1.5 px-3 text-right text-zinc-600 text-[10px]">Total Fee / Billed:</td>
                    <td className="py-1.5 px-3 text-right text-zinc-900 font-semibold">₹{billedTotal.toLocaleString("en-IN")}.00</td>
                  </tr>
                  <tr className="bg-[#0A2E5C]/5 border-t-2 border-[#0A2E5C]">
                    <td colSpan={3} className="py-2 px-3 text-right text-[11px] font-black uppercase text-emerald-800">
                      Amount Paid (Received):
                    </td>
                    <td className="py-2 px-3 text-right text-sm font-black text-emerald-700">
                      ₹{invoice.amount.toLocaleString("en-IN")}.00
                    </td>
                  </tr>
                  {hasRemainingDue ? (
                    <tr className="bg-rose-50/80 border-t border-rose-200">
                      <td colSpan={3} className="py-2 px-3 text-right text-[11px] font-black uppercase text-rose-700">
                        Remaining Balance Due:
                      </td>
                      <td className="py-2 px-3 text-right text-sm font-black text-rose-700">
                        ₹{invoice.remainingDue?.toLocaleString("en-IN")}.00
                      </td>
                    </tr>
                  ) : (
                    <tr className="bg-zinc-50 font-medium">
                      <td colSpan={3} className="py-1 px-3 text-right text-zinc-500 text-[9.5px]">Remaining Balance:</td>
                      <td className="py-1 px-3 text-right text-emerald-700 font-bold text-[9.5px]">₹0.00 (All Cleared)</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* 4. Amount in Words + Verification Bar */}
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 sm:gap-3 rounded-lg bg-amber-50/80 p-3 border border-amber-200 text-[11px]">
              <div>
                <span className="font-bold text-[#0B5ED7] text-[10px] uppercase">Amount in Words:</span>
                <p className="font-serif font-black text-[#0A2E5C] italic text-xs leading-tight">
                  {amountInWords}
                </p>
              </div>
              <div className="sm:text-right shrink-0">
                <span className="inline-flex items-center gap-1 font-bold text-emerald-700 text-[10.5px]">
                  <ShieldCheck className="h-3.5 w-3.5" /> Electronically Authenticated
                </span>
                <p className="text-[9px] text-zinc-500">Valid without physical signature</p>
              </div>
            </div>

            {/* 5. Concise Rules & Terms */}
            <div className="rounded-lg border border-zinc-200 p-2.5 text-[9.5px] text-zinc-600 space-y-0.5">
              <p className="font-bold uppercase tracking-wider text-zinc-800">Rules & Payment Terms:</p>
              <ul className="list-disc pl-3.5 space-y-0.5">
                <li>Library monthly seat fees are strictly non-refundable and non-transferable under any circumstances.</li>
                <li>Keep this digital receipt for entry verification, QR check-in, and seat renewal identification.</li>
                <li>Members must strictly adhere to library discipline, pin-drop silence, and cleanliness protocols.</li>
              </ul>
            </div>

            {/* 6. Footer Signatures & Official Seal */}
            <div className="pt-2 border-t border-zinc-200 flex items-end justify-between">
              <div className="text-left text-[9px] text-zinc-500">
                <p className="font-bold text-zinc-700 text-[10px]">Genius Library</p>
                <p>Designed for Serious Aspirants</p>
                <p className="font-mono text-[8.5px] mt-0.5">Generated: {new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</p>
              </div>

              {/* Authorized Signatory Stamp */}
              <div className="text-center">
                <div className="h-8 flex items-center justify-center">
                  <span className="font-serif italic font-bold text-sm text-[#0A2E5C] tracking-widest border-b border-zinc-400 pb-0.5">
                    Genius Library
                  </span>
                </div>
                <p className="text-[10px] font-bold text-[#0A2E5C] uppercase tracking-wider mt-0.5">
                  Authorized Signatory
                </p>
                <p className="text-[8.5px] text-zinc-400">Sonbhadra, Uttar Pradesh</p>
              </div>
            </div>

          </div>

        </div>

      </div>

    </div>
  );
}
