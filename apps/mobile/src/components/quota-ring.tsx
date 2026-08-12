import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

import { colors } from "@/src/theme";

export function QuotaRing({
  percentRemaining,
  shortLabel,
  size = 58,
  stroke = 5,
}: {
  percentRemaining: number;
  shortLabel: string;
  size?: number;
  stroke?: number;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, percentRemaining));
  const dashOffset = circumference * (1 - clamped / 100);
  const center = size / 2;
  const innerSize = size - stroke * 2 - 4;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={colors.border}
          strokeWidth={stroke}
          fill="none"
        />
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={colors.primary}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          rotation={-90}
          origin={`${center}, ${center}`}
        />
      </Svg>
      <View
        style={[
          styles.center,
          {
            width: innerSize,
            height: innerSize,
            borderRadius: innerSize / 2,
            top: (size - innerSize) / 2,
            left: (size - innerSize) / 2,
          },
        ]}
      >
        <Text style={styles.label}>{shortLabel}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    position: "absolute",
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    color: colors.primary,
    fontSize: 12.5,
    fontWeight: "700",
  },
});
