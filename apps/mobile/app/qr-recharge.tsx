import { useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/src/components/button";
import { Card } from "@/src/components/card";
import { apiRequest, errorMessage } from "@/src/lib/api";
import { colors, fonts, radius, spacing } from "@/src/theme";

export default function QRRechargeScreen() {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const presetAmounts = [500, 1000, 2000];

  const submitRecharge = async () => {
    const numericAmount = Number(amount);
    if (!amount || isNaN(numericAmount) || numericAmount <= 0) {
      alert("Please enter a valid amount.");
      return;
    }
    if (numericAmount > 10000) {
      alert("Maximum demo recharge is ₹10000.");
      return;
    }

    setIsSubmitting(true);
    try {
      await apiRequest("/wallet/mock-recharge", {
        method: "POST",
        body: JSON.stringify({
          amount: numericAmount,
        }),
      });
      alert("Demo recharge successful!");
      router.back();
    } catch (err) {
      alert(errorMessage(err));
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Recharge via QR</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.demoWarning}>
          <Text style={styles.demoWarningText}>⚠️ DEMO PAYMENT MODE</Text>
          <Text style={styles.demoSubtext}>No real money will be transferred. This is for presentation purposes only.</Text>
        </View>

        <Card style={styles.formCard}>
          <Text style={styles.label}>Enter Amount (₹)</Text>
          <TextInput
            style={styles.input}
            keyboardType="numeric"
            value={amount}
            onChangeText={setAmount}
            placeholder="e.g. 500"
            placeholderTextColor={colors.textMuted}
          />

          <View style={styles.presetContainer}>
            {presetAmounts.map((preset) => (
              <TouchableOpacity
                key={preset}
                style={styles.presetChip}
                onPress={() => setAmount(preset.toString())}
              >
                <Text style={styles.presetText}>₹{preset}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Button
            label="Confirm Payment"
            onPress={submitRecharge}
            loading={isSubmitting}
            style={{ marginTop: spacing.md }}
          />
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  header: {
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  backButton: { marginRight: spacing.md },
  backText: { color: colors.primary, fontSize: 16, fontFamily: fonts.semiBold },
  title: { fontSize: 20, fontFamily: fonts.bold, color: colors.text },
  content: { padding: spacing.md, gap: spacing.md },
  demoWarning: {
    backgroundColor: "#fff3cd",
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#ffeeba",
    marginBottom: spacing.xs,
  },
  demoWarningText: {
    color: "#856404",
    fontSize: 16,
    fontFamily: fonts.bold,
    textAlign: "center",
  },
  demoSubtext: {
    color: "#856404",
    fontSize: 13,
    fontFamily: fonts.regular,
    textAlign: "center",
    marginTop: spacing.xs,
  },
  formCard: { padding: spacing.md, gap: spacing.sm },
  label: { fontSize: 14, fontFamily: fonts.semiBold, color: colors.text, marginTop: spacing.xs },
  input: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.sm,
    fontSize: 24,
    color: colors.text,
    fontFamily: fonts.bold,
    textAlign: "center",
  },
  presetContainer: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xs,
    justifyContent: "center",
  },
  presetChip: {
    backgroundColor: colors.primarySoft,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
  },
  presetText: {
    color: colors.primary,
    fontFamily: fonts.bold,
    fontSize: 16,
  },
});
