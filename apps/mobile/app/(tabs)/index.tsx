import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import {
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useDashboard } from "@/src/api/hooks";
import { BookingCard } from "@/src/components/booking-card";
import { Button } from "@/src/components/button";
import { ErrorState, LoadingState } from "@/src/components/states";
import { QuotaCard } from "@/src/components/quota-card";
import { Screen } from "@/src/components/screen";
import { errorMessage } from "@/src/lib/api";
import { confirmAction } from "@/src/lib/alerts";
import { useAuthStore } from "@/src/store/auth";
import { colors, spacing } from "@/src/theme";

export default function DashboardScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const dashboard = useDashboard();
  const timezone = user?.society.timezone ?? "Asia/Kolkata";

  const confirmLogout = () => {
    confirmAction({
      title: "Log out?",
      message: "You will need your flat number and password again.",
      confirmLabel: "Log out",
      cancelLabel: "Stay",
      destructive: true,
      onConfirm: async () => {
        await logout();
        queryClient.clear();
        router.replace("/(auth)/login");
      },
    });
  };

  if (dashboard.isLoading) {
    return <LoadingState label="Loading your dashboard..." />;
  }

  if (dashboard.isError || !dashboard.data) {
    return (
      <ErrorState
        message={errorMessage(dashboard.error)}
        onRetry={() => void dashboard.refetch()}
      />
    );
  }

  return (
    <Screen
      scroll
      scrollProps={{
        refreshControl: (
          <RefreshControl
            refreshing={dashboard.isRefetching}
            tintColor={colors.primary}
            onRefresh={() => void dashboard.refetch()}
          />
        ),
      }}
    >
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.kicker}>{user?.society.name}</Text>
          <Text style={styles.title}>Hello, {user?.name}</Text>
          <Text style={styles.subtitle}>Flat {user?.flat.number}</Text>
        </View>
        <Button label="Logout" variant="secondary" onPress={confirmLogout} />
      </View>

      <QuotaCard quota={dashboard.data.quota} />

      <Button label="Book a vehicle" onPress={() => router.push("/(tabs)/book")} />

      <View style={styles.sectionHeading}>
        <Text style={styles.sectionTitle}>Upcoming bookings</Text>
        <Text
          accessibilityRole="link"
          style={styles.link}
          onPress={() => router.push("/(tabs)/bookings")}
        >
          View all
        </Text>
      </View>

      {dashboard.data.upcomingBookings.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No trips booked yet</Text>
          <Text style={styles.emptyText}>
            Choose a date and reserve one of the society EVs.
          </Text>
        </View>
      ) : (
        dashboard.data.upcomingBookings.map((booking) => (
          <BookingCard
            booking={booking}
            key={booking.id}
            timezone={timezone}
            onPress={() =>
              router.push({
                pathname: "/booking/[id]",
                params: { id: booking.id },
              })
            }
          />
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  headerCopy: {
    flex: 1,
  },
  kicker: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "900",
    marginTop: spacing.xs,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 15,
    marginTop: spacing.xs,
  },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "900",
  },
  link: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: "800",
  },
  empty: {
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  emptyText: {
    color: colors.textMuted,
    textAlign: "center",
  },
});
