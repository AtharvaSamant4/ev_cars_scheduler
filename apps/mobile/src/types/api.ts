export type BookingStatus = "BOOKED" | "DRIVER_ASSIGNED" | "OTP_PENDING" | "IN_PROGRESS" | "ACTIVE" | "COMPLETED" | "CANCELLED" | "REASSIGNED" | "AT_RISK";

type SessionUserBase = {
  id: string;
  name: string;
  phone?: string | null;
  society: {
    id: string;
    name: string;
    timezone: string;
  };
};

export type ResidentUser =
  | (SessionUserBase & {
      role: "RESIDENT";
      flat: {
        id: string;
        number: string;
      };
    })
  | (SessionUserBase & {
      role: "DRIVER";
      flat?: never;
    });

export type ResidentSession = {
  token: string;
  user: ResidentUser;
};

export type Quota = {
  id?: string;
  flatId?: string;
  year: number;
  weekNumber?: number;
  allocatedMinutes: number;
  usedMinutes: number;
  remainingMinutes: number;
};

export type VehicleSummary = {
  id: string;
  name: string;
  registrationNumber: string;
};

export type Booking = {
  id: string;
  quotaYear?: number;
  quotaWeek?: number;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  status: BookingStatus;
  effectiveStatus: BookingStatus;
  otp?: string | null;
  otpGeneratedAt?: string | null;
  otpExpiresAt?: string | null;
  otpVerifiedAt?: string | null;
  otpAttempts?: number;
  otpVerified?: boolean;
  actualRideStartTime?: string | null;
  actualEndTime?: string | null;
  startedAt?: string | null;
  cancelledAt: string | null;
  driver?: {
    id: string;
    fullName: string;
    phoneNumber: string;
  } | null;
  invoice?: {
    id: string;
    bookingId: string;
    subtotal: number;
    penaltyAmount: number;
    totalAmount: number;
    generatedAt: string;
  } | null;
  vehicle: VehicleSummary;
  reassignedVehicle?: VehicleSummary | null;
};

export type Notification = {
  id: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
};

export type Dashboard = {
  quota: Quota;
  upcomingBookings: Booking[];
};

export type Availability = {
  available: boolean;
  availableVehicleCount: number;
  availableVehicles: VehicleSummary[];
  durationMinutes: number;
  quota: Quota & {
    sufficient: boolean;
  };
};

export type BookingMutationResult = {
  booking: Booking;
  quota: Quota;
};

export type PaginatedBookings = {
  items: Booking[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

export type ApiErrorPayload = {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
};
