import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type PressableProps,
} from "react-native";

import { colors, radius, spacing } from "@/src/theme";

type ButtonProps = PressableProps & {
  label: string;
  loading?: boolean;
  variant?: "primary" | "secondary" | "danger" | "dangerOutline";
};

export function Button({
  label,
  loading = false,
  variant = "primary",
  disabled,
  style,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      style={(state) => [
        styles.base,
        styles[variant],
        state.pressed && !isDisabled && stylesPressed[variant],
        isDisabled && styles.disabled,
        typeof style === "function" ? style(state) : style,
      ]}
      {...props}
    >
      {loading ? (
        <ActivityIndicator
          color={
            variant === "secondary" ? colors.primary : variant === "dangerOutline" ? colors.danger : colors.surface
          }
        />
      ) : (
        <Text
          style={[
            styles.label,
            variant === "secondary" && styles.secondaryLabel,
            variant === "dangerOutline" && styles.dangerOutlineLabel,
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
  },
  primary: {
    backgroundColor: colors.primary,
  },
  secondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  danger: {
    backgroundColor: colors.danger,
  },
  dangerOutline: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
  },
  label: {
    color: colors.surface,
    fontSize: 15.5,
    fontWeight: "700",
  },
  secondaryLabel: {
    color: colors.text,
  },
  dangerOutlineLabel: {
    color: colors.danger,
  },
  disabled: {
    opacity: 0.55,
  },
});

const stylesPressed = StyleSheet.create({
  primary: {
    backgroundColor: colors.primaryHover,
  },
  secondary: {
    backgroundColor: colors.surfaceMuted,
  },
  danger: {
    opacity: 0.88,
  },
  dangerOutline: {
    backgroundColor: colors.dangerSoft,
  },
});
