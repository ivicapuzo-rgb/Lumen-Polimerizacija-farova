import { useMemo } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "@react-native-vector-icons/material-design-icons";
import * as Haptics from "expo-haptics";

import { listSlots, getSettings, Slot } from "@/src/api";
import { colors } from "@/src/theme";

const HERO =
  "https://images.unsplash.com/photo-1730742298439-6d82f9edc3c2?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1ODh8MHwxfHNlYXJjaHwyfHxjYXIlMjBoZWFkbGlnaHQlMjBkYXJrfGVufDB8fHx8MTc4OTI4NDIwM3ww&ixlib=rb-4.1.0&q=85";

const DAY_NAMES = ["Ned", "Pon", "Uto", "Sre", "Čet", "Pet", "Sub"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Maj", "Jun", "Jul", "Avg", "Sep", "Okt", "Nov", "Dec"];

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return { day: DAY_NAMES[d.getDay()], num: d.getDate(), month: MONTHS[d.getMonth()] };
}

export default function SlotsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ["slots"],
    queryFn: listSlots,
  });

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  });

  const grouped = useMemo(() => {
    const map = new Map<string, Slot[]>();
    (data || []).forEach((s) => {
      if (!map.has(s.date)) map.set(s.date, []);
      map.get(s.date)!.push(s);
    });
    return Array.from(map.entries()).map(([date, slots]) => ({ date, slots }));
  }, [data]);

  const handleSelect = (slot: Slot) => {
    Haptics.selectionAsync();
    router.push({ pathname: "/booking/[slotId]", params: { slotId: slot.id, date: slot.date, time: slot.time } });
  };

  const handleShare = async () => {
    const priceLine = settings
      ? `Cena je ${settings.price.toLocaleString("sr-RS")} ${settings.currency} po vozilu.`
      : "";
    try {
      await Share.share({
        message: `Preporučujem Lumen — profesionalno čišćenje farova. ${priceLine} Zakazivanje termina direktno u aplikaciji.`,
      });
    } catch {}
  };

  return (
    <View style={styles.container}>
      {/* Hero */}
      <View style={styles.hero}>
        <Image source={HERO} style={StyleSheet.absoluteFill} contentFit="cover" />
        <LinearGradient
          colors={["rgba(13,13,13,0.2)", "rgba(13,13,13,0.7)", "rgba(13,13,13,1)"]}
          style={StyleSheet.absoluteFill}
        />
        <View style={[styles.heroContent, { paddingTop: insets.top + 16 }]}>
          <View style={styles.brandRow}>
            <View style={styles.brandDot}>
              <Icon name="car-light-high" size={20} color={colors.onBrandPrimary} />
            </View>
            <Text style={styles.brandName}>LUMEN</Text>
          </View>
          <Text style={styles.heroTitle}>Čišćenje farova</Text>
          <Text style={styles.heroSubtitle}>Izaberi slobodan termin i zakaži za par sekundi</Text>
          {settings ? (
            <View style={styles.heroBottomRow}>
              <View style={styles.pricePill} testID="price-pill">
                <Icon name="tag-outline" size={14} color={colors.onBrandPrimary} />
                <Text style={styles.pricePillText}>
                  {settings.price.toLocaleString("sr-RS")} {settings.currency} po vozilu
                </Text>
              </View>
              <Pressable testID="home-share-btn" style={styles.sharePillBtn} onPress={handleShare}>
                <Icon name="share-variant" size={14} color={colors.onSurface} />
                <Text style={styles.sharePillText}>Preporuči</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brandPrimary} size="large" />
        </View>
      ) : isError ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>Greška prilikom učitavanja</Text>
          <Pressable testID="slots-retry-btn" style={styles.retryBtn} onPress={() => refetch()}>
            <Text style={styles.retryText}>Pokušaj ponovo</Text>
          </Pressable>
        </View>
      ) : grouped.length === 0 ? (
        <ScrollView
          contentContainerStyle={styles.emptyContainer}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brandPrimary} />
          }
        >
          <View style={styles.emptyIconWrap}>
            <Icon name="calendar-clock" size={48} color={colors.brandPrimary} />
          </View>
          <Text style={styles.emptyTitle}>Trenutno nema slobodnih termina</Text>
          <Text style={styles.emptySub}>Proveri malo kasnije — novi termini se često dodaju.</Text>
        </ScrollView>
      ) : (
        <FlatList
          data={grouped}
          keyExtractor={(g) => g.date}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brandPrimary} />
          }
          renderItem={({ item }) => {
            const f = formatDate(item.date);
            return (
              <View style={styles.dayGroup} testID={`day-group-${item.date}`}>
                <View style={styles.dayHeader}>
                  <View style={styles.dayChip}>
                    <Text style={styles.dayNum}>{f.num}</Text>
                    <Text style={styles.dayMonth}>{f.month}</Text>
                  </View>
                  <Text style={styles.dayName}>{f.day}</Text>
                  <View style={styles.countPill}>
                    <Text style={styles.countText}>{item.slots.length} slobodnih</Text>
                  </View>
                </View>
                <View style={styles.slotsGrid}>
                  {item.slots.map((s) => (
                    <Pressable
                      key={s.id}
                      testID={`slot-${s.id}`}
                      style={({ pressed }) => [styles.slotCard, pressed && styles.slotCardPressed]}
                      onPress={() => handleSelect(s)}
                    >
                      <Icon name="clock-time-four-outline" size={18} color={colors.brandPrimary} />
                      <Text style={styles.slotTime}>{s.time}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  hero: { height: 260, width: "100%", overflow: "hidden" },
  heroContent: { flex: 1, paddingHorizontal: 20, justifyContent: "flex-end", paddingBottom: 20 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  brandDot: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  brandName: { color: colors.onSurface, fontSize: 16, fontWeight: "800", letterSpacing: 2 },
  heroTitle: { color: colors.onSurface, fontSize: 30, fontWeight: "800", letterSpacing: -0.5 },
  heroSubtitle: { color: colors.onSurfaceTertiary, fontSize: 14, marginTop: 6 },
  pricePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.brandPrimary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  pricePillText: { color: colors.onBrandPrimary, fontSize: 13, fontWeight: "800" },
  heroBottomRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
  sharePillBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderColor: colors.borderStrong,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  sharePillText: { color: colors.onSurface, fontSize: 12, fontWeight: "700" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  errorText: { color: colors.error, fontSize: 14, marginBottom: 12 },
  retryBtn: {
    backgroundColor: colors.brandPrimary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: { color: colors.onBrandPrimary, fontWeight: "700" },
  listContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 },
  dayGroup: { marginBottom: 20 },
  dayHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 10 },
  dayChip: {
    backgroundColor: colors.brandTertiary,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: "center",
    minWidth: 52,
  },
  dayNum: { color: colors.onBrandTertiary, fontSize: 18, fontWeight: "800", lineHeight: 20 },
  dayMonth: { color: colors.onBrandTertiary, fontSize: 10, fontWeight: "600", textTransform: "uppercase" },
  dayName: { color: colors.onSurface, fontSize: 16, fontWeight: "700" },
  countPill: {
    marginLeft: "auto",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  countText: { color: colors.muted, fontSize: 11, fontWeight: "600" },
  slotsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  slotCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.border,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    minWidth: 100,
  },
  slotCardPressed: { backgroundColor: colors.brandTertiary, borderColor: colors.brandPrimary },
  slotTime: { color: colors.onSurface, fontSize: 15, fontWeight: "700" },
  emptyContainer: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 40 },
  emptyIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: { color: colors.onSurface, fontSize: 18, fontWeight: "700", textAlign: "center" },
  emptySub: { color: colors.muted, fontSize: 14, marginTop: 6, textAlign: "center" },
});
