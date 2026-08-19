"use client";

import { type CSSProperties, type FormEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import DOMPurify from "dompurify";
import { appPath } from "../../lib/app-paths";

type ActionItem = {
  id: string;
  kind: "assignment" | "announcement" | "message";
  canvasCourseId: number | null;
  canvasItemId: number | null;
  canvasItemType: string | null;
  title: string;
  course: string;
  dueAt: string | null;
  points: number | null;
  state: string;
  detail: string;
  sourceUrl: string;
  description: string;
  descriptionHtml: string;
  availableFrom: string | null;
  availableUntil: string | null;
  submissionTypes: string[];
  allowedExtensions: string[];
  gradingType: string | null;
  allowedAttempts: number | null;
  published: boolean | null;
  authorName: string | null;
  authorAvatarUrl: string | null;
  audioUrl: string | null;
};

const DEFAULT_ASSIGNMENT_INSTRUCTIONS = "Canvas has not included written instructions for this item. Use the Canvas button below to check for files, worksheets, videos, rubrics, or teacher updates.";

function plainCanvasText(value: string) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("en-US");
}

function mergeCanvasInstructions(primaryHtml: string, primaryText: string, fetchedHtml: string, fetchedText: string) {
  const primary = primaryHtml.trim() || primaryText.trim();
  const fetched = fetchedHtml.trim() || fetchedText.trim();
  if (!primary) return { descriptionHtml: fetchedHtml, description: fetchedText };
  if (!fetched) return { descriptionHtml: primaryHtml, description: primaryText };

  const normalizedPrimary = plainCanvasText(primary);
  const normalizedFetched = plainCanvasText(fetched);
  if (!normalizedFetched || normalizedPrimary.includes(normalizedFetched)) {
    return { descriptionHtml: primaryHtml, description: primaryText };
  }
  if (normalizedFetched.includes(normalizedPrimary)) {
    return { descriptionHtml: fetchedHtml, description: fetchedText };
  }

  return {
    descriptionHtml: `${primaryHtml || `<p>${primaryText}</p>`}<hr><h5>Additional Canvas details</h5>${fetchedHtml || `<p>${fetchedText}</p>`}`,
    description: `${primaryText}\n\nAdditional Canvas details\n${fetchedText}`.trim(),
  };
}

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
  teachers: Array<{ id: string | null; name: string; avatarUrl: string | null }>;
};

type CourseGradeItem = {
  id: number;
  name: string;
  dueAt: string | null;
  submittedAt: string | null;
  status: string;
  score: number | null;
  grade: string | null;
  pointsPossible: number | null;
  percentage: number | null;
  sourceUrl: string;
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
  announcements: ActionItem[];
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
  contentType: string | null;
};

type InboxMessage = {
  id: string;
  createdAt: string | null;
  body: string;
  generated: boolean;
  isOwn: boolean;
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
  currentUserId: string | null;
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
  audio: { url: string; contentType: string | null; durationMs: number | null } | null;
  author: { username: string; name: string };
  seenBy: Array<{ username: string; name: string }>;
  createdAt: string;
  updatedAt: string;
};

function sameChatMessage(left: ChatMessage, right: ChatMessage) {
  const sameAudio = (!left.audio && !right.audio) || Boolean(
    left.audio && right.audio
    && left.audio.url === right.audio.url
    && left.audio.contentType === right.audio.contentType
    && left.audio.durationMs === right.audio.durationMs
  );
  const sameReaders = left.seenBy.length === right.seenBy.length
    && left.seenBy.every((person, index) => person.username === right.seenBy[index]?.username && person.name === right.seenBy[index]?.name);
  return left.id === right.id
    && left.body === right.body
    && left.author.username === right.author.username
    && left.author.name === right.author.name
    && left.createdAt === right.createdAt
    && left.updatedAt === right.updatedAt
    && sameAudio
    && sameReaders;
}

function hasTeacherInstructions(item: ActionItem) {
  const readableDescription = item.description.trim();
  return item.kind === "assignment" && Boolean(readableDescription) && plainCanvasText(readableDescription) !== plainCanvasText(DEFAULT_ASSIGNMENT_INSTRUCTIONS);
}

function mergeChatRefresh(current: ChatMessage[], incoming: ChatMessage[]) {
  if (!incoming.length) return current;
  const refreshed = new Map(incoming.map((message) => [message.id, message] as const));
  const existing = new Set(current.map((message) => message.id));
  let changed = false;
  const merged = current.map((message) => {
    const next = refreshed.get(message.id);
    if (!next || sameChatMessage(message, next)) return message;
    changed = true;
    return next;
  });
  for (const message of incoming) {
    if (existing.has(message.id)) continue;
    merged.push(message);
    changed = true;
  }
  return changed ? merged : current;
}

type DashboardPreferences = {
  showAnnouncements: boolean;
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

function thisWeekDueLabel(value: string | null) {
  if (!value) return "Due date not listed";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Due date unavailable";
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", weekday: "long" }).format(date);
  return `${weekday}, ${shortOrdinalDay(dayKey(date))}`;
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

const CANVAS_ORIGIN = "https://sequoiagrove.instructure.com";

function canvasMediaUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value, CANVAS_ORIGIN);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

function CanvasRichContent({ html, fallbackText, onImageOpen }: { html: string; fallbackText: string; onImageOpen?: (image: { src: string; alt: string }) => void }) {
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;
    container.replaceChildren();

    const appendFallback = () => {
      const fallback = document.createElement("p");
      fallback.className = "assignment-description-fallback";
      fallback.textContent = fallbackText;
      container.appendChild(fallback);
    };
    if (!html.trim()) return appendFallback();

    const sanitized = DOMPurify.sanitize(html, {
      ADD_TAGS: ["iframe", "video", "source", "track"],
      ADD_ATTR: ["allow", "allowfullscreen", "controls", "decoding", "default", "frameborder", "kind", "label", "loading", "playsinline", "poster", "preload", "sizes", "srcset", "srclang"],
      FORBID_TAGS: ["base", "button", "embed", "form", "input", "link", "meta", "object", "option", "script", "select", "style", "textarea"],
      FORBID_ATTR: ["srcdoc", "style"],
    });
    const parsed = new DOMParser().parseFromString(`<div>${sanitized}</div>`, "text/html");
    const root = parsed.body.firstElementChild;
    if (!root) {
      appendFallback();
      return;
    }

    root.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((link) => {
      const href = canvasMediaUrl(link.getAttribute("href"));
      if (!href) {
        link.removeAttribute("href");
        return;
      }
      link.href = href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    });
    root.querySelectorAll<HTMLImageElement>("img").forEach((image) => {
      const src = canvasMediaUrl(image.getAttribute("src"));
      if (!src) {
        image.remove();
        return;
      }
      image.src = src;
      image.loading = "lazy";
      image.decoding = "async";
      if (!image.hasAttribute("alt")) image.alt = "Image included with the Canvas instructions";
    });
    root.querySelectorAll<HTMLVideoElement>("video").forEach((video) => {
      const src = canvasMediaUrl(video.getAttribute("src"));
      if (video.hasAttribute("src") && !src) video.removeAttribute("src");
      else if (src) video.src = src;
      const poster = canvasMediaUrl(video.getAttribute("poster"));
      if (poster) video.poster = poster;
      else video.removeAttribute("poster");
      video.controls = true;
      video.playsInline = true;
      video.preload = "metadata";
    });
    root.querySelectorAll<HTMLSourceElement | HTMLTrackElement>("source, track").forEach((media) => {
      const src = canvasMediaUrl(media.getAttribute("src"));
      if (!src) media.remove();
      else media.src = src;
    });
    root.querySelectorAll<HTMLIFrameElement>("iframe").forEach((frame) => {
      const src = canvasMediaUrl(frame.getAttribute("src"));
      if (!src) {
        frame.remove();
        return;
      }
      frame.src = src;
      frame.loading = "lazy";
      frame.referrerPolicy = "no-referrer-when-downgrade";
      frame.setAttribute("sandbox", "allow-forms allow-popups allow-presentation allow-scripts");
      frame.setAttribute("allow", "accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share");
      frame.setAttribute("allowfullscreen", "");
    });

    const containsContent = Boolean(root.textContent?.trim() || root.querySelector("img, video, iframe"));
    if (!containsContent) return appendFallback();
    container.append(...Array.from(root.childNodes).map((node) => node.cloneNode(true)));
    if (onImageOpen) {
      container.querySelectorAll<HTMLImageElement>("img").forEach((image) => {
        image.classList.add("canvas-zoomable-image");
        image.tabIndex = 0;
        image.setAttribute("role", "button");
        image.setAttribute("aria-label", `${image.alt || "Announcement image"}. Open full-screen viewer.`);
        const openImage = () => onImageOpen({ src: image.currentSrc || image.src, alt: image.alt || "Announcement image" });
        image.addEventListener("click", openImage);
        image.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openImage();
          }
        });
      });
    }
  }, [fallbackText, html, onImageOpen]);

  return <div className="canvas-rich-content" ref={contentRef} />;
}

