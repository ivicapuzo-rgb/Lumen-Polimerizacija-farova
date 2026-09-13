import { useMemo } from "react";
import { Appearance, StyleSheet, useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";

const dark = {
  surface: "#0D0D0D",
  onSurface: "#F5F5F5",
  surfaceSecondary: "#1A1A1A",
  onSurfaceSecondary: "#E0E0E0",
  surfaceTertiary: "#262626",
  onSurfaceTertiary: "#CCCCCC",
  surfaceInverse: "#F5F5F5",
  onSurfaceInverse: "#0D0D0D",
  muted: "#858585",

  brand: "#FFB020",
  onBrand: "#121212",
  brandPrimary: "#FF9800",
  onBrandPrimary: "#121212",
  brandSecondary: "#F57C00",
  onBrandSecondary: "#121212",
  brandTertiary: "#4A3110",
  onBrandTertiary: "#FFB020",

  success: "#388E3C",
  onSuccess: "#FFFFFF",
  warning: "#F57C00",
  onWarning: "#121212",
  error: "#D32F2F",
  onError: "#FFFFFF",
  info: "#757575",
  onInfo: "#FFFFFF",

  border: "#262626",
  borderStrong: "#404040",
  divider: "#1F1F1F",
};

export type ThemeColors = typeof dark;

export const defaultScheme = "dark" satisfies ColorScheme;

export const themes: { light?: ThemeColors; dark: ThemeColors } = { dark };

export function setColorScheme(scheme: ColorScheme | null) {
  Appearance.setColorScheme?.(scheme);
}

setColorScheme?.(themes.light ? null : defaultScheme);

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme();
  const scheme: ColorScheme = system && themes[system] ? system : defaultScheme;
  return { scheme, colors: themes[scheme] ?? themes.dark };
}

export const colors = themes.dark;

export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}
