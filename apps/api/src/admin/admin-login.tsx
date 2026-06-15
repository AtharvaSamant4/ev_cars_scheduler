"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { adminApi, errorMessage } from "./api";
import type { AdminSession } from "./types";

export function AdminLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@greenmeadows.demo");
  const [password, setPassword] = useState("Admin@123");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await adminApi<AdminSession>("/auth/admin/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      router.replace("/admin/dashboard");
      router.refresh();
    } catch (currentError) {
      setError(errorMessage(currentError));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="admin-login-page">
      <form className="login-card form-grid" onSubmit={submit}>
        <div className="brand-mark">EV</div>
        <div>
          <p className="kicker">Admin Portal</p>
          <h1 className="title">Society EV Management</h1>
          <p className="subtitle">
            Manage flats, residents, vehicles, quotas, and booking visibility
            from one trustee-friendly portal.
          </p>
        </div>

        <label className="field">
          <span>Email</span>
          <input
            className="input"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        {error ? <div className="error">{error}</div> : null}

        <button className="button" disabled={loading} type="submit">
          {loading ? "Signing in..." : "Login as admin"}
        </button>
      </form>
    </main>
  );
}
