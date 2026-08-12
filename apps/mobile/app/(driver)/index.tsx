import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { forwardRef, useEffect, useRef, useState } from "react";
import {
  BackHandler,
  Linking,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  useCompleteTrip,
  useDriverArrive,
  useDriverDashboard,
  useReportIssue,
  useVerifyOtp,
} from "@/src/api/hooks";
import { Button } from "@/src/components/button";
import { Card } from "@/src/components/card";
import { ErrorState, LoadingState } from "@/src/components/states";
import { StatusPill } from "@/src/components/status-pill";
import { Screen } from "@/src/components/screen";
import { confirmAction, notify } from "@/src/lib/alerts";
import { errorMessage } from "@/src/lib/api";
import { bookingTime, hoursLabel } from "@/src/lib/format";
import { useAuthStore } from "@/src/store/auth";
import { colors, fonts, radius, spacing } from "@/src/theme";
import type { DriverTrip } from "@/src/types/api";

const LIVE_STATUSES = [
  "BOOKED",
  "DRIVER_ASSIGNED",
  "OTP_PENDING",
  "IN_PROGRESS",
  "ACTIVE",
  "REASSIGNED",
  "AT_RISK",
];

function effStatus(trip: DriverTrip) {
  return trip.effectiveStatus ?? trip.status;
}

function isVehicleDown(trip: DriverTrip) {
  const status = trip.effectiveVehicle.status;
  return status === "BREAKDOWN" || status === "MAINTENANCE" || status === "INACTIVE";
}

