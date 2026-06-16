"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { adminApi, errorMessage, qs } from "./api";
import { AdminShell, PageHeader, StatusPill } from "./admin-shell";
import { dateInputToIso, dateTime, hours, minutesFromHours } from "./format";
import { useAdminData } from "./hooks";
import type {
  Booking,
  Dashboard,
  Flat,
  Paginated,
  Resident,
  Vehicle,
  VehicleStatus,
} from "./types";

const currentYear = new Date().getFullYear();

function Message({ error, success }: { error?: string | null; success?: string | null }) {
  if (error) {
    return <div className="error">{error}</div>;
  }

  if (success) {
    return <div className="success">{success}</div>;
  }

  return null;
}

function DataCard<T>({
  state,
  children,
}: {
  state: { data: T | null; error: string | null; loading: boolean };
  children: (data: T) => React.ReactNode;
}) {
  if (state.loading) {
    return <div className="card skeleton" />;
  }

  if (state.error) {
    return <div className="error">{state.error}</div>;
  }

  if (!state.data) {
    return <div className="card">No data available.</div>;
  }

  return <>{children(state.data)}</>;
}

export function AdminPortal({ section }: { section: string }) {
  const content =
    section === "vehicles" ? (
      <VehiclesScreen />
    ) : section === "flats" ? (
      <FlatsScreen />
    ) : section === "residents" ? (
      <ResidentsScreen />
    ) : section === "quota" ? (
      <QuotaScreen />
    ) : section === "bookings" ? (
      <BookingsScreen />
    ) : section === "vehicle-status" ? (
      <VehicleStatusScreen />
    ) : section === "drivers" ? (
      <DriversScreen />
    ) : section === "wallets" ? (
      <WalletsScreen />
    ) : (
      <DashboardScreen />
    );

  return <AdminShell>{content}</AdminShell>;
}

