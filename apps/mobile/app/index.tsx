import { Redirect } from "expo-router";

import { LoadingState } from "@/src/components/states";
import { useAuthStore } from "@/src/store/auth";

export default function IndexScreen() {
  const hydrated = useAuthStore((state) => state.hydrated);
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);

  if (!hydrated) {
    return <LoadingState label="Preparing your account..." />;
  }

  if (!token || !user) {
    return <Redirect href="/(auth)/login" />;
  }

  if (user.role === "DRIVER") {
    return <Redirect href="/(driver)" />;
  }

  return <Redirect href="/(tabs)" />;
}
