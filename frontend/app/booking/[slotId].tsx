import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Icon from "@react-native-vector-icons/material-design-icons";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";

import { createBooking, getSettings, savePhone } from "@/src/api";
import { CAR_BRANDS } from "@/src/carBrands";
import { colors } from "@/src/theme";

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("sr-RS", { day: "2-digit", month: "long", year: "numeric" });
}

export default function BookingForm() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { slotId, date, time } = useLocalSearchParams<{ slotId: string; date: string; time: string }>();

  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: getSettings });

  const shareApp = async () => {
    const priceLine = settings
      ? `Cena je ${settings.price.toLocaleString("sr-RS")} ${settings.currency} po vozilu.`
      : "";
    try {
      await Share.share({
        message: `Preporučujem Lumen — profesionalno čišćenje farova. ${priceLine} Zakazivanje termina direktno u aplikaciji.`,
      });
    } catch {}
  };

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [brand, setBrand] = useState<string>("");
  const [model, setModel] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [brandPickerOpen, setBrandPickerOpen] = useState(false);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [homeVisit, setHomeVisit] = useState(false);
  const [address, setAddress] = useState("");
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locBusy, setLocBusy] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);

  const models = useMemo(() => CAR_BRANDS.find((b) => b.brand === brand)?.models || [], [brand]);

  const captureLocation = async () => {
    setLocError(null);
    setLocBusy(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        if (!perm.canAskAgain) {
          setLocError("Dozvola za lokaciju je odbijena. Otvori podešavanja da je uključiš.");
        } else {
          setLocError("Dozvola za lokaciju je potrebna za automatsko hvatanje.");
        }
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      // Try reverse geocoding for a friendly address suggestion
      try {
        const rev = await Location.reverseGeocodeAsync({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
        if (rev[0]) {
          const r = rev[0];
          const parts = [r.street, r.streetNumber, r.city].filter(Boolean).join(" ");
          if (parts && !address) setAddress(parts);
        }
      } catch {}
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      setLocError("Nije moguće preuzeti lokaciju. Pokušaj ponovo.");
    } finally {
      setLocBusy(false);
    }
  };

  const openInMaps = () => {
    if (!coords) return;
    const url = `https://www.google.com/maps/search/?api=1&query=${coords.latitude},${coords.longitude}`;
    Linking.openURL(url).catch(() => {});
  };

  const submit = async () => {
    setError(null);
    if (!name.trim()) return setError("Unesi ime i prezime");
    if (!phone.trim() || phone.trim().length < 6) return setError("Unesi ispravan broj telefona");
    if (!brand) return setError("Izaberi marku auta");
    if (!model) return setError("Izaberi model auta");
    if (homeVisit && !address.trim() && !coords) {
      return setError("Unesi adresu ili preuzmi tačnu lokaciju");
    }

    setBusy(true);
    try {
      await createBooking({
        slot_id: slotId!,
        customer_name: name.trim(),
        phone: phone.trim(),
        car_brand: brand,
        car_model: model,
        notes: notes.trim(),
        home_visit: homeVisit,
        address: homeVisit ? address.trim() : "",
        latitude: homeVisit ? coords?.latitude ?? null : null,
        longitude: homeVisit ? coords?.longitude ?? null : null,
      });
      await savePhone(phone.trim());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.invalidateQueries({ queryKey: ["slots"] });
      setSuccess(true);
    } catch (e: any) {
      setError(e.message || "Greška prilikom zakazivanja");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setBusy(false);
    }
  };

  if (success) {
    return (
      <View style={styles.container}>
        <View style={[styles.successWrap, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 20 }]}>
          <View style={styles.successIcon}>
            <Icon name="check-decagram" size={64} color={colors.success} />
          </View>
          <Text style={styles.successTitle}>Rezervacija poslata!</Text>
          <Text style={styles.successSub}>
            Termin {time} · {formatDate(date!)} čeka potvrdu.{"\n"}Status možeš pratiti u sekciji &quot;Moje&quot;.
          </Text>
          <Pressable
            testID="share-app-btn"
            style={styles.shareBtn}
            onPress={shareApp}
          >
            <Icon name="share-variant" size={18} color={colors.onBrandPrimary} />
            <Text style={styles.shareBtnText}>Preporuči prijatelju</Text>
          </Pressable>
          <Pressable
            testID="booking-done-btn"
            style={styles.primaryBtn}
            onPress={() => router.replace("/(tabs)/bookings")}
          >
            <Text style={styles.primaryBtnText}>Pogledaj moje rezervacije</Text>
          </Pressable>
          <Pressable testID="booking-back-btn" style={styles.secondaryBtn} onPress={() => router.replace("/(tabs)")}>
            <Text style={styles.secondaryBtnText}>Nazad na termine</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable testID="close-form-btn" style={styles.backBtn} onPress={() => router.back()}>
          <Icon name="arrow-left" size={22} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Zakazivanje</Text>
          <Text style={styles.headerSub}>Popuni podatke ispod</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 120 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.slotBanner}>
          <View style={styles.slotBannerIcon}>
            <Icon name="clock-time-four-outline" size={22} color={colors.brandPrimary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.slotBannerLabel}>Izabran termin</Text>
            <Text style={styles.slotBannerValue}>
              {formatDate(date!)} · {time}
            </Text>
            {settings ? (
              <Text style={styles.slotBannerPrice}>
                Cena: {settings.price.toLocaleString("sr-RS")} {settings.currency}
              </Text>
            ) : null}
          </View>
        </View>

        <Field label="Ime i prezime">
          <TextInput
            testID="name-input"
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Marko Marković"
            placeholderTextColor={colors.muted}
          />
        </Field>

        <Field label="Broj telefona">
          <TextInput
            testID="phone-input"
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="060 123 4567"
            placeholderTextColor={colors.muted}
            keyboardType="phone-pad"
          />
        </Field>

        <Field label="Marka vozila">
          <Pressable testID="brand-picker" style={styles.select} onPress={() => setBrandPickerOpen(true)}>
            <Text style={[styles.selectText, !brand && { color: colors.muted }]}>
              {brand || "Izaberi marku"}
            </Text>
            <Icon name="chevron-down" size={20} color={colors.muted} />
          </Pressable>
        </Field>

        <Field label="Model">
          <Pressable
            testID="model-picker"
            style={[styles.select, !brand && { opacity: 0.5 }]}
            onPress={() => brand && setModelPickerOpen(true)}
            disabled={!brand}
          >
            <Text style={[styles.selectText, !model && { color: colors.muted }]}>
              {model || (brand ? "Izaberi model" : "Prvo izaberi marku")}
            </Text>
            <Icon name="chevron-down" size={20} color={colors.muted} />
          </Pressable>
        </Field>

        <Field label="Napomena (opciono)">
          <TextInput
            testID="notes-input"
            style={[styles.input, { height: 88, textAlignVertical: "top" }]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Npr. mutni farovi, žućkasti sloj..."
            placeholderTextColor={colors.muted}
            multiline
          />
        </Field>

        <View style={styles.homeVisitCard}>
          <View style={styles.homeVisitRow}>
            <View style={styles.homeVisitIcon}>
              <Icon name="home-map-marker" size={22} color={colors.brandPrimary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.homeVisitTitle}>Dolazak na kućnu adresu</Text>
              <Text style={styles.homeVisitSub}>Dolazim kod tebe umesto tvog dolaska</Text>
            </View>
            <Switch
              testID="home-visit-switch"
              value={homeVisit}
              onValueChange={setHomeVisit}
              trackColor={{ false: colors.surfaceTertiary, true: colors.brandPrimary }}
              thumbColor={colors.onBrandPrimary}
            />
          </View>

          {homeVisit && (
            <View style={{ marginTop: 12, gap: 10 }}>
              <TextInput
                testID="address-input"
                style={styles.input}
                value={address}
                onChangeText={setAddress}
                placeholder="Ulica i broj, grad"
                placeholderTextColor={colors.muted}
              />
              <Pressable
                testID="capture-location-btn"
                style={({ pressed }) => [styles.locBtn, pressed && { opacity: 0.85 }]}
                onPress={captureLocation}
                disabled={locBusy}
              >
                {locBusy ? (
                  <ActivityIndicator color={colors.brandPrimary} />
                ) : (
                  <>
                    <Icon name="crosshairs-gps" size={18} color={colors.brandPrimary} />
                    <Text style={styles.locBtnText}>
                      {coords ? "Osveži tačnu lokaciju" : "Uzmi tačnu lokaciju"}
                    </Text>
                  </>
                )}
              </Pressable>

              {coords && (
                <Pressable testID="open-maps-btn" style={styles.mapPreview} onPress={openInMaps}>
                  <Icon name="map-marker-check" size={22} color={colors.success} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.mapPreviewTitle}>Lokacija zabeležena</Text>
                    <Text style={styles.mapPreviewCoords}>
                      {coords.latitude.toFixed(5)}, {coords.longitude.toFixed(5)}
                    </Text>
                  </View>
                  <View style={styles.mapPreviewCta}>
                    <Icon name="google-maps" size={16} color={colors.onBrandPrimary} />
                    <Text style={styles.mapPreviewCtaText}>Maps</Text>
                  </View>
                </Pressable>
              )}

              {locError ? <Text style={styles.errorText}>{locError}</Text> : null}
            </View>
          )}
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </ScrollView>

      <View style={[styles.stickyCTA, { paddingBottom: insets.bottom + 12 }]}>
        <Pressable
          testID="submit-booking-btn"
          style={({ pressed }) => [styles.submitBtn, (pressed || busy) && { opacity: 0.85 }]}
          onPress={submit}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color={colors.onBrandPrimary} />
          ) : (
            <>
              <Icon name="check-bold" size={20} color={colors.onBrandPrimary} />
              <Text style={styles.submitText}>Potvrdi rezervaciju</Text>
            </>
          )}
        </Pressable>
      </View>

      <PickerModal
        visible={brandPickerOpen}
        onClose={() => setBrandPickerOpen(false)}
        title="Marka vozila"
        items={CAR_BRANDS.map((b) => b.brand)}
        onSelect={(v) => {
          setBrand(v);
          setModel("");
          setBrandPickerOpen(false);
        }}
        testIDPrefix="brand"
      />
      <PickerModal
        visible={modelPickerOpen}
        onClose={() => setModelPickerOpen(false)}
        title="Model"
        items={models}
        onSelect={(v) => {
          setModel(v);
          setModelPickerOpen(false);
        }}
        testIDPrefix="model"
      />
    </KeyboardAvoidingView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

