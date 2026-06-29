import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { EmptyState, LoadingState } from "@/src/components/states";
import { apiRequest } from "@/src/lib/api";
import { colors, fonts, shadows } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";

export default function NotificationsTab() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchNotifications = useCallback(async () => {
    try {
      const data = await apiRequest<any[]>("/notifications");
      setNotifications(data);
      // Mark as read in the background
      await apiRequest("/notifications", { method: "POST" }).catch(() => null);
    } catch (error) {
      console.error(error);
    } finally {
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
    setRefreshing(true);
    void fetchNotifications();
  };

  if (loading) {
    return <LoadingState label="Loading alerts..." />;
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
        {notifications.length === 0 ? (
          <EmptyState
            icon="notifications-outline"
            message="No alerts"
            description="You're all caught up."
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
                  {new Date(notification.createdAt).toLocaleString()}
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
});
