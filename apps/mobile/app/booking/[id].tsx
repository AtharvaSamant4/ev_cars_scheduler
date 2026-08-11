import {
  Redirect,
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from "expo-router";
import { useCallback, useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";

import {
  useBooking,
  useCancelBooking,
  useInvoiceDownloadToken,
} from "@/src/api/hooks";
import { Button } from "@/src/components/button";
import { Card } from "@/src/components/card";
import { ErrorState, LoadingState } from "@/src/components/states";
import { Screen } from "@/src/components/screen";
import { buildApiUrl, errorMessage } from "@/src/lib/api";
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
  const user = useAuthStore((state) => state.user);
  const timezone =
    useAuthStore((state) => state.user?.society.timezone) ?? "Asia/Kolkata";
  const booking = useBooking(id, user?.role === "RESIDENT");
  const cancellation = useCancelBooking(id);
  const invoiceDownload = useInvoiceDownloadToken(id);
  const refetchBooking = booking.refetch;
  const [cancellationPromptOpen, setCancellationPromptOpen] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (id && user?.role === "RESIDENT") {
        void refetchBooking();
      }
    }, [id, refetchBooking, user?.role]),
  );

  if (!token || !user) {
    return <Redirect href="/(auth)/login" />;
  }

  if (user.role !== "RESIDENT") {
    return <Redirect href="/(driver)" />;
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
    ["BOOKED", "DRIVER_ASSIGNED", "REASSIGNED", "AT_RISK"].includes(
      booking.data.status,
    ) &&
    new Date(booking.data.startTime) > new Date();
  const vehicle = booking.data.reassignedVehicle ?? booking.data.vehicle;

  const confirmCancellation = () => {
    if (cancellation.isPending || cancellationPromptOpen) return;

    setCancellationPromptOpen(true);
    confirmAction({
      title: "Cancel this booking?",
      message: "Your quota will be restored and any active cancellation penalty will be applied to your wallet.",
      confirmLabel: "Cancel booking",
      cancelLabel: "Keep booking",
      destructive: true,
      onCancel: () => setCancellationPromptOpen(false),
      onConfirm: async () => {
        try {
          await cancellation.mutateAsync();
          notify("Booking cancelled", "Your quota was restored and your wallet was updated.");
        } catch (error) {
          notify("Could not cancel", errorMessage(error));
        } finally {
          setCancellationPromptOpen(false);
        }
      },
    });
  };

  const downloadInvoice = async () => {
    if (invoiceDownload.isPending) return;

    try {
      const result = await invoiceDownload.mutateAsync();
      if (!result.available || !result.downloadToken) {
        throw new Error("The invoice is not available for download yet");
      }

      await Linking.openURL(
        buildApiUrl(`/bookings/${encodeURIComponent(booking.data.id)}/invoice/pdf`, {
          downloadToken: result.downloadToken,
        }),
      );
    } catch (error) {
      notify("Could not download invoice", errorMessage(error));
    }
  };

  return (
    <Screen scroll>
      <Card style={styles.hero}>
        <View style={styles.vehicleBadge}>
          <Text style={styles.vehicleBadgeText}>EV</Text>
        </View>
        <Text style={styles.vehicle}>{vehicle.name}</Text>
        <Text style={styles.registration}>
          {vehicle.registrationNumber}
        </Text>
        <View
          style={[
            styles.status,
            booking.data.effectiveStatus === "CANCELLED" &&
              styles.statusCancelled,
            (booking.data.effectiveStatus === "OTP_PENDING" || booking.data.effectiveStatus === "IN_PROGRESS" || booking.data.effectiveStatus === "ACTIVE") &&
              styles.statusActive,
          ]}
        >
          <Text
            style={[
              styles.statusText,
              booking.data.effectiveStatus === "CANCELLED" &&
                styles.statusTextCancelled,
              (booking.data.effectiveStatus === "OTP_PENDING" || booking.data.effectiveStatus === "IN_PROGRESS" || booking.data.effectiveStatus === "ACTIVE") &&
                styles.statusTextActive,
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
        {booking.data.driver && (
          <Detail label="Assigned Driver" value={`${booking.data.driver.fullName} (${booking.data.driver.phoneNumber})`} />
        )}
        {booking.data.status === "OTP_PENDING" && booking.data.otp && (
          <Detail label="OTP (Provide to Driver)" value={booking.data.otp} />
        )}
        {booking.data.actualRideStartTime && (
          <Detail label="Actual Start Time" value={bookingTime(booking.data.actualRideStartTime, timezone)} />
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
          disabled={cancellation.isPending || cancellationPromptOpen}
          variant="danger"
          onPress={confirmCancellation}
        />
      ) : null}

      {booking.data.status === "COMPLETED" && booking.data.invoice ? (
        <Button
          label="Download Invoice PDF"
          variant="primary"
          loading={invoiceDownload.isPending}
          disabled={invoiceDownload.isPending}
          onPress={() => void downloadInvoice()}
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
  statusActive: {
    backgroundColor: colors.primary,
  },
  statusTextActive: {
    color: colors.surface,
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
