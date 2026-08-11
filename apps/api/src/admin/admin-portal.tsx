"use client";

import Link from "next/link";
import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import QRCode from "react-qr-code";

import { adminApi, errorMessage, qs } from "./api";
import { AdminShell, PageHeader, StatusPill, useAdminUser } from "./admin-shell";
import {
  currency,
  dateInputToIso,
  dateInputValue,
  dateTime,
  hours,
  minutesFromHours,
} from "./format";
import { useAdminData } from "./hooks";
import type {
  AffectedBooking,
  Booking,
  BookingStatus,
  Dashboard,
  DriverListItem,
  Flat,
  Paginated,
  RechargeRequest,
  Resident,
  Vehicle,
  VehicleStatus,
  WalletSummary,
} from "./types";

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

const subscribeToBrowserOrigin = () => () => undefined;
const browserOriginSnapshot = () => window.location.origin;
const serverOriginSnapshot = () => "";

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
    ) : section === "society-qr" ? (
      <SocietyQRScreen />
    ) : section === "recharge-requests" ? (
      <RechargeRequestsScreen />
    ) : section === "cancellation-settings" ? (
      <CancellationSettingsScreen />
    ) : section === "affected-bookings" ? (
      <AffectedBookingsScreen />
    ) : (
      <DashboardScreen />
    );

  return <AdminShell>{content}</AdminShell>;
}

