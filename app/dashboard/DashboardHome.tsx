"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { gsap } from "gsap";
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
  description: string;
  availableFrom: string | null;
  availableUntil: string | null;
  submissionTypes: string[];
  allowedExtensions: string[];
  gradingType: string | null;
  allowedAttempts: number | null;
  published: boolean | null;
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

type InboxPerson = {
  id: string;
  name: string;
  avatarUrl: string | null;
};

type InboxConversation = {
  id: string;
  subject: string;
  preview: string;
  lastMessageAt: string | null;
  messageCount: number;
  contextName: string;
  workflowState: string;
  from: InboxPerson | null;
  avatarUrl: string | null;
};

type InboxAttachment = {
  id: string;
  name: string;
  url: string | null;
  size: number | null;
};

type InboxMessage = {
  id: string;
  createdAt: string | null;
  body: string;
  generated: boolean;
  author: InboxPerson | null;
  attachments: InboxAttachment[];
};

type InboxThread = {
  id: string;
  subject: string;
  contextName: string;
  workflowState: string;
  sourceUrl: string;
  participants: InboxPerson[];
  messages: InboxMessage[];
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

const dayKeyFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Los_Angeles",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const mobileDateFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  weekday: "long",
  month: "long",
  day: "numeric",
});

const inboxDateFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function dayKey(value: string | Date) {
  return dayKeyFormat.format(typeof value === "string" ? new Date(value) : value);
}

function offsetDayKey(key: string, days: number) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function ordinalDate(value: string) {
  const date = new Date(value);
  const day = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", day: "numeric" }).format(date));
  const suffix = day % 10 === 1 && day % 100 !== 11 ? "st" : day % 10 === 2 && day % 100 !== 12 ? "nd" : day % 10 === 3 && day % 100 !== 13 ? "rd" : "th";
  return mobileDateFormat.format(date).replace(String(day), `${day}${suffix}`);
}

function shortOrdinalDay(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const suffix = day % 10 === 1 && day % 100 !== 11 ? "st" : day % 10 === 2 && day % 100 !== 12 ? "nd" : day % 10 === 3 && day % 100 !== 13 ? "rd" : "th";
  const monthLabel = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short" }).format(date);
  return `${monthLabel} ${day}${suffix}`;
}

function formatDate(value: string | null) {
  if (!value) return "No due date";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : dateFormat.format(date);
}

function readableLabel(value: string) {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function assignmentStatus(value: string) {
  const labels: Record<string, string> = {
    late: "Late",
    locked: "Locked",
    missing: "Missing",
    open: "Open",
  };
  return labels[value] ?? readableLabel(value);
}

function formatInboxDate(value: string | null) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : inboxDateFormat.format(date);
}

function fileSizeLabel(value: number | null) {
  if (!value || value < 1) return "";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function AssignmentModal({ item, onClose }: { item: ActionItem; onClose: () => void }) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [onClose]);

  const detailRows = [
    { label: "Course", value: item.course },
    { label: "Due", value: formatDate(item.dueAt) },
    { label: "Status", value: assignmentStatus(item.state) },
    { label: "Points", value: item.points === null ? "Not listed" : `${item.points} possible` },
    { label: "Available from", value: item.availableFrom ? formatDate(item.availableFrom) : "Immediately" },
    { label: "Available until", value: item.availableUntil ? formatDate(item.availableUntil) : "No closing date listed" },
    { label: "Submit with", value: item.submissionTypes.length ? item.submissionTypes.map(readableLabel).join(", ") : "Not specified" },
    { label: "Grading", value: item.gradingType ? readableLabel(item.gradingType) : "Not specified" },
    { label: "Attempts", value: item.allowedAttempts === -1 ? "Unlimited" : item.allowedAttempts === null ? "Not specified" : String(item.allowedAttempts) },
    { label: "File types", value: item.allowedExtensions.length ? item.allowedExtensions.join(", ").toUpperCase() : "Any allowed format" },
    { label: "Published", value: item.published === null ? "Not reported" : item.published ? "Yes" : "No" },
  ];

  return (
    <div className="assignment-modal-backdrop">
      <button className="modal-backdrop-dismiss" type="button" onClick={onClose} aria-label="Close assignment details" />
      <section className="assignment-modal" role="dialog" aria-modal="true" aria-labelledby="assignment-modal-title" aria-describedby="assignment-modal-description">
        <button className="assignment-modal-x" type="button" onClick={onClose} aria-label="Close assignment details">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={appPath("/logout-button.webp")} alt="" aria-hidden="true" />
        </button>
        <div className="assignment-modal-scroll">
          <header className="assignment-modal-heading">
            <span aria-hidden="true">A</span>
            <div><p>Assignment details</p><h2 id="assignment-modal-title">{item.title}</h2><small>{item.course}</small></div>
          </header>

          <section className="assignment-detail-section">
            <h3>At a glance</h3>
            <dl className="assignment-detail-grid">
              {detailRows.map((row) => <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}
            </dl>
          </section>

          <section className="assignment-detail-section assignment-description" id="assignment-modal-description">
            <h3>Instructions &amp; details</h3>
            <p>{item.description || "Canvas has not included written instructions for this assignment. Use the Canvas button below to check for files, worksheets, videos, rubrics, or teacher updates."}</p>
          </section>
        </div>

        <footer className="assignment-modal-actions">
          <a href={item.sourceUrl} target="_blank" rel="noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={appPath("/see-in-canvas.webp")} alt="See in Canvas" />
          </a>
          <button type="button" onClick={onClose} ref={closeButtonRef}>Close</button>
        </footer>
      </section>
    </div>
  );
}