function AnnouncementImageViewer({ image, onClose }: { image: { src: string; alt: string }; onClose: () => void }) {
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const gestureRef = useRef<{ distance: number; centerX: number; centerY: number; view: typeof view } | null>(null);
  const clampScale = (scale: number) => Math.min(5, Math.max(1, scale));

  const startGesture = () => {
    const points = Array.from(pointersRef.current.values());
    if (points.length === 1) gestureRef.current = { distance: 0, centerX: points[0].x, centerY: points[0].y, view };
    if (points.length >= 2) {
      const [a, b] = points;
      gestureRef.current = {
        distance: Math.hypot(b.x - a.x, b.y - a.y),
        centerX: (a.x + b.x) / 2,
        centerY: (a.y + b.y) / 2,
        view,
      };
    }
  };

  return (
    <div className="announcement-image-viewer" role="dialog" aria-modal="true" aria-label="Announcement image viewer">
      <button className="announcement-image-backdrop" type="button" onClick={onClose} aria-label="Close image viewer" />
      <p className="announcement-image-hint">Pinch to zoom · drag to move</p>
      <button className="announcement-image-close" type="button" onClick={onClose} aria-label="Close image viewer">×</button>
      <div
        className="announcement-image-stage"
        onWheel={(event) => {
          event.preventDefault();
          setView((current) => ({ ...current, scale: clampScale(current.scale * (event.deltaY < 0 ? 1.15 : .87)) }));
        }}
        onDoubleClick={() => setView((current) => current.scale === 1 ? { x: 0, y: 0, scale: 2 } : { x: 0, y: 0, scale: 1 })}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
          startGesture();
        }}
        onPointerMove={(event) => {
          if (!pointersRef.current.has(event.pointerId) || !gestureRef.current) return;
          pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
          const points = Array.from(pointersRef.current.values());
          const gesture = gestureRef.current;
          if (points.length === 1) {
            setView({ ...gesture.view, x: gesture.view.x + points[0].x - gesture.centerX, y: gesture.view.y + points[0].y - gesture.centerY });
          } else {
            const [a, b] = points;
            const distance = Math.hypot(b.x - a.x, b.y - a.y);
            const scale = clampScale(gesture.view.scale * distance / Math.max(gesture.distance, 1));
            setView({ x: gesture.view.x + (a.x + b.x) / 2 - gesture.centerX, y: gesture.view.y + (a.y + b.y) / 2 - gesture.centerY, scale });
          }
        }}
        onPointerUp={(event) => { pointersRef.current.delete(event.pointerId); startGesture(); }}
        onPointerCancel={(event) => { pointersRef.current.delete(event.pointerId); startGesture(); }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image.src} alt={image.alt} draggable={false} style={{ transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})` }} />
      </div>
    </div>
  );
}

function AssignmentModal({ item, loading, loadError, onClose }: { item: ActionItem; loading: boolean; loadError: string | null; onClose: () => void }) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closingRef = useRef(false);
  const [isClosing, setIsClosing] = useState(false);
  const [expandedImage, setExpandedImage] = useState<{ src: string; alt: string } | null>(null);
  const openExpandedImage = useCallback((image: { src: string; alt: string }) => setExpandedImage(image), []);

  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setIsClosing(true);
    closeTimerRef.current = setTimeout(onClose, 240);
  }, [onClose]);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") expandedImage ? setExpandedImage(null) : requestClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [expandedImage, requestClose]);

  const isAnnouncement = item.kind === "announcement";
  const detailRows = isAnnouncement ? [
    { label: "Course", value: item.course },
    { label: "Posted", value: formatDate(item.dueAt) },
    { label: "Published", value: item.published === null ? "Not reported" : item.published ? "Yes" : "No" },
  ] : [
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
    <div className={`assignment-modal-backdrop${isClosing ? " is-closing" : ""}`}>
      <button className="modal-backdrop-dismiss" type="button" onClick={requestClose} aria-label={`Close ${isAnnouncement ? "announcement" : "assignment"} details`} />
      <section className="assignment-modal" role="dialog" aria-modal="true" aria-labelledby="assignment-modal-title" aria-describedby="assignment-modal-description">
        <button className="assignment-modal-x" type="button" onClick={requestClose} aria-label={`Close ${isAnnouncement ? "announcement" : "assignment"} details`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={appPath("/logout-button.webp")} alt="" aria-hidden="true" />
        </button>
        <div className="assignment-modal-scroll">
          <header className="assignment-modal-heading">
            <span className="assignment-modal-teacher">
              {item.authorAvatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.authorAvatarUrl} alt={item.authorName || "Teacher"} referrerPolicy="no-referrer" />
              ) : <strong aria-hidden="true">{(item.authorName || item.course || "T").slice(0, 1).toUpperCase()}</strong>}
            </span>
            <div><p>{isAnnouncement ? "Announcement" : "Assignment details"}</p><h2 id="assignment-modal-title">{item.title}</h2><small>{item.authorName ? `${item.authorName} · ${item.course}` : item.course}</small></div>
          </header>

          <section className="assignment-detail-section">
            <h3>At a glance</h3>
            <dl className="assignment-detail-grid">
              {detailRows.map((row) => <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}
            </dl>
          </section>

          <section className="assignment-detail-section assignment-description" id="assignment-modal-description">
            <h3>{isAnnouncement ? "Announcement details" : <>Instructions &amp; details</>}</h3>
            <h4>{item.title}</h4>
            {loading ? <p className="assignment-description-fallback">Loading the full item from Canvas…</p> : null}
            {loadError ? <p className="assignment-description-fallback">{loadError}</p> : null}
            <CanvasRichContent
              html={item.descriptionHtml}
              fallbackText={item.description || (isAnnouncement ? "Open this announcement in Canvas to read the teacher's full message." : DEFAULT_ASSIGNMENT_INSTRUCTIONS)}
              onImageOpen={isAnnouncement ? openExpandedImage : undefined}
            />
          </section>
          {isAnnouncement ? <button type="button" className="announcement-modal-got-it" onClick={requestClose} aria-label="Got it — close announcement">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={appPath("/announcement-got-it.webp")} alt="Got It!" />
          </button> : null}
        </div>

        <footer className="assignment-modal-actions">
          <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" aria-label={`Open ${item.title} in Canvas in a new browser window`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={appPath("/see-in-canvas.webp")} alt="See in Canvas" />
          </a>
          <button className="assignment-modal-close" type="button" onClick={requestClose} ref={closeButtonRef}>Close</button>
        </footer>
      </section>
      {expandedImage ? <AnnouncementImageViewer image={expandedImage} onClose={() => setExpandedImage(null)} /> : null}
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

function FeatureBackBar({ onBack }: { onBack: () => void }) {
  return <button className="feature-back-bar" type="button" onClick={onBack}><span aria-hidden="true">←</span> Back To Dashboard</button>;
}

function createCompatibleAudioRecorder(stream: MediaStream) {
  const preferredType = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"]
    .find((type) => MediaRecorder.isTypeSupported(type));
  return preferredType ? new MediaRecorder(stream, { mimeType: preferredType }) : new MediaRecorder(stream);
}

type TeacherChoice = { id: string; name: string; avatarUrl: string | null; subjects: string[]; courseId: number };

function NewTeacherEmailFlow({ courses, onSent }: { courses: Course[]; onSent: () => void }) {
  const teachers = Array.from(courses.reduce((map, course) => {
    course.teachers.forEach((teacher) => {
      if (!teacher.id) return;
      const current = map.get(teacher.id);
      if (current) {
        if (!current.subjects.includes(course.name)) current.subjects.push(course.name);
      } else map.set(teacher.id, { ...teacher, id: teacher.id, subjects: [course.name], courseId: course.id });
    });
    return map;
  }, new Map<string, TeacherChoice>()).values());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerClosing, setPickerClosing] = useState(false);
  const [selected, setSelected] = useState<TeacherChoice | null>(null);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [recorderOpen, setRecorderOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [audio, setAudio] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioDuration, setAudioDuration] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingStartedRef = useRef(0);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pickerBackdropRef = useRef<HTMLDivElement>(null);
  const pickerModalRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const modal = pickerModalRef.current;
    if (!pickerOpen || selected || !modal || pickerClosing) return;
    const context = gsap.context(() => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const timeline = gsap.timeline();
      timeline.fromTo(modal, { autoAlpha: 0, y: 42, scale: .97 }, { autoAlpha: 1, y: 0, scale: 1, duration: .34, ease: "power3.out" })
        .fromTo(modal.querySelectorAll(".teacher-picker-title-char"), { autoAlpha: 0, y: 9 }, { autoAlpha: 1, y: 0, duration: .16, stagger: .022, ease: "power2.out" }, .12);
      modal.querySelectorAll<HTMLElement>(".teacher-choice").forEach((card, index) => {
        const start = .35 + index * .22;
        timeline.fromTo(card.querySelector(".teacher-choice-photo"), { autoAlpha: 0, scale: .08, z: -700, transformPerspective: 900 }, { autoAlpha: 1, scale: 1, z: 0, duration: .62, ease: "elastic.out(1, .55)" }, start)
          .fromTo(card.querySelector(".teacher-choice-name"), { autoAlpha: 0, y: 25, rotation: -4 }, { autoAlpha: 1, y: 0, rotation: 0, duration: .34, ease: "back.out(2.2)" }, start + .36)
          .to(card.querySelector(".teacher-choice-name"), { keyframes: [{ rotation: 1.5 }, { rotation: -1.2 }, { rotation: 0 }], duration: .22, ease: "sine.inOut" }, start + .62)
          .fromTo(card.querySelector("small"), { autoAlpha: 0 }, { autoAlpha: 1, duration: .35, ease: "power1.out" }, start + .68);
      });
    }, modal);
    return () => context.revert();
  }, [pickerClosing, pickerOpen, selected]);

  useEffect(() => () => {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    recorderRef.current?.stream.getTracks().forEach((track) => track.stop());
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  function resetComposer() {
    setSelected(null); setSubject(""); setMessage(""); setFiles([]); setSendError(""); setRecorderOpen(false);
  }

  async function startEmailRecording() {
    setSendError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = createCompatibleAudioRecorder(stream); const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        setAudio(blob); setAudioUrl(URL.createObjectURL(blob)); stream.getTracks().forEach((track) => track.stop());
      };
      recorderRef.current = recorder; recordingStartedRef.current = Date.now(); setAudioDuration(0); setRecording(true); recorder.start();
      recordingTimerRef.current = setInterval(() => setAudioDuration(Date.now() - recordingStartedRef.current), 250);
    } catch { setSendError("Microphone access is needed to record an audio attachment."); }
  }

  function stopEmailRecording() {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    recordingTimerRef.current = null; setRecording(false); recorderRef.current?.stop();
  }

  function closeTeacherPicker() {
    if (pickerClosing) return;
    const modal = pickerModalRef.current;
    const backdrop = pickerBackdropRef.current;
    if (!modal || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setPickerOpen(false); return; }
    setPickerClosing(true);
    gsap.timeline({ onComplete: () => { setPickerOpen(false); setPickerClosing(false); } })
      .to(modal, { y: 72, autoAlpha: 0, duration: .3, ease: "power2.in" })
      .to(backdrop, { autoAlpha: 0, duration: .25, ease: "power1.in" }, 0);
  }

  function attachEmailRecording() {
    if (!audio) return;
    const extension = audio.type.includes("mp4") ? "m4a" : audio.type.includes("ogg") ? "ogg" : "webm";
    setFiles((current) => [...current.filter((file) => !file.name.startsWith("audio-message-")), new File([audio], `audio-message-${Date.now()}.${extension}`, { type: audio.type })].slice(0, 4));
    setRecorderOpen(false);
  }

  async function sendTeacherEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !subject.trim() || !message.trim() || sending) return;
    setSending(true); setSendError("");
    try {
      const form = new FormData();
      form.append("recipientId", selected.id); form.append("subject", subject.trim()); form.append("body", message.trim()); form.append("contextCode", `course_${selected.courseId}`);
      files.forEach((file) => form.append("attachments", file, file.name));
      const response = await fetch(appPath("/api/inbox"), { method: "POST", credentials: "same-origin", body: form });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Your email could not be sent to Canvas.");
      resetComposer(); setPickerOpen(false); onSent();
    } catch (caught) { setSendError(caught instanceof Error ? caught.message : "Your email could not be sent to Canvas."); }
    finally { setSending(false); }
  }

  return <>
    <div className="inbox-launch-row">
      <a className="canvas-email-launch" href={`${CANVAS_ORIGIN}/conversations#filter=type=inbox`} target="_blank" rel="noopener noreferrer" aria-label="Open Canvas Inbox">
        {/* eslint-disable-next-line @next/next/no-img-element */}<img src={appPath("/canvas-emails.webp")} alt="" />
      </a>
      <button className="email-teacher-launch" type="button" onClick={() => setPickerOpen(true)} aria-label="Email a teacher">
        {/* eslint-disable-next-line @next/next/no-img-element */}<img src={appPath("/email-a-teacher.jpg")} alt="Email a Teacher" />
      </button>
    </div>
    {pickerOpen && !selected ? <div className={`teacher-picker-backdrop${pickerClosing ? " is-closing" : ""}`} ref={pickerBackdropRef}>
      <button className="modal-backdrop-dismiss" type="button" onClick={closeTeacherPicker} aria-label="Close teacher picker" />
      <section className="teacher-picker-modal" ref={pickerModalRef} role="dialog" aria-modal="true" aria-labelledby="teacher-picker-title">
        <button className="teacher-picker-x" type="button" onClick={closeTeacherPicker} aria-label="Close teacher picker">×</button>
        <h2 id="teacher-picker-title" aria-label="Who would you like to email?">{"Who would you like to email?".split("").map((character, index) => <span className="teacher-picker-title-char" aria-hidden="true" key={`${character}-${index}`}>{character === " " ? "\u00a0" : character}</span>)}</h2>
        {teachers.length ? <div className="teacher-choice-grid">{teachers.map((teacher, index) => <button className={`teacher-choice teacher-tilt-${index % 4}`} type="button" onClick={() => setSelected(teacher)} key={teacher.id}>
          <span className="teacher-choice-photo">{teacher.avatarUrl ? <img src={teacher.avatarUrl} alt="" referrerPolicy="no-referrer" /> : <strong>{teacher.name.slice(0, 1)}</strong>}</span>
          <span className="teacher-choice-name">{teacher.name}</span>
          <small>{teacher.subjects.join(" · ")}</small>
        </button>)}</div> : <p className="teacher-picker-empty">Teacher information is not available from Canvas yet.</p>}
      </section>
    </div> : null}
    {selected ? <div className="teacher-email-backdrop">
      <button className="modal-backdrop-dismiss" type="button" onClick={resetComposer} aria-label="Close new email" disabled={sending} />
      <section className="teacher-email-modal" role="dialog" aria-modal="true" aria-labelledby="teacher-email-title">
        <button className="teacher-picker-x" type="button" onClick={resetComposer} aria-label="Close new email" disabled={sending}>×</button>
        <header><InboxAvatar person={{ id: selected.id, name: selected.name, avatarUrl: selected.avatarUrl }} label="Teacher" /><div><span>EMAILING</span><strong id="teacher-email-title">{selected.name}</strong><small>{selected.subjects.join(" · ")}</small></div></header>
        <form onSubmit={sendTeacherEmail}>
          <label><span>Subject</span><input value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={255} placeholder="What is your email about?" disabled={sending} autoFocus /></label>
          <label><span>Message</span><textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={10000} placeholder="Write your email…" disabled={sending} /></label>
          <div className="inbox-compose-tools"><label className="inbox-attach-button" htmlFor="teacher-email-files">📎 Attach files</label><button className="inbox-record-button" type="button" onClick={() => setRecorderOpen(true)}>▥ Record audio</button></div>
          <input className="inbox-file-input" id="teacher-email-files" type="file" multiple accept="image/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv" onChange={(event) => setFiles(Array.from(event.target.files ?? []).slice(0, 4))} />
          {files.length ? <div className="teacher-email-files">{files.map((file, index) => <span key={`${file.name}-${file.lastModified}`}>{file.name}<button type="button" onClick={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove ${file.name}`}>×</button></span>)}</div> : null}
          {sendError ? <p className="inbox-reply-error" role="alert">{sendError}</p> : null}
          <button className="teacher-email-send" type="submit" disabled={!subject.trim() || !message.trim() || sending}>{sending ? "Sending…" : "Send email"}</button>
        </form>
      </section>
      {recorderOpen ? <div className="chat-recorder-backdrop inbox-audio-recorder"><button className="modal-backdrop-dismiss" type="button" onClick={() => { if (recording) stopEmailRecording(); setRecorderOpen(false); }} aria-label="Close audio recorder" /><section className="chat-recorder" role="dialog" aria-modal="true" aria-labelledby="teacher-recorder-title"><button className="chat-recorder-close" type="button" onClick={() => { if (recording) stopEmailRecording(); setRecorderOpen(false); }}>×</button><span className={`chat-recorder-icon${recording ? " is-recording" : ""}`}>▥</span><h2 id="teacher-recorder-title">Audio attachment</h2><p>{recording ? "Recording…" : audio ? "Listen before attaching it." : "Tap record and speak your message."}</p><strong className="chat-recorder-time">{formatAudioTime(audioDuration)}</strong>{audioUrl && !recording ? <audio src={audioUrl} controls /> : null}<div className="chat-recorder-actions">{recording ? <button type="button" onClick={stopEmailRecording}>Stop</button> : <button type="button" onClick={() => void startEmailRecording()}>Record</button>}{audio ? <button type="button" onClick={attachEmailRecording}>Attach audio</button> : null}</div></section></div> : null}
    </div> : null}
  </>;
}

function InboxView({ conversations, courses, loading, error, threadLoadingId, onRead, onSent }: {
  conversations: InboxConversation[];
  courses: Course[];
  loading: boolean;
  error: string | null;
  threadLoadingId: string | null;
  onRead: (conversation: InboxConversation) => void;
  onSent: () => void;
}) {
  return (
    <section className="inbox-view" aria-label="Canvas Inbox: the 10 most recent conversations">
      <NewTeacherEmailFlow courses={courses} onSent={onSent} />
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

function ClassesView({ courses, week }: { courses: Course[]; week: WeekItem[] }) {
  const combineMeetings = (meetings: WeekItem[]) => Array.from(meetings.reduce((groups, meeting) => {
    const key = `${meeting.time}|${meeting.note}|${meeting.tentative}`;
    const current = groups.get(key);
    if (current) current.days.push(meeting.day);
    else groups.set(key, { ...meeting, days: [meeting.day] });
    return groups;
  }, new Map<string, WeekItem & { days: string[] }>()).values()).map((meeting) => ({
    ...meeting,
    day: meeting.days.join(" / "),
  }));
  const scheduled = Array.from(new Set(week.map((item) => item.course))).map((name) => {
    const comparableName = comparableCourseName(name);
    const course = courses.find((candidate) => {
      const comparableCandidate = comparableCourseName(candidate.name);
      return comparableCandidate === comparableName || comparableCandidate.includes(comparableName) || comparableName.includes(comparableCandidate);
    });
    return { key: course?.id ?? name, name: course?.name ?? name, sourceUrl: course?.sourceUrl, meetings: combineMeetings(week.filter((item) => item.course === name)) };
  });
  const unscheduled = courses
    .filter((course) => !scheduled.some((entry) => entry.key === course.id))
    .map((course) => ({ key: course.id, name: course.name, sourceUrl: course.sourceUrl, meetings: [] as WeekItem[] }));
  const classes = [...scheduled, ...unscheduled];

  return (
    <section className="portal-feature-view classes-view" aria-label={`Classes: ${classes.length} classes and course spaces`}>
      <div className="classes-grid" role="list">
        {classes.map((course) => (
          <article className="class-box" role="listitem" key={course.key}>
            <p>Class</p><h2>{course.name}</h2>
            <div className="class-meetings">
              {course.meetings.length ? course.meetings.map((meeting) => (
                <div key={`${meeting.day}-${meeting.time}`}><strong>{meeting.day}</strong><time>{meeting.time}</time><small>{meeting.note}</small></div>
              )) : <div className="class-time-missing"><strong>Canvas course</strong><small>Meeting time is not listed.</small></div>}
            </div>
            {course.sourceUrl ? <a href={course.sourceUrl} target="_blank" rel="noreferrer">Open Class in Canvas <span aria-hidden="true">→</span></a> : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function CourseGradebookView({ course, assignments, loading, error }: {
  course: Course;
  assignments: CourseGradeItem[];
  loading: boolean;
  error: string | null;
}) {
  return (
    <section className="course-gradebook-view" aria-label={`${course.name} gradebook`}>
      <header className="gradebook-hero">
        <span aria-hidden="true">{course.score === null ? "—" : `${course.score.toFixed(course.score % 1 ? 1 : 0)}%`}</span>
        <div><p>Canvas gradebook</p><h1>{course.name}</h1><small>{course.grade || (course.score === null ? "No overall grade yet" : "Current course score")}</small></div>
      </header>
      <div className="gradebook-column-key" aria-hidden="true"><span>Assignment</span><span>Progress</span></div>
      {loading ? <div className="gradebook-state" role="status"><i aria-hidden="true" /><p>Loading class work from Canvas…</p></div> : null}
      {error ? <div className="gradebook-state is-error" role="alert"><strong>Class work could not be loaded.</strong><p>{error}</p></div> : null}
      {!loading && !error && !assignments.length ? <div className="gradebook-state"><strong>No assignments are available yet.</strong></div> : null}
      <div className="gradebook-assignment-list">
        {assignments.map((assignment) => (
          <a className="gradebook-assignment-card" href={assignment.sourceUrl} target="_blank" rel="noreferrer" key={assignment.id}>
            <div className="gradebook-card-top"><h2>{assignment.name}</h2><span className={`gradebook-status status-${assignment.status.toLocaleLowerCase("en-US").replace(/\s+/g, "-")}`}>{assignment.status}</span></div>
            <dl>
              <div><dt>Due</dt><dd>{formatDate(assignment.dueAt)}</dd></div>
              <div><dt>Submitted</dt><dd>{assignment.submittedAt ? formatInboxDate(assignment.submittedAt) : "Not submitted"}</dd></div>
            </dl>
            <div className="gradebook-score-row">
              <span>Score</span>
              <strong>{assignment.grade || (assignment.score === null ? "—" : `${assignment.score}${assignment.pointsPossible === null ? "" : ` / ${assignment.pointsPossible}`}`)}</strong>
              <i aria-hidden="true">›</i>
            </div>
          </a>
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

function PostBoardView({ board, posts, loading, error, onNewPost }: {
  board: PostBoard;
  posts: FamilyPost[];
  loading: boolean;
  error: string | null;
  onNewPost: () => void;
}) {
  const title = board === "inspiration" ? "Inspiration" : "Resources";
  const description = board === "inspiration" ? "Ideas, videos, and sparks worth remembering" : "Useful lessons, links, and learning tools";
  return (
    <section className="portal-feature-view post-board-view" aria-label={`${title}: ${description}`}>
      <div className="post-board-list" role="feed" aria-busy={loading}>
        {loading ? <div className="post-board-state" role="status"><i aria-hidden="true" /><p>Loading {title.toLocaleLowerCase("en-US")}…</p></div> : null}
        {error ? <div className="post-board-state is-error" role="alert"><strong>{title} could not be loaded.</strong><p>{error}</p></div> : null}
        {!loading && !error && !posts.length ? <div className="post-board-state"><span aria-hidden="true">✦</span><strong>Start the {title} board.</strong><p>Add the first idea, video, or useful link.</p></div> : null}
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

function formatAudioTime(milliseconds: number) {
  const seconds = Math.max(0, Math.round(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function ChatAudioPlayer({ url, durationMs }: { url: string; durationMs: number | null }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const bars = [9, 18, 27, 14, 32, 22, 12, 25, 36, 19, 29, 14, 23, 34, 17, 27, 12, 31, 21, 10, 26, 35, 18, 28, 13, 22, 30, 16];
  return <div className="chat-audio-player">
    <button type="button" onClick={() => { const audio = audioRef.current; if (!audio) return; if (audio.paused) void audio.play(); else audio.pause(); }} aria-label={playing ? "Pause audio message" : "Play audio message"}><span aria-hidden="true">{playing ? "Ⅱ" : "▶"}</span></button>
    <div className="chat-audio-waveform" aria-hidden="true">
      {bars.map((height, index) => <i className={index / bars.length <= progress ? "is-lit" : ""} style={{ height }} key={`${height}-${index}`} />)}
    </div>
    <small>{formatAudioTime(durationMs ?? 0)}</small>
    <audio ref={audioRef} src={appPath(url)} preload="metadata" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); setProgress(0); }} onTimeUpdate={(event) => setProgress(event.currentTarget.duration ? event.currentTarget.currentTime / event.currentTarget.duration : 0)} />
  </div>;
}

function ChatView({ messages, viewer, loading, olderLoading, hasMore, error, onLoadOlder, onSend, onEdit, onDelete, onSeen }: {
  messages: ChatMessage[];
  viewer: DashboardData["viewer"];
  loading: boolean;
  olderLoading: boolean;
  hasMore: boolean;
  error: string | null;
  onLoadOlder: () => Promise<void>;
  onSend: (body: string, audio?: Blob, durationMs?: number) => Promise<void>;
  onEdit: (id: string, body: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onSeen: (ids: string[]) => Promise<void>;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const preserveHeightRef = useRef<number | null>(null);
  const previousLatestIdRef = useRef<string | null>(null);
  const seenSentRef = useRef(new Set<string>());
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState("");
  const [openActionsId, setOpenActionsId] = useState<string | null>(null);
  const [changingId, setChangingId] = useState<string | null>(null);
  const [recorderOpen, setRecorderOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordedAudio, setRecordedAudio] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [recordedDuration, setRecordedDuration] = useState(0);
  const [recordingError, setRecordingError] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingStartedRef = useRef(0);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const firstMessageId = messages[0]?.id ?? null;
  const latestMessageId = messages.at(-1)?.id ?? null;

  useEffect(() => () => {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    recorderRef.current?.stream.getTracks().forEach((track) => track.stop());
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
  }, [recordedUrl]);

  function clearRecording() {
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedAudio(null); setRecordedUrl(null); setRecordedDuration(0); setRecordingError("");
  }

  async function startRecording() {
    clearRecording();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = createCompatibleAudioRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        setRecordedAudio(blob); setRecordedUrl(URL.createObjectURL(blob)); setRecordedDuration(Date.now() - recordingStartedRef.current);
        stream.getTracks().forEach((track) => track.stop());
      };
      recorderRef.current = recorder; recordingStartedRef.current = Date.now();
      setRecordedDuration(0); setRecording(true); recorder.start();
      recordingTimerRef.current = setInterval(() => setRecordedDuration(Date.now() - recordingStartedRef.current), 250);
    } catch { setRecordingError("Microphone access is needed to record an audio message."); }
  }

  function stopRecording() {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    recordingTimerRef.current = null; setRecording(false); recorderRef.current?.stop();
  }

  useLayoutEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll || loading) return;
    if (preserveHeightRef.current !== null) {
      scroll.scrollTop += scroll.scrollHeight - preserveHeightRef.current;
      preserveHeightRef.current = null;
      return;
    }
    if (previousLatestIdRef.current === null || (latestMessageId !== previousLatestIdRef.current && scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 180)) {
      scroll.scrollTop = scroll.scrollHeight;
    }
    previousLatestIdRef.current = latestMessageId;
  }, [firstMessageId, latestMessageId, loading, messages.length]);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root || loading) return;
    const observer = new IntersectionObserver((entries) => {
      const visibleIds: string[] = [];
      for (const entry of entries) {
        if (!entry.isIntersecting || entry.intersectionRatio < 0.35 || document.visibilityState !== "visible") continue;
        const id = (entry.target as HTMLElement).dataset.chatMessageId;
        if (!id || seenSentRef.current.has(id)) continue;
        const message = messages.find((item) => item.id === id);
        if (message?.seenBy.some((person) => person.username === viewer.username)) {
          seenSentRef.current.add(id);
          observer.unobserve(entry.target);
          continue;
        }
        seenSentRef.current.add(id);
        visibleIds.push(id);
        observer.unobserve(entry.target);
      }
      if (visibleIds.length) void onSeen(visibleIds).catch(() => visibleIds.forEach((id) => seenSentRef.current.delete(id)));
    }, { root, threshold: 0.35 });
    root.querySelectorAll<HTMLElement>("[data-chat-message-id]").forEach((message) => observer.observe(message));
    return () => observer.disconnect();
  }, [loading, messages, onSeen, viewer.username]);

  async function loadOlder() {
    const scroll = scrollRef.current;
    if (!scroll || olderLoading || !hasMore) return;
    preserveHeightRef.current = scroll.scrollHeight;
    await onLoadOlder();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if ((!draft.trim() && !recordedAudio) || sending) return;
    setSending(true);
    try {
      await onSend(draft, recordedAudio ?? undefined, recordedDuration || undefined);
      setDraft("");
      clearRecording(); setRecorderOpen(false);
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
    <section className="portal-feature-view chat-view" aria-label="Private family Chat: the newest 15 messages appear first">
      <div className="chat-message-scroll" ref={scrollRef} onScroll={(event) => { if (event.currentTarget.scrollTop < 24) void loadOlder(); }}>
        {error ? <div className="chat-error" role="alert">{error}</div> : null}
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
              <article className={`chat-message${mine ? " is-mine" : ""}${message.audio ? " has-audio" : ""} ${girl ? "tone-girl" : "tone-boy"} chat-tilt-${Number(message.id) % 5}`} data-chat-message-id={message.id} key={message.id}>
                {mine ? <button className="chat-profile-square chat-message-menu-trigger" type="button" aria-label={`Show actions for ${message.author.name}'s message`} aria-expanded={openActionsId === message.id} onClick={() => setOpenActionsId((current) => current === message.id ? null : message.id)}>{profileContents}</button> : <span className="chat-profile-square" aria-hidden="true">{profileContents}</span>}
                {mine && openActionsId === message.id && editingId !== message.id ? <div className="chat-profile-actions" role="menu" aria-label="Message actions"><button type="button" role="menuitem" onClick={() => { setEditingId(message.id); setEditingBody(message.body); setOpenActionsId(null); }}>Edit</button><button type="button" role="menuitem" onClick={() => { setOpenActionsId(null); void remove(message.id); }} disabled={changingId === message.id}>Delete</button></div> : null}
                <div className="chat-bubble">
                  <header>{mine ? <><time dateTime={message.createdAt}>{formatInboxDate(message.createdAt)}</time><strong>{message.author.name}</strong></> : <><strong>{message.author.name}</strong><time dateTime={message.createdAt}>{formatInboxDate(message.createdAt)}</time></>}</header>
                  {editingId === message.id ? (
                    <div className="chat-edit-form">
                      <textarea value={editingBody} onChange={(event) => setEditingBody(event.target.value)} maxLength={2000} rows={3} aria-label="Edit family chat message" />
                      <div><button type="button" onClick={() => void saveEdit(message.id)} disabled={changingId === message.id}>Save</button><button type="button" onClick={() => { setEditingId(null); setEditingBody(""); }} disabled={changingId === message.id}>Cancel</button></div>
                    </div>
                  ) : <>{message.body ? <ChatMessageBody body={message.body} /> : null}</>}
                  <footer>
                    {edited ? <small>Edited</small> : <span />}
                  </footer>
                  {message.audio ? <ChatAudioPlayer url={message.audio.url} durationMs={message.audio.durationMs} /> : null}
                </div>
                <div className={`chat-seen-row${message.seenBy.length ? "" : " is-empty"}`} aria-label={message.seenBy.length ? `Seen by ${message.seenBy.map((person) => person.name).join(", ")}` : undefined}>
                  <span>{message.seenBy.length ? "SEEN:" : ""}</span>
                  {message.seenBy.map((person) => {
                    const photo = familyProfilePhoto[person.username];
                    return <i key={person.username} title={person.name}>{photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={appPath(photo)} alt={person.name} />
                    ) : person.name.slice(0, 1).toUpperCase()}</i>;
                  })}
                </div>
              </article>
            );
          })}
        </div>
      </div>

      <form className="chat-composer" onSubmit={(event) => void submit(event)}>
        <div className="chat-compose-field">
          <textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => {
            if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }} maxLength={2000} rows={2} placeholder="" aria-label={`Message the family as ${viewer.displayName}`} />
          {recordedAudio ? <button className="chat-attachment-indicator" type="button" onClick={() => setRecorderOpen(true)} aria-label="Audio attached; review recording"><span aria-hidden="true">📎</span></button> : null}
        </div>
        <button className="chat-send-button" type="submit" disabled={sending || (!draft.trim() && !recordedAudio)} aria-label="Send family chat message">{sending ? "…" : "➤"}</button>
        <button className="chat-record-button" type="button" onClick={() => setRecorderOpen(true)} aria-label="Record an audio message"><span className="audio-wave-icon" aria-hidden="true"><i /><i /><i /><i /><i /></span></button>
      </form>
      {recorderOpen ? <div className="chat-recorder-backdrop">
        <button className="modal-backdrop-dismiss" type="button" onClick={() => { if (recording) stopRecording(); setRecorderOpen(false); }} aria-label="Close audio recorder" />
        <section className="chat-recorder" role="dialog" aria-modal="true" aria-labelledby="chat-recorder-title">
          <button className="chat-recorder-close" type="button" onClick={() => { if (recording) stopRecording(); setRecorderOpen(false); }} aria-label="Close audio recorder">×</button>
          <span className={`chat-recorder-icon${recording ? " is-recording" : ""}`} aria-hidden="true">♪</span>
          <h2 id="chat-recorder-title">Audio message</h2>
          <p>{recording ? "Recording…" : recordedAudio ? "Listen before you attach it." : "Tap record and speak your message."}</p>
          <strong className="chat-recorder-time">{formatAudioTime(recordedDuration)}</strong>
          {recordedUrl ? <audio className="chat-recorder-preview" src={recordedUrl} controls /> : null}
          {recordingError ? <div className="chat-error" role="alert">{recordingError}</div> : null}
          <div className="chat-recorder-actions">
            {!recording && !recordedAudio ? <button type="button" onClick={() => void startRecording()}>Record</button> : null}
            {recording ? <button className="is-stop" type="button" onClick={stopRecording}>Stop</button> : null}
            {recordedAudio ? <><button type="button" onClick={() => void startRecording()}>Record again</button><button className="is-attach" type="button" onClick={() => setRecorderOpen(false)}>Attach audio</button></> : null}
          </div>
        </section>
      </div> : null}
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

