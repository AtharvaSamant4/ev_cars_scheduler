export type ApiEnvelope<T> = { data: T };

export type Paginated<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
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

export type VehicleStatus = "AVAILABLE" | "MAINTENANCE" | "INACTIVE";
export type BookingStatus = "BOOKED" | "COMPLETED" | "CANCELLED";

export type Vehicle = {
  id: string;
  societyId: string;
  name: string;
  registrationNumber: string;
  status: VehicleStatus;
  isReserve: boolean;
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

export type Booking = {
  id: string;
  societyId: string;
  vehicleId: string;
  flatId: string;
  userId: string;
  quotaYear: number;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  status: BookingStatus;
  effectiveStatus: BookingStatus;
  cancelledAt?: string | null;
  reassignedVehicleId?: string | null;
  reassignedReason?: string | null;
  reassignedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  vehicle: Vehicle;
  reassignedVehicle?: Vehicle | null;
  flat?: {
    id: string;
    number: string;
  };
  user?: {
    id: string;
    name: string;
    phone?: string | null;
  };
};
