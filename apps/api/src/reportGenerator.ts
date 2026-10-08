/**
 * [API • LIB] CSV + PDF Report Generator
 *
 * Builds daily operational CSV sheets and the PDF backup ledger with
 * branded headers from white-label.config.ts.
 */

import { DailyBackupReportParams, StudentNightlySheetRecord } from './email';
import { WL } from '../../../white-label.config';

/**
 * Generates an RFC-4180 compliant CSV file for the Daily Operations Report
 */
export function generateDailyReportCsv(data: DailyBackupReportParams): string {
  const headers = [
    'NO',
    'STUDENT ID',
    'STUDENT NAME',
    'MEMBERSHIP',
    'STATUS',
    'FEES',
    'RENEW DATE',
    'ATTENDANCE',
    'CHECK-IN',
    'CHECKOUT',
    'UPI CLAIMS',
    'MOB NO',
    'COURSE',
    'JOIN DATE'
  ];

  const escapeCsv = (str: any) => {
    if (str === null || str === undefined) return '""';
    const s = String(str).replace(/"/g, '""');
    return `"${s}"`;
  };

  const rows = (data.studentSheetRecords || []).map((r, idx) => [
    idx + 1,
    escapeCsv(r.studentCode),
    escapeCsv(r.studentName),
    escapeCsv(r.membership),
    escapeCsv(r.status),
    escapeCsv(r.fees),
    escapeCsv(r.renewDate),
    escapeCsv(r.attendance),
    escapeCsv(r.checkIn),
    escapeCsv(r.checkOut),
    escapeCsv(r.upiClaims),
    escapeCsv(r.mobNo),
    escapeCsv(r.course),
    escapeCsv(r.joinDate)
  ].join(','));

  const summarySection = [
    '# DAILY STUDENT OPERATIONS REPORT SUMMARY',
    `# Date,${data.reportDate}`,
    `# Total Students,${data.totalStudents}`,
    `# New Students,+${data.newStudentsCount || 0}`,
    `# Collected Fees,INR ${data.totalFeeCollected}`,
    `# Due Fees,INR ${data.totalPendingDues}`,
    `# Present,${data.totalPresent}`,
    `# Absent,${data.totalAbsent}`,
    `# Suspended,${data.suspendedStudentsCount || 0}`,
    `# Trial,${data.trialStudentsCount || 0}`,
    ''
  ].join('\n');

  return `${summarySection}${headers.join(',')}\n${rows.join('\n')}\n`;
}

/**
 * Helper to escape strings for standard PDF syntax
 */
function escapePdfText(text: string): string {
  return (text || '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[^\x20-\x7E]/g, ''); // ASCII printable only for standard Helvetica
}

/**
 * Pure TypeScript generator for native PDF 1.4 documents (A4 Landscape: 842x595pt)
 * Zero external native/canvas dependencies - 100% compatible with Cloudflare Edge Workers!
 */
export function generateDailyReportPdf(data: DailyBackupReportParams): Uint8Array {
  const records = data.studentSheetRecords || [];
  const rowsPerPage = 20;
  const totalPages = Math.max(1, Math.ceil(records.length / rowsPerPage));

  const objects: string[] = [];

  // 1: Catalog
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';

  // 2: Pages container (kids populated later)
  // 3: Font Helvetica
  objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  // 4: Font Helvetica-Bold
  objects[5] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>';

  const pageObjectIds: number[] = [];
  let currentObjId = 6;

  // Build each page
  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const pageObjId = currentObjId++;
    const contentObjId = currentObjId++;
    pageObjectIds.push(pageObjId);

    const startIndex = (pageNum - 1) * rowsPerPage;
    const pageRecords = records.slice(startIndex, startIndex + rowsPerPage);

    const streamParts: string[] = [];

    // Background canvas
    streamParts.push('q');
    streamParts.push('0.96 0.96 0.94 rg'); // Light cream body bg
    streamParts.push('0 0 842 595 re f');

    // Page 1: Dark Navy Header Banner
    if (pageNum === 1) {
      streamParts.push('0.12 0.15 0.21 rg'); // Dark navy #0A2E5C
      streamParts.push('20 520 802 55 re f');

      // Title & Subtitle text
      streamParts.push('BT /F2 16 Tf 1 1 1 rg 35 550 Td (Daily Student Operations Report) Tj ET');
      streamParts.push('BT /F1 8.5 Tf 0.75 0.64 0.53 rg 35 533 Td (${WL.fullName} ${WL.location}) Tj ET');
      streamParts.push(`BT /F2 9 Tf 1 1 1 rg 670 545 Td (Date: ${escapePdfText(data.reportDate)}) Tj ET`);
      streamParts.push('BT /F1 8 Tf 0.8 0.8 0.8 rg 670 533 Td (11:00 PM Nightly Ledger) Tj ET');

      // 8 KPI Summary Cards Row (Width: 802 / 8 = ~95 each, gap = 6)
      const kpis = [
        { label: 'TOTAL STUDENTS', val: String(data.totalStudents), color: '0.15 0.39 0.92' },
        { label: 'NEW STUDENTS', val: `+${data.newStudentsCount || 0}`, color: '0.09 0.64 0.29' },
        { label: 'COLLECTED FEES', val: `INR ${data.totalFeeCollected}`, color: '0.09 0.64 0.29' },
        { label: 'DUE FEES', val: `INR ${data.totalPendingDues}`, color: '0.85 0.47 0.02' },
        { label: 'PRESENT', val: String(data.totalPresent), color: '0.12 0.15 0.21' },
        { label: 'ABSENT', val: String(data.totalAbsent), color: '0.86 0.15 0.15' },
        { label: 'SUSPENDED', val: String(data.suspendedStudentsCount || 0), color: '0.86 0.15 0.15' },
        { label: 'TRIAL', val: String(data.trialStudentsCount || 0), color: '0.12 0.15 0.21' },
      ];

      const cardW = 95;
      const cardGap = 6;
      let cardX = 20;
      kpis.forEach((kpi) => {
        // Card box
        streamParts.push('1 1 1 rg 0.87 0.82 0.74 RG 0.5 w');
        streamParts.push(`${cardX} 465 ${cardW} 45 re B`);

        // Label
        streamParts.push(`BT /F2 6.5 Tf 0.45 0.42 0.39 rg ${cardX + 6} 496 Td (${escapePdfText(kpi.label)}) Tj ET`);

        // Value
        streamParts.push(`BT /F2 13 Tf ${kpi.color} rg ${cardX + 6} 476 Td (${escapePdfText(kpi.val)}) Tj ET`);

        cardX += cardW + cardGap;
      });

      // Section Bar & Title
      streamParts.push('0.15 0.39 0.92 rg 20 446 4 12 re f');
      streamParts.push('BT /F2 10 Tf 0.12 0.15 0.21 rg 30 448 Td (STUDENT ACTIVITY & MEMBERSHIP RECORDS) Tj ET');
    } else {
      // Continuation Header for subsequent pages
      streamParts.push('0.12 0.15 0.21 rg 20 550 802 30 re f');
      streamParts.push(`BT /F2 11 Tf 1 1 1 rg 35 560 Td (Daily Student Operations Report - Page ${pageNum} of ${totalPages}) Tj ET`);
      streamParts.push(`BT /F1 9 Tf 0.75 0.64 0.53 rg 650 560 Td (Date: ${escapePdfText(data.reportDate)}) Tj ET`);
    }

    // Table Header
    const tableTopY = pageNum === 1 ? 438 : 540;
    streamParts.push('0.07 0.1 0.15 rg 20 ' + (tableTopY - 18) + ' 802 18 re f');

    // Column Definitions: exactly 14 columns matching user's mock
    const cols = [
      { name: 'NO', w: 26 },
      { name: 'STUDENT ID', w: 56 },
      { name: 'STUDENT NAME', w: 106 },
      { name: 'MEMBERSHIP', w: 84 },
      { name: 'STATUS', w: 48 },
      { name: 'FEES', w: 42 },
      { name: 'RENEW DATE', w: 56 },
      { name: 'ATTENDANCE', w: 56 },
      { name: 'CHECK-IN', w: 50 },
      { name: 'CHECKOUT', w: 50 },
      { name: 'UPI CLAIMS', w: 50 },
      { name: 'MOB NO', w: 64 },
      { name: 'COURSE', w: 50 },
      { name: 'JOIN DATE', w: 54 },
    ];

    let headerX = 24;
    cols.forEach((col) => {
      streamParts.push(`BT /F2 7.5 Tf 1 1 1 rg ${headerX} ${tableTopY - 13} Td (${escapePdfText(col.name)}) Tj ET`);
      headerX += col.w;
    });

    // Rows Rendering
    let currentY = tableTopY - 18;
    pageRecords.forEach((r, rowIdx) => {
      const rowY = currentY - 16;
      currentY = rowY;

      // Alternating row background
      if (rowIdx % 2 === 0) {
        streamParts.push(`1 1 1 rg 20 ${rowY} 802 16 re f`);
      } else {
        streamParts.push(`0.97 0.98 0.99 rg 20 ${rowY} 802 16 re f`);
      }
      streamParts.push(`0.91 0.91 0.91 RG 0.4 w 20 ${rowY} m 822 ${rowY} l S`);

      let cellX = 24;

      // 1. NO
      streamParts.push(`BT /F1 7.5 Tf 0.3 0.3 0.3 rg ${cellX} ${rowY + 4} Td (${r.no || (startIndex + rowIdx + 1)}) Tj ET`);
      cellX += cols[0].w;

      // 2. STUDENT ID
      streamParts.push(`BT /F2 7.5 Tf 0.12 0.15 0.21 rg ${cellX} ${rowY + 4} Td (${escapePdfText(r.studentCode || '-')}) Tj ET`);
      cellX += cols[1].w;

      // 3. STUDENT NAME (The requested missing column!)
      const truncatedName = (r.studentName || 'Student').slice(0, 20);
      streamParts.push(`BT /F2 7.5 Tf 0.12 0.15 0.21 rg ${cellX} ${rowY + 4} Td (${escapePdfText(truncatedName)}) Tj ET`);
      cellX += cols[2].w;

      // 4. MEMBERSHIP
      const membershipText = (r.membership || 'General / Desk').slice(0, 16);
      streamParts.push(`BT /F1 7.5 Tf 0.4 0.4 0.4 rg ${cellX} ${rowY + 4} Td (${escapePdfText(membershipText)}) Tj ET`);
      cellX += cols[3].w;

      // 5. STATUS
      const statusColor = r.status === 'Active' ? '0.09 0.64 0.29' : (r.status === 'Suspend' ? '0.86 0.15 0.15' : '0.7 0.5 0.1');
      streamParts.push(`BT /F2 7.5 Tf ${statusColor} rg ${cellX} ${rowY + 4} Td (${escapePdfText(r.status || 'Active')}) Tj ET`);
      cellX += cols[4].w;

      // 6. FEES
      const feeColor = r.fees === 'Paid' ? '0.15 0.39 0.92' : '0.85 0.47 0.02';
      streamParts.push(`BT /F2 7.5 Tf ${feeColor} rg ${cellX} ${rowY + 4} Td (${escapePdfText(r.fees || 'Due')}) Tj ET`);
      cellX += cols[5].w;

      // 7. RENEW DATE
      streamParts.push(`BT /F1 7.5 Tf 0.3 0.3 0.3 rg ${cellX} ${rowY + 4} Td (${escapePdfText(r.renewDate || '-')}) Tj ET`);
      cellX += cols[6].w;

      // 8. ATTENDANCE
      const attColor = r.attendance === 'Present' ? '0.09 0.64 0.29' : '0.86 0.15 0.15';
      streamParts.push(`BT /F2 7.5 Tf ${attColor} rg ${cellX} ${rowY + 4} Td (${escapePdfText(r.attendance || 'Absent')}) Tj ET`);
      cellX += cols[7].w;

      // 9. CHECK-IN
      streamParts.push(`BT /F1 7.5 Tf 0.3 0.3 0.3 rg ${cellX} ${rowY + 4} Td (${escapePdfText(r.checkIn || '-')}) Tj ET`);
      cellX += cols[8].w;

      // 10. CHECKOUT
      streamParts.push(`BT /F1 7.5 Tf 0.3 0.3 0.3 rg ${cellX} ${rowY + 4} Td (${escapePdfText(r.checkOut || '-')}) Tj ET`);
      cellX += cols[9].w;

      // 11. UPI CLAIMS
      streamParts.push(`BT /F1 7 Tf 0.3 0.3 0.3 rg ${cellX} ${rowY + 4} Td (${escapePdfText((r.upiClaims || '-').slice(0, 10))}) Tj ET`);
      cellX += cols[10].w;

      // 12. MOB NO
      streamParts.push(`BT /F1 7.5 Tf 0.3 0.3 0.3 rg ${cellX} ${rowY + 4} Td (${escapePdfText(r.mobNo || '-')}) Tj ET`);
      cellX += cols[11].w;

      // 13. COURSE
      streamParts.push(`BT /F1 7.5 Tf 0.3 0.3 0.3 rg ${cellX} ${rowY + 4} Td (${escapePdfText((r.course || 'General').slice(0, 10))}) Tj ET`);
      cellX += cols[12].w;

      // 14. JOIN DATE
      streamParts.push(`BT /F1 7.5 Tf 0.3 0.3 0.3 rg ${cellX} ${rowY + 4} Td (${escapePdfText(r.joinDate || '-')}) Tj ET`);
    });

    // Page Footer
    streamParts.push('Q');
    streamParts.push(`BT /F1 8 Tf 0.5 0.5 0.5 rg 24 16 Td (${WL.fullName} ${WL.location} - Daily Operational Record | Page ${pageNum} of ${totalPages}) Tj ET`);
    streamParts.push('BT /F2 8 Tf 0.5 0.5 0.5 rg 720 16 Td (CONFIDENTIAL) Tj ET');

    const contentStream = streamParts.join('\n');
    const streamLength = contentStream.length;

    // Page object definition
    objects[pageObjId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents ${contentObjId} 0 R >>`;
    objects[contentObjId] = `<< /Length ${streamLength} >>\nstream\n${contentStream}\nendstream`;
  }

  // 2: Pages root object
  objects[2] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${totalPages} >>`;

  // Build final PDF buffer
  let pdfString = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const xrefOffsets: number[] = [0];

  for (let i = 1; i < currentObjId; i++) {
    if (objects[i]) {
      xrefOffsets[i] = pdfString.length;
      pdfString += `${i} 0 obj\n${objects[i]}\nendobj\n`;
    }
  }

  const startXrefOffset = pdfString.length;
  pdfString += `xref\n0 ${currentObjId}\n`;
  pdfString += '0000000000 65535 f \n';

  for (let i = 1; i < currentObjId; i++) {
    const offsetStr = String(xrefOffsets[i] || 0).padStart(10, '0');
    pdfString += `${offsetStr} 00000 n \n`;
  }

  pdfString += `trailer\n<< /Size ${currentObjId} /Root 1 0 R >>\nstartxref\n${startXrefOffset}\n%%EOF\n`;

  // Convert string to Uint8Array
  const uint8 = new Uint8Array(pdfString.length);
  for (let i = 0; i < pdfString.length; i++) {
    uint8[i] = pdfString.charCodeAt(i) & 0xff;
  }
  return uint8;
}

/**
 * Builds HTML template matching the exact UI design shown in user's image
 */
export function generateDailyReportHtml(data: DailyBackupReportParams): string {
  const records = data.studentSheetRecords || [];

  const kpis = [
    { label: 'TOTAL STUDENTS', val: data.totalStudents, color: '#2563EB', sub: null },
    { label: 'NEW STUDENTS', val: `+${data.newStudentsCount || 0}`, color: '#16A34A', sub: null },
    { label: 'COLLECTED FEES', val: `₹${data.totalFeeCollected}`, color: '#16A34A', sub: null },
    { label: 'DUE FEES', val: `₹${data.totalPendingDues}`, color: '#D97706', sub: null },
    { label: 'PRESENT', val: data.totalPresent, color: '#0A2E5C', sub: null },
    { label: 'ABSENT', val: data.totalAbsent, color: '#DC2626', sub: null },
    { label: 'SUSPENDED', val: String(data.suspendedStudentsCount || 0).padStart(2, '0'), color: '#DC2626', sub: null },
    { label: 'TRIAL', val: String(data.trialStudentsCount || 0).padStart(2, '0'), color: '#0A2E5C', sub: null },
  ];

  const kpiCardsHtml = kpis.map(k => `
    <div style="background:#ffffff;border:1px solid #E5E7EB;border-radius:14px;padding:12px 10px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,0.03);">
      <div style="font-size:9px;font-weight:800;color:#6B7280;letter-spacing:0.5px;text-transform:uppercase;">${k.label}</div>
      <div style="font-size:19px;font-weight:900;color:${k.color};margin-top:4px;">${k.val}</div>
    </div>
  `).join('');

  const rowsHtml = records.map((r, idx) => {
    const statusBadge = r.status === 'Active'
      ? '<span style="background:#DCFCE7;color:#15803D;font-weight:800;font-size:9.5px;padding:2px 8px;border-radius:6px;display:inline-block;">Active</span>'
      : (r.status === 'Suspend'
        ? '<span style="background:#FEE2E2;color:#B91C1C;font-weight:800;font-size:9.5px;padding:2px 8px;border-radius:6px;display:inline-block;">Suspend</span>'
        : '<span style="background:#FEF9C3;color:#A16207;font-weight:800;font-size:9.5px;padding:2px 8px;border-radius:6px;display:inline-block;">Pending</span>');

    const feeBadge = r.fees === 'Paid'
      ? '<span style="background:#DBEAFE;color:#1D4ED8;font-weight:800;font-size:9.5px;padding:2px 8px;border-radius:6px;display:inline-block;">Paid</span>'
      : '<span style="background:#FEF3C7;color:#B45309;font-weight:800;font-size:9.5px;padding:2px 8px;border-radius:6px;display:inline-block;">Due</span>';

    const attBadge = r.attendance === 'Present'
      ? '<span style="background:#DCFCE7;color:#15803D;font-weight:800;font-size:9.5px;padding:2px 8px;border-radius:6px;display:inline-block;">Present</span>'
      : '<span style="background:#FEE2E2;color:#B91C1C;font-weight:800;font-size:9.5px;padding:2px 8px;border-radius:6px;display:inline-block;">Absent</span>';

    const rowBg = idx % 2 === 1 ? '#F9FAFB' : '#FFFFFF';

    return `
      <tr style="background:${rowBg};border-bottom:1px solid #E5E7EB;font-size:11px;">
        <td style="padding:9px 8px;font-weight:600;color:#6B7280;text-align:center;">${idx + 1}</td>
        <td style="padding:9px 8px;font-weight:800;color:#0A2E5C;font-family:monospace;">${r.studentCode}</td>
        <td style="padding:9px 8px;font-weight:800;color:#111827;">${r.studentName}</td>
        <td style="padding:9px 8px;color:#4B5563;">${r.membership}</td>
        <td style="padding:9px 8px;text-align:center;">${statusBadge}</td>
        <td style="padding:9px 8px;text-align:center;">${feeBadge}</td>
        <td style="padding:9px 8px;color:#4B5563;font-family:monospace;">${r.renewDate}</td>
        <td style="padding:9px 8px;text-align:center;">${attBadge}</td>
        <td style="padding:9px 8px;color:#374151;font-weight:600;">${r.checkIn}</td>
        <td style="padding:9px 8px;color:#6B7280;">${r.checkOut}</td>
        <td style="padding:9px 8px;color:#4B5563;font-family:monospace;">${r.upiClaims}</td>
        <td style="padding:9px 8px;color:#4B5563;font-family:monospace;">${r.mobNo}</td>
        <td style="padding:9px 8px;color:#374151;font-weight:600;">${r.course}</td>
        <td style="padding:9px 8px;color:#4B5563;font-family:monospace;">${r.joinDate}</td>
      </tr>
    `;
  }).join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Daily Student Operations Report - ${data.reportDate}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F0F2F5; margin: 0; padding: 24px; color: #0A2E5C; }
    .container { max-width: 1200px; margin: 0 auto; }
    .banner { background: #0A2E5C; border-radius: 18px; padding: 28px 32px; color: #ffffff; margin-bottom: 20px; box-shadow: 0 4px 14px rgba(0,0,0,0.08); }
    .banner h1 { margin: 0; font-size: 24px; font-weight: 900; letter-spacing: -0.5px; }
    .banner p { margin: 6px 0 0 0; font-size: 13px; color: #9CA3AF; }
    .kpi-row { display: grid; grid-template-columns: repeat(8, 1fr); gap: 10px; margin-bottom: 24px; }
    .section-title { display: flex; align-items: center; gap: 8px; margin: 24px 0 14px 0; }
    .section-bar { width: 4px; height: 18px; background: #2563EB; border-radius: 2px; }
    .section-heading { margin: 0; font-size: 13px; font-weight: 900; letter-spacing: 0.5px; color: #111827; text-transform: uppercase; }
    .table-container { background: #ffffff; border: 1px solid #E5E7EB; border-radius: 16px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
    table { width: 100%; border-collapse: collapse; text-align: left; }
    th { background: #111827; color: #ffffff; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; padding: 12px 8px; }
    .footer { text-align: center; margin-top: 24px; font-size: 11.5px; color: #6B7280; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header Banner -->
    <div class="banner">
      <h1>Daily Student Operations Report</h1>
      <p>Generated based on system daily logs and attendance records • Date: ${data.reportDate} (11:00 PM Nightly Dispatch)</p>
    </div>

    <!-- 8 KPI Cards Row -->
    <div class="kpi-row">
      ${kpiCardsHtml}
    </div>

    <!-- Section Title -->
    <div class="section-title">
      <div class="section-bar"></div>
      <h2 class="section-heading">STUDENT ACTIVITY & MEMBERSHIP RECORDS</h2>
    </div>

    <!-- 14-Column Master Records Table -->
    <div class="table-container">
      <div style="overflow-x:auto;">
        <table>
          <thead>
            <tr>
              <th style="text-align:center;">NO</th>
              <th>STUDENT ID</th>
              <th>STUDENT NAME</th>
              <th>MEMBERSHIP</th>
              <th style="text-align:center;">STATUS</th>
              <th style="text-align:center;">FEES</th>
              <th>RENEW DATE</th>
              <th style="text-align:center;">ATTENDANCE</th>
              <th>CHECK-IN</th>
              <th>CHECKOUT</th>
              <th>UPI CLAIMS</th>
              <th>MOB NO</th>
              <th>COURSE</th>
              <th>JOIN DATE</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || '<tr><td colspan="14" style="text-align:center;padding:24px;color:#9CA3AF;">No student records found for today.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>

    <div class="footer">
      📎 <strong>Files Attached:</strong> <code>Daily_Student_Operations_Report_${data.reportDate}.pdf</code> and <code>.csv</code><br>
      Automated Nightly Backup Ledger • ${WL.fullName} ${WL.location} • Support: ${WL.email}
    </div>
  </div>
</body>
</html>
  `;
}
