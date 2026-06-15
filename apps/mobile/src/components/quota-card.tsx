import { StyleSheet, Text, View } from "react-native";

import { Card } from "@/src/components/card";
import { hoursLabel } from "@/src/lib/format";
import { colors, radius, spacing } from "@/src/theme";
import type { Quota } from "@/src/types/api";

export function QuotaCard({ quota }: { quota: Quota }) {
  const percentage =
    quota.allocatedMinutes === 0
      ? 0
      : Math.min(100, (quota.usedMinutes / quota.allocatedMinutes) * 100);

  return (
    <Card style={styles.card}>
      <View style={styles.heading}>
        <View>
          <Text style={styles.eyebrow}>{quota.year} QUOTA</Text>
          <Text style={styles.remaining}>
            {hoursLabel(quota.remainingMinutes)}
          </Text>
          <Text style={styles.caption}>remaining</Text>
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            {Math.round(100 - percentage)}% left
          </Text>
        </View>
      </View>

      <View style={styles.track}>
        <View style={[styles.progress, { width: `${percentage}%` }]} />
      </View>

      <View style={styles.stats}>
        <QuotaStat label="Allocated" value={hoursLabel(quota.allocatedMinutes)} />
        <QuotaStat label="Used" value={hoursLabel(quota.usedMinutes)} />
      </View>
    </Card>
  );
}

function QuotaStat({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
  },
  heading: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
  },
  remaining: {
    color: colors.text,
    fontSize: 34,
    fontWeight: "900",
    marginTop: spacing.xs,
  },
  caption: {
    color: colors.textMuted,
    fontSize: 14,
  },
  badge: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  badgeText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "800",
  },
  track: {
    height: 10,
    overflow: "hidden",
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  progress: {
    height: "100%",
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  stats: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: 13,
  },
  statValue: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "800",
    marginTop: spacing.xs,
  },
});
