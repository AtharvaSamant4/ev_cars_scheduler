import { Redirect, Tabs } from "expo-router";

import { LoadingState } from "@/src/components/states";
import { TabBar } from "@/src/components/tab-bar";
import { useAuthStore } from "@/src/store/auth";

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
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <TabBar {...props} />}
    >
      <Tabs.Screen name="index" options={{ title: "Jobs" }} />
      <Tabs.Screen name="history" options={{ title: "History" }} />
      <Tabs.Screen name="vehicle" options={{ title: "Vehicle" }} />
    </Tabs>
  );
}
