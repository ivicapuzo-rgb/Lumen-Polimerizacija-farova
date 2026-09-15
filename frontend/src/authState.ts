import { useSyncExternalStore } from "react";

// Simple in-memory store for the currently logged-in admin password so
// changes (login/logout) are picked up by any hook subscribed to it,
// without waiting for an app reload.
let currentPassword: string | null = null;
const listeners = new Set<() => void>();

export function setAdminPasswordGlobal(pw: string | null) {
  if (currentPassword === pw) return;
  currentPassword = pw;
  listeners.forEach((l) => l());
}

export function getAdminPasswordGlobal(): string | null {
  return currentPassword;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useAdminPassword(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => currentPassword,
    () => currentPassword,
  );
}
