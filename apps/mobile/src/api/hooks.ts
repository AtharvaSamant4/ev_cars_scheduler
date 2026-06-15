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
  bookings: (view: "upcoming" | "history") => ["bookings", view] as const,
  booking: (id: string) => ["booking", id] as const,
};

export function useResidentLogin() {
  return useMutation({
    mutationFn: (input: { flatNumber: string; password: string }) =>
      apiRequest<ResidentSession>("/auth/resident/login", {
        method: "POST",
        body: JSON.stringify(input),
      }),
  });
}

export function useDashboard() {
  return useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: () => apiRequest<Dashboard>("/dashboard"),
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