function PickerModal({
  visible,
  onClose,
  title,
  items,
  onSelect,
  testIDPrefix,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  items: string[];
  onSelect: (v: string) => void;
  testIDPrefix: string;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.pickerOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.pickerSheet, { paddingBottom: insets.bottom + 8 }]}>
          <View style={styles.grabber} />
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>{title}</Text>
            <Pressable testID={`${testIDPrefix}-close`} onPress={onClose}>
              <Icon name="close" size={22} color={colors.onSurface} />
            </Pressable>
          </View>
          <FlatList
            data={items}
            keyExtractor={(i) => i}
            renderItem={({ item }) => (
              <Pressable
                testID={`${testIDPrefix}-option-${item}`}
                style={({ pressed }) => [styles.pickerItem, pressed && { backgroundColor: colors.surfaceTertiary }]}
                onPress={() => onSelect(item)}
              >
                <Text style={styles.pickerItemText}>{item}</Text>
                <Icon name="chevron-right" size={20} color={colors.muted} />
              </Pressable>
            )}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { color: colors.onSurface, fontSize: 22, fontWeight: "800" },
  headerSub: { color: colors.muted, fontSize: 12, marginTop: 2 },
  scroll: { padding: 20 },
  slotBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.brandTertiary,
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
  },
  slotBannerIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  slotBannerLabel: { color: colors.onBrandTertiary, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  slotBannerValue: { color: colors.onBrandTertiary, fontSize: 16, fontWeight: "800", marginTop: 2 },
  slotBannerPrice: { color: colors.onBrandTertiary, fontSize: 13, fontWeight: "700", marginTop: 6 },
  label: { color: colors.muted, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 },
  input: {
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    color: colors.onSurface,
    padding: 14,
    fontSize: 15,
  },
  select: {
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  selectText: { color: colors.onSurface, fontSize: 15 },
  errorText: { color: colors.error, fontSize: 14, marginTop: 4 },
  homeVisitCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 16,
  },
  homeVisitRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  homeVisitIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  homeVisitTitle: { color: colors.onSurface, fontSize: 15, fontWeight: "800" },
  homeVisitSub: { color: colors.muted, fontSize: 12, marginTop: 2 },
  locBtn: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandTertiary,
    borderRadius: 10,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.brandPrimary,
  },
  locBtnText: { color: colors.onBrandTertiary, fontWeight: "700", fontSize: 14 },
  mapPreview: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surfaceTertiary,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  mapPreviewTitle: { color: colors.onSurface, fontSize: 13, fontWeight: "700" },
  mapPreviewCoords: { color: colors.muted, fontSize: 12, marginTop: 2 },
  mapPreviewCta: {
    flexDirection: "row",
    gap: 4,
    alignItems: "center",
    backgroundColor: colors.brandPrimary,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  mapPreviewCtaText: { color: colors.onBrandPrimary, fontSize: 12, fontWeight: "800" },
  stickyCTA: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  submitBtn: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: colors.brandPrimary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  submitText: { color: colors.onBrandPrimary, fontSize: 16, fontWeight: "800" },
  pickerOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  pickerSheet: {
    backgroundColor: colors.surfaceSecondary,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "75%",
  },
  grabber: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: "center", marginTop: 10 },
  pickerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pickerTitle: { color: colors.onSurface, fontSize: 18, fontWeight: "800" },
  pickerItem: {
    padding: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  pickerItemText: { color: colors.onSurface, fontSize: 15 },
  successWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 },
  successIcon: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#0F3D18",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  successTitle: { color: colors.onSurface, fontSize: 24, fontWeight: "800", textAlign: "center" },
  successSub: { color: colors.onSurfaceTertiary, fontSize: 14, textAlign: "center", lineHeight: 20, marginBottom: 24 },
  primaryBtn: {
    backgroundColor: colors.brandPrimary,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: "center",
    alignSelf: "stretch",
  },
  primaryBtnText: { color: colors.onBrandPrimary, fontSize: 15, fontWeight: "800" },
  shareBtn: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: colors.brandSecondary,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "stretch",
    marginBottom: 10,
  },
  shareBtnText: { color: colors.onBrandSecondary, fontSize: 15, fontWeight: "800" },
  secondaryBtn: { paddingVertical: 12 },
  secondaryBtnText: { color: colors.muted, fontSize: 14, fontWeight: "600" },
});
