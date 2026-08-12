import type { ErrorBoundaryProps } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/src/components/button";
import { colors, fonts, radius, spacing } from "@/src/theme";

/**
 * Rendered by Expo Router when a screen throws while rendering. Without this,
 * a render fault shows the developer redbox in a dev client and a blank screen
 * in a release build, either of which strands the user with no way forward.
 */
export function AppErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right", "bottom"]}>
      <View style={styles.content}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>!</Text>
        </View>

        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.message}>
          This screen ran into an unexpected problem. Your bookings and wallet
          are safe.
        </Text>

        {__DEV__ ? (
          <View style={styles.debugPanel}>
            <Text style={styles.debugLabel}>Developer detail</Text>
            <Text style={styles.debugText}>{error.message}</Text>
          </View>
        ) : null}

        <Button label="Try again" onPress={() => void retry()} style={styles.action} />
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
    backgroundColor: colors.dangerSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  badgeText: {
    color: colors.danger,
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
  debugPanel: {
    alignSelf: "stretch",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.xs,
    marginTop: spacing.sm,
    padding: spacing.md,
  },
  debugLabel: {
    color: colors.textFaint,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  debugText: {
    color: colors.text,
    fontFamily: fonts.mono,
    fontSize: 12,
    lineHeight: 18,
  },
  action: {
    alignSelf: "stretch",
    marginTop: spacing.md,
  },
});
