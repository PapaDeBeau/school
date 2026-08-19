"use client";

import { FormEvent, useEffect, useState } from "react";
import { appPath } from "../lib/app-paths";

export function XaiConnectionForm() {
  const [apiKey, setApiKey] = useState("");
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch(appPath("/api/xai/connection"), { cache: "no-store", credentials: "same-origin" })
      .then(async (response) => {
        if (response.status === 401) return window.location.replace(appPath("/"));
        const body = await response.json() as { connected?: boolean };
        setConnected(Boolean(body.connected));
      })
      .catch(() => setMessage("The xAI connection status could not be checked."))
      .finally(() => setLoading(false));
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!apiKey.trim()) return setMessage("Paste the complete xAI API key.");
    setSaving(true); setMessage("");
    try {
      const response = await fetch(appPath("/api/xai/connection"), {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apiKey }),
      });
      const body = await response.json() as { connected?: boolean; error?: string };
      setApiKey("");
      if (!response.ok || !body.connected) throw new Error(body.error || "xAI could not be connected.");
      setConnected(true); setMessage("Connected. Missing announcement recordings will now be created automatically.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "xAI could not be connected.");
    } finally { setSaving(false); }
  }

  return <form className="token-panel" onSubmit={save} noValidate>
    <div className="panel-heading"><span className="status-dot" aria-hidden="true" /><div><p className="panel-kicker">xAI text to speech</p><h2>{connected ? "Luna and Lux are connected" : "Connect xAI"}</h2></div></div>
    {message ? <div className="form-message" role="status">{message}</div> : null}
    <div className="label-row"><label htmlFor="xai-api-key">xAI API key</label><span>{connected ? "Replace key" : "Required"}</span></div>
    <input id="xai-api-key" name="xai-api-key" type="password" autoComplete="off" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={connected ? "Paste a replacement key" : "Paste key here"} disabled={loading || saving} />
    <p className="field-help">The key is verified, encrypted, and cleared from this browser immediately.</p>
    <button className="submit-button" type="submit" disabled={loading || saving}>{loading ? "Checking secure vault…" : saving ? "Verifying…" : connected ? "Replace xAI key" : "Connect & verify"}</button>
  </form>;
}
