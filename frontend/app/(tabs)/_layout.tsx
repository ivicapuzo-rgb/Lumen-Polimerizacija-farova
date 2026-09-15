import { Tabs } from "expo-router";
import Icon from "@react-native-vector-icons/material-design-icons";
import { useEffect } from "react";
import { Platform, View } from "react-native";
import * as Haptics from "expo-haptics";

import { colors } from "@/src/theme";
import { usePendingBookings } from "@/src/hooks/usePendingBookings";

export default function TabsLayout() {
  const { pendingCount, freshCount } = usePendingBookings();

  useEffect(() => {
    if (freshCount > 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
  }, [freshCount]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brandPrimary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.surfaceSecondary,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          ...(Platform.OS === "web" ? { height: 64 } : {}),
        },
        tabBarItemStyle: { alignSelf: "center" },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
        tabBarBadgeStyle: {
          backgroundColor: colors.error,
          color: colors.onError,
          fontSize: 10,
          fontWeight: "800",
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Termini",
          tabBarIcon: ({ color, size }) => <Icon name="clock-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="bookings"
        options={{
          title: "Moje",
          tabBarIcon: ({ color, size }) => (
            <Icon name="calendar-check-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="admin"
        options={{
          title: "Admin",
          tabBarBadge: pendingCount > 0 ? pendingCount : undefined,
          tabBarIcon: ({ color, size }) => (
            <View>
              <Icon name="shield-account-outline" color={color} size={size} />
              {freshCount > 0 && (
                <View
                  style={{
                    position: "absolute",
                    top: -2,
                    right: -2,
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: colors.brandPrimary,
                    borderWidth: 1,
                    borderColor: colors.surfaceSecondary,
                  }}
                />
              )}
            </View>
          ),
        }}
      />
    </Tabs>
  );
}
