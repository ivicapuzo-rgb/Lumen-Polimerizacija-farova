import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "@react-native-vector-icons/material-design-icons";
import * as Haptics from "expo-haptics";

import { adminUpdateAppVersion, AppVersion, getAppVersion, loadAdminPw } from "@/src/api";
import { colors } from "@/src/theme";

export default function AppVersionScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [password, setPassword] = useState<string | null>(null);
  const [current, setCurrent] = useState<AppVersion | null>(null);

  const [version, setVersion] = useState("1.0.0");
  const [versionCode, setVersionCode] = useState("1");
  const [apkUrl, setApkUrl] = useState("");
  const [electronUrl, setElectronUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [mandatory, setMandatory] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const pw = await loadAdminPw();
      setPassword(pw);
      try {
        const v = await getAppVersion();
        setCurrent(v);
        setVersion(v.version);
        setVersionCode(String(v.version_code));
        setApkUrl(v.apk_url);
        setElectronUrl(v.electron_update_url || "");
        setNotes(v.notes);
        setMandatory(v.mandatory);
      } catch {}
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    if (!password) {
      setErr("Nema admin lozinke — vrati se i uloguj se.");
      return;
    }
    setErr(null);
    setSaved(false);

    const trimmedVersion = version.trim();
    if (!trimmedVersion) {
      setErr("Unesi verziju (npr. 1.1.0)");
      return;
    }
    const code = parseInt(versionCode.replace(/\D/g, ""), 10);
    if (!Number.isFinite(code) || code < 1) {
      setErr("Kod verzije mora biti pozitivan broj");
      return;
    }
    const trimmedUrl = apkUrl.trim();
    if (trimmedUrl && !/^https?:\/\//i.test(trimmedUrl)) {
      setErr("APK link mora počinjati sa http:// ili https://");
      return;
    }
    const trimmedElectron = electronUrl.trim();
    if (trimmedElectron && !/^https?:\/\//i.test(trimmedElectron)) {
      setErr("Electron update link mora počinjati sa http:// ili https://");
      return;
    }

    setSaving(true);
    try {
      const v = await adminUpdateAppVersion(password, {
        version: trimmedVersion,
        version_code: code,
        apk_url: trimmedUrl,
        electron_update_url: trimmedElectron,
        notes: notes.trim(),
        mandatory,
      });
      setCurrent(v);
      setSaved(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => setSaved(false), 2500);
    } catch (e: any) {
      setErr(e.message || "Greška prilikom čuvanja");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator color={colors.brandPrimary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backBtn}
          testID="app-version-back-btn"
          hitSlop={12}
        >
          <Icon name="chevron-left" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Verzija aplikacije</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}
          keyboardShouldPersistTaps="handled"
        >
          {/* Info banner */}
          <View style={styles.infoCard}>
            <Icon name="information-outline" size={18} color={colors.brandPrimary} />
            <Text style={styles.infoText}>
              Postavi novu verziju + APK link. Instalirane aplikacije će sledećim pokretanjem videti obaveštenje da postoji novija verzija.
            </Text>
          </View>

          {/* Version */}
          <Text style={styles.label}>VERZIJA (npr. 1.1.0)</Text>
          <TextInput
            testID="app-version-version-input"
            style={styles.input}
            value={version}
            onChangeText={(t) => {
              setVersion(t);
              setSaved(false);
            }}
            placeholder="1.0.0"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
          />

          {/* Version code */}
          <Text style={styles.label}>KOD VERZIJE (versionCode)</Text>
          <TextInput
            testID="app-version-code-input"
            style={styles.input}
            value={versionCode}
            onChangeText={(t) => {
              setVersionCode(t.replace(/\D/g, ""));
              setSaved(false);
            }}
            placeholder="1"
            placeholderTextColor={colors.muted}
            keyboardType="number-pad"
          />
          <Text style={styles.hint}>
            Aplikacije čiji je lokalni versionCode manji od ovog broja dobijaju prompt za ažuriranje.
          </Text>

          {/* APK URL */}
          <Text style={styles.label}>APK LINK (GitHub Releases)</Text>
          <TextInput
            testID="app-version-apk-input"
            style={[styles.input, styles.inputMulti]}
            value={apkUrl}
            onChangeText={(t) => {
              setApkUrl(t);
              setSaved(false);
            }}
            placeholder="https://github.com/user/repo/releases/latest/download/app.apk"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            multiline
            numberOfLines={3}
          />
          <Text style={styles.hint}>
            Preporuka: koristi „latest/download“ putanju — kad kreneš novi release na GitHub-u, link ostaje isti.
          </Text>

          {/* Electron update URL */}
          <Text style={styles.label}>ELECTRON UPDATE LINK (desktop app)</Text>
          <TextInput
            testID="app-version-electron-input"
            style={[styles.input, styles.inputMulti]}
            value={electronUrl}
            onChangeText={(t) => {
              setElectronUrl(t);
              setSaved(false);
            }}
            placeholder="https://github.com/user/repo/releases/latest"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            multiline
            numberOfLines={3}
          />
          <Text style={styles.hint}>
            Link na koji desktop (Electron) aplikacija ide da proveri i preuzme novu verziju. Obično GitHub Releases stranica ili latest.yml fajl.
          </Text>

          {/* Notes */}
          <Text style={styles.label}>NAPOMENE (šta je novo)</Text>
          <TextInput
            testID="app-version-notes-input"
            style={[styles.input, styles.inputMulti]}
            value={notes}
            onChangeText={(t) => {
              setNotes(t);
              setSaved(false);
            }}
            placeholder="Ispravke i nove funkcije…"
            placeholderTextColor={colors.muted}
            multiline
            numberOfLines={4}
          />

          {/* Mandatory */}
          <View style={styles.toggleCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleTitle}>Obavezno ažuriranje</Text>
              <Text style={styles.toggleSub}>
                Sakriva dugme „Kasnije“ — korisnik mora da ažurira.
              </Text>
            </View>
            <Switch
              testID="app-version-mandatory-toggle"
              value={mandatory}
              onValueChange={(v) => {
                setMandatory(v);
                setSaved(false);
                Haptics.selectionAsync();
              }}
              trackColor={{ false: colors.surfaceTertiary, true: colors.brandPrimary }}
              thumbColor={mandatory ? colors.onBrandPrimary : colors.surface}
            />
          </View>

          {err ? <Text style={styles.err}>{err}</Text> : null}
          {saved ? <Text style={styles.success}>Sačuvano ✓</Text> : null}

          <Pressable
            testID="app-version-save-btn"
            style={({ pressed }) => [styles.saveBtn, pressed && { opacity: 0.9 }]}
            onPress={save}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color={colors.onBrandPrimary} />
            ) : (
              <>
                <Icon name="content-save-outline" size={18} color={colors.onBrandPrimary} />
                <Text style={styles.saveBtnText}>Sačuvaj verziju</Text>
              </>
            )}
          </Pressable>

          {current ? (
            <Text style={styles.metaText}>
              Poslednja izmena: {new Date(current.updated_at).toLocaleString("sr-RS")}
            </Text>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceSecondary,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: colors.onSurface,
    flex: 1,
    textAlign: "center",
  },
  scroll: { padding: 20, gap: 4 },
  infoCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.brandTertiary,
    marginBottom: 20,
  },
  infoText: {
    flex: 1,
    color: colors.onBrandTertiary,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
  },
  label: {
    color: colors.onSurfaceSecondary,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginTop: 14,
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.onSurface,
    fontSize: 15,
    fontWeight: "700",
  },
  inputMulti: {
    minHeight: 80,
    textAlignVertical: "top",
    fontWeight: "600",
    fontSize: 14,
  },
  hint: {
    color: colors.onSurfaceSecondary,
    fontSize: 12,
    fontWeight: "600",
    marginTop: 6,
  },
  toggleCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 20,
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toggleTitle: {
    color: colors.onSurface,
    fontSize: 15,
    fontWeight: "900",
  },
  toggleSub: {
    color: colors.onSurfaceSecondary,
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2,
  },
  err: {
    color: colors.error,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 14,
    textAlign: "center",
  },
  success: {
    color: colors.success,
    fontSize: 13,
    fontWeight: "800",
    marginTop: 14,
    textAlign: "center",
  },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.brandPrimary,
    paddingVertical: 16,
    borderRadius: 14,
    marginTop: 22,
  },
  saveBtnText: {
    color: colors.onBrandPrimary,
    fontSize: 15,
    fontWeight: "900",
  },
  metaText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 18,
  },
});
