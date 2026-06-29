import { prisma, UserRole } from "@society-ev/db";
import { jwtVerify, SignJWT } from "jose";
import { NextRequest } from "next/server";

import { AppError } from "./errors";

const COOKIE_NAME = "ev_session";

export type AuthUser = {
  id: string;
  societyId: string;
  flatId: string | null;
  role: UserRole;
  name: string;
};

function jwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET must contain at least 32 characters");
  }

  return new TextEncoder().encode(secret);
}

export async function issueToken(user: AuthUser) {
  return new SignJWT({
    societyId: user.societyId,
    flatId: user.flatId,
    role: user.role,
    name: user.name,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(process.env.JWT_EXPIRES_IN ?? "7d")
    .sign(jwtSecret());
}

function requestToken(request: NextRequest) {
  const authorization = request.headers.get("authorization");

  if (authorization?.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length);
  }

  const queryToken = request.nextUrl?.searchParams?.get("token");
  if (queryToken) return queryToken;

  return request.cookies.get(COOKIE_NAME)?.value;
}

export async function requireAuth(
  request: NextRequest,
  requiredRole?: UserRole,
): Promise<AuthUser> {
  const token = requestToken(request);

  if (!token) {
    throw new AppError(401, "AUTH_INVALID", "Authentication is required");
  }

  let subject: string | undefined;

  try {
    const verified = await jwtVerify(token, jwtSecret());
    subject = verified.payload.sub;
  } catch {
    throw new AppError(401, "AUTH_INVALID", "The session is invalid or expired");
  }

  if (!subject) {
    throw new AppError(401, "AUTH_INVALID", "The session is invalid");
  }

  const user = await prisma.user.findUnique({
    where: { id: subject },
    select: {
      id: true,
      societyId: true,
      flatId: true,
      role: true,
      name: true,
      isActive: true,
    },
  });

  if (!user?.isActive) {
    throw new AppError(401, "AUTH_INVALID", "The account is inactive");
  }

  if (requiredRole && user.role !== requiredRole) {
    throw new AppError(403, "FORBIDDEN", "This action is not permitted");
  }

  return user;
}

export const authCookie = {
  name: COOKIE_NAME,
  options: {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  },
};
