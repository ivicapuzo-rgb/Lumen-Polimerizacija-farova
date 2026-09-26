import { useState } from "react";
import { LayoutChangeEvent, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import Icon from "@react-native-vector-icons/material-design-icons";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { colors } from "@/src/theme";

type Props = {
  beforeUrl: string;
  afterUrl: string;
  height?: number;
};

/** Two images stacked; a draggable divider reveals the "before" image on the left. */
export function BeforeAfterSlider({ beforeUrl, afterUrl, height = 240 }: Props) {
  const [width, setWidth] = useState(0);
  const pos = useSharedValue(0.5); // 0..1

  const pan = Gesture.Pan()
    .onChange((e) => {
      if (!width) return;
      const next = pos.value + e.changeX / width;
      pos.value = Math.max(0, Math.min(1, next));
    })
    .onEnd(() => {
      // subtle snap-back if user releases very close to edges
      if (pos.value < 0.04) pos.value = withSpring(0.1);
      if (pos.value > 0.96) pos.value = withSpring(0.9);
    });

  const beforeStyle = useAnimatedStyle(() => ({
    width: `${pos.value * 100}%`,
  }));

  const dividerStyle = useAnimatedStyle(() => ({
    left: `${pos.value * 100}%`,
  }));

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  return (
    <GestureDetector gesture={pan}>
      <View style={[styles.container, { height }]} onLayout={onLayout}>
        {/* After (bottom, full width) */}
        <Image source={afterUrl} style={StyleSheet.absoluteFill} contentFit="cover" />
        {/* Before (top, clipped by pos.value) */}
        <Animated.View style={[styles.beforeWrap, beforeStyle]}>
          <View style={{ width, height, overflow: "hidden" }}>
            <Image source={beforeUrl} style={StyleSheet.absoluteFill} contentFit="cover" />
          </View>
        </Animated.View>

        {/* Divider line + handle */}
        <Animated.View style={[styles.divider, dividerStyle]} pointerEvents="none">
          <View style={styles.dividerLine} />
          <View style={styles.handle}>
            <Icon name="chevron-left" size={16} color={colors.onBrandPrimary} />
            <Icon name="chevron-right" size={16} color={colors.onBrandPrimary} />
          </View>
        </Animated.View>

        {/* Labels */}
        <View style={[styles.badge, styles.badgeLeft]}>
          <Icon name="car-outline" size={12} color={colors.onSurface} />
          <View style={styles.badgeDot} />
          <View style={{ marginLeft: 2 }}>
            <_Label text="PRE" />
          </View>
        </View>
        <View style={[styles.badge, styles.badgeRight]}>
          <Icon name="car-light-high" size={12} color={colors.onBrandPrimary} />
          <View style={{ marginLeft: 4 }}>
            <_Label text="POSLE" bright />
          </View>
        </View>
      </View>
    </GestureDetector>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _r = runOnJS; // keep the reanimated hint

function _Label({ text, bright }: { text: string; bright?: boolean }) {
  return (
    <Animated.Text
      style={{
        color: bright ? colors.onBrandPrimary : colors.onSurface,
        fontSize: 10,
        fontWeight: "800",
        letterSpacing: 1,
      }}
    >
      {text}
    </Animated.Text>
  );
}

const styles = StyleSheet.create({
  container: { width: "100%", overflow: "hidden", borderRadius: 12, backgroundColor: colors.surfaceTertiary },
  beforeWrap: { position: "absolute", left: 0, top: 0, bottom: 0, overflow: "hidden" },
  divider: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 2,
    marginLeft: -1,
    alignItems: "center",
    justifyContent: "center",
  },
  dividerLine: { position: "absolute", top: 0, bottom: 0, width: 2, backgroundColor: "#FFFFFF" },
  handle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  badge: {
    position: "absolute",
    bottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  badgeDot: { width: 2 },
  badgeLeft: { left: 10, backgroundColor: "rgba(0,0,0,0.55)" },
  badgeRight: { right: 10, backgroundColor: colors.brandPrimary },
});
