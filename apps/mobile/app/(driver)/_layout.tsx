import { Ionicons } from "@expo/vector-icons";
import { Redirect, Tabs } from "expo-router";

import { LoadingState } from "@/src/components/states";
import { useAuthStore } from "@/src/store/auth";
import { colors } from "@/src/theme";

export default function DriverLayout() {
  const hydrated = useAuthStore((state) => state.hydrated);
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);

  if (!hydrated) {
    return <LoadingState label="Loading..." />;
  }

  if (!token || !user) {
    return <Redirect href="/(auth)/login" />;
  }

  if (user.role !== "DRIVER") {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          height: 68,
          paddingTop: 8,
          paddingBottom: 8,
          borderTopColor: colors.border,
          backgroundColor: colors.surface,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: "700",
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => (
            <Ionicons color={color} name="home-outline" size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: "History",
          tabBarIcon: ({ color, size }) => (
            <Ionicons color={color} name="calendar-outline" size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
