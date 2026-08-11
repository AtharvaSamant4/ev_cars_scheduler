import { useAuthStore } from "@/src/store/auth";
import type { ApiErrorPayload } from "@/src/types/api";

const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
const API_URL = (
  configuredApiUrl || "http://127.0.0.1:3000/api/v1"
).replace(/\/$/, "");

type QueryValue = string | number | boolean;

function appendQuery(
  url: URL,
  query: Record<string, QueryValue | undefined>,
) {
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
}

function relativeUrlPath(path: string) {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) {
    throw new Error("API paths must be root-relative");
  }

  return path.slice(1);
}

export function buildApiUrl(
  path: string,
  query: Record<string, QueryValue | undefined> = {},
) {
  const relativePath = relativeUrlPath(path);
  const baseUrl = new URL(`${API_URL}/`);
  const url = new URL(relativePath, baseUrl);
  if (
    url.origin !== baseUrl.origin ||
    !url.pathname.startsWith(baseUrl.pathname)
  ) {
    throw new Error("API path escaped the configured API base URL");
  }
  appendQuery(url, query);
  return url.toString();
}

export function buildConfiguredAppUrl(
  path: string,
  query: Record<string, QueryValue | undefined> = {},
) {
  if (!configuredApiUrl) {
    throw new Error(
      "EXPO_PUBLIC_API_URL is required for QR demo links on a physical device",
    );
  }

  const apiUrl = new URL(configuredApiUrl);
  if (apiUrl.protocol !== "http:" && apiUrl.protocol !== "https:") {
    throw new Error("EXPO_PUBLIC_API_URL must use HTTP or HTTPS");
  }

  const relativePath = relativeUrlPath(path);
  const url = new URL(relativePath, `${apiUrl.origin}/`);
  appendQuery(url, query);
  return url.toString();
}

export function isConfiguredAppUrl(value: string, expectedPath: string) {
  try {
    const expected = new URL(buildConfiguredAppUrl(expectedPath));
    const scanned = new URL(value);
    return (
      scanned.protocol === expected.protocol &&
      scanned.host === expected.host &&
      !scanned.username &&
      !scanned.password &&
      scanned.pathname.replace(/\/$/, "") ===
        expected.pathname.replace(/\/$/, "")
    );
  } catch {
    return false;
  }
}

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

  const response = await fetch(buildApiUrl(path), {
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
