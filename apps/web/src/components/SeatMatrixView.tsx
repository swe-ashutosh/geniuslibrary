"use client";

/**
 * [WEB • COMPONENT] Seat Matrix Grid
 *
 * Renders the seat/occupancy grid for admin and landing usage.
 */
import { useState } from "react";
import { generateInitialSeats, SeatItem } from "@/lib/store";
import { 
  CheckCircle2, 
  Clock, 
  Info, 
  Lock, 
  ChevronRight,
  UserCheck
} from "lucide-react";
import Link from "next/link";

interface SeatMatrixViewProps {
  interactive?: boolean;
  onSelectSeat?: (seat: SeatItem) => void;
  selectedSeatNumber?: number;
  showAdminControls?: boolean;
}

export function SeatMatrixView({
  onSelectSeat,
  selectedSeatNumber,
}: SeatMatrixViewProps) {
  const [seats] = useState<SeatItem[]>(generateInitialSeats());
  const [activeZone, setActiveZone] = useState<string>("all");
  const [activeShift, setActiveShift] = useState<string>("morning");
  const [selectedModalSeat, setSelectedModalSeat] = useState<SeatItem | null>(null);

  const filteredSeats = seats.filter((seat) => {
    if (activeZone !== "all" && seat.zone !== activeZone) return false;
    return true;
  });

  const availableCount = seats.filter((s) => s.status === "available").length;
  const occupiedCount = seats.filter((s) => s.status === "occupied").length;
  const reservedCount = seats.filter((s) => s.status === "reserved").length;

  const handleSeatClick = (seat: SeatItem) => {
    if (onSelectSeat) {
      onSelectSeat(seat);
    } else {
      setSelectedModalSeat(seat);
    }
  };

  const getStatusColor = (status: SeatItem["status"], isSelected: boolean) => {
    if (isSelected) return "ring-4 ring-[#FFC107] bg-[#E5E7EB]/30 border-[#0A2E5C] text-[#0A2E5C]";
    switch (status) {
      case "available":
        return "bg-emerald-50 border-emerald-300 text-emerald-900 hover:bg-emerald-100 hover:border-emerald-400 hover:scale-105 shadow-sm";
      case "occupied":
        return "bg-[#0A2E5C] border-[#0A2E5C] text-white hover:bg-[#141A24]";
      case "reserved":
        return "bg-[#E5E7EB]/40 border-[#FFC107] text-[#0A2E5C] hover:bg-[#E5E7EB]/60";
      case "maintenance":
        return "bg-zinc-100 border-zinc-300 text-zinc-400 cursor-not-allowed";
      default:
        return "bg-zinc-50 border-zinc-200 text-zinc-700";
    }
  };

  return (
    <div className="w-full rounded-3xl border border-[#E5E7EB] bg-white p-5 sm:p-8 shadow-xl shadow-[#0A2E5C]/5 backdrop-blur dark:border-zinc-800 dark:bg-[#0A2E5C]/90">
      {/* Header & Controls */}
      <div className="flex flex-col gap-4 border-b border-[#E5E7EB]/60 pb-5 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <h3 className="text-lg sm:text-xl font-black text-[#0A2E5C] dark:text-white">
              Live Hall Seat Matrix (75 Desks)
            </h3>
          </div>
          <p className="text-xs sm:text-sm text-[#6B7280] dark:text-zinc-400 mt-0.5">
            Click on any desk to check shift allocation, charging ports, or start reservation.
          </p>
        </div>

        {/* Shift selector */}
        <div className="flex flex-wrap items-center gap-1.5 rounded-2xl bg-[#F8FAFC] p-1.5 dark:bg-zinc-800/80">
          {[
            { id: "morning", label: "Morning (06 AM - 02 PM)" },
            { id: "evening", label: "Evening (02 PM - 10 PM)" },
            { id: "full", label: "Full Day (24x7)" },
          ].map((shift) => (
            <button
              key={shift.id}
              onClick={() => setActiveShift(shift.id)}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                activeShift === shift.id
                  ? "bg-[#0A2E5C] text-[#FFC107] shadow-sm"
                  : "text-[#6B7280] hover:text-[#0A2E5C] dark:text-zinc-400 dark:hover:text-white"
              }`}
            >
              {shift.label}
            </button>
          ))}
        </div>
      </div>

      {/* Legend & Live Counters Bar */}
      <div className="my-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-xs font-bold text-[#0B5ED7]">
          <span>Study Desks #1 to #75</span>
        </div>

        {/* Live Counters */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full border border-emerald-500 bg-emerald-100"></span>
            <span className="font-medium text-[#0A2E5C] dark:text-zinc-300">
              Available ({availableCount})
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-[#0A2E5C]"></span>
            <span className="font-medium text-[#0A2E5C] dark:text-zinc-300">
              Occupied Now ({occupiedCount})
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full border border-[#FFC107] bg-[#E5E7EB]"></span>
            <span className="font-medium text-[#0A2E5C] dark:text-zinc-300">
              Reserved ({reservedCount})
            </span>
          </div>
        </div>
      </div>

      {/* Hall Blueprint Architecture Map */}
      <div className="relative rounded-3xl border-2 border-dashed border-[#E5E7EB] bg-[#F8FAFC]/70 p-4 sm:p-6 dark:border-zinc-800 dark:bg-zinc-950/50 overflow-x-auto">
        {/* Hall Landmarks */}
        <div className="mb-4 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-[#0B5ED7] border-b border-[#E5E7EB] dark:border-zinc-800 pb-2">
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-emerald-500/10 px-2.5 py-0.5 text-emerald-700">
              🚪 Main Entry / RFID Smart Turnstile
            </span>
            <span className="rounded-lg bg-[#FFC107]/20 px-2.5 py-0.5 text-[#0A2E5C] dark:text-[#FFC107]">
              💧 RO UV Water & Kettle Bar
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-[#0A2E5C] px-2.5 py-0.5 text-[#FFC107]">
              👮 Staff Desk & CCTV Control
            </span>
          </div>
        </div>

        {/* Desks Grid */}
        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-12 gap-2.5 sm:gap-3 min-w-[580px]">
          {filteredSeats.map((seat) => {
            const isSelected = selectedSeatNumber === seat.number;
            return (
              <button
                key={seat.number}
                onClick={() => handleSeatClick(seat)}
                className={`group relative flex flex-col items-center justify-center rounded-2xl border p-2.5 transition-all ${getStatusColor(
                  seat.status,
                  isSelected
                )}`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-xs font-black">#S-{String(seat.number).padStart(2, "0")}</span>
                  {seat.hasLocker && <Lock className="h-3 w-3 text-[#FFC107]" />}
                </div>

                <div className="my-1.5 flex h-7 w-7 items-center justify-center rounded-xl bg-white/90 shadow-xs dark:bg-zinc-800">
                  {seat.status === "available" && (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  )}
                  {seat.status === "occupied" && (
                    <UserCheck className="h-4 w-4 text-[#0A2E5C]" />
                  )}
                  {seat.status === "reserved" && (
                    <Clock className="h-4 w-4 text-[#0B5ED7]" />
                  )}
                  {seat.status === "maintenance" && (
                    <Info className="h-4 w-4 text-zinc-400" />
                  )}
                </div>

                <span className="text-[10px] font-bold uppercase tracking-tight line-clamp-1">
                  {seat.zone === "silent"
                    ? "Silent"
                    : seat.zone === "premium"
                    ? "Cubicle"
                    : "Hall"}
                </span>

                <div className="pointer-events-none absolute -top-9 z-20 hidden rounded-lg bg-[#0A2E5C] px-2.5 py-1 text-[10px] font-bold text-[#FFC107] shadow-lg group-hover:flex whitespace-nowrap">
                  {seat.code} • {seat.status.toUpperCase()}
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex items-center justify-between text-[11px] font-semibold text-[#0B5ED7] border-t border-[#E5E7EB] dark:border-zinc-800 pt-2">
          <span>❄️ Dual Split AC Zone #1</span>
          <span>⚡ Dedicated Power Surge Protector Strip #A</span>
          <span>❄️ Dual Split AC Zone #2</span>
        </div>
      </div>

      {/* Selected Seat Modal Detail */}
      {selectedModalSeat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl dark:bg-[#0A2E5C] border border-[#FFC107] animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-[#FFC107]/20 px-2.5 py-0.5 text-xs font-bold text-[#0A2E5C] dark:text-[#FFC107]">
                    Desk Details
                  </span>
                  <span className="text-xs uppercase font-semibold text-[#0B5ED7]">
                    {selectedModalSeat.zone} Zone
                  </span>
                </div>
                <h4 className="mt-1 text-2xl font-black text-[#0A2E5C] dark:text-white">
                  Study {selectedModalSeat.code}
                </h4>
              </div>
              <button
                onClick={() => setSelectedModalSeat(null)}
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-[#F8FAFC]"
              >
                ✕
              </button>
            </div>

            <div className="my-5 space-y-3 rounded-2xl bg-[#F8FAFC] p-4 text-xs dark:bg-zinc-800/60">
              <div className="flex justify-between">
                <span className="text-zinc-500">Current Status:</span>
                <span
                  className={`font-bold uppercase ${
                    selectedModalSeat.status === "available"
                      ? "text-emerald-700 font-black"
                      : selectedModalSeat.status === "occupied"
                      ? "text-[#0A2E5C] font-black"
                      : "text-[#0B5ED7]"
                  }`}
                >
                  ● {selectedModalSeat.status}
                </span>
              </div>

              {selectedModalSeat.studentName && (
                <div className="flex justify-between border-t border-[#E5E7EB]/60 pt-2">
                  <span className="text-zinc-500">Assigned Member:</span>
                  <span className="font-bold text-[#0A2E5C] dark:text-white">
                    {selectedModalSeat.studentName} {selectedModalSeat.studentId || selectedModalSeat.studentCode || selectedModalSeat.studentRoll ? `(${selectedModalSeat.studentId || selectedModalSeat.studentCode || selectedModalSeat.studentRoll})` : ""}
                  </span>
                </div>
              )}

              <div className="flex justify-between border-t border-[#E5E7EB]/60 pt-2">
                <span className="text-zinc-500">Desk Amenities:</span>
                <span className="font-medium text-[#0A2E5C] dark:text-zinc-200">
                  230V Socket • High LED Lamp • Ergonomic Chair
                </span>
              </div>

              <div className="flex justify-between border-t border-[#E5E7EB]/60 pt-2">
                <span className="text-zinc-500">Personal Locker:</span>
                <span className="font-medium text-[#0A2E5C] dark:text-zinc-200">
                  {selectedModalSeat.hasLocker ? "✅ Included" : "❌ Available in Premium"}
                </span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setSelectedModalSeat(null)}
                className="flex-1 rounded-xl border border-[#E5E7EB] py-2.5 text-xs font-semibold text-[#0A2E5C] hover:bg-[#F8FAFC] dark:text-white"
              >
                Close
              </button>

              <Link
                href={`/login?role=student&seat=${selectedModalSeat.number}`}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#0A2E5C] py-2.5 text-xs font-bold text-[#FFC107] border border-[#FFC107]/40 shadow-md hover:bg-[#141A24] transition"
              >
                Book This Desk
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
