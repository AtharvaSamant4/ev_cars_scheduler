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

export function toAppError(error: unknown) {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof ZodError) {
    return new AppError(
      422,
      "VALIDATION_ERROR",
      "The request contains invalid data",
      error.flatten(),
    );
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return new AppError(
        409,
        "DUPLICATE_RESOURCE",
        "A resource with these details already exists",
        error.meta,
      );
    }

    if (error.code === "P2025") {
      return new AppError(404, "NOT_FOUND", "The requested resource was not found");
    }
  }

  console.error(error);
  return new AppError(500, "INTERNAL_ERROR", "An unexpected error occurred");
}
