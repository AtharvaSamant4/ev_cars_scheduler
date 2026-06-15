import { useAuthStore } from "@/src/store/auth";
import type { ApiErrorPayload } from "@/src/types/api";

const API_URL = (
  process.env.EXPO_PUBLIC_API_URL ?? "http://127.0.0.1:3000/api/v1"
).replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = useAuthStore.getState().token;
  const headers = new Headers(options.headers);

  headers.set("Accept", "application/json");

  if (options.body) {
    headers.set("Content-Type", "application/json");
  }

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });
  const payload = (await response.json().catch(() => ({}))) as
    | { data: T }
    | ApiErrorPayload;

  if (!response.ok) {
    const error = "error" in payload ? payload.error : undefined;

    if (response.status === 401 && !path.includes("/auth/resident/login")) {
      await useAuthStore.getState().logout();
    }

    throw new ApiError(
      response.status,
      error?.code ?? "REQUEST_FAILED",
      error?.message ?? "The request could not be completed",
      error?.details,
    );
  }

  return (payload as { data: T }).data;
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong";
}
