"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Sign in failed");
        return;
      }
      router.push("/controller");
    } catch {
      setError("Sign in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-8 p-6">
      <header className="text-center">
        <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-accent-900 text-accent">
          <i className="ph-fill ph-device-mobile-speaker text-3xl" />
        </span>
        <h1 className="m-0 text-2xl">Home Intercom</h1>
        <p className="mt-1 text-sm text-neutral-500">Sign in to the controller.</p>
      </header>

      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            className="input"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            className="input"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && (
          <p className="flex items-center gap-2 text-sm text-accent-200">
            <i className="ph ph-warning-circle" />
            {error}
          </p>
        )}

        <button type="submit" disabled={busy} className="btn btn-primary min-h-12">
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
