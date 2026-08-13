import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { AppError, connectionFailureMessage, toAppError } from "./errors";

// A dropped connection means the query never committed: Postgres rolls back an
// open transaction when its socket dies. Retrying is therefore safe, but only
// for methods that are idempotent by definition -- replaying a POST could
// double-charge a wallet, so those surface a 503 and let the caller decide.
const RETRYABLE_METHODS = new Set(["GET", "HEAD"]);
const MAX_CONNECTION_ATTEMPTS = 3;

function connectionBackoffMs(attempt: number) {
  return attempt * 120 + Math.floor(Math.random() * 80);
}

type RouteContext = {
  params: Promise<Record<string, string>>;
};

type RouteHandler = (
  request: NextRequest,
  context: RouteContext,
) => Promise<Response>;

export function apiRoute(handler: RouteHandler) {
  return async (request: NextRequest, context: RouteContext) => {
    const canRetry = RETRYABLE_METHODS.has(request.method);

    for (let attempt = 1; ; attempt += 1) {
      try {
        return await handler(request, context);
      } catch (error) {
        if (
          canRetry &&
          attempt < MAX_CONNECTION_ATTEMPTS &&
          connectionFailureMessage(error)
        ) {
          // Opening a fresh connection also wakes a suspended database, so this
          // covers cold starts as well as dropped sockets and failovers.
          await new Promise((resolve) =>
            setTimeout(resolve, connectionBackoffMs(attempt)),
          );
          continue;
        }

        const appError = toAppError(error);
        return NextResponse.json(
          {
            error: {
              code: appError.code,
              message: appError.message,
              details: appError.details,
            },
          },
          { status: appError.status },
        );
      }
    }
  };
}

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ data }, { status });
}

export async function parseBody<TSchema extends z.ZodType>(
  request: NextRequest,
  schema: TSchema,
): Promise<z.infer<TSchema>> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    throw new AppError(400, "INVALID_JSON", "Request body must be valid JSON");
  }

  return schema.parse(body);
}

export async function parseOptionalBody<TSchema extends z.ZodType>(
  request: NextRequest,
  schema: TSchema,
): Promise<z.infer<TSchema>> {
  const text = await request.text();
  if (!text.trim()) {
    return schema.parse({});
  }

  try {
    return schema.parse(JSON.parse(text));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new AppError(400, "INVALID_JSON", "Request body must be valid JSON");
    }
    throw error;
  }
}

export function parseQuery<TSchema extends z.ZodType>(
  request: NextRequest,
  schema: TSchema,
): z.infer<TSchema> {
  return schema.parse(Object.fromEntries(request.nextUrl.searchParams));
}

export async function routeId(context: RouteContext, name = "id") {
  const value = await routeParam(context, name);

  if (!z.string().uuid().safeParse(value).success) {
    throw new AppError(400, "INVALID_ROUTE", `Invalid route parameter: ${name}`);
  }

  return value;
}

export async function routeParam(context: RouteContext, name: string) {
  const params = await context.params;
  const value = params[name];

  if (!value) {
    throw new AppError(400, "INVALID_ROUTE", `Missing route parameter: ${name}`);
  }

  return value;
}
