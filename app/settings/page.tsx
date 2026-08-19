import type { Metadata } from "next";
import { appPath } from "../../lib/app-paths";
import { CanvasConnectionForm } from "../CanvasConnectionForm";
import { XaiConnectionForm } from "../XaiConnectionForm";

export const metadata: Metadata = {
  title: "Settings | Beau School Dashboard",
  description: "Manage Beau's secure Canvas connection.",
};

export default function SettingsPage() {
  return (
    <main className="connection-shell">
      <section className="connection-card" aria-labelledby="page-title">
        <div className="brand-row">
          <div className="brand-mark" aria-hidden="true">B</div>
          <div><p className="eyebrow">Beau School Dashboard</p><p className="brand-note">Private family workspace</p></div>
          <a className="local-badge" href={appPath("/dashboard")}>Back to dashboard</a>
        </div>

        <div className="connection-grid">
          <div className="connection-copy">
            <p className="step-label">Canvas connection</p>
            <h1 id="page-title">Bring school into one calm, clear view.</h1>
            <p className="intro">Connect Beau&apos;s Canvas account to securely organize assignments, classes, grades, and messages—without storing a password.</p>
            <div className="trust-list" aria-label="Connection protections">
              <div><span>01</span><p><strong>Read-only first</strong>Nothing is submitted, sent, or changed in Canvas.</p></div>
              <div><span>02</span><p><strong>Token stays private</strong>The browser never receives it after connection.</p></div>
              <div><span>03</span><p><strong>Source-linked</strong>Every item keeps a direct path back to Canvas.</p></div>
            </div>
          </div>
          <CanvasConnectionForm />
        </div>
      </section>
      <section className="connection-card" aria-labelledby="xai-page-title">
        <div className="connection-grid">
          <div className="connection-copy">
            <p className="step-label">Announcement voices</p>
            <h2 id="xai-page-title">Connect Luna and Lux.</h2>
            <p className="intro">Add the xAI API key once. It is encrypted on the server and used only to create missing announcement recordings.</p>
          </div>
          <XaiConnectionForm />
        </div>
      </section>
      <footer><span>Designed for Beau&apos;s 2026–27 school year</span><span>Canvas data remains under your control</span></footer>
    </main>
  );
}
