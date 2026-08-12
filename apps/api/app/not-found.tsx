import Link from "next/link";

export default function NotFound() {
  return (
    <main className="admin-login-page">
      <div className="login-card">
        <div className="brand-mark">EV</div>
        <p className="kicker" style={{ marginTop: 20 }}>
          Error 404
        </p>
        <h1 className="title">Page not found</h1>
        <p className="subtitle">
          This page does not exist. It may have been moved, or the link may be
          out of date.
        </p>
        <Link className="button" href="/admin" style={{ marginTop: 24 }}>
          Back to dashboard
        </Link>
      </div>
    </main>
  );
}
