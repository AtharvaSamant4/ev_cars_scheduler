"use client";

import { useState } from "react";
import Link from "next/link";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

import { adminApi, errorMessage } from "./api";
import { AdminShell, PageHeader, StatusPill, useAdminUser } from "./admin-shell";
import { currency, dateTime, hours } from "./format";
import { useAdminData } from "./hooks";
import type {
  Booking,
  Driver,
  Paginated,
  PenaltyRule,
  Vehicle,
} from "./types";

function ReassignForm({ booking, onSaved }: { booking: Booking; onSaved: () => void }) {
  const [reserveVehicleId, setReserveVehicleId] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

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
      setPending(true);
      await adminApi(`/admin/bookings/${booking.id}/reassign`, {
        method: "POST",
        body: JSON.stringify({ reserveVehicleId, reason }),
      });
      onSaved();
    } catch (error: unknown) {
      setError(errorMessage(error));
    } finally {
      setPending(false);
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
        <button type="submit" className="button danger" disabled={pending}>
          {pending ? "Reassigning..." : "Reassign Vehicle"}
        </button>
      </div>
    </form>
  );
}

function PenaltyForm({ booking, onSaved }: { booking: Booking; onSaved: () => void }) {
  const [penaltyRuleId, setPenaltyRuleId] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const rules = useAdminData(
    () => adminApi<PenaltyRule[]>("/admin/penalty-rules"),
    [],
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!penaltyRuleId) {
      setError("Please select a penalty rule");
      return;
    }
    setError(null);
    try {
      setPending(true);
      await adminApi(`/admin/bookings/${booking.id}/penalties`, {
        method: "POST",
        body: JSON.stringify({ penaltyRuleId, notes }),
      });
      onSaved();
      setPenaltyRuleId("");
      setNotes("");
    } catch (error: unknown) {
      setError(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  const activeRules = rules.data ?? [];

  if (!rules.loading && activeRules.length === 0) {
    return null;
  }

  return (
    <form className="card form-card" onSubmit={submit}>
      <h2 className="panel-title">Apply Penalty</h2>
      <div className="field">
        <label className="label">Penalty Rule</label>
        <select 
          className="input"
          value={penaltyRuleId} 
          onChange={(e) => setPenaltyRuleId(e.target.value)}
        >
          <option value="">Select penalty...</option>
          {activeRules.map((r) => (
            <option key={r.id} value={r.id}>{r.name} ({currency(r.amount)})</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label className="label">Notes (Optional)</label>
        <input 
          type="text"
          className="input"
          value={notes} 
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Reason for penalty"
        />
      </div>
      {error && <div className="error">{error}</div>}
      <div className="actions">
        <button type="submit" className="button danger" disabled={pending || rules.loading}>
          {pending ? "Applying..." : "Apply Penalty"}
        </button>
      </div>
    </form>
  );
}

function AssignDriverForm({ booking, onSaved }: { booking: Booking; onSaved: () => void }) {
  const [driverId, setDriverId] = useState(booking.driver?.id || "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const drivers = useAdminData(
    () => adminApi<Driver[]>("/admin/drivers?includeInactive=false"),
    [],
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!driverId) {
      setError("Please select a driver");
      return;
    }
    setError(null);
    try {
      setPending(true);
      await adminApi(`/admin/bookings/${booking.id}/assign-driver`, {
        method: "POST",
        body: JSON.stringify({ driverId }),
      });
      onSaved();
    } catch (error: unknown) {
      setError(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  const activeDrivers = drivers.data ?? [];

  return (
    <form className="card form-card" onSubmit={submit}>
      <h2 className="panel-title">Driver Assignment</h2>
      <div className="field">
        <label className="label">Assigned Driver</label>
        <select 
          className="input"
          value={driverId} 
          onChange={(e) => setDriverId(e.target.value)}
        >
          <option value="">Select driver...</option>
          {activeDrivers.map((d) => (
            <option key={d.id} value={d.id}>{d.fullName} ({d.phoneNumber})</option>
          ))}
        </select>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="actions">
        <button type="submit" className="button secondary" disabled={pending}>
          {pending ? "Saving..." : "Save Assignment"}
        </button>
      </div>
    </form>
  );
}

function CompleteRideForm({ booking, onSaved }: { booking: Booking; onSaved: () => void }) {
  const timezone = useAdminUser()?.society.timezone ?? "Asia/Kolkata";
  const [actualEndTime, setActualEndTime] = useState(
    formatInTimeZone(new Date(), timezone, "yyyy-MM-dd'T'HH:mm"),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      setPending(true);
      await adminApi(`/admin/bookings/${booking.id}/complete`, {
        method: "POST",
        body: JSON.stringify({
          actualEndTime: fromZonedTime(actualEndTime, timezone).toISOString(),
        }),
      });
      onSaved();
    } catch (error: unknown) {
      setError(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="card form-card" onSubmit={submit}>
      <h2 className="panel-title">Complete Ride</h2>
      <div className="field">
        <label className="label">Actual End Time</label>
        <input 
          type="datetime-local" 
          className="input" 
          value={actualEndTime}
          onChange={(e) => setActualEndTime(e.target.value)}
        />
      </div>
      {error && <div className="error">{error}</div>}
      <div className="actions">
        <button type="submit" className="button primary" disabled={pending}>
          {pending ? "Completing..." : "Complete Ride"}
        </button>
      </div>
    </form>
  );
}

function InvoiceCard({ booking }: { booking: Booking }) {
  if (!booking.invoice) return null;
  return (
    <div className="card form-card">
      <h2 className="panel-title">Invoice</h2>
      <Detail label="Vehicle Charge" value={currency(booking.invoice.subtotal)} />
      <Detail label="Late Return Penalty" value={currency(booking.invoice.penaltyAmount)} />
      <Detail label="Total Amount" value={currency(booking.invoice.totalAmount)} />
      <div className="actions" style={{ marginTop: 16 }}>
        <a href={`/api/v1/bookings/${booking.id}/invoice/pdf`} className="button secondary" target="_blank" rel="noreferrer">
          Download PDF Invoice
        </a>
      </div>
    </div>
  );
}

export function BookingDetail({ id }: { id: string }) {
  const timezone = useAdminUser()?.society.timezone ?? "Asia/Kolkata";
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
            <Detail
              label="Effective Vehicle"
              value={(booking.data.reassignedVehicle ?? booking.data.vehicle).name}
            />
            <Detail
              label="Registration"
              value={(booking.data.reassignedVehicle ?? booking.data.vehicle).registrationNumber}
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
            <Detail label="Start Time" value={dateTime(booking.data.startTime, timezone)} />
            <Detail label="End Time" value={dateTime(booking.data.endTime, timezone)} />
            {booking.data.actualRideStartTime ? (
              <Detail label="Actual Start Time" value={dateTime(booking.data.actualRideStartTime, timezone)} />
            ) : null}
            {booking.data.actualEndTime ? (
              <Detail label="Actual End Time" value={dateTime(booking.data.actualEndTime, timezone)} />
            ) : null}
            {booking.data.otpVerifiedAt ? (
              <Detail label="OTP Verified At" value={dateTime(booking.data.otpVerifiedAt, timezone)} />
            ) : null}
            {booking.data.driver ? (
              <Detail label="Assigned Driver" value={`${booking.data.driver.fullName} (${booking.data.driver.phoneNumber})`} />
            ) : null}
            <Detail label="Created Date" value={dateTime(booking.data.createdAt, timezone)} />
            <Detail label="Booking ID" value={booking.data.id} />
          </div>
          {booking.data.effectiveStatus === "IN_PROGRESS" ? (
            <CompleteRideForm booking={booking.data} onSaved={() => booking.reload()} />
          ) : null}
          {booking.data.invoice ? (
            <InvoiceCard booking={booking.data} />
          ) : null}
          {[
            "BOOKED",
            "DRIVER_ASSIGNED",
            "REASSIGNED",
            "AT_RISK",
          ].includes(booking.data.effectiveStatus) ? (
            <AssignDriverForm booking={booking.data} onSaved={() => booking.reload()} />
          ) : null}
          {[
            "BOOKED",
            "DRIVER_ASSIGNED",
            "REASSIGNED",
            "AT_RISK",
          ].includes(booking.data.effectiveStatus) ? (
            <ReassignForm booking={booking.data} onSaved={() => booking.reload()} />
          ) : null}
          <PenaltyForm booking={booking.data} onSaved={() => booking.reload()} />
          
          {/* Audit Trail Panel */}
          {booking.data.reassignmentLogs && booking.data.reassignmentLogs.length > 0 ? (
            <div className="card form-card span-2" style={{ gridColumn: "1 / -1" }}>
              <h2 className="panel-title">Reassignment Audit Trail</h2>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Original Vehicle</th>
                      <th>New Vehicle</th>
                      <th>Reason</th>
                      <th>Admin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {booking.data.reassignmentLogs.map((log) => (
                      <tr key={log.id}>
                        <td>{dateTime(log.createdAt, timezone)}</td>
                        <td>{log.originalVehicle.name}</td>
                        <td>{log.newVehicle.name}</td>
                        <td>{log.reason}</td>
                        <td>{log.reassignedByUser.name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
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