function AdminView({ courses, settings, grades, loading, error, onSave }: {
  courses: Course[];
  settings: DashboardPreferences;
  grades: GradeOverride[];
  loading: boolean;
  error: string | null;
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

  const toggleRows: Array<{ key: keyof DashboardPreferences; title: string; detail: string; ariaLabel: string }> = [
    { key: "showAnnouncements", title: "Announcements", detail: "Show the entire Announcements section on the Home page.", ariaLabel: "Announcements: show on Home page" },
    { key: "showDueTodayWhenEmpty", title: "Due Today", detail: "Show the Due Today card even when it has zero items.", ariaLabel: "Due Today: show when empty" },
    { key: "showDueTomorrowWhenEmpty", title: "Due Tomorrow", detail: "Show the Due Tomorrow card even when it has zero items.", ariaLabel: "Due Tomorrow: show when empty" },
    { key: "showDueWeekWhenEmpty", title: "This Week", detail: "Show the This Week card even when it has zero items.", ariaLabel: "This Week: show when empty" },
  ];

  return (
    <section className="portal-feature-view admin-view" aria-label="Admin: grades and dashboard display">
      <form className="admin-form" onSubmit={(event) => void save(event)}>
        {loading ? <div className="admin-state" role="status"><i aria-hidden="true" /><p>Loading dashboard settings…</p></div> : null}
        <section className="admin-section">
          <header><p>Dashboard display</p><h2>Home page sections</h2></header>
          <div className="admin-toggle-list">
            {toggleRows.map((row) => (
              <label className="admin-toggle" key={row.key}>
                <span><strong>{row.title}</strong><small>{row.detail}</small></span>
                <input type="checkbox" checked={draftSettings[row.key]} onChange={(event) => setDraftSettings((current) => ({ ...current, [row.key]: event.target.checked }))} aria-label={row.ariaLabel} />
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

function InboxThreadModal({ thread, onClose, onThreadChange }: { thread: InboxThread; onClose: () => void; onThreadChange: (thread: InboxThread) => void }) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const replyRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [reply, setReply] = useState("");
  const [replyFiles, setReplyFiles] = useState<File[]>([]);
  const [replyOpen, setReplyOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [recorderOpen, setRecorderOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordedAudio, setRecordedAudio] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [recordedDuration, setRecordedDuration] = useState(0);
  const [recordingError, setRecordingError] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingStartedRef = useRef(0);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function clearRecording() {
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedAudio(null); setRecordedUrl(null); setRecordedDuration(0); setRecordingError("");
  }

  async function startRecording() {
    clearRecording();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = createCompatibleAudioRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        setRecordedAudio(blob); setRecordedUrl(URL.createObjectURL(blob)); setRecordedDuration(Date.now() - recordingStartedRef.current);
        stream.getTracks().forEach((track) => track.stop());
      };
      recorderRef.current = recorder; recordingStartedRef.current = Date.now();
      setRecording(true); setRecordedDuration(0); recorder.start();
      recordingTimerRef.current = setInterval(() => setRecordedDuration(Date.now() - recordingStartedRef.current), 250);
    } catch { setRecordingError("Microphone access is needed to record an audio attachment."); }
  }

  function stopRecording() {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    recordingTimerRef.current = null; setRecording(false); recorderRef.current?.stop();
  }

  function attachRecording() {
    if (!recordedAudio) return;
    const extension = recordedAudio.type.includes("mp4") ? "m4a" : recordedAudio.type.includes("ogg") ? "ogg" : "webm";
    setReplyFiles((files) => [...files.filter((file) => !file.name.startsWith("audio-message-")), new File([recordedAudio], `audio-message-${Date.now()}.${extension}`, { type: recordedAudio.type })].slice(0, 4));
    setRecorderOpen(false);
  }

  const sendReply = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const bodyText = reply.trim();
    if ((!bodyText && !replyFiles.length) || sending) return;
    setSending(true);
    setReplyError(null);
    try {
      const form = new FormData();
      form.append("conversationId", thread.id);
      form.append("body", bodyText);
      for (const file of replyFiles) form.append("attachments", file, file.name);
      const response = await fetch(appPath("/api/inbox"), {
        method: "POST",
        credentials: "same-origin",
        body: form,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Your reply could not be sent to Canvas.");
      onThreadChange(body.thread);
      setReply("");
      setReplyFiles([]);
      setReplyOpen(false);
      if (fileRef.current) fileRef.current.value = "";
      requestAnimationFrame(() => replyRef.current?.focus());
    } catch (caught) {
      setReplyError(caught instanceof Error ? caught.message : "Your reply could not be sent to Canvas.");
    } finally {
      setSending(false);
    }
  };

  const replyingTo = thread.participants.find((person) => person.id !== thread.currentUserId) ?? thread.participants[0] ?? null;

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
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      recorderRef.current?.stream.getTracks().forEach((track) => track.stop());
      if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    };
  }, [onClose, recordedUrl]);

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
            <article className={`inbox-thread-message${message.isOwn ? " is-own" : ""}`} key={message.id}>
              {message.isOwn ? <time className="inbox-message-date-bar" dateTime={message.createdAt ?? undefined}>{formatInboxDate(message.createdAt)}</time> : null}
              <InboxAvatar person={message.author} label="Canvas" />
              <div>
                <header><strong>{message.author?.name || (message.generated ? "Canvas" : "Unknown sender")}</strong>{!message.isOwn ? <time dateTime={message.createdAt ?? undefined}>{formatInboxDate(message.createdAt)}</time> : null}</header>
                <p>{message.body}</p>
                {message.attachments.filter((attachment) => attachment.url && attachment.contentType?.startsWith("image/")).length ? (
                  <div className="inbox-inline-images">
                    {message.attachments.filter((attachment) => attachment.url && attachment.contentType?.startsWith("image/")).map((attachment) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <a href={attachment.url!} target="_blank" rel="noreferrer" key={`image-${attachment.id}`}><img src={attachment.url!} alt={attachment.name} /></a>
                    ))}
                  </div>
                ) : null}
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
          <button className="inbox-reply-launch" type="button" onClick={() => setReplyOpen(true)}>Reply</button>
          <button className="inbox-thread-close" type="button" onClick={onClose} ref={closeButtonRef}>Close</button>
        </footer>
      </section>
      {replyOpen ? <div className="inbox-compose-backdrop">
        <button className="modal-backdrop-dismiss" type="button" onClick={() => setReplyOpen(false)} aria-label="Close reply composer" />
        <section className="inbox-compose-modal" role="dialog" aria-modal="true" aria-labelledby="inbox-compose-title">
          <button className="inbox-thread-x" type="button" onClick={() => setReplyOpen(false)} aria-label="Close reply composer">×</button>
          <div className="inbox-replying-to"><InboxAvatar person={replyingTo} label="Canvas" /><div><span>Replying to</span><strong id="inbox-compose-title">{replyingTo?.name || "Canvas conversation"}</strong><small>{thread.subject}</small></div></div>
          <form className="inbox-reply-form" onSubmit={sendReply}>
            <textarea id="canvas-thread-reply" ref={replyRef} value={reply} onChange={(event) => setReply(event.target.value)} maxLength={10000} placeholder="Type your reply…" disabled={sending} autoFocus />
            <div className="inbox-compose-tools">
              <label className="inbox-attach-button" htmlFor="canvas-reply-files">📎 Attach files</label>
              <button className="inbox-record-button" type="button" onClick={() => setRecorderOpen(true)}>▥ Record audio</button>
            </div>
            <input className="inbox-file-input" id="canvas-reply-files" ref={fileRef} type="file" multiple accept="image/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv" onChange={(event) => setReplyFiles(Array.from(event.target.files ?? []).slice(0, 4))} />
            {replyFiles.length ? <div className="inbox-selected-files">{replyFiles.map((file, index) => <div key={`${file.name}-${file.lastModified}`}>
              {file.type.startsWith("image/") ? <img src={URL.createObjectURL(file)} alt="" /> : <span>{file.type.startsWith("audio/") ? "🔊" : "📄"}</span>}
              <strong>{file.name}</strong><button type="button" aria-label={`Remove ${file.name}`} onClick={() => setReplyFiles((files) => files.filter((_, fileIndex) => fileIndex !== index))}>×</button>
            </div>)}</div> : null}
            {replyError ? <p className="inbox-reply-error" role="alert">{replyError}</p> : null}
            <button className="inbox-reply-send" type="submit" disabled={(!reply.trim() && !replyFiles.length) || sending}>{sending ? "Sending…" : "Send reply"}</button>
          </form>
        </section>
      </div> : null}
      {recorderOpen ? <div className="chat-recorder-backdrop inbox-audio-recorder">
        <button className="modal-backdrop-dismiss" type="button" onClick={() => { if (recording) stopRecording(); setRecorderOpen(false); }} aria-label="Close audio recorder" />
        <section className="chat-recorder" role="dialog" aria-modal="true" aria-labelledby="inbox-recorder-title">
          <button className="chat-recorder-close" type="button" onClick={() => { if (recording) stopRecording(); setRecorderOpen(false); }} aria-label="Close audio recorder">×</button>
          <span className={`chat-recorder-icon${recording ? " is-recording" : ""}`} aria-hidden="true">▥</span>
          <h2 id="inbox-recorder-title">Audio attachment</h2>
          <p>{recording ? "Recording…" : recordedAudio ? "Listen before attaching it." : "Tap record and speak your reply."}</p>
          <strong className="chat-recorder-time">{formatAudioTime(recordedDuration)}</strong>
          {recordedUrl ? <audio className="chat-recorder-preview" src={recordedUrl} controls /> : null}
          {recordingError ? <div className="chat-error" role="alert">{recordingError}</div> : null}
          <div className="chat-recorder-actions">
            {!recording && !recordedAudio ? <button type="button" onClick={() => void startRecording()}>Record</button> : null}
            {recording ? <button className="is-stop" type="button" onClick={stopRecording}>Stop</button> : null}
            {recordedAudio ? <><button type="button" onClick={() => void startRecording()}>Record again</button><button className="is-attach" type="button" onClick={attachRecording}>Attach audio</button></> : null}
          </div>
        </section>
      </div> : null}
    </div>
  );
}

