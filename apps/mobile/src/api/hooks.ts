import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { apiRequest } from "@/src/lib/api";
import type {
  Availability,
  Booking,
  BookingMutationResult,
  Dashboard,
  DriverBookingActionResult,
  DriverDashboard,
  DriverTrip,
  InvoiceDownloadToken,
  PaginatedBookings,
  ResidentSession,
  Wallet,
} from "@/src/types/api";


export const queryKeys = {
  dashboard: ["dashboard"] as const,
  driverDashboard: ["driverDashboard"] as const,
  driverHistory: ["driver", "history"] as const,
  bookings: (view: "upcoming" | "history") => ["bookings", view] as const,
  booking: (id: string) => ["booking", id] as const,
  wallet: ["wallet"] as const,
};

export function useResidentLogin() {
  return useMutation({
    mutationFn: (input: { societyId?: string; flatNumber: string; password: string }) =>
      apiRequest<ResidentSession>("/auth/resident/login", {
        method: "POST",
        body: JSON.stringify(input),
      }),
  });
}

export function useDriverLogin() {
  return useMutation({
    mutationFn: (input: { phone: string; password: string }) =>
      apiRequest<ResidentSession>("/auth/driver/login", {
        method: "POST",
        body: JSON.stringify(input),
      }),
  });
}

export function useVerifyOtp(bookingId: string) {
  const queryClient = useQueryClient();
  const encodedBookingId = encodeURIComponent(bookingId);
  return useMutation({
    mutationFn: (otp: string) =>
      apiRequest<DriverBookingActionResult>(`/driver/bookings/${encodedBookingId}/verify-otp`, {
        method: "POST",
        body: JSON.stringify({ otp }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.driverDashboard,
      });
    },
  });
}

export function useDriverArrive(bookingId: string) {
  const queryClient = useQueryClient();
  const encodedBookingId = encodeURIComponent(bookingId);
  return useMutation({
    mutationFn: () =>
      apiRequest<DriverBookingActionResult>(`/driver/bookings/${encodedBookingId}/arrive`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.driverDashboard,
      });
    },
  });
}

export function useCompleteTrip(bookingId: string) {
  const queryClient = useQueryClient();
  const encodedBookingId = encodeURIComponent(bookingId);

  return useMutation({
    mutationFn: () =>
      apiRequest<DriverBookingActionResult>(`/driver/bookings/${encodedBookingId}/complete`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.driverDashboard }),
        queryClient.invalidateQueries({ queryKey: queryKeys.driverHistory }),
      ]);
    },
  });
}

export function useWallet() {
  return useQuery({
    queryKey: queryKeys.wallet,
    queryFn: () => apiRequest<Wallet>("/wallet"),
  });
}

export function useDashboard(enabled = true) {
  return useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: () => apiRequest<Dashboard>("/dashboard"),
    enabled,
  });
}

export function useDriverDashboard() {
  return useQuery({
    queryKey: queryKeys.driverDashboard,
    queryFn: () => apiRequest<DriverDashboard>("/driver/dashboard"),
    refetchInterval: 5_000,
  });
}

export function useDriverHistory() {
  return useQuery({
    queryKey: queryKeys.driverHistory,
    queryFn: () => apiRequest<DriverTrip[]>("/driver/bookings/history"),
  });
}

export function useReportIssue(bookingId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      apiRequest<{ success: boolean }>("/driver/vehicle/report-issue", {
        method: "POST",
        body: JSON.stringify({ bookingId }),
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.driverDashboard }),
        queryClient.invalidateQueries({ queryKey: queryKeys.driverHistory }),
      ]);
    },
  });
}

export function useBookings(view: "upcoming" | "history") {
  return useQuery({
    queryKey: queryKeys.bookings(view),
    queryFn: () =>
      apiRequest<PaginatedBookings>(
        `/bookings?view=${view}&page=1&pageSize=100`,
      ),
  });
}

export function useBooking(id: string, enabled = true) {
  const encodedId = encodeURIComponent(id);
  return useQuery({
    queryKey: queryKeys.booking(id),
    queryFn: () => apiRequest<Booking>(`/bookings/${encodedId}`),
    enabled: Boolean(id) && enabled,
    refetchInterval: (query) => {
      const status =
        query.state.data?.effectiveStatus ?? query.state.data?.status;
      return status === "COMPLETED" || status === "CANCELLED" ? false : 5_000;
    },
  });
}

export function useInvoiceDownloadToken(bookingId: string) {
  const encodedBookingId = encodeURIComponent(bookingId);
  return useMutation({
    mutationFn: () =>
      apiRequest<InvoiceDownloadToken>(`/bookings/${encodedBookingId}/invoice/token`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
  });
}

export function useCheckAvailability() {
  return useMutation({
    mutationFn: (range: { startTime: string; endTime: string }) =>
      apiRequest<Availability>(
        `/availability?startTime=${encodeURIComponent(range.startTime)}&endTime=${encodeURIComponent(range.endTime)}`,
      ),
  });
}

export function useCreateBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { startTime: string; endTime: string; vehicleId: string }) =>
      apiRequest<BookingMutationResult>("/bookings", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.bookings("upcoming"),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.bookings("history"),
        }),
      ]);
      queryClient.setQueryData(queryKeys.booking(result.booking.id), result.booking);
    },
  });
}

export function useCancelBooking(id: string) {
  const queryClient = useQueryClient();
  const encodedId = encodeURIComponent(id);

  return useMutation({
    mutationFn: () =>
      apiRequest<BookingMutationResult>(`/bookings/${encodedId}/cancel`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
    onSuccess: async (result) => {
      queryClient.setQueryData(queryKeys.booking(id), result.booking);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.bookings("upcoming"),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.bookings("history"),
        }),
      ]);
    },
  });
}
