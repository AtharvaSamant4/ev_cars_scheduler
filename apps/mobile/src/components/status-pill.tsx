import { StyleSheet, Text, View } from "react-native";

import { statusLabel } from "@/src/lib/format";
import { colors } from "@/src/theme";
import type { BookingStatus } from "@/src/types/api";

export function statusMeta(status: BookingStatus) {
  if (status === "BOOKED" || status === "DRIVER_ASSIGNED") {
    return { fg: colors.primary, bg: colors.primarySoft, border: colors.primarySoft };
  }
  if (status === "OTP_PENDING") {
    return { fg: colors.warning, bg: colors.warningSoft, border: colors.warningSoft };
  }
  if (status === "IN_PROGRESS" || status === "ACTIVE") {
    return { fg: colors.surface, bg: colors.live, border: colors.live };
  }
  if (status === "AT_RISK") {
    return { fg: colors.warning, bg: colors.warningSoft, border: colors.warningBorder };
  }
  if (status === "REASSIGNED") {
    return { fg: colors.info, bg: colors.infoSoft, border: colors.infoSoft };
  }
  if (status === "COMPLETED") {
    return { fg: colors.textMuted, bg: colors.surfaceMuted, border: colors.surfaceMuted };
  }
  return { fg: colors.danger, bg: colors.dangerSoft, border: colors.dangerSoft };
}

export function StatusPill({ status }: { status: BookingStatus }) {
  const meta = statusMeta(status);

  return (
    <View
      style={[
        styles.pill,
        { backgroundColor: meta.bg, borderColor: meta.border },
      ]}
    >
      <Text style={[styles.label, { color: meta.fg }]}>{statusLabel(status)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexShrink: 0,
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 4,
  },
  label: {
    fontSize: 11.5,
    fontWeight: "600",
  },
});
