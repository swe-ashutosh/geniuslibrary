/**
 * [WEB • LIB] Offline-to-Online Supabase Sync Queue
 *
 * Ensures zero data loss when offline:
 * 1. If internet is disconnected, actions are buffered in an offline queue.
 * 2. When internet connects ('online' event or reconnect attempt), pending actions
 *    are automatically uploaded and synced to Supabase (Sole Database of Truth).
 * 3. Triggers appropriate UI events so all views update in real-time.
 */

import { createClient } from "@/lib/supabase/client";

export type OfflineMutationType = 
  | "seat_upsert" 
  | "seat_delete" 
  | "attendance_record" 
  | "fee_record" 
  | "profile_update" 
  | "exam_sync";

export interface QueuedMutation {
  id: string;
  type: OfflineMutationType;
  table: string;
  action: "upsert" | "insert" | "delete" | "update";
  payload: any;
  filter?: { column: string; value: any };
  timestamp: number;
}

const OFFLINE_QUEUE_KEY = "genius_supabase_offline_queue_v1";

export function getOfflineQueue(): QueuedMutation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveOfflineQueue(queue: QueuedMutation[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  } catch (err) {
    console.warn("Failed to persist offline queue:", err);
  }
}

export function enqueueOfflineMutation(mutation: Omit<QueuedMutation, "id" | "timestamp">): void {
  const item: QueuedMutation = {
    ...mutation,
    id: `sync_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: Date.now(),
  };

  const queue = getOfflineQueue();
  queue.push(item);
  saveOfflineQueue(queue);
  console.log(`[OfflineQueue] Enqueued ${item.type} (Pending total: ${queue.length})`);
}

let isFlushing = false;

export async function flushOfflineQueue(): Promise<{ processed: number; failed: number }> {
  if (typeof window === "undefined" || !navigator.onLine || isFlushing) {
    return { processed: 0, failed: 0 };
  }

  const queue = getOfflineQueue();
  if (queue.length === 0) return { processed: 0, failed: 0 };

  isFlushing = true;
  console.log(`[OfflineQueue] Uploading ${queue.length} pending items to Supabase...`);

  const supabase = createClient();
  const remaining: QueuedMutation[] = [];
  let processed = 0;
  let failed = 0;

  for (const item of queue) {
    try {
      if (item.action === "upsert") {
        const { error } = await supabase.from(item.table).upsert(item.payload);
        if (error) throw error;
      } else if (item.action === "insert") {
        const { error } = await supabase.from(item.table).insert(item.payload);
        if (error) throw error;
      } else if (item.action === "update" && item.filter) {
        const { error } = await supabase.from(item.table).update(item.payload).eq(item.filter.column, item.filter.value);
        if (error) throw error;
      } else if (item.action === "delete" && item.filter) {
        const { error } = await supabase.from(item.table).delete().eq(item.filter.column, item.filter.value);
        if (error) throw error;
      }
      processed++;

      // Trigger UI updates for specific changes
      if (item.type === "seat_upsert" || item.type === "seat_delete") {
        window.dispatchEvent(new CustomEvent("seats_updated"));
      } else if (item.type === "attendance_record") {
        window.dispatchEvent(new CustomEvent("attendance_synced"));
      } else if (item.type === "profile_update") {
        window.dispatchEvent(new CustomEvent("student_profile_updated", { detail: item.payload }));
      }
    } catch (err) {
      console.warn(`[OfflineQueue] Item ${item.id} sync failed:`, err);
      remaining.push(item);
      failed++;
    }
  }

  saveOfflineQueue(remaining);
  isFlushing = false;

  console.log(`[OfflineQueue] Sync finished. Processed: ${processed}, Remaining: ${remaining.length}`);
  return { processed, failed };
}

/**
 * Initializes automatic offline-online sync listeners
 */
export function initOfflineSync(): () => void {
  if (typeof window === "undefined") return () => {};

  const handleOnline = () => {
    console.log("[OfflineQueue] Network restored. Flushing pending mutations...");
    flushOfflineQueue();
  };

  window.addEventListener("online", handleOnline);

  // Periodic flush attempt every 30 seconds if online
  const interval = setInterval(() => {
    if (navigator.onLine) {
      flushOfflineQueue();
    }
  }, 30000);

  return () => {
    window.removeEventListener("online", handleOnline);
    clearInterval(interval);
  };
}
