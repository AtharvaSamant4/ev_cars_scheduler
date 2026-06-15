import { Redirect, Stack } from "expo-router";

import { LoadingState } from "@/src/components/states";
import { useAuthStore } from "@/src/store/auth";

export default function AuthLayout() {
  const hydrated = useAuthStore((state) => state.hydrated);
  const token = useAuthStore((state) => state.token);

  if (!hydrated) {
    return <LoadingState label="Loading..." />;
  }

  if (token) {
    return <Redirect href="/(tabs)" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
