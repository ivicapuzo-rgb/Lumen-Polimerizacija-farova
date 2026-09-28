import { useEffect, useState, useCallback } from "react";
import {
  ActivityIndicator,
  AppState,
  AppStateStatus,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Updates from "expo-updates";
import Icon from "@react-native-vector-icons/material-design-icons";

import { colors } from "@/src/theme";

/**
 * UpdatePrompt
 * - Silently checks for a new OTA/EAS update on app launch and whenever the
 *   app returns to the foreground.
 * - When a new bundle is downloaded, shows a friendly Serbian modal that
 *   invites the user to reload the app to apply the update.
 * - Works ONLY in a real dev/production build (expo-updates is a no-op inside
 *   Expo Go), which is exactly the environment where "Publish" is used.
 */
export function UpdatePrompt() {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  const checkOnce = useCallback(async () => {
    // Skip while running inside Expo Go / dev client without EAS Updates.
    if (!Updates.isEnabled || __DEV__) return;
    try {
      const res = await Updates.checkForUpdateAsync();
      if (res.isAvailable) {
        const fetched = await Updates.fetchUpdateAsync();
        if (fetched.isNew) {
          setVisible(true);
        }
      }
    } catch {
      // Silent — never break the app for a background check.
    }
  }, []);

  useEffect(() => {
    checkOnce();
    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "active") checkOnce();
    });
    return () => sub.remove();
  }, [checkOnce]);

  const applyNow = async () => {
    setBusy(true);
    try {
      await Updates.reloadAsync();
    } catch {
      setBusy(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => setVisible(false)}
    >
      <View style={styles.backdrop}>
        <View style={styles.card} testID="update-prompt-card">
          <View style={styles.iconWrap}>
            <Icon name="cloud-download-outline" size={34} color={colors.onBrandPrimary} />
          </View>
          <Text style={styles.title}>Nova verzija je spremna</Text>
          <Text style={styles.body}>
            Dodali smo nove funkcije i popravke. Ažuriraj aplikaciju sada da bi ih koristio.
          </Text>

          <Pressable
            testID="update-apply-btn"
            style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.9 }]}
            onPress={applyNow}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color={colors.onBrandPrimary} />
            ) : (
              <>
                <Icon name="refresh" size={18} color={colors.onBrandPrimary} />
                <Text style={styles.primaryBtnText}>Ažuriraj sada</Text>
              </>
            )}
          </Pressable>

          <Pressable
            testID="update-later-btn"
            style={styles.secondaryBtn}
            onPress={() => setVisible(false)}
            disabled={busy}
          >
            <Text style={styles.secondaryBtnText}>Kasnije</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: colors.surface,
    borderRadius: 20,
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
    marginBottom: 8,
  },
  body: {
    color: colors.onSurfaceSecondary,
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 20,
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
  primaryBtnText: {
    color: colors.onBrandPrimary,
    fontSize: 15,
    fontWeight: "800",
  },
  secondaryBtn: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginTop: 8,
  },
  secondaryBtnText: {
    color: colors.onSurfaceSecondary,
    fontSize: 14,
    fontWeight: "700",
  },
});
