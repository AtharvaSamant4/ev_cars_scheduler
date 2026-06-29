import { useEffect, useState } from "react";
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import QRCode from "react-native-qrcode-svg";
import { useRouter } from "expo-router";

import { useAuthStore } from "@/src/store/auth";
import { colors, fonts, spacing } from "@/src/theme";

export default function ShowQRScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const hydrated = useAuthStore((s) => s.hydrated);
  const [localIp, setLocalIp] = useState<string | null>(null);

  useEffect(() => {
    // Dynamically ask the backend for the laptop's actual Wi-Fi IP address
    // This solves the localhost problem entirely without any manual entry!
    fetch("http://localhost:3000/api/v1/ip")
      .then((res) => res.json())
      .then((data) => {
        if (data.ip && data.ip !== "localhost") {
          setLocalIp(data.ip);
        } else {
          // Fallback just in case
          setLocalIp(typeof window !== "undefined" ? window.location.hostname : "192.168.0.x");
        }
      })
      .catch(() => {
        setLocalIp(typeof window !== "undefined" ? window.location.hostname : "192.168.0.x");
      });
  }, []);

  if (!hydrated || !user || !localIp) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // The QR code contains the mock payment gateway URL + this specific user's ID
  const qrUrl = `http://${localIp}:3000/demo-payment?userId=${user.id}`;

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
          Scan this QR code with your phone's camera to securely add funds to your wallet.
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
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
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
    marginBottom: spacing.xxxl,
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