function assignmentCourseLabel(course: string) {
  const normalized = course.toLocaleLowerCase("en-US");
  if (normalized.includes("hsva") || normalized.includes("orientation")) return "HSVA";
  if (normalized.includes("world history") || normalized.includes("history")) return "History";
  if (normalized.includes("algebra")) return "Algebra";
  if (normalized.includes("english")) return "English";
  if (normalized.includes("biology")) return "Biology";
  return course.trim().split(/\s+/)[0] || "Canvas";
}

function AssignmentTeacher({ item }: { item: ActionItem }) {
  return <span className="assignment-teacher">
    <span className="assignment-teacher-photo">
      {item.authorAvatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.authorAvatarUrl} alt={item.authorName || "Teacher"} referrerPolicy="no-referrer" />
      ) : <strong aria-hidden="true">{(item.authorName || item.course || "T").slice(0, 1).toUpperCase()}</strong>}
    </span>
    <small>{assignmentCourseLabel(item.course)}</small>
  </span>;
}

function ActionList({ items, empty, onSelectAssignment, onPlayAssignment }: { items: ActionItem[]; empty: string; onSelectAssignment: (item: ActionItem) => void; onPlayAssignment: (item: ActionItem) => void }) {
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
          {item.kind === "assignment" ? <AssignmentTeacher item={item} /> : <span className={`action-icon action-tone-${(index % 4) + 1}`} aria-hidden="true">M</span>}
          <span className="action-copy"><strong>{item.title}</strong>{item.kind === "assignment" ? <small>{item.authorName || "Teacher"}</small> : <small>{item.course}</small>}</span>
          <span className="action-due">{item.kind === "message" ? "Unread" : formatDate(item.dueAt)}</span>
          <span className="action-arrow" aria-hidden="true">›</span>
        </>;
        return item.kind === "assignment" ? (
          <div className="action-assignment-row" key={item.id}>
            <button className="action-item" type="button" onClick={() => onSelectAssignment(item)} aria-label={`View details for ${item.title}`}>{content}</button>
            {item.audioUrl ? <button className="assignment-audio-play" type="button" onClick={() => onPlayAssignment(item)} aria-label={`Play ${item.title}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}<img src={appPath("/assignment-details-play.webp")} alt="" aria-hidden="true" />
            </button> : null}
          </div>
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

function MobileDueCard({ title, items, empty, onSelectAssignment, onPlayAssignment, featured = false, banner = "/due-today-banner.webp", tone = "week", summary = `${items.length} ${items.length === 1 ? "ITEM" : "ITEMS"} DUE` }: { title: string; items: ActionItem[]; empty: string; onSelectAssignment: (item: ActionItem) => void; onPlayAssignment: (item: ActionItem) => void; featured?: boolean; banner?: string; tone?: "today" | "tomorrow" | "week"; summary?: string }) {
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
          {items.map((item) => {
            return (
              <div className="mobile-due-row" key={item.id}>
                <button className="mobile-due-details" type="button" onClick={() => onSelectAssignment(item)} aria-label={`View details for ${item.title}`}>
                  <AssignmentTeacher item={item} />
                  <span>{tone === "week" ? <em className="week-item-due"><b>Due:</b> {thisWeekDueLabel(item.dueAt)}</em> : null}<strong>{item.title}</strong><small>{item.authorName || "Teacher"}</small></span>
                  {!item.audioUrl ? <i aria-hidden="true">›</i> : null}
                </button>
                {item.audioUrl ? <button className="assignment-audio-play" type="button" onClick={() => onPlayAssignment(item)} aria-label={`Play ${item.title}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}<img src={appPath("/assignment-details-play.webp")} alt="" aria-hidden="true" />
                </button> : null}
              </div>
            );
          })}
        </div>
      ) : featured ? null : <p className="mobile-due-empty">{empty}</p>}
    </section>
  );
}

