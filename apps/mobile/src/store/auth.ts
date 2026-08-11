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
    try {
      const session = await readSession();
      set({
        hydrated: true,
        token: session?.token ?? null,
        user: session?.user ?? null,
      });
    } catch {
      set({ hydrated: true, token: null, user: null });
    }
  },
  setSession: async ({ token, user }) => {
    try {
      await saveSession(token, user);
      set({ token, user });
    } catch (error) {
      await clearSession().catch(() => undefined);
      set({ token: null, user: null });
      throw error;
    }
  },
  logout: async () => {
    await clearSession().catch(() => undefined);
    set({ token: null, user: null });
  },
}));
