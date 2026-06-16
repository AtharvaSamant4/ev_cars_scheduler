import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import {
  useCheckAvailability,
  useCreateBooking,
} from "@/src/api/hooks";
import { Button } from "@/src/components/button";
import { Card } from "@/src/components/card";
import { Screen } from "@/src/components/screen";
import { TextField } from "@/src/components/text-field";
import { errorMessage } from "@/src/lib/api";
import { notify } from "@/src/lib/alerts";
import {
  bookingRange,
  defaultBookingFields,
  hoursLabel,
} from "@/src/lib/format";
import { useAuthStore } from "@/src/store/auth";
import { colors, radius, spacing } from "@/src/theme";

export default function BookVehicleScreen() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const defaults = useMemo(() => defaultBookingFields(), []);
  const [date, setDate] = useState(defaults.date);
  const [startTime, setStartTime] = useState(defaults.startTime);
  const [endTime, setEndTime] = useState(defaults.endTime);
  const [message, setMessage] = useState<string | null>(null);
  const [checkedRange, setCheckedRange] = useState<string | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const availability = useCheckAvailability();
  const createBooking = useCreateBooking();
  const timezone = user?.society.timezone ?? "Asia/Kolkata";

  const currentRange = () => bookingRange(date, startTime, endTime, timezone);

  const resetAvailability = () => {
    availability.reset();
    setCheckedRange(null);
    setMessage(null);
    setSelectedVehicleId(null);
  };

  const check = async () => {
    setMessage(null);

    try {
      const range = currentRange();
      await availability.mutateAsync(range);
      setCheckedRange(JSON.stringify(range));
    } catch (error) {
      setCheckedRange(null);
      setMessage(errorMessage(error));
    }
  };

  const confirm = async () => {
    setMessage(null);

    try {
      const range = currentRange();

      if (checkedRange !== JSON.stringify(range) || !availability.data?.available) {
        throw new Error("Check availability for this time slot first");
      }

      if (!selectedVehicleId) {
        throw new Error("Please select an available EV to book");
      }

      const result = await createBooking.mutateAsync({ ...range, vehicleId: selectedVehicleId });
      notify(
        "Vehicle booked",
        `${result.booking.vehicle.name} has been reserved for you.`,
      );
      router.push({
        pathname: "/booking/[id]",
        params: { id: result.booking.id },
      });
    } catch (error) {
      setMessage(errorMessage(error));
    }
  };

  return (
    <Screen scroll>
      <View>
        <Text style={styles.kicker}>BOOK A VEHICLE</Text>
        <Text style={styles.title}>Plan your next trip</Text>
      </View>

      <Card style={styles.form}>
        <TextField
          autoCapitalize="none"
          autoCorrect={false}
          hint="Use YYYY-MM-DD"
          label="Date"
          type="date"
          onChangeText={(value) => {
            setDate(value);
            resetAvailability();
          }}
          placeholder="2026-06-10"
          value={date}
        />
        <View style={styles.timeRow}>
          <View style={styles.timeField}>
            <TextField
              autoCapitalize="none"
              autoCorrect={false}
              hint="30-minute intervals"
              label="Start time"
              type="time"
              onChangeText={(value) => {
                setStartTime(value);
                resetAvailability();
              }}
              placeholder="14:00"
              value={startTime}
            />
          </View>
          <View style={styles.timeField}>
            <TextField
              autoCapitalize="none"
              autoCorrect={false}
              hint="30-minute intervals"
              label="End time"
              type="time"
              onChangeText={(value) => {
                setEndTime(value);
                resetAvailability();
              }}
              placeholder="20:00"
              value={endTime}
            />
          </View>
        </View>

        <Button
          label="Check availability"
          loading={availability.isPending}
          variant="secondary"
          onPress={() => void check()}
        />
      </Card>

      {availability.data ? (
        <Card
          style={[
            styles.result,
            availability.data.available ? styles.available : styles.unavailable,
          ]}
        >
          <Text
            style={[
              styles.resultTitle,
              !availability.data.available && styles.unavailableText,
            ]}
          >
            {availability.data.available
              ? "Vehicle available"
              : "This slot cannot be booked"}
          </Text>
          <Text style={styles.resultText}>
            {availability.data.availableVehicleCount} EV
            {availability.data.availableVehicleCount === 1 ? "" : "s"} available
            {"  ·  "}
            {hoursLabel(availability.data.durationMinutes)}
          </Text>
          <Text style={styles.resultText}>
            Quota after booking:{" "}
            {hoursLabel(
              availability.data.quota.remainingMinutes -
                availability.data.durationMinutes,
            )}
          </Text>

          {availability.data.available && availability.data.availableVehicles.length > 0 ? (
            <View style={styles.vehicleList}>
              <Text style={styles.vehicleListTitle}>Select a vehicle:</Text>
              {availability.data?.availableVehicles.map((vehicle: { id: string, name: string, registrationNumber: string }) => (
                <TouchableOpacity
                  key={vehicle.id}
                  activeOpacity={0.7}
                  onPress={() => setSelectedVehicleId(vehicle.id)}
                  style={[
                    styles.vehicleCard,
                    selectedVehicleId === vehicle.id && styles.vehicleCardSelected,
                  ]}
                >
                  <Text style={[
                    styles.vehicleName,
                    selectedVehicleId === vehicle.id && styles.vehicleNameSelected,
                  ]}>{vehicle.name}</Text>
                  <Text style={[
                    styles.vehicleReg,
                    selectedVehicleId === vehicle.id && styles.vehicleRegSelected,
                  ]}>{vehicle.registrationNumber}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
        </Card>
      ) : null}

      {message ? <Text style={styles.error}>{message}</Text> : null}

      <Button
        disabled={!availability.data?.available || !selectedVehicleId}
        label="Confirm booking"
        loading={createBooking.isPending}
        onPress={() => void confirm()}
      />

      <Text style={styles.note}>
        Bookings immediately consume quota. Cancelling before the start time
        restores the full duration.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  kicker: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "900",
    marginTop: spacing.xs,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: spacing.sm,
  },
  form: {
    gap: spacing.md,
  },
  timeRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  timeField: {
    flex: 1,
  },
  result: {
    gap: spacing.sm,
  },
  available: {
    backgroundColor: colors.successSoft,
    borderColor: colors.success,
  },
  unavailable: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.danger,
  },
  resultTitle: {
    color: colors.success,
    fontSize: 18,
    fontWeight: "900",
  },
  unavailableText: {
    color: colors.danger,
  },
  resultText: {
    color: colors.text,
    fontSize: 14,
  },
  error: {
    borderRadius: radius.md,
    backgroundColor: colors.dangerSoft,
    color: colors.danger,
    fontSize: 14,
    fontWeight: "600",
    padding: spacing.md,
  },
  note: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
  },
  vehicleList: {
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  vehicleListTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  vehicleCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
  },
  vehicleCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  vehicleName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  vehicleNameSelected: {
    color: colors.primary,
  },
  vehicleReg: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: spacing.xs,
  },
  vehicleRegSelected: {
    color: colors.primary,
  },
});
