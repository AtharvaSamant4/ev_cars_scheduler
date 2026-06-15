"use client";

import { useEffect, useState } from "react";

import { errorMessage } from "./api";

type LoadState<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
};

export function useAdminData<T>(loader: () => Promise<T>, keys: unknown[]) {
  const [state, setState] = useState<LoadState<T>>({
    data: null,
    error: null,
    loading: true,
  });

  async function reload() {
    setState((current) => ({ ...current, error: null, loading: true }));

    try {
      const data = await loader();
      setState({ data, error: null, loading: false });
    } catch (error) {
      setState({ data: null, error: errorMessage(error), loading: false });
    }
  }

  useEffect(() => {
    queueMicrotask(() => {
      void reload();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, keys);

  return { ...state, reload };
}
