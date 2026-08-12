import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors } from "@/src/theme";

type IoniconName = keyof typeof Ionicons.glyphMap;

// Keyed by tab title rather than route name, since resident ("Home") and
// driver ("Jobs") tab groups both have a screen literally named "index".
const ICONS: Record<string, { active: IoniconName; inactive: IoniconName }> = {
  Home: { active: "home", inactive: "home-outline" },
  Book: { active: "car-sport", inactive: "car-sport-outline" },
  Trips: { active: "calendar", inactive: "calendar-outline" },
  Wallet: { active: "wallet", inactive: "wallet-outline" },
  Alerts: { active: "notifications", inactive: "notifications-outline" },
  Jobs: { active: "briefcase", inactive: "briefcase-outline" },
  History: { active: "time", inactive: "time-outline" },
  Vehicle: { active: "car", inactive: "car-outline" },
};

export function TabBar({ state, descriptors, navigation }: any) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {state.routes.map((route: any, index: number) => {
        const { options } = descriptors[route.key];
        const label = options.title ?? route.name;
        const focused = state.index === index;
        const icon = ICONS[label];

        const onPress = () => {
          const event = navigation.emit({
            type: "tabPress",
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={focused ? { selected: true } : {}}
            key={route.key}
            onPress={onPress}
            style={styles.tab}
          >
            <View style={[styles.indicator, focused && styles.indicatorActive]} />
            {icon ? (
              <Ionicons
                name={focused ? icon.active : icon.inactive}
                size={20}
                color={focused ? colors.primary : colors.textFaint}
              />
            ) : null}
            <Text style={[styles.label, focused && styles.labelActive]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    paddingTop: 8,
    paddingHorizontal: 10,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  tab: {
    flex: 1,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  indicator: {
    width: 18,
    height: 3,
    borderRadius: 2,
    backgroundColor: "transparent",
  },
  indicatorActive: {
    backgroundColor: colors.primary,
  },
  label: {
    color: colors.textFaint,
    fontSize: 11.5,
    fontWeight: "500",
  },
  labelActive: {
    color: colors.primary,
    fontWeight: "600",
  },
});
