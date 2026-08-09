import { compare } from "bcryptjs";

import { prisma, UserRole } from "@society-ev/db";

import { issueToken } from "@/src/lib/auth";
import { AppError } from "@/src/lib/errors";

export async function loginResident(
  flatNumber: string,
  password: string,
  requestedSocietyId?: string,
) {
  const normalizedFlatNumber = flatNumber.trim().toUpperCase();
  let societyId = requestedSocietyId;

  if (!societyId) {
    const matches = await prisma.user.findMany({
      where: {
        role: UserRole.RESIDENT,
        isActive: true,
        flat: { number: normalizedFlatNumber, isActive: true },
      },
      select: { societyId: true },
      distinct: ["societyId"],
      take: 2,
    });

    if (matches.length > 1) {
      throw new AppError(
        400,
        "SOCIETY_REQUIRED",
        "Society ID is required for this flat number",
      );
    }

    societyId = matches[0]?.societyId;
  }

  const user = await prisma.user.findFirst({
    where: {
      societyId,
      role: UserRole.RESIDENT,
      isActive: true,
      flat: {
        number: normalizedFlatNumber,
        isActive: true,
      },
    },
    include: {
      flat: true,
      society: true,
    },
  });

  if (!user || !(await compare(password, user.passwordHash))) {
    throw new AppError(401, "AUTH_INVALID", "Invalid flat number or password");
  }

  const token = await issueToken(user);

  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      role: user.role,
      flat: {
        id: user.flat!.id,
        number: user.flat!.number,
      },
      society: {
        id: user.society.id,
        name: user.society.name,
        timezone: user.society.timezone,
      },
    },
  };
}

export async function loginAdmin(email: string, password: string) {
  const user = await prisma.user.findFirst({
    where: {
      email: email.trim().toLowerCase(),
      role: UserRole.ADMIN,
      isActive: true,
    },
    include: { society: true },
  });

  if (!user || !(await compare(password, user.passwordHash))) {
    throw new AppError(401, "AUTH_INVALID", "Invalid email or password");
  }

  const token = await issueToken(user);

  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      society: {
        id: user.society.id,
        name: user.society.name,
        timezone: user.society.timezone,
      },
    },
  };
}

export async function driverLogin(input: {
  phone: string;
  password?: string;
}) {
  const user = await prisma.user.findFirst({
    where: {
      phone: input.phone.trim(),
      role: UserRole.DRIVER,
      isActive: true,
    },
    include: { society: true },
  });

  if (!user || !(await compare(input.password || "", user.passwordHash))) {
    throw new AppError(401, "AUTH_INVALID", "Invalid phone number or password");
  }

  const token = await issueToken(user);

  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      phone: user.phone,
      role: user.role,
      society: {
        id: user.society.id,
        name: user.society.name,
        timezone: user.society.timezone,
      },
    },
  };
}
