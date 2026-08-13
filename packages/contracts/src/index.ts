import { z } from "zod";

const password = z.string().min(8).max(128);
const optionalBooleanQuery = z
  .enum(["true", "false"])
  .transform((value) => value === "true")
  .optional();

export const residentLoginSchema = z.object({
  societyId: z.string().uuid().optional(),
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
  status: z.enum(["AVAILABLE", "MAINTENANCE", "INACTIVE", "BREAKDOWN"]).optional(),
  isReserve: z.boolean().optional(),
  hourlyRate: z.number().int().min(1).max(100_000).optional(),
  maintenanceReason: z.string().trim().max(1000).optional(),
  expectedReturnDate: z.string().datetime().optional(),
});

export const vehicleUpdateSchema = vehicleCreateSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "At least one field is required",
);

export const flatCreateSchema = z.object({
  number: z.string().trim().min(1).max(30),
  allocatedMinutes: z.number().int().min(0).max(10_080).default(960),
  year: z.number().int().min(2020).max(2100).optional(),
  weekNumber: z.number().int().min(1).max(53).optional(),
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
  allocatedMinutes: z.number().int().min(0).max(10_080),
  weekNumber: z.number().int().min(1).max(53).optional(),
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
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  status: z.enum([
    "BOOKED",
    "DRIVER_ASSIGNED",
    "OTP_PENDING",
    "IN_PROGRESS",
    "ACTIVE",
    "COMPLETED",
    "CANCELLED",
    "REASSIGNED",
    "AT_RISK",
  ]).optional(),
  flatId: z.string().uuid().optional(),
  vehicleId: z.string().uuid().optional(),
});

export const adminEntityListQuerySchema = paginationQuerySchema.extend({
  isActive: optionalBooleanQuery,
});

export const driverLoginSchema = z.object({
  phone: z.string().min(1, "Phone is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const driverCreateSchema = z.object({
  fullName: z.string().trim().min(2, "Name must be at least 2 characters").max(120),
  phoneNumber: z.string().trim().min(5, "Phone is required").max(20),
  email: z.string().email().optional().or(z.literal("")),
  licenseNumber: z.string().trim().min(1, "License number is required").max(50),
  isActive: z.boolean().optional(),
  vehicleId: z.string().uuid().optional().or(z.literal("")),
  password,
});

export const driverUpdateSchema = driverCreateSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "At least one field is required"
);

export const bookingAssignDriverSchema = z.object({
  driverId: z.string().uuid("Invalid driver ID"),
});

export type BookingRangeInput = z.infer<typeof bookingRangeSchema>;
export type BookingCreateInput = z.infer<typeof bookingCreateSchema>;

export const cancellationPenaltyUpdateSchema = z.object({
  amount: z.number().int().min(0, "Penalty amount cannot be negative").max(1_000_000),
});

export const penaltyApplySchema = z.object({
  penaltyRuleId: z.string().uuid(),
  notes: z.string().trim().max(1000).optional(),
});

export const rechargeRequestCreateSchema = z.object({
  amount: z.number().int().min(1, "Amount must be at least 1").max(1_000_000),
  notes: z.string().trim().max(1000).optional(),
});

export const rechargeRequestProcessSchema = z.object({
  action: z.enum(["APPROVE", "REJECT"]),
});

export const mockRechargeSchema = z.object({
  amount: z.number().int().min(1, "Amount must be positive").max(10000, "Maximum demo recharge is 10000"),
});

export const notificationReadSchema = z
  .object({
    notificationIds: z.array(z.string().uuid()).min(1).max(50),
  })
  .strict();

export const reportVehicleIssueSchema = z.object({
  // Optional: a breakdown can happen while the driver is idle, not only during
  // an assigned trip. Without one, the driver's own assigned vehicle is used.
  bookingId: z.string().uuid().optional(),
});

export const tripCompletionSchema = z.object({
  actualEndTime: z.iso.datetime({ offset: true }).optional(),
});
