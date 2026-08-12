"use client";

import type { ApiEnvelope } from "./types";

export class AdminApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AdminApiError";
  }
}

export async function adminApi<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);

  headers.set("Accept", "application/json");

  if (options.body) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;

  try {
    response = await fetch(`/api/v1${path}`, {
      ...options,
      credentials: "include",
      headers,
    });
  } catch {
    throw new AdminApiError(
      0,
      "NETWORK_ERROR",
      "Can't reach the server right now. Check your connection and try again.",
    );
  }

  const payload = (await response.json().catch(() => ({}))) as
    | ApiEnvelope<T>
    | { error?: { code?: string; message?: string } };

  if (!response.ok) {
    const error = "error" in payload ? payload.error : undefined;
    throw new AdminApiError(
      response.status,
      error?.code ?? "REQUEST_FAILED",
      error?.message ?? "The request could not be completed",
    );
  }

  return (payload as ApiEnvelope<T>).data;
}

export function errorMessage(error: unknown) {
  // Only AdminApiError carries a message intended for an admin to read; other
  // runtime faults have developer-facing messages that shouldn't reach the UI.
  if (error instanceof AdminApiError) {
    return error.message;
  }

  return "Something went wrong. Please try again.";
}

export function qs(params: Record<string, string | number | boolean | undefined>) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      search.set(key, String(value));
    }
  }

  const value = search.toString();
  return value ? `?${value}` : "";
}
