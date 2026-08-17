"use client";

import { type FormEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
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
  sourceUrl: string;
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

type PostBoard = "inspiration" | "resources";

type FamilyPost = {
  id: string;
  board: PostBoard;
  title: string;
  body: string;
  url: string | null;
  author: { username: string; name: string };
  createdAt: string;
  updatedAt: string;
};

type ChatMessage = {
  id: string;
  body: string;
  author: { username: string; name: string };
  createdAt: string;
  updatedAt: string;
};

type DashboardPreferences = {
  showDueTodayWhenEmpty: boolean;
  showDueTomorrowWhenEmpty: boolean;
  showDueWeekWhenEmpty: boolean;
};

type GradeOverride = { courseKey: string; courseName: string; percentage: number };

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

function comparableCourseName(value: string) {
  return value.toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, " ").trim();
}

function ClassesView({ courses, week, onBack }: { courses: Course[]; week: WeekItem[]; onBack: () => void }) {
  const scheduled = Array.from(new Set(week.map((item) => item.course))).map((name) => {
    const comparableName = comparableCourseName(name);
    const course = courses.find((candidate) => {
      const comparableCandidate = comparableCourseName(candidate.name);
      return comparableCandidate === comparableName || comparableCandidate.includes(comparableName) || comparableName.includes(comparableCandidate);
    });
    return { key: course?.id ?? name, name: course?.name ?? name, sourceUrl: course?.sourceUrl, meetings: week.filter((item) => item.course === name) };
  });
  const unscheduled = courses
    .filter((course) => !scheduled.some((entry) => entry.key === course.id))
    .map((course) => ({ key: course.id, name: course.name, sourceUrl: course.sourceUrl, meetings: [] as WeekItem[] }));
  const classes = [...scheduled, ...unscheduled];

  return (
    <section className="portal-feature-view classes-view" aria-labelledby="classes-view-title">
      <header className="portal-feature-header">
        <button type="button" onClick={onBack} aria-label="Return to dashboard">←</button>
        <div><p>Canvas courses &amp; weekly times</p><h1 id="classes-view-title">Classes</h1><small>{classes.length} classes and course spaces</small></div>
        <span aria-hidden="true">▤</span>
      </header>
      <div className="classes-grid" role="list">
        {classes.map((course) => (
          <article className="class-box" role="listitem" key={course.key}>
            <p>Class</p><h2>{course.name}</h2>
            <div className="class-meetings">
              {course.meetings.length ? course.meetings.map((meeting) => (
                <div key={`${meeting.day}-${meeting.time}`}><strong>{meeting.day}</strong><time>{meeting.time}</time><small>{meeting.note}</small></div>
              )) : <div className="class-time-missing"><strong>Canvas course</strong><small>Meeting time is not listed.</small></div>}
            </div>
            {course.sourceUrl ? <a href={course.sourceUrl} target="_blank" rel="noreferrer">Open class in Canvas <span aria-hidden="true">→</span></a> : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function youtubeEmbedUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, "").toLocaleLowerCase("en-US");
    let id = "";
    if (host === "youtu.be") id = url.pathname.split("/").filter(Boolean)[0] ?? "";
    if (host === "youtube.com" || host === "m.youtube.com") {
      id = url.searchParams.get("v") ?? "";
      if (!id) {
        const parts = url.pathname.split("/").filter(Boolean);
        if (parts[0] === "shorts" || parts[0] === "embed") id = parts[1] ?? "";
      }
    }
    return /^[a-zA-Z0-9_-]{6,20}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  } catch {
    return null;
  }
}

function PostBoardView({ board, posts, loading, error, onBack, onNewPost }: {
  board: PostBoard;
  posts: FamilyPost[];
  loading: boolean;
  error: string | null;
  onBack: () => void;
  onNewPost: () => void;
}) {
  const title = board === "inspiration" ? "Inspiration" : "Resources";
  const description = board === "inspiration" ? "Ideas, videos, and sparks worth remembering" : "Useful lessons, links, and learning tools";
  return (
    <section className="portal-feature-view post-board-view" aria-labelledby={`${board}-view-title`}>
      <header className="portal-feature-header">
        <button type="button" onClick={onBack} aria-label="Return to dashboard">←</button>
        <div><p>Family learning board</p><h1 id={`${board}-view-title`}>{title}</h1><small>{description}</small></div>
        <span aria-hidden="true">{board === "inspiration" ? "✦" : "▱"}</span>
      </header>
      {loading ? <div className="post-board-state" role="status"><i aria-hidden="true" /><p>Loading {title.toLocaleLowerCase("en-US")}…</p></div> : null}
      {error ? <div className="post-board-state is-error" role="alert"><strong>{title} could not be loaded.</strong><p>{error}</p></div> : null}
      {!loading && !error && !posts.length ? <div className="post-board-state"><span aria-hidden="true">✦</span><strong>Start the {title} board.</strong><p>Add the first idea, video, or useful link.</p></div> : null}
      <div className="post-board-list" role="feed" aria-busy={loading}>
        {posts.map((post) => {
          const embedUrl = youtubeEmbedUrl(post.url);
          const profilePhoto = familyProfilePhoto[post.author.username];
          return (
            <article className="family-post" key={post.id}>
              <header>
                <span className="family-post-avatar" aria-hidden="true">
                  {profilePhoto ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={appPath(profilePhoto)} alt="" />
                  ) : post.author.name.slice(0, 1).toUpperCase()}
                </span>
                <div><p>{post.author.name}</p><time dateTime={post.createdAt}>{formatInboxDate(post.createdAt)}</time></div>
              </header>
              <h2>{post.title}</h2>
              {post.body ? <p className="family-post-body">{post.body}</p> : null}
              {embedUrl ? <div className="family-post-video"><iframe src={embedUrl} title={`${post.title} video`} loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen /></div> : null}
              {post.url ? <a className="family-post-link" href={post.url} target="_blank" rel="noreferrer">Open link <span aria-hidden="true">→</span></a> : null}
            </article>
          );
        })}
      </div>
      <div className="post-board-create-bar"><button type="button" onClick={onNewPost}>Make a new post</button></div>
    </section>
  );
}

function PostComposerModal({ board, onClose, onSubmit }: {
  board: PostBoard;
  onClose: () => void;
  onSubmit: (payload: { title: string; body: string; url: string }) => Promise<void>;
}) {
  const titleRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const boardTitle = board === "inspiration" ? "Inspiration" : "Resources";

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    titleRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape" && !saving) onClose(); };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [onClose, saving]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      await onSubmit({ title, body, url });
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "The post could not be saved.");
      setSaving(false);
    }
  }

  return (
    <div className="post-composer-backdrop">
      <button className="modal-backdrop-dismiss" type="button" onClick={onClose} aria-label="Close new post" disabled={saving} />
      <section className="post-composer-modal" role="dialog" aria-modal="true" aria-labelledby="post-composer-title">
        <button className="post-composer-x" type="button" onClick={onClose} aria-label="Close new post" disabled={saving}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={appPath("/logout-button.webp")} alt="" aria-hidden="true" />
        </button>
        <header><p>Family learning board</p><h2 id="post-composer-title">New {boardTitle} post</h2><small>Share text, a YouTube video, a useful link—or all three.</small></header>
        <form onSubmit={(event) => void submit(event)}>
          <label><span>Title</span><input ref={titleRef} value={title} onChange={(event) => setTitle(event.target.value)} maxLength={140} required placeholder="What did you find?" /></label>
          <label><span>Text</span><textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={8000} rows={7} placeholder="Add notes, a summary, or why this is useful…" /></label>
          <label><span>YouTube video or any link</span><input type="url" value={url} onChange={(event) => setUrl(event.target.value)} maxLength={2000} placeholder="https://…" /></label>
          {message ? <p className="post-composer-error" role="alert">{message}</p> : null}
          <button className="post-composer-save" type="submit" disabled={saving}>{saving ? "Saving…" : "Add post"}</button>
          <button className="post-composer-cancel" type="button" onClick={onClose} disabled={saving}>Cancel</button>
        </form>
      </section>
    </div>
  );
}

