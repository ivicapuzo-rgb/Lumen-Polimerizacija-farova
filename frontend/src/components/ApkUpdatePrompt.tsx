import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  AppStateStatus,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Application from "expo-application";
import Icon from "@react-native-vector-icons/material-design-icons";

import { AppVersion, getAppVersion } from "@/src/api";
import { colors } from "@/src/theme";

/**
 * Local build info for the currently installed app.
 * - Android: nativeBuildVersion returns the versionCode as a string.
 * - iOS: nativeBuildVersion returns the CFBundleVersion (build number).
 */
function getLocalVersionCode(): number {
  const raw = (Application.nativeBuildVersion || "").trim();
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : 0;
}

function getLocalVersion(): string {
  return (Application.nativeApplicationVersion || "").trim();
}

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // re-check every 6h while app is open
let lastCheckAt = 0;

export function ApkUpdatePrompt() {
  const [remote, setRemote] = useState<AppVersion | null>(null);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [snoozed, setSnoozed] = useState(false); // user pressed "Later" this session

  const check = useCallback(async () => {
    // Skip on web preview — APK flow is Android-only.
    if (Platform.OS === "web") return;

    const now = Date.now();
    if (now - lastCheckAt < 10_000) return; // debounce back-to-back triggers
    lastCheckAt = now;

    try {
      const v = await getAppVersion();
      setRemote(v);
      const localCode = getLocalVersionCode();
      const hasNewer = v.version_code > 0 && localCode > 0 && v.version_code > localCode;
      const hasApk = !!(v.apk_url && v.apk_url.trim());
      if (hasNewer && hasApk) {
        // Mandatory update ignores snooze.
        if (v.mandatory || !snoozed) {
          setVisible(true);
        }
      } else {
        setVisible(false);
      }
    } catch {
      // silent — do not break the app
    }
  }, [snoozed]);

  // Initial check + on foreground
  useEffect(() => {
    check();
    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "active") check();
    });
    const iv = setInterval(check, CHECK_INTERVAL_MS);
    return () => {
      sub.remove();
      clearInterval(iv);
    };
  }, [check]);

  const openApk = async () => {
    if (!remote?.apk_url) return;
    setBusy(true);
    try {
      const supported = await Linking.canOpenURL(remote.apk_url);
      if (supported) await Linking.openURL(remote.apk_url);
    } catch {
      // ignore
    } finally {
      setBusy(false);
      // Keep modal open — Android will show a download in the notification tray
      // and the user needs to tap the file to install.
    }
  };

  const later = () => {
    if (remote?.mandatory) return;
    setSnoozed(true);
    setVisible(false);
  };

  if (!remote) return null;

  const localVersion = getLocalVersion() || "?";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={remote.mandatory ? undefined : later}
    >
      <View style={styles.backdrop}>
        <View style={styles.card} testID="apk-update-card">
          <View style={styles.iconWrap}>
            <Icon name="cellphone-arrow-down" size={34} color={colors.onBrandPrimary} />
          </View>
          <Text style={styles.title}>
            {remote.mandatory ? "Obavezno ažuriranje" : "Dostupna je nova verzija"}
          </Text>
          <Text style={styles.subtitle}>
            {`Trenutno: ${localVersion} → Novo: ${remote.version}`}
          </Text>

          {remote.notes ? (
            <ScrollView style={styles.notesBox} contentContainerStyle={{ padding: 12 }}>
              <Text style={styles.notesText}>{remote.notes}</Text>
            </ScrollView>
          ) : null}

          <Pressable
            testID="apk-update-download-btn"
            style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.9 }]}
            onPress={openApk}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color={colors.onBrandPrimary} />
            ) : (
              <>
                <Icon name="download" size={18} color={colors.onBrandPrimary} />
                <Text style={styles.primaryBtnText}>Preuzmi i ažuriraj</Text>
              </>
            )}
          </Pressable>

          {!remote.mandatory ? (
            <Pressable
              testID="apk-update-later-btn"
              style={styles.secondaryBtn}
              onPress={later}
              disabled={busy}
            >
              <Text style={styles.secondaryBtnText}>Kasnije</Text>
            </Pressable>
          ) : (
            <Text style={styles.mandatoryHint}>
              Ova verzija donosi važne izmene i mora se ažurirati.
            </Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: colors.surface,
    borderRadius: 22,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  title: {
    color: colors.onSurface,
    fontSize: 20,
    fontWeight: "900",
    textAlign: "center",
    marginBottom: 4,
  },
  subtitle: {
    color: colors.onSurfaceSecondary,
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 14,
  },
  notesBox: {
    width: "100%",
    maxHeight: 160,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 12,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: colors.border,
  },
  notesText: {
    color: colors.onSurface,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 19,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.brandPrimary,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 14,
    width: "100%",
  },
  primaryBtnText: { color: colors.onBrandPrimary, fontSize: 15, fontWeight: "900" },
  secondaryBtn: { paddingVertical: 12, paddingHorizontal: 20, marginTop: 6 },
  secondaryBtnText: { color: colors.onSurfaceSecondary, fontSize: 14, fontWeight: "700" },
  mandatoryHint: {
    color: colors.onSurfaceSecondary,
    fontSize: 12,
    fontWeight: "600",
    marginTop: 12,
    textAlign: "center",
  },
});
