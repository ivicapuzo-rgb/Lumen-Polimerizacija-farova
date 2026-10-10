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
 */
function getLocalVersion(): string {
  return (Application.nativeApplicationVersion || "").trim();
}

function getLocalVersionCode(): number {
  const raw = (Application.nativeBuildVersion || "").trim();
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Parse a semantic version string into a comparable number tuple.
 * "1.2.3" -> [1,2,3], "v1.2" -> [1,2,0], "1.2.3-beta" -> [1,2,3]
 */
function parseSemver(input: string): [number, number, number] {
  if (!input) return [0, 0, 0];
  const cleaned = input.replace(/^v/i, "").split(/[-+]/)[0]; // strip prerelease/build
  const parts = cleaned.split(".");
  const nums: number[] = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const n = parseInt((parts[i] || "0").replace(/\D/g, ""), 10);
    nums[i] = Number.isFinite(n) ? n : 0;
  }
  return [nums[0], nums[1], nums[2]];
}

function semverGt(a: string, b: string): boolean {
  const [a1, a2, a3] = parseSemver(a);
  const [b1, b2, b3] = parseSemver(b);
  if (a1 !== b1) return a1 > b1;
  if (a2 !== b2) return a2 > b2;
  return a3 > b3;
}

/**
 * Convert any GitHub Releases URL (plain repo, /releases, /releases/latest, ...)
 * into the API endpoint for the latest release.
 */
function toLatestReleaseApi(input: string): string | null {
  if (!input) return null;
  const m = input.match(/github\.com\/([^/]+)\/([^/#?]+)/i);
  if (!m) return null;
  const owner = m[1];
  const repo = m[2].replace(/\.git$/i, "");
  return `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
}

type GitHubAsset = { name: string; browser_download_url: string; size: number };
type GitHubRelease = {
  tag_name: string;
  name?: string;
  body?: string;
  prerelease?: boolean;
  draft?: boolean;
  assets: GitHubAsset[];
};

type UpdateInfo = {
  version: string;
  notes: string;
  apkUrl: string;
  mandatory: boolean;
};

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6h while app is open
let lastCheckAt = 0;

export function ApkUpdatePrompt() {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [snoozed, setSnoozed] = useState(false);

  const check = useCallback(async () => {
    if (Platform.OS === "web") return;

    const now = Date.now();
    if (now - lastCheckAt < 10_000) return; // debounce
    lastCheckAt = now;

    try {
      const cfg: AppVersion = await getAppVersion();

      // === MODE 1: GitHub Releases auto-poll ===========================
      // If an admin pasted a GitHub repo URL, prefer that: fetch the
      // latest release directly from GitHub and auto-pick the first .apk
      // asset. No need for the admin to bump version_code manually.
      const api = toLatestReleaseApi(cfg.github_releases_url || "");
      if (api) {
        try {
          const res = await fetch(api, {
            headers: { Accept: "application/vnd.github+json" },
          });
          if (res.ok) {
            const r: GitHubRelease = await res.json();
            if (r && !r.draft && !r.prerelease) {
              const localV = getLocalVersion();
              const remoteV = (r.tag_name || "").replace(/^v/i, "");
              if (remoteV && semverGt(remoteV, localV)) {
                const apk = (r.assets || []).find((a) =>
                  a.name.toLowerCase().endsWith(".apk"),
                );
                if (apk && apk.browser_download_url) {
                  setInfo({
                    version: remoteV,
                    notes: (r.body || "").trim(),
                    apkUrl: apk.browser_download_url,
                    mandatory: !!cfg.mandatory,
                  });
                  if (cfg.mandatory || !snoozed) setVisible(true);
                  return;
                }
              }
            }
          }
        } catch {
          // GitHub rate-limit or offline — silently fall through to admin-driven mode
        }
      }

      // === MODE 2: Admin-driven version_code + apk_url =================
      const localCode = getLocalVersionCode();
      const hasNewer =
        cfg.version_code > 0 && localCode > 0 && cfg.version_code > localCode;
      const hasApk = !!(cfg.apk_url && cfg.apk_url.trim());
      if (hasNewer && hasApk) {
        setInfo({
          version: cfg.version,
          notes: cfg.notes || "",
          apkUrl: cfg.apk_url,
          mandatory: !!cfg.mandatory,
        });
        if (cfg.mandatory || !snoozed) setVisible(true);
        return;
      }

      // No update available
      setVisible(false);
    } catch {
      // silent — never crash the app for a background check
    }
  }, [snoozed]);

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
    if (!info?.apkUrl) return;
    setBusy(true);
    try {
      const supported = await Linking.canOpenURL(info.apkUrl);
      if (supported) await Linking.openURL(info.apkUrl);
    } catch {
      // ignore
    } finally {
      setBusy(false);
    }
  };

  const later = () => {
    if (info?.mandatory) return;
    setSnoozed(true);
    setVisible(false);
  };

  if (!info) return null;

  const localVersion = getLocalVersion() || "?";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={info.mandatory ? undefined : later}
    >
      <View style={styles.backdrop}>
        <View style={styles.card} testID="apk-update-card">
          <View style={styles.iconWrap}>
            <Icon name="cellphone-arrow-down" size={34} color={colors.onBrandPrimary} />
          </View>
          <Text style={styles.title}>
            {info.mandatory ? "Obavezno ažuriranje" : "Dostupna je nova verzija"}
          </Text>
          <Text style={styles.subtitle}>
            {`Trenutno: ${localVersion} → Novo: ${info.version}`}
          </Text>

          {info.notes ? (
            <ScrollView style={styles.notesBox} contentContainerStyle={{ padding: 12 }}>
              <Text style={styles.notesText}>{info.notes}</Text>
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

          {!info.mandatory ? (
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
