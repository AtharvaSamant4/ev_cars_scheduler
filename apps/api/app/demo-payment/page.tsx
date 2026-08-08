"use client";

import { useState } from "react";

import "./demo.css";

function paymentErrorMessage(payload: unknown) {
  if (typeof payload !== "object" || payload === null || !("error" in payload)) {
    return "Unknown error";
  }

  const error = payload.error;
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return "Unknown error";
}

export default function DemoPaymentPage() {
  const [amount, setAmount] = useState("1000");
  const [processing, setProcessing] = useState(false);
  const [success, setSuccess] = useState(false);

  async function submitPayment() {
    if (processing) return;

    const numericAmount = Number(amount);
    const userId = new URLSearchParams(window.location.search).get("userId");

    if (!userId) {
      window.alert("Missing Resident ID! Please ensure the URL contains ?userId=...");
      return;
    }

    if (numericAmount <= 0 || Number.isNaN(numericAmount)) {
      window.alert("Please enter a valid amount.");
      return;
    }

    setProcessing(true);
    try {
      const response = await fetch("/api/v1/wallet/public-demo-recharge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: numericAmount, userId }),
      });

      if (!response.ok) {
        const payload: unknown = await response.json().catch(() => null);
        window.alert(`Payment Failed: ${paymentErrorMessage(payload)}`);
        return;
      }

      setSuccess(true);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      window.alert(`Network Error: ${message}`);
    } finally {
      setProcessing(false);
    }
  }

  return (
    <main className="demo-page">
      {success ? (
        <div id="success-container" className="demo-card success-card">
          <div className="success-icon">✓</div>
          <h2>Payment Successful!</h2>
          <p>The money has been added to the wallet.</p>
          <p className="subtext">You can now check the Admin Portal or the Resident App to see the updated balance.</p>
        </div>
      ) : (
        <div id="form-container" className="demo-card">
          <div className="demo-header">
            <h1>Society EV</h1>
            <span className="badge">DEMO GATEWAY</span>
          </div>

          <p className="description">
            Enter the amount you wish to recharge. This is a mock payment gateway for presentation purposes.
          </p>

          <div className="input-group">
            <label htmlFor="amount-input">Amount (₹)</label>
            <input
              id="amount-input"
              type="number"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="e.g. 500"
            />
          </div>

          <div className="preset-amounts">
            {[500, 1000, 2000].map((preset) => (
              <button
                key={preset}
                type="button"
                className="preset-btn"
                onClick={() => setAmount(String(preset))}
              >
                ₹{preset}
              </button>
            ))}
          </div>

          <button
            id="native-pay-btn"
            type="button"
            className="pay-button"
            disabled={processing}
            onClick={() => void submitPayment()}
            style={{ display: "block", textAlign: "center", textDecoration: "none", boxSizing: "border-box" }}
          >
            {processing ? "Processing..." : `Pay ₹${amount || 0}`}
          </button>
        </div>
      )}
    </main>
  );
}
