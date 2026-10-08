/**
 * [API • LIB] Email Service (Resend)
 *
 * Sends fee receipts, welcome emails and the daily admin backup report
 * as branded HTML (name/address/links from white-label.config.ts).
 */

// Email dispatch service using Resend REST API

import { WL } from '../../../white-label.config';

export interface FeeReceiptEmailParams {
  studentName: string;
  studentEmail: string;
  receiptNo: string;
  amount: number;
  totalDue?: number;
  remainingDue?: number;
  plan?: string;
  shift?: string;
  paidAt?: string;
  description?: string;
}

export async function sendFeeReceiptEmail(
  env: any,
  params: FeeReceiptEmailParams
): Promise<{ success: boolean; id?: string; error?: string }> {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[Resend] RESEND_API_KEY is not configured in Worker environment. Skipping email dispatch.');
    return { success: false, error: 'RESEND_API_KEY not configured' };
  }

  if (!params.studentEmail || !params.studentEmail.includes('@')) {
    return { success: false, error: 'Invalid recipient email address' };
  }

  const fromEmail = env.RESEND_FROM_EMAIL || `${WL.emailFrom.fromName} <${WL.emailFrom.fromAddress}>`;
  const formattedDate = params.paidAt
    ? new Date(params.paidAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  const hasRemainingDue = params.remainingDue !== undefined && params.remainingDue > 0;
  const billedTotal = params.totalDue || (hasRemainingDue ? params.amount + (params.remainingDue || 0) : params.amount);

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Fee Payment Receipt</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F8FAFC; margin: 0; padding: 24px; color: #0A2E5C; }
    .card { max-width: 540px; margin: 0 auto; background: #ffffff; border: 1px solid #E5E7EB; border-radius: 20px; overflow: hidden; box-shadow: 0 4px 14px rgba(0,0,0,0.06); }
    .header { background: #0A2E5C; color: #ffffff; padding: 28px 24px; text-align: center; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 900; color: #ffffff; }
    .header p { margin: 4px 0 0; font-size: 11px; color: #FFC107; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; }
    .badge-paid { display: inline-block; background: #E8F5E9; color: #2E7D32; font-size: 11px; font-weight: 800; padding: 4px 14px; border-radius: 12px; margin-top: 12px; text-transform: uppercase; }
    .badge-partial { display: inline-block; background: #FEF3C7; color: #92400E; font-size: 11px; font-weight: 800; padding: 4px 14px; border-radius: 12px; margin-top: 12px; text-transform: uppercase; }
    .body { padding: 24px; }
    .greeting { font-size: 14px; font-weight: 700; margin-bottom: 16px; color: #0A2E5C; }
    .receipt-box { background: #F8F7F4; border: 1px solid #EAE3D9; border-radius: 14px; padding: 18px; margin: 18px 0; }
    .receipt-row { display: flex; justify-content: space-between; font-size: 12px; padding: 6px 0; border-bottom: 1px dashed #E2DACF; }
    .receipt-row:last-child { border-bottom: none; }
    .receipt-label { color: #736B63; }
    .receipt-val { font-weight: 700; color: #0A2E5C; }
    .receipt-total { display: flex; justify-content: space-between; font-size: 15px; font-weight: 900; padding-top: 10px; margin-top: 6px; border-top: 2px solid #0A2E5C; }
    .total-val { color: #2E7D32; }
    .footer { background: #FAF9F6; border-top: 1px solid #EFEAE3; padding: 16px 24px; text-align: center; font-size: 11px; color: #8C827A; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>${WL.fullName}</h1>
      <p>Official Payment Receipt / Tax Invoice</p>
      ${hasRemainingDue 
        ? `<div class="badge-partial">⚠ PARTIAL PAYMENT (Due Balance: ₹${params.remainingDue})</div>`
        : `<div class="badge-paid">✓ FULL PAYMENT VERIFIED (PAID)</div>`
      }
    </div>
    <div class="body">
      <div class="greeting">Dear ${params.studentName},</div>
      <p style="font-size: 13px; color: #554E48; line-height: 1.5; margin: 0 0 14px;">
        ${hasRemainingDue 
          ? `Thank you for your fee payment of <strong>₹${params.amount}</strong>. Please note that a remaining balance of <strong>₹${params.remainingDue}</strong> is due towards your monthly seat fee.` 
          : `Thank you for your fee payment of <strong>₹${params.amount}</strong>. Your full library seat fee has been received and verified.`}
      </p>

      <div class="receipt-box">
        <div class="receipt-row">
          <span class="receipt-label">Receipt Number</span>
          <span class="receipt-val" style="font-family: monospace; color: #0B5ED7;">${params.receiptNo}</span>
        </div>
        <div class="receipt-row">
          <span class="receipt-label">Date of Payment</span>
          <span class="receipt-val">${formattedDate}</span>
        </div>
        <div class="receipt-row">
          <span class="receipt-label">Membership Plan</span>
          <span class="receipt-val">${params.plan || 'General'}</span>
        </div>
        <div class="receipt-row">
          <span class="receipt-label">Shift</span>
          <span class="receipt-val">${params.shift || 'Morning Shift'}</span>
        </div>
        ${params.description ? `
        <div class="receipt-row">
          <span class="receipt-label">Description</span>
          <span class="receipt-val">${params.description}</span>
        </div>` : ''}
        ${hasRemainingDue ? `
        <div class="receipt-row">
          <span class="receipt-label">Total Monthly Fee / Dues</span>
          <span class="receipt-val">₹${billedTotal}</span>
        </div>` : ''}
        <div class="receipt-total">
          <span>Amount Paid (Received)</span>
          <span class="total-val">₹${params.amount}</span>
        </div>
        ${hasRemainingDue ? `
        <div class="receipt-row" style="background: #FFF5F5; padding: 6px 10px; border-radius: 8px; margin-top: 8px;">
          <span class="receipt-label" style="color: #C53030; font-weight: 800;">Remaining Balance Due</span>
          <span class="receipt-val" style="color: #C53030; font-weight: 900;">₹${params.remainingDue}</span>
        </div>` : `
        <div class="receipt-row" style="padding-top: 6px;">
          <span class="receipt-label">Remaining Balance</span>
          <span class="receipt-val" style="color: #2E7D32;">₹0.00 (All Dues Cleared)</span>
        </div>`}
      </div>

      <p style="font-size: 11px; color: #8C827A; line-height: 1.4; margin: 16px 0 0;">
        You can also view and download your PDF receipts anytime from your <a href="${WL.siteUrl}/student/fees/" style="color: #0B5ED7; font-weight: bold;">Student Portal</a>.
      </p>
    </div>
    <div class="footer">
      <strong>${WL.fullName}</strong><br>
      ${WL.address}<br>
      Helpdesk: ${WL.email} | ${WL.phone}
    </div>
  </div>
</body>
</html>
`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [params.studentEmail],
        subject: `Fee Payment Receipt #${params.receiptNo} — ${WL.fullName}`,
        html: htmlContent,
      }),
    });

    const data: any = await res.json();
    if (!res.ok) {
      console.error('[Resend] Error sending email:', data);
      return { success: false, error: data?.message || res.statusText };
    }

    console.log(`[Resend] Successfully sent fee receipt email to ${params.studentEmail} (Email ID: ${data?.id})`);
    return { success: true, id: data?.id };
  } catch (err: any) {
    console.error('[Resend] Network exception sending receipt email:', err);
    return { success: false, error: err.message };
  }
}

export interface StudentNightlySheetRecord {
  no?: number;
  studentId?: string | null;
  studentCode: string;
  studentName: string;
  membership: string;
  status: string;
  fees: string;
  renewDate: string;
  attendance: string;
  checkIn: string;
  checkOut: string;
  upiClaims: string;
  mobNo: string;
  course: string;
  joinDate: string;
  seatNumber?: string | null;
  shift?: string | null;
  feesPaidToday?: number | null;
  latestInvoiceNo?: string | null;
  pendingDue?: number | null;
  isNewStudent?: boolean;
  isTrial?: boolean;
}

export interface DailyBackupReportParams {
  reportDate: string;
  totalStudents: number;
  newStudentsCount: number;
  totalFeeCollected: number;
  totalPendingDues: number;
  totalPresent: number;
  totalAbsent: number;
  suspendedStudentsCount: number;
  trialStudentsCount: number;
  occupiedSeats: number;
  reservedSeats: number;
  availableSeats: number;
  studentSheetRecords?: StudentNightlySheetRecord[];
  attendanceRecords?: { studentName: string; seatNumber?: string; checkIn: string; checkOut?: string; shift?: string }[];
  feeTransactions?: { studentName: string; amount: number; receiptNo?: string; type?: string; paidAt?: string }[];
  dueStudents?: { studentName: string; dueAmount: number; phone?: string; seatNumber?: string }[];
}

function bufferToBase64(data: Uint8Array | string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(data).toString('base64');
  }
  if (typeof data === 'string') {
    return btoa(unescape(encodeURIComponent(data)));
  }
  let binary = '';
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export async function sendDailyAdminBackupReportEmail(
  env: any,
  data: DailyBackupReportParams
): Promise<{ success: boolean; id?: string; error?: string }> {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[Resend] RESEND_API_KEY not configured. Skipping daily admin report email.');
    return { success: false, error: 'RESEND_API_KEY not configured' };
  }

  const adminEmail = WL.adminEmail;
  const fromEmail = env.RESEND_FROM_EMAIL || `${WL.shortName} Backup Engine <${WL.emailFrom.fromAddress}>`;

  try {
    const { generateDailyReportHtml, generateDailyReportCsv, generateDailyReportPdf } = await import('./reportGenerator');

    // 1. Generate full HTML body matching UI layout
    const htmlContent = generateDailyReportHtml(data);

    // 2. Generate CSV attachment
    const csvString = generateDailyReportCsv(data);
    const csvBase64 = bufferToBase64(csvString);

    // 3. Generate native binary PDF attachment
    const pdfBytes = generateDailyReportPdf(data);
    const pdfBase64 = bufferToBase64(pdfBytes);

    const attachments = [
      {
        filename: `Daily_Student_Operations_Report_${data.reportDate}.pdf`,
        content: pdfBase64,
      },
      {
        filename: `Daily_Student_Operations_Report_${data.reportDate}.csv`,
        content: csvBase64,
      }
    ];

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [adminEmail],
        subject: `📊 Daily Student Operations Report [${data.reportDate}] — ${WL.fullName}`,
        html: htmlContent,
        attachments: attachments,
      }),
    });

    const respData: any = await res.json();
    if (!res.ok) {
      console.error('[Resend] Error sending admin backup email:', respData);
      return { success: false, error: respData?.message || res.statusText };
    }

    console.log(`[Resend] Successfully sent daily report with PDF & CSV to ${adminEmail} (Email ID: ${respData?.id})`);
    return { success: true, id: respData?.id };
  } catch (err: any) {
    console.error('[Resend] Network exception sending admin backup report:', err);
    return { success: false, error: err.message };
  }
}

export interface StudentWelcomeEmailParams {
  studentName: string;
  studentEmail: string;
  membershipPlan?: string;
  shift?: string;
  seatNumber?: string | null;
  admissionDate?: string;
}

/**
 * Sends an official, branded Welcome & Admission Confirmation Email to the student
 * triggered when an Admin approves their registration in the admin dashboard.
 */
export async function sendStudentWelcomeEmail(
  env: any,
  params: StudentWelcomeEmailParams
): Promise<{ success: boolean; id?: string; error?: string }> {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[Resend] RESEND_API_KEY is not configured in Worker environment. Skipping welcome email.');
    return { success: false, error: 'RESEND_API_KEY not configured' };
  }

  if (!params.studentEmail || !params.studentEmail.includes('@')) {
    return { success: false, error: 'Invalid recipient email address' };
  }

  const fromEmail = env.RESEND_FROM_EMAIL || `${WL.emailFrom.fromName} <${WL.emailFrom.fromAddress}>`;
  const formattedDate = params.admissionDate
    ? new Date(params.admissionDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Welcome to ${WL.fullName}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F8FAFC; margin: 0; padding: 24px; color: #0A2E5C; }
    .card { max-width: 560px; margin: 0 auto; background: #ffffff; border: 1px solid #E5E7EB; border-radius: 24px; overflow: hidden; box-shadow: 0 4px 18px rgba(30, 38, 53, 0.08); }
    .header { background: #0A2E5C; color: #ffffff; padding: 32px 24px; text-align: center; }
    .header h1 { margin: 0; font-size: 22px; font-weight: 900; color: #ffffff; letter-spacing: -0.5px; }
    .header p { margin: 6px 0 0; font-size: 11px; color: #FFC107; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; }
    .badge-approved { display: inline-block; background: #E8F5E9; color: #2E7D32; font-size: 11px; font-weight: 800; padding: 5px 16px; border-radius: 14px; margin-top: 14px; text-transform: uppercase; letter-spacing: 0.5px; }
    .body { padding: 28px 24px; }
    .greeting { font-size: 16px; font-weight: 800; margin-bottom: 8px; color: #0A2E5C; }
    .intro { font-size: 13px; line-height: 1.6; color: #5B6577; margin: 0 0 20px 0; }
    .info-box { background: #F8F7F4; border: 1px solid #EAE3D9; border-radius: 16px; padding: 20px; margin: 18px 0; }
    .info-row { display: flex; justify-content: space-between; font-size: 13px; padding: 8px 0; border-bottom: 1px dashed #E2DACF; }
    .info-row:last-child { border-bottom: none; }
    .info-label { color: #736B63; }
    .info-val { font-weight: 800; color: #0A2E5C; }
    .seat-badge { background: #0A2E5C; color: #FFC107; padding: 2px 10px; border-radius: 8px; font-weight: 900; }
    .btn-container { text-align: center; margin: 28px 0 20px; }
    .btn { display: inline-block; background: #0A2E5C; color: #ffffff !important; font-size: 14px; font-weight: 800; padding: 14px 32px; border-radius: 14px; text-decoration: none; box-shadow: 0 4px 12px rgba(30, 38, 53, 0.15); }
    .rules-box { background: #FAF9F6; border-left: 4px solid #FFC107; padding: 14px 16px; border-radius: 8px; font-size: 12px; color: #5B6577; line-height: 1.6; margin-top: 20px; }
    .footer { background: #F8F7F4; padding: 20px; text-align: center; font-size: 11px; color: #8C827A; border-top: 1px solid #EAE3D9; }
    .footer strong { color: #0A2E5C; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>${WL.fullName}</h1>
      <p>Sonbhadra's #1 Automated 24/7 Digital Library</p>
      <div class="badge-approved">✓ Admission Approved & Enrolled</div>
    </div>
    <div class="body">
      <div class="greeting">Congratulations, ${params.studentName}! 🎉</div>
      <p class="intro">
        Your student registration has been reviewed and officially approved by the library administration. Welcome to our focused, distraction-free study environment at Madhupur, Sonbhadra.
      </p>

      <div class="info-box">
        <div class="info-row">
          <span class="info-label">Student Name:</span>
          <span class="info-val">${params.studentName}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Membership Plan:</span>
          <span class="info-val">${params.membershipPlan || 'General Membership'}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Shift & Timings:</span>
          <span class="info-val">${params.shift || 'Regular Shift'}</span>
        </div>
        ${params.seatNumber ? `
        <div class="info-row">
          <span class="info-label">Allocated Seat:</span>
          <span class="info-val"><span class="seat-badge">Seat #${params.seatNumber}</span></span>
        </div>` : ''}
        <div class="info-row">
          <span class="info-label">Admission Date:</span>
          <span class="info-val">${formattedDate}</span>
        </div>
      </div>

      <div class="btn-container">
        <a href="${WL.siteUrl}/login" class="btn" target="_blank">
          Open Student Portal & Dashboard →
        </a>
      </div>

      <div class="rules-box">
        <strong>📌 Key Library Guidelines:</strong><br/>
        • Please check in via the QR Attendance Scanner at the front desk upon arrival.<br/>
        • Strict silence must be maintained in the study hall at all times.<br/>
        • High-speed Wi-Fi and power sockets are available at your desk.<br/>
        • For any help, contact the library administration or use the Inquiries chat in your student dashboard.
      </div>
    </div>
    <div class="footer">
      <strong>${WL.fullName}</strong><br/>
      ${WL.address}<br/>
      Official Portal: <a href="${WL.siteUrl}" style="color: #0B5ED7;">${WL.siteUrl.replace('https://', '')}</a>
    </div>
  </div>
</body>
</html>
  `;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [params.studentEmail],
        subject: `🎓 Welcome to ${WL.fullName} — Admission Approved!`,
        html: htmlContent,
      }),
    });

    const data: any = await res.json();
    if (!res.ok) {
      console.error('[Resend] Error sending student welcome email:', data);
      return { success: false, error: data?.message || res.statusText };
    }

    console.log(`[Resend] Successfully sent welcome email to ${params.studentEmail} (Email ID: ${data?.id})`);
    return { success: true, id: data?.id };
  } catch (err: any) {
    console.error('[Resend] Exception sending student welcome email:', err);
    return { success: false, error: err.message };
  }
}


