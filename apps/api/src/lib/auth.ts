import { prisma, UserRole } from "@society-ev/db";
import { jwtVerify, SignJWT } from "jose";
import { NextRequest } from "next/server";

import { AppError } from "./errors";

const COOKIE_NAME = "ev_session";
const INSECURE_JWT_SECRET_PLACEHOLDERS = new Set([
  "replace-with-at-least-32-random-characters",
]);

export type AuthUser = {
  id: string;
  societyId: string;
  flatId: string | null;
  role: UserRole;
  name: string;
};

function jwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (
    !secret ||
    secret.length < 32 ||
    INSECURE_JWT_SECRET_PLACEHOLDERS.has(secret)
  ) {
    throw new Error(
      "JWT_SECRET must be a non-placeholder secret containing at least 32 characters",
    );
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

  return request.cookies.get(COOKIE_NAME)?.value;
}

async function activeAuthUser(subject: string): Promise<AuthUser> {
  const user = await prisma.user.findUnique({
    where: { id: subject },
    select: {
      id: true,
      societyId: true,
      flatId: true,
      role: true,
      name: true,
      isActive: true,
      flat: { select: { isActive: true } },
    },
  });

  if (
    !user?.isActive ||
    (user.role === UserRole.RESIDENT && (!user.flatId || !user.flat?.isActive))
  ) {
    throw new AppError(401, "AUTH_INVALID", "The account is inactive");
  }

  return {
    id: user.id,
    societyId: user.societyId,
    flatId: user.flatId,
    role: user.role,
    name: user.name,
  };
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

  const user = await activeAuthUser(subject);

  if (requiredRole && user.role !== requiredRole) {
    throw new AppError(403, "FORBIDDEN", "This action is not permitted");
  }

  return user;
}

export async function issueInvoiceDownloadToken(
  user: AuthUser,
  bookingId: string,
) {
  return new SignJWT({
    scope: "invoice:download",
    bookingId,
    societyId: user.societyId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("2m")
    .sign(jwtSecret());
}

export async function requireInvoiceDownloadAuth(
  request: NextRequest,
  bookingId: string,
) {
  try {
    return await requireAuth(request);
  } catch (error) {
    if (!(error instanceof AppError) || error.status !== 401) {
      throw error;
    }
  }

  const token = request.nextUrl.searchParams.get("downloadToken");
  if (!token) {
    throw new AppError(401, "AUTH_INVALID", "Authentication is required");
  }

  try {
    const verified = await jwtVerify(token, jwtSecret());
    const subject = verified.payload.sub;
    if (
      !subject ||
      verified.payload.scope !== "invoice:download" ||
      verified.payload.bookingId !== bookingId
    ) {
      throw new Error("Invalid invoice download scope");
    }

    const user = await activeAuthUser(subject);
    if (verified.payload.societyId !== user.societyId) {
      throw new Error("Invoice download society changed");
    }

    return user;
  } catch {
    throw new AppError(401, "AUTH_INVALID", "The download link is invalid or expired");
  }
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
