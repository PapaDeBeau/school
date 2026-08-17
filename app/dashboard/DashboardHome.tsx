"use client";

import { useCallback, useEffect, useState } from "react";
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
  viewer: {
    username: string;
    displayName: string;
  };
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
      {items.map((item, index) => (
        <a className="action-item" href={item.sourceUrl} key={item.id} rel="noreferrer" target="_blank">
          <span className={`action-icon action-tone-${(index % 4) + 1}`} aria-hidden="true">
            {item.kind === "message" ? "M" : "A"}
          </span>
          <span className="action-copy"><strong>{item.title}</strong><small>{item.course}</small></span>
          <span className="action-due">{item.kind === "message" ? "Unread" : formatDate(item.dueAt)}</span>
          <span className="action-arrow" aria-hidden="true">›</span>
        </a>
      ))}
    </div>
  );
}

const canvasLinks = [
  { label: "Dashboard", icon: "⌂", href: appPath("/dashboard"), local: true },
  { label: "Canvas", icon: "▣", href: "https://sequoiagrove.instructure.com/" },
  { label: "Calendar", icon: "□", href: "https://sequoiagrove.instructure.com/calendar" },
  { label: "Courses", icon: "▤", href: "https://sequoiagrove.instructure.com/courses" },
  { label: "Grades", icon: "▥", href: "https://sequoiagrove.instructure.com/grades" },
  { label: "Inbox", icon: "✉", href: "https://sequoiagrove.instructure.com/conversations#filter=type=inbox" },
  { label: "Files", icon: "▱", href: "https://sequoiagrove.instructure.com/files" },
  { label: "Settings", icon: "⚙", href: appPath("/settings"), local: true },
];

