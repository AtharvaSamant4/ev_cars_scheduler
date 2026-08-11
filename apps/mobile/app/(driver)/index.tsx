import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { RefreshControl, StyleSheet, Text, View } from "react-native";

import { useDriverDashboard, useVerifyOtp, useDriverArrive, useCompleteTrip, useReportIssue } from "@/src/api/hooks";
import { Button } from "@/src/components/button";
import { Card } from "@/src/components/card";
import { Screen } from "@/src/components/screen";
import { TextField } from "@/src/components/text-field";
import { errorMessage } from "@/src/lib/api";
import { confirmAction, notify } from "@/src/lib/alerts";
import { bookingDate, bookingTime, statusLabel } from "@/src/lib/format";
import { useAuthStore } from "@/src/store/auth";
import { colors, spacing, radius } from "@/src/theme";
import type { DriverTrip } from "@/src/types/api";

export default function DriverDashboardScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const { data, error, isError, isLoading, isRefetching, refetch } = useDriverDashboard();
  const timezone = user?.society.timezone ?? "Asia/Kolkata";

  if (isLoading) {
    return (
      <Screen style={styles.center}>
        <Text style={styles.loading}>Loading dashboard...</Text>
      </Screen>
    );
  }

  if (isError || !data) {
    return (
      <Screen style={styles.center}>
        <Card style={styles.card}>
          <Text style={styles.title}>Unable to load driver dashboard</Text>
          <Text style={styles.subtitle}>{errorMessage(error)}</Text>
          <Button label="Try Again" onPress={() => void refetch()} />
        </Card>
      </Screen>
    );
  }

  const confirmLogout = () => {
    confirmAction({
      title: "Log out?",
      message: "You will need your phone number and password again.",
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

  return (
    <Screen 
      scroll 
      style={styles.screen}
      scrollProps={{
        refreshControl: (
          <RefreshControl
            refreshing={isRefetching}
            tintColor={colors.primary}
            onRefresh={() => void refetch()}
          />
        ),
      }}
    >
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.kicker}>{user?.society.name}</Text>
          <Text style={styles.title}>Hello, {user?.name}</Text>
          <Text style={styles.subtitle}>Driver Profile</Text>
        </View>
        <Button label="Logout" variant="secondary" onPress={confirmLogout} />
      </View>

      <Card style={styles.card}>
        <Text style={styles.title}>Default Assigned Vehicle</Text>
        {data.vehicle ? (
          <View>
            <Text style={styles.subtitle}>{data.vehicle.name}</Text>
            <Text style={styles.kicker}>
              {data.vehicle.registrationNumber} · {data.vehicle.status}
            </Text>
          </View>
        ) : (
          <Text style={styles.subtitle}>No vehicle assigned</Text>
        )}
      </Card>

      <Text style={styles.sectionTitle}>{"Today's Trips"}</Text>
      {data.today.length > 0 ? (
        data.today.map((trip) => (
          <TripCard key={trip.id} timezone={timezone} trip={trip} />
        ))
      ) : (
        <Card style={styles.card}>
          <Text style={styles.subtitle}>No trips scheduled for today</Text>
        </Card>
      )}

      <Text style={styles.sectionTitle}>Upcoming Trips</Text>
      {data.upcoming.length > 0 ? (
        data.upcoming.map((trip) => (
          <Card key={trip.id} style={styles.card}>
            <View style={styles.row}>
              <View style={styles.tripCopy}>
                <Text style={styles.time}>
                  {bookingDate(trip.startTime, timezone)} ·{" "}
                  {bookingTime(trip.startTime, timezone)}
                </Text>
                <Text style={styles.subtitle}>
                  Resident: {trip.user.name} (Flat {trip.flat.number})
                </Text>
                <Text style={styles.kicker}>
                  EV: {trip.effectiveVehicle.name} ({trip.effectiveVehicle.registrationNumber})
                </Text>
                <Text style={styles.kicker}>
                  Status: {statusLabel(trip.effectiveStatus ?? trip.status)}
                </Text>
              </View>
            </View>
          </Card>
        ))
      ) : (
        <Card style={styles.card}>
          <Text style={styles.subtitle}>No upcoming trips scheduled</Text>
        </Card>
      )}
    </Screen>
  );
}

function TripCard({ trip, timezone }: { trip: DriverTrip; timezone: string }) {
  const [otp, setOtp] = useState("");
  const [completionPromptOpen, setCompletionPromptOpen] = useState(false);
  const [issuePromptOpen, setIssuePromptOpen] = useState(false);
  const arriveMutation = useDriverArrive(trip.id);
  const verifyMutation = useVerifyOtp(trip.id);
  const completeMutation = useCompleteTrip(trip.id);
  const reportIssueMutation = useReportIssue(trip.id);
  const status = trip.effectiveStatus ?? trip.status;
  const canReportIssue =
    status === "BOOKED" ||
    status === "DRIVER_ASSIGNED" ||
    status === "OTP_PENDING" ||
    status === "REASSIGNED" ||
    status === "AT_RISK";
  const issueUnavailable =
    trip.effectiveVehicle.status === "BREAKDOWN" ||
    trip.effectiveVehicle.status === "MAINTENANCE" ||
    trip.effectiveVehicle.status === "INACTIVE";

  const handleArrive = async () => {
    if (arriveMutation.isPending) return;

    try {
      await arriveMutation.mutateAsync();
      notify("Arrived", "OTP generated for resident.");
    } catch (error) {
      notify("Action Failed", errorMessage(error));
    }
  };

  const handleVerify = async () => {
    if (verifyMutation.isPending) return;

    try {
      await verifyMutation.mutateAsync(otp);
      notify("Trip Started", "OTP verified successfully!");
    } catch (error) {
      notify("Verification Failed", errorMessage(error));
    }
  };

  const confirmCompletion = () => {
    if (completeMutation.isPending || completionPromptOpen) return;

    setCompletionPromptOpen(true);
    confirmAction({
      title: "Complete this trip?",
      message:
        "This records the return time, applies any late-return penalty, and creates the final invoice. It cannot be undone.",
      confirmLabel: "Complete trip",
      cancelLabel: "Keep trip active",
      onCancel: () => setCompletionPromptOpen(false),
      onConfirm: async () => {
        try {
          await completeMutation.mutateAsync();
          notify("Trip Ended", "Trip successfully completed.");
        } catch (error) {
          notify("Action Failed", errorMessage(error));
        } finally {
          setCompletionPromptOpen(false);
        }
      },
    });
  };

  const confirmIssueReport = () => {
    if (reportIssueMutation.isPending || issuePromptOpen || issueUnavailable) {
      return;
    }

    setIssuePromptOpen(true);
    confirmAction({
      title: "Report vehicle breakdown?",
      message: `${trip.effectiveVehicle.name} (${trip.effectiveVehicle.registrationNumber}) is the vehicle for this trip. Reporting it will mark this exact EV as BREAKDOWN and alert the admin to arrange a reserve vehicle.`,
      confirmLabel: "Report breakdown",
      cancelLabel: "Do not report",
      destructive: true,
      onCancel: () => setIssuePromptOpen(false),
      onConfirm: async () => {
        try {
          await reportIssueMutation.mutateAsync();
          notify(
            "Breakdown Reported",
            "The trip's vehicle was marked as BREAKDOWN. Contact the admin for reserve reassignment.",
          );
        } catch (error) {
          notify("Action Failed", errorMessage(error));
        } finally {
          setIssuePromptOpen(false);
        }
      },
    });
  };

  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <View style={styles.tripCopy}>
          <Text style={styles.time}>
            {bookingTime(trip.startTime, timezone)}
            {" - "}
            {bookingTime(trip.endTime, timezone)}
          </Text>
          <Text style={styles.subtitle}>
            Resident: {trip.user.name} (Flat {trip.flat.number})
          </Text>
          <Text style={styles.kicker}>Phone: {trip.user.phone}</Text>
          <Text style={styles.kicker}>
            EV: {trip.effectiveVehicle.name} ({trip.effectiveVehicle.registrationNumber})
          </Text>
          <Text style={styles.kicker}>Status: {statusLabel(status)}</Text>
        </View>
      </View>

      {(status === "IN_PROGRESS" || status === "ACTIVE") && (
        <View style={styles.otpSection}>
          <View style={styles.activeBadge}>
            <Text style={styles.activeText}>Trip In Progress</Text>
          </View>
          <Button
            label="End Trip"
            variant="primary"
            loading={completeMutation.isPending}
            disabled={completeMutation.isPending || completionPromptOpen}
            onPress={confirmCompletion}
          />
        </View>
      )}

      {status === "OTP_PENDING" && (
        <View style={styles.otpSection}>
          <TextField
            label="Verification OTP"
            placeholder="Enter 6-digit OTP"
            value={otp}
            onChangeText={(value) => setOtp(value.replace(/\D/g, ""))}
            keyboardType="number-pad"
            maxLength={6}
          />
          <Button
            label="Verify & Start"
            loading={verifyMutation.isPending}
            disabled={otp.length !== 6 || verifyMutation.isPending}
            onPress={handleVerify}
          />
        </View>
      )}

      {(status === "DRIVER_ASSIGNED" ||
        status === "BOOKED" ||
        status === "REASSIGNED") && (
        <View style={styles.otpSection}>
          <Button
            label="I Have Arrived"
            variant="secondary"
            loading={arriveMutation.isPending}
            disabled={arriveMutation.isPending}
            onPress={handleArrive}
          />
        </View>
      )}

      {canReportIssue ? (
        <View style={styles.otpSection}>
          <Button
            label={
              issueUnavailable ? "Vehicle Already Unavailable" : "Report EV Breakdown"
            }
            variant="danger"
            loading={reportIssueMutation.isPending}
            disabled={
              issueUnavailable || reportIssueMutation.isPending || issuePromptOpen
            }
            onPress={confirmIssueReport}
          />
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loading: {
    color: colors.textMuted,
    fontSize: 16,
  },
  screen: {
    padding: spacing.md,
    gap: spacing.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  headerCopy: {
    flex: 1,
  },
  card: {
    gap: spacing.sm,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: colors.text,
    marginTop: spacing.md,
  },
  subtitle: {
    fontSize: 16,
    color: colors.text,
  },
  kicker: {
    fontSize: 14,
    color: colors.textMuted,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  tripCopy: {
    flex: 1,
  },
  time: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.primary,
  },
  footer: {
    marginTop: spacing.xl,
    paddingBottom: spacing.xl,
  },
  otpSection: {
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  activeBadge: {
    backgroundColor: colors.successSoft,
    padding: spacing.sm,
    borderRadius: radius.md,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  activeText: {
    color: colors.success,
    fontWeight: "800",
  },
});
