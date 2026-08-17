"use client";

import { FormEvent, useEffect, useState } from "react";
import { appPath } from "../lib/app-paths";

type LoginResponse = {
  authenticated?: boolean;
  error?: string;
};

export function FamilyLogin() {
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [status, setStatus] = useState<"checking" | "idle" | "submitting">("checking");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    fetch(appPath("/api/auth/session"), { cache: "no-store", credentials: "same-origin" })
      .then((response) => {
        if (!active) return;
        if (response.ok) {
          window.location.replace(appPath("/dashboard"));
          return;
        }
        setStatus("idle");
      })
      .catch(() => {
        if (active) setStatus("idle");
      });
    return () => { active = false; };
  }, []);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!username.trim() || !/^\d{4}$/.test(pin)) {
      setMessage("Enter your username and four-digit PIN.");
      return;
    }

    setStatus("submitting");
    setMessage("");
    try {
      const response = await fetch(appPath("/api/auth/login"), {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), pin }),
      });
      const body = await response.json() as LoginResponse;
      setPin("");
      if (!response.ok || !body.authenticated) {
        setMessage(body.error ?? "That username and PIN do not match.");
        setStatus("idle");
        return;
      }
      window.location.assign(appPath("/dashboard"));
    } catch {
      setPin("");
      setMessage("The family login is temporarily unavailable. Please try again.");
      setStatus("idle");
    }
  }

  return (
    <main className="family-login-shell">
      <div className="login-atmosphere" aria-hidden="true">
        <span className="login-glow glow-one" />
        <span className="login-glow glow-two" />
        <span className="login-rain rain-one" />
        <span className="login-rain rain-two" />
        <span className="login-mountain mountain-one" />
        <span className="login-mountain mountain-two" />
      </div>

      <section className="family-login-card" aria-labelledby="family-login-title">
        <div className="login-brand">
          <span className="login-brand-mark" aria-hidden="true">B</span>
          <div><strong>Beau School</strong><small>Private family workspace</small></div>
        </div>

        <div className="login-heading">
          <p>Welcome home</p>
          <h1 id="family-login-title">Family login</h1>
          <span>Enter your name and personal four-digit PIN.</span>
        </div>

        <form className="family-login-form" onSubmit={signIn} noValidate>
          {message ? <div className="login-message" role="alert">{message}</div> : null}

          <label htmlFor="family-username">Username</label>
          <div className="login-field">
            <span aria-hidden="true">●</span>
            <input
              id="family-username"
              name="username"
              type="text"
              autoComplete="username"
              autoCapitalize="words"
              spellCheck={false}
              placeholder="Your family name"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              disabled={status !== "idle"}
              maxLength={64}
            />
          </div>

          <div className="login-label-row"><label htmlFor="family-pin">PIN</label><span>4 digits</span></div>
          <div className="login-field pin-field">
            <span aria-hidden="true">◆</span>
            <input
              id="family-pin"
              name="pin"
              type={showPin ? "text" : "password"}
              inputMode="numeric"
              pattern="[0-9]{4}"
              autoComplete="current-password"
              placeholder="••••"
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
              disabled={status !== "idle"}
              maxLength={4}
            />
            <button type="button" onClick={() => setShowPin((visible) => !visible)} aria-label={showPin ? "Hide PIN" : "Show PIN"}>{showPin ? "Hide" : "Show"}</button>
          </div>

          <button className="family-login-button" type="submit" disabled={status !== "idle"}>
            {status === "checking" ? "Checking session…" : status === "submitting" ? "Opening dashboard…" : "Open school dashboard"}
            <span aria-hidden="true">→</span>
          </button>
        </form>

        <p className="login-security"><span aria-hidden="true">✓</span> Secure private access · PIN attempts are protected</p>
      </section>

      <footer className="login-footer"><span>Beau&apos;s 2026–27 school year</span><span>Canvas data stays under family control</span></footer>
    </main>
  );
}
