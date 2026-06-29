import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useWallet } from "@/src/api/hooks";
import { Card } from "@/src/components/card";
import { EmptyState, ErrorState, LoadingState } from "@/src/components/states";
import { errorMessage } from "@/src/lib/api";
import { colors, radius, spacing } from "@/src/theme";

import { Button } from "@/src/components/button";

import { useRouter } from "expo-router";

export default function WalletScreen() {
  const router = useRouter();
  const { data, isLoading, isError, error, refetch, isRefetching } = useWallet();

  if (isLoading) {
    return <LoadingState label="Loading wallet..." />;
  }

  if (isError || !data) {
    return (
      <ErrorState
        message={errorMessage(error)}
        onRetry={() => void refetch()}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["left", "right"]}>
      <FlatList
        contentContainerStyle={styles.content}
        data={data.transactions}
        keyExtractor={(item: any) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            tintColor={colors.primary}
            onRefresh={() => void refetch()}
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.kicker}>MY WALLET</Text>
            <Card style={styles.balanceCard}>
              <Text style={styles.balanceLabel}>Available Balance</Text>
              <Text style={styles.balanceAmount}>₹{data.balance}</Text>
              <View style={{ marginTop: spacing.lg, width: "100%" }}>
                <Button
                  label="Add Money"
                  onPress={() => router.push("/show-qr")}
                />
              </View>
            </Card>
            <Text style={styles.transactionsTitle}>Recent Transactions</Text>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            title="No transactions yet"
            message="Your wallet history will appear here."
          />
        }
        renderItem={({ item }: { item: any }) => {
          const isDebit = item.type === "DEBIT" || item.type === "BOOKING_DEBIT" || item.type === "PENALTY";
          return (
            <Card style={styles.transactionCard}>
              <View style={styles.transactionRow}>
                <View style={styles.transactionDetails}>
                  <Text style={styles.transactionDescription}>{item.description}</Text>
                  <Text style={styles.transactionDate}>
                    {new Date(item.createdAt).toLocaleString([], {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                </View>
                <View style={styles.transactionAmountContainer}>
                  <Text
                    style={[
                      styles.transactionAmount,
                      isDebit ? styles.debit : styles.credit,
                    ]}
                  >
                    {isDebit ? "-" : "+"}₹{item.amount}
                  </Text>
                </View>
              </View>
            </Card>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
    gap: spacing.md,
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },
  header: {
    gap: spacing.md,
    marginBottom: spacing.xs,
  },
  kicker: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  balanceCard: {
    alignItems: "center",
    paddingVertical: spacing.xl,
    backgroundColor: colors.surface,
    borderColor: colors.primarySoft,
    borderWidth: 2,
  },
  balanceLabel: {
    color: colors.textMuted,
    fontSize: 16,
    fontWeight: "700",
  },
  balanceAmount: {
    color: colors.primary,
    fontSize: 48,
    fontWeight: "900",
    marginTop: spacing.xs,
  },
  transactionsTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "900",
    marginTop: spacing.md,
  },
  transactionCard: {
    padding: spacing.md,
  },
  transactionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  transactionDetails: {
    flex: 1,
    paddingRight: spacing.md,
  },
  transactionDescription: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  transactionDate: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: spacing.xs,
  },
  transactionAmountContainer: {
    alignItems: "flex-end",
  },
  transactionAmount: {
    fontSize: 18,
    fontWeight: "900",
  },
  credit: {
    color: colors.success,
  },
  debit: {
    color: colors.danger,
  },
});
