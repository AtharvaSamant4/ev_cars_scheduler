"use client";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="admin-login-page">
      <div className="login-card">
        <div className="brand-mark">EV</div>
        <p className="kicker" style={{ marginTop: 20 }}>
          Unexpected error
        </p>
        <h1 className="title">Something went wrong</h1>
        <p className="subtitle">
          This page could not be displayed. No changes were saved.
        </p>

        {process.env.NODE_ENV === "development" ? (
          <pre
            style={{
              marginTop: 20,
              padding: 14,
              border: "1px solid var(--border)",
              borderRadius: 12,
              background: "var(--surface-muted)",
              color: "var(--text)",
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              lineHeight: 1.5,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {error.message}
          </pre>
        ) : null}

        <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
          <button className="button" onClick={reset} type="button">
            Try again
          </button>
          <a className="button secondary" href="/admin">
            Back to dashboard
          </a>
        </div>
      </div>
    </main>
  );
}