function useElapsedLabel(sinceIso: string | undefined) {
  const [, tick] = useState(0);

  useEffect(() => {
    if (!sinceIso) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [sinceIso]);

  if (!sinceIso) return "0:00:00";
  const sec = Math.max(0, Math.floor((Date.now() - new Date(sinceIso).getTime()) / 1000));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function DriverJobsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const { data, error, isError, isLoading, isRefetching, refetch } = useDriverDashboard();
  const timezone = user?.society.timezone ?? "Asia/Kolkata";

  if (isLoading) {
    return <LoadingState label="Loading your jobs..." />;
  }

  if (isError || !data) {
    return <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />;
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

  const all = [...data.today, ...data.upcoming]
    .filter((trip) => LIVE_STATUSES.includes(effStatus(trip)))
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  const activeJob = all.find((trip) => effStatus(trip) === "IN_PROGRESS" || effStatus(trip) === "ACTIVE");
  const otpJob = !activeJob ? all.find((trip) => effStatus(trip) === "OTP_PENDING") : undefined;
  const nextJob = !activeJob && !otpJob ? all[0] : undefined;
  const laterJobs = nextJob ? all.filter((trip) => trip.id !== nextJob.id) : all;

  const initials = (user?.name || "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  if (activeJob) {
    return <ActiveTripView trip={activeJob} onRefresh={refetch} />;
  }

  if (otpJob) {
    return <OtpEntryView trip={otpJob} onCancel={() => void refetch()} />;
  }

  return (
    <Screen
      scroll
      scrollProps={{
        refreshControl: (
          <RefreshControl refreshing={isRefetching} tintColor={colors.primary} onRefresh={() => void refetch()} />
        ),
      }}
    >
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.kicker}>ON DUTY · {(user?.society.name ?? "").toUpperCase()}</Text>
          <Text style={styles.title}>{user?.name}</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={confirmLogout} style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </Pressable>
      </View>

      {data.vehicle ? (
        <Pressable onPress={() => router.push("/(driver)/vehicle")}>
          <Card style={styles.vehicleRow}>
            <View style={styles.vehicleRowInfo}>
              <Text style={styles.vehicleRowName}>{data.vehicle.name}</Text>
              <Text style={styles.vehicleRowReg}>{data.vehicle.registrationNumber}</Text>
            </View>
            <StatusPillLike status={data.vehicle.status} />
          </Card>
        </Pressable>
      ) : null}

      {nextJob ? (
        <NextJobCard trip={nextJob} timezone={timezone} laterCount={laterJobs.length} />
      ) : (
        <Card style={styles.noJobsCard}>
          <View style={styles.noJobsBadge} />
          <Text style={styles.noJobsTitle}>No jobs assigned</Text>
          <Text style={styles.noJobsText}>
            The society office assigns trips about two hours before pickup. You will get an
            alert.
          </Text>
        </Card>
      )}

      {laterJobs.length > 0 ? (
        <View>
          <Text style={styles.sectionTitle}>{nextJob ? "Later" : "Your jobs"}</Text>
          <View style={{ gap: 10 }}>
            {laterJobs.map((trip) => (
              <TripRow key={trip.id} trip={trip} timezone={timezone} />
            ))}
          </View>
        </View>
      ) : null}
    </Screen>
  );
}

function NextJobCard({
  trip,
  timezone,
  laterCount,
}: {
  trip: DriverTrip;
  timezone: string;
  laterCount: number;
}) {
  const arrive = useDriverArrive(trip.id);
  const risk = isVehicleDown(trip) || effStatus(trip) === "AT_RISK";

  const handleArrive = async () => {
    if (arrive.isPending) return;
    try {
      await arrive.mutateAsync();
      notify("Arrived", "The resident's phone now shows a 6-digit code.");
    } catch (error) {
      notify("Could not mark arrival", errorMessage(error));
    }
  };

  const call = () => trip.user.phone && Linking.openURL(`tel:${trip.user.phone}`);

  return (
    <View style={styles.nextJobCard}>
      <View style={styles.nextJobTopRow}>
        <Text style={styles.nextJobBadge}>NEXT JOB</Text>
        <Text style={styles.nextJobId}>{trip.id.slice(0, 10)}</Text>
      </View>

      {risk ? (
        <View style={styles.riskBanner}>
          <Text style={styles.riskBannerTitle}>This EV is flagged · {trip.effectiveVehicle.name}</Text>
          <Text style={styles.riskBannerText}>
            Wait for the office to reassign a reserve EV before you drive to the pickup point.
          </Text>
        </View>
      ) : null}

      <Text style={styles.nextJobTime}>
        {bookingTime(trip.startTime, timezone)}
        <Text style={styles.nextJobTimeEnd}> → {bookingTime(trip.endTime, timezone)}</Text>
      </Text>

      <View style={styles.nextJobDivider} />

      <View style={styles.nextJobResidentRow}>
        <View style={styles.nextJobFlatBadge}>
          <Text style={styles.nextJobFlatBadgeText}>{trip.flat.number}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.nextJobResidentName}>{trip.user.name}</Text>
          <Text style={styles.nextJobResidentSub}>
            Flat {trip.flat.number} · {trip.effectiveVehicle.name}
          </Text>
        </View>
      </View>

      <View style={styles.nextJobActionsRow}>
        <Pressable accessibilityRole="button" onPress={call} style={styles.nextJobActionButton}>
          <Text style={styles.nextJobActionText}>Call resident</Text>
        </Pressable>
      </View>

      {laterCount > 0 ? (
        <View style={styles.laterRow}>
          <Text style={styles.laterLabel}>Later</Text>
          <Text style={styles.laterCount}>{laterCount} more today</Text>
        </View>
      ) : null}

      {risk ? (
        <View style={styles.disabledCta}>
          <Text style={styles.disabledCtaText}>Waiting for a working EV</Text>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          disabled={arrive.isPending}
          onPress={() => void handleArrive()}
          style={[styles.arriveButton, arrive.isPending && styles.disabled]}
        >
          <Text style={styles.arriveButtonText}>
            {arrive.isPending ? "Marking arrival..." : "I have arrived"}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

function OtpEntryView({ trip, onCancel }: { trip: DriverTrip; onCancel: () => void }) {
  const [otp, setOtp] = useState("");
  const inputRef = useRef<TextInput>(null);
  const verify = useVerifyOtp(trip.id);
  const reportIssue = useReportIssue(trip.id);
  const focusInput = () => inputRef.current?.focus();

  useEffect(() => {
    const timer = setTimeout(focusInput, 350);
    return () => clearTimeout(timer);
  }, []);

  // This screen is a visual state within the Jobs tab, not a real route, so
  // Android's hardware back button doesn't know to "go back" to the jobs
  // list on its own — send it through the same handler as the in-app back arrow.
  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      onCancel();
      return true;
    });
    return () => subscription.remove();
  }, [onCancel]);

  const handleVerify = async () => {
    if (verify.isPending || otp.length !== 6) return;
    try {
      await verify.mutateAsync(otp);
      setOtp("");
      notify("Trip started", `The ride for ${trip.flat.number} is now in progress.`);
    } catch (error) {
      notify("Verification failed", errorMessage(error));
    }
  };

  const confirmIssue = () => {
    confirmAction({
      title: "Report vehicle breakdown?",
      message: `${trip.effectiveVehicle.name} (${trip.effectiveVehicle.registrationNumber}) will be marked BREAKDOWN and the office will arrange a reserve EV.`,
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

  const call = () => trip.user.phone && Linking.openURL(`tel:${trip.user.phone}`);
  const boxes = [0, 1, 2, 3, 4, 5];

  return (
    <Screen scroll style={{ gap: spacing.md }}>
      <View style={styles.otpHeaderRow}>
        <Pressable accessibilityRole="button" onPress={onCancel} style={styles.backButton}>
          <Text style={styles.backButtonText}>‹</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.otpHeaderTitle}>
            {trip.user.name} · {trip.flat.number}
          </Text>
          <Text style={styles.otpHeaderSubtitle}>
            {bookingTime(trip.startTime, "Asia/Kolkata")} · {trip.effectiveVehicle.name}
          </Text>
        </View>
      </View>

      <View>
        <Text style={styles.otpTitle}>Ask for the 6-digit code</Text>
        <Text style={styles.otpSubtitle}>
          It is on the resident&apos;s home screen. The trip starts the moment this is verified.
        </Text>
      </View>

      <Pressable accessibilityRole="button" onPress={focusInput} style={styles.otpBoxRow}>
        {boxes.map((i) => (
          <View
            key={i}
            style={[styles.otpDigitBox, otp.length === i && styles.otpDigitBoxActive]}
          >
            <Text style={styles.otpDigitText}>{otp[i] ?? ""}</Text>
          </View>
        ))}
      </Pressable>
      <TextInputBridge
        ref={inputRef}
        value={otp}
        onChangeText={(v) => setOtp(v.replace(/\D/g, "").slice(0, 6))}
      />

      {verify.isError ? (
        <View style={styles.otpErrorBanner}>
          <Text style={styles.otpErrorText}>{errorMessage(verify.error)}</Text>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        disabled={otp.length !== 6 || verify.isPending}
        onPress={() => void handleVerify()}
        style={[styles.verifyButton, (otp.length !== 6 || verify.isPending) && styles.disabled]}
      >
        <Text style={styles.verifyButtonText}>
          {verify.isPending ? "Verifying..." : "Verify and start trip"}
        </Text>
      </Pressable>

      <Card style={{ gap: 10 }}>
        <Text style={styles.wrongTitle}>Something wrong?</Text>
        <Text style={styles.wrongText}>
          Call the resident first. If the EV has a problem, report it — the society will
          arrange a reserve vehicle.
        </Text>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Pressable accessibilityRole="button" onPress={call} style={styles.wrongCallButton}>
            <Text style={styles.wrongCallText}>Call</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={confirmIssue} style={styles.wrongReportButton}>
            <Text style={styles.wrongReportText}>Report EV issue</Text>
          </Pressable>
        </View>
      </Card>
    </Screen>
  );
}

const TextInputBridge = forwardRef<
  TextInput,
  { value: string; onChangeText: (value: string) => void }
>(function TextInputBridge({ value, onChangeText }, ref) {
  return (
    <TextInput
      ref={ref}
      autoFocus
      keyboardType="number-pad"
      maxLength={6}
      onChangeText={onChangeText}
      style={{ height: 0, width: 0, opacity: 0 }}
      value={value}
    />
  );
});

function ActiveTripView({ trip, onRefresh }: { trip: DriverTrip; onRefresh: () => void }) {
  const complete = useCompleteTrip(trip.id);
  const reportIssue = useReportIssue(trip.id);
  const elapsed = useElapsedLabel(trip.startTime);

  // Same reasoning as OtpEntryView: there's no sensible "back" destination
  // mid-ride, so swallow the hardware back press instead of letting Android
  // navigate the driver out of an active trip by accident.
  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => subscription.remove();
  }, []);

  const confirmEnd = () => {
    confirmAction({
      title: "Complete this trip?",
      message: "Ends the ride, applies any penalty and creates the invoice. It cannot be undone.",
      confirmLabel: "End trip",
      cancelLabel: "Still driving",
      onConfirm: async () => {
        try {
          await complete.mutateAsync();
          notify("Trip completed", "The invoice has been generated.");
          onRefresh();
        } catch (error) {
          notify("Could not end trip", errorMessage(error));
        }
      },
    });
  };

  const confirmIssue = () => {
    confirmAction({
      title: "Report vehicle breakdown?",
      message: `${trip.effectiveVehicle.name} (${trip.effectiveVehicle.registrationNumber}) will be marked BREAKDOWN.`,
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
    <SafeAreaView style={styles.activeContainer} edges={["top", "left", "right", "bottom"]}>
      <StatusBar style="light" />
      <View style={styles.activeBody}>
        <View style={styles.activeLiveRow}>
          <View style={styles.activeLiveDot} />
          <Text style={styles.activeLiveLabel}>TRIP IN PROGRESS</Text>
        </View>

        <View>
          <Text style={styles.activeElapsed}>{elapsed}</Text>
          <Text style={styles.activeElapsedSub}>
            Due back {bookingTime(trip.endTime, "Asia/Kolkata")} · booked {hoursLabel(
              Math.round((new Date(trip.endTime).getTime() - new Date(trip.startTime).getTime()) / 60000),
            )}
          </Text>
        </View>

        <View style={styles.activeInfoCard}>
          <View style={styles.activeInfoRow}>
            <Text style={styles.activeInfoLabel}>Resident</Text>
            <Text style={styles.activeInfoValue}>
              {trip.user.name} · {trip.flat.number}
            </Text>
          </View>
          <View style={styles.activeInfoRow}>
            <Text style={styles.activeInfoLabel}>Vehicle</Text>
            <Text style={[styles.activeInfoValue, { fontFamily: fonts.mono }]}>
              {trip.effectiveVehicle.registrationNumber}
            </Text>
          </View>
          <View style={styles.activeInfoRow}>
            <Text style={styles.activeInfoLabel}>Booked window</Text>
            <Text style={styles.activeInfoValue}>
              {bookingTime(trip.startTime, "Asia/Kolkata")} – {bookingTime(trip.endTime, "Asia/Kolkata")}
            </Text>
          </View>
        </View>

        <View style={styles.activeWarnCard}>
          <Text style={styles.activeWarnTitle}>Ending after {bookingTime(trip.endTime, "Asia/Kolkata")}</Text>
          <Text style={styles.activeWarnText}>
            A late-return penalty is charged to the resident for every started hour. End the
            trip as soon as the EV is parked.
          </Text>
        </View>

        <Pressable accessibilityRole="button" onPress={confirmIssue} style={styles.activeReportButton}>
          <Text style={styles.activeReportText}>Report EV issue</Text>
        </Pressable>
      </View>

      <View style={styles.activeFooter}>
        <Button
          label={complete.isPending ? "Ending trip..." : "End trip"}
          loading={complete.isPending}
          onPress={confirmEnd}
          style={{ backgroundColor: colors.ink }}
        />
        <Text style={styles.activeFooterHint}>
          Ends the ride, applies any penalty and creates the invoice.
        </Text>
      </View>
    </SafeAreaView>
  );
}

function TripRow({ trip, timezone }: { trip: DriverTrip; timezone: string }) {
  return (
    <Card style={{ gap: 5 }}>
      <View style={styles.tripRowTop}>
        <Text style={styles.tripRowTitle}>
          {trip.flat.number} · {trip.user.name}
        </Text>
        <StatusPill status={effStatus(trip)} />
      </View>
      <Text style={styles.tripRowSubtitle}>
        {bookingTime(trip.startTime, timezone)} – {bookingTime(trip.endTime, timezone)} ·{" "}
        {trip.effectiveVehicle.name}
      </Text>
    </Card>
  );
}

function StatusPillLike({ status }: { status: string }) {
  const ok = status === "AVAILABLE";
  return (
    <View
      style={[
        styles.vehiclePill,
        { backgroundColor: ok ? colors.primarySoft : colors.dangerSoft },
      ]}
    >
      <Text style={{ color: ok ? colors.primary : colors.danger, fontSize: 11.5, fontWeight: "600" }}>
        {status}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerCopy: { flex: 1 },
  kicker: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: 0.6,
    fontFamily: fonts.mono,
  },
  title: {
    color: colors.text,
    fontSize: 23,
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
  avatarText: { color: colors.primary, fontSize: 15, fontWeight: "700" },

  vehicleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 13,
    paddingHorizontal: 15,
  },
  vehicleRowInfo: {},
  vehicleRowName: { color: colors.text, fontSize: 14, fontWeight: "600" },
  vehicleRowReg: { color: colors.textMuted, fontSize: 12, marginTop: 3, fontFamily: fonts.mono },
  vehiclePill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },

  noJobsCard: { alignItems: "center", gap: 8, paddingVertical: 26 },
  noJobsBadge: { width: 56, height: 56, borderRadius: 16, backgroundColor: colors.surfaceMuted },
  noJobsTitle: { color: colors.text, fontSize: 17, fontWeight: "700", marginTop: 4 },
  noJobsText: {
    color: colors.textMuted,
    fontSize: 13.5,
    lineHeight: 19,
    textAlign: "center",
    maxWidth: 260,
  },

  sectionTitle: { color: colors.text, fontSize: 14, fontWeight: "600", marginBottom: 10 },

  nextJobCard: {
    backgroundColor: colors.ink,
    borderRadius: radius.xl,
    padding: 20,
  },
  nextJobTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  nextJobBadge: {
    color: colors.ink,
    backgroundColor: colors.liveDot,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 5,
    fontSize: 11.5,
    fontWeight: "600",
    overflow: "hidden",
  },
  nextJobId: { color: colors.textFaint, fontSize: 12, fontFamily: fonts.mono },
  riskBanner: {
    backgroundColor: "#3A2E12",
    borderWidth: 1,
    borderColor: "#6B5420",
    borderRadius: radius.md,
    padding: 13,
    marginTop: 14,
  },
  riskBannerTitle: { color: colors.accent, fontSize: 13.5, fontWeight: "600" },
  riskBannerText: { color: "#D8C79A", fontSize: 12.5, lineHeight: 18, marginTop: 4 },
  nextJobTime: {
    color: colors.surface,
    fontSize: 29,
    fontWeight: "700",
    marginTop: 18,
    letterSpacing: -0.4,
    fontFamily: fonts.mono,
  },
  nextJobTimeEnd: { color: colors.textFaint, fontSize: 19, fontWeight: "400" },
  nextJobDivider: { height: 1, backgroundColor: colors.inkBorder, marginVertical: 18 },
  nextJobResidentRow: { flexDirection: "row", alignItems: "center", gap: 13 },
  nextJobFlatBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.inkBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  nextJobFlatBadgeText: { color: colors.primarySoft, fontSize: 15, fontWeight: "600" },
  nextJobResidentName: { color: colors.surface, fontSize: 17, fontWeight: "600" },
  nextJobResidentSub: { color: colors.textFaint, fontSize: 13.5, marginTop: 2 },
  nextJobActionsRow: { flexDirection: "row", gap: 10, marginTop: 16 },
  nextJobActionButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: radius.md,
    backgroundColor: colors.inkBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  nextJobActionText: { color: colors.surface, fontSize: 14.5, fontWeight: "600" },
  laterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 14,
  },
  laterLabel: { color: colors.textMuted, fontSize: 14, fontWeight: "600" },
  laterCount: { color: colors.textFaint, fontSize: 13.5 },
  disabledCta: {
    marginTop: 16,
    minHeight: 58,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  disabledCtaText: { color: colors.textFaint, fontSize: 17, fontWeight: "600" },
  arriveButton: {
    marginTop: 16,
    minHeight: 58,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  arriveButtonText: { color: colors.surface, fontSize: 17, fontWeight: "600" },
  disabled: { opacity: 0.6 },

  tripRowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  tripRowTitle: { color: colors.text, fontSize: 14.5, fontWeight: "600" },
  tripRowSubtitle: { color: colors.textMuted, fontSize: 13 },

  otpHeaderRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  backButtonText: { color: colors.text, fontSize: 17, fontWeight: "600" },
  otpHeaderTitle: { color: colors.text, fontSize: 16, fontWeight: "600" },
  otpHeaderSubtitle: { color: colors.textMuted, fontSize: 12.5, marginTop: 2 },
  otpTitle: { color: colors.text, fontSize: 24, fontWeight: "700", letterSpacing: -0.3 },
  otpSubtitle: { color: colors.textMuted, fontSize: 14, lineHeight: 20, marginTop: 6 },
  otpBoxRow: { flexDirection: "row", gap: 9 },
  otpDigitBox: {
    flex: 1,
    height: 64,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  otpDigitBoxActive: { borderColor: colors.text, borderWidth: 1.5 },
  otpDigitText: { color: colors.text, fontSize: 26, fontWeight: "700", fontFamily: fonts.mono },
  otpErrorBanner: {
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    borderRadius: radius.md,
    padding: 13,
  },
  otpErrorText: { color: colors.danger, fontSize: 13, lineHeight: 18, fontWeight: "500" },
  verifyButton: {
    minHeight: 54,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  verifyButtonText: { color: colors.surface, fontSize: 16, fontWeight: "600" },
  wrongTitle: { color: colors.text, fontSize: 14, fontWeight: "600" },
  wrongText: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  wrongCallButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  wrongCallText: { color: colors.text, fontSize: 14, fontWeight: "600" },
  wrongReportButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  wrongReportText: { color: colors.danger, fontSize: 14, fontWeight: "600" },

  activeContainer: { flex: 1, backgroundColor: colors.live },
  activeBody: { flex: 1, padding: 18, gap: 16 },
  activeLiveRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  activeLiveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.liveDot },
  activeLiveLabel: { color: colors.surface, fontSize: 12, fontWeight: "600", letterSpacing: 0.6 },
  activeElapsed: { color: colors.surface, fontSize: 44, fontWeight: "700", fontFamily: fonts.mono },
  activeElapsedSub: { color: colors.primarySoft, fontSize: 14, marginTop: 8 },
  activeInfoCard: {
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: radius.lg,
    padding: 16,
    gap: 12,
  },
  activeInfoRow: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
  activeInfoLabel: { color: colors.primarySoft, fontSize: 13.5 },
  activeInfoValue: { color: colors.surface, fontSize: 13.5, fontWeight: "600" },
  activeWarnCard: {
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: radius.lg,
    padding: 16,
  },
  activeWarnTitle: { color: colors.surface, fontSize: 14, fontWeight: "600" },
  activeWarnText: { color: colors.primarySoft, fontSize: 13, lineHeight: 19, marginTop: 5 },
  activeReportButton: {
    minHeight: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  activeReportText: { color: colors.surface, fontSize: 14, fontWeight: "600" },
  activeFooter: { padding: 18, backgroundColor: colors.surface, gap: 9 },
  activeFooterHint: { color: colors.textFaint, fontSize: 12, textAlign: "center" },
});