function AnnouncementStack({ items, onSelect }: { items: ActionItem[]; onSelect: (item: ActionItem) => void }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playerItem, setPlayerItem] = useState<ActionItem | null>(null);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(0);
  const courseLabel = (course: string) => {
    const normalized = course.toLocaleLowerCase("en-US");
    if (normalized.includes("hsva") || normalized.includes("orientation")) return "HSVA";
    if (normalized.includes("world history") || normalized.includes("history")) return "History";
    if (normalized.includes("algebra")) return "Algebra";
    if (normalized.includes("english")) return "English";
    if (normalized.includes("biology")) return "Biology";
    return course.trim().split(/\s+/)[0] || "Canvas";
  };

  const closePlayer = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    audioRef.current = null;
    setPlayerItem(null);
    setPlaying(false);
    setElapsed(0);
    setDuration(0);
  }, []);

  const openPlayer = useCallback((item: ActionItem) => {
    if (!item.audioUrl) return;
    if (audioRef.current) audioRef.current.pause();
    const audio = new Audio(appPath(item.audioUrl));
    audioRef.current = audio;
    setPlayerItem(item);
    setElapsed(0);
    setDuration(0);
    setPlaying(true);
    audio.onloadedmetadata = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    audio.ontimeupdate = () => {
      setElapsed(audio.currentTime);
      if (Number.isFinite(audio.duration)) setDuration(audio.duration);
    };
    audio.onplay = () => setPlaying(true);
    audio.onpause = () => setPlaying(false);
    audio.onended = () => setPlaying(false);
    audio.onerror = () => setPlaying(false);
    void audio.play().catch(() => setPlaying(false));
  }, []);

  const togglePlayback = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play().catch(() => setPlaying(false));
    else audio.pause();
  }, []);

  useEffect(() => () => {
    audioRef.current?.pause();
    audioRef.current = null;
  }, []);

  const audioTime = (seconds: number) => {
    const safe = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
    return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
  };
  const progress = duration > 0 ? Math.min(1, elapsed / duration) : 0;

  return (
    <section className="dashboard-announcements" aria-labelledby="dashboard-announcements-title">
      <h2 className="visually-hidden" id="dashboard-announcements-title">Announcements</h2>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="announcements-title-art" src={appPath("/announcements-title.png")} alt="Announcements" />
      <div className="announcement-card-list">
        {items.map((item) => (
          <article className="announcement-card" key={item.id}>
            <span className="announcement-teacher">
              <span className="announcement-teacher-photo" aria-label={item.authorName ? `Teacher: ${item.authorName}` : "Teacher"}>
                {item.authorAvatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.authorAvatarUrl} alt={item.authorName || "Teacher"} referrerPolicy="no-referrer" />
                ) : <strong aria-hidden="true">{(item.authorName || "Teacher").slice(0, 1).toUpperCase()}</strong>}
              </span>
              <small>{courseLabel(item.course)}</small>
            </span>
            <time className="announcement-card-date" dateTime={item.dueAt ?? undefined}>{item.dueAt ? formatDate(item.dueAt) : "Date unavailable"}</time>
            <div className="announcement-card-actions" aria-label={`Actions for ${item.title}`}>
              <button type="button" className="announcement-action-view" onClick={() => onSelect(item)} aria-label={`View ${item.title}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={appPath("/announcement-view.png")} alt="View" />
              </button>
              {item.audioUrl ? <button type="button" className="announcement-action-listen" aria-label={`Listen to ${item.title}`} onClick={() => openPlayer(item)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={appPath("/announcement-listen.png")} alt="Listen" />
              </button> : null}
            </div>
          </article>
        ))}
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="announcements-section-underline" src={appPath("/announcements-underline.png")} alt="" aria-hidden="true" />
      {playerItem ? <div className="announcement-player-layer">
        <button className="announcement-player-backdrop" type="button" onClick={closePlayer} aria-label="Close announcement player" />
        <section className="announcement-player" role="dialog" aria-modal="true" aria-labelledby="announcement-player-title">
          <div className="announcement-player-teacher">
            {playerItem.authorAvatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={playerItem.authorAvatarUrl} alt={playerItem.authorName || "Teacher"} referrerPolicy="no-referrer" />
            ) : <strong aria-hidden="true">{(playerItem.authorName || "Teacher").slice(0, 1).toUpperCase()}</strong>}
          </div>
          <p className="announcement-player-teacher-name">{playerItem.authorName || "Teacher"}</p>
          <p className="announcement-player-subject">{playerItem.course}</p>
          <h2 id="announcement-player-title">{playerItem.title}</h2>
          <div className="announcement-player-time" aria-live="off"><strong>{audioTime(elapsed)}</strong><span>/</span><strong>{audioTime(duration)}</strong></div>
          <div className="announcement-player-controls">
            <button type="button" className="announcement-player-toggle" onClick={togglePlayback} aria-label={playing ? "Pause announcement" : "Play announcement"}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={appPath(playing ? "/assignment-details-pause.webp" : "/assignment-details-play.webp")} alt="" aria-hidden="true" />
            </button>
            <div className="announcement-wave" style={{ "--announcement-progress": progress } as CSSProperties}>
              {Array.from({ length: 42 }, (_, index) => <i key={index} style={{ height: `${28 + ((index * 17) % 66)}%` }} />)}
              <input type="range" min="0" max={duration || 0} step="0.1" value={Math.min(elapsed, duration || 0)} onChange={(event) => {
                const audio = audioRef.current;
                if (!audio) return;
                const nextTime = Number(event.target.value);
                audio.currentTime = nextTime;
                setElapsed(nextTime);
              }} aria-label={`Seek through ${playerItem.title}`} disabled={!duration} />
            </div>
          </div>
          <button className="announcement-player-done" type="button" onClick={closePlayer} aria-label="OK, I got it">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={appPath("/announcement-got-it.webp")} alt="OK, I got it" />
          </button>
        </section>
      </div> : null}
    </section>
  );
}

function AssignmentAudioPlayer({ item, onClose }: { item: ActionItem; onClose: () => void }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    if (!item.audioUrl) return;
    const audio = new Audio(appPath(item.audioUrl));
    audioRef.current = audio;
    audio.onloadedmetadata = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    audio.ontimeupdate = () => { setElapsed(audio.currentTime); if (Number.isFinite(audio.duration)) setDuration(audio.duration); };
    audio.onplay = () => setPlaying(true);
    audio.onpause = () => setPlaying(false);
    audio.onended = () => setPlaying(false);
    audio.onerror = () => setPlaying(false);
    void audio.play().catch(() => setPlaying(false));
    return () => { audio.pause(); audio.currentTime = 0; audioRef.current = null; };
  }, [item.audioUrl]);

  const closePlayer = () => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; }
    onClose();
  };
  const audioTime = (seconds: number) => {
    const safe = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
    return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
  };
  const progress = duration > 0 ? Math.min(1, elapsed / duration) : 0;

  return <div className="announcement-player-layer assignment-player-layer">
    <button className="announcement-player-backdrop" type="button" onClick={closePlayer} aria-label="Close assignment player" />
    <section className="announcement-player" role="dialog" aria-modal="true" aria-labelledby="assignment-player-title">
      <div className="announcement-player-teacher">
        {item.authorAvatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.authorAvatarUrl} alt={item.authorName || "Teacher"} referrerPolicy="no-referrer" />
        ) : <strong aria-hidden="true">{(item.authorName || "Teacher").slice(0, 1).toUpperCase()}</strong>}
      </div>
      <p className="announcement-player-teacher-name">{item.authorName || "Teacher"}</p>
      <p className="announcement-player-subject">{item.course}</p>
      <h2 id="assignment-player-title">{item.title}</h2>
      <div className="announcement-player-time" aria-live="off"><strong>{audioTime(elapsed)}</strong><span>/</span><strong>{audioTime(duration)}</strong></div>
      <div className="announcement-player-controls">
        <button type="button" className="announcement-player-toggle" onClick={() => { const audio = audioRef.current; if (!audio) return; if (audio.paused) void audio.play().catch(() => setPlaying(false)); else audio.pause(); }} aria-label={playing ? "Pause assignment" : "Play assignment"}>
          {/* eslint-disable-next-line @next/next/no-img-element */}<img src={appPath(playing ? "/assignment-details-pause.webp" : "/assignment-details-play.webp")} alt="" aria-hidden="true" />
        </button>
        <div className="announcement-wave" style={{ "--announcement-progress": progress } as CSSProperties}>
          {Array.from({ length: 42 }, (_, index) => <i key={index} style={{ height: `${28 + ((index * 17) % 66)}%` }} />)}
          <input type="range" min="0" max={duration || 0} step="0.1" value={Math.min(elapsed, duration || 0)} onChange={(event) => { const audio = audioRef.current; if (!audio) return; const nextTime = Number(event.target.value); audio.currentTime = nextTime; setElapsed(nextTime); }} aria-label={`Seek through ${item.title}`} disabled={!duration} />
        </div>
      </div>
      <button className="announcement-player-done" type="button" onClick={closePlayer} aria-label="OK, I got it">
        {/* eslint-disable-next-line @next/next/no-img-element */}<img src={appPath("/announcement-got-it.webp")} alt="OK, I got it" />
      </button>
    </section>
  </div>;
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

type ActiveView = "dashboard" | "inbox" | "classes" | "grades" | "chat" | "admin" | PostBoard;

const mobileMenuItems: Array<{ label: string; image: string; action?: Exclude<ActiveView, "dashboard"> }> = [
  { label: "To-Do List", image: "/menu-todo.webp" },
  { label: "Inbox", image: "/menu-inbox.webp", action: "inbox" },
  { label: "Chat", image: "/menu-chat.webp", action: "chat" },
  { label: "Notes", image: "/menu-notes.webp" },
  { label: "Classes", image: "/menu-classes.webp", action: "classes" },
  { label: "Calendar", image: "/menu-calendar.webp" },
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

function artworkForCourse(courseName: string) {
  const name = comparableCourseName(courseName);
  if (name.includes("biology") && name.includes("garcia")) return gradeArtwork[0];
  if (name.includes("biology") && name.includes("baier")) return gradeArtwork[1];
  if (name.includes("algebra")) return gradeArtwork[2];
  if (name.includes("english")) return gradeArtwork[3];
  if (name.includes("hsva") || name.includes("orientation")) return gradeArtwork[4];
  if (name.includes("history")) return gradeArtwork[5];
  return gradeArtwork[0];
}

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
const gradeAnimationRank: Record<string, number> = { A: 5, B: 4, C: 3, D: 2, F: 1 };

export function DashboardHome({ immersive = false, onExit }: DashboardHomeProps = {}) {
  const appRef = useRef<HTMLElement>(null);
  const mobileMenuLayerRef = useRef<HTMLDivElement>(null);
  const mobileMenuPanelRef = useRef<HTMLDivElement>(null);
  const homeContentRef = useRef<HTMLDivElement>(null);
  const featureViewRef = useRef<HTMLDivElement>(null);
  const gradesShowcaseRef = useRef<HTMLElement>(null);
  const [data, setData] = useState<DashboardData | null>(null);
  const hasDashboardData = Boolean(data);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [focusMode, setFocusMode] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeView, setActiveView] = useState<ActiveView>("dashboard");
  const [selectedGradeCourse, setSelectedGradeCourse] = useState<Course | null>(null);
  const [courseGradeItems, setCourseGradeItems] = useState<CourseGradeItem[]>([]);
  const [courseGradesLoading, setCourseGradesLoading] = useState(false);
  const [courseGradesError, setCourseGradesError] = useState<string | null>(null);
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
  const [dashboardPreferences, setDashboardPreferences] = useState<DashboardPreferences>({ showAnnouncements: true, showDueTodayWhenEmpty: true, showDueTomorrowWhenEmpty: true, showDueWeekWhenEmpty: true });
  const [dashboardPreferencesLoaded, setDashboardPreferencesLoaded] = useState(false);
  const [gradeOverrides, setGradeOverrides] = useState<GradeOverride[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [greetingIndex] = useState(() => Math.floor(Math.random() * familyGreetings.length));
  const [selectedAction, setSelectedAction] = useState<ActionItem | null>(null);
  const [assignmentPlayerItem, setAssignmentPlayerItem] = useState<ActionItem | null>(null);
  const [assignmentDetailLoading, setAssignmentDetailLoading] = useState(false);
  const [assignmentDetailError, setAssignmentDetailError] = useState<string | null>(null);
  const closeAssignment = useCallback(() => {
    setSelectedAction(null);
    setAssignmentDetailLoading(false);
    setAssignmentDetailError(null);
  }, []);
  const closeThread = useCallback(() => setSelectedThread(null), []);
  const closeComposer = useCallback(() => setComposerBoard(null), []);

  const openAssignment = useCallback(async (item: ActionItem) => {
    setSelectedAction(item);
    setAssignmentDetailError(null);
    if (item.kind === "message" || !item.canvasCourseId || !item.canvasItemId || !item.canvasItemType) return;

    setAssignmentDetailLoading(true);
    try {
      const response = await fetch(
        appPath(`/api/assignment-details?course_id=${encodeURIComponent(item.canvasCourseId)}&item_id=${encodeURIComponent(item.canvasItemId)}&item_type=${encodeURIComponent(item.canvasItemType)}`),
        { cache: "no-store", credentials: "same-origin" }
      );
      const body = await response.json();
      if (response.status === 401) {
        if (onExit) onExit();
        else window.location.replace(appPath("/"));
        return;
      }
      if (!response.ok) throw new Error(body.error || "Canvas could not load this assignment.");
      setSelectedAction((current) => {
        if (current?.id !== item.id) return current;
        const mergedInstructions = mergeCanvasInstructions(
          current.descriptionHtml,
          current.description,
          body.item.descriptionHtml ?? "",
          body.item.description ?? ""
        );
        return { ...current, ...body.item, ...mergedInstructions };
      });
    } catch (caught) {
      setAssignmentDetailError(caught instanceof Error ? caught.message : "Canvas could not load this assignment.");
    } finally {
      setAssignmentDetailLoading(false);
    }
  }, [onExit]);

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

  const sendChatMessage = useCallback(async (message: string, audio?: Blob, durationMs?: number) => {
    setChatError(null);
    const payload = new FormData();
    payload.set("body", message);
    if (audio) payload.set("audio", audio, `family-audio.${audio.type.includes("mp4") ? "m4a" : "webm"}`);
    if (durationMs) payload.set("durationMs", String(durationMs));
    const response = await fetch(appPath("/api/chat"), {
      method: "POST", credentials: "same-origin", body: payload,
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

  const markChatSeen = useCallback(async (ids: string[]) => {
    if (!ids.length) return;
    const response = await fetch(appPath("/api/chat"), {
      method: "PUT", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }),
    });
    if (!response.ok) throw new Error("Seen status could not be saved.");
    const body = await response.json();
    setChatMessages((current) => {
      let changed = false;
      const next = current.map((message) => {
        const receipt = (body.seen ?? []).find((item: { messageId: string }) => item.messageId === message.id);
        if (!receipt || message.seenBy.some((person) => person.username === receipt.user.username)) return message;
        changed = true;
        return { ...message, seenBy: [...message.seenBy, receipt.user] };
      });
      return changed ? next : current;
    });
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
      setDashboardPreferencesLoaded(true);
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
      try {
        const response = await fetch(appPath("/api/chat"), { cache: "no-store", credentials: "same-origin" });
        if (!response.ok) return;
        const body = await response.json();
        if (body.messages?.length) {
          setChatMessages((current) => mergeChatRefresh(current, body.messages));
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
      const missingAudio = (body.announcements ?? []).filter((item: ActionItem) => !item.audioUrl && item.canvasCourseId && item.canvasItemId && item.description.trim());
      for (const item of missingAudio) {
        void fetch(appPath("/api/announcements/audio"), {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            courseId: item.canvasCourseId,
            itemId: item.canvasItemId,
            title: item.title,
            course: item.course,
            authorName: item.authorName,
            description: item.description,
          }),
        }).then(async (audioResponse) => {
          if (!audioResponse.ok) return;
          const audioBody = await audioResponse.json() as { audioUrl?: string };
          if (!audioBody.audioUrl) return;
          setData((current) => current ? { ...current, announcements: current.announcements.map((announcement) => announcement.id === item.id ? { ...announcement, audioUrl: audioBody.audioUrl! } : announcement) } : current);
        }).catch(() => { /* A later dashboard refresh will retry missing audio. */ });
      }
      const assignmentCandidates = [...(body.critical ?? []), ...(body.upcoming ?? [])] as ActionItem[];
      const missingAssignmentAudio = Array.from(new Map(assignmentCandidates.map((item) => [item.id, item])).values())
        .filter((item) => item.kind === "assignment" && !item.audioUrl && item.canvasCourseId && item.canvasItemId && item.description.trim());
      for (const item of missingAssignmentAudio) {
        void fetch(appPath("/api/assignments/audio"), {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ courseId: item.canvasCourseId, itemId: item.canvasItemId, title: item.title, authorName: item.authorName, description: item.description }),
        }).then(async (audioResponse) => {
          if (!audioResponse.ok) return;
          const audioBody = await audioResponse.json() as { audioUrl?: string };
          if (!audioBody.audioUrl) return;
          const addAudio = (assignment: ActionItem) => assignment.id === item.id ? { ...assignment, audioUrl: audioBody.audioUrl! } : assignment;
          setData((current) => current ? { ...current, critical: current.critical.map(addAudio), upcoming: current.upcoming.map(addAudio) } : current);
        }).catch(() => { /* A later dashboard refresh will retry missing assignment audio. */ });
      }
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

  const openCourseGradebook = useCallback(async (course: Course) => {
    setSelectedGradeCourse(course);
    setCourseGradeItems([]);
    setCourseGradesError(null);
    setCourseGradesLoading(true);
    transitionToView("grades");
    try {
      const response = await fetch(appPath(`/api/course-grades?course_id=${encodeURIComponent(course.id)}`), { cache: "no-store", credentials: "same-origin" });
      const body = await response.json();
      if (response.status === 401) {
        if (onExit) onExit();
        else window.location.replace(appPath("/"));
        return;
      }
      if (!response.ok) throw new Error(body.error || "Canvas grades could not be loaded.");
      setCourseGradeItems(body.assignments ?? []);
    } catch (caught) {
      setCourseGradesError(caught instanceof Error ? caught.message : "Canvas grades could not be loaded.");
    } finally {
      setCourseGradesLoading(false);
    }
  }, [onExit, transitionToView]);

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
  }, [activeView, adminLoading, chatLoading, postBoardLoading, postsByBoard]);

  useLayoutEffect(() => {
    if (activeView !== "dashboard") return;
    const section = homeContentRef.current?.querySelector<HTMLElement>(".dashboard-announcements");
    if (!section) return;
    const title = section.querySelector<HTMLElement>(".announcements-title-art");
    const cards = Array.from(section.querySelectorAll<HTMLElement>(".announcement-card"));
    const underline = section.querySelector<HTMLElement>(".announcements-section-underline");
    if (!title || !underline) return;

    gsap.set(title, { autoAlpha: 0, scale: 0.2, y: -8, transformOrigin: "50% 50%" });
    gsap.set(cards, { autoAlpha: 0, y: -10 });
    gsap.set(underline, { autoAlpha: 0, y: -10, scaleX: 0.65, transformOrigin: "50% 50%" });
    let animation: gsap.core.Timeline | null = null;
    const play = () => {
      animation?.kill();
      animation = gsap.timeline({ delay: 0.5 })
        .to(title, { autoAlpha: 1, scale: 1, y: 0, duration: 0.9, ease: "elastic.out(1.18, 0.34)" })
        .to(cards, { autoAlpha: 1, y: 0, duration: 0.5, stagger: 0.2, ease: "power2.out" }, ">-0.05")
        .to(underline, { autoAlpha: 1, y: 0, scaleX: 1, duration: 0.5, ease: "power2.out" }, ">");
    };

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      play();
    }, { threshold: 0.2 });
    observer.observe(section);

    return () => {
      observer.disconnect();
      animation?.kill();
      gsap.killTweensOf([title, ...cards, underline]);
      gsap.set([title, ...cards, underline], { clearProps: "all" });
    };
  }, [activeView, dashboardPreferences.showAnnouncements, dashboardPreferencesLoaded, hasDashboardData]);

  useLayoutEffect(() => {
    const showcase = gradesShowcaseRef.current;
    if (activeView !== "dashboard" || !showcase) return;
    const values = Array.from(showcase.querySelectorAll<HTMLElement>(".grade-artwork-value"));
    if (!values.length) return;

    const scrollRoot = showcase.closest<HTMLElement>(".school-workspace");
    const observerTargets = new Map<HTMLElement, HTMLElement>();
    values.forEach((value) => {
      observerTargets.set(value.closest<HTMLElement>(".grade-artwork-card") ?? value, value);
    });

    const visible = new Set<HTMLElement>();
    const pending = new Set<HTMLElement>();
    const entranceMotion = new Map<HTMLElement, gsap.core.Animation>();
    const persistentMotion = new Map<HTMLElement, gsap.core.Animation>();
    let batchTimer: number | null = null;
    let visibilityFrame: number | null = null;

    const gradeParts = (value: HTMLElement) => ({
      letter: value.querySelector<HTMLElement>(".grade-artwork-letter"),
      motion: value.querySelector<HTMLElement>(".grade-artwork-letter-motion"),
      percentage: value.querySelector<HTMLElement>(".grade-artwork-percentage"),
    });

    const resetValue = (value: HTMLElement) => {
      const { letter, motion, percentage } = gradeParts(value);
      const targets = [value, letter, motion, percentage].filter((target): target is HTMLElement => Boolean(target));
      entranceMotion.get(value)?.kill();
      entranceMotion.delete(value);
      persistentMotion.get(value)?.kill();
      persistentMotion.delete(value);
      value.removeAttribute("data-grade-active");
      gsap.killTweensOf(targets);
      gsap.set(value, { autoAlpha: 0 });
      if (letter) gsap.set(letter, { autoAlpha: 0, scale: 0.001, x: 0, xPercent: -50, yPercent: -50, rotation: -2, transformOrigin: "50% 58%" });
      if (motion) gsap.set(motion, { autoAlpha: 1, scale: 1, rotation: 0 });
      if (percentage) gsap.set(percentage, { autoAlpha: 0, scale: 0.001, x: 0, rotation: -4, transformOrigin: "50% 50%" });
    };

    const startPersistentMotion = (value: HTMLElement, motion: HTMLElement) => {
      if (!visible.has(value) || value.dataset.gradeActive !== "true") return;
      persistentMotion.get(value)?.kill();
      if (value.dataset.grade === "D") {
        persistentMotion.set(value, gsap.to(motion, {
          scale: 1.26,
          duration: 1.05,
          repeat: -1,
          yoyo: true,
          ease: "sine.inOut",
          transformOrigin: "50% 58%",
        }));
      } else if (value.dataset.grade === "F") {
        persistentMotion.set(value, gsap.timeline({ repeat: -1, repeatDelay: 0.65 })
          .to(motion, { rotation: "+=360", duration: 1.35, ease: "power2.inOut", transformOrigin: "50% 58%" }, 0)
          .to(motion, { autoAlpha: 0.06, duration: 0.08, repeat: 7, yoyo: true, ease: "none" }, 0.08)
          .set(motion, { autoAlpha: 1 }));
      }
    };

    const revealValue = (value: HTMLElement, order: number) => {
      const { letter, motion, percentage } = gradeParts(value);
      if (!letter || !motion || !percentage || !visible.has(value)) return;
      entranceMotion.get(value)?.kill();
      persistentMotion.get(value)?.kill();
      entranceMotion.delete(value);
      persistentMotion.delete(value);
      gsap.killTweensOf([value, letter, motion, percentage]);
      gsap.set(value, { autoAlpha: 1, perspective: 900 });
      gsap.set(motion, { autoAlpha: 1, scale: 1, rotation: 0, transformOrigin: "50% 58%" });
      value.dataset.gradeActive = "true";
      const gradeTimeline = gsap.timeline({
        delay: order * 0.14,
        onComplete: () => {
          entranceMotion.delete(value);
          startPersistentMotion(value, motion);
        },
      })
        .fromTo(letter,
          { autoAlpha: 0, scale: 0.001, x: 0, xPercent: -50, yPercent: -50, rotation: -2, force3D: true },
          { autoAlpha: 1, scale: 1, x: 0, xPercent: -50, yPercent: -50, rotation: -2, duration: 1.35, ease: "elastic.out(1.25, 0.24)", force3D: true }, 0)
        .fromTo(percentage,
          { autoAlpha: 0, scale: 0.001, x: 0, rotation: -4, force3D: true },
          { autoAlpha: 1, scale: 1, x: 0, rotation: -4, duration: 0.95, ease: "elastic.out(1.15, 0.3)", force3D: true }, 0.2);
      entranceMotion.set(value, gradeTimeline);
    };

    const flushPending = () => {
      batchTimer = null;
      const ordered = Array.from(pending)
        .filter((value) => visible.has(value))
        .sort((a, b) => Number(b.dataset.gradeRank ?? 0) - Number(a.dataset.gradeRank ?? 0));
      pending.clear();
      ordered.forEach(revealValue);
    };

    const checkVisibility = () => {
      const visualViewport = window.visualViewport;
      const viewportTop = visualViewport?.offsetTop ?? 0;
      const viewportHeight = visualViewport?.height
        ?? document.documentElement.clientHeight
        ?? window.innerHeight;
      const viewportBottom = viewportTop + viewportHeight;
      const scrollBounds = scrollRoot?.getBoundingClientRect();
      const rootTop = Math.max(scrollBounds?.top ?? viewportTop, viewportTop);
      const rootBottom = Math.min(scrollBounds?.bottom ?? viewportBottom, viewportBottom);
      observerTargets.forEach((value, target) => {
        const rect = target.getBoundingClientRect();
        const triggerTop = rect.top + rect.height * 0.34;
        const triggerBottom = rect.top + rect.height * 0.7;
        const triggerHeight = Math.max(triggerBottom - triggerTop, 1);
        const visibleHeight = Math.min(triggerBottom, rootBottom) - Math.max(triggerTop, rootTop);
        const isOnScreen = visibleHeight >= Math.min(triggerHeight * 0.35, 40);
        if (isOnScreen) {
          if (!visible.has(value)) {
            visible.add(value);
            pending.add(value);
          }
        } else {
          visible.delete(value);
          pending.delete(value);
          resetValue(value);
        }
      });
      if (pending.size && batchTimer === null) batchTimer = window.setTimeout(flushPending, 40);
    };

    const runScheduledVisibilityCheck = () => {
      visibilityFrame = null;
      checkVisibility();
    };

    const scheduleVisibilityCheck = () => {
      if (visibilityFrame !== null) return;
      visibilityFrame = window.requestAnimationFrame(runScheduledVisibilityCheck);
    };

    values.forEach(resetValue);
    scrollRoot?.addEventListener("scroll", scheduleVisibilityCheck, { passive: true });
    window.addEventListener("scroll", scheduleVisibilityCheck, { passive: true });
    document.addEventListener("scroll", scheduleVisibilityCheck, { passive: true, capture: true });
    window.addEventListener("resize", scheduleVisibilityCheck);
    window.addEventListener("orientationchange", scheduleVisibilityCheck);
    window.visualViewport?.addEventListener("scroll", scheduleVisibilityCheck);
    window.visualViewport?.addEventListener("resize", scheduleVisibilityCheck);
    const visibilityPoll = window.setInterval(checkVisibility, 240);
    checkVisibility();
    return () => {
      scrollRoot?.removeEventListener("scroll", scheduleVisibilityCheck);
      window.removeEventListener("scroll", scheduleVisibilityCheck);
      document.removeEventListener("scroll", scheduleVisibilityCheck, true);
      window.removeEventListener("resize", scheduleVisibilityCheck);
      window.removeEventListener("orientationchange", scheduleVisibilityCheck);
      window.visualViewport?.removeEventListener("scroll", scheduleVisibilityCheck);
      window.visualViewport?.removeEventListener("resize", scheduleVisibilityCheck);
      window.clearInterval(visibilityPoll);
      if (visibilityFrame !== null) window.cancelAnimationFrame(visibilityFrame);
      if (batchTimer !== null) window.clearTimeout(batchTimer);
      values.forEach(resetValue);
    };
  }, [activeView, gradeOverrides, hasDashboardData]);

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
  }, [hasDashboardData, immersive]);

  async function signOut() {
    await fetch(appPath("/api/auth/logout"), { method: "POST", credentials: "same-origin" });
    if (onExit) onExit();
    else window.location.assign(appPath("/"));
  }

  function closeApp() {
    setMobileMenuOpen(false);
    const androidBridge = (window as Window & { BeauSchoolApp?: { close?: () => void } }).BeauSchoolApp;
    if (typeof androidBridge?.close === "function") {
      androidBridge.close();
      return;
    }
    window.location.href = "beauschool://close";
    window.setTimeout(() => {
      if (!document.hidden) window.close();
    }, 150);
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
  const gradeCards = data.courses.map((course) => {
    const manualGrade = gradeOverrides.find((entry) => entry.courseKey === String(course.id));
    const displayCourse = manualGrade
      ? { ...course, score: manualGrade.percentage, grade: letterGrade(manualGrade.percentage) }
      : course;
    return { course: displayCourse, artwork: artworkForCourse(course.name), percentage: displayCourse.score };
  }).sort((a, b) => {
    if (a.percentage === null && b.percentage === null) return a.course.name.localeCompare(b.course.name);
    if (a.percentage === null) return 1;
    if (b.percentage === null) return -1;
    return b.percentage - a.percentage || a.course.name.localeCompare(b.course.name);
  });
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
          <button className="mobile-close-button" type="button" onClick={closeApp} aria-label="Close school app">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={appPath("/logout-button.webp")} alt="" aria-hidden="true" />
          </button>
        </div>
        <div className="mobile-menu-layer" ref={mobileMenuLayerRef} aria-hidden={!mobileMenuOpen}>
          <button className="mobile-menu-backdrop" type="button" onClick={() => setMobileMenuOpen(false)} aria-label="Close school menu" tabIndex={mobileMenuOpen ? 0 : -1} />
          <div className="mobile-school-menu" id="mobile-school-menu" ref={mobileMenuPanelRef} role="menu" aria-label="School menu options">
            <button className="mobile-menu-action mobile-menu-close-action" type="button" role="menuitem" onClick={() => setMobileMenuOpen(false)} tabIndex={mobileMenuOpen ? 0 : -1}>
              Close
            </button>
            {mobileMenuItems.map((item) => (
              <button className="mobile-menu-option" type="button" role="menuitem" key={item.label} onClick={() => chooseMobileMenuItem(item.action)} tabIndex={mobileMenuOpen ? 0 : -1}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={appPath(item.image)} alt={item.label} />
              </button>
            ))}
            <button className="mobile-menu-action mobile-menu-logout-action" type="button" role="menuitem" onClick={() => void signOut()} tabIndex={mobileMenuOpen ? 0 : -1}>
              Log Out
            </button>
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
            <MobileDueCard title="Due today" items={dueToday} empty="Nothing is due today." onSelectAssignment={openAssignment} onPlayAssignment={setAssignmentPlayerItem} featured tone="today" summary={todaySummary} />
          </div> : null}
          {dashboardPreferencesLoaded && dashboardPreferences.showAnnouncements ? <AnnouncementStack items={data.announcements ?? []} onSelect={openAssignment} /> : null}
          {dueTomorrow.length || dashboardPreferences.showDueTomorrowWhenEmpty ? <div className="tomorrow-featured-slot due-featured-slot" aria-label="Assignments due tomorrow">
            <MobileDueCard title="Due tomorrow" items={dueTomorrow} empty="Nothing is due tomorrow." onSelectAssignment={openAssignment} onPlayAssignment={setAssignmentPlayerItem} featured banner="/due-tomorrow-banner.webp" tone="tomorrow" summary={tomorrowSummary} />
          </div> : null}
          {dueThisWeek.length || dashboardPreferences.showDueWeekWhenEmpty ? <div className="week-featured-slot due-featured-slot" aria-label="Assignments due this week">
            <MobileDueCard title="Due this week" items={dueThisWeek} empty="Nothing else is due this week." onSelectAssignment={openAssignment} onPlayAssignment={setAssignmentPlayerItem} featured banner="/this-week-banner.webp" tone="week" summary={weekSummary} />
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
          {!allClear ? <ActionList items={data.critical} empty="Nothing needs attention." onSelectAssignment={openAssignment} onPlayAssignment={setAssignmentPlayerItem} /> : null}
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

        <section className="grades-showcase" aria-label="Grades by class" ref={gradesShowcaseRef}>
          {/* Supplied artwork keeps the future letter-grade and percentage spaces open. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="grades-banner" src={appPath("/grades-banner.webp")} alt="Grades" />
          <div className="grade-artwork-grid">
            {gradeCards.map(({ course, artwork: item, percentage }) => {
              const calculatedLetter = percentage === null ? null : letterGrade(percentage);
              return <button className="grade-artwork-card" type="button" key={course.id} aria-label={`Open ${course.name} gradebook`} onClick={() => void openCourseGradebook(course)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={appPath(item.image)} alt={course.name} />
                {percentage !== null && calculatedLetter ? <div className={`grade-artwork-value grade-tone-${calculatedLetter.toLowerCase()}`} data-grade={calculatedLetter} data-grade-rank={gradeAnimationRank[calculatedLetter]}><strong className="grade-artwork-letter"><span className="grade-artwork-letter-motion">{calculatedLetter}</span></strong><span className="grade-artwork-percentage">{percentage.toFixed(percentage % 1 ? 1 : 0)}</span></div> : null}
              </button>;
            })}
          </div>
        </section>
        </div>
        ) : (
          <div className="feature-view-shell" ref={featureViewRef}>
            <FeatureBackBar onBack={returnToDashboard} />
            {activeView === "grades" && selectedGradeCourse ? <CourseGradebookView course={selectedGradeCourse} assignments={courseGradeItems} loading={courseGradesLoading} error={courseGradesError} /> : activeView === "inbox" ? <InboxView
              conversations={inboxConversations}
              courses={data.courses}
              loading={inboxLoading}
              error={inboxError}
              threadLoadingId={threadLoadingId}
              onRead={(conversation) => void openThread(conversation)}
              onSent={() => void loadInbox()}
            /> : activeView === "classes" ? <ClassesView courses={data.courses} week={data.week} /> : activeView === "chat" ? <ChatView
              messages={chatMessages}
              viewer={data.viewer}
              loading={chatLoading}
              olderLoading={chatOlderLoading}
              hasMore={chatHasMore}
              error={chatError}
              onLoadOlder={loadOlderChat}
              onSend={sendChatMessage}
              onEdit={editChatMessage}
              onDelete={deleteChatMessage}
              onSeen={markChatSeen}
            /> : activeView === "admin" ? <AdminView
              key={`admin-${adminLoading}-${dashboardPreferences.showAnnouncements}-${dashboardPreferences.showDueTodayWhenEmpty}-${dashboardPreferences.showDueTomorrowWhenEmpty}-${dashboardPreferences.showDueWeekWhenEmpty}-${gradeOverrides.map((grade) => `${grade.courseKey}:${grade.percentage}`).join("|")}`}
              courses={data.courses}
              settings={dashboardPreferences}
              grades={gradeOverrides}
              loading={adminLoading}
              error={adminError}
              onSave={saveAdmin}
            /> : activeView === "inspiration" || activeView === "resources" ? <PostBoardView
              board={activeView}
              posts={postsByBoard[activeView]}
              loading={postBoardLoading}
              error={postBoardError}
              onNewPost={() => setComposerBoard(activeView)}
            /> : null}
          </div>
        )}
      </section>
      {selectedAction ? <AssignmentModal item={selectedAction} loading={assignmentDetailLoading} loadError={assignmentDetailError} onClose={closeAssignment} /> : null}
      {assignmentPlayerItem ? <AssignmentAudioPlayer item={assignmentPlayerItem} onClose={() => setAssignmentPlayerItem(null)} /> : null}
      {selectedThread ? <InboxThreadModal thread={selectedThread} onClose={closeThread} onThreadChange={setSelectedThread} /> : null}
      {composerBoard ? <PostComposerModal board={composerBoard} onClose={closeComposer} onSubmit={(payload) => createPost(composerBoard, payload)} /> : null}
    </main>
  );
}
