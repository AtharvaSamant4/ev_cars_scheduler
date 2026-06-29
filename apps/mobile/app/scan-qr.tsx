import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, fonts, spacing } from "@/src/theme";

export default function ScanQRScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      void requestPermission();
    }
  }, [permission, requestPermission]);

  const handleBarcodeScanned = () => {
    if (scanned) return;
    setScanned(true);
    // When any QR code is scanned, navigate to qr-recharge.
    router.replace("/qr-recharge");
  };

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.message}>We need your permission to show the camera</Text>
        <TouchableOpacity style={styles.button} onPress={() => void requestPermission()}>
          <Text style={styles.buttonText}>Grant Permission</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.cancelButton}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Scan Society QR</Text>
      </View>

      <View style={styles.cameraContainer}>
        <CameraView
          style={StyleSheet.absoluteFillObject}
          facing="back"
          onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
          barcodeScannerSettings={{
            barcodeTypes: ["qr"],
          }}
        />
        
        <View style={styles.overlay}>
          <View style={styles.scanBox} />
          <Text style={styles.scanText}>Point your camera at the Society QR Code</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: spacing.xl },
  message: { textAlign: "center", marginBottom: spacing.lg, fontSize: 16, fontFamily: fonts.medium, color: colors.text },
  button: { backgroundColor: colors.primary, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: 8 },
  buttonText: { color: "white", fontFamily: fonts.bold, fontSize: 16 },
  backButton: { marginTop: spacing.lg },
  backButtonText: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: 16 },
  
  header: {
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    zIndex: 10,
  },
  cancelButton: { marginRight: spacing.md },
  cancelText: { color: colors.primary, fontSize: 16, fontFamily: fonts.semiBold },
  title: { fontSize: 20, fontFamily: fonts.bold, color: colors.text },
  
  cameraContainer: { flex: 1, position: "relative" },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  scanBox: {
    width: 250,
    height: 250,
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: "transparent",
    marginBottom: spacing.xl,
  },
  scanText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: fonts.medium,
    textAlign: "center",
    paddingHorizontal: spacing.xl,
  },
});
