import { create } from "zustand";

import {
  clearSession,
  readSession,
  saveSession,
} from "@/src/lib/session-storage";
import type { ResidentSession, ResidentUser } from "@/src/types/api";

type AuthState = {
  hydrated: boolean;
  token: string | null;
  user: ResidentUser | null;
  hydrate: () => Promise<void>;
  setSession: (session: ResidentSession) => Promise<void>;
  logout: () => Promise<void>;
};

export const useAuthStore = create<AuthState>((set) => ({
  hydrated: false,
  token: null,
  user: null,
  hydrate: async () => {
    const session = await readSession();
    set({
      hydrated: true,
      token: session?.token ?? null,
      user: session?.user ?? null,
    });
  },
  setSession: async ({ token, user }) => {
    await saveSession(token, user);
    set({ token, user });
  },
  logout: async () => {
    await clearSession();
    set({ token: null, user: null });
  },
}));
