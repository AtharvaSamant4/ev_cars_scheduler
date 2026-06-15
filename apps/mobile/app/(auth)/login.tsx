import { useRouter } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useResidentLogin } from "@/src/api/hooks";
import { Button } from "@/src/components/button";
import { Card } from "@/src/components/card";
import { Screen } from "@/src/components/screen";
import { TextField } from "@/src/components/text-field";
import { errorMessage } from "@/src/lib/api";
import { useAuthStore } from "@/src/store/auth";
import { colors, spacing } from "@/src/theme";

export default function LoginScreen() {
  const router = useRouter();
  const setSession = useAuthStore((state) => state.setSession);
  const login = useResidentLogin();
  const [flatNumber, setFlatNumber] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const submit = async () => {
    setMessage(null);

    try {
      const session = await login.mutateAsync({
        flatNumber: flatNumber.trim().toUpperCase(),
        password,
      });
      await setSession(session);
      router.replace("/(tabs)");
    } catch (error) {
      setMessage(errorMessage(error));
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.flex}
    >
      <Screen scroll style={styles.screen}>
        <View style={styles.brand}>
          <View style={styles.logo}>
            <Text style={styles.logoText}>EV</Text>
          </View>
          <Text style={styles.title}>Your society car, when you need it.</Text>
          <Text style={styles.subtitle}>
            Reserve an electric vehicle and keep track of your annual quota.
          </Text>
        </View>

        <Card style={styles.form}>
          <Text style={styles.formTitle}>Resident login</Text>
          <TextField
            autoCapitalize="characters"
            autoCorrect={false}
            label="Flat number"
            onChangeText={setFlatNumber}
            placeholder="A101"
            returnKeyType="next"
            value={flatNumber}
          />
          <TextField
            label="Password"
            onChangeText={setPassword}
            onSubmitEditing={() => void submit()}
            placeholder="Enter your password"
            returnKeyType="done"
            secureTextEntry
            value={password}
          />
          {message ? <Text style={styles.error}>{message}</Text> : null}
          <Button
            disabled={!flatNumber.trim() || password.length < 8}
            label="Login"
            loading={login.isPending}
            onPress={() => void submit()}
          />
          <Button
            label="Use demo account"
            variant="secondary"
            onPress={() => {
              setFlatNumber("A101");
              setPassword("Demo@123");
              setMessage(null);
            }}
          />
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
  brand: {
    gap: spacing.sm,
  },
  logo: {
    width: 58,
    height: 58,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    backgroundColor: colors.primary,
  },
  logoText: {
    color: colors.surface,
    fontSize: 20,
    fontWeight: "900",
  },
  title: {
    maxWidth: 420,
    color: colors.text,
    fontSize: 34,
    fontWeight: "900",
    lineHeight: 40,
  },
  subtitle: {
    maxWidth: 480,
    color: colors.textMuted,
    fontSize: 16,
    lineHeight: 24,
  },
  form: {
    gap: spacing.md,
  },
  formTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "900",
  },
  error: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: "600",
  },
});