function InboxAvatar({ person, fallbackUrl, label }: { person: InboxPerson | null; fallbackUrl?: string | null; label: string }) {
  const imageUrl = person?.avatarUrl ?? fallbackUrl ?? null;
  return (
    <span className="inbox-avatar" aria-hidden="true">
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" referrerPolicy="no-referrer" />
      ) : <strong>{(person?.name || label).slice(0, 1).toUpperCase()}</strong>}
    </span>
  );
}

function InboxView({ conversations, loading, error, threadLoadingId, onRead, onBack }: {
  conversations: InboxConversation[];
  loading: boolean;
  error: string | null;
  threadLoadingId: string | null;
  onRead: (conversation: InboxConversation) => void;
  onBack: () => void;
}) {
  return (
    <section className="inbox-view" aria-labelledby="inbox-view-title">
      <header className="inbox-view-header">
        <button type="button" onClick={onBack} aria-label="Return to dashboard">←</button>
        <div><p>Canvas messages</p><h1 id="inbox-view-title">Inbox</h1><small>The 10 most recent conversations</small></div>
        <span aria-hidden="true">✉</span>
      </header>

      {loading ? <div className="inbox-loading" role="status"><i aria-hidden="true" /><p>Loading the latest Canvas messages…</p></div> : null}
      {error ? <div className="inbox-error" role="alert"><strong>Inbox could not be loaded.</strong><p>{error}</p></div> : null}
      {!loading && !error && !conversations.length ? <div className="inbox-empty"><span aria-hidden="true">✓</span><p>No Canvas conversations were found.</p></div> : null}

      <div className="inbox-conversation-list" role="list">
        {conversations.map((conversation) => (
          <article className={`inbox-conversation${conversation.workflowState === "unread" ? " is-unread" : ""}`} role="listitem" key={conversation.id}>
            <InboxAvatar person={conversation.from} fallbackUrl={conversation.avatarUrl} label="Canvas" />
            <div className="inbox-conversation-copy">
              <div className="inbox-conversation-meta"><strong>From {conversation.from?.name || "Canvas"}</strong><time dateTime={conversation.lastMessageAt ?? undefined}>{formatInboxDate(conversation.lastMessageAt)}</time></div>
              <h2>{conversation.subject}</h2>
              <p>{conversation.preview}</p>
              <small>{conversation.contextName} · {conversation.messageCount} message{conversation.messageCount === 1 ? "" : "s"}</small>
            </div>
            <button className="inbox-read-button" type="button" onClick={() => onRead(conversation)} disabled={threadLoadingId === conversation.id}>
              {threadLoadingId === conversation.id ? "Opening…" : "Read"}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

function InboxThreadModal({ thread, onClose }: { thread: InboxThread; onClose: () => void }) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [onClose]);

  return (
    <div className="inbox-thread-backdrop">
      <button className="modal-backdrop-dismiss" type="button" onClick={onClose} aria-label="Close Canvas conversation" />
      <section className="inbox-thread-modal" role="dialog" aria-modal="true" aria-labelledby="inbox-thread-title">
        <button className="inbox-thread-x" type="button" onClick={onClose} aria-label="Close Canvas conversation">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={appPath("/logout-button.webp")} alt="" aria-hidden="true" />
        </button>
        <header className="inbox-thread-header">
          <p>{thread.contextName}</p><h2 id="inbox-thread-title">{thread.subject}</h2>
          <small>{thread.messages.length} message{thread.messages.length === 1 ? "" : "s"} · {thread.participants.map((person) => person.name).join(", ")}</small>
        </header>
        <div className="inbox-thread-scroll">
          {thread.messages.map((message) => (
            <article className="inbox-thread-message" key={message.id}>
              <InboxAvatar person={message.author} label="Canvas" />
              <div>
                <header><strong>{message.author?.name || (message.generated ? "Canvas" : "Unknown sender")}</strong><time dateTime={message.createdAt ?? undefined}>{formatInboxDate(message.createdAt)}</time></header>
                <p>{message.body}</p>
                {message.attachments.length ? (
                  <div className="inbox-attachments" aria-label="Attachments">
                    {message.attachments.map((attachment) => attachment.url ? (
                      <a href={attachment.url} target="_blank" rel="noreferrer" key={attachment.id}>↧ {attachment.name}<small>{fileSizeLabel(attachment.size)}</small></a>
                    ) : <span key={attachment.id}>↧ {attachment.name}<small>{fileSizeLabel(attachment.size)}</small></span>)}
                  </div>
                ) : null}
              </div>
            </article>
          ))}
        </div>
        <footer className="inbox-thread-actions">
          <a href={thread.sourceUrl} target="_blank" rel="noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={appPath("/see-in-canvas.webp")} alt="See in Canvas" />
          </a>
          <button type="button" onClick={onClose} ref={closeButtonRef}>Close</button>
        </footer>
      </section>
    </div>
  );
}

function ActionList({ items, empty, onSelectAssignment }: { items: ActionItem[]; empty: string; onSelectAssignment: (item: ActionItem) => void }) {
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
      {items.map((item, index) => {
        const content = <>
          <span className={`action-icon action-tone-${(index % 4) + 1}`} aria-hidden="true">
            {item.kind === "message" ? "M" : "A"}
          </span>
          <span className="action-copy"><strong>{item.title}</strong><small>{item.course}</small></span>
          <span className="action-due">{item.kind === "message" ? "Unread" : formatDate(item.dueAt)}</span>
          <span className="action-arrow" aria-hidden="true">›</span>
        </>;
        return item.kind === "assignment" ? (
          <button className="action-item" type="button" key={item.id} onClick={() => onSelectAssignment(item)} aria-label={`View details for ${item.title}`}>{content}</button>
        ) : (
          <a className="action-item" href={item.sourceUrl} key={item.id} rel="noreferrer" target="_blank">{content}</a>
        );
      })}
    </div>
  );
}

function AnimatedDueBadge({ count, summary }: { count: number; summary: string }) {
  const badgeRef = useRef<HTMLSpanElement>(null);
  const hasAnimatedRef = useRef(false);

  useLayoutEffect(() => {
    const badge = badgeRef.current;
    const web = badge?.querySelector<HTMLImageElement>(".spider-count-web");
    const number = badge?.querySelector<HTMLElement>("strong");
    if (!badge || !web || !number) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      gsap.set([web, number], { autoAlpha: 1, scale: 1, y: 0 });
      return;
    }

    const reset = () => {
      gsap.killTweensOf([web, number]);
      web.classList.remove("is-animated");
      gsap.set(web, { autoAlpha: 0, scale: 0, y: 20, transformOrigin: "50% 50%" });
      gsap.set(number, { autoAlpha: 0, scale: 0, transformOrigin: "50% 50%" });
    };
    const play = (delay: number) => {
      reset();
      gsap.timeline({ delay })
        .to(web, { autoAlpha: 1, scale: 1, y: 0, duration: 1.05, ease: "elastic.out(1, 0.42)" })
        .to(number, { autoAlpha: 1, scale: 1, duration: 0.52, ease: "back.out(2.35)", onComplete: () => web.classList.add("is-animated") }, "<+=0.5");
    };

    reset();
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        play(hasAnimatedRef.current ? 0 : 3.3);
        hasAnimatedRef.current = true;
      } else {
        reset();
      }
    }, { threshold: 0.35 });
    observer.observe(badge);
    return () => {
      observer.disconnect();
      gsap.killTweensOf([web, number]);
      web.classList.remove("is-animated");
    };
  }, []);

  return (
    <span className="spider-count-badge" aria-label={summary} ref={badgeRef}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="spider-count-web" src={appPath("/due-count-web.webp")} alt="" aria-hidden="true" />
      <strong>{count}</strong>
    </span>
  );
}

