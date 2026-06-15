import { Redirect } from "expo-router";

import { LoadingState } from "@/src/components/states";
import { useAuthStore } from "@/src/store/auth";

export default function IndexScreen() {
  const hydrated = useAuthStore((state) => state.hydrated);
  const token = useAuthStore((state) => state.token);

  if (!hydrated) {
    return <LoadingState label="Preparing your account..." />;
  }

  return <Redirect href={token ? "/(tabs)" : "/(auth)/login"} />;
}
