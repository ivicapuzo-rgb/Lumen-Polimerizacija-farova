import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
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
  adminCreateSlot,
  adminDeleteAllBookings,
  adminDeleteAllSlots,
  adminDeleteSlot,
  adminListBookings,
  adminListSlots,
  adminLogin,
  adminUpdateBooking,
  adminUpdateSettings,
  Booking,
  clearAdminPw,
  getSettings,
  loadAdminPw,
  saveAdminPw,
  Settings,
  Slot,
} from "@/src/api";
import { colors } from "@/src/theme";

const HERO =
  "https://images.unsplash.com/photo-1567808291548-fc3ee04dbcf0?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzMjd8MHwxfHNlYXJjaHwyfHxzcG9ydHMlMjBjYXIlMjBkYXJrJTIwYmFja2dyb3VuZHxlbnwwfHx8fDE3ODkyODQyMDN8MA&ixlib=rb-4.1.0&q=85";

const STATUS_META: Record<Booking["status"], { label: string; bg: string; fg: string }> = {
  pending: { label: "Na čekanju", bg: colors.brandTertiary, fg: colors.onBrandTertiary },
  confirmed: { label: "Potvrđeno", bg: "#0F3D18", fg: colors.success },
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
  const [tab, setTab] = useState<"slots" | "bookings" | "settings">("bookings");

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

      <View style={styles.tabsRow}>
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
          testID="admin-tab-settings"
          style={[styles.tab, tab === "settings" && styles.tabActive]}
          onPress={() => setTab("settings")}
        >
          <Text style={[styles.tabText, tab === "settings" && styles.tabTextActive]}>Podešavanja</Text>
        </Pressable>
      </View>

      {tab === "slots" ? (
        <SlotsAdmin password={password} />
      ) : tab === "bookings" ? (
        <BookingsAdmin password={password} />
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
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<"all" | Booking["status"]>("pending");

  const load = async () => {
    try {
      const data = await adminListBookings(password);
      setBookings(data);
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

  const filtered = useMemo(
    () => (filter === "all" ? bookings : bookings.filter((b) => b.status === filter)),
    [bookings, filter],
  );

  const update = async (id: string, status: "confirmed" | "rejected") => {
    try {
      await adminUpdateBooking(password, id, status);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await load();
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const FILTERS: { key: typeof filter; label: string }[] = [
    { key: "pending", label: "Na čekanju" },
    { key: "confirmed", label: "Potvrđeno" },
    { key: "rejected", label: "Odbijeno" },
    { key: "all", label: "Sve" },
  ];

  return (
    <View style={{ flex: 1 }}>
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
              </View>
            );
          }}
        />
      )}
    </View>
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

  const load = async () => {
    try {
      const s = await getSettings();
      setSettings(s);
      setPrice(String(s.price));
    } catch {}
  };

  useEffect(() => {
    load();
  }, []);

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
  tabsRow: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 10,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: "center" },
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
});
