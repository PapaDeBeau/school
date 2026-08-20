"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { appPath } from "../lib/app-paths";
import { DashboardHome } from "./dashboard/DashboardHome";

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

const pinDigits = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];

const profilePhotoByUsername: Partial<Record<FamilyProfile["username"], string>> = {
  beau: "/beau-profile.webp",
  cathy: "/cathy-profile.webp",
  dad: "/dad-profile.webp",
  mom: "/mom-profile.webp",
};

function FamilyAvatar({ profile, large = false }: { profile: FamilyProfile; large?: boolean }) {
  const profilePhoto = profilePhotoByUsername[profile.username];
  if (profilePhoto) {
    return (
      <span className={`family-avatar avatar-${profile.username}${large ? " avatar-large" : ""}`} aria-hidden="true">
        {/* These finished profile artworks are supplied for the family login tiles. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="family-profile-photo" src={appPath(profilePhoto)} alt="" />
      </span>
    );
  }

  return (
    <span className={`family-avatar avatar-${profile.username}${large ? " avatar-large" : ""}`} aria-hidden="true">
      <i className="avatar-hair" />
      <i className="avatar-head" />
      <i className="avatar-body" />
      {profile.username === "beau" ? <i className="avatar-spider">◆</i> : null}
    </span>
  );
}

function CanvasStarterLogo() {
  return (
    // This supplied artwork is cropped by the circular starter-logo treatment.
    // eslint-disable-next-line @next/next/no-img-element
    <img className="canvas-starter-logo" src={appPath("/canvas-starter-logo.webp")} alt="" aria-hidden="true" />
  );
}

export function FamilyLogin() {
  const shellRef = useRef<HTMLElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  const hasShownLoginRef = useRef(false);
  const [selectedProfile, setSelectedProfile] = useState<FamilyProfile | null>(null);
  const [pin, setPin] = useState("");
  const [status, setStatus] = useState<"checking" | "idle" | "submitting">("checking");
  const [message, setMessage] = useState("");
  const [view, setView] = useState<"checking" | "login" | "dashboard">("checking");
  const [desktopPreview, setDesktopPreview] = useState<"mobile" | "desktop">("mobile");
  const selectedTheme = selectedProfile
    ? selectedProfile.username === "beau" || selectedProfile.username === "dad" ? "boy" : "girl"
    : null;

  useLayoutEffect(() => {
    if (view !== "login") return;
    const card = cardRef.current;
    const shell = shellRef.current;
    if (!card || !shell) return;

    const context = gsap.context(() => {
      gsap.set(card, { autoAlpha: 0, y: -170, scale: 0.92 });
      gsap.set(".selected-profile-circle, .selected-profile > strong, .pin-progress", { autoAlpha: 0, scale: 0.72 });
      gsap.set(".profile-options > button", { autoAlpha: 0, x: -28, scale: 0.84 });
      gsap.set(".pin-keypad", { autoAlpha: 0, y: 18 });
    }, shell);

    let cancelled = false;
    let timeline: gsap.core.Timeline | null = null;
    const preload = (source: string) => new Promise<void>((resolve) => {
      const image = new Image();
      image.onload = () => resolve();
      image.onerror = () => resolve();
      image.src = source;
      if (image.complete) resolve();
    });

    const backgroundSource = window.matchMedia("(max-width: 900px)").matches
      ? appPath("/login-mobile.webp")
      : appPath("/login-desktop.webp");

    Promise.all([
      preload(backgroundSource),
      preload(appPath("/canvas-starter-logo.webp")),
      preload(appPath("/beau-profile.webp")),
      preload(appPath("/cathy-profile.webp")),
      preload(appPath("/dad-profile.webp")),
      preload(appPath("/mom-profile.webp")),
    ]).then(() => {
      if (cancelled) return;
      const entranceDelay = hasShownLoginRef.current ? 0.2 : 1;
      hasShownLoginRef.current = true;
      timeline = gsap.timeline({ delay: entranceDelay })
        .to(card, { autoAlpha: 1, y: 0, scale: 1, duration: 0.85, ease: "bounce.out" })
        .to(card.querySelector(".selected-profile-circle"), { autoAlpha: 1, scale: 1, duration: 0.48, ease: "back.out(2)" }, "-=0.35")
        .to(card.querySelectorAll(".selected-profile > strong, .pin-progress"), { autoAlpha: 1, scale: 1, duration: 0.32, stagger: 0.08 }, "-=0.2")
        .to(card.querySelectorAll(".profile-options > button"), { autoAlpha: 1, x: 0, scale: 1, duration: 0.4, stagger: 0.14, ease: "back.out(1.8)" }, "+=0.05")
        .to(card.querySelector(".pin-keypad"), { autoAlpha: 1, y: 0, duration: 0.42, ease: "power2.out" }, "-=0.08");
    });

    return () => {
      cancelled = true;
      timeline?.kill();
      context.revert();
    };
  }, [view]);

  useEffect(() => {
    let active = true;
    fetch(appPath("/api/auth/session"), { cache: "no-store", credentials: "same-origin" })
      .then((response) => {
        if (!active) return;
        if (response.ok) {
          setView("dashboard");
          return;
        }
        setStatus("idle");
        setView("login");
      })
      .catch(() => {
        if (active) {
          setStatus("idle");
          setView("login");
        }
      });
    return () => { active = false; };
  }, []);

  function chooseProfile(profile: FamilyProfile) {
    setSelectedProfile(profile);
    setPin("");
    setMessage("");
  }

  async function verifyPin(profile: FamilyProfile, enteredPin: string) {
    setStatus("submitting");
    setMessage("");
    try {
      const response = await fetch(appPath("/api/auth/login"), {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: profile.username, pin: enteredPin }),
      });
      const body = await response.json() as LoginResponse;
      setPin("");
      if (!response.ok || !body.authenticated) {
        setMessage(response.status === 401 ? "Wrong PIN. Try again." : body.error ?? "The family login is temporarily unavailable.");
        setStatus("idle");
        return;
      }
      const card = cardRef.current;
      if (!card) {
        setView("dashboard");
        return;
      }
      gsap.to(card, {
        autoAlpha: 0,
        x: 0,
        y: -Math.max(window.innerHeight * 1.05, card.offsetHeight + 140),
        rotation: 0,
        scale: 0.9,
        duration: 0.86,
        ease: "power4.in",
        onComplete: () => setView("dashboard"),
      });
    } catch {
      setPin("");
      setMessage("The family login is temporarily unavailable. Please try again.");
      setStatus("idle");
    }
  }

  function pressDigit(digit: string) {
    if (!selectedProfile) {
      setMessage("Choose your profile first.");
      return;
    }
    if (status !== "idle" || pin.length >= 4) return;

    const nextPin = `${pin}${digit}`;
    setPin(nextPin);
    setMessage("");
    if (nextPin.length === 4) void verifyPin(selectedProfile, nextPin);
  }

  function returnToLogin() {
    setSelectedProfile(null);
    setPin("");
    setMessage("");
    setStatus("idle");
    setView("login");
  }

  return (
    <div className={`family-login-shell school-portal-shell preview-${desktopPreview}${view === "dashboard" ? " dashboard-active" : ""}`} ref={shellRef}>
      <div className="desktop-preview-switch" role="group" aria-label="Desktop preview size">
        <button className="preview-mobile-button" type="button" aria-pressed={desktopPreview === "mobile"} onClick={() => setDesktopPreview("mobile")}>Mobile</button>
        <button className="preview-desktop-button" type="button" aria-pressed={desktopPreview === "desktop"} onClick={() => setDesktopPreview("desktop")}>Desktop</button>
      </div>
      {view === "checking" ? (
        <div className="portal-session-check" role="status"><span aria-hidden="true" />Checking family session…</div>
      ) : null}

      {view === "login" ? <section className={`family-login-card${selectedTheme ? ` theme-${selectedTheme}` : ""}`} aria-label="Family login" ref={cardRef}>
        <div className={`selected-profile${selectedProfile ? " has-profile" : ""}`} aria-live="polite">
          <div className="selected-profile-circle">
            {selectedProfile ? <FamilyAvatar profile={selectedProfile} large /> : <CanvasStarterLogo />}
          </div>
          <div className="pin-progress" aria-label={`${pin.length} of 4 PIN digits entered`}>
            {[0, 1, 2, 3].map((index) => <i className={index < pin.length ? "is-filled" : ""} key={index} />)}
          </div>
          <strong>{selectedProfile?.displayName ?? "Choose your profile"}</strong>
        </div>

        <div className="profile-options" role="group" aria-label="Choose a family profile">
          {profiles.map((profile) => (
            <button
              className={`${selectedProfile?.username === profile.username ? "is-selected" : ""}${profilePhotoByUsername[profile.username] ? " has-profile-photo" : ""}`.trim()}
              type="button"
              key={profile.username}
              onClick={() => chooseProfile(profile)}
              aria-pressed={selectedProfile?.username === profile.username}
              aria-label={profile.displayName}
              disabled={status !== "idle"}
            >
              <FamilyAvatar profile={profile} />
              {profilePhotoByUsername[profile.username] ? null : <span>{profile.displayName}</span>}
            </button>
          ))}
        </div>

        <div className="pin-keypad" role="group" aria-label="Enter four-digit PIN">
          {message ? <div className="login-message" role="alert">{message}</div> : null}
          <div className="pin-number-grid">
            {pinDigits.map((digit) => (
              <button
                type="button"
                key={digit}
                onClick={() => pressDigit(digit)}
                disabled={status !== "idle" || !selectedProfile}
                aria-label={`PIN digit ${digit}`}
              >
                {digit}
              </button>
            ))}
          </div>
          <p className="pin-status" aria-live="polite">
            {status === "submitting" ? "Checking your PIN…" : selectedProfile ? "Enter your four-digit PIN" : "Choose a profile to begin"}
          </p>
        </div>
      </section> : null}

      {view === "dashboard" ? <DashboardHome immersive onExit={returnToLogin} /> : null}
    </div>
  );
}
