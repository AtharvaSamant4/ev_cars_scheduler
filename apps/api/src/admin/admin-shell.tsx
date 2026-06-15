"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";

import { adminApi } from "./api";
import type { AdminUser } from "./types";

const navItems = [
  ["dashboard", "Dashboard"],
  ["vehicles", "Vehicles"],
  ["flats", "Flats"],
  ["residents", "Residents"],
  ["quota", "Quota"],
  ["bookings", "Bookings"],
  ["vehicle-status", "Vehicle Status"],
] as const;

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="admin-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark">EV</div>
          <div>
            <strong>Society EV</strong>
            <span>{user?.society.name ?? "Admin Portal"}</span>
          </div>
        </div>

        <nav className="nav">
          {navItems.map(([section, label]) => {
            const href = `/admin/${section}`;
            const active = pathname === href || pathname.startsWith(`${href}/`);

            return (
              <Link className={active ? "active" : ""} href={href} key={section}>
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <span>Signed in as {user?.name ?? "Admin"}</span>
          <button className="button secondary" onClick={() => void logout()}>
            Logout
          </button>
        </div>
      </aside>
      <main className="content">{children}</main>
    </div>
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
      : value === "INACTIVE" || value === "CANCELLED"
        ? "pill danger"
        : "pill";

  return <span className={className}>{normalized}</span>;
}
