export type BookingStatus = "BOOKED" | "COMPLETED" | "CANCELLED";

export type ResidentUser = {
  id: string;
  name: string;
  role: "RESIDENT";
  flat: {
    id: string;
    number: string;
  };
  society: {
    id: string;
    name: string;
    timezone: string;
  };
};

export type ResidentSession = {
  token: string;
  user: ResidentUser;
};

export type Quota = {
  id?: string;
  flatId?: string;
  year: number;
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
  startTime: string;
  endTime: string;
  durationMinutes: number;
  status: BookingStatus;
  effectiveStatus: BookingStatus;
  cancelledAt: string | null;
  vehicle: VehicleSummary;
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
