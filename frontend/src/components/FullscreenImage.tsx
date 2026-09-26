import { Modal, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
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

export function FullscreenImage({ visible, onClose, imageUrl, beforeUrl, afterUrl }: Props) {
  const { width, height } = useWindowDimensions();
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);

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

  const isPair = !!(beforeUrl && afterUrl);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} testID="fullscreen-close" />
        {isPair ? (
          <View style={{ width: width - 24, maxWidth: 720 }}>
            <BeforeAfterSlider
              beforeUrl={beforeUrl!}
              afterUrl={afterUrl!}
              height={Math.min(height - 140, width - 24)}
            />
          </View>
        ) : (
          <GestureDetector gesture={gestures}>
            <Animated.View style={[{ width, height }, animatedStyle]}>
              <Image
                source={imageUrl}
                style={StyleSheet.absoluteFill}
                contentFit="contain"
                testID="fullscreen-image"
              />
            </Animated.View>
          </GestureDetector>
        )}
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
});
