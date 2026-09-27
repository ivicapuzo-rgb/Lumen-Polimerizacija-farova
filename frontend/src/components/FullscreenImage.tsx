import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import Icon from "@react-native-vector-icons/material-design-icons";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { colors } from "@/src/theme";
import { BeforeAfterSlider } from "./BeforeAfterSlider";

type Props = {
  visible: boolean;
  onClose: () => void;
  imageUrl?: string;
  beforeUrl?: string;
  afterUrl?: string;
};

type Mode = "slider" | "before" | "after";

function ZoomableImage({ uri, testID }: { uri: string; testID?: string }) {
  const { width, height } = useWindowDimensions();
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);

  useEffect(() => {
    // Reset zoom when the image changes
    scale.value = 1;
    savedScale.value = 1;
    tx.value = 0;
    ty.value = 0;
    savedTx.value = 0;
    savedTy.value = 0;
  }, [uri, scale, savedScale, tx, ty, savedTx, savedTy]);

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.max(1, Math.min(6, savedScale.value * e.scale));
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value < 1.05) {
        scale.value = withTiming(1);
        tx.value = withTiming(0);
        ty.value = withTiming(0);
        savedScale.value = 1;
        savedTx.value = 0;
        savedTy.value = 0;
      }
    });

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      if (scale.value <= 1) return;
      tx.value = savedTx.value + e.translationX;
      ty.value = savedTy.value + e.translationY;
    })
    .onEnd(() => {
      savedTx.value = tx.value;
      savedTy.value = ty.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1) {
        scale.value = withTiming(1);
        tx.value = withTiming(0);
        ty.value = withTiming(0);
        savedScale.value = 1;
        savedTx.value = 0;
        savedTy.value = 0;
      } else {
        scale.value = withTiming(2.5);
        savedScale.value = 2.5;
      }
    });

  const gestures = Gesture.Simultaneous(pan, pinch, doubleTap);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={gestures}>
      <Animated.View style={[{ width, height: height - 160 }, animatedStyle]}>
        <Image source={uri} style={StyleSheet.absoluteFill} contentFit="contain" testID={testID} />
      </Animated.View>
    </GestureDetector>
  );
}

export function FullscreenImage({ visible, onClose, imageUrl, beforeUrl, afterUrl }: Props) {
  const { width, height } = useWindowDimensions();
  const isPair = !!(beforeUrl && afterUrl);
  const [mode, setMode] = useState<Mode>("slider");

  useEffect(() => {
    if (visible) setMode("slider");
  }, [visible]);

  const MODE_TABS: { key: Mode; label: string; icon: string }[] = [
    { key: "slider", label: "Slajder", icon: "compare" },
    { key: "before", label: "PRE", icon: "image-outline" },
    { key: "after", label: "POSLE", icon: "car-light-high" },
  ];

  const renderPair = () => {
    if (mode === "slider") {
      return (
        <View style={{ width: width - 24, maxWidth: 720 }}>
          <BeforeAfterSlider
            beforeUrl={beforeUrl!}
            afterUrl={afterUrl!}
            height={Math.min(height - 200, width - 24)}
          />
        </View>
      );
    }
    return (
      <ZoomableImage
        uri={mode === "before" ? beforeUrl! : afterUrl!}
        testID={mode === "before" ? "fullscreen-before" : "fullscreen-after"}
      />
    );
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} testID="fullscreen-close" />

        {isPair ? renderPair() : (
          imageUrl ? <ZoomableImage uri={imageUrl} testID="fullscreen-image" /> : null
        )}

        {isPair ? (
          <View style={styles.modeRow} testID="fullscreen-mode-row">
            {MODE_TABS.map((t) => (
              <Pressable
                key={t.key}
                testID={`fullscreen-mode-${t.key}`}
                style={[styles.modeBtn, mode === t.key && styles.modeBtnActive]}
                onPress={() => setMode(t.key)}
              >
                <Icon name={t.icon as any} size={14} color={mode === t.key ? colors.onBrandPrimary : colors.onSurface} />
                <Text style={[styles.modeText, mode === t.key && styles.modeTextActive]}>{t.label}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        <Pressable style={styles.closeBtn} onPress={onClose}>
          <Icon name="close" size={22} color={colors.onSurface} />
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.95)",
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtn: {
    position: "absolute",
    top: 50,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  modeRow: {
    position: "absolute",
    bottom: 40,
    flexDirection: "row",
    backgroundColor: "rgba(20,20,20,0.85)",
    borderRadius: 999,
    padding: 4,
    gap: 4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  modeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  modeBtnActive: { backgroundColor: colors.brandPrimary },
  modeText: { color: colors.onSurface, fontSize: 12, fontWeight: "700" },
  modeTextActive: { color: colors.onBrandPrimary },
});