export function DashboardHome() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAllUpcoming, setShowAllUpcoming] = useState(false);
  const [focusMode, setFocusMode] = useState(false);

  const sync = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(appPath("/api/dashboard"), { cache: "no-store", credentials: "same-origin" });
      const body = await response.json();
      if (response.status === 401) {
        window.location.replace(appPath("/"));
        return;
      }
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

  async function signOut() {
    await fetch(appPath("/api/auth/logout"), { method: "POST", credentials: "same-origin" });
    window.location.assign(appPath("/"));
  }

  if (!data && loading) {
    return (
      <main className="dashboard-shell dashboard-centered">
        <div className="sync-loader" role="status"><span aria-hidden="true" /><strong>Checking Canvas…</strong><p>Gathering assignments, messages, classes, and grades.</p></div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="dashboard-shell dashboard-centered">
        <div className="dashboard-error" role="alert">
          <p className="section-kicker">Connection needed</p><h1>Canvas could not be loaded.</h1><p>{error}</p>
          <div className="error-actions"><button type="button" onClick={() => void sync()}>Try again</button><a href={appPath("/settings")}>Check connection</a></div>
        </div>
      </main>
    );
  }

  const allClear = data.critical.length === 0;
  const visibleUpcoming = showAllUpcoming ? data.upcoming : data.upcoming.slice(0, 5);
  const firstName = data.student.split(" ")[0] || "Beau";
  const viewerInitials = data.viewer.displayName.slice(0, 2).toUpperCase();

  return (
    <main className={`school-app${focusMode ? " is-focus-mode" : ""}`}>
      <aside className="school-sidebar">
        <a className="sidebar-brand" href={appPath("/dashboard")} aria-label="Beau School dashboard">
          <span className="sidebar-logo">B</span><span><strong>Beau School</strong><small>Private family workspace</small></span>
        </a>
        <nav className="school-nav" aria-label="School navigation">
          {canvasLinks.map((item) => (
            <a className={item.label === "Dashboard" ? "active" : ""} href={item.href} key={item.label} {...(!item.local ? { target: "_blank", rel: "noreferrer" } : {})}>
              <span aria-hidden="true">{item.icon}</span>{item.label}
            </a>
          ))}
        </nav>
        <section className="focus-card">
          <p><span aria-hidden="true">◆</span> Focus Mode</p><small>Keep the next assignment front and center.</small>
          <button type="button" onClick={() => setFocusMode((active) => !active)}>{focusMode ? "Exit session" : "Start session"}</button>
        </section>
        <div className="student-card">
          <span>{viewerInitials}</span>
          <div><strong>{data.viewer.displayName}</strong><small>Family dashboard</small></div>
          <button type="button" onClick={() => void signOut()} aria-label={`Sign out ${data.viewer.displayName}`}>↪</button>
        </div>
      </aside>

      <section className="school-workspace">
        <header className="workspace-header">
          <div><h1>Dashboard</h1><p>{dayFormat.format(new Date(data.generatedAt))}</p></div>
          <div className="dashboard-controls">
            <span className="sync-time"><i aria-hidden="true" /> Updated {timeFormat.format(new Date(data.generatedAt))}</span>
            <button type="button" className="sync-button" onClick={() => void sync()} disabled={loading}><span aria-hidden="true">↻</span>{loading ? "Syncing…" : "Sync Canvas"}</button>
            <button type="button" className="logout-button" onClick={() => void signOut()}><span aria-hidden="true">↪</span>Log out</button>
          </div>
        </header>

        <section className="overview-hero" aria-labelledby="dashboard-title">
          <div className="hero-message">
            <span className={`hero-check ${allClear ? "is-clear" : "needs-attention"}`} aria-hidden="true">{allClear ? "✓" : "!"}</span>
            <div><p className="hero-kicker">{dayFormat.format(new Date(data.generatedAt))}</p><h2 id="dashboard-title">{allClear ? "All clear for today" : "Here’s what needs attention"}</h2><p>{allClear ? "No work is due today and there are no unread Canvas messages." : `${data.critical.length} item${data.critical.length === 1 ? "" : "s"} need attention today.`}</p></div>
          </div>
          <div className="hero-landscape" aria-hidden="true"><i className="mountain mountain-back" /><i className="mountain mountain-mid" /><i className="mountain mountain-front" /><span className="hero-sun" /><span className="hero-student">B</span></div>
        </section>

        <section className="summary-grid" aria-label="Dashboard summary">
          <article className="summary-card critical-stat"><span aria-hidden="true">!</span><div><strong>{data.critical.length}</strong><small>Critical</small></div></article>
          <article className="summary-card upcoming-stat"><span aria-hidden="true">□</span><div><strong>{data.upcoming.length}</strong><small>Upcoming</small></div></article>
          <article className="summary-card unread-stat"><span aria-hidden="true">✉</span><div><strong>{data.unreadCount}</strong><small>Unread</small></div></article>
          <article className="summary-card course-stat"><span aria-hidden="true">▤</span><div><strong>{data.courseCount}</strong><small>Courses</small></div></article>
        </section>

        {error ? <p className="inline-error" role="alert">Latest sync failed: {error}</p> : null}

        <section className={`critical-strip ${allClear ? "is-clear" : "needs-attention"}`}>
          <span className="critical-shield" aria-hidden="true">{allClear ? "✓" : "!"}</span>
          <div><p>Critical information</p><strong>{allClear ? "Nothing is due today and there are no unread teacher messages." : `${data.critical.length} items need attention.`}</strong></div>
          <span className="critical-chevron" aria-hidden="true">›</span>
          {!allClear ? <ActionList items={data.critical} empty="Nothing needs attention." /> : null}
        </section>

        <div className="primary-dashboard-grid">
          <section className="dash-panel upcoming-panel">
            <div className="panel-title-row"><div><span aria-hidden="true">□</span><h2>Important upcoming</h2></div><span className="blue-count">{data.upcoming.length}</span></div>
            <ActionList items={visibleUpcoming} empty="No incomplete assignments are due in the next seven days." />
            {data.upcoming.length > 5 ? <button className="panel-link" type="button" onClick={() => setShowAllUpcoming((visible) => !visible)}>{showAllUpcoming ? "Show the priority five" : `View all upcoming (${data.upcoming.length})`}<span aria-hidden="true">→</span></button> : null}
          </section>

          <section className="dash-panel schedule-panel">
            <div className="panel-title-row"><div><span aria-hidden="true">⌁</span><h2>This week</h2></div><a href="https://sequoiagrove.instructure.com/calendar" target="_blank" rel="noreferrer">View calendar</a></div>
            <div className="week-list">
              {data.week.map((item, index) => (
                <div className="week-item" key={`${item.day}-${item.time}-${item.course}`}>
                  <span className="week-day">{item.day.slice(0, 3)}</span><i className={`schedule-dot dot-${(index % 4) + 1}`} aria-hidden="true" /><span className="week-time">{item.time}</span><span className="week-course">{item.course}</span>{item.tentative ? <span className="tentative-badge">Confirm</span> : null}
                </div>
              ))}
            </div>
            <a className="panel-link panel-link-anchor" href="https://sequoiagrove.instructure.com/calendar" target="_blank" rel="noreferrer">View full schedule <span aria-hidden="true">→</span></a>
          </section>
        </div>

        <div className="secondary-dashboard-grid">
          <section className="dash-panel courses-panel">
            <div className="panel-title-row"><div><span aria-hidden="true">▤</span><h2>Courses &amp; grades</h2></div><a href="https://sequoiagrove.instructure.com/courses" target="_blank" rel="noreferrer">Open Canvas</a></div>
            <div className="course-grid">
              {data.courses.map((course, index) => (
                <article className="course-card" key={course.id}><span className={`course-index course-tone-${(index % 4) + 1}`}>{String(index + 1).padStart(2, "0")}</span><div><h3>{course.name}</h3><small>{course.grade || course.score !== null ? "Current grade" : "No grade posted"}</small></div><strong>{course.grade ?? (course.score === null ? "—" : `${course.score}%`)}</strong></article>
              ))}
            </div>
          </section>

          <section className="dash-panel quick-panel">
            <div className="panel-title-row"><div><span aria-hidden="true">✦</span><h2>Quick actions</h2></div></div>
            <div className="quick-actions"><a href="https://sequoiagrove.instructure.com/conversations#filter=type=inbox" target="_blank" rel="noreferrer"><span>✉</span>Message teachers</a><a href="https://sequoiagrove.instructure.com/files" target="_blank" rel="noreferrer"><span>⇧</span>Open files</a><a href="https://sequoiagrove.instructure.com/grades" target="_blank" rel="noreferrer"><span>▥</span>View grades</a><a href="https://sequoiagrove.instructure.com/calendar" target="_blank" rel="noreferrer"><span>□</span>Open calendar</a></div>
            <div className="encouragement"><span>{firstName.slice(0, 1)}</span><div><strong>Keep it going, {firstName}!</strong><small>One clear view for the whole school week.</small></div></div>
          </section>
        </div>

        <footer className="dashboard-footer"><span>Canvas data is read-only and source-linked.</span><span>Times shown in Pacific Time.</span></footer>
      </section>
    </main>
  );
}
