import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import type { ResidentUser } from "@/src/types/api";

const TOKEN_KEY = "society-ev-token";
const USER_KEY = "society-ev-user";

async function getItem(key: string) {
  if (Platform.OS === "web") {
    return typeof window === "undefined" ? null : window.localStorage.getItem(key);
  }

  return SecureStore.getItemAsync(key);
}

async function setItem(key: string, value: string) {
  if (Platform.OS === "web") {
    window.localStorage.setItem(key, value);
    return;
  }

  await SecureStore.setItemAsync(key, value);
}

async function deleteItem(key: string) {
  if (Platform.OS === "web") {
    window.localStorage.removeItem(key);
    return;
  }

  await SecureStore.deleteItemAsync(key);
}

export async function readSession() {
  const [token, userJson] = await Promise.all([
    getItem(TOKEN_KEY),
    getItem(USER_KEY),
  ]);

  if (!token || !userJson) {
    return null;
  }

  try {
    return {
      token,
      user: JSON.parse(userJson) as ResidentUser,
    };
  } catch {
    await clearSession();
    return null;
  }
}

export async function saveSession(token: string, user: ResidentUser) {
  await Promise.all([
    setItem(TOKEN_KEY, token),
    setItem(USER_KEY, JSON.stringify(user)),
  ]);
}

export async function clearSession() {
  await Promise.all([deleteItem(TOKEN_KEY), deleteItem(USER_KEY)]);
}
