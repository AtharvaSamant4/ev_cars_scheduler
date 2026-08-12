import { Pressable, StyleSheet, Text, View } from "react-native";

import { Card } from "@/src/components/card";
import { StatusPill } from "@/src/components/status-pill";
import {
  bookingDate,
  bookingTime,
  hoursLabel,
} from "@/src/lib/format";
import { colors, fonts } from "@/src/theme";
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
  const vehicle = booking.reassignedVehicle ?? booking.vehicle;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open booking for ${vehicle.name}`}
      onPress={onPress}
    >
      {({ pressed }) => (
        <Card style={[styles.card, pressed && styles.pressed]}>
          <View style={styles.topRow}>
            <Text style={styles.date}>{bookingDate(booking.startTime, timezone)}</Text>
            <StatusPill status={status} />
          </View>
          <Text style={styles.subtitle}>
            {bookingTime(booking.startTime, timezone)} – {bookingTime(booking.endTime, timezone)}
            {"  ·  "}
            {vehicle.name}
            {"  ·  "}
            {hoursLabel(booking.durationMinutes)}
          </Text>
          <Text style={styles.registration}>{vehicle.registrationNumber}</Text>
        </Card>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 5,
    paddingVertical: 15,
    paddingHorizontal: 16,
  },
  pressed: {
    borderColor: colors.borderStrong,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  date: {
    color: colors.text,
    fontSize: 14.5,
    fontWeight: "600",
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 13,
  },
  registration: {
    color: colors.textFaint,
    fontSize: 12,
    fontFamily: fonts.mono,
  },
});
