import {
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";

import { colors, radius, spacing } from "@/src/theme";

type TextFieldProps = TextInputProps & {
  label: string;
  hint?: string;
  type?: string;
};

export function TextField({ label, hint, style, type, ...props }: TextFieldProps) {
  return (
    <View style={styles.group}>
      <Text style={styles.label}>{label}</Text>
      {Platform.OS === "web" && (type === "date" || type === "time") ? (
        <input
          type={type}
          step={type === "time" ? 1800 : undefined}
          aria-label={label}
          style={{
            minHeight: 52,
            borderWidth: 1,
            borderStyle: "solid",
            borderColor: colors.border,
            borderRadius: radius.md,
            backgroundColor: colors.surface,
            color: colors.text,
            fontSize: 16,
            paddingLeft: spacing.md,
            paddingRight: spacing.md,
            boxSizing: "border-box",
            outline: "none",
            fontFamily: "inherit",
          } as any}
          value={props.value}
          onChange={(e: any) => props.onChangeText?.(e.target.value)}
          placeholder={props.placeholder}
        />
      ) : (
        <TextInput
          accessibilityLabel={label}
          placeholderTextColor={colors.textMuted}
          style={[styles.input, style]}
          {...props}
        />
      )}
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: spacing.sm,
  },
  label: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: spacing.md,
  },
  hint: {
    color: colors.textMuted,
    fontSize: 12,
  },
});
