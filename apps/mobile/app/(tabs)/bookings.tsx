import { useRouter } from "expo-router";
import { useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useBookings } from "@/src/api/hooks";
import { BookingCard } from "@/src/components/booking-card";
import { EmptyState, ErrorState, LoadingState } from "@/src/components/states";
import { errorMessage } from "@/src/lib/api";
import { useAuthStore } from "@/src/store/auth";
import { colors, radius, spacing } from "@/src/theme";

export default function MyBookingsScreen() {
  const router = useRouter();
  const [view, setView] = useState<"upcoming" | "history">("upcoming");
  const bookings = useBookings(view);
  const timezone =
    useAuthStore((state) => state.user?.society.timezone) ?? "Asia/Kolkata";

  if (bookings.isLoading) {
    return <LoadingState label="Loading your bookings..." />;
  }

  if (bookings.isError || !bookings.data) {
    return (
      <ErrorState
        message={errorMessage(bookings.error)}
        onRetry={() => void bookings.refetch()}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["left", "right"]}>
      <FlatList
        contentContainerStyle={styles.content}
        data={bookings.data.items}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={bookings.isRefetching}
            tintColor={colors.primary}
            onRefresh={() => void bookings.refetch()}
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <View>
              <Text style={styles.kicker}>MY BOOKINGS</Text>
              <Text style={styles.title}>Trips and history</Text>
            </View>
            <View style={styles.segment}>
              <Segment
                active={view === "upcoming"}
                label="Upcoming"
                onPress={() => setView("upcoming")}
              />
              <Segment
                active={view === "history"}
                label="History"
                onPress={() => setView("history")}
              />
            </View>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            title={view === "upcoming" ? "No upcoming trips" : "No history yet"}
            message={
              view === "upcoming"
                ? "Your next reservation will appear here."
                : "Completed and cancelled bookings will appear here."
            }
          />
        }
        renderItem={({ item }) => (
          <BookingCard
            booking={item}
            timezone={timezone}
            onPress={() =>
              router.push({
                pathname: "/booking/[id]",
                params: { id: item.id },
              })
            }
          />
        )}
      />
    </SafeAreaView>
  );
}

function Segment({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[styles.segmentButton, active && styles.segmentButtonActive]}
      onPress={onPress}
    >
      <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
    gap: spacing.md,
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },
  header: {
    gap: spacing.md,
    marginBottom: spacing.xs,
  },
  kicker: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "900",
    marginTop: spacing.xs,
  },
  segment: {
    flexDirection: "row",
    gap: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.xs,
  },
  segmentButton: {
    flex: 1,
    alignItems: "center",
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
  },
  segmentButtonActive: {
    backgroundColor: colors.surface,
  },
  segmentText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: "700",
  },
  segmentTextActive: {
    color: colors.primary,
  },
});
