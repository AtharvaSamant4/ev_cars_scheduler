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
  PaginatedBookings,
  ResidentSession,
} from "@/src/types/api";


export const queryKeys = {
  dashboard: ["dashboard"] as const,
  driverDashboard: ["driverDashboard"] as const,
  bookings: (view: "upcoming" | "history") => ["bookings", view] as const,
  booking: (id: string) => ["booking", id] as const,
  wallet: ["wallet"] as const,
};

export function useResidentLogin() {
  return useMutation({
    mutationFn: (input: { flatNumber: string; password?: string }) =>
      apiRequest<ResidentSession>("/auth/resident/login", {
        method: "POST",
        body: JSON.stringify(input),
      }),
  });
}

export function useDriverLogin() {
  return useMutation({
    mutationFn: (input: { phone: string; password?: string }) =>
      apiRequest<ResidentSession>("/auth/driver/login", {
        method: "POST",
        body: JSON.stringify(input),
      }),
  });
}

export function useVerifyOtp(bookingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (otp: string) =>
      apiRequest<{ success: boolean }>(`/driver/bookings/${bookingId}/verify-otp`, {
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

export function useCompleteTrip(bookingId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      apiRequest<{ success: boolean }>(`/driver/bookings/${bookingId}/complete`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.driverDashboard });
    },
  });
}

export function useWallet() {
  return useQuery({
    queryKey: queryKeys.wallet,
    queryFn: () => apiRequest<any>("/wallet"),
  });
}

export function useDashboard() {
  return useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: () => apiRequest<Dashboard>("/dashboard"),
  });
}

export function useDriverDashboard() {
  return useQuery({
    queryKey: queryKeys.driverDashboard,
    queryFn: () => apiRequest<any>("/driver/dashboard"),
  });
}

export function useDriverHistory() {
  return useQuery({
    queryKey: ["driver", "history"],
    queryFn: () => apiRequest<any[]>("/driver/bookings/history"),
  });
}

export function useReportIssue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      apiRequest<{ success: boolean }>("/driver/vehicle/report-issue", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.driverDashboard });
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

export function useBooking(id: string) {
  return useQuery({
    queryKey: queryKeys.booking(id),
    queryFn: () => apiRequest<Booking>(`/bookings/${id}`),
    enabled: Boolean(id),
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

  return useMutation({
    mutationFn: () =>
      apiRequest<BookingMutationResult>(`/bookings/${id}/cancel`, {
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
