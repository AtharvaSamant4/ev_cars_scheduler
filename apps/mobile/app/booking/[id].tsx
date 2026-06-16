import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { useBooking, useCancelBooking } from "@/src/api/hooks";
import { Button } from "@/src/components/button";
import { Card } from "@/src/components/card";
import { ErrorState, LoadingState } from "@/src/components/states";
import { Screen } from "@/src/components/screen";
import { errorMessage } from "@/src/lib/api";
import { confirmAction, notify } from "@/src/lib/alerts";
import {
  bookingDate,
  bookingTime,
  hoursLabel,
  statusLabel,
} from "@/src/lib/format";
import { useAuthStore } from "@/src/store/auth";
import { colors, radius, spacing } from "@/src/theme";

export default function BookingDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const id = typeof params.id === "string" ? params.id : "";
  const token = useAuthStore((state) => state.token);
  const timezone =
    useAuthStore((state) => state.user?.society.timezone) ?? "Asia/Kolkata";
  const booking = useBooking(id);
  const cancellation = useCancelBooking(id);

  if (!token) {
    return <Redirect href="/(auth)/login" />;
  }

  if (booking.isLoading) {
    return <LoadingState label="Loading booking..." />;
  }

  if (booking.isError || !booking.data) {
    return (
      <ErrorState
        message={errorMessage(booking.error)}
        onRetry={() => void booking.refetch()}
      />
    );
  }

  const canCancel =
    booking.data.status === "BOOKED" &&
    new Date(booking.data.startTime) > new Date();

  const confirmCancellation = () => {
    confirmAction({
      title: "Cancel this booking?",
      message: "The full booking duration will be restored to your quota.",
      confirmLabel: "Cancel booking",
      cancelLabel: "Keep booking",
      destructive: true,
      onConfirm: async () => {
        try {
          await cancellation.mutateAsync();
          notify("Booking cancelled", "Your quota was restored.");
        } catch (error) {
          notify("Could not cancel", errorMessage(error));
        }
      },
    });
  };

  return (
    <Screen scroll>
      <Card style={styles.hero}>
        <View style={styles.vehicleBadge}>
          <Text style={styles.vehicleBadgeText}>EV</Text>
        </View>
        <Text style={styles.vehicle}>{booking.data.vehicle.name}</Text>
        <Text style={styles.registration}>
          {booking.data.vehicle.registrationNumber}
        </Text>
        <View
          style={[
            styles.status,
            booking.data.effectiveStatus === "CANCELLED" &&
              styles.statusCancelled,
          ]}
        >
          <Text
            style={[
              styles.statusText,
              booking.data.effectiveStatus === "CANCELLED" &&
                styles.statusTextCancelled,
            ]}
          >
            {statusLabel(booking.data.effectiveStatus)}
          </Text>
        </View>
      </Card>

      <Card style={styles.details}>
        <Detail
          label="Date"
          value={bookingDate(booking.data.startTime, timezone)}
        />
        <Detail
          label="Time"
          value={`${bookingTime(booking.data.startTime, timezone)} - ${bookingTime(booking.data.endTime, timezone)}`}
        />
        <Detail
          label="Duration"
          value={hoursLabel(booking.data.durationMinutes)}
        />
        {booking.data.status === "BOOKED" && booking.data.otp && (
          <Detail label="OTP (Provide to Driver)" value={booking.data.otp} />
        )}
        <Detail label="Booking ID" value={booking.data.id} />
      </Card>

      {cancellation.isError ? (
        <Text style={styles.error}>{errorMessage(cancellation.error)}</Text>
      ) : null}

      {canCancel ? (
        <Button
          label="Cancel booking"
          loading={cancellation.isPending}
          variant="danger"
          onPress={confirmCancellation}
        />
      ) : null}

      <Button
        label="Back to my bookings"
        variant="secondary"
        onPress={() => router.replace("/(tabs)/bookings")}
      />
    </Screen>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text selectable style={styles.detailValue}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  vehicleBadge: {
    width: 68,
    height: 68,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.lg,
    backgroundColor: colors.primarySoft,
  },
  vehicleBadgeText: {
    color: colors.primary,
    fontSize: 22,
    fontWeight: "900",
  },
  vehicle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "900",
  },
  registration: {
    color: colors.textMuted,
    fontSize: 14,
  },
  status: {
    borderRadius: radius.pill,
    backgroundColor: colors.successSoft,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  statusCancelled: {
    backgroundColor: colors.dangerSoft,
  },
  statusText: {
    color: colors.success,
    fontSize: 12,
    fontWeight: "900",
  },
  statusTextCancelled: {
    color: colors.danger,
  },
  details: {
    gap: spacing.md,
  },
  detailRow: {
    gap: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: spacing.md,
  },
  detailLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  detailValue: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  error: {
    color: colors.danger,
    fontSize: 14,
    textAlign: "center",
  },
});
