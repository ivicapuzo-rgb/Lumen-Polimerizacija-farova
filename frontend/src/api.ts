import AsyncStorage from "@react-native-async-storage/async-storage";

const BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export type Slot = {
  id: string;
  date: string;
  time: string;
  is_booked: boolean;
  created_at: string;
};

export type Booking = {
  id: string;
  slot_id: string;
  slot_date: string;
  slot_time: string;
  customer_name: string;
  phone: string;
  car_brand: string;
  car_model: string;
  notes?: string;
  home_visit?: boolean;
  address?: string;
  latitude?: number | null;
  longitude?: number | null;
  unit_price?: number;
  currency?: string;
  status: "pending" | "confirmed" | "rejected" | "completed";
  created_at: string;
};

export type Settings = {
  price: number;
  currency: string;
};

export type BlockedDay = { date: string };

export type Stats = {
  month: string;
  confirmed_count: number;
  completed_count: number;
  pending_count: number;
  rejected_count: number;
  total_bookings: number;
  revenue: number;
  daily: { date: string; count: number; revenue: number }[];
  history: { month: string; count: number; revenue: number }[];
};

export type Report = {
  period: "day" | "week" | "month";
  start: string;
  end: string;
  count: number;
  revenue: number;
  bookings: Booking[];
};

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    let msg = "Greška";
    try {
      const data = await res.json();
      msg = data.detail || msg;
    } catch {}
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

// ---- Public
export const listSlots = () => request<Slot[]>("/slots");
export const createBooking = (payload: {
  slot_id: string;
  customer_name: string;
  phone: string;
  car_brand: string;
  car_model: string;
  notes?: string;
  home_visit?: boolean;
  address?: string;
  latitude?: number | null;
  longitude?: number | null;
}) => request<Booking>("/bookings", { method: "POST", body: JSON.stringify(payload) });
export const bookingsByPhone = (phone: string) =>
  request<Booking[]>(`/bookings/phone/${encodeURIComponent(phone)}`);

export const getSettings = () => request<Settings>("/settings");

// ---- Admin
export const adminLogin = (password: string) =>
  request<{ ok: boolean }>("/admin/login", {
    method: "POST",
    body: JSON.stringify({ password }),
  });

const adminHeaders = (password: string) => ({ "x-admin-password": password });

export const adminListSlots = (password: string) =>
  request<Slot[]>("/admin/slots", { headers: adminHeaders(password) });

export const adminCreateSlot = (password: string, payload: { date: string; time: string }) =>
  request<Slot>("/admin/slots", {
    method: "POST",
    headers: adminHeaders(password),
    body: JSON.stringify(payload),
  });

export const adminDeleteSlot = (password: string, slotId: string) =>
  request<{ ok: boolean }>(`/admin/slots/${slotId}`, {
    method: "DELETE",
    headers: adminHeaders(password),
  });

export const adminListBookings = (password: string) =>
  request<Booking[]>("/admin/bookings", { headers: adminHeaders(password) });

export const adminUpdateBooking = (
  password: string,
  bookingId: string,
  status: "confirmed" | "rejected" | "pending" | "completed",
) =>
  request<Booking>(`/admin/bookings/${bookingId}`, {
    method: "PATCH",
    headers: adminHeaders(password),
    body: JSON.stringify({ status }),
  });

export const adminUpdateSettings = (password: string, payload: Partial<Settings>) =>
  request<Settings>("/admin/settings", {
    method: "PATCH",
    headers: adminHeaders(password),
    body: JSON.stringify(payload),
  });

export const adminDeleteAllBookings = (password: string) =>
  request<{ ok: boolean; deleted: number }>("/admin/bookings", {
    method: "DELETE",
    headers: adminHeaders(password),
  });

export const adminDeleteAllSlots = (password: string) =>
  request<{ ok: boolean; slots_deleted: number; bookings_deleted: number }>("/admin/slots", {
    method: "DELETE",
    headers: adminHeaders(password),
  });

export const adminListBlocked = (password: string) =>
  request<BlockedDay[]>("/admin/blocked-days", { headers: adminHeaders(password) });

export const adminAddBlocked = (password: string, date: string) =>
  request<BlockedDay>("/admin/blocked-days", {
    method: "POST",
    headers: adminHeaders(password),
    body: JSON.stringify({ date }),
  });

export const adminRemoveBlocked = (password: string, date: string) =>
  request<{ ok: boolean; deleted: number }>(`/admin/blocked-days/${date}`, {
    method: "DELETE",
    headers: adminHeaders(password),
  });

export const adminGetStats = (password: string, month: string) =>
  request<Stats>(`/admin/stats?month=${encodeURIComponent(month)}`, {
    headers: adminHeaders(password),
  });

export const adminGetReport = (
  password: string,
  period: "day" | "week" | "month",
  date?: string,
) =>
  request<Report>(
    `/admin/report?period=${period}${date ? `&date=${encodeURIComponent(date)}` : ""}`,
    { headers: adminHeaders(password) },
  );

// ---- Local storage helpers
const PHONE_KEY = "lumen:last_phone";
const ADMIN_PW_KEY = "lumen:admin_pw";

export const savePhone = (phone: string) => AsyncStorage.setItem(PHONE_KEY, phone);
export const loadPhone = () => AsyncStorage.getItem(PHONE_KEY);
export const saveAdminPw = (pw: string) => AsyncStorage.setItem(ADMIN_PW_KEY, pw);
export const loadAdminPw = () => AsyncStorage.getItem(ADMIN_PW_KEY);
export const clearAdminPw = () => AsyncStorage.removeItem(ADMIN_PW_KEY);
