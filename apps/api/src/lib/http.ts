import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { AppError, toAppError } from "./errors";

type RouteContext = {
  params: Promise<Record<string, string>>;
};

type RouteHandler = (
  request: NextRequest,
  context: RouteContext,
) => Promise<Response>;

export function apiRoute(handler: RouteHandler) {
  return async (request: NextRequest, context: RouteContext) => {
    try {
      return await handler(request, context);
    } catch (error) {
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

export function parseQuery<TSchema extends z.ZodType>(
  request: NextRequest,
  schema: TSchema,
): z.infer<TSchema> {
  return schema.parse(Object.fromEntries(request.nextUrl.searchParams));
}

export async function routeId(context: RouteContext, name = "id") {
  const params = await context.params;
  const value = params[name];

  if (!value) {
    throw new AppError(400, "INVALID_ROUTE", `Missing route parameter: ${name}`);
  }

  return value;
}
