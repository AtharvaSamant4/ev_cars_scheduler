export type BookingStatus = "BOOKED" | "DRIVER_ASSIGNED" | "OTP_PENDING" | "IN_PROGRESS" | "ACTIVE" | "COMPLETED" | "CANCELLED" | "REASSIGNED" | "AT_RISK";

export type VehicleStatus =
  | "AVAILABLE"
  | "MAINTENANCE"
  | "INACTIVE"
  | "BREAKDOWN";

export type TransactionType =
  | "CREDIT"
  | "DEBIT"
  | "BOOKING_DEBIT"
  | "REFUND"
  | "PENALTY"
  | "RECHARGE";

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

export type DriverVehicle = VehicleSummary & {
  status: VehicleStatus;
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
  /**
   * Minutes by which the vehicle for this booking is overdue back from an
   * earlier trip, or null when it is not held up.
   */
  vehicleDelayedMinutes?: number | null;
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

export type DriverTrip = {
  id: string;
  startTime: string;
  endTime: string;
  /** When the OTP was verified and the ride actually began. */
  actualRideStartTime?: string | null;
  status: BookingStatus;
  effectiveStatus?: BookingStatus;
  user: {
    name: string;
    phone?: string | null;
  };
  flat: {
    number: string;
  };
  effectiveVehicle: DriverVehicle;
};

export type DriverDashboard = {
  vehicle: DriverVehicle | null;
  today: DriverTrip[];
  upcoming: DriverTrip[];
};

export type DriverBookingActionResult = {
  id: string;
  status: BookingStatus;
  effectiveStatus: BookingStatus;
};

export type WalletTransaction = {
  id: string;
  amount: number;
  type: TransactionType;
  description: string;
  bookingId?: string | null;
  createdAt: string;
};

export type Wallet = {
  id: string;
  userId: string;
  balance: number;
  transactions: WalletTransaction[];
};

export type InvoiceDownloadToken = {
  downloadToken: string | null;
  available: boolean;
};

export type Dashboard = {
  quota: Quota;
  upcomingBookings: Booking[];
};

export type AvailableVehicle = VehicleSummary & {
  hourlyRate: number;
  estimatedCost: number;
  affordable: boolean;
};

export type Availability = {
  available: boolean;
  availableVehicleCount: number;
  availableVehicles: AvailableVehicle[];
  walletBalance: number;
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
