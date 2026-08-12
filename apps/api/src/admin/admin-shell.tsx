"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, ReactNode, useContext, useEffect, useState } from "react";

import { adminApi } from "./api";
import type { AdminUser, AffectedBooking, Paginated, RechargeRequest } from "./types";

const navGroups = [
  {
    label: "OPERATE",
    items: [
      ["dashboard", "Dashboard", null],
      ["bookings", "Bookings", null],
      ["vehicle-status", "Vehicle Status", null],
      ["affected-bookings", "Affected Bookings", "affected"],
    ],
  },
  {
    label: "FLEET",
    items: [
      ["vehicles", "Vehicles", null],
      ["drivers", "Drivers", null],
    ],
  },
  {
    label: "SOCIETY",
    items: [
      ["flats", "Flats", null],
      ["residents", "Residents", null],
      ["quota", "Quota", null],
    ],
  },
  {
    label: "MONEY",
    items: [
      ["wallets", "Wallets", null],
      ["recharge-requests", "Recharge Requests", "recharges"],
      ["society-qr", "Society QR", null],
      ["cancellation-settings", "Cancellation Settings", null],
    ],
  },
] as const;

const AdminUserContext = createContext<AdminUser | null>(null);

export function useAdminUser() {
  return useContext(AdminUserContext);
}

function initialsFor(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [badges, setBadges] = useState<{ affected: number; recharges: number }>({
    affected: 0,
    recharges: 0,
  });

  useEffect(() => {
    let mounted = true;

    adminApi<AdminUser>("/me")
      .then((account) => {
        if (!mounted) {
          return;
        }

        if (account.role !== "ADMIN") {
          router.replace("/admin/login");
          return;
        }

        setUser(account);
      })
      .catch(() => router.replace("/admin/login"))
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [router]);

  useEffect(() => {
    if (!user) {
      return;
    }

    let mounted = true;

    function loadBadges() {
      Promise.all([
        adminApi<AffectedBooking[]>("/admin/bookings/affected").catch(() => []),
        adminApi<Paginated<RechargeRequest>>("/admin/recharge-requests?status=PENDING").catch(
          () => null,
        ),
      ]).then(([affected, recharges]) => {
        if (!mounted) {
          return;
        }
        setBadges({
          affected: affected.length,
          recharges: recharges?.items.length ?? 0,
        });
      });
    }

    // AdminShell stays mounted while navigating between "[section]" pages
    // (Dashboard, Bookings, Vehicles, ...), so a one-shot fetch here would
    // leave these counts stale after an admin resolves an item without
    // leaving that page template. Poll instead of wiring a reload callback
    // through every mutating action across every admin screen.
    loadBadges();
    const interval = setInterval(loadBadges, 20_000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [user]);

  async function logout() {
    await adminApi("/auth/admin/logout", { method: "POST" }).catch(() => null);
    router.replace("/admin/login");
    router.refresh();
  }

  if (loading) {
    return (
      <main className="admin-login-page">
        <div className="login-card">
          <div className="skeleton" />
        </div>
      </main>
    );
  }

  const badgeCount = (key: string | null) =>
    key === "affected" ? badges.affected : key === "recharges" ? badges.recharges : 0;

  return (
    <AdminUserContext.Provider value={user}>
    <div className="admin-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark">EV</div>
          <div>
            <strong>Society EV</strong>
            <span>{user?.society.name ?? "Admin console"}</span>
          </div>
        </div>

        <nav className="nav">
          {navGroups.map((group) => (
            <div key={group.label}>
              <div className="nav-group-label">{group.label}</div>
              {group.items.map(([section, label, badgeKey]) => {
                const href = `/admin/${section}`;
                const active = pathname === href || pathname.startsWith(`${href}/`);
                const count = badgeCount(badgeKey);

                return (
                  <Link className={active ? "active" : ""} href={href} key={section}>
                    <span>{label}</span>
                    {count > 0 ? (
                      <span className={`nav-badge${badgeKey === "affected" ? " danger" : ""}`}>
                        {count}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-footer-avatar">{initialsFor(user?.name ?? "Admin")}</div>
          <div className="sidebar-footer-info">
            <strong>{user?.name ?? "Admin"}</strong>
            <span>Trustee</span>
          </div>
          <button className="button secondary" onClick={() => void logout()}>
            Logout
          </button>
        </div>
      </aside>
      <main className="content">{children}</main>
    </div>
    </AdminUserContext.Provider>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        <p className="kicker">Admin Portal</p>
        <h1 className="title">{title}</h1>
        <p className="subtitle">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

export function StatusPill({ value }: { value: string }) {
  const normalized = value.replaceAll("_", " ");
  const className =
    value === "MAINTENANCE" || value === "BOOKED"
      ? "pill warning"
      : value === "INACTIVE" || value === "CANCELLED" || value === "BREAKDOWN" || value === "AT_RISK"
        ? "pill danger"
        : "pill";

  return <span className={className}>{normalized}</span>;
}
