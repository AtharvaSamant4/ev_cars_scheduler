import { z } from "zod";

const password = z.string().min(8).max(128);
const optionalBooleanQuery = z
  .enum(["true", "false"])
  .transform((value) => value === "true")
  .optional();

export const residentLoginSchema = z.object({
  flatNumber: z.string().trim().min(1).max(30),
  password,
});

export const adminLoginSchema = z.object({
  email: z.email().trim().toLowerCase(),
  password,
});

export const bookingRangeSchema = z.object({
  startTime: z.iso.datetime({ offset: true }),
  endTime: z.iso.datetime({ offset: true }),
});

export const bookingCreateSchema = bookingRangeSchema.extend({
  vehicleId: z.string().uuid(),
});

export const bookingListQuerySchema = z.object({
  view: z.enum(["upcoming", "history"]).default("upcoming"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const vehicleCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  registrationNumber: z.string().trim().min(3).max(32),
  status: z.enum(["AVAILABLE", "MAINTENANCE", "INACTIVE"]).optional(),
});

export const vehicleUpdateSchema = vehicleCreateSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "At least one field is required",
);

export const flatCreateSchema = z.object({
  number: z.string().trim().min(1).max(30),
  allocatedMinutes: z.number().int().min(0).default(52_560),
  year: z.number().int().min(2020).max(2100).optional(),
});

export const flatUpdateSchema = z
  .object({
    number: z.string().trim().min(1).max(30).optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    "At least one field is required",
  );

export const quotaUpdateSchema = z.object({
  allocatedMinutes: z.number().int().min(0),
});

export const residentCreateSchema = z.object({
  flatId: z.uuid(),
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(7).max(20),
  password,
});

export const residentUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    phone: z.string().trim().min(7).max(20).optional(),
    password: password.optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    "At least one field is required",
  );

export const adminBookingListQuerySchema = paginationQuerySchema.extend({
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  status: z.enum(["BOOKED", "COMPLETED", "CANCELLED"]).optional(),
  flatId: z.uuid().optional(),
  vehicleId: z.uuid().optional(),
});

export const adminEntityListQuerySchema = paginationQuerySchema.extend({
  isActive: optionalBooleanQuery,
});

export type BookingRangeInput = z.infer<typeof bookingRangeSchema>;
export type BookingCreateInput = z.infer<typeof bookingCreateSchema>;
