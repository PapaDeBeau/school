"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { appPath } from "../../lib/app-paths";

type ActionItem = {
  id: string;
  kind: "assignment" | "message";
  title: string;
  course: string;
  dueAt: string | null;
  points: number | null;
  state: string;
  detail: string;
  sourceUrl: string;
};

type WeekItem = {
  day: string;
  time: string;
  course: string;
  note: string;
  tentative: boolean;
};

type Course = {
  id: number;
  name: string;
  grade: string | null;
  score: number | null;
};

type DashboardData = {
  generatedAt: string;
  student: string;
  courseCount: number;
  unreadCount: number;
  critical: ActionItem[];
  upcoming: ActionItem[];
  week: WeekItem[];
  courses: Course[];
};

const dateFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const timeFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  hour: "numeric",
  minute: "2-digit",
});

const dayFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  weekday: "long",
  month: "long",
  day: "numeric",
});

function formatDate(value: string | null) {
  if (!value) return "No due date";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : dateFormat.format(date);
}

function ActionList({ items, empty }: { items: ActionItem[]; empty: string }) {
  if (!items.length) {
    return (
      <div className="empty-state">
        <span aria-hidden="true">✓</span>
        <p>{empty}</p>
      </div>
    );
  }

  return (
    <div className="action-list">
      {items.map((item) => (
        <a
          className="action-item"
          href={item.sourceUrl}
          key={item.id}
          rel="noreferrer"
          target="_blank"
        >
          <span className={`action-icon action-icon-${item.kind}`} aria-hidden="true">
            {item.kind === "message" ? "M" : "A"}
          </span>
          <span className="action-copy">
            <strong>{item.title}</strong>
            <small>{item.course}</small>
          </span>
          <span className="action-due">
            {item.kind === "message" ? "Unread" : formatDate(item.dueAt)}
          </span>
          <span className="action-arrow" aria-hidden="true">↗</span>
        </a>
      ))}
    </div>
  );
}

export function DashboardHome() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const sync = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(appPath("/api/dashboard"), {
        cache: "no-store",
        credentials: "same-origin",
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Canvas could not be synced.");
      setData(body);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Canvas could not be synced.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialSync = window.setTimeout(() => void sync(), 0);
    return () => window.clearTimeout(initialSync);
  }, [sync]);

  if (!data && loading) {
    return (
      <main className="dashboard-shell dashboard-centered">
        <div className="sync-loader" role="status">
          <span aria-hidden="true" />
          <strong>Checking Canvas…</strong>
          <p>Gathering assignments, messages, classes, and grades.</p>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="dashboard-shell dashboard-centered">
        <div className="dashboard-error" role="alert">
          <p className="section-kicker">Connection needed</p>
          <h1>Canvas could not be loaded.</h1>
          <p>{error}</p>
          <div className="error-actions">
            <button type="button" onClick={() => void sync()}>Try again</button>
            <Link href={appPath("/")}>Check connection</Link>
          </div>
        </div>
      </main>
    );
  }

  const allClear = data.critical.length === 0;

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <Link className="dashboard-brand" href={appPath("/")} aria-label="Beau School Dashboard connection settings">
          <span>B</span>
          <span><strong>Beau School Dashboard</strong><small>Private family workspace</small></span>
        </Link>
        <div className="dashboard-controls">
          <span className="sync-time">
            <i aria-hidden="true" /> Updated {timeFormat.format(new Date(data.generatedAt))}
          </span>
          <button type="button" className="sync-button" onClick={() => void sync()} disabled={loading}>
            {loading ? "Syncing…" : "Sync Canvas"}
          </button>
        </div>
      </header>

      <section className="dashboard-hero" aria-labelledby="dashboard-title">
        <div>
          <p className="section-kicker">{dayFormat.format(new Date(data.generatedAt))}</p>
          <h1 id="dashboard-title">{allClear ? "You’re clear for today." : "Here’s what needs attention."}</h1>
          <p>
            {allClear
              ? "No work is due today and there are no unread Canvas messages."
              : `${data.critical.length} item${data.critical.length === 1 ? "" : "s"} need attention today.`}
          </p>
        </div>
        <div className="hero-stat-row" aria-label="Dashboard summary">
          <div><strong>{data.critical.length}</strong><span>critical</span></div>
          <div><strong>{data.upcoming.length}</strong><span>upcoming</span></div>
          <div><strong>{data.unreadCount}</strong><span>unread</span></div>
          <div><strong>{data.courseCount}</strong><span>courses</span></div>
        </div>
      </section>

      {error ? <p className="inline-error" role="alert">Latest sync failed: {error}</p> : null}

      <section className={`dashboard-section critical-section ${allClear ? "all-clear" : ""}`}>
        <div className="section-heading">
          <div>
            <p className="section-kicker">01 · Act now</p>
            <h2>Critical information</h2>
          </div>
          <span className="count-pill">{data.critical.length}</span>
        </div>
        <ActionList
          items={data.critical}
          empty="Nothing is due today and there are no unread teacher messages."
        />
      </section>

      <div className="dashboard-grid">
        <section className="dashboard-section">
          <div className="section-heading">
            <div>
              <p className="section-kicker">02 · Next up</p>
              <h2>Important upcoming</h2>
            </div>
            <span className="count-pill neutral">{data.upcoming.length}</span>
          </div>
          <ActionList items={data.upcoming} empty="No incomplete assignments are due in the next seven days." />
        </section>

        <section className="dashboard-section week-section">
          <div className="section-heading">
            <div>
              <p className="section-kicker">03 · Schedule</p>
              <h2>This week</h2>
            </div>
          </div>
          <div className="week-list">
            {data.week.map((item) => (
              <div className="week-item" key={`${item.day}-${item.time}-${item.course}`}>
                <span className="week-day">{item.day.slice(0, 3)}</span>
                <span className="week-copy"><strong>{item.course}</strong><small>{item.time}</small></span>
                {item.tentative ? <span className="tentative-badge">Confirm</span> : null}
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="courses-section">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Course pulse</p>
            <h2>Courses &amp; grades</h2>
          </div>
          <a href="https://sequoiagrove.instructure.com/courses" target="_blank" rel="noreferrer">Open Canvas ↗</a>
        </div>
        <div className="course-grid">
          {data.courses.map((course, index) => (
            <article className="course-card" key={course.id}>
              <span className="course-index">{String(index + 1).padStart(2, "0")}</span>
              <h3>{course.name}</h3>
              <div>
                <strong>{course.grade ?? (course.score === null ? "—" : `${course.score}%`)}</strong>
                <span>{course.grade || course.score !== null ? "Current grade" : "No grade posted"}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <footer className="dashboard-footer">
        <span>Canvas data is read-only and source-linked.</span>
        <span>Times shown in Pacific Time.</span>
      </footer>
    </main>
  );
}
