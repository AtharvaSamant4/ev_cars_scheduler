"use client";

import { useState } from "react";
import Link from "next/link";

import { adminApi } from "./api";
import { AdminShell, PageHeader, StatusPill } from "./admin-shell";
import { dateTime, hours } from "./format";
import { useAdminData } from "./hooks";
import type { Booking, Vehicle, Paginated } from "./types";

function ReassignForm({ booking, onSaved }: { booking: Booking; onSaved: () => void }) {
  const [reserveVehicleId, setReserveVehicleId] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const vehicles = useAdminData(
    () => adminApi<Paginated<Vehicle>>("/admin/vehicles?pageSize=100"),
    [],
  );

  const reserveVehicles = vehicles.data?.items.filter((v) => v.isReserve && v.status === "AVAILABLE") ?? [];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!reserveVehicleId || !reason) {
      setError("Please select both a reserve vehicle and a reason");
      return;
    }
    setError(null);
    try {
      await adminApi(`/admin/bookings/${booking.id}/reassign`, {
        method: "POST",
        body: JSON.stringify({ reserveVehicleId, reason }),
      });
      onSaved();
    } catch (err: any) {
      setError(err.message || "Failed to reassign");
    }
  }

  if (booking.effectiveStatus === "COMPLETED" || booking.effectiveStatus === "CANCELLED") {
    return null;
  }

  return (
    <form className="card form-card" onSubmit={submit}>
      <h2 className="panel-title">Operational Reassignment</h2>
      <div className="field">
        <label className="label">Reserve Vehicle</label>
        <select 
          className="input"
          value={reserveVehicleId} 
          onChange={(e) => setReserveVehicleId(e.target.value)}
        >
          <option value="">Select reserve vehicle...</option>
          {reserveVehicles.map((v) => (
            <option key={v.id} value={v.id}>{v.name} ({v.registrationNumber})</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label className="label">Reason</label>
        <select 
          className="input"
          value={reason} 
          onChange={(e) => setReason(e.target.value)}
        >
          <option value="">Select reason...</option>
          <option value="LATE_RETURN">Late Return</option>
          <option value="BREAKDOWN">Breakdown</option>
          <option value="MAINTENANCE">Maintenance</option>
          <option value="EMERGENCY">Emergency</option>
        </select>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="actions">
        <button type="submit" className="button danger">Reassign Vehicle</button>
      </div>
    </form>
  );
}

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
            {booking.data.reassignedVehicle ? (
              <>
                <Detail label="Reassigned Vehicle" value={booking.data.reassignedVehicle.name} />
                <Detail label="Reassigned Reason" value={booking.data.reassignedReason ?? ""} />
              </>
            ) : null}
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
          {booking.data.reassignedVehicleId == null ? (
            <ReassignForm booking={booking.data} onSaved={() => booking.reload()} />
          ) : null}
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
