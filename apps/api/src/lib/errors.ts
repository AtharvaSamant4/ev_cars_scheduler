import { Prisma } from "@society-ev/db";
import { ZodError } from "zod";

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

// Transport-level failures reaching the database. These surface from the pg
// driver rather than as a Prisma error code, so they cannot be matched on
// `code` the way P2002 and friends are.
const CONNECTION_FAILURE_PATTERNS = [
  "Connection terminated",
  "Connection ended",
  "connection timeout",
  "Can't reach database server",
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "ENOTFOUND",
];

export function connectionFailureMessage(error: unknown) {
  let current: unknown = error;

  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (current instanceof Error) {
      const matched = CONNECTION_FAILURE_PATTERNS.find((pattern) =>
        current instanceof Error ? current.message.includes(pattern) : false,
      );

      if (matched) {
        return current.message;
      }
    }

    current = (current as { cause?: unknown } | null)?.cause;
  }

  return null;
}

export function toAppError(error: unknown) {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof ZodError) {
    const flattened = error.flatten();
    const fieldErrors = flattened.fieldErrors as Record<string, string[] | undefined>;
    const fieldMessage = Object.entries(fieldErrors).find(
      ([, messages]) => messages && messages.length > 0,
    );
    const message = fieldMessage
      ? `${fieldMessage[0]}: ${fieldMessage[1]![0]}`
      : ((flattened.formErrors as string[])[0] ?? "The request contains invalid data");

    return new AppError(422, "VALIDATION_ERROR", message, flattened);
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return new AppError(
        409,
        "DUPLICATE_RESOURCE",
        "A resource with these details already exists",
      );
    }

    if (error.code === "P2025") {
      return new AppError(404, "NOT_FOUND", "The requested resource was not found");
    }

    if (error.code === "P2028" || error.code === "P2034") {
      return new AppError(
        503,
        "DATABASE_BUSY",
        "The service is temporarily busy. Please try again.",
      );
    }
  }

  const connectionFailure = connectionFailureMessage(error);
  if (connectionFailure || error instanceof Prisma.PrismaClientInitializationError) {
    // The database is unreachable, which is neither the caller's fault nor a
    // bug in this request. Say so honestly and mark it retryable. Logged as a
    // single line because the stack for a dropped socket carries no useful
    // frames and floods the server output when a poll loop retries.
    console.error(
      `Database unreachable: ${connectionFailure ?? "client failed to initialize"}`,
    );

    return new AppError(
      503,
      "DATABASE_UNAVAILABLE",
      "The service is temporarily unavailable. Please try again in a moment.",
    );
  }

  console.error(error);
  return new AppError(500, "INTERNAL_ERROR", "An unexpected error occurred");
}
