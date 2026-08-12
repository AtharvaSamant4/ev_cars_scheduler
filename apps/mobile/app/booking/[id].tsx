import {
  Redirect,
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from "expo-router";
import { useCallback, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";

import {
  useBooking,
  useCancelBooking,
  useInvoiceDownloadToken,
} from "@/src/api/hooks";
import { Button } from "@/src/components/button";
import { Card } from "@/src/components/card";
import { StatusPill } from "@/src/components/status-pill";
import { ErrorState, LoadingState } from "@/src/components/states";
import { Screen } from "@/src/components/screen";
import { buildApiUrl, errorMessage } from "@/src/lib/api";
import { confirmAction, notify } from "@/src/lib/alerts";
import {
  bookingDate,
  bookingTime,
  currencyLabel,
  hoursLabel,
} from "@/src/lib/format";
import { useAuthStore } from "@/src/store/auth";
import { colors, fonts, radius, spacing } from "@/src/theme";

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

  const status = booking.data.effectiveStatus;
  const isLive = status === "IN_PROGRESS" || status === "ACTIVE";
  const isOtp = status === "OTP_PENDING" && Boolean(booking.data.otp);
  const isRisk = status === "AT_RISK";
  const isDone = status === "COMPLETED";
  const isCancelled = status === "CANCELLED";

  const call = () => {
    if (booking.data.driver?.phoneNumber) {
      void Linking.openURL(`tel:${booking.data.driver.phoneNumber}`);
    }
  };

  return (
    <Screen scroll>
      {isLive ? (
        <View style={styles.liveHero}>
          <View style={styles.liveTopRow}>
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveBadgeText}>Ride in progress</Text>
            </View>
          </View>
          <Text style={styles.liveVehicle}>{vehicle.name}</Text>
          <Text style={styles.liveReg}>{vehicle.registrationNumber}</Text>
          <View style={styles.liveStatsRow}>
            <View>
              <Text style={styles.liveStatLabel}>Due back</Text>
              <Text style={styles.liveStatValue}>
                {bookingTime(booking.data.endTime, timezone)}
              </Text>
            </View>
            <View>
              <Text style={styles.liveStatLabel}>Booked</Text>
              <Text style={styles.liveStatValue}>
                {hoursLabel(booking.data.durationMinutes)}
              </Text>
            </View>
          </View>
        </View>
      ) : null}

      {isLive ? (
        <Card style={styles.warnCard}>
          <Text style={styles.warnText}>
            Returning after {bookingTime(booking.data.endTime, timezone)} adds a
            late-return penalty per started hour, charged to your wallet when
            the driver ends the trip.
          </Text>
        </Card>
      ) : null}

      {isOtp ? (
        <View style={styles.otpHero}>
          <View style={styles.otpBadge}>
            <View style={styles.otpDot} />
            <Text style={styles.otpBadgeText}>Driver is waiting</Text>
          </View>
          <View style={styles.otpBox}>
            <Text style={styles.otpValue}>{booking.data.otp}</Text>
            <Text style={styles.otpHint}>
              Share with {booking.data.driver?.fullName ?? "your driver"} to
              start the trip
            </Text>
          </View>
        </View>
      ) : null}

      {isRisk ? (
        <Card style={styles.riskCard}>
          <View style={styles.riskTopRow}>
            <StatusPill status={status} />
            <Text style={styles.riskDate}>
              {bookingDate(booking.data.startTime, timezone)}
            </Text>
          </View>
          <Text style={styles.riskTitle}>
            {bookingTime(booking.data.startTime, timezone)} –{" "}
            {bookingTime(booking.data.endTime, timezone)}
          </Text>
          <Text style={styles.riskText}>
            This trip needs attention. The society is arranging things — you
            will get an alert once it is resolved.
          </Text>
        </Card>
      ) : null}

      {!isLive && !isOtp ? (
        <Card style={styles.hero}>
          <View style={styles.vehicleBadge}>
            <Text style={styles.vehicleBadgeText}>EV</Text>
          </View>
          <Text style={styles.vehicle}>{vehicle.name}</Text>
          <Text style={styles.registration}>{vehicle.registrationNumber}</Text>
          <StatusPill status={status} />
        </Card>
      ) : null}

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
        {booking.data.actualRideStartTime && (
          <Detail label="Actual Start Time" value={bookingTime(booking.data.actualRideStartTime, timezone)} />
        )}
        <Detail label="Booking ID" value={booking.data.id} mono />
      </Card>

      {booking.data.driver ? (
        <Card style={styles.driverCard}>
          <View style={styles.driverInfo}>
            <Text style={styles.driverName}>{booking.data.driver.fullName}</Text>
            <Text style={styles.driverPhone}>{booking.data.driver.phoneNumber}</Text>
          </View>
          <Pressable accessibilityRole="button" onPress={call} style={styles.callButton}>
            <Text style={styles.callButtonText}>Call</Text>
          </Pressable>
        </Card>
      ) : null}

      {isDone && booking.data.invoice ? (
        <Card style={styles.invoiceCard}>
          <View style={styles.invoiceHeader}>
            <Text style={styles.invoiceTitle}>Invoice</Text>
          </View>
          <View style={styles.invoiceRow}>
            <Text style={styles.invoiceLabel}>
              Vehicle charge · {hoursLabel(booking.data.durationMinutes)}
            </Text>
            <Text style={styles.invoiceValue}>
              {currencyLabel(booking.data.invoice.subtotal)}
            </Text>
          </View>
          {booking.data.invoice.penaltyAmount > 0 ? (
            <View style={styles.invoiceRow}>
              <Text style={styles.invoicePenaltyLabel}>Late return penalty</Text>
              <Text style={styles.invoicePenaltyValue}>
                {currencyLabel(booking.data.invoice.penaltyAmount)}
              </Text>
            </View>
          ) : null}
          <View style={styles.invoiceDivider} />
          <View style={styles.invoiceRow}>
            <Text style={styles.invoiceTotalLabel}>Total</Text>
            <Text style={styles.invoiceTotalValue}>
              {currencyLabel(booking.data.invoice.totalAmount)}
            </Text>
          </View>
        </Card>
      ) : null}

      {isCancelled ? (
        <Card style={styles.details}>
          <Text style={styles.cancelledText}>
            This trip was cancelled. Hours were returned to your weekly quota
            and the charge refunded minus the cancellation fee.
          </Text>
        </Card>
      ) : null}

      {cancellation.isError ? (
        <Text style={styles.error}>{errorMessage(cancellation.error)}</Text>
      ) : null}

      {canCancel ? (
        <Button
          label="Cancel this trip"
          loading={cancellation.isPending}
          disabled={cancellation.isPending || cancellationPromptOpen}
          variant="dangerOutline"
          onPress={confirmCancellation}
        />
      ) : null}

      {isLive ? (
        <Text style={styles.note}>
          A trip in progress cannot be cancelled. Call the driver or the
          society office for anything urgent.
        </Text>
      ) : null}

      {isDone && booking.data.invoice ? (
        <Button
          label="Download Invoice PDF"
          variant="secondary"
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

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text selectable style={[styles.detailValue, mono && { fontFamily: fonts.mono }]}>
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
    fontWeight: "700",
    fontFamily: fonts.mono,
  },
  vehicle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "700",
  },
  registration: {
    color: colors.textMuted,
    fontSize: 13,
    fontFamily: fonts.mono,
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
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  detailValue: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "600",
  },
  error: {
    color: colors.danger,
    fontSize: 14,
    textAlign: "center",
  },
  note: {
    color: colors.textFaint,
    fontSize: 12.5,
    lineHeight: 18,
    textAlign: "center",
  },

  // live hero
  liveHero: {
    backgroundColor: colors.ink,
    borderRadius: radius.lg,
    padding: 18,
  },
  liveTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.live,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.liveDot,
  },
  liveBadgeText: {
    color: colors.surface,
    fontSize: 11.5,
    fontWeight: "600",
  },
  liveVehicle: {
    color: colors.surface,
    fontSize: 21,
    fontWeight: "700",
    marginTop: 16,
  },
  liveReg: {
    color: colors.textFaint,
    fontSize: 13,
    marginTop: 4,
    fontFamily: fonts.mono,
  },
  liveStatsRow: {
    flexDirection: "row",
    gap: 26,
    marginTop: 18,
  },
  liveStatLabel: {
    color: colors.textFaint,
    fontSize: 12,
  },
  liveStatValue: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: "600",
    marginTop: 4,
  },
  warnCard: {
    backgroundColor: colors.warningSoft,
    borderColor: colors.warningBorder,
  },
  warnText: {
    color: colors.warning,
    fontSize: 13,
    lineHeight: 19,
  },

  // otp hero
  otpHero: {
    backgroundColor: colors.ink,
    borderRadius: radius.lg,
    padding: 18,
  },
  otpBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  otpDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.warning,
  },
  otpBadgeText: {
    color: colors.warning,
    fontSize: 11.5,
    fontWeight: "600",
  },
  otpBox: {
    marginTop: 16,
    backgroundColor: colors.inkSoft,
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
  },
  otpValue: {
    color: colors.surface,
    fontSize: 38,
    fontWeight: "700",
    letterSpacing: 6,
    fontFamily: fonts.mono,
  },
  otpHint: {
    color: colors.textFaint,
    fontSize: 12,
    marginTop: 8,
    textAlign: "center",
  },

  // at-risk
  riskCard: {
    borderColor: colors.warningBorder,
  },
  riskTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  riskDate: {
    color: colors.textFaint,
    fontSize: 11.5,
    fontFamily: fonts.mono,
  },
  riskTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "700",
    marginTop: 12,
  },
  riskText: {
    color: colors.warning,
    backgroundColor: colors.warningSoft,
    borderRadius: radius.md,
    padding: 13,
    marginTop: 14,
    fontSize: 13,
    lineHeight: 19,
  },
  cancelledText: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
  },

  // driver
  driverCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  driverInfo: {
    flex: 1,
  },
  driverName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "600",
  },
  driverPhone: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
    fontFamily: fonts.mono,
  },
  callButton: {
    minHeight: 44,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  callButtonText: {
    color: colors.surface,
    fontSize: 13.5,
    fontWeight: "600",
  },

  // invoice
  invoiceCard: {
    padding: 0,
    overflow: "hidden",
  },
  invoiceHeader: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  invoiceTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "600",
  },
  invoiceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  invoiceLabel: {
    color: colors.textMuted,
    fontSize: 13.5,
  },
  invoiceValue: {
    color: colors.text,
    fontSize: 13.5,
    fontFamily: fonts.mono,
  },
  invoicePenaltyLabel: {
    color: colors.danger,
    fontSize: 13.5,
  },
  invoicePenaltyValue: {
    color: colors.danger,
    fontSize: 13.5,
    fontFamily: fonts.mono,
  },
  invoiceDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginTop: 14,
    marginHorizontal: 16,
  },
  invoiceTotalLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "600",
  },
  invoiceTotalValue: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
    fontFamily: fonts.mono,
    paddingBottom: 16,
  },
});