function ChatMessageBody({ body }: { body: string }) {
  const parts = body.split(/(https?:\/\/[^\s]+)/gi);
  return (
    <p className="chat-message-body">
      {parts.map((part, index) => /^https?:\/\//i.test(part)
        ? <a href={part} target="_blank" rel="noreferrer" key={`${part}-${index}`}>{part}</a>
        : part)}
    </p>
  );
}

function ChatView({ messages, viewer, loading, olderLoading, hasMore, error, onBack, onLoadOlder, onSend, onEdit, onDelete }: {
  messages: ChatMessage[];
  viewer: DashboardData["viewer"];
  loading: boolean;
  olderLoading: boolean;
  hasMore: boolean;
  error: string | null;
  onBack: () => void;
  onLoadOlder: () => Promise<void>;
  onSend: (body: string) => Promise<void>;
  onEdit: (id: string, body: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const preserveHeightRef = useRef<number | null>(null);
  const previousLatestIdRef = useRef<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState("");
  const [openActionsId, setOpenActionsId] = useState<string | null>(null);
  const [changingId, setChangingId] = useState<string | null>(null);

  useLayoutEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll || loading) return;
    if (preserveHeightRef.current !== null) {
      scroll.scrollTop += scroll.scrollHeight - preserveHeightRef.current;
      preserveHeightRef.current = null;
      return;
    }
    const latestId = messages.at(-1)?.id ?? null;
    if (previousLatestIdRef.current === null || (latestId !== previousLatestIdRef.current && scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 180)) {
      scroll.scrollTop = scroll.scrollHeight;
    }
    previousLatestIdRef.current = latestId;
  }, [loading, messages]);

  async function loadOlder() {
    const scroll = scrollRef.current;
    if (!scroll || olderLoading || !hasMore) return;
    preserveHeightRef.current = scroll.scrollHeight;
    await onLoadOlder();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.trim() || sending) return;
    setSending(true);
    try {
      await onSend(draft);
      setDraft("");
      window.requestAnimationFrame(() => {
        const scroll = scrollRef.current;
        if (scroll) scroll.scrollTop = scroll.scrollHeight;
      });
    } finally {
      setSending(false);
    }
  }

  async function saveEdit(id: string) {
    if (!editingBody.trim() || changingId) return;
    setChangingId(id);
    try {
      await onEdit(id, editingBody);
      setEditingId(null);
      setEditingBody("");
    } finally {
      setChangingId(null);
    }
  }

  async function remove(id: string) {
    if (changingId || !window.confirm("Delete this family chat message?")) return;
    setChangingId(id);
    try { await onDelete(id); } finally { setChangingId(null); }
  }

  return (
    <section className="portal-feature-view chat-view" aria-labelledby="chat-view-title">
      <header className="portal-feature-header">
        <button type="button" onClick={onBack} aria-label="Return to dashboard">←</button>
        <div><p>Private family conversation</p><h1 id="chat-view-title">Chat</h1><small>The newest 15 messages appear first</small></div>
        <span aria-hidden="true">•••</span>
      </header>

      {error ? <div className="chat-error" role="alert">{error}</div> : null}
      <div className="chat-message-scroll" ref={scrollRef} onScroll={(event) => { if (event.currentTarget.scrollTop < 24) void loadOlder(); }}>
        {hasMore || olderLoading ? <button className="chat-load-older" type="button" onClick={() => void loadOlder()} disabled={olderLoading}>{olderLoading ? "Loading older messages…" : "Load 15 older messages"}</button> : messages.length ? <p className="chat-beginning">Beginning of the family chat</p> : null}
        {loading ? <div className="chat-loading" role="status"><i aria-hidden="true" /><p>Loading family chat…</p></div> : null}
        {!loading && !messages.length ? <div className="chat-empty"><span aria-hidden="true">✦</span><strong>Start the family chat.</strong><p>Send the first message below.</p></div> : null}
        <div className="chat-message-list" role="log" aria-live="polite">
          {messages.map((message) => {
            const mine = message.author.username === viewer.username;
            const girl = message.author.username === "mom" || message.author.username === "cathy";
            const profilePhoto = familyProfilePhoto[message.author.username];
            const edited = message.updatedAt !== message.createdAt;
            const profileContents = profilePhoto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={appPath(profilePhoto)} alt="" />
            ) : message.author.name.slice(0, 1).toUpperCase();
            return (
              <article className={`chat-message${mine ? " is-mine" : ""} ${girl ? "tone-girl" : "tone-boy"} chat-tilt-${Number(message.id) % 5}`} key={message.id}>
                {mine ? <button className="chat-profile-square chat-message-menu-trigger" type="button" aria-label={`Show actions for ${message.author.name}'s message`} aria-expanded={openActionsId === message.id} onClick={() => setOpenActionsId((current) => current === message.id ? null : message.id)}>{profileContents}</button> : <span className="chat-profile-square" aria-hidden="true">{profileContents}</span>}
                {mine && openActionsId === message.id && editingId !== message.id ? <div className="chat-profile-actions" role="menu" aria-label="Message actions"><button type="button" role="menuitem" onClick={() => { setEditingId(message.id); setEditingBody(message.body); setOpenActionsId(null); }}>Edit</button><button type="button" role="menuitem" onClick={() => { setOpenActionsId(null); void remove(message.id); }} disabled={changingId === message.id}>Delete</button></div> : null}
                <div className="chat-bubble">
                  <header>{mine ? <><time dateTime={message.createdAt}>{formatInboxDate(message.createdAt)}</time><strong>{message.author.name}</strong></> : <><strong>{message.author.name}</strong><time dateTime={message.createdAt}>{formatInboxDate(message.createdAt)}</time></>}</header>
                  {editingId === message.id ? (
                    <div className="chat-edit-form">
                      <textarea value={editingBody} onChange={(event) => setEditingBody(event.target.value)} maxLength={2000} rows={3} aria-label="Edit family chat message" />
                      <div><button type="button" onClick={() => void saveEdit(message.id)} disabled={changingId === message.id}>Save</button><button type="button" onClick={() => { setEditingId(null); setEditingBody(""); }} disabled={changingId === message.id}>Cancel</button></div>
                    </div>
                  ) : <ChatMessageBody body={message.body} />}
                  <footer>
                    {edited ? <small>Edited</small> : <span />}
                  </footer>
                </div>
              </article>
            );
          })}
        </div>
      </div>

      <form className="chat-composer" onSubmit={(event) => void submit(event)}>
        <span className={`chat-composer-profile ${viewer.username === "mom" || viewer.username === "cathy" ? "tone-girl" : "tone-boy"}`} aria-hidden="true">
          {familyProfilePhoto[viewer.username] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={appPath(familyProfilePhoto[viewer.username])} alt="" />
          ) : viewer.displayName.slice(0, 1).toUpperCase()}
        </span>
        <textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }} maxLength={2000} rows={2} placeholder={`Message the family as ${viewer.displayName}…`} aria-label="Family chat message" />
        <button type="submit" disabled={sending || !draft.trim()} aria-label="Send family chat message">{sending ? "…" : "➤"}</button>
      </form>
    </section>
  );
}

