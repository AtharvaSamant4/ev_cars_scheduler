import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { RefreshControl, StyleSheet, Text, View } from "react-native";

import { useDriverDashboard, useVerifyOtp, useCompleteTrip, useReportIssue } from "@/src/api/hooks";
import { Button } from "@/src/components/button";
import { Card } from "@/src/components/card";
import { Screen } from "@/src/components/screen";
import { TextField } from "@/src/components/text-field";
import { errorMessage } from "@/src/lib/api";
import { confirmAction, notify } from "@/src/lib/alerts";
import { useAuthStore } from "@/src/store/auth";
import { colors, spacing, radius } from "@/src/theme";

export default function DriverDashboardScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const { data, isLoading, isRefetching, refetch } = useDriverDashboard();
  const reportIssueMutation = useReportIssue();

  if (isLoading) {
    return (
      <Screen style={styles.center}>
        <Text style={styles.loading}>Loading dashboard...</Text>
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
        <Text style={styles.title}>Assigned Vehicle</Text>
        {data?.vehicle ? (
          <View style={{ gap: spacing.md }}>
            <View>
              <Text style={styles.subtitle}>{data.vehicle.name}</Text>
              <Text style={styles.kicker}>
                {data.vehicle.registrationNumber}
              </Text>
            </View>
            <Button
              label="Report Issue (Breakdown)"
              variant="danger"
              loading={reportIssueMutation.isPending}
              disabled={reportIssueMutation.isPending || data.vehicle.status === "MAINTENANCE"}
              onPress={async () => {
                try {
                  await reportIssueMutation.mutateAsync();
                  notify("Issue Reported", "Vehicle marked for maintenance. Contact admin for a reserve vehicle.");
                } catch (error) {
                  notify("Action Failed", errorMessage(error));
                }
              }}
            />
          </View>
        ) : (
          <Text style={styles.subtitle}>No vehicle assigned</Text>
        )}
      </Card>

      <Text style={styles.sectionTitle}>Today's Trips</Text>
      {data?.today?.length > 0 ? (
        data.today.map((trip: any) => <TripCard key={trip.id} trip={trip} />)
      ) : (
        <Card style={styles.card}>
          <Text style={styles.subtitle}>No trips scheduled for today</Text>
        </Card>
      )}

      <Text style={styles.sectionTitle}>Upcoming Trips</Text>
      {data?.upcoming?.length > 0 ? (
        data.upcoming.map((trip: any) => (
          <Card key={trip.id} style={styles.card}>
            <View style={styles.row}>
              <View>
                <Text style={styles.time}>
                  {new Date(trip.startTime).toLocaleString([], {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Text>
                <Text style={styles.subtitle}>
                  Resident: {trip.user.name} (Flat {trip.flat.number})
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

function TripCard({ trip }: { trip: any }) {
  const [otp, setOtp] = useState("");
  const verifyMutation = useVerifyOtp(trip.id);
  const completeMutation = useCompleteTrip(trip.id);

  const handleVerify = async () => {
    try {
      await verifyMutation.mutateAsync(otp);
      notify("Trip Started", "OTP verified successfully!");
    } catch (error) {
      notify("Verification Failed", errorMessage(error));
    }
  };

  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <View>
          <Text style={styles.time}>
            {new Date(trip.startTime).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
            {" - "}
            {new Date(trip.endTime).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
          <Text style={styles.subtitle}>
            Resident: {trip.user.name} (Flat {trip.flat.number})
          </Text>
          <Text style={styles.kicker}>Phone: {trip.user.phone}</Text>
        </View>
      </View>

      {trip.status === "ACTIVE" && (
        <View style={styles.otpSection}>
          <View style={styles.activeBadge}>
            <Text style={styles.activeText}>Trip In Progress</Text>
          </View>
          <Button
            label="End Trip"
            variant="primary"
            loading={completeMutation.isPending}
            disabled={completeMutation.isPending}
            onPress={async () => {
              try {
                await completeMutation.mutateAsync();
                notify("Trip Ended", "Trip successfully completed.");
              } catch (error) {
                notify("Action Failed", errorMessage(error));
              }
            }}
          />
        </View>
      )}

      {trip.status === "BOOKED" && (
        <View style={styles.otpSection}>
          <TextField
            label="Verification OTP"
            placeholder="Enter 6-digit OTP"
            value={otp}
            onChangeText={setOtp}
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
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: {
    padding: spacing.md,
    gap: spacing.md,
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
