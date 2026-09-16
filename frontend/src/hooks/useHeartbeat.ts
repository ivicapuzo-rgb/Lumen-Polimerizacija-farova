import { useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";

import { heartbeat } from "@/src/api";
import { useAdminPassword } from "@/src/authState";
import { storage } from "@/src/utils/storage";

const SID_KEY = "lumen:session_id";

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Sends an anonymous heartbeat every 30s so the admin can see how many
 * devices are actively using the app. The role is "admin" while the
 * admin password is present in the global auth state, else "customer".
 */
export function useHeartbeat() {
  const password = useAdminPassword();
  const sessionIdRef = useRef<string | null>(null);
  const roleRef = useRef<"customer" | "admin">(password ? "admin" : "customer");

  useEffect(() => {
    roleRef.current = password ? "admin" : "customer";
  }, [password]);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const ensureId = async () => {
      const stored = await storage.getItem<string>(SID_KEY, "");
      if (stored) {
        sessionIdRef.current = stored;
        return stored;
      }
      const id = makeId();
      await storage.setItem(SID_KEY, id);
      sessionIdRef.current = id;
      return id;
    };

    const beat = async () => {
      try {
        const id = sessionIdRef.current ?? (await ensureId());
        await heartbeat(id, roleRef.current);
      } catch {
        // silent
      }
    };

    (async () => {
      await ensureId();
      if (stopped) return;
      beat();
      timer = setInterval(beat, 30_000);
    })();

    const sub =
      Platform.OS === "web"
        ? null
        : AppState.addEventListener("change", (state) => {
            if (state === "active") beat();
          });

    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
      sub?.remove();
    };
  }, []);
}
