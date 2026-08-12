import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { AppErrorBoundary } from "@/src/components/error-boundary";
import { AppProvider } from "@/src/providers/app-provider";
import { colors } from "@/src/theme";

// Expo Router renders this for any render-time throw below the root layout.
export { AppErrorBoundary as ErrorBoundary };

export default function RootLayout() {
  return (
    <AppProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: colors.background },
          headerStyle: { backgroundColor: colors.background },
          headerShadowVisible: false,
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: "800" },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(driver)" options={{ headerShown: false }} />
        <Stack.Screen
          name="booking/[id]"
          options={{ title: "Booking details" }}
        />
      </Stack>
    </AppProvider>
  );
}
