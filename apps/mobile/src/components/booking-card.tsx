import { Pressable, StyleSheet, Text, View } from "react-native";

import { Card } from "@/src/components/card";
import {
  bookingDate,
  bookingTime,
  hoursLabel,
  statusLabel,
} from "@/src/lib/format";
import { colors, radius, spacing } from "@/src/theme";
import type { Booking } from "@/src/types/api";

export function BookingCard({
  booking,
  timezone,
  onPress,
}: {
  booking: Booking;
  timezone: string;
  onPress: () => void;
}) {
  const status = booking.effectiveStatus;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open booking for ${booking.vehicle.name}`}
      onPress={onPress}
    >
      {({ pressed }) => (
        <Card style={[styles.card, pressed && styles.pressed]}>
          <View style={styles.topRow}>
            <View style={styles.vehicleBadge}>
              <Text style={styles.vehicleBadgeText}>EV</Text>
            </View>
            <View style={styles.titleGroup}>
              <Text style={styles.vehicle}>{booking.vehicle.name}</Text>
              <Text style={styles.registration}>
                {booking.vehicle.registrationNumber}
              </Text>
            </View>
            <View
              style={[
                styles.status,
                status === "CANCELLED" && styles.statusCancelled,
                status === "COMPLETED" && styles.statusCompleted,
                (status === "OTP_PENDING" || status === "IN_PROGRESS" || status === "ACTIVE") && styles.statusActive,
              ]}
            >
              <Text
                style={[
                  styles.statusText,
                  status === "CANCELLED" && styles.statusTextCancelled,
                  (status === "OTP_PENDING" || status === "IN_PROGRESS" || status === "ACTIVE") && styles.statusTextActive,
                ]}
              >
                {statusLabel(status)}
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          <Text style={styles.date}>
            {bookingDate(booking.startTime, timezone)}
          </Text>
          <Text style={styles.time}>
            {bookingTime(booking.startTime, timezone)} -{" "}
            {bookingTime(booking.endTime, timezone)}
            {"  ·  "}
            {hoursLabel(booking.durationMinutes)}
          </Text>
        </Card>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
  },
  pressed: {
    opacity: 0.8,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  vehicleBadge: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
  },
  vehicleBadgeText: {
    color: colors.primary,
    fontWeight: "900",
  },
  titleGroup: {
    flex: 1,
  },
  vehicle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  registration: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  status: {
    borderRadius: radius.pill,
    backgroundColor: colors.successSoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  statusCompleted: {
    backgroundColor: colors.surfaceMuted,
  },
  statusCancelled: {
    backgroundColor: colors.dangerSoft,
  },
  statusText: {
    color: colors.success,
    fontSize: 11,
    fontWeight: "800",
  },
  statusTextCancelled: {
    color: colors.danger,
  },
  statusActive: {
    backgroundColor: colors.primary,
  },
  statusTextActive: {
    color: colors.surface,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
  },
  date: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  time: {
    color: colors.textMuted,
    fontSize: 14,
  },
});
