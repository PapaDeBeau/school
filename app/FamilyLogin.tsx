"use client";

import { FormEvent, useEffect, useState } from "react";
import { appPath } from "../lib/app-paths";

type LoginResponse = {
  authenticated?: boolean;
  error?: string;
};

type FamilyProfile = {
  username: "beau" | "cathy" | "mom" | "dad";
  displayName: "Beau" | "Cathy" | "Mom" | "Dad";
};

const profiles: FamilyProfile[] = [
  { username: "beau", displayName: "Beau" },
  { username: "cathy", displayName: "Cathy" },
  { username: "mom", displayName: "Mom" },
  { username: "dad", displayName: "Dad" },
];

function FamilyAvatar({ profile, large = false }: { profile: FamilyProfile; large?: boolean }) {
  return (
    <span className={`family-avatar avatar-${profile.username}${large ? " avatar-large" : ""}`} aria-hidden="true">
      <i className="avatar-hair" />
      <i className="avatar-head" />
      <i className="avatar-body" />
      {profile.username === "beau" ? <i className="avatar-spider">◆</i> : null}
    </span>
  );
}

function SpiderEmblem() {
  return (
    <span className="spider-emblem" aria-hidden="true">
      <i className="spider-body" />
      <i className="spider-legs spider-legs-left" />
      <i className="spider-legs spider-legs-right" />
    </span>
  );
}

export function FamilyLogin() {
  const [selectedProfile, setSelectedProfile] = useState<FamilyProfile | null>(null);
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

  function chooseProfile(profile: FamilyProfile) {
    setSelectedProfile(profile);
    setPin("");
    setMessage("");
  }

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProfile) {
      setMessage("Choose your profile first.");
      return;
    }
    if (!/^\d{4}$/.test(pin)) {
      setMessage("Enter your four-digit PIN.");
      return;
    }

    setStatus("submitting");
    setMessage("");
    try {
      const response = await fetch(appPath("/api/auth/login"), {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: selectedProfile.username, pin }),
      });
      const body = await response.json() as LoginResponse;
      setPin("");
      if (!response.ok || !body.authenticated) {
        setMessage(body.error ?? "That PIN does not match this profile.");
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
      <section className="family-login-card" aria-label="Family login">
        <div className={`selected-profile${selectedProfile ? " has-profile" : ""}`} aria-live="polite">
          <div className="selected-profile-circle">
            {selectedProfile ? <FamilyAvatar profile={selectedProfile} large /> : <SpiderEmblem />}
          </div>
          <strong>{selectedProfile?.displayName ?? "Choose your profile"}</strong>
        </div>

        <div className="profile-options" role="group" aria-label="Choose a family profile">
          {profiles.map((profile) => (
            <button
              className={selectedProfile?.username === profile.username ? "is-selected" : ""}
              type="button"
              key={profile.username}
              onClick={() => chooseProfile(profile)}
              aria-pressed={selectedProfile?.username === profile.username}
              disabled={status !== "idle"}
            >
              <FamilyAvatar profile={profile} />
              <span>{profile.displayName}</span>
            </button>
          ))}
        </div>

        <form className="family-login-form" onSubmit={signIn} noValidate>
          {message ? <div className="login-message" role="alert">{message}</div> : null}

          <div className="login-field pin-field">
            <span aria-hidden="true">◆</span>
            <input
              id="family-pin"
              name="pin"
              aria-label="Four-digit PIN"
              type={showPin ? "text" : "password"}
              inputMode="numeric"
              pattern="[0-9]{4}"
              autoComplete="current-password"
              placeholder="Enter 4-digit PIN"
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
              disabled={status !== "idle" || !selectedProfile}
              maxLength={4}
            />
            <button type="button" onClick={() => setShowPin((visible) => !visible)} aria-label={showPin ? "Hide PIN" : "Show PIN"}>{showPin ? "Hide" : "Show"}</button>
          </div>

          <button className="family-login-button" type="submit" disabled={status !== "idle" || !selectedProfile}>
            {status === "checking" ? "Loading The Zone…" : status === "submitting" ? "Entering The Zone…" : "Enter The Zone"}
          </button>
        </form>
      </section>
    </main>
  );
}