function SocietyQRScreen() {
  const origin = useSyncExternalStore(
    subscribeToBrowserOrigin,
    browserOriginSnapshot,
    serverOriginSnapshot,
  );
  const qrUrl = origin ? `${origin}/demo-payment` : "";
  const hostname = origin ? new URL(origin).hostname : "";
  const loopback = hostname === "localhost" || hostname === "127.0.0.1";

  return (
    <>
      <PageHeader
        title="Society QR"
        subtitle="Print or display this QR code for residents to scan."
      />
      <div className="grid two-col">
        <div className="card" style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "4rem" }}>
          {qrUrl ? <QRCode value={qrUrl} size={256} /> : <div className="skeleton" />}
          
          <h2 style={{ marginTop: "2rem" }}>Scan in the Resident App</h2>
          <p className="text-muted text-center" style={{ marginTop: "0.5rem" }}>
            Open Wallet, tap <strong>Scan Society QR</strong>, and scan this code to enter local demo recharge mode.
          </p>
          {loopback ? (
            <p className="error" style={{ marginTop: "1rem" }}>
              Open this admin portal using the laptop&apos;s LAN address before presenting this QR on another phone.
            </p>
          ) : null}
        </div>
      </div>
    </>
  );
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
      const effectiveVehicle = item.reassignedVehicle ?? item.vehicle;
      const existing = usage.get(effectiveVehicle.id) ?? {
        name: effectiveVehicle.name,
        count: 0,
      };
      existing.count += 1;
      usage.set(effectiveVehicle.id, existing);
    }

    const mostUsed = [...usage.values()].sort((a, b) => b.count - a.count)[0];
    const vehicleCount = vehicles.data?.items.length ?? 0;

    return {
      totalHours: totalMinutes / 60,
      mostUsed: mostUsed ? `${mostUsed.name} (${mostUsed.count})` : "No data",
      utilization:
        vehicleCount > 0
          ? `${Math.round((totalMinutes / (vehicleCount * 16 * 60)) * 100)}%`
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
            data.vehicles.INACTIVE +
            data.vehicles.BREAKDOWN;

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
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function deactivate(vehicle: Vehicle) {
    if (
      deactivatingId ||
      !confirm(`Deactivate ${vehicle.name}? Future bookings using this EV will be marked at risk.`)
    ) {
      return;
    }

    setActionError(null);
    setDeactivatingId(vehicle.id);
    try {
      await adminApi(`/admin/vehicles/${vehicle.id}`, { method: "DELETE" });
      await vehicles.reload();
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setDeactivatingId(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Vehicle Management"
        subtitle="Create EVs, edit registration data, and control operational status."
      />
      <Message error={actionError} />
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
                          {vehicle.status !== "INACTIVE" ? (
                            <button
                              className="button danger"
                              disabled={Boolean(deactivatingId)}
                              onClick={() => void deactivate(vehicle)}
                            >
                              {deactivatingId === vehicle.id
                                ? "Deactivating..."
                                : "Deactivate"}
                            </button>
                          ) : null}
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
  const timezone = useAdminUser()?.society.timezone ?? "Asia/Kolkata";
  const [name, setName] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [isReserve, setIsReserve] = useState("false");
  const [status, setStatus] = useState<VehicleStatus>("AVAILABLE");
  const [hourlyRate, setHourlyRate] = useState("100");
  const [maintenanceReason, setMaintenanceReason] = useState("");
  const [expectedReturnDate, setExpectedReturnDate] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      setName(editing?.name ?? "");
      setRegistrationNumber(editing?.registrationNumber ?? "");
      setIsReserve(editing?.isReserve ? "true" : "false");
      setStatus(editing?.status ?? "AVAILABLE");
      setHourlyRate(String(editing?.hourlyRate ?? 100));
      setMaintenanceReason(editing?.maintenanceReason ?? "");
      setExpectedReturnDate(
        editing?.expectedReturnDate
          ? dateInputValue(editing.expectedReturnDate, timezone)
          : ""
      );
    });
  }, [editing, timezone]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    const parsedHourlyRate = Number(hourlyRate);
    if (!Number.isInteger(parsedHourlyRate) || parsedHourlyRate <= 0) {
      setError("Hourly rate must be a positive whole number.");
      return;
    }

    try {
      setPending(true);
      const isMaintenance = status === "MAINTENANCE" || status === "BREAKDOWN";
      await adminApi(editing ? `/admin/vehicles/${editing.id}` : "/admin/vehicles", {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify({ 
          name, 
          registrationNumber, 
          status, 
          isReserve: isReserve === "true",
          hourlyRate: parsedHourlyRate,
          maintenanceReason: isMaintenance ? maintenanceReason : undefined,
          expectedReturnDate: isMaintenance
            ? dateInputToIso(expectedReturnDate, false, timezone)
            : undefined,
        }),
      });
      setMessage(editing ? "Vehicle updated." : "Vehicle created.");
      onSaved();
    } catch (currentError) {
      setError(errorMessage(currentError));
    } finally {
      setPending(false);
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
      <TextField
        label="Hourly Rate (INR)"
        type="number"
        value={hourlyRate}
        onChange={setHourlyRate}
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
        options={["AVAILABLE", "MAINTENANCE", "BREAKDOWN", "INACTIVE"]}
        onChange={(value) => setStatus(value as VehicleStatus)}
      />
      {(status === "MAINTENANCE" || status === "BREAKDOWN") && (
        <>
          <TextField
            label="Reason (Optional)"
            value={maintenanceReason}
            onChange={setMaintenanceReason}
          />
          <TextField
            label="Expected Return Date (Optional)"
            type="date"
            value={expectedReturnDate}
            onChange={setExpectedReturnDate}
          />
        </>
      )}
      <Message error={error} success={message} />
      <div className="actions">
        <button className="button" type="submit" disabled={pending}>
          {pending ? "Saving..." : editing ? "Save changes" : "Create vehicle"}
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
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function deactivate(flat: Flat) {
    if (
      deactivatingId ||
      !confirm(`Deactivate flat ${flat.number}? Its resident account will also be disabled.`)
    ) {
      return;
    }

    setActionError(null);
    setDeactivatingId(flat.id);
    try {
      await adminApi(`/admin/flats/${flat.id}`, { method: "DELETE" });
      await flats.reload();
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setDeactivatingId(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Flat Management"
        subtitle="Maintain society flats and weekly quota allocations."
      />
      <Message error={actionError} />
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
                            {flat.isActive ? (
                              <button
                                className="button danger"
                                disabled={Boolean(deactivatingId)}
                                onClick={() => void deactivate(flat)}
                              >
                                {deactivatingId === flat.id
                                  ? "Deactivating..."
                                  : "Deactivate"}
                              </button>
                            ) : null}
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
  const [allocatedHours, setAllocatedHours] = useState("16");
  const [isActive, setIsActive] = useState("true");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

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
      setPending(true);
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
          }),
        });
      }
      setMessage(editing ? "Flat updated." : "Flat created.");
      onSaved();
    } catch (currentError) {
      setError(errorMessage(currentError));
    } finally {
      setPending(false);
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
        <button className="button" type="submit" disabled={pending}>
          {pending ? "Saving..." : editing ? "Save changes" : "Create flat"}
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
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function deactivate(resident: Resident) {
    if (
      deactivatingId ||
      !confirm(`Deactivate ${resident.name}'s login account?`)
    ) {
      return;
    }

    setActionError(null);
    setDeactivatingId(resident.id);
    try {
      await adminApi(`/admin/residents/${resident.id}`, { method: "DELETE" });
      await residents.reload();
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setDeactivatingId(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Resident Management"
        subtitle="Create resident accounts, update contact details, reset passwords, and deactivate access."
      />
      <Message error={actionError} />
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
                          {resident.isActive ? (
                            <button
                              className="button danger"
                              disabled={Boolean(deactivatingId)}
                              onClick={() => void deactivate(resident)}
                            >
                              {deactivatingId === resident.id
                                ? "Deactivating..."
                                : "Deactivate"}
                            </button>
                          ) : null}
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
  const [password, setPassword] = useState("");
  const [isActive, setIsActive] = useState("true");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

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
      setPending(true);
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
    } finally {
      setPending(false);
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
        <button className="button" type="submit" disabled={pending}>
          {pending ? "Saving..." : editing ? "Save resident" : "Create resident"}
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
    quota ? String(quota.allocatedMinutes / 60) : "16",
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const remaining = quota ? quota.allocatedMinutes - quota.usedMinutes : 0;

  async function save() {
    setError(null);

    if (!quota) {
      setError("The current weekly quota has not been provisioned.");
      return;
    }

    const allocatedMinutes = minutesFromHours(allocatedHours);
    if (!Number.isInteger(allocatedMinutes) || allocatedMinutes < quota.usedMinutes) {
      setError("Allocation must be valid and cannot be below used time.");
      return;
    }

    try {
      setPending(true);
      await adminApi(`/admin/flats/${flat.id}/quota/${quota.year}`, {
        method: "PUT",
        body: JSON.stringify({
          allocatedMinutes,
          weekNumber: quota.weekNumber,
        }),
      });
      onSaved();
    } catch (currentError) {
      setError(errorMessage(currentError));
    } finally {
      setPending(false);
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
          <button className="button secondary" disabled={pending || !quota} onClick={() => void save()}>
            {pending ? "Saving..." : "Save"}
          </button>
        </div>
        {error ? <div className="error" style={{ marginTop: 8 }}>{error}</div> : null}
      </td>
    </tr>
  );
}

function BookingsScreen() {
  const timezone = useAdminUser()?.society.timezone ?? "Asia/Kolkata";
  const [status, setStatus] = useState<BookingStatus | "">("");
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
          from: dateInputToIso(date, false, timezone),
          to: dateInputToIso(date, true, timezone),
        })}`,
      ),
    [status, flatId, vehicleId, date, timezone],
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
            options={[
              "",
              "BOOKED",
              "DRIVER_ASSIGNED",
               "OTP_PENDING",
               "IN_PROGRESS",
               "ACTIVE",
               "AT_RISK",
              "REASSIGNED",
              "COMPLETED",
              "CANCELLED",
            ]}
            labels={{ "": "All statuses" }}
            onChange={(value) => setStatus(value as BookingStatus | "")}
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
  const timezone = useAdminUser()?.society.timezone ?? "Asia/Kolkata";
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
              <td>{(booking.reassignedVehicle ?? booking.vehicle).name}</td>
              <td>{dateTime(booking.startTime, timezone)}</td>
              <td>{dateTime(booking.endTime, timezone)}</td>
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
  const timezone = useAdminUser()?.society.timezone ?? "Asia/Kolkata";
  const vehicles = useAdminData(
    () => adminApi<Paginated<Vehicle>>("/admin/vehicles?pageSize=100"),
    [],
  );
  const bookings = useAdminData(
    () => adminApi<Paginated<Booking>>("/admin/bookings?pageSize=100"),
    [],
  );

  const currentVehicleIds = new Set(
    (bookings.data?.items ?? [])
      .filter((booking) =>
        booking.status !== "COMPLETED" && booking.status !== "CANCELLED"
      )
      .map((booking) => (booking.reassignedVehicle ?? booking.vehicle).id),
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
              const status = vehicle.status === "AVAILABLE" && currentVehicleIds.has(vehicle.id)
                ? "BOOKED"
                : vehicle.status;

              return (
                <div className="vehicle-status-card" key={vehicle.id}>
                  <div>
                    <strong>{vehicle.name}</strong>
                    <span className="muted">{vehicle.registrationNumber}</span>
                    {vehicle.isReserve ? (
                      <span className="badge warning" style={{ marginLeft: "8px" }}>RESERVE</span>
                    ) : (
                      <span className="badge" style={{ marginLeft: "8px" }}>NORMAL</span>
                    )}
                    {vehicle.maintenanceReason ? (
                      <span className="muted">Reason: {vehicle.maintenanceReason}</span>
                    ) : null}
                    {vehicle.expectedReturnDate ? (
                      <span className="muted">
                        Expected return: {dateTime(vehicle.expectedReturnDate, timezone)}
                      </span>
                    ) : null}
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
  const drivers = useAdminData(
    () => adminApi<DriverListItem[]>("/admin/drivers?includeInactive=true"),
    [],
  );
  const vehicles = useAdminData(
    () => adminApi<Paginated<Vehicle>>("/admin/vehicles?pageSize=100"),
    [],
  );
  const [editing, setEditing] = useState<DriverListItem | null>(null);

  return (
    <>
      <PageHeader
        title="Driver Management"
        subtitle="Manage driver profiles, vehicle assignments, and activity."
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
                    <th>License Number</th>
                    <th>Status</th>
                    <th>Assigned Vehicle</th>
                    <th>Upcoming Bookings</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((driver) => (
                    <tr key={driver.id}>
                      <td>
                        <strong>{driver.fullName}</strong>
                        {driver.email ? <div className="muted">{driver.email}</div> : null}
                      </td>
                      <td>{driver.phoneNumber}</td>
                      <td>{driver.licenseNumber}</td>
                      <td>
                        <StatusPill value={driver.isActive ? "ACTIVE" : "INACTIVE"} />
                      </td>
                      <td>{driver.vehicle ? `${driver.vehicle.name} (${driver.vehicle.registrationNumber})` : <span className="muted">None</span>}</td>
                      <td>{driver.upcomingTripsCount}</td>
                      <td>
                        <button
                          className="button secondary"
                          onClick={() => setEditing(driver)}
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DataCard>
        <DriverForm
          editing={editing}
          vehicles={vehicles.data?.items || []}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void drivers.reload();
          }}
        />
      </div>
    </>
  );
}

function DriverForm({
  editing,
  vehicles,
  onCancel,
  onSaved,
}: {
  editing: DriverListItem | null;
  vehicles: Vehicle[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [fullName, setFullName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [email, setEmail] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [password, setPassword] = useState("");
  const [isActive, setIsActive] = useState("true");
  const [vehicleId, setVehicleId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      setFullName(editing?.fullName ?? "");
      setPhoneNumber(editing?.phoneNumber ?? "");
      setEmail(editing?.email ?? "");
      setLicenseNumber(editing?.licenseNumber ?? "");
      setPassword("");
      setIsActive(editing ? String(editing.isActive) : "true");
      setVehicleId(editing?.vehicleId ?? "");
    });
  }, [editing]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    try {
      setPending(true);
      if (editing) {
        await adminApi(`/admin/drivers/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            fullName,
            phoneNumber,
            email: email || undefined,
            licenseNumber,
            password: password || undefined,
            isActive: isActive === "true",
            vehicleId,
          }),
        });
      } else {
        await adminApi("/admin/drivers", {
          method: "POST",
          body: JSON.stringify({
            fullName,
            phoneNumber,
            email: email || undefined,
            licenseNumber,
            password,
            isActive: isActive === "true",
            vehicleId,
          }),
        });
      }
      setMessage(editing ? "Driver updated successfully." : "Driver created successfully.");
      onSaved();
    } catch (currentError) {
      setError(errorMessage(currentError));
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="card form-card" onSubmit={submit}>
      <h2 className="panel-title">{editing ? "Edit Driver" : "Add Driver"}</h2>
      <TextField label="Full Name" value={fullName} onChange={setFullName} />
      <TextField label="Phone Number" value={phoneNumber} onChange={setPhoneNumber} />
      <TextField label="Email (Optional)" value={email} onChange={setEmail} />
      <TextField label="License Number" value={licenseNumber} onChange={setLicenseNumber} />
      <TextField
        label={editing ? "New Password (optional)" : "Login Password"}
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
      <SelectField
        label="Assigned Vehicle"
        value={vehicleId}
        options={["", ...vehicles.map((v) => v.id)]}
        labels={{ "": "None", ...Object.fromEntries(vehicles.map((v) => [v.id, `${v.name} (${v.registrationNumber})`])) }}
        onChange={setVehicleId}
      />
      <Message error={error} success={message} />
      <div className="actions">
        <button className="button" type="submit" disabled={pending}>
          {pending ? "Saving..." : editing ? "Save Driver" : "Create Driver"}
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

function WalletsScreen() {
  const wallets = useAdminData(
    () => adminApi<WalletSummary[]>("/admin/wallets"),
    [],
  );
  const [adjustingUser, setAdjustingUser] = useState<WalletSummary | null>(null);

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
                  {data.map((item) => (
                    <tr key={item.userId}>
                      <td>
                        <strong>{item.name}</strong>
                        <div className="muted">{item.phone}</div>
                      </td>
                      <td>{item.flat || "None"}</td>
                      <td>
                        <strong style={{ color: "var(--success)", fontSize: 18 }}>
                          {currency(item.balance)}
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
  user: WalletSummary;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [amountStr, setAmountStr] = useState("");
  const [typeStr, setTypeStr] = useState("CREDIT");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    const amount = Number(amountStr);
    if (!Number.isInteger(amount) || amount <= 0 || amount > 1_000_000) {
      setError("Enter a positive whole-number amount up to 1,000,000.");
      return;
    }

    try {
      setPending(true);
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
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="card form-card" onSubmit={submit}>
      <h2 className="panel-title">Adjust Wallet: {user.name}</h2>
      <TextField
        label="Amount (INR)"
        type="number"
        value={amountStr}
        onChange={setAmountStr}
      />
      <SelectField
        label="Transaction Type"
        value={typeStr}
        options={["CREDIT", "DEBIT"]}
        onChange={setTypeStr}
      />
      <TextField
        label="Description"
        value={description}
        onChange={setDescription}
      />
      <Message error={error} success={message} />
      <div className="actions">
        <button className="button" type="submit" disabled={pending}>
          {pending ? "Applying..." : "Apply Adjustment"}
        </button>
        <button className="button secondary" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function CancellationSettingsScreen() {
  const penaltyData = useAdminData(
    () => adminApi<{ amount: number }>("/admin/cancellation-penalty"),
    []
  );
  
  const [editedAmount, setEditedAmount] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const amountStr = editedAmount ?? String(penaltyData.data?.amount ?? "");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setSaving(true);

    const amount = Number(amountStr);
    if (!Number.isInteger(amount) || amount < 0 || amount > 1_000_000) {
      setError("Enter a whole-number amount from 0 to 1,000,000.");
      setSaving(false);
      return;
    }

    try {
      await adminApi("/admin/cancellation-penalty", {
        method: "POST",
        body: JSON.stringify({ amount }),
      });
      setMessage("Cancellation settings updated successfully.");
      await penaltyData.reload();
      setEditedAmount(null);
    } catch (currentError) {
      setError(errorMessage(currentError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Cancellation Settings"
        subtitle="Configure the fixed penalty amount deducted when a resident cancels a booking."
      />
      
      <div className="grid two-col">
        <form className="card form-card" onSubmit={submit}>
          <TextField
            label="Cancellation Penalty Amount (INR)"
            type="number"
            value={amountStr}
            onChange={setEditedAmount}
          />
          <Message error={error} success={message} />
          <div className="actions">
            <button className="button" type="submit" disabled={saving || penaltyData.loading}>
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

function AffectedBookingsScreen() {
  const timezone = useAdminUser()?.society.timezone ?? "Asia/Kolkata";
  const affectedBookings = useAdminData(
    () => adminApi<AffectedBooking[]>("/admin/bookings/affected"),
    [],
  );

  return (
    <>
      <PageHeader
        title="Affected Bookings"
        subtitle="Manage bookings impacted by vehicle maintenance and breakdowns."
      />
      <DataCard state={affectedBookings}>
        {(data) => (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Vehicle</th>
                  <th>Start Time</th>
                  <th>End Time</th>
                  <th>Resident</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {data.map((booking) => (
                  <tr key={booking.id}>
                    <td>{(booking.reassignedVehicle ?? booking.vehicle).name}</td>
                    <td>{dateTime(booking.startTime, timezone)}</td>
                    <td>{dateTime(booking.endTime, timezone)}</td>
                    <td>{booking.user.name}</td>
                    <td>
                      <StatusPill value={booking.status} />
                    </td>
                    <td>
                      <Link className="button secondary" href={`/admin/bookings/${booking.id}`}>
                        Open & Reassign
                      </Link>
                    </td>
                  </tr>
                ))}
                {data.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", padding: "32px 0" }}>
                      No affected bookings currently require reassignment.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </DataCard>
    </>
  );
}

function RechargeRequestsScreen() {
  const timezone = useAdminUser()?.society.timezone ?? "Asia/Kolkata";
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const requests = useAdminData(
    () => adminApi<Paginated<RechargeRequest>>(`/admin/recharge-requests?status=${statusFilter}`),
    [statusFilter],
  );

  async function processRequest(id: string, action: "APPROVE" | "REJECT") {
    if (processingId || !confirm(`Are you sure you want to ${action.toLowerCase()} this request?`)) {
      return;
    }

    setActionError(null);
    setProcessingId(id);
    try {
      await adminApi(`/admin/recharge-requests/${id}/process`, {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      await requests.reload();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setProcessingId(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Recharge Requests"
        subtitle="Review and process resident wallet top-up requests."
        action={
          <div style={{ display: "flex", gap: 12 }}>
            <SelectField
              label=""
              value={statusFilter}
              onChange={setStatusFilter}
              options={["ALL", "PENDING", "APPROVED", "REJECTED"]}
            />
          </div>
        }
      />
      <Message error={actionError} />

      <DataCard state={requests}>
        {(data) => (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Resident</th>
                  <th>Amount</th>
                  <th>Notes</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((req) => (
                  <tr key={req.id}>
                    <td>{dateTime(req.createdAt, timezone)}</td>
                    <td>
                      {req.user.name} ({req.user.flat?.number})
                    </td>
                    <td>{currency(req.amount)}</td>
                    <td>{req.notes || "-"}</td>
                    <td>
                      <StatusPill value={req.status} />
                    </td>
                    <td>
                      {req.status === "PENDING" ? (
                        <div style={{ display: "flex", gap: 8 }}>
                           <button
                             className="button"
                            disabled={Boolean(processingId)}
                            onClick={() => void processRequest(req.id, "APPROVE")}
                          >
                            {processingId === req.id ? "Processing..." : "Approve"}
                          </button>
                          <button
                            className="button secondary"
                            disabled={Boolean(processingId)}
                            onClick={() => void processRequest(req.id, "REJECT")}
                          >
                            Reject
                          </button>
                        </div>
                      ) : (
                        <span style={{ color: "var(--text-muted)", fontSize: 13 }}>
                          {req.status === "APPROVED" ? `Approved by ${req.approvedUser?.name || "Admin"}` : "Rejected"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {data.items.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", padding: "32px 0" }}>
                      No requests found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </DataCard>
    </>
  );
}
