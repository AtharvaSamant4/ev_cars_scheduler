export type ApiEnvelope<T> = { data: T };

export type Paginated<T> = {
  items: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

export type AdminUser = {
  id: string;
  name: string;
  email?: string | null;
  role: "ADMIN" | "RESIDENT";
  society: {
    id: string;
    name: string;
    timezone: string;
  };
};

export type AdminSession = {
  token: string;
  user: AdminUser;
};

export type Dashboard = {
  activeFlats: number;
  activeResidents: number;
  vehicles: Record<VehicleStatus, number>;
  bookings: {
    total: number;
    upcoming: number;
  };
};

export type VehicleStatus = "AVAILABLE" | "MAINTENANCE" | "INACTIVE" | "BREAKDOWN";
export type BookingStatus =
  | "BOOKED"
  | "DRIVER_ASSIGNED"
  | "OTP_PENDING"
  | "IN_PROGRESS"
  | "ACTIVE"
  | "COMPLETED"
  | "CANCELLED"
  | "REASSIGNED"
  | "AT_RISK";

export type ReassignReason =
  | "LATE_RETURN"
  | "BREAKDOWN"
  | "MAINTENANCE"
  | "EMERGENCY";

export type Vehicle = {
  id: string;
  societyId: string;
  name: string;
  registrationNumber: string;
  status: VehicleStatus;
  isReserve: boolean;
  hourlyRate: number;
  maintenanceReason?: string | null;
  expectedReturnDate?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Flat = {
  id: string;
  societyId: string;
  number: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  resident?: {
    id: string;
    name: string;
    phone: string | null;
    isActive: boolean;
  } | null;
  quotas: Quota[];
};

export type Quota = {
  id: string;
  flatId: string;
  year: number;
  weekNumber: number;
  allocatedMinutes: number;
  usedMinutes: number;
  createdAt: string;
  updatedAt: string;
};

export type Resident = {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
  flat?: {
    id: string;
    number: string;
    isActive?: boolean;
  } | null;
};

export type Driver = {
  id: string;
  societyId: string;
  fullName: string;
  phoneNumber: string;
  email?: string | null;
  licenseNumber: string;
  isActive: boolean;
  vehicleId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type VehicleSummary = Pick<
  Vehicle,
  "id" | "name" | "registrationNumber"
>;

export type DriverListItem = Driver & {
  vehicle: VehicleSummary | null;
  upcomingTripsCount: number;
};

export type WalletSummary = {
  userId: string;
  name: string;
  phone: string | null;
  flat?: string;
  walletId: string | null;
  balance: number;
};

export type AffectedBooking = {
  id: string;
  startTime: string;
  endTime: string;
  status: BookingStatus;
  vehicle: VehicleSummary;
  reassignedVehicle?: VehicleSummary | null;
  user: {
    id: string;
    name: string;
    phone: string | null;
  };
};

export type RechargeRequestStatus = "PENDING" | "APPROVED" | "REJECTED";

export type RechargeRequest = {
  id: string;
  amount: number;
  notes: string | null;
  status: RechargeRequestStatus;
  createdAt: string;
  user: {
    id: string;
    name: string;
    phone: string | null;
    flat: { number: string } | null;
  };
  approvedUser: { name: string } | null;
};

export type Invoice = {
  id: string;
  bookingId: string;
  subtotal: number;
  penaltyAmount: number;
  totalAmount: number;
  generatedAt: string;
};

export type PenaltyRule = {
  id: string;
  name: string;
  amount: number;
  isActive: boolean;
};

export type ReassignmentLog = {
  id: string;
  reason: ReassignReason;
  createdAt: string;
  originalVehicle: VehicleSummary;
  newVehicle: VehicleSummary;
  reassignedByUser: {
    id: string;
    name: string;
  };
};

export type Booking = {
  id: string;
  societyId: string;
  vehicleId: string;
  flatId: string;
  userId: string;
  quotaYear: number;
  quotaWeek: number;
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
  cancelledAt?: string | null;
  driverId?: string | null;
  driver?: Driver | null;
  reassignedVehicleId?: string | null;
  reassignedReason?: ReassignReason | null;
  reassignedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  vehicle: VehicleSummary;
  reassignedVehicle?: VehicleSummary | null;
  flat?: {
    id: string;
    number: string;
  };
  user?: {
    id: string;
    name: string;
    phone?: string | null;
  };
  invoice?: Invoice | null;
  reassignmentLogs?: ReassignmentLog[];
};
