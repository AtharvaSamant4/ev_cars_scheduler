import { StyleSheet, Text, View, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import QRCode from "react-native-qrcode-svg";
import { Redirect, useRouter } from "expo-router";

import { ErrorState, LoadingState } from "@/src/components/states";
import { buildConfiguredAppUrl, errorMessage } from "@/src/lib/api";
import { useAuthStore } from "@/src/store/auth";
import { colors, fonts, spacing } from "@/src/theme";

export default function ShowQRScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const hydrated = useAuthStore((s) => s.hydrated);

  if (!hydrated) {
    return <LoadingState label="Preparing recharge QR..." />;
  }

  if (!token || !user) {
    return <Redirect href="/(auth)/login" />;
  }

  if (user.role !== "RESIDENT") {
    return <Redirect href="/(driver)" />;
  }

  let qrUrl: string;
  try {
    qrUrl = buildConfiguredAppUrl("/demo-payment", { userId: user.id });
  } catch (error) {
    return <ErrorState message={errorMessage(error)} />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.cancelButton}>
          <Text style={styles.cancelText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Recharge Wallet</Text>
      </View>

      <View style={styles.content}>
        <Text style={styles.instructions}>
          {"Scan this code from another device to open the local demo payment page for this resident."}
        </Text>

        <View style={styles.qrWrapper}>
          <QRCode
            value={qrUrl}
            size={280}
            backgroundColor="white"
            color={colors.primary}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  cancelButton: { marginRight: spacing.md },
  cancelText: { color: colors.primary, fontSize: 16, fontFamily: fonts.semiBold },
  title: { fontSize: 20, fontFamily: fonts.bold, color: colors.text },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  instructions: {
    fontSize: 18,
    fontFamily: fonts.medium,
    color: colors.text,
    textAlign: "center",
    marginBottom: spacing.xl,
    lineHeight: 28,
  },
  qrWrapper: {
    padding: spacing.xl,
    backgroundColor: "white",
    borderRadius: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 8,
  }
});
