import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import Icon from "@react-native-vector-icons/material-design-icons";
import * as Haptics from "expo-haptics";

import { createBooking, savePhone } from "@/src/api";
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

  const models = useMemo(() => CAR_BRANDS.find((b) => b.brand === brand)?.models || [], [brand]);

  const submit = async () => {
    setError(null);
    if (!name.trim()) return setError("Unesi ime i prezime");
    if (!phone.trim() || phone.trim().length < 6) return setError("Unesi ispravan broj telefona");
    if (!brand) return setError("Izaberi marku auta");
    if (!model) return setError("Izaberi model auta");

    setBusy(true);
    try {
      await createBooking({
        slot_id: slotId!,
        customer_name: name.trim(),
        phone: phone.trim(),
        car_brand: brand,
        car_model: model,
        notes: notes.trim(),
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
            Termin {time} · {formatDate(date!)} čeka potvrdu.{"\n"}Status možeš pratiti u sekciji "Moje".
          </Text>
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
          <View>
            <Text style={styles.slotBannerLabel}>Izabran termin</Text>
            <Text style={styles.slotBannerValue}>
              {formatDate(date!)} · {time}
            </Text>
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
  secondaryBtn: { paddingVertical: 12 },
  secondaryBtnText: { color: colors.muted, fontSize: 14, fontWeight: "600" },
});