function MobileDueCard({ title, items, empty, onSelectAssignment, featured = false, banner = "/due-today-banner.webp", tone = "week", summary = `${items.length} ${items.length === 1 ? "ITEM" : "ITEMS"} DUE` }: { title: string; items: ActionItem[]; empty: string; onSelectAssignment: (item: ActionItem) => void; featured?: boolean; banner?: string; tone?: "today" | "tomorrow" | "week"; summary?: string }) {
  return (
    <section className={`mobile-due-card due-tone-${tone}${featured ? " is-featured" : ""}${items.length ? " has-items" : ""}`}>
      {featured ? (
        <>
          <h2 className="visually-hidden">{title}</h2>
          <div className="mobile-due-visual">
            {/* Supplied due-date artwork forms the full-width top of this card. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="mobile-due-banner" src={appPath(banner)} alt="" aria-hidden="true" />
            <AnimatedDueBadge count={items.length} summary={summary} />
          </div>
          <p className="mobile-due-summary">{summary}</p>
        </>
      ) : <header><span aria-hidden="true">●</span><h2>{title}</h2><strong>{items.length}</strong></header>}
      {items.length ? (
        <div className="mobile-due-list">
          {items.map((item) => (
            <button type="button" key={item.id} onClick={() => onSelectAssignment(item)} aria-label={`View details for ${item.title}`}>
              <span><strong>{item.title}</strong><small>{item.course}</small></span><i aria-hidden="true">›</i>
            </button>
          ))}
        </div>
      ) : featured ? null : <p className="mobile-due-empty">{empty}</p>}
    </section>
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

const mobileMenuItems: Array<{ label: string; image: string; action?: "inbox" }> = [
  { label: "To-Do List", image: "/menu-todo.webp" },
  { label: "Classes", image: "/menu-classes.webp" },
  { label: "Inbox", image: "/menu-inbox.webp", action: "inbox" },
  { label: "Calendar", image: "/menu-calendar.webp" },
  { label: "Notes", image: "/menu-notes.webp" },
  { label: "Chat", image: "/menu-chat.webp" },
  { label: "Inspiration", image: "/menu-inspiration.webp" },
  { label: "Resources", image: "/menu-resources.webp" },
  { label: "Admin", image: "/menu-admin.webp" },
];

const gradeArtwork = [
  { label: "Biology — Garcia", image: "/grade-biology-garcia.webp" },
  { label: "Biology — Baier", image: "/grade-biology-baier.webp" },
  { label: "Algebra", image: "/grade-algebra.webp" },
  { label: "English", image: "/grade-english.webp" },
  { label: "HSVA", image: "/grade-hsva.webp" },
  { label: "History", image: "/grade-history.webp" },
];

const familyProfilePhoto: Record<string, string> = {
  beau: "/beau-profile.webp",
  cathy: "/cathy-profile.webp",
  mom: "/mom-profile.webp",
  dad: "/dad-profile.webp",
};

const familyGreetings = [
  (name: string) => `Oh hey, ${name}!`,
  (name: string) => `Hi, ${name}!`,
  (name: string) => `Welcome, ${name}!`,
  (name: string) => `Look, it’s ${name}!`,
  (name: string) => `Howdy, ${name}!`,
];

type DashboardHomeProps = {
  immersive?: boolean;
  onExit?: () => void;
};

const AUTO_REFRESH_MS = 7 * 60 * 1000;

export function DashboardHome({ immersive = false, onExit }: DashboardHomeProps = {}) {
  const appRef = useRef<HTMLElement>(null);
  const mobileMenuLayerRef = useRef<HTMLDivElement>(null);
  const mobileMenuPanelRef = useRef<HTMLDivElement>(null);
  const homeContentRef = useRef<HTMLDivElement>(null);
  const inboxViewRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [focusMode, setFocusMode] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeView, setActiveView] = useState<"dashboard" | "inbox">("dashboard");
  const [inboxConversations, setInboxConversations] = useState<InboxConversation[]>([]);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [inboxError, setInboxError] = useState<string | null>(null);
  const [threadLoadingId, setThreadLoadingId] = useState<string | null>(null);
  const [selectedThread, setSelectedThread] = useState<InboxThread | null>(null);
  const [greetingIndex] = useState(() => Math.floor(Math.random() * familyGreetings.length));
  const [selectedAction, setSelectedAction] = useState<ActionItem | null>(null);
  const closeAssignment = useCallback(() => setSelectedAction(null), []);
  const closeThread = useCallback(() => setSelectedThread(null), []);

  const loadInbox = useCallback(async () => {
    setInboxLoading(true);
    setInboxError(null);
    try {
      const response = await fetch(appPath("/api/inbox"), { cache: "no-store", credentials: "same-origin" });
      const body = await response.json();
      if (response.status === 401) {
        if (onExit) onExit();
        else window.location.replace(appPath("/"));
        return;
      }
      if (!response.ok) throw new Error(body.error || "Canvas Inbox could not be loaded.");
      setInboxConversations(body.conversations ?? []);
    } catch (caught) {
      setInboxError(caught instanceof Error ? caught.message : "Canvas Inbox could not be loaded.");
    } finally {
      setInboxLoading(false);
    }
  }, [onExit]);

  const openThread = useCallback(async (conversation: InboxConversation) => {
    setThreadLoadingId(conversation.id);
    setInboxError(null);
    try {
      const response = await fetch(appPath(`/api/inbox?conversation_id=${encodeURIComponent(conversation.id)}`), { cache: "no-store", credentials: "same-origin" });
      const body = await response.json();
      if (response.status === 401) {
        if (onExit) onExit();
        else window.location.replace(appPath("/"));
        return;
      }
      if (!response.ok) throw new Error(body.error || "That Canvas conversation could not be opened.");
      setSelectedThread(body.thread);
    } catch (caught) {
      setInboxError(caught instanceof Error ? caught.message : "That Canvas conversation could not be opened.");
    } finally {
      setThreadLoadingId(null);
    }
  }, [onExit]);

  const sync = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(appPath("/api/dashboard"), { cache: "no-store", credentials: "same-origin" });
      const body = await response.json();
      if (response.status === 401) {
        if (onExit) onExit();
        else window.location.replace(appPath("/"));
        return;
      }
      if (!response.ok) throw new Error(body.error || "Canvas could not be synced.");
      setData(body);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Canvas could not be synced.");
    } finally {
      setLoading(false);
    }
  }, [onExit]);

  useEffect(() => {
    const initialSync = window.setTimeout(() => void sync(), 0);
    const autoRefresh = window.setInterval(() => void sync(), AUTO_REFRESH_MS);
    return () => {
      window.clearTimeout(initialSync);
      window.clearInterval(autoRefresh);
    };
  }, [sync]);

  useLayoutEffect(() => {
    const layer = mobileMenuLayerRef.current;
    const panel = mobileMenuPanelRef.current;
    if (!layer || !panel) return;
    const backdrop = layer.querySelector<HTMLElement>(".mobile-menu-backdrop");
    const options = panel.querySelectorAll<HTMLElement>(".mobile-menu-option");
    gsap.killTweensOf([layer, backdrop, panel, options]);

    if (mobileMenuOpen) {
      gsap.set(layer, { autoAlpha: 1, pointerEvents: "auto" });
      gsap.set(backdrop, { autoAlpha: 0, y: 28 });
      gsap.set(panel, { autoAlpha: 0, y: 24, scale: 0.97 });
      gsap.set(options, { autoAlpha: 0, y: 24, scale: 0.9 });
      gsap.timeline()
        .to(backdrop, { autoAlpha: 1, y: 0, duration: 0.32, ease: "power2.out" })
        .to(panel, { autoAlpha: 1, y: 0, scale: 1, duration: 0.34, ease: "power2.out" }, "<")
        .to(options, { autoAlpha: 1, y: 0, scale: 1, duration: 0.36, stagger: 0.075, ease: "back.out(1.7)" }, "-=0.18");
      return;
    }

    gsap.timeline({ onComplete: () => gsap.set(layer, { autoAlpha: 0, pointerEvents: "none" }) })
      .to(options, { autoAlpha: 0, y: 24, scale: 0.9, duration: 0.12, stagger: { each: 0.02, from: "end" }, ease: "power2.in" })
      .to(panel, { autoAlpha: 0, y: 24, scale: 0.97, duration: 0.1, ease: "power2.in" }, "-=0.06")
      .to(backdrop, { autoAlpha: 0, y: 28, duration: 0.1, ease: "power2.in" }, "<");
  }, [mobileMenuOpen]);

  const showInbox = useCallback(() => {
    setMobileMenuOpen(false);
    if (activeView === "inbox") return;
    void loadInbox();
    const home = homeContentRef.current;
    const finish = () => setActiveView("inbox");
    if (!home) {
      finish();
      return;
    }
    gsap.to(Array.from(home.children), {
      autoAlpha: 0,
      y: 30,
      duration: 0.24,
      stagger: 0.045,
      ease: "power2.in",
      onComplete: finish,
    });
  }, [activeView, loadInbox]);

  const returnToDashboard = useCallback(() => {
    setSelectedThread(null);
    setActiveView("dashboard");
  }, []);

  const chooseMobileMenuItem = useCallback((action?: string) => {
    if (action === "inbox") showInbox();
    else setMobileMenuOpen(false);
  }, [showInbox]);

  useLayoutEffect(() => {
    const root = activeView === "inbox" ? inboxViewRef.current : homeContentRef.current;
    if (!root) return;
    gsap.fromTo(Array.from(root.children), { autoAlpha: 0, y: 28 }, {
      autoAlpha: 1,
      y: 0,
      duration: 0.42,
      stagger: 0.06,
      ease: "power2.out",
      clearProps: "transform,opacity,visibility",
    });
  }, [activeView]);

  useLayoutEffect(() => {
    if (activeView !== "inbox" || inboxLoading || !inboxViewRef.current) return;
    const rows = inboxViewRef.current.querySelectorAll(".inbox-conversation");
    gsap.fromTo(rows, { autoAlpha: 0, y: 24, scale: 0.985 }, {
      autoAlpha: 1,
      y: 0,
      scale: 1,
      duration: 0.38,
      stagger: 0.055,
      ease: "power2.out",
      clearProps: "transform,opacity,visibility",
    });
  }, [activeView, inboxConversations, inboxLoading]);

  useLayoutEffect(() => {
    const app = appRef.current;
    if (!immersive || !data || !app) return;

    const context = gsap.context(() => {
      const panels = app.querySelectorAll(
        ".school-sidebar, .mobile-dashboard-bar, .mobile-family-greeting, .workspace-header, .overview-hero, .summary-card, .critical-strip, .mobile-due-card, .primary-dashboard-grid > .dash-panel, .secondary-dashboard-grid > .dash-panel, .grades-showcase"
      );
      gsap.set(panels, { autoAlpha: 0, y: 34, scale: 0.975 });
      gsap.timeline({ delay: 0.08 })
        .to(panels, {
          autoAlpha: 1,
          y: 0,
          scale: 1,
          duration: 0.58,
          stagger: 0.075,
          ease: "back.out(1.35)",
          clearProps: "transform,opacity,visibility",
        });
    }, app);

    return () => context.revert();
  }, [data, immersive]);

  async function signOut() {
    await fetch(appPath("/api/auth/logout"), { method: "POST", credentials: "same-origin" });
    if (onExit) onExit();
    else window.location.assign(appPath("/"));
  }

  if (!data && loading) {
    return (
      <main className={immersive ? "immersive-dashboard-state" : "dashboard-shell dashboard-centered"}>
        <p className="visually-hidden" role="status">Loading the latest Canvas information.</p>
      </main>
    );
  }

  if (!data) {
    return (
      <main className={immersive ? "immersive-dashboard-state" : "dashboard-shell dashboard-centered"}>
        <div className="dashboard-error" role="alert">
          <p className="section-kicker">Connection needed</p><h1>Canvas could not be loaded.</h1><p>{error}</p>
          <div className="error-actions"><button type="button" onClick={() => void sync()}>Try again</button><a href={appPath("/settings")}>Check connection</a></div>
        </div>
      </main>
    );
  }

  const allClear = data.critical.length === 0;
  const firstName = data.student.split(" ")[0] || "Beau";
  const viewerInitials = data.viewer.displayName.slice(0, 2).toUpperCase();
  const viewerPhoto = familyProfilePhoto[data.viewer.username];
  const familyGreeting = familyGreetings[greetingIndex](data.viewer.displayName);
  const assignmentPool = Array.from(new Map(
    [...data.critical, ...data.upcoming]
      .filter((item) => item.kind === "assignment" && item.dueAt)
      .map((item) => [item.id, item])
  ).values());
  const today = dayKey(data.generatedAt);
  const tomorrow = offsetDayKey(today, 1);
  const weekStart = offsetDayKey(today, 2);
  const weekEnd = offsetDayKey(today, 7);
  const dueToday = assignmentPool.filter((item) => item.dueAt && dayKey(item.dueAt) === today);
  const dueTomorrow = assignmentPool.filter((item) => item.dueAt && dayKey(item.dueAt) === tomorrow);
  const dueThisWeek = assignmentPool.filter((item) => {
    if (!item.dueAt) return false;
    const dueDay = dayKey(item.dueAt);
    return dueDay >= weekStart && dueDay <= weekEnd;
  });
  const todaySummary = `${dueToday.length} ${dueToday.length === 1 ? "ITEM" : "ITEMS"} DUE TODAY`;
  const tomorrowSummary = `${dueTomorrow.length} ${dueTomorrow.length === 1 ? "ITEM" : "ITEMS"} DUE ${shortOrdinalDay(tomorrow)}`;
  const weekSummary = `${dueThisWeek.length} ${dueThisWeek.length === 1 ? "ITEM" : "ITEMS"} DUE THIS WEEK`;

  return (
    <main className={`school-app${immersive ? " immersive-dashboard" : ""}${focusMode ? " is-focus-mode" : ""}`} ref={appRef}>
      <aside className="school-sidebar">
        <a className="sidebar-brand" href={appPath("/dashboard")} aria-label="Beau School dashboard">
          <span className="sidebar-logo">B</span><span><strong>Beau School</strong><small>Private family workspace</small></span>
        </a>
        <nav className="school-nav" aria-label="School navigation">
          {canvasLinks.map((item) => (
            <a className={item.label === "Dashboard" ? "active" : ""} href={item.label === "Dashboard" && immersive ? appPath("/") : item.href} key={item.label} onClick={item.label === "Dashboard" && immersive ? (event) => event.preventDefault() : undefined} {...(!item.local ? { target: "_blank", rel: "noreferrer" } : {})}>
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
        <div className="mobile-dashboard-bar">
          <button className="mobile-menu-button" type="button" onClick={() => setMobileMenuOpen((open) => !open)} aria-expanded={mobileMenuOpen} aria-controls="mobile-school-menu" aria-label="Open school menu">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={appPath("/menu-button.webp")} alt="" aria-hidden="true" />
          </button>
          <strong className="mobile-chalk-date">{ordinalDate(data.generatedAt)}</strong>
          <button className="mobile-close-button" type="button" onClick={() => void signOut()} aria-label={`Sign out ${data.viewer.displayName}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={appPath("/logout-button.webp")} alt="" aria-hidden="true" />
          </button>
        </div>
        <div className="mobile-menu-layer" ref={mobileMenuLayerRef} aria-hidden={!mobileMenuOpen}>
          <button className="mobile-menu-backdrop" type="button" onClick={() => setMobileMenuOpen(false)} aria-label="Close school menu" tabIndex={mobileMenuOpen ? 0 : -1} />
          <div className="mobile-school-menu" id="mobile-school-menu" ref={mobileMenuPanelRef} role="menu" aria-label="School menu options">
            {mobileMenuItems.map((item) => (
              <button className="mobile-menu-option" type="button" role="menuitem" key={item.label} onClick={() => chooseMobileMenuItem(item.action)} tabIndex={mobileMenuOpen ? 0 : -1}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={appPath(item.image)} alt={item.label} />
              </button>
            ))}
          </div>
        </div>

        {activeView === "dashboard" ? (
        <div className="dashboard-home-content" ref={homeContentRef}>
        <div className={`mobile-family-greeting greeting-${data.viewer.username}`}>
          <span className="mobile-family-photo" aria-hidden="true">
            {viewerPhoto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={appPath(viewerPhoto)} alt="" />
            ) : <strong>{viewerInitials}</strong>}
          </span>
          <p>{familyGreeting}</p>
        </div>

        <header className="workspace-header">
          <div><h1>Dashboard</h1><p>{dayFormat.format(new Date(data.generatedAt))}</p></div>
          <div className="dashboard-controls">
            <span className="sync-time"><i aria-hidden="true" /> Updated {timeFormat.format(new Date(data.generatedAt))}</span>
            <button type="button" className="logout-button" onClick={() => void signOut()}><span aria-hidden="true">↪</span>Log out</button>
          </div>
        </header>

        <div className="featured-due-stack">
          <div className="today-featured-slot due-featured-slot" aria-label="Assignments due today">
            <MobileDueCard title="Due today" items={dueToday} empty="Nothing is due today." onSelectAssignment={setSelectedAction} featured tone="today" summary={todaySummary} />
          </div>
          <div className="tomorrow-featured-slot due-featured-slot" aria-label="Assignments due tomorrow">
            <MobileDueCard title="Due tomorrow" items={dueTomorrow} empty="Nothing is due tomorrow." onSelectAssignment={setSelectedAction} featured banner="/due-tomorrow-banner.webp" tone="tomorrow" summary={tomorrowSummary} />
          </div>
          <div className="week-featured-slot due-featured-slot" aria-label="Assignments due this week">
            <MobileDueCard title="Due this week" items={dueThisWeek} empty="Nothing else is due this week." onSelectAssignment={setSelectedAction} featured banner="/this-week-banner.webp" tone="week" summary={weekSummary} />
          </div>
        </div>

        <section className="overview-hero" aria-labelledby="dashboard-title">
          <div className="hero-message">
            <span className={`hero-check ${allClear ? "is-clear" : "needs-attention"}`} aria-hidden="true">{allClear ? "✓" : "!"}</span>
            <div><p className="hero-kicker">{dayFormat.format(new Date(data.generatedAt))}</p><h2 id="dashboard-title">{allClear ? "All clear for today" : "Here’s what needs attention"}</h2><p>{allClear ? "No work is due today and there are no unread Canvas messages." : `${data.critical.length} item${data.critical.length === 1 ? "" : "s"} need attention today.`}</p></div>
          </div>
          <div className="hero-landscape" aria-hidden="true"><i className="mountain mountain-back" /><i className="mountain mountain-mid" /><i className="mountain mountain-front" /><span className="hero-sun" /><span className="hero-student">B</span></div>
        </section>

        <section className="summary-grid" aria-label="Dashboard summary">
          <article className={`summary-card critical-stat${data.critical.length ? "" : " is-zero"}`}><span aria-hidden="true">!</span><div><strong>{data.critical.length}</strong><small>Critical</small></div></article>
          <article className={`summary-card unread-stat${data.unreadCount ? "" : " is-zero"}`}><span aria-hidden="true">✉</span><div><strong>{data.unreadCount}</strong><small>Unread</small></div></article>
          <article className="summary-card course-stat"><span aria-hidden="true">▤</span><div><strong>{data.courseCount}</strong><small>Courses</small></div></article>
        </section>

        {error ? <p className="inline-error" role="alert">Latest sync failed: {error}</p> : null}

        <section className={`critical-strip ${allClear ? "is-clear" : "needs-attention"}`}>
          <span className="critical-shield" aria-hidden="true">{allClear ? "✓" : "!"}</span>
          <div><p>Critical information</p><strong>{allClear ? "Nothing is due today and there are no unread teacher messages." : `${data.critical.length} items need attention.`}</strong></div>
          <span className="critical-chevron" aria-hidden="true">›</span>
          {!allClear ? <ActionList items={data.critical} empty="Nothing needs attention." onSelectAssignment={setSelectedAction} /> : null}
        </section>

        <div className="primary-dashboard-grid schedule-only-grid">
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

        <div className="secondary-dashboard-grid quick-only-grid">
          <section className="dash-panel quick-panel">
            <div className="panel-title-row"><div><span aria-hidden="true">✦</span><h2>Quick actions</h2></div></div>
            <div className="quick-actions"><a href="https://sequoiagrove.instructure.com/conversations#filter=type=inbox" target="_blank" rel="noreferrer"><span>✉</span>Message teachers</a><a href="https://sequoiagrove.instructure.com/files" target="_blank" rel="noreferrer"><span>⇧</span>Open files</a><a href="https://sequoiagrove.instructure.com/grades" target="_blank" rel="noreferrer"><span>▥</span>View grades</a><a href="https://sequoiagrove.instructure.com/calendar" target="_blank" rel="noreferrer"><span>□</span>Open calendar</a></div>
            <div className="encouragement"><span>{firstName.slice(0, 1)}</span><div><strong>Keep it going, {firstName}!</strong><small>One clear view for the whole school week.</small></div></div>
          </section>
        </div>

        <section className="grades-showcase" aria-label="Grades by class">
          {/* Supplied artwork keeps the future letter-grade and percentage spaces open. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="grades-banner" src={appPath("/grades-banner.webp")} alt="Grades" />
          <div className="grade-artwork-grid">
            {gradeArtwork.map((item) => (
              <article className="grade-artwork-card" key={item.label} aria-label={item.label}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={appPath(item.image)} alt={item.label} />
              </article>
            ))}
          </div>
        </section>
        </div>
        ) : (
          <div className="inbox-view-shell" ref={inboxViewRef}>
            <InboxView
              conversations={inboxConversations}
              loading={inboxLoading}
              error={inboxError}
              threadLoadingId={threadLoadingId}
              onRead={(conversation) => void openThread(conversation)}
              onBack={returnToDashboard}
            />
          </div>
        )}
      </section>
      {selectedAction ? <AssignmentModal item={selectedAction} onClose={closeAssignment} /> : null}
      {selectedThread ? <InboxThreadModal thread={selectedThread} onClose={closeThread} /> : null}
    </main>
  );
}
