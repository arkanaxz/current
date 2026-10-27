"use client";

import { FormEvent, useState } from "react";

export default function AuthForm({ mode }: { mode: "login" | "setup" }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const setup = mode === "setup";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (setup && password !== confirm) return setError("The passwords do not match.");
    setBusy(true);
    try {
      const response = await fetch(`/api/auth/${setup ? "setup" : "login"}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not sign in.");
      window.location.assign("/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not connect to the app.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="auth-page"><section className="auth-card">
    <a className="brand auth-brand" href="/"><span className="logo">ϟ</span>current<span className="brand-dot">.</span></a>
    <p className="eyebrow">HOME ENERGY</p>
    <h1>{setup ? "Set up your account" : "Welcome back"}</h1>
    <p className="auth-copy">{setup ? "Create a username and password to protect your electricity records. Your workbook history will be loaded into this account." : "Sign in to view your household electricity dashboard."}</p>
    <form onSubmit={submit} className="auth-form">
      <label>Username<input autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} minLength={3} maxLength={32} pattern="[A-Za-z0-9_.-]+" required /></label>
      <small>3–32 letters, numbers, dots, dashes, or underscores.</small>
      <label>Password<input type="password" autoComplete={setup ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} minLength={10} maxLength={200} required /></label>
      {setup && <label>Confirm password<input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={10} maxLength={200} required /></label>}
      {setup && <small>Use at least 10 characters. The password is stored as a one-way hash.</small>}
      {error && <div className="form-error" role="alert">{error}</div>}
      <button className="btn primary auth-submit" disabled={busy}>{busy ? "Please wait…" : setup ? "Create account" : "Sign in"}</button>
    </form>
    <p className="auth-security">Your account and electricity records are stored in the local SQLite database on this server.</p>
  </section></main>;
}

