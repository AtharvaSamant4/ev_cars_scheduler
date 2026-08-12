import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/src/components/button";
import { useAuthStore } from "@/src/store/auth";
import { colors, radius, spacing } from "@/src/theme";

export default function NotFoundScreen() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);

  function goHome() {
    if (!user) {
      router.replace("/(auth)/login");
      return;
    }

    router.replace(user.role === "DRIVER" ? "/(driver)" : "/(tabs)");
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right", "bottom"]}>
      <View style={styles.content}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>?</Text>
        </View>

        <Text style={styles.title}>Page not found</Text>
        <Text style={styles.message}>
          This screen does not exist or is no longer available.
        </Text>

        <Button label="Go to home" onPress={goHome} style={styles.action} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.sm,
  },
  badge: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  badgeText: {
    color: colors.primary,
    fontSize: 28,
    fontWeight: "800",
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center",
  },
  message: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
  action: {
    alignSelf: "stretch",
    marginTop: spacing.md,
  },
});
