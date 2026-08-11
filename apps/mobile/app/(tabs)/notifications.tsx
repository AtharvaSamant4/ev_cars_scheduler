import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/src/components/button";
import { EmptyState, ErrorState, LoadingState } from "@/src/components/states";
import { apiRequest, errorMessage } from "@/src/lib/api";
import { bookingDate, bookingTime } from "@/src/lib/format";
import { useAuthStore } from "@/src/store/auth";
import { colors, fonts, shadows } from "@/src/theme";
import type { Notification } from "@/src/types/api";
import { Ionicons } from "@expo/vector-icons";

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
    <SafeAreaView edges={["top"]} style={styles.container}>
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
                !notification.read && styles.unreadCard,
              ]}
            >
              <View style={styles.iconContainer}>
                <Ionicons
                  name={notification.read ? "notifications-outline" : "notifications"}
                  size={24}
                  color={notification.read ? colors.textMuted : colors.primary}
                />
              </View>
              <View style={styles.contentContainer}>
                <Text style={styles.notificationTitle}>{notification.title}</Text>
                <Text style={styles.notificationMessage}>{notification.message}</Text>
                <Text style={styles.notificationTime}>
                  {bookingDate(notification.createdAt, timezone)} ·{" "}
                  {bookingTime(notification.createdAt, timezone)}
                </Text>
              </View>
              {!notification.read && <View style={styles.unreadDot} />}
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
    fontFamily: fonts.bold,
    fontSize: 28,
  },
  notificationCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    flexDirection: "row",
    marginBottom: 12,
    padding: 16,
    ...shadows.sm,
  },
  unreadCard: {
    backgroundColor: colors.primary + "10",
  },
  iconContainer: {
    marginRight: 16,
    marginTop: 2,
  },
  contentContainer: {
    flex: 1,
  },
  notificationTitle: {
    color: colors.text,
    fontFamily: fonts.semiBold,
    fontSize: 16,
    marginBottom: 4,
  },
  notificationMessage: {
    color: colors.text,
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
  notificationTime: {
    color: colors.textMuted,
    fontFamily: fonts.medium,
    fontSize: 12,
  },
  unreadDot: {
    backgroundColor: colors.primary,
    borderRadius: 4,
    height: 8,
    marginLeft: 8,
    marginTop: 8,
    width: 8,
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
    fontFamily: fonts.medium,
    fontSize: 14,
  },
});
