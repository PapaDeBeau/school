"use client";

import { FormEvent, useEffect, useState } from "react";
import { appPath } from "../lib/app-paths";

const CANVAS_BASE_URL = "https://sequoiagrove.instructure.com";

type Connection = {
  baseUrl: string;
  displayName: string;
  courseCount: number;
  verifiedAt: string;
};

export function CanvasConnectionForm() {
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [status, setStatus] = useState<"loading" | "idle" | "connecting" | "connected">("loading");
  const [connection, setConnection] = useState<Connection | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const current = new URL(window.location.href);
    const exposedInUrl = current.searchParams.has("canvas-token");
    if (current.search) {
      window.history.replaceState({}, "", current.pathname);
    }
    if (exposedInUrl) {
      queueMicrotask(() => {
        setMessage(
          "That token was removed from the address for safety. It was not saved and should be replaced in Canvas before connecting."
        );
      });
    }

    fetch(appPath("/api/canvas/connection"), { cache: "no-store", credentials: "same-origin" })
      .then(async (response) => {
        if (response.status === 401) {
          window.location.replace(appPath("/"));
          return;
        }
        const data = (await response.json()) as {
          connected?: boolean;
          connection?: Connection;
        };
        if (data.connected && data.connection) {
          setConnection(data.connection);
          setStatus("connected");
        } else {
          setStatus("idle");
        }
      })
      .catch(() => setStatus("idle"));
  }, []);

  async function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token.trim()) {
      setMessage("Paste the complete Canvas access token.");
      return;
    }

    setStatus("connecting");
    setMessage("");
    try {
      const response = await fetch(appPath("/api/canvas/connection"), {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl: CANVAS_BASE_URL, token }),
      });
      const data = (await response.json()) as {
        connected?: boolean;
        connection?: Connection;
        error?: string;
      };
      if (response.status === 401) {
        window.location.replace(appPath("/"));
        return;
      }
      setToken("");
      setShowToken(false);

      if (!response.ok || !data.connected || !data.connection) {
        setMessage(data.error ?? "Canvas could not be connected.");
        setStatus("idle");
        return;
      }

      setConnection(data.connection);
      setStatus("connected");
    } catch {
      setToken("");
      setMessage("The secure connection could not be completed. Try again.");
      setStatus("idle");
    }
  }

  async function disconnect() {
    const approved = window.confirm(
      "Remove the encrypted Canvas connection from this dashboard? This does not revoke the token in Canvas."
    );
    if (!approved) return;

    const response = await fetch(appPath("/api/canvas/connection"), { method: "DELETE", credentials: "same-origin" });
    if (response.status === 401) {
      window.location.replace(appPath("/"));
      return;
    }
    if (response.ok) {
      setConnection(null);
      setStatus("idle");
      setMessage("The local connection was removed.");
    }
  }

  if (status === "connected" && connection) {
    return (
      <section className="token-panel connected-panel" aria-live="polite">
        <div className="panel-heading">
          <span className="status-dot" aria-hidden="true" />
          <div>
            <p className="panel-kicker">Secure connection active</p>
            <h2>{connection.displayName}</h2>
          </div>
        </div>
        <div className="connection-facts">
          <div><span>Canvas</span><strong>Sequoia Grove</strong></div>
          <div><span>Active courses found</span><strong>{connection.courseCount}</strong></div>
          <div><span>Verified</span><strong>{new Date(connection.verifiedAt).toLocaleString()}</strong></div>
        </div>
        <a className="primary-link" href={appPath("/dashboard")}>Open school dashboard</a>
        <button className="text-button" type="button" onClick={disconnect}>Remove secure connection</button>
      </section>
    );
  }

  return (
    <form className="token-panel" onSubmit={connect} noValidate>
      <div className="panel-heading">
        <span className="status-dot" aria-hidden="true" />
        <div>
          <p className="panel-kicker">Official Canvas API</p>
          <h2>Connect Sequoia Grove</h2>
        </div>
      </div>

      {message && <div className="form-message" role="alert">{message}</div>}

      <label htmlFor="canvas-domain">Canvas address</label>
      <input id="canvas-domain" type="url" value={CANVAS_BASE_URL} readOnly />

      <div className="label-row">
        <label htmlFor="canvas-token">Access token</label>
        <span>Required</span>
      </div>
      <div className="token-input-wrap">
        <input
          id="canvas-token"
          name="canvas-token"
          type={showToken ? "text" : "password"}
          autoComplete="off"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          placeholder="Paste token here"
          disabled={status === "loading" || status === "connecting"}
        />
        <button
          className="reveal-button"
          type="button"
          onClick={() => setShowToken((visible) => !visible)}
          aria-label={showToken ? "Hide token" : "Show token"}
        >
          {showToken ? "Hide" : "Show"}
        </button>
      </div>
      <p className="field-help">
        The token is encrypted on the server and cleared from this browser after verification.
      </p>

      <button className="submit-button" type="submit" disabled={status === "loading" || status === "connecting"}>
        {status === "loading" ? "Checking secure vault…" : status === "connecting" ? "Verifying with Canvas…" : "Connect & verify"}
      </button>
      <p className="panel-footnote">Nothing is submitted, sent, or changed in Canvas.</p>
    </form>
  );
}
