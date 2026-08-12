import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { useResidentLogin, useDriverLogin } from "@/src/api/hooks";
import { Button } from "@/src/components/button";
import { Card } from "@/src/components/card";
import { Screen } from "@/src/components/screen";
import { TextField } from "@/src/components/text-field";
import { errorMessage } from "@/src/lib/api";
import { useAuthStore } from "@/src/store/auth";
import { colors, radius, spacing } from "@/src/theme";

export default function LoginScreen() {
  const router = useRouter();
  const setSession = useAuthStore((state) => state.setSession);
  const login = useResidentLogin();
  const driverLoginQuery = useDriverLogin();
  const [societyId, setSocietyId] = useState("");
  const [flatNumber, setFlatNumber] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isDriver, setIsDriver] = useState(false);
  const pending = login.isPending || driverLoginQuery.isPending;
  const societyIdRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  const submit = async () => {
    if (pending) return;
    setMessage(null);

    try {
      if (isDriver) {
        const session = await driverLoginQuery.mutateAsync({
          phone: flatNumber.trim(),
          password,
        });
        await setSession(session);
        router.replace("/(driver)");
      } else {
        const session = await login.mutateAsync({
          societyId: societyId.trim() || undefined,
          flatNumber: flatNumber.trim().toUpperCase(),
          password,
        });
        await setSession(session);
        router.replace("/(tabs)");
      }
    } catch (error) {
      setMessage(errorMessage(error));
    }
  };

  const switchRole = (driver: boolean) => {
    if (driver === isDriver) return;
    setIsDriver(driver);
    setSocietyId("");
    setFlatNumber("");
    setPassword("");
    setMessage(null);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.flex}
    >
      <Screen scroll style={styles.screen}>
        <Card style={styles.form}>
          <View style={styles.logo}>
            <Text style={styles.logoText}>EV</Text>
          </View>
          <Text style={styles.title}>Sign in</Text>
          <Text style={styles.subtitle}>
            Reserve an electric vehicle and keep track of your weekly quota.
          </Text>

          <View style={styles.segment}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: !isDriver }}
              onPress={() => switchRole(false)}
              style={[styles.segmentItem, !isDriver && styles.segmentItemActive]}
            >
              <Text style={[styles.segmentLabel, !isDriver && styles.segmentLabelActive]}>
                Resident
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: isDriver }}
              onPress={() => switchRole(true)}
              style={[styles.segmentItem, isDriver && styles.segmentItemActive]}
            >
              <Text style={[styles.segmentLabel, isDriver && styles.segmentLabelActive]}>
                Driver
              </Text>
            </Pressable>
          </View>

          <TextField
            autoCapitalize={isDriver ? "none" : "characters"}
            autoComplete={isDriver ? "tel" : "off"}
            autoCorrect={false}
            keyboardType={isDriver ? "phone-pad" : "default"}
            label={isDriver ? "Phone number" : "Flat number"}
            onChangeText={setFlatNumber}
            onSubmitEditing={() =>
              (isDriver ? passwordRef : societyIdRef).current?.focus()
            }
            placeholder={isDriver ? "Enter phone" : "A101"}
            returnKeyType="next"
            value={flatNumber}
          />
          {!isDriver && (
            <TextField
              autoCapitalize="none"
              autoCorrect={false}
              label="Society ID (if required)"
              onChangeText={setSocietyId}
              onSubmitEditing={() => passwordRef.current?.focus()}
              placeholder="Enter society ID"
              ref={societyIdRef}
              returnKeyType="next"
              value={societyId}
            />
          )}
          <TextField
            autoComplete="password"
            label="Password"
            onChangeText={setPassword}
            onSubmitEditing={() => void submit()}
            placeholder="Enter your password"
            ref={passwordRef}
            returnKeyType="done"
            secureTextEntry
            textContentType="password"
            value={password}
          />
          {message ? <Text style={styles.error}>{message}</Text> : null}
          <Button
            disabled={pending || !flatNumber.trim() || password.length < 8}
            label="Log in"
            loading={pending}
            onPress={() => void submit()}
          />
          {!isDriver ? (
            <Text style={styles.hint}>
              Society ID is only needed if your flat number exists in more
              than one society.
            </Text>
          ) : null}
        </Card>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  screen: {
    flexGrow: 1,
    justifyContent: "center",
    paddingVertical: spacing.xl,
  },
  logo: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
  },
  logoText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: "700",
  },
  title: {
    color: colors.text,
    fontSize: 27,
    fontWeight: "700",
    marginTop: 20,
    letterSpacing: -0.3,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 14.5,
    lineHeight: 21,
    marginTop: 6,
  },
  form: {
    gap: spacing.md,
    maxWidth: 420,
    width: "100%",
    alignSelf: "center",
    padding: 32,
  },
  segment: {
    flexDirection: "row",
    gap: 4,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: 4,
    marginTop: 4,
  },
  segmentItem: {
    flex: 1,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
  },
  segmentItemActive: {
    backgroundColor: colors.surface,
  },
  segmentLabel: {
    color: colors.textMuted,
    fontSize: 13.5,
    fontWeight: "600",
  },
  segmentLabelActive: {
    color: colors.text,
  },
  hint: {
    color: colors.textFaint,
    fontSize: 12.5,
    lineHeight: 18,
    textAlign: "center",
  },
  error: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: "600",
  },
});
