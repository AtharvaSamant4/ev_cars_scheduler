import { NextResponse } from "next/server";

import { authCookie } from "@/src/lib/auth";
import { apiRoute } from "@/src/lib/http";

export const runtime = "nodejs";

export const POST = apiRoute(async () => {
  const response = NextResponse.json({ data: { ok: true } });

  response.cookies.set(authCookie.name, "", {
    ...authCookie.options,
    maxAge: 0,
  });

  return response;
});
