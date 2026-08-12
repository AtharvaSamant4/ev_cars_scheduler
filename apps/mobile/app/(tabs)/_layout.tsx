import { Redirect, Tabs } from "expo-router";

import { LoadingState } from "@/src/components/states";
import { TabBar } from "@/src/components/tab-bar";
import { useAuthStore } from "@/src/store/auth";

export default function TabsLayout() {
  const hydrated = useAuthStore((state) => state.hydrated);
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);

  if (!hydrated) {
    return <LoadingState label="Loading..." />;
  }

  if (!token || !user) {
    return <Redirect href="/(auth)/login" />;
  }

  if (user.role !== "RESIDENT") {
    return <Redirect href="/(driver)" />;
  }

  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <TabBar {...props} />}
    >
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="book" options={{ title: "Book" }} />
      <Tabs.Screen name="bookings" options={{ title: "Trips" }} />
      <Tabs.Screen name="wallet" options={{ title: "Wallet" }} />
      <Tabs.Screen name="notifications" options={{ title: "Alerts" }} />
    </Tabs>
  );
}
