import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";

import { useDriverDashboard, useReportIssue } from "@/src/api/hooks";
import { Card } from "@/src/components/card";
import { ErrorState, LoadingState } from "@/src/components/states";
import { Screen } from "@/src/components/screen";
import { confirmAction, notify } from "@/src/lib/alerts";
import { errorMessage } from "@/src/lib/api";
import { colors, fonts, radius } from "@/src/theme";

const LIVE_STATUSES = [
  "BOOKED",
  "DRIVER_ASSIGNED",
  "OTP_PENDING",
  "IN_PROGRESS",
  "ACTIVE",
  "REASSIGNED",
  "AT_RISK",
];

export default function DriverVehicleScreen() {
  const { data, error, isError, isLoading, isRefetching, refetch } = useDriverDashboard();

  if (isLoading) {
    return <LoadingState label="Loading your vehicle..." />;
  }

  if (isError || !data) {
    return <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />;
  }

  const contextTrip = [...data.today, ...data.upcoming].find((trip) =>
    LIVE_STATUSES.includes(trip.effectiveStatus ?? trip.status),
  );

  return (
    <Screen
      scroll
      scrollProps={{
        refreshControl: (
          <RefreshControl refreshing={isRefetching} tintColor={colors.primary} onRefresh={() => void refetch()} />
        ),
      }}
    >
      <Text style={styles.title}>My vehicle</Text>

      {data.vehicle ? (
        <VehicleCard
          name={data.vehicle.name}
          registration={data.vehicle.registrationNumber}
          status={data.vehicle.status}
          contextBookingId={contextTrip?.id}
        />
      ) : (
        <Card>
          <Text style={styles.emptyText}>No vehicle is currently assigned to you.</Text>
        </Card>
      )}
    </Screen>
  );
}

function VehicleCard({
  name,
  registration,
  status,
  contextBookingId,
}: {
  name: string;
  registration: string;
  status: string;
  contextBookingId: string | undefined;
}) {
  const reportIssue = useReportIssue(contextBookingId ?? "");
  const ok = status === "AVAILABLE";

  const confirmBreakdown = () => {
    if (!contextBookingId) return;
    confirmAction({
      title: `Report ${name} as broken down?`,
      message: `This marks ${registration} unavailable society-wide and alerts the office to arrange a reserve EV.`,
      confirmLabel: "Report breakdown",
      cancelLabel: "Not now",
      destructive: true,
      onConfirm: async () => {
        try {
          await reportIssue.mutateAsync();
          notify("Breakdown reported", "The office has been notified.");
        } catch (error) {
          notify("Could not report issue", errorMessage(error));
        }
      },
    });
  };

  return (
    <>
      <Card style={styles.card}>
        <View
          style={[
            styles.pill,
            { backgroundColor: ok ? colors.primarySoft : colors.dangerSoft },
          ]}
        >
          <Text style={{ color: ok ? colors.primary : colors.danger, fontSize: 11.5, fontWeight: "600" }}>
            {status}
          </Text>
        </View>
        <Text style={styles.vehicleName}>{name}</Text>
        <Text style={styles.vehicleReg}>{registration}</Text>
        {!ok ? (
          <View style={styles.brokenBanner}>
            <Text style={styles.brokenText}>
              This EV is currently marked {status.toLowerCase()}. The society office has been
              notified and is reassigning affected bookings.
            </Text>
          </View>
        ) : null}
      </Card>

      {ok ? (
        <Card style={{ gap: 10 }}>
          <Text style={styles.reportTitle}>Report a problem</Text>
          <Text style={styles.reportText}>
            Use this only if the EV cannot be driven. It becomes unavailable society-wide and
            affected bookings are flagged for the office.
          </Text>
          {contextBookingId ? (
            <Pressable onPress={confirmBreakdown} style={styles.reportButton}>
              <Text style={styles.reportButtonText}>Report breakdown</Text>
            </Pressable>
          ) : (
            <Text style={styles.reportDisabledText}>
              You need an active or upcoming job to report an issue.
            </Text>
          )}
        </Card>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
  },
  card: {
    gap: 0,
    padding: 20,
  },
  pill: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  vehicleName: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "700",
    marginTop: 14,
  },
  vehicleReg: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 5,
    fontFamily: fonts.mono,
  },
  brokenBanner: {
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    padding: 13,
    marginTop: 16,
  },
  brokenText: {
    color: "#8A413B",
    fontSize: 13,
    lineHeight: 19,
  },
  reportTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "600",
  },
  reportText: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  reportButton: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  reportButtonText: {
    color: colors.danger,
    fontSize: 14.5,
    fontWeight: "600",
  },
  reportDisabledText: {
    color: colors.textFaint,
    fontSize: 12.5,
  },
});
