/**
 * [WEB • LIB • SEATS] Desk & Seat Number Normalization and Matching
 *
 * Provides bidirectional normalization and matching between:
 * - Continuous 01-100 desks ("01", "03", "14", "100")
 * - Legacy / Zone formats ("A-01", "A-03", "B-04", "J-10")
 * - Prefixed strings ("Seat #A-03", "Seat #03", "S-03", "#03", "Desk 3")
 */

/**
 * Extracts a numeric desk number (1-100) from any seat representation.
 */
export function parseDeskNum(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") {
    return raw >= 1 && raw <= 100 ? raw : null;
  }
  const s = String(raw).trim().toUpperCase();
  if (!s || s === "—" || s === "-" || s === "OPEN" || s === "NONE") return null;

  // 1. Row letter + number pattern: e.g. A-03, A3, B-04, J-10, SEAT #A-03, ZONE A-03
  const rowMatch = s.match(/([A-J])\s*[-#]?\s*(\d{1,2})/i);
  if (rowMatch) {
    const letter = rowMatch[1].toUpperCase();
    const subNum = parseInt(rowMatch[2], 10);
    const rowIndex = letter.charCodeAt(0) - 65; // A=0, B=1, ... J=9
    const calculatedDesk = rowIndex * 10 + subNum;
    if (calculatedDesk >= 1 && calculatedDesk <= 100) {
      return calculatedDesk;
    }
    if (subNum >= 1 && subNum <= 100) {
      return subNum;
    }
  }

  // 2. Pure digit extraction: S-03, #03, 03, Desk 3, Seat #3
  const digitsMatch = s.match(/\d+/);
  if (digitsMatch) {
    const num = parseInt(digitsMatch[0], 10);
    if (num >= 1 && num <= 100) {
      return num;
    }
  }

  return null;
}

/**
 * Formats a seat number to 2-digit padded string: 3 -> "03", 10 -> "10".
 */
export function formatDeskId(numOrStr: string | number | null | undefined): string {
  const deskNum = parseDeskNum(numOrStr);
  if (deskNum !== null) {
    return String(deskNum).padStart(2, "0");
  }
  return String(numOrStr || "").replace(/[^0-9a-zA-Z]/g, "").padStart(2, "0");
}

/**
 * Determines whether a student's assigned seat matches a target desk ID.
 * Supports "A-03" matching "03", "Seat #A-03" matching "03", "S-03" matching "03", etc.
 */
export function matchSeatNumber(
  studentSeat: string | number | null | undefined,
  targetDesk: string | number | null | undefined
): boolean {
  if (!studentSeat || !targetDesk) return false;

  const rawStd = String(studentSeat).trim().toUpperCase();
  const rawDesk = String(targetDesk).trim().toUpperCase();

  // Direct string equality
  if (rawStd === rawDesk) return true;
  if (
    rawStd === `S-${rawDesk}` ||
    rawStd === `SEAT #${rawDesk}` ||
    rawStd === `DESK #${rawDesk}` ||
    rawStd === `#${rawDesk}`
  ) {
    return true;
  }

  // Parse numeric values
  const stdNum = parseDeskNum(studentSeat);
  const deskNum = parseDeskNum(targetDesk);

  if (stdNum !== null && deskNum !== null) {
    if (stdNum === deskNum) return true;
  }

  // Sub-number fallback (e.g. A-03 matching 3 directly)
  const digits = rawStd.match(/\d+/);
  if (digits && deskNum !== null) {
    if (parseInt(digits[0], 10) === deskNum) return true;
  }

  return false;
}
