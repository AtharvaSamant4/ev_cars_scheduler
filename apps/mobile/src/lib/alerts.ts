import { Alert, Platform } from "react-native";

type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
};

export function confirmAction({
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmOptions) {
  if (Platform.OS === "web") {
    if (window.confirm(`${title}\n\n${message}`)) {
      void onConfirm();
    } else {
      onCancel?.();
    }
    return;
  }

  Alert.alert(
    title,
    message,
    [
      { text: cancelLabel, style: "cancel", onPress: onCancel },
      {
        text: confirmLabel,
        style: destructive ? "destructive" : "default",
        onPress: () => void onConfirm(),
      },
    ],
    { cancelable: true, onDismiss: onCancel },
  );
}

export function notify(title: string, message: string) {
  if (Platform.OS === "web") {
    window.alert(`${title}\n\n${message}`);
    return;
  }

  Alert.alert(title, message);
}
