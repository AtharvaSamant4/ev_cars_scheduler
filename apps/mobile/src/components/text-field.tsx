import {
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { forwardRef } from "react";
import type { ChangeEvent, CSSProperties } from "react";

import { colors, radius, spacing } from "@/src/theme";

type TextFieldProps = TextInputProps & {
  label: string;
  hint?: string;
  type?: string;
};

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, hint, style, type, ...props },
  ref,
) {
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
            borderColor: colors.borderStrong,
            borderRadius: radius.md,
            backgroundColor: colors.surface,
            color: colors.text,
            fontSize: 16,
            paddingLeft: spacing.md,
            paddingRight: spacing.md,
            boxSizing: "border-box",
            outline: "none",
            fontFamily: "inherit",
          } satisfies CSSProperties}
          value={props.value}
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            props.onChangeText?.(event.target.value)
          }
          placeholder={props.placeholder}
        />
      ) : (
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          placeholderTextColor={colors.textMuted}
          style={[styles.input, style]}
          {...props}
        />
      )}
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
});

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
    borderColor: colors.borderStrong,
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
