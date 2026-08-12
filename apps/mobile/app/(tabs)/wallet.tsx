import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useWallet } from "@/src/api/hooks";
import { EmptyState, ErrorState, LoadingState } from "@/src/components/states";
import { errorMessage } from "@/src/lib/api";
import { bookingDate, bookingTime, currencyLabel } from "@/src/lib/format";
import { useAuthStore } from "@/src/store/auth";
import { colors, fonts, radius, spacing } from "@/src/theme";

export default function WalletScreen() {
  const { data, isLoading, isError, error, refetch, isRefetching } = useWallet();
  const timezone =
    useAuthStore((state) => state.user?.society.timezone) ?? "Asia/Kolkata";

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
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <FlatList
        contentContainerStyle={styles.content}
        data={data.transactions}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            tintColor={colors.primary}
            onRefresh={() => void refetch()}
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.kicker}>WALLET</Text>
            <View style={styles.balanceCard}>
              <Text style={styles.balanceLabel}>Available balance</Text>
              <Text style={styles.balanceAmount}>{currencyLabel(data.balance)}</Text>
              <Text style={styles.balanceHint}>
                Need a top-up? Ask the society office to credit your wallet.
              </Text>
            </View>
            <Text style={styles.transactionsTitle}>Activity</Text>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            title="No transactions yet"
            message="Your wallet history will appear here."
          />
        }
        renderItem={({ item, index }) => {
          const isDebit = item.type === "DEBIT" || item.type === "BOOKING_DEBIT" || item.type === "PENALTY";
          const isPenalty = item.type === "PENALTY";
          const isFirst = index === 0;
          const isLast = index === data.transactions.length - 1;
          return (
            <View
              style={[
                styles.transactionRow,
                isFirst && styles.transactionRowFirst,
                isLast && styles.transactionRowLast,
                isPenalty && styles.transactionRowPenalty,
              ]}
            >
              <View style={styles.transactionDetails}>
                <Text
                  style={[
                    styles.transactionDescription,
                    isPenalty && styles.transactionDescriptionPenalty,
                  ]}
                >
                  {item.description}
                </Text>
                <Text style={styles.transactionDate}>
                  {bookingDate(item.createdAt, timezone)} ·{" "}
                  {bookingTime(item.createdAt, timezone)}
                </Text>
              </View>
              <Text
                style={[
                  styles.transactionAmount,
                  isDebit ? styles.debit : styles.credit,
                ]}
              >
                {isDebit ? "−" : "+"}{currencyLabel(item.amount)}
              </Text>
            </View>
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
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.8,
  },
  balanceCard: {
    alignItems: "flex-start",
    padding: 20,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
  },
  balanceLabel: {
    color: colors.primarySoft,
    fontSize: 13,
  },
  balanceAmount: {
    color: colors.surface,
    fontSize: 40,
    fontWeight: "700",
    marginTop: spacing.xs,
    letterSpacing: -0.5,
    fontFamily: fonts.mono,
  },
  balanceHint: {
    color: colors.primarySoft,
    fontSize: 13,
    lineHeight: 19,
    marginTop: spacing.md,
  },
  transactionsTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "600",
    marginTop: spacing.md,
  },
  transactionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  transactionRowFirst: {
    borderTopWidth: 1,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  transactionRowLast: {
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
  transactionRowPenalty: {
    backgroundColor: colors.dangerSoft,
  },
  transactionDetails: {
    flex: 1,
    paddingRight: spacing.md,
  },
  transactionDescription: {
    color: colors.text,
    fontSize: 14.5,
    fontWeight: "600",
  },
  transactionDescriptionPenalty: {
    color: colors.danger,
  },
  transactionDate: {
    color: colors.textFaint,
    fontSize: 12,
    marginTop: 3,
  },
  transactionAmount: {
    fontSize: 15,
    fontWeight: "600",
    fontFamily: fonts.mono,
  },
  credit: {
    color: colors.live,
  },
  debit: {
    color: colors.danger,
  },
});
