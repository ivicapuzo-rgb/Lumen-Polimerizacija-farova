import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Icon from "@react-native-vector-icons/material-design-icons";
import * as Haptics from "expo-haptics";

import {
  adminAddBlocked,
  adminCreateSlot,
  adminDeleteAllBookings,
  adminDeleteAllSlots,
  adminDeleteSlot,
  adminGetOnline,
  adminGetReport,
  adminGetStats,
  adminListBlocked,
  adminListBookings,
  adminListSlots,
  adminLogin,
  adminRemoveBlocked,
  adminUpdateBooking,
  adminUpdateSettings,
  BlockedDay,
  Booking,
  clearAdminPw,
  getSettings,
  loadAdminPw,
  Report,
  saveAdminPw,
  Settings,
  Slot,
  Stats,
} from "@/src/api";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { useQuery } from "@tanstack/react-query";

import { usePendingBookings } from "@/src/hooks/usePendingBookings";
import { colors } from "@/src/theme";

const HERO =
  "https://images.unsplash.com/photo-1567808291548-fc3ee04dbcf0?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzMjd8MHwxfHNlYXJjaHwyfHxzcG9ydHMlMjBjYXIlMjBkYXJrJTIwYmFja2dyb3VuZHxlbnwwfHx8fDE3ODkyODQyMDN8MA&ixlib=rb-4.1.0&q=85";