function DashboardScreen() {
  const dashboard = useAdminData(
    () => adminApi<Dashboard>("/admin/dashboard"),
    [],
  );
  const vehicles = useAdminData(
    () => adminApi<Paginated<Vehicle>>("/admin/vehicles?pageSize=100"),
    [],
  );
  const bookings = useAdminData(
    () => adminApi<Paginated<Booking>>("/admin/bookings?pageSize=100"),
    [],
  );

  const analytics = useMemo(() => {
    const items = bookings.data?.items ?? [];
    const active = items.filter((item) => item.effectiveStatus !== "CANCELLED");
    const totalMinutes = active.reduce(
      (sum, item) => sum + item.durationMinutes,
      0,
    );
    const usage = new Map<string, { name: string; count: number }>();

    for (const item of active) {
      const existing = usage.get(item.vehicle.id) ?? {
        name: item.vehicle.name,
        count: 0,
      };
      existing.count += 1;
      usage.set(item.vehicle.id, existing);
    }

    const mostUsed = [...usage.values()].sort((a, b) => b.count - a.count)[0];
    const vehicleCount = vehicles.data?.items.length ?? 0;

    return {
      totalHours: totalMinutes / 60,
      mostUsed: mostUsed ? `${mostUsed.name} (${mostUsed.count})` : "No data",
      utilization:
        vehicleCount > 0
          ? `${Math.round((totalMinutes / (vehicleCount * 876 * 60)) * 100)}%`
          : "0%",
    };
  }, [bookings.data, vehicles.data]);

  return (
    <>
      <PageHeader
        title="Admin Dashboard"
        subtitle="A trustee-friendly overview of flats, residents, fleet status, and active demand."
      />

      <DataCard state={dashboard}>
        {(data) => {
          const totalEvs =
            data.vehicles.AVAILABLE +
            data.vehicles.MAINTENANCE +
            data.vehicles.INACTIVE;

          return (
            <div className="grid metric-grid">
              <Metric label="Total Flats" value={data.activeFlats} />
              <Metric label="Total Residents" value={data.activeResidents} />
              <Metric label="Total EVs" value={totalEvs} />
              <Metric label="Active Bookings" value={data.bookings.upcoming} />
              <Metric label="Available EVs" value={data.vehicles.AVAILABLE} />
              <Metric
                label="Vehicles in Maintenance"
                value={data.vehicles.MAINTENANCE}
              />
              <Metric label="Upcoming Bookings" value={data.bookings.upcoming} />
              <Metric label="All Bookings" value={data.bookings.total} />
            </div>
          );
        }}
      </DataCard>

      <div className="grid metric-grid" style={{ marginTop: 16 }}>
        <Metric label="Total Hours Booked" value={analytics.totalHours.toFixed(1)} />
        <Metric label="Most Used Vehicle" value={analytics.mostUsed} />
        <Metric label="Average Utilization" value={analytics.utilization} />
        <Metric label="Analytics Scope" value="MVP" />
      </div>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function VehiclesScreen() {
  const vehicles = useAdminData(
    () => adminApi<Paginated<Vehicle>>("/admin/vehicles?pageSize=100"),
    [],
  );
  const [editing, setEditing] = useState<Vehicle | null>(null);

  return (
    <>
      <PageHeader
        title="Vehicle Management"
        subtitle="Create EVs, edit registration data, and control operational status."
      />
      <div className="grid two-col">
        <DataCard state={vehicles}>
          {(data) => (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Vehicle Name</th>
                    <th>Registration Number</th>
                    <th>Reserve</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((vehicle) => (
                    <tr key={vehicle.id}>
                      <td>{vehicle.name}</td>
                      <td>{vehicle.registrationNumber}</td>
                      <td>
                        {vehicle.isReserve ? (
                          <span className="badge reserve-badge">RESERVE</span>
                        ) : (
                          <span className="badge normal-badge">NORMAL</span>
                        )}
                      </td>
                      <td>
                        <StatusPill value={vehicle.status} />
                      </td>
                      <td>
                        <div className="actions">
                          <button
                            className="button secondary"
                            onClick={() => setEditing(vehicle)}
                          >
                            Edit
                          </button>
                          <button
                            className="button danger"
                            onClick={() =>
                              void adminApi(`/admin/vehicles/${vehicle.id}`, {
                                method: "DELETE",
                              }).then(() => vehicles.reload())
                            }
                          >
                            Deactivate
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DataCard>
        <VehicleForm
          editing={editing}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void vehicles.reload();
          }}
        />
      </div>
    </>
  );
}

function VehicleForm({
  editing,
  onCancel,
  onSaved,
}: {
  editing: Vehicle | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [isReserve, setIsReserve] = useState("false");
  const [status, setStatus] = useState<VehicleStatus>("AVAILABLE");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    queueMicrotask(() => {
      setName(editing?.name ?? "");
      setRegistrationNumber(editing?.registrationNumber ?? "");
      setIsReserve(editing?.isReserve ? "true" : "false");
      setStatus(editing?.status ?? "AVAILABLE");
    });
  }, [editing]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    try {
      await adminApi(editing ? `/admin/vehicles/${editing.id}` : "/admin/vehicles", {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify({ name, registrationNumber, status, isReserve: isReserve === "true" }),
      });
      setMessage(editing ? "Vehicle updated." : "Vehicle created.");
      onSaved();
    } catch (currentError) {
      setError(errorMessage(currentError));
    }
  }

  return (
    <form className="card form-card" onSubmit={submit}>
      <h2 className="panel-title">{editing ? "Edit Vehicle" : "Create Vehicle"}</h2>
      <TextField label="Vehicle Name" value={name} onChange={setName} />
      <TextField
        label="Registration Number"
        value={registrationNumber}
        onChange={setRegistrationNumber}
      />
      <SelectField
        label="Reserve Vehicle"
        value={isReserve}
        options={["false", "true"]}
        labels={{
          "false": "No (Normal)",
          "true": "Yes (Reserve)",
        }}
        onChange={(value) => setIsReserve(value)}
      />
      <SelectField
        label="Status"
        value={status}
        options={["AVAILABLE", "MAINTENANCE", "INACTIVE"]}
        onChange={(value) => setStatus(value as VehicleStatus)}
      />
      <Message error={error} success={message} />
      <div className="actions">
        <button className="button" type="submit">
          {editing ? "Save changes" : "Create vehicle"}
        </button>
        {editing ? (
          <button className="button secondary" type="button" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}

function FlatsScreen() {
  const flats = useAdminData(
    () => adminApi<Paginated<Flat>>("/admin/flats?pageSize=100"),
    [],
  );
  const [editing, setEditing] = useState<Flat | null>(null);

  return (
    <>
      <PageHeader
        title="Flat Management"
        subtitle="Maintain society flats and initial yearly quota allocations."
      />
      <div className="grid two-col">
        <DataCard state={flats}>
          {(data) => (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Flat Number</th>
                    <th>Resident Name</th>
                    <th>Quota Allocation</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((flat) => {
                    const quota = flat.quotas[0];

                    return (
                      <tr key={flat.id}>
                        <td>{flat.number}</td>
                        <td>{flat.resident?.name ?? "Unassigned"}</td>
                        <td>{quota ? hours(quota.allocatedMinutes) : "Not set"}</td>
                        <td>
                          <StatusPill value={flat.isActive ? "ACTIVE" : "INACTIVE"} />
                        </td>
                        <td>
                          <div className="actions">
                            <button
                              className="button secondary"
                              onClick={() => setEditing(flat)}
                            >
                              Edit
                            </button>
                            <button
                              className="button danger"
                              onClick={() =>
                                void adminApi(`/admin/flats/${flat.id}`, {
                                  method: "DELETE",
                                }).then(() => flats.reload())
                              }
                            >
                              Deactivate
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </DataCard>
        <FlatForm
          editing={editing}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void flats.reload();
          }}
        />
      </div>
    </>
  );
}

function FlatForm({
  editing,
  onCancel,
  onSaved,
}: {
  editing: Flat | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [number, setNumber] = useState("");
  const [allocatedHours, setAllocatedHours] = useState("876");
  const [isActive, setIsActive] = useState("true");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    queueMicrotask(() => {
      setNumber(editing?.number ?? "");
      setIsActive(editing ? String(editing.isActive) : "true");
    });
  }, [editing]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    try {
      if (editing) {
        await adminApi(`/admin/flats/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify({ number, isActive: isActive === "true" }),
        });
      } else {
        await adminApi("/admin/flats", {
          method: "POST",
          body: JSON.stringify({
            number,
            allocatedMinutes: minutesFromHours(allocatedHours),
            year: currentYear,
          }),
        });
      }
      setMessage(editing ? "Flat updated." : "Flat created.");
      onSaved();
    } catch (currentError) {
      setError(errorMessage(currentError));
    }
  }

  return (
    <form className="card form-card" onSubmit={submit}>
      <h2 className="panel-title">{editing ? "Edit Flat" : "Create Flat"}</h2>
      <TextField label="Flat Number" value={number} onChange={setNumber} />
      {!editing ? (
        <TextField
          label="Initial Quota Hours"
          type="number"
          value={allocatedHours}
          onChange={setAllocatedHours}
        />
      ) : (
        <SelectField
          label="Status"
          value={isActive}
          options={["true", "false"]}
          labels={{ true: "Active", false: "Inactive" }}
          onChange={setIsActive}
        />
      )}
      <Message error={error} success={message} />
      <div className="actions">
        <button className="button" type="submit">
          {editing ? "Save changes" : "Create flat"}
        </button>
        {editing ? (
          <button className="button secondary" type="button" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}

function ResidentsScreen() {
  const residents = useAdminData(
    () => adminApi<Paginated<Resident>>("/admin/residents?pageSize=100"),
    [],
  );
  const flats = useAdminData(
    () => adminApi<Paginated<Flat>>("/admin/flats?pageSize=100&isActive=true"),
    [],
  );
  const [editing, setEditing] = useState<Resident | null>(null);

  return (
    <>
      <PageHeader
        title="Resident Management"
        subtitle="Create resident accounts, update contact details, reset passwords, and deactivate access."
      />
      <div className="grid two-col">
        <DataCard state={residents}>
          {(data) => (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Flat</th>
                    <th>Phone / Email</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((resident) => (
                    <tr key={resident.id}>
                      <td>{resident.name}</td>
                      <td>{resident.flat?.number ?? "No flat"}</td>
                      <td>{resident.phone ?? resident.email ?? "Not set"}</td>
                      <td>
                        <StatusPill
                          value={resident.isActive ? "ACTIVE" : "INACTIVE"}
                        />
                      </td>
                      <td>
                        <div className="actions">
                          <button
                            className="button secondary"
                            onClick={() => setEditing(resident)}
                          >
                            Edit
                          </button>
                          <button
                            className="button danger"
                            onClick={() =>
                              void adminApi(`/admin/residents/${resident.id}`, {
                                method: "DELETE",
                              }).then(() => residents.reload())
                            }
                          >
                            Deactivate
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DataCard>
        <ResidentForm
          editing={editing}
          flats={flats.data?.items ?? []}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void residents.reload();
          }}
        />
      </div>
    </>
  );
}

function ResidentForm({
  editing,
  flats,
  onCancel,
  onSaved,
}: {
  editing: Resident | null;
  flats: Flat[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [flatId, setFlatId] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("Demo@123");
  const [isActive, setIsActive] = useState("true");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    queueMicrotask(() => {
      setFlatId(editing?.flat?.id ?? "");
      setName(editing?.name ?? "");
      setPhone(editing?.phone ?? "");
      setPassword("");
      setIsActive(editing ? String(editing.isActive) : "true");
    });
  }, [editing]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    try {
      if (editing) {
        await adminApi(`/admin/residents/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            name,
            phone,
            password: password || undefined,
            isActive: isActive === "true",
          }),
        });
      } else {
        await adminApi("/admin/residents", {
          method: "POST",
          body: JSON.stringify({ flatId, name, phone, password }),
        });
      }
      setMessage(editing ? "Resident updated." : "Resident created.");
      onSaved();
    } catch (currentError) {
      setError(errorMessage(currentError));
    }
  }

  return (
    <form className="card form-card" onSubmit={submit}>
      <h2 className="panel-title">
        {editing ? "Edit / Reset Resident" : "Create Resident"}
      </h2>
      {!editing ? (
        <SelectField
          label="Flat"
          value={flatId}
          options={flats.filter((flat) => !flat.resident).map((flat) => flat.id)}
          labels={Object.fromEntries(flats.map((flat) => [flat.id, flat.number]))}
          onChange={setFlatId}
        />
      ) : null}
      <TextField label="Name" value={name} onChange={setName} />
      <TextField label="Phone" value={phone} onChange={setPhone} />
      <TextField
        label={editing ? "New Password (optional)" : "Password"}
        type="password"
        value={password}
        onChange={setPassword}
      />
      {editing ? (
        <SelectField
          label="Status"
          value={isActive}
          options={["true", "false"]}
          labels={{ true: "Active", false: "Inactive" }}
          onChange={setIsActive}
        />
      ) : null}
      <Message error={error} success={message} />
      <div className="actions">
        <button className="button" type="submit">
          {editing ? "Save resident" : "Create resident"}
        </button>
        {editing ? (
          <button className="button secondary" type="button" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}

function QuotaScreen() {
  const flats = useAdminData(
    () => adminApi<Paginated<Flat>>("/admin/flats?pageSize=100"),
    [],
  );

  return (
    <>
      <PageHeader
        title="Quota Management"
        subtitle="Review weekly allocation, used hours, and remaining hours per flat."
      />
      <DataCard state={flats}>
        {(data) => (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Flat Number</th>
                  <th>Allocated Hours</th>
                  <th>Used Hours</th>
                  <th>Remaining Hours</th>
                  <th>Update Allocation</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((flat) => (
                  <QuotaRow flat={flat} key={flat.id} onSaved={flats.reload} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DataCard>
    </>
  );
}

function QuotaRow({ flat, onSaved }: { flat: Flat; onSaved: () => void }) {
  const quota = flat.quotas[0];
  const [allocatedHours, setAllocatedHours] = useState(
    quota ? String(quota.allocatedMinutes / 60) : "876",
  );
  const [error, setError] = useState<string | null>(null);
  const remaining = quota ? quota.allocatedMinutes - quota.usedMinutes : 0;

  async function save() {
    setError(null);

    try {
      await adminApi(`/admin/flats/${flat.id}/quota/${currentYear}`, {
        method: "PUT",
        body: JSON.stringify({
          allocatedMinutes: minutesFromHours(allocatedHours),
        }),
      });
      onSaved();
    } catch (currentError) {
      setError(errorMessage(currentError));
    }
  }

  return (
    <tr>
      <td>{flat.number}</td>
      <td>{quota ? hours(quota.allocatedMinutes) : "Not set"}</td>
      <td>{quota ? hours(quota.usedMinutes) : "0 hrs"}</td>
      <td>{quota ? hours(remaining) : "0 hrs"}</td>
      <td>
        <div className="actions">
          <input
            className="input"
            style={{ maxWidth: 120 }}
            type="number"
            value={allocatedHours}
            onChange={(event) => setAllocatedHours(event.target.value)}
          />
          <button className="button secondary" onClick={() => void save()}>
            Save
          </button>
        </div>
        {error ? <div className="error" style={{ marginTop: 8 }}>{error}</div> : null}
      </td>
    </tr>
  );
}

function BookingsScreen() {
  const [status, setStatus] = useState("");
  const [flatId, setFlatId] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [date, setDate] = useState("");
  const vehicles = useAdminData(
    () => adminApi<Paginated<Vehicle>>("/admin/vehicles?pageSize=100"),
    [],
  );
  const flats = useAdminData(
    () => adminApi<Paginated<Flat>>("/admin/flats?pageSize=100"),
    [],
  );
  const bookings = useAdminData(
    () =>
      adminApi<Paginated<Booking>>(
        `/admin/bookings${qs({
          pageSize: 100,
          status,
          flatId,
          vehicleId,
          from: dateInputToIso(date),
          to: dateInputToIso(date, true),
        })}`,
      ),
    [status, flatId, vehicleId, date],
  );

  return (
    <>
      <PageHeader
        title="Booking Management"
        subtitle="View society reservations and filter by date, flat, vehicle, or status."
      />
      <div className="card">
        <div className="toolbar">
          <TextField label="Date" type="date" value={date} onChange={setDate} />
          <SelectField
            label="Status"
            value={status}
            options={["", "BOOKED", "COMPLETED", "CANCELLED"]}
            labels={{ "": "All statuses" }}
            onChange={setStatus}
          />
          <SelectField
            label="Flat"
            value={flatId}
            options={["", ...(flats.data?.items.map((flat) => flat.id) ?? [])]}
            labels={{
              "": "All flats",
              ...Object.fromEntries(
                flats.data?.items.map((flat) => [flat.id, flat.number]) ?? [],
              ),
            }}
            onChange={setFlatId}
          />
          <SelectField
            label="Vehicle"
            value={vehicleId}
            options={[
              "",
              ...(vehicles.data?.items.map((vehicle) => vehicle.id) ?? []),
            ]}
            labels={{
              "": "All vehicles",
              ...Object.fromEntries(
                vehicles.data?.items.map((vehicle) => [
                  vehicle.id,
                  vehicle.name,
                ]) ?? [],
              ),
            }}
            onChange={setVehicleId}
          />
        </div>
        <DataCard state={bookings}>
          {(data) => (
            <BookingsTable bookings={data.items} showLink />
          )}
        </DataCard>
      </div>
    </>
  );
}

function BookingsTable({
  bookings,
  showLink = false,
}: {
  bookings: Booking[];
  showLink?: boolean;
}) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Flat</th>
            <th>Vehicle</th>
            <th>Start Time</th>
            <th>End Time</th>
            <th>Status</th>
            {showLink ? <th>Details</th> : null}
          </tr>
        </thead>
        <tbody>
          {bookings.map((booking) => (
            <tr key={booking.id}>
              <td>{booking.flat?.number ?? "Unknown"}</td>
              <td>{booking.vehicle.name}</td>
              <td>{dateTime(booking.startTime)}</td>
              <td>{dateTime(booking.endTime)}</td>
              <td>
                <StatusPill value={booking.effectiveStatus} />
              </td>
              {showLink ? (
                <td>
                  <Link className="button secondary" href={`/admin/bookings/${booking.id}`}>
                    Open
                  </Link>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function VehicleStatusScreen() {
  const vehicles = useAdminData(
    () => adminApi<Paginated<Vehicle>>("/admin/vehicles?pageSize=100"),
    [],
  );
  const bookings = useAdminData(
    () => adminApi<Paginated<Booking>>("/admin/bookings?pageSize=100&status=BOOKED"),
    [],
  );

  const currentVehicleIds = new Set(
    (bookings.data?.items ?? [])
      .filter((booking) => booking.status === "BOOKED")
      .map((booking) => booking.vehicle.id),
  );

  return (
    <>
      <PageHeader
        title="Vehicle Status"
        subtitle="A simple operational view trustees can understand at a glance."
      />
      <DataCard state={vehicles}>
        {(data) => (
          <div className="status-list">
            {data.items.map((vehicle) => {
              const status = currentVehicleIds.has(vehicle.id)
                ? "BOOKED"
                : vehicle.status;

              return (
                <div className="vehicle-status-card" key={vehicle.id}>
                  <div>
                    <strong>{vehicle.name}</strong>
                    <span className="muted">{vehicle.registrationNumber}</span>
                  </div>
                  <StatusPill value={status} />
                </div>
              );
            })}
          </div>
        )}
      </DataCard>
    </>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        className="input"
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  labels = {},
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  labels?: Record<string, string>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select
        className="select"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {labels[option] ?? option}
          </option>
        ))}
      </select>
    </label>
  );
}

function DriversScreen() {
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const drivers = useAdminData(
    () => adminApi<Paginated<any>>(`/admin/drivers?page=${page}&pageSize=${pageSize}`),
    [page, pageSize],
  );
  const vehicles = useAdminData(
    () => adminApi<Paginated<Vehicle>>(`/admin/vehicles?pageSize=100`),
    [],
  );

  return (
    <>
      <PageHeader
        title="Drivers"
        subtitle="Manage drivers and assign them to vehicles."
      />

      <div className="grid two-col">
        <DataCard state={drivers}>
          {(data) => (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Phone</th>
                    <th>Assigned Vehicle</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item: any) => (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      <td>{item.phone}</td>
                      <td>{item.driver?.vehicle?.registrationNumber || "None"}</td>
                      <td>
                        <select
                          className="input"
                          style={{ maxWidth: 160, margin: 0, height: 32, fontSize: 13 }}
                          value={item.driver?.vehicleId || ""}
                          onChange={(e) => {
                            const vehicleId = e.target.value || null;
                            adminApi(`/admin/drivers/${item.id}/vehicle`, {
                              method: "PUT",
                              body: JSON.stringify({ vehicleId }),
                            }).then(() => drivers.reload());
                          }}
                        >
                          <option value="">Unassigned</option>
                          {vehicles.data?.items.map((v: Vehicle) => (
                            <option key={v.id} value={v.id}>
                              {v.registrationNumber} ({v.name})
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DataCard>
        <DriverForm onSaved={() => drivers.reload()} />
      </div>
    </>
  );
}

function DriverForm({ onSaved }: { onSaved: () => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    try {
      await adminApi("/admin/drivers", {
        method: "POST",
        body: JSON.stringify({ name, phone, password: "Driver@123" }),
      });
      setMessage("Driver created successfully.");
      setName("");
      setPhone("");
      onSaved();
    } catch (currentError) {
      setError(errorMessage(currentError));
    }
  }

  return (
    <form className="card form-card" onSubmit={submit}>
      <h2 className="panel-title">Add Driver</h2>
      <TextField label="Driver Name" value={name} onChange={setName} />
      <TextField label="Phone Number" value={phone} onChange={setPhone} />
      <div className="muted" style={{ fontSize: 13, marginBottom: 16 }}>
        Default password is set to <strong>Driver@123</strong>.
      </div>
      <Message error={error} success={message} />
      <div className="actions">
        <button className="button" type="submit">
          Create Driver
        </button>
      </div>
    </form>
  );
}

function WalletsScreen() {
  const wallets = useAdminData(
    () => adminApi<any>("/admin/wallets"),
    [],
  );
  const [adjustingUser, setAdjustingUser] = useState<any | null>(null);

  return (
    <>
      <PageHeader
        title="Wallets"
        subtitle="Manage resident wallets and adjust balances."
      />
      <div className="grid two-col">
        <DataCard state={wallets}>
          {(data) => (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Resident</th>
                    <th>Flat</th>
                    <th>Current Balance</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((item: any) => (
                    <tr key={item.userId}>
                      <td>
                        <strong>{item.name}</strong>
                        <div className="muted">{item.phone}</div>
                      </td>
                      <td>{item.flat || "None"}</td>
                      <td>
                        <strong style={{ color: "var(--success)", fontSize: 18 }}>
                          ₹{item.balance}
                        </strong>
                      </td>
                      <td>
                        <button
                          className="button secondary"
                          onClick={() => setAdjustingUser(item)}
                        >
                          Adjust Balance
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DataCard>
        {adjustingUser ? (
          <WalletAdjustForm
            user={adjustingUser}
            onCancel={() => setAdjustingUser(null)}
            onSaved={() => {
              setAdjustingUser(null);
              void wallets.reload();
            }}
          />
        ) : (
          <div className="card form-card">
            <h2 className="panel-title">Adjust Balance</h2>
            <div className="muted">
              Select a resident from the list to adjust their wallet balance.
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function WalletAdjustForm({
  user,
  onCancel,
  onSaved,
}: {
  user: any;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [amountStr, setAmountStr] = useState("");
  const [typeStr, setTypeStr] = useState("CREDIT");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    const amount = parseInt(amountStr, 10);
    if (isNaN(amount) || amount <= 0) {
      setError("Please enter a valid positive amount.");
      return;
    }

    try {
      await adminApi(`/admin/wallets/${user.userId}/adjust`, {
        method: "POST",
        body: JSON.stringify({
          amount,
          type: typeStr,
          description: description.trim() || "Manual adjustment",
        }),
      });
      setMessage("Wallet adjusted successfully.");
      onSaved();
    } catch (currentError) {
      setError(errorMessage(currentError));
    }
  }

  return (
    <form className="card form-card" onSubmit={submit}>
      <h2 className="panel-title">Adjust Wallet: {user.name}</h2>
      <TextField
        label="Amount (₹)"
        type="number"
        value={amountStr}
        onChange={setAmountStr}
      />
      <SelectField
        label="Transaction Type"
        value={typeStr}
        options={["CREDIT", "DEBIT", "REFUND"]}
        onChange={setTypeStr}
      />
      <TextField
        label="Description"
        value={description}
        onChange={setDescription}
      />
      <Message error={error} success={message} />
      <div className="actions">
        <button className="button" type="submit">
          Apply Adjustment
        </button>
        <button className="button secondary" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

