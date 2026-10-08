/**
 * [WEB • LIB] UI State & Seat Matrix Models
 *
 * UI State & Matrix Helpers
 * (Canonical backend data models are defined in @/lib/api)
 */

export interface SeatItem {
  number: number;
  code: string;
  zone: "silent" | "general" | "premium";
  status: "occupied" | "available" | "reserved" | "maintenance";
  studentName?: string;
  studentId?: string;
  studentCode?: string;
  studentRoll?: string;
  currentShift?: string;
  powerSocket: boolean;
  hasLocker: boolean;
}

export function generateInitialSeats(): SeatItem[] {
  const seats: SeatItem[] = [];
  const lockerNumbers = [8, 15, 23, 34, 42, 55, 68];
  for (let i = 1; i <= 75; i++) {
    seats.push({
      number: i,
      code: `Seat #${i}`,
      zone: "general",
      status: "available",
      powerSocket: true,
      hasLocker: lockerNumbers.includes(i),
    });
  }
  return seats;
}
