import { Platform } from "react-native";

export const colors = {
  background: "#F3F4F0",
  surface: "#FFFFFF",
  surfaceMuted: "#EAEBE6",
  primary: "#12503A",
  primaryDark: "#0E3E2D",
  primaryHover: "#1A6B4D",
  primarySoft: "#E4EFE9",
  ink: "#121513",
  inkSoft: "#1E2521",
  inkBorder: "#2A322D",
  accent: "#F7C561",
  text: "#121513",
  textMuted: "#6C736E",
  textFaint: "#8C938E",
  border: "#E5E7E2",
  borderStrong: "#C9CFC9",
  danger: "#B3251E",
  dangerSoft: "#FBE7E4",
  dangerBorder: "#EBC4C0",
  success: "#0B7A4E",
  successSoft: "#E4EFE9",
  live: "#0B7A4E",
  liveDot: "#8CF0BE",
  warning: "#7A4900",
  warningSoft: "#FBEFD6",
  warningBorder: "#E4C489",
  info: "#1E5B8F",
  infoSoft: "#E3EDF6",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const radius = {
  xs: 8,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 22,
  pill: 999,
};

export const fonts = {
  regular: undefined,
  medium: undefined,
  semiBold: undefined,
  bold: undefined,
  mono: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
};

export const shadows = {
  sm: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
};