const APP_URL = process.env.EXPO_PUBLIC_BACKEND_URL || "https://headlamp-slots.preview.emergentagent.com";
const qrForUrl = (url: string) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=400x400&margin=8&color=0d0d0d&bgcolor=ffb020&data=${encodeURIComponent(url)}`;

const STATUS_META: Record<Booking["status"], { label: string; bg: string; fg: string }> = {
  pending: { label: "Na čekanju", bg: colors.brandTertiary, fg: colors.onBrandTertiary },
  confirmed: { label: "Potvrđeno", bg: "#0F3D18", fg: colors.success },
  completed: { label: "Završeno", bg: colors.brandPrimary, fg: colors.onBrandPrimary },
  rejected: { label: "Odbijeno", bg: "#3D0F0F", fg: colors.error },
};

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("sr-RS", { day: "2-digit", month: "short" });
}

export default function AdminScreen() {
  const insets = useSafeAreaInsets();
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);
  const [tab, setTab] = useState<"slots" | "bookings" | "stats" | "settings">("bookings");

  useEffect(() => {
    loadAdminPw().then((pw) => {
      if (pw) {
        adminLogin(pw)
          .then(() => {
            setPassword(pw);
            setAuthed(true);
          })
          .catch(() => clearAdminPw());
      }
    });
  }, []);

  const handleLogin = async () => {
    if (!password.trim()) return;
    setLoggingIn(true);
    setLoginError(null);
    try {
      await adminLogin(password.trim());
      await saveAdminPw(password.trim());
      setAuthed(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      setLoginError(e.message || "Greška");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await clearAdminPw();
    setPassword("");
    setAuthed(false);
  };

  if (!authed) {
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.loginHero}>
          <Image source={HERO} style={StyleSheet.absoluteFill} contentFit="cover" />
          <LinearGradient
            colors={["rgba(13,13,13,0.4)", "rgba(13,13,13,0.85)", "rgba(13,13,13,1)"]}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.loginContent, { paddingTop: insets.top + 40 }]}>
            <View style={styles.lockIcon}>
              <Icon name="shield-lock-outline" size={28} color={colors.brandPrimary} />
            </View>
            <Text style={styles.loginTitle}>Admin pristup</Text>
            <Text style={styles.loginSub}>Unesi lozinku za upravljanje terminima</Text>
          </View>
        </View>

        <View style={styles.loginForm}>
          <Text style={styles.label}>Lozinka</Text>
          <TextInput
            testID="admin-password-input"
            style={styles.loginInput}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="Unesi admin lozinku"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
          />
          {loginError ? <Text style={styles.errorInline}>{loginError}</Text> : null}
          <Pressable
            testID="admin-login-btn"
            style={({ pressed }) => [styles.loginBtn, pressed && { opacity: 0.85 }]}
            onPress={handleLogin}
            disabled={loggingIn}
          >
            {loggingIn ? (
              <ActivityIndicator color={colors.onBrandPrimary} />
            ) : (
              <>
                <Icon name="login" size={18} color={colors.onBrandPrimary} />
                <Text style={styles.loginBtnText}>Prijava</Text>
              </>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.adminHeader, { paddingTop: insets.top + 12 }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.adminHeaderTitle}>Admin panel</Text>
          <Text style={styles.adminHeaderSub}>Upravljanje terminima i rezervacijama</Text>
        </View>
        <Pressable testID="admin-logout-btn" style={styles.logoutBtn} onPress={handleLogout}>
          <Icon name="logout" size={20} color={colors.onSurfaceSecondary} />
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabsScroll}
        contentContainerStyle={styles.tabsRow}
      >
        <Pressable
          testID="admin-tab-bookings"
          style={[styles.tab, tab === "bookings" && styles.tabActive]}
          onPress={() => setTab("bookings")}
        >
          <Text style={[styles.tabText, tab === "bookings" && styles.tabTextActive]}>Zahtevi</Text>
        </Pressable>
        <Pressable
          testID="admin-tab-slots"
          style={[styles.tab, tab === "slots" && styles.tabActive]}
          onPress={() => setTab("slots")}
        >
          <Text style={[styles.tabText, tab === "slots" && styles.tabTextActive]}>Termini</Text>
        </Pressable>
        <Pressable
          testID="admin-tab-stats"
          style={[styles.tab, tab === "stats" && styles.tabActive]}
          onPress={() => setTab("stats")}
        >
          <Text style={[styles.tabText, tab === "stats" && styles.tabTextActive]}>Statistika</Text>
        </Pressable>
        <Pressable
          testID="admin-tab-settings"
          style={[styles.tab, tab === "settings" && styles.tabActive]}
          onPress={() => setTab("settings")}
        >
          <Text style={[styles.tabText, tab === "settings" && styles.tabTextActive]}>Podešavanja</Text>
        </Pressable>
      </ScrollView>

      {tab === "slots" ? (
        <SlotsAdmin password={password} />
      ) : tab === "bookings" ? (
        <BookingsAdmin password={password} />
      ) : tab === "stats" ? (
        <StatsAdmin password={password} />
      ) : (
        <SettingsAdmin password={password} />
      )}
    </View>
  );
}

// ============= Slots Admin =============
function SlotsAdmin({ password }: { password: string }) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  const load = async () => {
    try {
      const data = await adminListSlots(password);
      setSlots(data);
    } catch {}
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handleDelete = async (id: string) => {
    try {
      await adminDeleteSlot(password, id);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await load();
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brandPrimary} />
        </View>
      ) : (
        <FlatList
          data={slots}
          keyExtractor={(s) => s.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brandPrimary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Icon name="calendar-plus" size={48} color={colors.muted} />
              <Text style={styles.emptyText}>Još uvek nema termina</Text>
              <Text style={styles.emptySub}>Dodaj svoj prvi slobodan termin</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.slotRow} testID={`admin-slot-${item.id}`}>
              <View style={styles.slotDateChip}>
                <Text style={styles.slotDateChipText}>{formatDate(item.date)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.slotRowTime}>{item.time}</Text>
                <Text style={[styles.slotStatus, { color: item.is_booked ? colors.warning : colors.success }]}>
                  {item.is_booked ? "Zauzet" : "Slobodan"}
                </Text>
              </View>
              {!item.is_booked && (
                <Pressable
                  testID={`admin-delete-slot-${item.id}`}
                  style={styles.deleteBtn}
                  onPress={() => handleDelete(item.id)}
                >
                  <Icon name="trash-can-outline" size={20} color={colors.error} />
                </Pressable>
              )}
            </View>
          )}
        />
      )}

      <Pressable
        testID="admin-add-slot-btn"
        style={styles.fab}
        onPress={() => setShowAdd(true)}
      >
        <Icon name="plus" size={26} color={colors.onBrandPrimary} />
      </Pressable>

      <AddSlotModal
        visible={showAdd}
        onClose={() => setShowAdd(false)}
        onCreated={async () => {
          setShowAdd(false);
          await load();
        }}
        password={password}
      />
    </View>
  );
}

function AddSlotModal({
  visible,
  onClose,
  onCreated,
  password,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: () => void;
  password: string;
}) {
  const insets = useSafeAreaInsets();
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      const today = new Date();
      today.setDate(today.getDate() + 1);
      const iso = today.toISOString().split("T")[0];
      setDate(iso);
      setTime("10:00");
      setError(null);
    }
  }, [visible]);

  const submit = async () => {
    setError(null);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError("Datum mora biti u formatu GGGG-MM-DD");
      return;
    }
    if (!/^\d{2}:\d{2}$/.test(time)) {
      setError("Vreme mora biti u formatu HH:MM");
      return;
    }
    setBusy(true);
    try {
      await adminCreateSlot(password, { date, time });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onCreated();
    } catch (e: any) {
      setError(e.message || "Greška");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.grabber} />
          <Text style={styles.modalTitle}>Novi termin</Text>
          <Text style={styles.label}>Datum (GGGG-MM-DD)</Text>
          <TextInput
            testID="add-slot-date"
            style={styles.modalInput}
            value={date}
            onChangeText={setDate}
            placeholder="2026-05-30"
            placeholderTextColor={colors.muted}
          />
          <Text style={styles.label}>Vreme (HH:MM)</Text>
          <TextInput
            testID="add-slot-time"
            style={styles.modalInput}
            value={time}
            onChangeText={setTime}
            placeholder="10:00"
            placeholderTextColor={colors.muted}
          />
          {error ? <Text style={styles.errorInline}>{error}</Text> : null}
          <Pressable
            testID="add-slot-submit"
            style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.85 }]}
            onPress={submit}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color={colors.onBrandPrimary} />
            ) : (
              <Text style={styles.primaryBtnText}>Dodaj termin</Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// ============= Bookings Admin =============
function BookingsAdmin({ password }: { password: string }) {
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<"all" | Booking["status"]>("pending");
  const { freshCount, markSeen } = usePendingBookings();

  const { data: bookings = [], isLoading: loading, refetch } = useQuery({
    queryKey: ["admin", "bookings", "poll", password],
    queryFn: () => adminListBookings(password),
    refetchInterval: 15_000,
    retry: false,
  });

  // Whenever admin opens Zahtevi with new pending bookings, mark as seen
  useEffect(() => {
    if (freshCount > 0) {
      const t = setTimeout(() => {
        markSeen();
      }, 3000);
      return () => clearTimeout(t);
    }
  }, [freshCount, markSeen]);

  const update = async (id: string, status: "confirmed" | "rejected" | "completed") => {
    try {
      await adminUpdateBooking(password, id, status);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await refetch();
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const filtered = useMemo(
    () => (filter === "all" ? bookings : bookings.filter((b) => b.status === filter)),
    [bookings, filter],
  );

  const FILTERS: { key: typeof filter; label: string }[] = [
    { key: "pending", label: "Na čekanju" },
    { key: "confirmed", label: "Potvrđeno" },
    { key: "completed", label: "Završeno" },
    { key: "rejected", label: "Odbijeno" },
    { key: "all", label: "Sve" },
  ];

  return (
    <View style={{ flex: 1 }}>
      {freshCount > 0 ? (
        <View style={styles.newAlert} testID="new-request-banner">
          <Icon name="bell-ring" size={20} color={colors.onBrandPrimary} />
          <Text style={styles.newAlertText}>
            {freshCount === 1 ? "Nova rezervacija upravo stigla!" : `${freshCount} novih rezervacija!`}
          </Text>
        </View>
      ) : null}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsRow}
        style={styles.chipsScroll}
      >
        {FILTERS.map((f) => (
          <Pressable
            key={f.key}
            testID={`filter-${f.key}`}
            style={[styles.chip, filter === f.key && styles.chipActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[styles.chipText, filter === f.key && styles.chipTextActive]}>{f.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brandPrimary} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(b) => b.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brandPrimary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Icon name="inbox-outline" size={48} color={colors.muted} />
              <Text style={styles.emptyText}>Nema rezervacija za prikaz</Text>
            </View>
          }
          renderItem={({ item }) => {
            const meta = STATUS_META[item.status];
            return (
              <View style={styles.bookingCard} testID={`admin-booking-${item.id}`}>
                <View style={styles.bookingTop}>
                  <View>
                    <Text style={styles.bookingDate}>
                      {formatDate(item.slot_date)} · {item.slot_time}
                    </Text>
                    <Text style={styles.bookingName}>{item.customer_name}</Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: meta.bg }]}>
                    <Text style={[styles.badgeText, { color: meta.fg }]}>{meta.label}</Text>
                  </View>
                </View>
                <View style={styles.divider} />
                <View style={styles.row}>
                  <Icon name="phone-outline" size={16} color={colors.muted} />
                  <Text style={styles.rowText}>{item.phone}</Text>
                </View>
                <View style={styles.row}>
                  <Icon name="car-outline" size={16} color={colors.muted} />
                  <Text style={styles.rowText}>
                    {item.car_brand} {item.car_model}
                  </Text>
                </View>
                {item.notes ? (
                  <View style={styles.row}>
                    <Icon name="note-text-outline" size={16} color={colors.muted} />
                    <Text style={styles.rowText}>{item.notes}</Text>
                  </View>
                ) : null}
                {item.home_visit ? (
                  <View style={styles.homeVisitBlock}>
                    <View style={styles.row}>
                      <Icon name="home-map-marker" size={16} color={colors.brandPrimary} />
                      <Text style={[styles.rowText, { color: colors.brandPrimary, fontWeight: "700" }]}>
                        Dolazak na adresu
                      </Text>
                    </View>
                    {item.address ? (
                      <Text style={styles.addressText}>{item.address}</Text>
                    ) : null}
                    {item.latitude != null && item.longitude != null ? (
                      <Pressable
                        testID={`admin-open-maps-${item.id}`}
                        style={styles.mapsLink}
                        onPress={() =>
                          Linking.openURL(
                            `https://www.google.com/maps/search/?api=1&query=${item.latitude},${item.longitude}`,
                          )
                        }
                      >
                        <Icon name="google-maps" size={14} color={colors.onBrandPrimary} />
                        <Text style={styles.mapsLinkText}>Otvori u Google Maps</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}

                {item.status === "pending" && (
                  <View style={styles.actionsRow}>
                    <Pressable
                      testID={`reject-${item.id}`}
                      style={[styles.actionBtn, styles.rejectBtn]}
                      onPress={() => update(item.id, "rejected")}
                    >
                      <Icon name="close" size={16} color={colors.onError} />
                      <Text style={styles.rejectText}>Odbij</Text>
                    </Pressable>
                    <Pressable
                      testID={`confirm-${item.id}`}
                      style={[styles.actionBtn, styles.confirmBtn]}
                      onPress={() => update(item.id, "confirmed")}
                    >
                      <Icon name="check" size={16} color={colors.onSuccess} />
                      <Text style={styles.confirmText}>Potvrdi</Text>
                    </Pressable>
                  </View>
                )}
                {item.status === "confirmed" && (
                  <View style={styles.actionsRow}>
                    <Pressable
                      testID={`complete-${item.id}`}
                      style={[styles.actionBtn, styles.completeBtn]}
                      onPress={() => update(item.id, "completed")}
                    >
                      <Icon name="check-all" size={16} color={colors.onBrandPrimary} />
                      <Text style={styles.completeText}>Štikliraj kao završeno</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

// ============= Stats Admin =============
const MONTH_LABELS = [
  "januar", "februar", "mart", "april", "maj", "jun",
  "jul", "avgust", "septembar", "oktobar", "novembar", "decembar",
];

function toMonthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonth(key: string) {
  const [y, m] = key.split("-").map((n) => parseInt(n, 10));
  return `${MONTH_LABELS[m - 1]} ${y}`;
}

function buildReportHtml(r: Report): string {
  const periodLabel: Record<"day" | "week" | "month", string> = {
    day: "Dnevni izveštaj",
    week: "Sedmični izveštaj",
    month: "Mesečni izveštaj",
  };
  const rows = r.bookings
    .map((b, i) => {
      const home = b.home_visit ? "Da" : "Ne";
      return `
        <tr>
          <td>${i + 1}</td>
          <td>${b.slot_date}<br/><span class="muted">${b.slot_time}</span></td>
          <td>${escapeHtml(b.customer_name)}<br/><span class="muted">${escapeHtml(b.phone)}</span></td>
          <td>${escapeHtml(b.car_brand)} ${escapeHtml(b.car_model)}</td>
          <td>${home}</td>
          <td class="right">${(b.unit_price || 0).toLocaleString("sr-RS")} ${b.currency || "RSD"}</td>
        </tr>`;
    })
    .join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
    <style>
      body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; color: #0d0d0d; padding: 32px; }
      h1 { color: #FF9800; margin: 0 0 6px 0; font-size: 26px; }
      .sub { color: #666; margin-bottom: 24px; font-size: 13px; }
      .kpis { display: flex; gap: 12px; margin-bottom: 24px; }
      .kpi { flex: 1; padding: 16px; border-radius: 10px; border: 1px solid #e5e5e5; }
      .kpi.brand { background: #FF9800; color: #121212; border-color: #FF9800; }
      .kpi .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 700; opacity: 0.7; }
      .kpi .val { font-size: 24px; font-weight: 800; margin-top: 4px; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      th, td { padding: 10px 8px; border-bottom: 1px solid #eee; text-align: left; vertical-align: top; }
      th { background: #f5f5f5; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #666; }
      td.right, th.right { text-align: right; }
      .muted { color: #888; font-size: 11px; }
      .footer { margin-top: 32px; color: #999; font-size: 11px; text-align: center; }
      .brand-row { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
      .logo-dot { width: 22px; height: 22px; border-radius: 6px; background: #FF9800; display: inline-block; }
      .brand-name { font-weight: 800; letter-spacing: 2px; font-size: 14px; }
    </style>
    </head><body>
      <div class="brand-row"><span class="logo-dot"></span><span class="brand-name">LUMEN</span></div>
      <h1>${periodLabel[r.period]}</h1>
      <div class="sub">Period: <b>${r.start}</b>${r.start !== r.end ? ` — <b>${r.end}</b>` : ""}</div>
      <div class="kpis">
        <div class="kpi"><div class="label">Završeno kola</div><div class="val">${r.count}</div></div>
        <div class="kpi brand"><div class="label">Ukupna zarada</div><div class="val">${r.revenue.toLocaleString("sr-RS")} RSD</div></div>
      </div>
      ${r.count > 0
        ? `<table>
             <thead><tr><th>#</th><th>Termin</th><th>Klijent</th><th>Vozilo</th><th>Kućna posetka</th><th class="right">Cena</th></tr></thead>
             <tbody>${rows}</tbody>
           </table>`
        : `<p class="muted">Nema završenih usluga u ovom periodu.</p>`
      }
      <div class="footer">Generisano: ${new Date().toLocaleString("sr-RS")} · Lumen — Čišćenje farova</div>
    </body></html>`;
}

function escapeHtml(s: string): string {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


function OnlineNowCard({ password }: { password: string }) {
  const [data, setData] = useState<{ online_total: number; customers: number; admins: number } | null>(null);
  const pulse = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    let stopped = false;
    const load = async () => {
      try {
        const r = await adminGetOnline(password);
        if (!stopped) setData(r);
      } catch {}
    };
    load();
    const t = setInterval(load, 15_000);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, [password]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: Platform.OS !== "web" }),
        Animated.timing(pulse, { toValue: 0.4, duration: 900, useNativeDriver: Platform.OS !== "web" }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View style={styles.onlineCard} testID="online-card">
      <View style={styles.onlineTop}>
        <View style={styles.onlineDotWrap}>
          <Animated.View style={[styles.onlineDot, { opacity: pulse }]} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.onlineTitle}>Trenutno online</Text>
          <Text style={styles.onlineSub}>Aktivnost u poslednjih 60 sekundi</Text>
        </View>
        <Text style={styles.onlineBig} testID="online-total">{data?.online_total ?? "–"}</Text>
      </View>
      <View style={styles.onlineBreak}>
        <View style={styles.onlineChip}>
          <Icon name="account-outline" size={14} color={colors.onSurface} />
          <Text style={styles.onlineChipText}>{data?.customers ?? 0} klijenata</Text>
        </View>
        <View style={styles.onlineChip}>
          <Icon name="shield-account-outline" size={14} color={colors.brandPrimary} />
          <Text style={[styles.onlineChipText, { color: colors.brandPrimary }]}>
            {data?.admins ?? 0} admin
          </Text>
        </View>
      </View>
    </View>
  );
}


function StatsAdmin({ password }: { password: string }) {
  const [month, setMonth] = useState<string>(() => toMonthKey(new Date()));
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [reportPeriod, setReportPeriod] = useState<"day" | "week" | "month">("day");
  const [reportData, setReportData] = useState<Report | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfMsg, setPdfMsg] = useState<string | null>(null);

  const load = async (m: string) => {
    try {
      const s = await adminGetStats(password, m);
      setStats(s);
    } catch {}
  };

  const loadReport = async (period: "day" | "week" | "month") => {
    setReportLoading(true);
    try {
      const r = await adminGetReport(password, period);
      setReportData(r);
    } catch {}
    setReportLoading(false);
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load(month);
      setLoading(false);
    })();
  }, [month]);

  useEffect(() => {
    loadReport(reportPeriod);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportPeriod]);

  const shiftMonth = (delta: number) => {
    const [y, m] = month.split("-").map((n) => parseInt(n, 10));
    const d = new Date(y, m - 1 + delta, 1);
    setMonth(toMonthKey(d));
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await load(month);
    await loadReport(reportPeriod);
    setRefreshing(false);
  };

  const exportPdf = async () => {
    if (!reportData) return;
    setPdfBusy(true);
    setPdfMsg(null);
    try {
      const html = buildReportHtml(reportData);
      const { uri } = await Print.printToFileAsync({ html });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          UTI: "com.adobe.pdf",
          dialogTitle: "Podeli izveštaj",
        });
      } else {
        setPdfMsg(`PDF sačuvan: ${uri}`);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      setPdfMsg(e.message || "Greška prilikom eksportovanja");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setPdfBusy(false);
    }
  };

  const currency = stats?.daily.find(() => true) ? "RSD" : "RSD";
  const maxHistoryRevenue = Math.max(1, ...(stats?.history || []).map((h) => h.revenue));

  const PERIOD_LABELS: Record<"day" | "week" | "month", string> = {
    day: "Danas",
    week: "Ova nedelja",
    month: "Ovaj mesec",
  };

  return (
    <ScrollView
      contentContainerStyle={styles.statsScroll}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brandPrimary} />}
    >
      {/* Online now card */}
      <OnlineNowCard password={password} />

      {/* Report card */}
      <View style={[styles.sectionCard, { marginTop: 0 }]}>
        <View style={styles.settingsHeader}>
          <Icon name="file-document-outline" size={22} color={colors.brandPrimary} />
          <Text style={styles.settingsTitle}>Izveštaj završenih usluga</Text>
        </View>

        <View style={styles.periodRow}>
          {(["day", "week", "month"] as const).map((p) => (
            <Pressable
              key={p}
              testID={`report-period-${p}`}
              style={[styles.periodBtn, reportPeriod === p && styles.periodBtnActive]}
              onPress={() => setReportPeriod(p)}
            >
              <Text style={[styles.periodBtnText, reportPeriod === p && styles.periodBtnTextActive]}>
                {PERIOD_LABELS[p]}
              </Text>
            </Pressable>
          ))}
        </View>

        {reportLoading ? (
          <View style={{ paddingVertical: 20, alignItems: "center" }}>
            <ActivityIndicator color={colors.brandPrimary} />
          </View>
        ) : reportData ? (
          <>
            <Text style={styles.reportRange}>
              {reportData.start === reportData.end
                ? reportData.start
                : `${reportData.start} — ${reportData.end}`}
            </Text>

            <View style={styles.reportKpis}>
              <View style={styles.reportKpi}>
                <Text style={styles.reportKpiLabel}>Završeno kola</Text>
                <Text style={styles.reportKpiValue} testID="report-count">{reportData.count}</Text>
              </View>
              <View style={[styles.reportKpi, styles.reportKpiHighlight]}>
                <Text style={styles.reportKpiLabelHi}>Zarada</Text>
                <Text style={styles.reportKpiValueHi} testID="report-revenue">
                  {reportData.revenue.toLocaleString("sr-RS")} RSD
                </Text>
              </View>
            </View>

            <Pressable
              testID="export-pdf-btn"
              style={[styles.saveBtn, { marginTop: 12 }]}
              onPress={exportPdf}
              disabled={pdfBusy || reportData.count === 0}
            >
              {pdfBusy ? (
                <ActivityIndicator color={colors.onBrandPrimary} />
              ) : (
                <>
                  <Icon name="file-pdf-box" size={20} color={colors.onBrandPrimary} />
                  <Text style={styles.saveBtnText}>Preuzmi PDF izveštaj</Text>
                </>
              )}
            </Pressable>
            {pdfMsg ? <Text style={styles.errorInline}>{pdfMsg}</Text> : null}
            {reportData.count === 0 ? (
              <Text style={[styles.settingsHint, { marginTop: 10, textAlign: "center" }]}>
                Nema završenih usluga za odabrani period.
              </Text>
            ) : null}
          </>
        ) : null}
      </View>
      <View style={styles.monthNav}>
        <Pressable testID="stats-prev-month" style={styles.monthNavBtn} onPress={() => shiftMonth(-1)}>
          <Icon name="chevron-left" size={22} color={colors.onSurface} />
        </Pressable>
        <View style={styles.monthNavLabel}>
          <Text style={styles.monthNavText}>{formatMonth(month)}</Text>
        </View>
        <Pressable testID="stats-next-month" style={styles.monthNavBtn} onPress={() => shiftMonth(1)}>
          <Icon name="chevron-right" size={22} color={colors.onSurface} />
        </Pressable>
      </View>

      {loading ? (
        <View style={{ paddingVertical: 40, alignItems: "center" }}>
          <ActivityIndicator color={colors.brandPrimary} />
        </View>
      ) : stats ? (
        <>
          <View style={styles.kpiRow}>
            <View style={[styles.kpiCard, styles.kpiHighlight]}>
              <Icon name="cash-multiple" size={20} color={colors.onBrandPrimary} />
              <Text style={styles.kpiLabelBig}>Ukupna zarada</Text>
              <Text style={styles.kpiValueBig} testID="stats-revenue">
                {stats.revenue.toLocaleString("sr-RS")} {currency}
              </Text>
            </View>
          </View>

          <View style={styles.kpiRow}>
            <View style={styles.kpiCard}>
              <Icon name="check-all" size={18} color={colors.brandPrimary} />
              <Text style={styles.kpiLabel}>Završeno</Text>
              <Text style={styles.kpiValue} testID="stats-completed">{stats.completed_count}</Text>
            </View>
            <View style={styles.kpiCard}>
              <Icon name="check-decagram" size={18} color={colors.success} />
              <Text style={styles.kpiLabel}>Potvrđeno</Text>
              <Text style={styles.kpiValue} testID="stats-confirmed">{stats.confirmed_count}</Text>
            </View>
            <View style={styles.kpiCard}>
              <Icon name="clock-outline" size={18} color={colors.brandSecondary} />
              <Text style={styles.kpiLabel}>Čeka</Text>
              <Text style={styles.kpiValue}>{stats.pending_count}</Text>
            </View>
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Poslednjih 6 meseci</Text>
            {stats.history.map((h) => (
              <View key={h.month} style={styles.histRow} testID={`hist-${h.month}`}>
                <Text style={styles.histMonth}>{formatMonth(h.month)}</Text>
                <View style={styles.histBarWrap}>
                  <View
                    style={[
                      styles.histBar,
                      {
                        width: `${Math.max(4, (h.revenue / maxHistoryRevenue) * 100)}%`,
                        backgroundColor: h.month === month ? colors.brandPrimary : colors.brandTertiary,
                      },
                    ]}
                  />
                </View>
                <View style={{ alignItems: "flex-end", minWidth: 88 }}>
                  <Text style={styles.histRevenue}>
                    {h.revenue.toLocaleString("sr-RS")}
                  </Text>
                  <Text style={styles.histCount}>{h.count} usluga</Text>
                </View>
              </View>
            ))}
          </View>

          {stats.daily.length > 0 ? (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Dnevni pregled — {formatMonth(month)}</Text>
              {stats.daily.map((d) => (
                <View key={d.date} style={styles.dailyRow}>
                  <View style={styles.dailyDate}>
                    <Text style={styles.dailyDateText}>{d.date.slice(-2)}</Text>
                  </View>
                  <Text style={styles.dailyCount}>{d.count} × usluga</Text>
                  <Text style={styles.dailyRevenue}>
                    {d.revenue.toLocaleString("sr-RS")} {currency}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.sectionCard}>
              <View style={{ alignItems: "center", padding: 20 }}>
                <Icon name="chart-line-variant" size={40} color={colors.muted} />
                <Text style={styles.emptyStats}>Nema završenih usluga za ovaj mesec</Text>
                <Text style={styles.emptyStatsSub}>
                  Zarada se broji samo za rezervacije koje si potvrdio u tom mesecu.
                </Text>
              </View>
            </View>
          )}
        </>
      ) : null}
    </ScrollView>
  );
}


// ============= Settings Admin =============
function SettingsAdmin({ password }: { password: string }) {
  const insets = useSafeAreaInsets();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [price, setPrice] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmType, setConfirmType] = useState<null | "bookings" | "slots">(null);
  const [wiping, setWiping] = useState(false);
  const [wipeResult, setWipeResult] = useState<string | null>(null);

  const [blocked, setBlocked] = useState<BlockedDay[]>([]);
  const [newBlockDate, setNewBlockDate] = useState("");
  const [blockErr, setBlockErr] = useState<string | null>(null);
  const [blockBusy, setBlockBusy] = useState(false);

  const load = async () => {
    try {
      const s = await getSettings();
      setSettings(s);
      setPrice(String(s.price));
      const b = await adminListBlocked(password);
      setBlocked(b);
    } catch {}
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addBlocked = async () => {
    setBlockErr(null);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newBlockDate)) {
      setBlockErr("Datum mora biti u formatu GGGG-MM-DD");
      return;
    }
    setBlockBusy(true);
    try {
      await adminAddBlocked(password, newBlockDate);
      setNewBlockDate("");
      const b = await adminListBlocked(password);
      setBlocked(b);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      setBlockErr(e.message || "Greška");
    } finally {
      setBlockBusy(false);
    }
  };

  const removeBlocked = async (date: string) => {
    try {
      await adminRemoveBlocked(password, date);
      const b = await adminListBlocked(password);
      setBlocked(b);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
  };

  const shareQr = async () => {
    Linking.openURL(APP_URL).catch(() => {});
  };

  const savePrice = async () => {
    setErr(null);
    setSaved(false);
    const n = parseInt(price.replace(/\D/g, ""), 10);
    if (!Number.isFinite(n) || n < 0) {
      setErr("Unesi ispravan iznos");
      return;
    }
    setSaving(true);
    try {
      const s = await adminUpdateSettings(password, { price: n });
      setSettings(s);
      setSaved(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      setErr(e.message || "Greška");
    } finally {
      setSaving(false);
    }
  };

  const performWipe = async () => {
    if (!confirmType) return;
    setWiping(true);
    setWipeResult(null);
    try {
      if (confirmType === "bookings") {
        const r = await adminDeleteAllBookings(password);
        setWipeResult(`Obrisano rezervacija: ${r.deleted}`);
      } else {
        const r = await adminDeleteAllSlots(password);
        setWipeResult(`Obrisano termina: ${r.slots_deleted} · rezervacija: ${r.bookings_deleted}`);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      setWipeResult(e.message || "Greška");
    } finally {
      setWiping(false);
      setConfirmType(null);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.settingsScroll}>
      <View style={styles.settingsCard}>
        <View style={styles.settingsHeader}>
          <Icon name="tag-outline" size={22} color={colors.brandPrimary} />
          <Text style={styles.settingsTitle}>Cena poliranja</Text>
        </View>
        <Text style={styles.settingsHint}>
          Ova cena se prikazuje klijentu na naslovnoj strani i pri zakazivanju.
        </Text>
        <Text style={styles.label}>Iznos ({settings?.currency || "RSD"})</Text>
        <TextInput
          testID="price-input"
          style={styles.priceInput}
          value={price}
          onChangeText={setPrice}
          keyboardType="numeric"
          placeholder="2500"
          placeholderTextColor={colors.muted}
        />
        {err ? <Text style={styles.errorInline}>{err}</Text> : null}
        {saved ? <Text style={styles.successInline}>Sačuvano ✓</Text> : null}
        <Pressable
          testID="save-price-btn"
          style={({ pressed }) => [styles.saveBtn, pressed && { opacity: 0.85 }]}
          onPress={savePrice}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color={colors.onBrandPrimary} />
          ) : (
            <>
              <Icon name="content-save-outline" size={18} color={colors.onBrandPrimary} />
              <Text style={styles.saveBtnText}>Sačuvaj cenu</Text>
            </>
          )}
        </Pressable>
      </View>

      {/* Blocked days */}
      <View style={styles.settingsCard}>
        <View style={styles.settingsHeader}>
          <Icon name="calendar-remove-outline" size={22} color={colors.brandPrimary} />
          <Text style={styles.settingsTitle}>Blokada datuma</Text>
        </View>
        <Text style={styles.settingsHint}>
          Klijentima će svi termini na blokiranim datumima biti sakriveni, a tvoji termini ostaju sačuvani.
        </Text>

        <Text style={styles.label}>Novi neradni datum (GGGG-MM-DD)</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TextInput
            testID="new-blocked-input"
            style={[styles.priceInput, { flex: 1, fontSize: 16, fontWeight: "600" }]}
            value={newBlockDate}
            onChangeText={setNewBlockDate}
            placeholder="2026-05-01"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
          />
          <Pressable
            testID="add-blocked-btn"
            style={[styles.saveBtn, { marginTop: 0, paddingHorizontal: 18 }]}
            onPress={addBlocked}
            disabled={blockBusy}
          >
            {blockBusy ? (
              <ActivityIndicator color={colors.onBrandPrimary} />
            ) : (
              <Icon name="plus" size={20} color={colors.onBrandPrimary} />
            )}
          </Pressable>
        </View>
        {blockErr ? <Text style={styles.errorInline}>{blockErr}</Text> : null}

        <View style={{ marginTop: 12, gap: 6 }}>
          {blocked.length === 0 ? (
            <Text style={styles.settingsHint}>Trenutno nema blokiranih datuma.</Text>
          ) : (
            blocked.map((b) => (
              <View key={b.date} style={styles.blockedRow} testID={`blocked-${b.date}`}>
                <Icon name="calendar-remove" size={18} color={colors.error} />
                <Text style={styles.blockedDate}>{b.date}</Text>
                <Pressable
                  testID={`unblock-${b.date}`}
                  style={styles.unblockBtn}
                  onPress={() => removeBlocked(b.date)}
                >
                  <Icon name="close" size={16} color={colors.onSurface} />
                </Pressable>
              </View>
            ))
          )}
        </View>
      </View>

      {/* QR code */}
      <View style={styles.settingsCard}>
        <View style={styles.settingsHeader}>
          <Icon name="qrcode" size={22} color={colors.brandPrimary} />
          <Text style={styles.settingsTitle}>QR kod cenovnika</Text>
        </View>
        <Text style={styles.settingsHint}>
          Odštampaj i zalepi u radionici. Klijent skenira i otvara aplikaciju.
        </Text>

        <View style={styles.qrWrap}>
          <Image
            testID="qr-image"
            source={qrForUrl(APP_URL)}
            style={styles.qrImage}
            contentFit="cover"
          />
        </View>
        <Text style={styles.qrUrl} numberOfLines={1}>
          {APP_URL}
        </Text>
        <Pressable
          testID="open-qr-btn"
          style={[styles.saveBtn, { backgroundColor: colors.brandSecondary }]}
          onPress={shareQr}
        >
          <Icon name="download-outline" size={18} color={colors.onBrandSecondary} />
          <Text style={[styles.saveBtnText, { color: colors.onBrandSecondary }]}>Otvori QR u browser-u</Text>
        </Pressable>
      </View>



      <View style={[styles.settingsCard, styles.dangerCard]}>
        <View style={styles.settingsHeader}>
          <Icon name="alert-circle-outline" size={22} color={colors.error} />
          <Text style={[styles.settingsTitle, { color: colors.error }]}>Opasna zona</Text>
        </View>
        <Text style={styles.settingsHint}>
          Ove akcije trajno brišu podatke. Preporuka: koristi samo kada želiš da počneš iz početka.
        </Text>

        {wipeResult ? (
          <View style={styles.wipeResult}>
            <Icon name="information-outline" size={16} color={colors.onSurfaceSecondary} />
            <Text style={styles.wipeResultText}>{wipeResult}</Text>
          </View>
        ) : null}

        <Pressable
          testID="wipe-bookings-btn"
          style={styles.dangerBtn}
          onPress={() => setConfirmType("bookings")}
        >
          <Icon name="delete-sweep-outline" size={18} color={colors.onError} />
          <Text style={styles.dangerBtnText}>Obriši sve rezervacije</Text>
        </Pressable>

        <Pressable
          testID="wipe-all-btn"
          style={[styles.dangerBtn, { backgroundColor: "#7A1B1B" }]}
          onPress={() => setConfirmType("slots")}
        >
          <Icon name="delete-forever-outline" size={18} color={colors.onError} />
          <Text style={styles.dangerBtnText}>Obriši sve (termini + rezervacije)</Text>
        </Pressable>
      </View>

      <Modal visible={!!confirmType} transparent animationType="fade" onRequestClose={() => setConfirmType(null)}>
        <View style={styles.confirmOverlay}>
          <View style={[styles.confirmCard, { marginBottom: insets.bottom }]}>
            <View style={styles.confirmIcon}>
              <Icon name="alert-outline" size={32} color={colors.error} />
            </View>
            <Text style={styles.confirmTitle}>Sigurno želiš da nastaviš?</Text>
            <Text style={styles.confirmSub}>
              {confirmType === "bookings"
                ? "Sve rezervacije će biti trajno obrisane. Termini će biti oslobođeni."
                : "Svi termini i sve rezervacije biće trajno obrisane."}
            </Text>
            <View style={styles.confirmRow}>
              <Pressable
                testID="confirm-cancel"
                style={[styles.confirmModalBtn, styles.confirmCancel]}
                onPress={() => setConfirmType(null)}
                disabled={wiping}
              >
                <Text style={styles.confirmCancelText}>Otkaži</Text>
              </Pressable>
              <Pressable
                testID="confirm-wipe"
                style={[styles.confirmModalBtn, styles.confirmDelete]}
                onPress={performWipe}
                disabled={wiping}
              >
                {wiping ? (
                  <ActivityIndicator color={colors.onError} />
                ) : (
                  <Text style={styles.confirmDeleteText}>Obriši</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}



const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  loginHero: { height: 260 },
  loginContent: { flex: 1, paddingHorizontal: 24, alignItems: "flex-start", justifyContent: "flex-end", paddingBottom: 24 },
  lockIcon: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  loginTitle: { color: colors.onSurface, fontSize: 26, fontWeight: "800" },
  loginSub: { color: colors.onSurfaceTertiary, fontSize: 14, marginTop: 4 },
  loginForm: { padding: 24, gap: 8 },
  label: { color: colors.muted, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 8 },
  loginInput: {
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    color: colors.onSurface,
    padding: 14,
    fontSize: 15,
  },
  errorInline: { color: colors.error, fontSize: 13, marginTop: 6 },
  loginBtn: {
    flexDirection: "row",
    gap: 8,
    marginTop: 16,
    backgroundColor: colors.brandPrimary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  loginBtnText: { color: colors.onBrandPrimary, fontSize: 16, fontWeight: "700" },
  adminHeader: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  adminHeaderTitle: { color: colors.onSurface, fontSize: 22, fontWeight: "800" },
  adminHeaderSub: { color: colors.muted, fontSize: 12, marginTop: 2 },
  logoutBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabsScroll: { flexGrow: 0, marginTop: 12 },
  tabsRow: {
    flexDirection: "row",
    marginHorizontal: 16,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 10,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 2,
  },
  tab: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, alignItems: "center" },
  tabActive: { backgroundColor: colors.brandPrimary },
  tabText: { color: colors.onSurfaceTertiary, fontSize: 13, fontWeight: "700" },
  tabTextActive: { color: colors.onBrandPrimary },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  listContent: { padding: 16, paddingBottom: 100 },
  empty: { alignItems: "center", padding: 40, gap: 8 },
  emptyText: { color: colors.onSurface, fontSize: 16, fontWeight: "700", marginTop: 12 },
  emptySub: { color: colors.muted, fontSize: 13 },
  slotRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  slotDateChip: { backgroundColor: colors.brandTertiary, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, minWidth: 62, alignItems: "center" },
  slotDateChipText: { color: colors.onBrandTertiary, fontWeight: "800", fontSize: 12 },
  slotRowTime: { color: colors.onSurface, fontSize: 18, fontWeight: "800" },
  slotStatus: { fontSize: 12, fontWeight: "600", marginTop: 2 },
  deleteBtn: { width: 40, height: 40, borderRadius: 10, backgroundColor: "#3D0F0F", alignItems: "center", justifyContent: "center" },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalSheet: {
    backgroundColor: colors.surfaceSecondary,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    gap: 6,
  },
  grabber: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: "center", marginBottom: 8 },
  modalTitle: { color: colors.onSurface, fontSize: 20, fontWeight: "800", marginBottom: 8 },
  modalInput: {
    backgroundColor: colors.surfaceTertiary,
    borderRadius: 10,
    padding: 14,
    color: colors.onSurface,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 15,
  },
  primaryBtn: {
    marginTop: 20,
    backgroundColor: colors.brandPrimary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
  primaryBtnText: { color: colors.onBrandPrimary, fontSize: 16, fontWeight: "700" },
  chipsScroll: { flexGrow: 0, marginTop: 12 },
  chipsRow: { paddingHorizontal: 16, gap: 8, paddingBottom: 8 },
  newAlert: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: colors.brandPrimary,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  newAlertText: { color: colors.onBrandPrimary, fontSize: 14, fontWeight: "800", flex: 1 },
  chip: {
    flexShrink: 0,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  chipActive: { backgroundColor: colors.brandTertiary, borderColor: colors.brandPrimary },
  chipText: { color: colors.onSurfaceTertiary, fontSize: 13, fontWeight: "700" },
  chipTextActive: { color: colors.onBrandTertiary },
  bookingCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 12,
  },
  bookingTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  bookingDate: { color: colors.brandPrimary, fontSize: 13, fontWeight: "700" },
  bookingName: { color: colors.onSurface, fontSize: 16, fontWeight: "700", marginTop: 2 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontSize: 11, fontWeight: "700" },
  divider: { height: 1, backgroundColor: colors.divider, marginVertical: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  rowText: { color: colors.onSurfaceSecondary, fontSize: 14, flex: 1 },
  actionsRow: { flexDirection: "row", gap: 10, marginTop: 14 },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  rejectBtn: { backgroundColor: colors.error },
  confirmBtn: { backgroundColor: colors.success },
  rejectText: { color: colors.onError, fontWeight: "700" },
  confirmText: { color: colors.onSuccess, fontWeight: "700" },
  completeBtn: { backgroundColor: colors.brandPrimary },
  completeText: { color: colors.onBrandPrimary, fontWeight: "800" },
  homeVisitBlock: {
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    backgroundColor: colors.brandTertiary,
    gap: 6,
  },
  addressText: { color: colors.onBrandTertiary, fontSize: 13, marginLeft: 24 },
  mapsLink: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.brandPrimary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    marginLeft: 24,
    marginTop: 2,
  },
  mapsLinkText: { color: colors.onBrandPrimary, fontSize: 12, fontWeight: "800" },
  // Settings tab
  settingsScroll: { padding: 16, paddingBottom: 40, gap: 16 },
  settingsCard: {
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  dangerCard: { borderColor: "#5A1F1F" },
  settingsHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  settingsTitle: { color: colors.onSurface, fontSize: 16, fontWeight: "800" },
  settingsHint: { color: colors.muted, fontSize: 12, lineHeight: 18, marginBottom: 4 },
  priceInput: {
    backgroundColor: colors.surfaceTertiary,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    color: colors.onSurface,
    padding: 14,
    fontSize: 20,
    fontWeight: "800",
  },
  successInline: { color: colors.success, fontSize: 13, marginTop: 4, fontWeight: "700" },
  saveBtn: {
    marginTop: 12,
    flexDirection: "row",
    gap: 8,
    backgroundColor: colors.brandPrimary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtnText: { color: colors.onBrandPrimary, fontSize: 15, fontWeight: "800" },
  dangerBtn: {
    marginTop: 10,
    flexDirection: "row",
    gap: 8,
    backgroundColor: colors.error,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  dangerBtnText: { color: colors.onError, fontSize: 14, fontWeight: "800" },
  wipeResult: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.surfaceTertiary,
    borderRadius: 8,
    padding: 10,
    marginTop: 4,
  },
  wipeResultText: { color: colors.onSurfaceSecondary, fontSize: 13, flex: 1 },
  confirmOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  confirmCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 400,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  confirmIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#3D0F0F",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  confirmTitle: { color: colors.onSurface, fontSize: 18, fontWeight: "800", textAlign: "center" },
  confirmSub: { color: colors.muted, fontSize: 13, textAlign: "center", lineHeight: 18 },
  confirmRow: { flexDirection: "row", gap: 10, marginTop: 12, alignSelf: "stretch" },
  confirmModalBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmCancel: { backgroundColor: colors.surfaceTertiary, borderWidth: 1, borderColor: colors.border },
  confirmCancelText: { color: colors.onSurface, fontWeight: "700" },
  confirmDelete: { backgroundColor: colors.error },
  confirmDeleteText: { color: colors.onError, fontWeight: "800" },

  // Blocked days
  blockedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surfaceTertiary,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  blockedDate: { color: colors.onSurface, fontSize: 14, fontWeight: "700", flex: 1 },
  unblockBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },

  // QR
  qrWrap: {
    alignSelf: "center",
    marginTop: 6,
    padding: 8,
    borderRadius: 16,
    backgroundColor: colors.brand,
  },
  qrImage: { width: 220, height: 220, borderRadius: 8 },
  qrUrl: { color: colors.muted, fontSize: 12, textAlign: "center", marginTop: 8 },

  // Stats
  statsScroll: { padding: 16, paddingBottom: 40, gap: 12 },
  onlineCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  onlineTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  onlineDotWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#0F3D18",
    alignItems: "center",
    justifyContent: "center",
  },
  onlineDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.success,
  },
  onlineTitle: { color: colors.onSurface, fontSize: 15, fontWeight: "800" },
  onlineSub: { color: colors.muted, fontSize: 11, marginTop: 2 },
  onlineBig: { color: colors.brandPrimary, fontSize: 32, fontWeight: "800" },
  onlineBreak: { flexDirection: "row", gap: 8, marginTop: 12 },
  onlineChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.surfaceTertiary,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  onlineChipText: { color: colors.onSurface, fontSize: 12, fontWeight: "700" },
  monthNav: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 12,
    padding: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  monthNavBtn: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  monthNavLabel: { flex: 1, alignItems: "center" },
  monthNavText: { color: colors.onSurface, fontSize: 16, fontWeight: "800", textTransform: "capitalize" },
  kpiRow: { flexDirection: "row", gap: 10, marginTop: 4 },
  kpiCard: {
    flex: 1,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 4,
  },
  kpiHighlight: {
    backgroundColor: colors.brandPrimary,
    borderColor: colors.brandPrimary,
  },
  kpiLabel: { color: colors.muted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  kpiLabelBig: { color: colors.onBrandPrimary, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  kpiValue: { color: colors.onSurface, fontSize: 20, fontWeight: "800" },
  kpiValueBig: { color: colors.onBrandPrimary, fontSize: 26, fontWeight: "800" },
  sectionCard: {
    marginTop: 6,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  sectionTitle: { color: colors.onSurface, fontSize: 15, fontWeight: "800", marginBottom: 12 },
  histRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  histMonth: { color: colors.onSurfaceSecondary, fontSize: 12, fontWeight: "700", width: 90, textTransform: "capitalize" },
  histBarWrap: {
    flex: 1,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.surfaceTertiary,
    overflow: "hidden",
  },
  histBar: { height: "100%", borderRadius: 5 },
  histRevenue: { color: colors.onSurface, fontSize: 13, fontWeight: "800" },
  histCount: { color: colors.muted, fontSize: 11, marginTop: 2 },
  dailyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  dailyDate: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  dailyDateText: { color: colors.onBrandTertiary, fontWeight: "800" },
  dailyCount: { flex: 1, color: colors.onSurfaceSecondary, fontSize: 14 },
  dailyRevenue: { color: colors.brandPrimary, fontWeight: "800", fontSize: 14 },
  emptyStats: { color: colors.onSurface, fontSize: 15, fontWeight: "700", marginTop: 8 },
  emptyStatsSub: { color: colors.muted, fontSize: 12, textAlign: "center", marginTop: 4, lineHeight: 18 },
  // Report
  periodRow: {
    flexDirection: "row",
    marginTop: 10,
    backgroundColor: colors.surfaceTertiary,
    borderRadius: 10,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  periodBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: "center" },
  periodBtnActive: { backgroundColor: colors.brandPrimary },
  periodBtnText: { color: colors.onSurfaceTertiary, fontSize: 13, fontWeight: "700" },
  periodBtnTextActive: { color: colors.onBrandPrimary },
  reportRange: { color: colors.muted, fontSize: 12, marginTop: 10, textAlign: "center", fontWeight: "600" },
  reportKpis: { flexDirection: "row", gap: 10, marginTop: 10 },
  reportKpi: {
    flex: 1,
    backgroundColor: colors.surfaceTertiary,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  reportKpiHighlight: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  reportKpiLabel: { color: colors.muted, fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
  reportKpiLabelHi: { color: colors.onBrandPrimary, fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
  reportKpiValue: { color: colors.onSurface, fontSize: 22, fontWeight: "800", marginTop: 4 },
  reportKpiValueHi: { color: colors.onBrandPrimary, fontSize: 22, fontWeight: "800", marginTop: 4 },
});
