import { RefreshControl, StyleSheet, Text, View } from "react-native";

import { useDriverHistory } from "@/src/api/hooks";
import { Card } from "@/src/components/card";
import { Screen } from "@/src/components/screen";
import { StatusPill } from "@/src/components/status-pill";
import { ErrorState, LoadingState } from "@/src/components/states";
import { errorMessage } from "@/src/lib/api";
import { bookingDate, bookingTime } from "@/src/lib/format";
import { useAuthStore } from "@/src/store/auth";
import { colors } from "@/src/theme";

export default function DriverHistoryScreen() {
  const history = useDriverHistory();
  const timezone =
    useAuthStore((state) => state.user?.society.timezone) ?? "Asia/Kolkata";

  if (history.isLoading) {
    return <LoadingState label="Loading past trips..." />;
  }

  if (history.isError || !history.data) {
    return (
      <ErrorState
        message={errorMessage(history.error)}
        onRetry={() => void history.refetch()}
      />
    );
  }

  return (
    <Screen
      scroll
      scrollProps={{
        refreshControl: (
          <RefreshControl
            refreshing={history.isRefetching}
            tintColor={colors.primary}
            onRefresh={() => void history.refetch()}
          />
        ),
      }}
    >
      <Text style={styles.title}>History</Text>

      {history.data.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No past trips</Text>
          <Text style={styles.emptyText}>
            {"You haven't completed any trips yet."}
          </Text>
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          {history.data.map((trip) => (
            <Card key={trip.id} style={{ gap: 5 }}>
              <View style={styles.row}>
                <Text style={styles.rowTitle}>
                  {trip.flat.number} · {trip.user.name}
                </Text>
                <StatusPill status={trip.effectiveStatus ?? trip.status} />
              </View>
              <Text style={styles.subtitle}>
                {bookingDate(trip.startTime, timezone)} ·{" "}
                {bookingTime(trip.startTime, timezone)} · {trip.effectiveVehicle.name}
              </Text>
            </Card>
          ))}
          <Text style={styles.footerNote}>Completed trips stay here for 90 days.</Text>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowTitle: {
    color: colors.text,
    fontSize: 14.5,
    fontWeight: "600",
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 13,
  },
  footerNote: {
    color: colors.textFaint,
    fontSize: 12.5,
    textAlign: "center",
    paddingTop: 4,
  },
  empty: {
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    backgroundColor: colors.surface,
    padding: 24,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
  },
  emptyText: {
    color: colors.textMuted,
    textAlign: "center",
  },
});
