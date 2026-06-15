"use client";

import Link from "next/link";

import { adminApi } from "./api";
import { AdminShell, PageHeader, StatusPill } from "./admin-shell";
import { dateTime, hours } from "./format";
import { useAdminData } from "./hooks";
import type { Booking } from "./types";

export function BookingDetail({ id }: { id: string }) {
  const booking = useAdminData(
    () => adminApi<Booking>(`/admin/bookings/${id}`),
    [id],
  );

  return (
    <AdminShell>
      <PageHeader
        title="Booking Details"
        subtitle="Read-only booking record for administrative review."
        action={
          <Link className="button secondary" href="/admin/bookings">
            Back to bookings
          </Link>
        }
      />
      {booking.loading ? <div className="card skeleton" /> : null}
      {booking.error ? <div className="error">{booking.error}</div> : null}
      {booking.data ? (
        <div className="grid two-col">
          <div className="card form-card">
            <h2 className="panel-title">Reservation</h2>
            <Detail label="Resident" value={booking.data.user?.name ?? "Unknown"} />
            <Detail label="Flat" value={booking.data.flat?.number ?? "Unknown"} />
            <Detail label="Vehicle" value={booking.data.vehicle.name} />
            <Detail
              label="Registration"
              value={booking.data.vehicle.registrationNumber}
            />
            <Detail label="Duration" value={hours(booking.data.durationMinutes)} />
          </div>
          <div className="card form-card">
            <h2 className="panel-title">Status</h2>
            <div>
              <StatusPill value={booking.data.effectiveStatus} />
            </div>
            <Detail label="Start Time" value={dateTime(booking.data.startTime)} />
            <Detail label="End Time" value={dateTime(booking.data.endTime)} />
            <Detail label="Created Date" value={dateTime(booking.data.createdAt)} />
            <Detail label="Booking ID" value={booking.data.id} />
          </div>
        </div>
      ) : null}
    </AdminShell>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="kicker">{label}</p>
      <strong>{value}</strong>
    </div>
  );
}
