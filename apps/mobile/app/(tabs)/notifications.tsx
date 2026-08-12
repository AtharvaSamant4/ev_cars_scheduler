import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/src/components/button";
import { EmptyState, ErrorState, LoadingState } from "@/src/components/states";
import { apiRequest, errorMessage } from "@/src/lib/api";
import { bookingDate, bookingTime } from "@/src/lib/format";
import { useAuthStore } from "@/src/store/auth";
import { colors, radius } from "@/src/theme";
import type { Notification } from "@/src/types/api";

export default function NotificationsTab() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const requestInFlight = useRef(false);
  const timezone =
    useAuthStore((state) => state.user?.society.timezone) ?? "Asia/Kolkata";

  const fetchNotifications = useCallback(async () => {
    if (requestInFlight.current) return;

    requestInFlight.current = true;
    setLoadError(null);
    try {
      const data = await apiRequest<Notification[]>("/notifications");
      setNotifications(data);
      if (data.length > 0) {
        try {
          const shownIds = data.map((notification) => notification.id);
          await apiRequest<{ success: boolean }>("/notifications", {
            method: "POST",
            body: JSON.stringify({ notificationIds: shownIds }),
          });
          const shownIdSet = new Set(shownIds);
          setNotifications((current) =>
            current.map((notification) =>
              shownIdSet.has(notification.id)
                ? { ...notification, read: true }
                : notification,
            ),
          );
        } catch (error) {
          setLoadError(
            `Alerts loaded, but read status could not be updated: ${errorMessage(error)}`,
          );
        }
      }
    } catch (error) {
      setLoadError(errorMessage(error));
    } finally {
      requestInFlight.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void fetchNotifications();
    }, [fetchNotifications]),
  );

  const onRefresh = () => {
    if (requestInFlight.current) return;
    setRefreshing(true);
    void fetchNotifications();
  };

  if (loading) {
    return <LoadingState label="Loading alerts..." />;
  }

  if (loadError && notifications.length === 0) {
    return (
      <ErrorState
        message={loadError}
        onRetry={() => void fetchNotifications()}
      />
    );
  }

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Alerts</Text>
      </View>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {loadError ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{loadError}</Text>
            <Button
              label="Try again"
              variant="secondary"
              onPress={() => void fetchNotifications()}
            />
          </View>
        ) : null}
        {notifications.length === 0 ? (
          <EmptyState
            title="No alerts"
            message="You're all caught up."
          />
        ) : (
          notifications.map((notification) => (
            <View
              key={notification.id}
              style={[
                styles.notificationCard,
                notification.read && styles.readCard,
              ]}
            >
              <View style={styles.topRow}>
                <Text
                  style={[
                    styles.notificationTitle,
                    notification.read && styles.readTitle,
                  ]}
                >
                  {notification.title}
                </Text>
                {notification.read ? <Text style={styles.readTag}>read</Text> : null}
              </View>
              <Text style={styles.notificationMessage}>{notification.message}</Text>
              <Text style={styles.notificationTime}>
                {bookingDate(notification.createdAt, timezone)} ·{" "}
                {bookingTime(notification.createdAt, timezone)}
              </Text>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  scrollContent: {
    padding: 20,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  notificationCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    marginBottom: 10,
    padding: 15,
  },
  readCard: {
    backgroundColor: "#F8F9F6",
    opacity: 0.86,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  notificationTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 14.5,
    fontWeight: "600",
  },
  readTitle: {
    color: colors.textMuted,
  },
  readTag: {
    color: colors.textFaint,
    fontSize: 11,
  },
  notificationMessage: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19.5,
    marginTop: 6,
  },
  notificationTime: {
    color: colors.textFaint,
    fontSize: 11.5,
    marginTop: 9,
  },
  errorBanner: {
    backgroundColor: colors.dangerSoft,
    borderRadius: 12,
    gap: 12,
    marginBottom: 12,
    padding: 12,
  },
  errorText: {
    color: colors.danger,
    fontWeight: "600",
    fontSize: 14,
  },
});
