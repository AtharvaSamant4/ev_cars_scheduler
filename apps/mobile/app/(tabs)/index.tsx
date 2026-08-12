import { useQueryClient } from "@tanstack/react-query";
import { Redirect, useRouter } from "expo-router";
import {
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useDashboard, useWallet } from "@/src/api/hooks";
import { BookingCard } from "@/src/components/booking-card";
import { Button } from "@/src/components/button";
import { Card } from "@/src/components/card";
import { QuotaRing } from "@/src/components/quota-ring";
import { ErrorState, LoadingState } from "@/src/components/states";
import { StatusPill } from "@/src/components/status-pill";
import { Screen } from "@/src/components/screen";
import { errorMessage } from "@/src/lib/api";
import { confirmAction } from "@/src/lib/alerts";
import {
  bookingDate,
  bookingTime,
  currencyLabel,
  hoursLabel,
  hoursShortLabel,
} from "@/src/lib/format";
import { useAuthStore } from "@/src/store/auth";
import { colors, fonts, spacing } from "@/src/theme";
import type { Booking } from "@/src/types/api";

export default function DashboardScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const dashboard = useDashboard(user?.role === "RESIDENT");
  const wallet = useWallet();
  const timezone = user?.society.timezone ?? "Asia/Kolkata";

  const confirmLogout = () => {
    confirmAction({
      title: "Log out?",
      message: "You will need your flat number and password again.",
      confirmLabel: "Log out",
      cancelLabel: "Stay",
      destructive: true,
      onConfirm: async () => {
        await logout();
        queryClient.clear();
        router.replace("/(auth)/login");
      },
    });
  };

  if (!user || user.role !== "RESIDENT") {
    return <Redirect href={user?.role === "DRIVER" ? "/(driver)" : "/(auth)/login"} />;
  }

  if (dashboard.isLoading) {
    return <LoadingState label="Loading your dashboard..." />;
  }

  if (dashboard.isError || !dashboard.data) {
    return (
      <ErrorState
        message={errorMessage(dashboard.error)}
        onRetry={() => void dashboard.refetch()}
      />
    );
  }

  const { quota, upcomingBookings } = dashboard.data;
  const live = upcomingBookings.find(
    (b) => b.effectiveStatus === "IN_PROGRESS" || b.effectiveStatus === "ACTIVE",
  );
  const otpPending = !live
    ? upcomingBookings.find((b) => b.effectiveStatus === "OTP_PENDING")
    : undefined;
  const focus = live ?? otpPending ?? upcomingBookings[0];

  const initials = (user.name || "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  const quotaPercentRemaining =
    quota.allocatedMinutes === 0
      ? 0
      : (quota.remainingMinutes / quota.allocatedMinutes) * 100;
  const quotaEmpty = quota.remainingMinutes <= 0;

  return (
    <Screen
      scroll
      scrollProps={{
        refreshControl: (
          <RefreshControl
            refreshing={dashboard.isRefetching}
            tintColor={colors.primary}
            onRefresh={() => void dashboard.refetch()}
          />
        ),
      }}
    >
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.kicker}>
            {user.society.name.toUpperCase()} · {user.flat.number}
          </Text>
          <Text style={styles.title}>Hello, {user.name.split(" ")[0]}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Log out"
          onPress={confirmLogout}
          style={styles.avatar}
        >
          <Text style={styles.avatarText}>{initials}</Text>
        </Pressable>
      </View>

      <FocusCard booking={focus} timezone={timezone} router={router} />

      <View style={styles.summaryRow}>
        <Card style={styles.quotaCard}>
          <QuotaRing
            percentRemaining={quotaPercentRemaining}
            shortLabel={hoursShortLabel(quota.remainingMinutes)}
          />
          <View style={styles.quotaCopy}>
            <Text style={styles.quotaTitle}>Quota left</Text>
            <Text style={styles.quotaSubtitle}>
              of {hoursLabel(quota.allocatedMinutes)} · resets Mon
            </Text>
          </View>
        </Card>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/(tabs)/wallet")}
          style={({ pressed }) => [styles.walletCard, pressed && styles.pressed]}
        >
          <Text style={styles.walletTitle}>Wallet</Text>
          <Text style={styles.walletAmount}>
            {wallet.data ? currencyLabel(wallet.data.balance) : "—"}
          </Text>
          <Text style={styles.walletAction}>Top up</Text>
        </Pressable>
      </View>

      {quotaEmpty ? (
        <Card style={styles.quotaEmptyCard}>
          <Text style={styles.quotaEmptyTitle}>Weekly quota used up</Text>
          <View style={styles.quotaEmptyTrack}>
            <View style={[styles.quotaEmptyBar, { width: "100%" }]} />
          </View>
          <Text style={styles.quotaEmptyText}>
            Your hours reset on Monday at 12:00 AM. Cancelling an upcoming trip
            returns its hours immediately.
          </Text>
        </Card>
      ) : null}

      <Button label="Book an EV" onPress={() => router.push("/(tabs)/book")} />

      <View style={styles.sectionHeading}>
        <Text style={styles.sectionTitle}>Your trips</Text>
        <Text
          accessibilityRole="link"
          style={styles.link}
          onPress={() => router.push("/(tabs)/bookings")}
        >
          See all
        </Text>
      </View>

      {upcomingBookings.length === 0 ? null : (
        upcomingBookings.map((booking) => (
          <BookingCard
            booking={booking}
            key={booking.id}
            timezone={timezone}
            onPress={() =>
              router.push({
                pathname: "/booking/[id]",
                params: { id: booking.id },
              })
            }
          />
        ))
      )}
    </Screen>
  );
}

