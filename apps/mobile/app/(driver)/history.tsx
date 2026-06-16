import { RefreshControl, StyleSheet, Text, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";

import { useDriverHistory } from "@/src/api/hooks";
import { Card } from "@/src/components/card";
import { Screen } from "@/src/components/screen";
import { ErrorState, LoadingState } from "@/src/components/states";
import { errorMessage } from "@/src/lib/api";
import { colors, spacing } from "@/src/theme";

export default function DriverHistoryScreen() {
  const history = useDriverHistory();

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
      style={styles.screen}
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
      <Text style={styles.title}>Past Trips</Text>

      <View style={styles.list}>
        {history.data.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No past trips</Text>
            <Text style={styles.emptyText}>
              You haven't completed any trips yet.
            </Text>
          </View>
        ) : (
          history.data.map((trip: any) => (
            <Card key={trip.id} style={styles.card}>
              <View style={styles.row}>
                <View>
                  <Text style={styles.time}>
                    {new Date(trip.startTime).toLocaleString([], {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                  <Text style={styles.subtitle}>
                    Resident: {trip.user.name} (Flat {trip.flat?.number})
                  </Text>
                  <Text style={styles.kicker}>Status: {trip.status}</Text>
                </View>
              </View>
            </Card>
          ))
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    padding: spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "900",
    marginBottom: spacing.md,
    marginTop: spacing.xl,
  },
  list: {
    gap: spacing.md,
    paddingBottom: spacing.xl * 2,
  },
  card: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  time: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.primary,
  },
  subtitle: {
    fontSize: 16,
    color: colors.text,
  },
  kicker: {
    fontSize: 14,
    color: colors.textMuted,
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
