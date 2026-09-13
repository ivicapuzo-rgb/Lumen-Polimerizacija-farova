import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "@react-native-vector-icons/material-design-icons";

import { Booking, bookingsByPhone, loadPhone, savePhone } from "@/src/api";
import { colors } from "@/src/theme";

const STATUS_META: Record<Booking["status"], { label: string; bg: string; fg: string; icon: string }> = {
  pending: { label: "Na čekanju", bg: colors.brandTertiary, fg: colors.onBrandTertiary, icon: "clock-outline" },
  confirmed: { label: "Potvrđeno", bg: "#0F3D18", fg: colors.success, icon: "check-decagram" },
  rejected: { label: "Odbijeno", bg: "#3D0F0F", fg: colors.error, icon: "close-circle-outline" },
};

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("sr-RS", { day: "2-digit", month: "long", year: "numeric" });
}

export default function MyBookingsScreen() {
  const insets = useSafeAreaInsets();
  const [phone, setPhone] = useState("");
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPhone().then((p) => {
      if (p) {
        setPhone(p);
        fetchBookings(p);
      }
    });
  }, []);

  const fetchBookings = async (p: string) => {
    if (!p.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const data = await bookingsByPhone(p.trim());
      setBookings(data);
      await savePhone(p.trim());
    } catch (e: any) {
      setError(e.message || "Greška");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.title}>Moje rezervacije</Text>
        <Text style={styles.subtitle}>Unesi broj telefona za pretragu</Text>
        <View style={styles.searchRow}>
          <View style={styles.inputWrap}>
            <Icon name="phone-outline" size={18} color={colors.muted} />
            <TextInput
              testID="phone-lookup-input"
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="Npr. 060 123 4567"
              placeholderTextColor={colors.muted}
              keyboardType="phone-pad"
              returnKeyType="search"
              onSubmitEditing={() => fetchBookings(phone)}
            />
          </View>
          <Pressable
            testID="phone-lookup-btn"
            style={({ pressed }) => [styles.searchBtn, pressed && { opacity: 0.85 }]}
            onPress={() => fetchBookings(phone)}
          >
            <Icon name="magnify" size={22} color={colors.onBrandPrimary} />
          </Pressable>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brandPrimary} size="large" />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : bookings === null ? (
        <View style={styles.center}>
          <Icon name="magnify" size={56} color={colors.muted} />
          <Text style={styles.hintText}>Unesi broj telefona koji si koristio pri zakazivanju</Text>
        </View>
      ) : bookings.length === 0 ? (
        <View style={styles.center}>
          <Icon name="calendar-blank-outline" size={56} color={colors.muted} />
          <Text style={styles.hintText}>Nema pronađenih rezervacija za ovaj broj</Text>
        </View>
      ) : (
        <FlatList
          data={bookings}
          keyExtractor={(b) => b.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={() => fetchBookings(phone)} tintColor={colors.brandPrimary} />
          }
          renderItem={({ item }) => {
            const meta = STATUS_META[item.status];
            return (
              <View style={styles.card} testID={`booking-${item.id}`}>
                <View style={styles.cardTop}>
                  <View>
                    <Text style={styles.cardDate}>{formatDate(item.slot_date)}</Text>
                    <View style={styles.timeRow}>
                      <Icon name="clock-outline" size={14} color={colors.brandPrimary} />
                      <Text style={styles.cardTime}>{item.slot_time}</Text>
                    </View>
                  </View>
                  <View style={[styles.badge, { backgroundColor: meta.bg }]}>
                    <Icon name={meta.icon as any} size={14} color={meta.fg} />
                    <Text style={[styles.badgeText, { color: meta.fg }]}>{meta.label}</Text>
                  </View>
                </View>
                <View style={styles.divider} />
                <View style={styles.row}>
                  <Icon name="car-outline" size={16} color={colors.muted} />
                  <Text style={styles.rowText}>
                    {item.car_brand} {item.car_model}
                  </Text>
                </View>
                <View style={styles.row}>
                  <Icon name="account-outline" size={16} color={colors.muted} />
                  <Text style={styles.rowText}>{item.customer_name}</Text>
                </View>
                {item.notes ? (
                  <View style={styles.row}>
                    <Icon name="note-text-outline" size={16} color={colors.muted} />
                    <Text style={styles.rowText}>{item.notes}</Text>
                  </View>
                ) : null}
              </View>
            );
          }}
        />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  title: { color: colors.onSurface, fontSize: 26, fontWeight: "800" },
  subtitle: { color: colors.muted, fontSize: 13, marginTop: 4 },
  searchRow: { flexDirection: "row", gap: 8, marginTop: 16 },
  inputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  input: { flex: 1, color: colors.onSurface, paddingVertical: 12, fontSize: 15 },
  searchBtn: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 },
  errorText: { color: colors.error, fontSize: 14 },
  hintText: { color: colors.muted, fontSize: 14, textAlign: "center", marginTop: 8 },
  listContent: { padding: 16, paddingBottom: 32 },
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 12,
  },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  cardDate: { color: colors.onSurface, fontSize: 15, fontWeight: "700" },
  timeRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  cardTime: { color: colors.brandPrimary, fontSize: 20, fontWeight: "800" },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  badgeText: { fontSize: 11, fontWeight: "700" },
  divider: { height: 1, backgroundColor: colors.divider, marginVertical: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  rowText: { color: colors.onSurfaceSecondary, fontSize: 14, flex: 1 },
});