function FocusCard({
  booking,
  timezone,
  router,
}: {
  booking: Booking | undefined;
  timezone: string;
  router: ReturnType<typeof useRouter>;
}) {
  const open = () =>
    booking &&
    router.push({ pathname: "/booking/[id]", params: { id: booking.id } });

  if (!booking) {
    return (
      <Card style={styles.noFocusCard}>
        <View style={styles.noFocusBadge}>
          <Text style={styles.noFocusBadgeText}>EV</Text>
        </View>
        <Text style={styles.noFocusTitle}>No trips booked</Text>
        <Text style={styles.noFocusText}>
          Pick a time and one of the society EVs is yours, with a driver
          arranged for you.
        </Text>
        <Button label="Book an EV" onPress={() => router.push("/(tabs)/book")} />
      </Card>
    );
  }

  const status = booking.effectiveStatus;
  const vehicle = booking.reassignedVehicle ?? booking.vehicle;

  if (status === "OTP_PENDING" && booking.otp) {
    return (
      <Pressable onPress={open}>
        <View style={styles.otpCard}>
          <View style={styles.otpTopRow}>
            <View style={styles.otpBadge}>
              <View style={styles.liveDotWarn} />
              <Text style={styles.otpBadgeText}>Driver is waiting</Text>
            </View>
            <Text style={styles.otpReg}>{vehicle.registrationNumber}</Text>
          </View>
          <Text style={styles.otpHeadline}>
            Share this OTP with {booking.driver?.fullName ?? "your driver"}
          </Text>
          <Text style={styles.otpSubtext}>
            They are at the pickup point with {vehicle.name}
          </Text>
          <View style={styles.otpBox}>
            <Text style={styles.otpValue}>{booking.otp}</Text>
            <Text style={styles.otpHint}>Do not share this over the phone</Text>
          </View>
        </View>
      </Pressable>
    );
  }

  if (status === "IN_PROGRESS" || status === "ACTIVE") {
    return (
      <Pressable onPress={open}>
        <View style={styles.liveCard}>
          <View style={styles.liveTopRow}>
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveBadgeText}>RIDE IN PROGRESS</Text>
            </View>
            <Text style={styles.liveReg}>{vehicle.registrationNumber}</Text>
          </View>
          <Text style={styles.liveHeadline}>
            {vehicle.name} · back by {bookingTime(booking.endTime, timezone)}
          </Text>
          <Text style={styles.liveSubtext}>
            {booking.driver?.fullName ?? "Driver"} is driving ·{" "}
            {bookingTime(booking.startTime, timezone)} – {bookingTime(booking.endTime, timezone)}
          </Text>
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable onPress={open}>
      <Card style={[styles.plainFocusCard, styles.pressableCard]}>
        <View style={styles.plainTopRow}>
          <Text style={styles.plainKicker}>NEXT TRIP</Text>
          <StatusPill status={status} />
        </View>
        <Text style={styles.plainDay}>{bookingDate(booking.startTime, timezone)}</Text>
        <Text style={styles.plainSubtext}>
          {bookingTime(booking.startTime, timezone)} – {bookingTime(booking.endTime, timezone)}
          {"  ·  "}
          {hoursLabel(booking.durationMinutes)}
        </Text>
        <View style={styles.plainDivider} />
        <View style={styles.plainBottomRow}>
          <Text style={styles.plainVehicle}>
            {vehicle.name}
            {booking.driver ? ` · ${booking.driver.fullName}` : ""}
          </Text>
          <Text style={styles.plainReg}>{vehicle.registrationNumber}</Text>
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  headerCopy: {
    flex: 1,
  },
  kicker: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: 0.6,
    fontFamily: fonts.mono,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "700",
    marginTop: 4,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primarySoft,
  },
  avatarText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: "700",
  },
  pressed: {
    opacity: 0.85,
  },
  pressableCard: {
    gap: 0,
  },

  // no-focus
  noFocusCard: {
    alignItems: "center",
    textAlign: "center",
    gap: spacing.sm,
    paddingVertical: 24,
  },
  noFocusBadge: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  noFocusBadgeText: {
    color: colors.primary,
    fontFamily: fonts.mono,
    fontWeight: "600",
    fontSize: 15,
  },
  noFocusTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "700",
  },
  noFocusText: {
    color: colors.textMuted,
    fontSize: 13.5,
    lineHeight: 19,
    textAlign: "center",
    maxWidth: 260,
  },

  // plain (next trip)
  plainFocusCard: {
    borderRadius: 18,
  },
  plainTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  plainKicker: {
    color: colors.textMuted,
    fontSize: 11,
    letterSpacing: 0.8,
    fontFamily: fonts.mono,
  },
  plainDay: {
    color: colors.text,
    fontSize: 21,
    fontWeight: "700",
    marginTop: 12,
  },
  plainSubtext: {
    color: colors.textMuted,
    fontSize: 14,
    marginTop: 5,
  },
  plainDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 14,
  },
  plainBottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  plainVehicle: {
    color: colors.text,
    fontSize: 13.5,
  },
  plainReg: {
    color: colors.textFaint,
    fontSize: 12,
    fontFamily: fonts.mono,
  },

  // otp
  otpCard: {
    backgroundColor: colors.ink,
    borderRadius: 18,
    padding: 18,
  },
  otpTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  otpBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  otpBadgeText: {
    color: colors.warning,
    fontSize: 11.5,
    fontWeight: "700",
  },
  liveDotWarn: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.warning,
  },
  otpReg: {
    color: colors.textFaint,
    fontSize: 11.5,
    fontFamily: fonts.mono,
  },
  otpHeadline: {
    color: colors.surface,
    fontSize: 19,
    fontWeight: "700",
    marginTop: 16,
    lineHeight: 24,
  },
  otpSubtext: {
    color: colors.textFaint,
    fontSize: 13.5,
    marginTop: 5,
    lineHeight: 19,
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
    fontSize: 36,
    fontWeight: "700",
    letterSpacing: 6,
    fontFamily: fonts.mono,
  },
  otpHint: {
    color: colors.textFaint,
    fontSize: 12,
    marginTop: 8,
  },

  // live
  liveCard: {
    backgroundColor: colors.live,
    borderRadius: 18,
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
    gap: 7,
  },
  liveBadgeText: {
    color: colors.surface,
    fontSize: 12,
    fontWeight: "700",
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.liveDot,
  },
  liveReg: {
    color: colors.primarySoft,
    fontSize: 11.5,
    fontFamily: fonts.mono,
  },
  liveHeadline: {
    color: colors.surface,
    fontSize: 21,
    fontWeight: "700",
    marginTop: 16,
    lineHeight: 26,
  },
  liveSubtext: {
    color: colors.primarySoft,
    fontSize: 13.5,
    marginTop: 6,
  },

  // quota + wallet row
  summaryRow: {
    flexDirection: "row",
    gap: 12,
  },
  quotaCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
  },
  quotaCopy: {
    flex: 1,
  },
  quotaTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "600",
  },
  quotaSubtitle: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  walletCard: {
    width: 132,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 16,
  },
  walletTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "600",
  },
  walletAmount: {
    color: colors.text,
    fontSize: 19,
    fontWeight: "700",
    marginTop: 8,
    fontFamily: fonts.mono,
  },
  walletAction: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "600",
    marginTop: 8,
  },

  // quota empty banner
  quotaEmptyCard: {
    backgroundColor: colors.warningSoft,
    borderColor: colors.warningBorder,
  },
  quotaEmptyTitle: {
    color: colors.warning,
    fontSize: 14.5,
    fontWeight: "600",
  },
  quotaEmptyTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: "#F0DDB4",
    marginTop: 12,
    overflow: "hidden",
  },
  quotaEmptyBar: {
    height: "100%",
    backgroundColor: "#B26B00",
  },
  quotaEmptyText: {
    color: colors.warning,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 10,
  },

  sectionHeading: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "600",
  },
  link: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "600",
  },
});