function letterGrade(percentage: number) {
  if (percentage >= 90) return "A";
  if (percentage >= 80) return "B";
  if (percentage >= 70) return "C";
  if (percentage >= 60) return "D";
  return "F";
}

function AdminView({ courses, settings, grades, loading, error, onBack, onSave }: {
  courses: Course[];
  settings: DashboardPreferences;
  grades: GradeOverride[];
  loading: boolean;
  error: string | null;
  onBack: () => void;
  onSave: (settings: DashboardPreferences, grades: GradeOverride[]) => Promise<void>;
}) {
  const editableCourses = courses.slice(0, 6);
  const [draftSettings, setDraftSettings] = useState(() => settings);
  const [draftGrades, setDraftGrades] = useState<Record<string, string>>(() => Object.fromEntries(grades.map((grade) => [grade.courseKey, String(grade.percentage)])));
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setSaveMessage("");
    try {
      await onSave(draftSettings, editableCourses.map((course) => ({
        courseKey: String(course.id), courseName: course.name,
        percentage: draftGrades[String(course.id)]?.trim() === "" || draftGrades[String(course.id)] === undefined ? Number.NaN : Number(draftGrades[String(course.id)]),
      })));
      setSaveMessage("Saved. The dashboard has been updated.");
    } catch (caught) {
      setSaveMessage(caught instanceof Error ? caught.message : "Admin settings could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  const toggleRows: Array<{ key: keyof DashboardPreferences; title: string; detail: string }> = [
    { key: "showDueTodayWhenEmpty", title: "Due Today", detail: "Show the Due Today card even when it has zero items." },
    { key: "showDueTomorrowWhenEmpty", title: "Due Tomorrow", detail: "Show the Due Tomorrow card even when it has zero items." },
    { key: "showDueWeekWhenEmpty", title: "This Week", detail: "Show the This Week card even when it has zero items." },
  ];

  return (
    <section className="portal-feature-view admin-view" aria-labelledby="admin-view-title">
      <header className="portal-feature-header">
        <button type="button" onClick={onBack} aria-label="Return to dashboard">←</button>
        <div><p>Family dashboard controls</p><h1 id="admin-view-title">Admin</h1><small>Grades and empty due-card display</small></div>
        <span aria-hidden="true">⚙</span>
      </header>
      {loading ? <div className="admin-state" role="status"><i aria-hidden="true" /><p>Loading dashboard settings…</p></div> : null}
      <form className="admin-form" onSubmit={(event) => void save(event)}>
        <section className="admin-section">
          <header><p>Dashboard display</p><h2>Show empty due cards</h2></header>
          <div className="admin-toggle-list">
            {toggleRows.map((row) => (
              <label className="admin-toggle" key={row.key}>
                <span><strong>{row.title}</strong><small>{row.detail}</small></span>
                <input type="checkbox" checked={draftSettings[row.key]} onChange={(event) => setDraftSettings((current) => ({ ...current, [row.key]: event.target.checked }))} aria-label={`${row.title}: show when empty`} />
                <i aria-hidden="true" />
              </label>
            ))}
          </div>
        </section>
        <section className="admin-section">
          <header><p>Six course slots</p><h2>Course percentages</h2><small>Letter grades are calculated automatically.</small></header>
          <div className="admin-grade-list">
            {editableCourses.map((course, index) => {
              const value = draftGrades[String(course.id)] ?? "";
              const percentage = value === "" ? null : Number(value);
              return (
                <label className="admin-grade-row" key={course.id}>
                  <span><i>{index + 1}</i><strong>{course.name}</strong></span>
                  <div><input type="number" min="0" max="100" step="0.1" inputMode="decimal" value={value} onChange={(event) => setDraftGrades((current) => ({ ...current, [String(course.id)]: event.target.value }))} placeholder="—" aria-label={`${course.name} percentage`} /><b>%</b><em>{percentage !== null && Number.isFinite(percentage) ? letterGrade(percentage) : "—"}</em></div>
                </label>
              );
            })}
          </div>
        </section>
        {error ? <p className="admin-message is-error" role="alert">{error}</p> : null}
        {saveMessage ? <p className={`admin-message${saveMessage.startsWith("Saved") ? " is-success" : " is-error"}`} role="status">{saveMessage}</p> : null}
        <button className="admin-save" type="submit" disabled={saving || loading}>{saving ? "Saving…" : "Save dashboard settings"}</button>
      </form>
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

type ActiveView = "dashboard" | "inbox" | "classes" | "chat" | "admin" | PostBoard;

const mobileMenuItems: Array<{ label: string; image: string; action?: Exclude<ActiveView, "dashboard"> }> = [
  { label: "To-Do List", image: "/menu-todo.webp" },
  { label: "Classes", image: "/menu-classes.webp", action: "classes" },
  { label: "Inbox", image: "/menu-inbox.webp", action: "inbox" },
  { label: "Calendar", image: "/menu-calendar.webp" },
  { label: "Notes", image: "/menu-notes.webp" },
  { label: "Chat", image: "/menu-chat.webp", action: "chat" },
  { label: "Inspiration", image: "/menu-inspiration.webp", action: "inspiration" },
  { label: "Resources", image: "/menu-resources.webp", action: "resources" },
  { label: "Stats", image: "/menu-stats.webp" },
  { label: "Admin", image: "/menu-admin.webp", action: "admin" },
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
  const featureViewRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [focusMode, setFocusMode] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeView, setActiveView] = useState<ActiveView>("dashboard");
  const [inboxConversations, setInboxConversations] = useState<InboxConversation[]>([]);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [inboxError, setInboxError] = useState<string | null>(null);
  const [threadLoadingId, setThreadLoadingId] = useState<string | null>(null);
  const [selectedThread, setSelectedThread] = useState<InboxThread | null>(null);
  const [postsByBoard, setPostsByBoard] = useState<Record<PostBoard, FamilyPost[]>>({ inspiration: [], resources: [] });
  const [postBoardLoading, setPostBoardLoading] = useState(false);
  const [postBoardError, setPostBoardError] = useState<string | null>(null);
  const [composerBoard, setComposerBoard] = useState<PostBoard | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatOlderLoading, setChatOlderLoading] = useState(false);
  const [chatHasMore, setChatHasMore] = useState(false);
  const [chatNextBefore, setChatNextBefore] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  const chatLatestIdRef = useRef<string | null>(null);
  const [dashboardPreferences, setDashboardPreferences] = useState<DashboardPreferences>({ showDueTodayWhenEmpty: true, showDueTomorrowWhenEmpty: true, showDueWeekWhenEmpty: true });
  const [gradeOverrides, setGradeOverrides] = useState<GradeOverride[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [greetingIndex] = useState(() => Math.floor(Math.random() * familyGreetings.length));
  const [selectedAction, setSelectedAction] = useState<ActionItem | null>(null);
  const closeAssignment = useCallback(() => setSelectedAction(null), []);
  const closeThread = useCallback(() => setSelectedThread(null), []);
  const closeComposer = useCallback(() => setComposerBoard(null), []);

  useEffect(() => {
    chatLatestIdRef.current = chatMessages.at(-1)?.id ?? null;
  }, [chatMessages]);

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

  const loadPostBoard = useCallback(async (board: PostBoard) => {
    setPostBoardLoading(true);
    setPostBoardError(null);
    try {
      const response = await fetch(appPath(`/api/posts?board=${board}`), { cache: "no-store", credentials: "same-origin" });
      const body = await response.json();
      if (response.status === 401) {
        if (onExit) onExit();
        else window.location.replace(appPath("/"));
        return;
      }
      if (!response.ok) throw new Error(body.error || "The family post board could not be loaded.");
      setPostsByBoard((current) => ({ ...current, [board]: body.posts ?? [] }));
    } catch (caught) {
      setPostBoardError(caught instanceof Error ? caught.message : "The family post board could not be loaded.");
    } finally {
      setPostBoardLoading(false);
    }
  }, [onExit]);

  const createPost = useCallback(async (board: PostBoard, payload: { title: string; body: string; url: string }) => {
    const response = await fetch(appPath(`/api/posts?board=${board}`), {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    if (response.status === 401) {
      if (onExit) onExit();
      else window.location.replace(appPath("/"));
      throw new Error("Your family session has expired.");
    }
    if (!response.ok) throw new Error(body.error || "The post could not be saved.");
    setPostsByBoard((current) => ({ ...current, [board]: [body.post, ...current[board]] }));
    setComposerBoard(null);
  }, [onExit]);

  const loadChat = useCallback(async () => {
    setChatLoading(true);
    setChatError(null);
    try {
      const response = await fetch(appPath("/api/chat"), { cache: "no-store", credentials: "same-origin" });
      const body = await response.json();
      if (response.status === 401) {
        if (onExit) onExit();
        else window.location.replace(appPath("/"));
        return;
      }
      if (!response.ok) throw new Error(body.error || "Family chat could not be loaded.");
      setChatMessages(body.messages ?? []);
      setChatHasMore(Boolean(body.hasMore));
      setChatNextBefore(body.nextBefore ?? null);
    } catch (caught) {
      setChatError(caught instanceof Error ? caught.message : "Family chat could not be loaded.");
    } finally {
      setChatLoading(false);
    }
  }, [onExit]);

  const loadOlderChat = useCallback(async () => {
    if (!chatNextBefore || chatOlderLoading) return;
    setChatOlderLoading(true);
    setChatError(null);
    try {
      const response = await fetch(appPath(`/api/chat?before=${encodeURIComponent(chatNextBefore)}`), { cache: "no-store", credentials: "same-origin" });
      const body = await response.json();
      if (response.status === 401) {
        if (onExit) onExit();
        else window.location.replace(appPath("/"));
        return;
      }
      if (!response.ok) throw new Error(body.error || "Older messages could not be loaded.");
      setChatMessages((current) => {
        const existing = new Set(current.map((message) => message.id));
        return [...(body.messages ?? []).filter((message: ChatMessage) => !existing.has(message.id)), ...current];
      });
      setChatHasMore(Boolean(body.hasMore));
      setChatNextBefore(body.nextBefore ?? null);
    } catch (caught) {
      setChatError(caught instanceof Error ? caught.message : "Older messages could not be loaded.");
    } finally {
      setChatOlderLoading(false);
    }
  }, [chatNextBefore, chatOlderLoading, onExit]);

  const sendChatMessage = useCallback(async (message: string) => {
    setChatError(null);
    const response = await fetch(appPath("/api/chat"), {
      method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: message }),
    });
    const body = await response.json();
    if (response.status === 401) {
      if (onExit) onExit();
      else window.location.replace(appPath("/"));
      throw new Error("Your family session has expired.");
    }
    if (!response.ok) {
      const messageText = body.error || "The chat message could not be sent.";
      setChatError(messageText);
      throw new Error(messageText);
    }
    setChatMessages((current) => current.some((item) => item.id === body.message.id) ? current : [...current, body.message]);
  }, [onExit]);

  const editChatMessage = useCallback(async (id: string, message: string) => {
    setChatError(null);
    const response = await fetch(appPath("/api/chat"), {
      method: "PATCH", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, body: message }),
    });
    const body = await response.json();
    if (!response.ok) {
      const messageText = body.error || "The chat message could not be edited.";
      setChatError(messageText);
      throw new Error(messageText);
    }
    setChatMessages((current) => current.map((item) => item.id === id ? body.message : item));
  }, []);

  const deleteChatMessage = useCallback(async (id: string) => {
    setChatError(null);
    const response = await fetch(appPath("/api/chat"), {
      method: "DELETE", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }),
    });
    const body = await response.json();
    if (!response.ok) {
      const messageText = body.error || "The chat message could not be deleted.";
      setChatError(messageText);
      throw new Error(messageText);
    }
    setChatMessages((current) => current.filter((item) => item.id !== id));
  }, []);

  const loadAdmin = useCallback(async () => {
    setAdminLoading(true);
    setAdminError(null);
    try {
      const response = await fetch(appPath("/api/admin"), { cache: "no-store", credentials: "same-origin" });
      const body = await response.json();
      if (response.status === 401) {
        if (onExit) onExit();
        else window.location.replace(appPath("/"));
        return;
      }
      if (!response.ok) throw new Error(body.error || "Admin settings could not be loaded.");
      setDashboardPreferences(body.settings);
      setGradeOverrides(body.grades ?? []);
    } catch (caught) {
      setAdminError(caught instanceof Error ? caught.message : "Admin settings could not be loaded.");
    } finally {
      setAdminLoading(false);
    }
  }, [onExit]);

  const saveAdmin = useCallback(async (settings: DashboardPreferences, grades: GradeOverride[]) => {
    setAdminError(null);
    const response = await fetch(appPath("/api/admin"), {
      method: "PUT", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ settings, grades }),
    });
    const body = await response.json();
    if (response.status === 401) {
      if (onExit) onExit();
      else window.location.replace(appPath("/"));
      throw new Error("Your family session has expired.");
    }
    if (!response.ok) {
      const messageText = body.error || "Admin settings could not be saved.";
      setAdminError(messageText);
      throw new Error(messageText);
    }
    setDashboardPreferences(body.settings);
    setGradeOverrides(body.grades ?? []);
  }, [onExit]);

  useEffect(() => {
    if (activeView !== "chat") return;
    const refresh = async () => {
      const after = chatLatestIdRef.current;
      if (!after) return;
      try {
        const response = await fetch(appPath(`/api/chat?after=${encodeURIComponent(after)}`), { cache: "no-store", credentials: "same-origin" });
        if (!response.ok) return;
        const body = await response.json();
        if (body.messages?.length) {
          setChatMessages((current) => {
            const existing = new Set(current.map((message) => message.id));
            return [...current, ...body.messages.filter((message: ChatMessage) => !existing.has(message.id))];
          });
        }
      } catch { /* A later chat refresh will retry quietly. */ }
    };
    const interval = window.setInterval(() => void refresh(), 8_000);
    return () => window.clearInterval(interval);
  }, [activeView]);

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
    const initialAdminLoad = window.setTimeout(() => void loadAdmin(), 0);
    const autoRefresh = window.setInterval(() => void sync(), AUTO_REFRESH_MS);
    return () => {
      window.clearTimeout(initialSync);
      window.clearTimeout(initialAdminLoad);
      window.clearInterval(autoRefresh);
    };
  }, [loadAdmin, sync]);

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

  const transitionToView = useCallback((nextView: ActiveView) => {
    setMobileMenuOpen(false);
    if (activeView === nextView) return;
    const current = activeView === "dashboard" ? homeContentRef.current : featureViewRef.current;
    const finish = () => setActiveView(nextView);
    if (!current) {
      finish();
      return;
    }
    gsap.to(Array.from(current.children), {
      autoAlpha: 0,
      y: 30,
      duration: 0.24,
      stagger: 0.045,
      ease: "power2.in",
      onComplete: finish,
    });
  }, [activeView]);

  const showSection = useCallback((nextView: Exclude<ActiveView, "dashboard">) => {
    if (nextView === "inbox") void loadInbox();
    if (nextView === "inspiration" || nextView === "resources") void loadPostBoard(nextView);
    if (nextView === "chat") void loadChat();
    if (nextView === "admin") void loadAdmin();
    transitionToView(nextView);
  }, [loadAdmin, loadChat, loadInbox, loadPostBoard, transitionToView]);

  const returnToDashboard = useCallback(() => {
    setSelectedThread(null);
    transitionToView("dashboard");
  }, [transitionToView]);

  const chooseMobileMenuItem = useCallback((action?: Exclude<ActiveView, "dashboard">) => {
    if (action) showSection(action);
    else setMobileMenuOpen(false);
  }, [showSection]);

  useLayoutEffect(() => {
    const root = activeView === "dashboard" ? homeContentRef.current : featureViewRef.current;
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
    if (activeView !== "inbox" || inboxLoading || !featureViewRef.current) return;
    const rows = featureViewRef.current.querySelectorAll(".inbox-conversation");
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
    if (!featureViewRef.current) return;
    const isPostBoard = activeView === "inspiration" || activeView === "resources";
    const isChat = activeView === "chat";
    const isAdmin = activeView === "admin";
    if ((isPostBoard && postBoardLoading) || (isChat && chatLoading) || (isAdmin && adminLoading) || (activeView !== "classes" && !isPostBoard && !isChat && !isAdmin)) return;
    const selector = activeView === "classes" ? ".class-box" : isChat ? ".chat-message" : isAdmin ? ".admin-section" : ".family-post";
    const items = featureViewRef.current.querySelectorAll(selector);
    gsap.fromTo(items, { autoAlpha: 0, y: 26, scale: 0.98 }, {
      autoAlpha: 1,
      y: 0,
      scale: 1,
      duration: 0.4,
      stagger: 0.065,
      ease: "power2.out",
      clearProps: "transform,opacity,visibility",
    });
  }, [activeView, adminLoading, chatLoading, chatMessages, postBoardLoading, postsByBoard]);

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
          {dueToday.length || dashboardPreferences.showDueTodayWhenEmpty ? <div className="today-featured-slot due-featured-slot" aria-label="Assignments due today">
            <MobileDueCard title="Due today" items={dueToday} empty="Nothing is due today." onSelectAssignment={setSelectedAction} featured tone="today" summary={todaySummary} />
          </div> : null}
          {dueTomorrow.length || dashboardPreferences.showDueTomorrowWhenEmpty ? <div className="tomorrow-featured-slot due-featured-slot" aria-label="Assignments due tomorrow">
            <MobileDueCard title="Due tomorrow" items={dueTomorrow} empty="Nothing is due tomorrow." onSelectAssignment={setSelectedAction} featured banner="/due-tomorrow-banner.webp" tone="tomorrow" summary={tomorrowSummary} />
          </div> : null}
          {dueThisWeek.length || dashboardPreferences.showDueWeekWhenEmpty ? <div className="week-featured-slot due-featured-slot" aria-label="Assignments due this week">
            <MobileDueCard title="Due this week" items={dueThisWeek} empty="Nothing else is due this week." onSelectAssignment={setSelectedAction} featured banner="/this-week-banner.webp" tone="week" summary={weekSummary} />
          </div> : null}
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
            {gradeArtwork.map((item, index) => {
              const course = data.courses[index];
              const grade = course ? gradeOverrides.find((entry) => entry.courseKey === String(course.id)) : null;
              const calculatedLetter = grade ? letterGrade(grade.percentage) : null;
              return <article className="grade-artwork-card" key={item.label} aria-label={course?.name ?? item.label}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={appPath(item.image)} alt={course?.name ?? item.label} />
                {grade && calculatedLetter ? <div className={`grade-artwork-value grade-tone-${calculatedLetter.toLowerCase()}`}><strong>{calculatedLetter}</strong><span>{grade.percentage.toFixed(grade.percentage % 1 ? 1 : 0)}%</span></div> : null}
              </article>;
            })}
          </div>
        </section>
        </div>
        ) : (
          <div className="feature-view-shell" ref={featureViewRef}>
            {activeView === "inbox" ? <InboxView
              conversations={inboxConversations}
              loading={inboxLoading}
              error={inboxError}
              threadLoadingId={threadLoadingId}
              onRead={(conversation) => void openThread(conversation)}
              onBack={returnToDashboard}
            /> : activeView === "classes" ? <ClassesView courses={data.courses} week={data.week} onBack={returnToDashboard} /> : activeView === "chat" ? <ChatView
              messages={chatMessages}
              viewer={data.viewer}
              loading={chatLoading}
              olderLoading={chatOlderLoading}
              hasMore={chatHasMore}
              error={chatError}
              onBack={returnToDashboard}
              onLoadOlder={loadOlderChat}
              onSend={sendChatMessage}
              onEdit={editChatMessage}
              onDelete={deleteChatMessage}
            /> : activeView === "admin" ? <AdminView
              key={`admin-${adminLoading}-${dashboardPreferences.showDueTodayWhenEmpty}-${dashboardPreferences.showDueTomorrowWhenEmpty}-${dashboardPreferences.showDueWeekWhenEmpty}-${gradeOverrides.map((grade) => `${grade.courseKey}:${grade.percentage}`).join("|")}`}
              courses={data.courses}
              settings={dashboardPreferences}
              grades={gradeOverrides}
              loading={adminLoading}
              error={adminError}
              onBack={returnToDashboard}
              onSave={saveAdmin}
            /> : <PostBoardView
              board={activeView}
              posts={postsByBoard[activeView]}
              loading={postBoardLoading}
              error={postBoardError}
              onBack={returnToDashboard}
              onNewPost={() => setComposerBoard(activeView)}
            />}
          </div>
        )}
      </section>
      {selectedAction ? <AssignmentModal item={selectedAction} onClose={closeAssignment} /> : null}
      {selectedThread ? <InboxThreadModal thread={selectedThread} onClose={closeThread} /> : null}
      {composerBoard ? <PostComposerModal board={composerBoard} onClose={closeComposer} onSubmit={(payload) => createPost(composerBoard, payload)} /> : null}
    </main>
  );
}
