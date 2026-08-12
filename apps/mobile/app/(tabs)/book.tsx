import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import {
  useCheckAvailability,
  useCreateBooking,
  useDashboard,
} from "@/src/api/hooks";
import { Button } from "@/src/components/button";
import { Card } from "@/src/components/card";
import { Screen } from "@/src/components/screen";
import { errorMessage } from "@/src/lib/api";
import { notify } from "@/src/lib/alerts";
import { bookingRange, currencyLabel, hoursLabel } from "@/src/lib/format";
import { useAuthStore } from "@/src/store/auth";
import { colors, fonts, radius, spacing } from "@/src/theme";
import type { AvailableVehicle, Booking } from "@/src/types/api";

// Server allows booking up to 7 days ahead (apps/api/src/modules/bookings/service.ts).
// Offering exactly a week here (today + 6) keeps every visible slot inside that window.
const DAY_COUNT = 7;
const DAY_START_MINUTES = 6 * 60;
const DAY_LAST_START_MINUTES = 22 * 60;
const LAST_END_MINUTES = 23 * 60 + 30;
const SLOT_STEP = 30;
// Server requires at least 60 minutes (apps/api/.../bookings/service.ts).
const MIN_DURATION = 60;
const MAX_DURATION = 480;

function timeToMinutes(time: string) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(total: number) {
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function to12(time: string) {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${period}`;
}

function buildDayOptions(timezone: string) {
  const now = toZonedTime(new Date(), timezone);
  return Array.from({ length: DAY_COUNT }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    return {
      date: format(d, "yyyy-MM-dd"),
      dow: format(d, "EEE").toUpperCase(),
      dayNum: format(d, "d"),
      label: format(d, "EEE, d MMM"),
      isToday: i === 0,
    };
  });
}

function buildSlotOptions(date: string, timezone: string, isToday: boolean) {
  let earliest = DAY_START_MINUTES;

  if (isToday) {
    const now = toZonedTime(new Date(), timezone);
    let rounded = now.getHours() * 60 + now.getMinutes();
    rounded = Math.ceil(rounded / SLOT_STEP) * SLOT_STEP;
    earliest = Math.max(earliest, rounded);
  }

  const slots: string[] = [];
  for (let m = earliest; m <= DAY_LAST_START_MINUTES; m += SLOT_STEP) {
    slots.push(minutesToTime(m));
  }
  return slots;
}

type Step = 1 | 2 | 3;

export default function BookVehicleScreen() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const timezone = user?.society.timezone ?? "Asia/Kolkata";
  const dashboard = useDashboard(user?.role === "RESIDENT");
  const availability = useCheckAvailability();
  const createBooking = useCreateBooking();

  const [step, setStep] = useState<Step>(1);
  const [dayIndex, setDayIndex] = useState(0);
  const [slotIndex, setSlotIndex] = useState(0);
  const [durationMinutes, setDurationMinutes] = useState(120);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [bookedBooking, setBookedBooking] = useState<Booking | null>(null);
  // Captured at confirm time so the receipt survives the availability reset.
  const [bookedCost, setBookedCost] = useState<number | null>(null);

  const days = useMemo(() => buildDayOptions(timezone), [timezone]);
  const day = days[dayIndex];
  const slots = useMemo(
    () => buildSlotOptions(day.date, timezone, day.isToday),
    [day, timezone],
  );
  const startTime = slots[Math.min(slotIndex, slots.length - 1)] ?? null;

  const maxDurationForStart = startTime
    ? Math.max(MIN_DURATION, LAST_END_MINUTES - timeToMinutes(startTime))
    : MAX_DURATION;
  const clampedDuration = Math.min(durationMinutes, maxDurationForStart);
  const endTime = startTime
    ? minutesToTime(timeToMinutes(startTime) + clampedDuration)
    : null;

  const quota = dashboard.data?.quota;
  const overQuota = Boolean(quota && clampedDuration > quota.remainingMinutes);
  const selectedVehicle =
    availability.data?.availableVehicles.find(
      (vehicle) => vehicle.id === selectedVehicleId,
    ) ?? null;

  const resetToStep1 = () => {
    setStep(1);
    setSelectedVehicleId(null);
    setMessage(null);
    availability.reset();
  };

  const pickDay = (index: number) => {
    setDayIndex(index);
    setSlotIndex(0);
    setSelectedVehicleId(null);
    setMessage(null);
    availability.reset();
  };

  const pickSlot = (index: number) => {
    setSlotIndex(index);
    setSelectedVehicleId(null);
    setMessage(null);
    availability.reset();
  };

  const changeDuration = (delta: number) => {
    setDurationMinutes((prev) =>
      Math.max(MIN_DURATION, Math.min(maxDurationForStart, prev + delta)),
    );
    setSelectedVehicleId(null);
    availability.reset();
  };

  const goToStep2 = async () => {
    if (!startTime || !endTime) return;
    setMessage(null);

    if (overQuota) {
      setMessage(
        `This is longer than the ${hoursLabel(quota?.remainingMinutes ?? 0)} you have left this week.`,
      );
      return;
    }

    try {
      const range = bookingRange(day.date, startTime, endTime, timezone);
      await availability.mutateAsync(range);
      setStep(2);
    } catch (error) {
      setMessage(errorMessage(error));
    }
  };

  const confirmBooking = async () => {
    if (!selectedVehicleId || !startTime || !endTime) return;
    setMessage(null);

    try {
      const range = bookingRange(day.date, startTime, endTime, timezone);
      const result = await createBooking.mutateAsync({
        ...range,
        vehicleId: selectedVehicleId,
      });
      setBookedCost(selectedVehicle?.estimatedCost ?? null);
      notify(
        "Vehicle booked",
        `${result.booking.vehicle.name} has been reserved for you.`,
      );
      setBookedBooking(result.booking);
      setStep(3);
    } catch (error) {
      setMessage(errorMessage(error));
    }
  };

  if (step === 3 && bookedBooking) {
    return (
      <Screen scroll style={styles.doneScreen}>
        <View style={styles.doneCheck}>
          <Text style={styles.doneCheckMark}>✓</Text>
        </View>
        <Text style={styles.doneTitle}>{bookedBooking.vehicle.name} is yours</Text>
        <Text style={styles.doneSubtitle}>
          {day.label} · {to12(startTime ?? "")} – {to12(endTime ?? "")}
        </Text>
        <Card style={styles.doneCard}>
          <DoneRow label="Registration" value={bookedBooking.vehicle.registrationNumber} mono />
          <DoneRow label="Duration" value={hoursLabel(clampedDuration)} />
          {bookedCost === null ? null : (
            <DoneRow label="Charged" value={currencyLabel(bookedCost)} />
          )}
          <DoneRow label="Driver" value="Assigned by the society" />
        </Card>
        <Button
          label="View trip"
          onPress={() =>
            router.replace({
              pathname: "/booking/[id]",
              params: { id: bookedBooking.id },
            })
          }
        />
        <Button
          label="Book another"
          variant="secondary"
          onPress={() => {
            setBookedBooking(null);
            setBookedCost(null);
            resetToStep1();
          }}
        />
      </Screen>
    );
  }

  if (step === 2) {
    return (
      <Screen scroll>
        <View style={styles.stepHeaderRow}>
          <View>
            <Text style={styles.kicker}>STEP 2 OF 2</Text>
            <Text style={styles.title}>Pick your EV</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={resetToStep1}
            style={styles.changeTimeButton}
          >
            <Text style={styles.changeTimeText}>Change time</Text>
          </Pressable>
        </View>

        <View style={styles.windowSummary}>
          <Text style={styles.windowSummaryTitle}>
            {day.label} · {to12(startTime ?? "")} – {to12(endTime ?? "")}
          </Text>
          <Text style={styles.windowSummarySubtitle}>
            {availability.data?.availableVehicleCount ?? 0} EV
            {availability.data?.availableVehicleCount === 1 ? "" : "s"} free ·{" "}
            {hoursLabel(clampedDuration)}
          </Text>
        </View>

        {(availability.data?.availableVehicles ?? []).map((vehicle: AvailableVehicle) => {
          const selected = selectedVehicleId === vehicle.id;
          return (
            <Pressable
              key={vehicle.id}
              accessibilityRole="button"
              onPress={() => setSelectedVehicleId(vehicle.id)}
              style={[styles.vehicleRow, selected && styles.vehicleRowSelected]}
            >
              <View style={styles.vehicleBadge}>
                <Text style={styles.vehicleBadgeText}>EV</Text>
              </View>
              <View style={styles.vehicleInfo}>
                <Text style={styles.vehicleName}>{vehicle.name}</Text>
                <Text style={styles.vehicleReg}>{vehicle.registrationNumber}</Text>
              </View>
              <View style={styles.vehiclePricing}>
                <Text
                  style={[
                    styles.vehiclePrice,
                    !vehicle.affordable && styles.vehiclePriceShort,
                  ]}
                >
                  {currencyLabel(vehicle.estimatedCost)}
                </Text>
                <Text style={styles.vehiclePriceHint}>
                  {vehicle.affordable
                    ? `${currencyLabel(vehicle.hourlyRate)}/hr`
                    : "Low balance"}
                </Text>
              </View>
              {selected ? (
                <View style={styles.selectedPill}>
                  <Text style={styles.selectedPillText}>✓</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}

        {selectedVehicle && !selectedVehicle.affordable ? (
          <Text style={styles.error}>
            This trip costs {currencyLabel(selectedVehicle.estimatedCost)} but your
            wallet has {currencyLabel(availability.data?.walletBalance ?? 0)}. Ask
            the society office to top up your wallet.
          </Text>
        ) : null}

        {availability.data && availability.data.availableVehicles.length === 0 ? (
          <Text style={styles.note}>No EVs are free for this exact window.</Text>
        ) : null}

        {message ? <Text style={styles.error}>{message}</Text> : null}

        <Button
          disabled={!selectedVehicle || !selectedVehicle.affordable}
          label={
            selectedVehicle
              ? `Confirm · ${currencyLabel(selectedVehicle.estimatedCost)}`
              : "Select an EV to continue"
          }
          loading={createBooking.isPending}
          onPress={() => void confirmBooking()}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <View>
        <Text style={styles.kicker}>STEP 1 OF 2</Text>
        <Text style={styles.title}>When do you need it?</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.dayRow}
      >
        {days.map((d, i) => {
          const active = i === dayIndex;
          return (
            <Pressable
              key={d.date}
              accessibilityRole="button"
              onPress={() => pickDay(i)}
              style={[styles.dayTile, active && styles.dayTileActive]}
            >
              <Text style={[styles.dayDow, active && styles.dayDowActive]}>{d.dow}</Text>
              <Text style={[styles.dayNum, active && styles.dayNumActive]}>{d.dayNum}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <Text style={styles.note}>You can book up to 7 days ahead — swipe for more days.</Text>

      <View>
        <Text style={styles.sectionLabel}>Start time</Text>
        {slots.length === 0 ? (
          <Text style={styles.note}>No more slots today. Try another day.</Text>
        ) : (
          <View style={styles.slotGrid}>
            {slots.map((slot, i) => {
              const active = i === slotIndex;
              return (
                <Pressable
                  key={slot}
                  accessibilityRole="button"
                  onPress={() => pickSlot(i)}
                  style={[styles.slotTile, active && styles.slotTileActive]}
                >
                  <Text style={[styles.slotLabel, active && styles.slotLabelActive]}>
                    {to12(slot)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
        <Text style={styles.note}>Slots follow the 30-minute rule the society enforces.</Text>
      </View>

      <Card style={styles.durationCard}>
        <View style={styles.durationRow}>
          <View>
            <Text style={styles.durationTitle}>How long?</Text>
            <Text style={styles.durationSubtitle}>
              Ends {endTime ? to12(endTime) : "—"}
            </Text>
          </View>
          <View style={styles.stepper}>
            <Pressable
              accessibilityRole="button"
              onPress={() => changeDuration(-SLOT_STEP)}
              style={styles.stepperButton}
            >
              <Text style={styles.stepperButtonText}>−</Text>
            </Pressable>
            <Text style={styles.stepperValue}>{hoursLabel(clampedDuration)}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => changeDuration(SLOT_STEP)}
              style={styles.stepperButton}
            >
              <Text style={styles.stepperButtonText}>+</Text>
            </Pressable>
          </View>
        </View>
      </Card>

      {quota ? (
        <Card style={styles.quotaPreview}>
          <Text style={styles.quotaPreviewSentence}>
            After this trip, you&apos;ll have{" "}
            <Text style={styles.quotaPreviewHighlight}>
              {hoursLabel(Math.max(0, quota.remainingMinutes - clampedDuration))}
            </Text>{" "}
            left this week
            <Text style={styles.quotaPreviewMuted}> (of {hoursLabel(quota.allocatedMinutes)} total)</Text>.
          </Text>
          {overQuota ? (
            <Text style={styles.overQuotaText}>
              This is longer than the {hoursLabel(quota.remainingMinutes)} you have left
              this week. Shorten the trip or wait for Monday&apos;s reset.
            </Text>
          ) : null}
        </Card>
      ) : null}

      {message ? <Text style={styles.error}>{message}</Text> : null}

      <Button
        disabled={!startTime || slots.length === 0}
        label="See available EVs"
        loading={availability.isPending}
        onPress={() => void goToStep2()}
      />
    </Screen>
  );
}

function DoneRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={styles.doneRow}>
      <Text style={styles.doneRowLabel}>{label}</Text>
      <Text style={[styles.doneRowValue, mono && { fontFamily: fonts.mono }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  kicker: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.8,
    fontFamily: fonts.mono,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "700",
    marginTop: 4,
    letterSpacing: -0.2,
  },
  stepHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  changeTimeButton: {
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  changeTimeText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "600",
  },

  dayRow: {
    flexDirection: "row",
    gap: 8,
  },
  dayTile: {
    width: 80,
    minHeight: 64,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dayTileActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  dayDow: {
    color: colors.textMuted,
    fontSize: 11,
    fontFamily: fonts.mono,
  },
  dayDowActive: {
    color: colors.primarySoft,
  },
  dayNum: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "600",
  },
  dayNumActive: {
    color: colors.surface,
  },

  sectionLabel: {
    color: colors.textMuted,
    fontSize: 13.5,
    fontWeight: "600",
    marginBottom: 9,
  },
  slotGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  slotTile: {
    width: "23%",
    minHeight: 46,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  slotTileActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  slotLabel: {
    color: colors.text,
    fontSize: 12.5,
    fontWeight: "600",
  },
  slotLabelActive: {
    color: colors.surface,
  },
  note: {
    color: colors.textFaint,
    fontSize: 12.5,
    marginTop: 8,
  },

  durationCard: {
    gap: 0,
  },
  durationRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  durationTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
  },
  durationSubtitle: {
    color: colors.textMuted,
    fontSize: 12.5,
    marginTop: 3,
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  stepperButton: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  stepperButtonText: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "600",
  },
  stepperValue: {
    minWidth: 64,
    textAlign: "center",
    color: colors.text,
    fontSize: 16,
    fontWeight: "600",
  },

  quotaPreview: {
    gap: 10,
  },
  quotaPreviewSentence: {
    color: colors.text,
    fontSize: 14.5,
    lineHeight: 21,
  },
  quotaPreviewHighlight: {
    fontWeight: "700",
  },
  quotaPreviewMuted: {
    color: colors.textMuted,
    fontWeight: "400",
  },
  overQuotaText: {
    color: colors.warning,
    backgroundColor: colors.warningSoft,
    borderRadius: radius.sm,
    padding: 12,
    fontSize: 13,
    lineHeight: 19,
  },

  windowSummary: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.lg,
    padding: 14,
  },
  windowSummaryTitle: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: "600",
  },
  windowSummarySubtitle: {
    color: colors.primary,
    fontSize: 12.5,
    marginTop: 3,
    opacity: 0.85,
  },

  vehicleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    borderRadius: radius.lg,
    padding: 15,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  vehicleRowSelected: {
    borderColor: colors.primary,
    borderWidth: 1.5,
    backgroundColor: colors.primarySoft,
  },
  vehicleBadge: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primarySoft,
  },
  vehicleBadgeText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "700",
    fontFamily: fonts.mono,
  },
  vehicleInfo: {
    flex: 1,
  },
  vehicleName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "600",
  },
  vehicleReg: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 3,
    fontFamily: fonts.mono,
  },
  vehiclePricing: {
    alignItems: "flex-end",
    marginLeft: spacing.sm,
  },
  vehiclePrice: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  vehiclePriceShort: {
    color: colors.danger,
  },
  vehiclePriceHint: {
    color: colors.textMuted,
    fontSize: 11.5,
    marginTop: 2,
  },
  selectedPill: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 999,
    height: 22,
    justifyContent: "center",
    marginLeft: spacing.sm,
    width: 22,
  },
  selectedPillText: {
    color: colors.surface,
    fontSize: 12,
    fontWeight: "700",
  },

  error: {
    borderRadius: radius.md,
    backgroundColor: colors.dangerSoft,
    color: colors.danger,
    fontSize: 14,
    fontWeight: "600",
    padding: spacing.md,
  },

  doneScreen: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    textAlign: "center",
  },
  doneCheck: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  doneCheckMark: {
    color: colors.primary,
    fontSize: 26,
    fontWeight: "700",
  },
  doneTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center",
    marginTop: 6,
  },
  doneSubtitle: {
    color: colors.textMuted,
    fontSize: 14.5,
    textAlign: "center",
    marginTop: 4,
  },
  doneCard: {
    width: "100%",
    gap: 12,
  },
  doneRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  doneRowLabel: {
    color: colors.textMuted,
    fontSize: 13.5,
  },
  doneRowValue: {
    color: colors.text,
    fontSize: 13.5,
    fontWeight: "600",
  },
});
