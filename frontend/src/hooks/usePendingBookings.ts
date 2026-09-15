import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";

import { adminListBookings, loadAdminPw } from "@/src/api";
import { useAdminPassword } from "@/src/authState";
import { storage } from "@/src/utils/storage";

const LAST_SEEN_KEY = "lumen:last_seen_pending";

export function usePendingBookings() {
  const password = useAdminPassword();
  const [lastSeen, setLastSeen] = useState<number>(0);
  const [freshCount, setFreshCount] = useState<number>(0);
  const previousPendingIds = useRef<string[]>([]);
  const hasBaseline = useRef<boolean>(false);

  // Kick off initial load of stored admin password on mount (updates global state)
  useEffect(() => {
    loadAdminPw();
    (async () => {
      const seen = await storage.getItem<number>(LAST_SEEN_KEY, 0);
      setLastSeen(seen ?? 0);
    })();
  }, []);

  // Reset baseline whenever the admin password changes (e.g., login / logout)
  useEffect(() => {
    previousPendingIds.current = [];
    hasBaseline.current = false;
    setFreshCount(0);
  }, [password]);

  const { data } = useQuery({
    queryKey: ["admin", "bookings", "poll", password ?? ""],
    queryFn: () => adminListBookings(password!),
    enabled: !!password,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    retry: false,
  });

  const pending = (data || []).filter((b) => b.status === "pending");
  const pendingCount = pending.length;

  useEffect(() => {
    if (!data) return;
    const currentIds = pending.map((b) => b.id).sort();
    if (!hasBaseline.current) {
      hasBaseline.current = true;
      previousPendingIds.current = currentIds;
      return;
    }
    const previousIds = previousPendingIds.current;
    const hasNew = currentIds.some((id) => !previousIds.includes(id));
    if (hasNew) {
      const newIds = currentIds.filter((id) => !previousIds.includes(id));
      setFreshCount((c) => c + newIds.length);
    }
    previousPendingIds.current = currentIds;
  }, [data, pending]);

  const markSeen = useCallback(async () => {
    const now = Date.now();
    await storage.setItem(LAST_SEEN_KEY, now);
    setLastSeen(now);
    setFreshCount(0);
  }, []);

  return { pendingCount, freshCount, markSeen, isAdmin: !!password, lastSeen };
}
