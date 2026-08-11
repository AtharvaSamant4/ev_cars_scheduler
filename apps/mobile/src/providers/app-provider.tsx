import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type PropsWithChildren } from "react";

import { useAuthStore } from "@/src/store/auth";

function AuthScopedQueryProvider({ children }: PropsWithChildren) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            staleTime: 30_000,
          },
          mutations: {
            retry: 0,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}

export function AppProvider({ children }: PropsWithChildren) {
  const hydrate = useAuthStore((state) => state.hydrate);
  const authenticatedUserId = useAuthStore((state) => state.user?.id ?? null);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  return (
    <AuthScopedQueryProvider key={authenticatedUserId ?? "anonymous"}>
      {children}
    </AuthScopedQueryProvider>
  );
}
