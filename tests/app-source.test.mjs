import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("dashboard contains the priority due-date surfaces", async () => {
  const dashboard = await readFile(new URL("app/dashboard/DashboardHome.tsx", root), "utf8");
  const dashboardRoute = await readFile(new URL("app/api/dashboard/route.ts", root), "utf8");
  assert.match(dashboard, /Critical information/);
  assert.match(dashboard, /Due tomorrow/);
  assert.match(dashboard, /This week/);
  assert.match(dashboard, /grades-banner\.webp/);
  assert.doesNotMatch(dashboard, /Courses &amp; grades/);
  assert.match(dashboardRoute, /canvasGetWithFallback/);
  assert.match(dashboardRoute, /optionalCanvasGet/);
});

test("Canvas token routes remain server-only", async () => {
  const form = await readFile(new URL("app/CanvasConnectionForm.tsx", root), "utf8");
  const vault = await readFile(new URL("lib/canvas-vault.ts", root), "utf8");
  const client = await readFile(new URL("lib/canvas-client.ts", root), "utf8");
  assert.match(form, /type={showToken \? "text" : "password"}/);
  assert.doesNotMatch(form, /localStorage|sessionStorage/);
  assert.match(vault, /AES-GCM/);
  assert.match(client, /"User-Agent": CANVAS_USER_AGENT/);
});

test("announcement narration encrypts the xAI key and reuses R2 recordings", async () => {
  const form = await readFile(new URL("app/XaiConnectionForm.tsx", root), "utf8");
  const connectionRoute = await readFile(new URL("app/api/xai/connection/route.ts", root), "utf8");
  const audioRoute = await readFile(new URL("app/api/announcements/audio/route.ts", root), "utf8");
  const dashboard = await readFile(new URL("app/dashboard/DashboardHome.tsx", root), "utf8");
  assert.match(form, /type="password"/);
  assert.doesNotMatch(form, /localStorage|sessionStorage/);
  assert.match(connectionRoute, /encryptServerSecret/);
  assert.match(connectionRoute, /\/v1\/tts\/voices/);
  assert.match(audioRoute, /voice_id: voice/);
  assert.match(audioRoute, /maleTeachers\.has\(name\).*"lux"/s);
  assert.match(audioRoute, /femaleTeachers\.has\(name\).*"luna"/s);
  assert.match(audioRoute, /await bucket\.head\(key\)/);
  assert.match(audioRoute, /announcements\/v4\/\$\{courseId\}\/\$\{itemId\}\.mp3/);
  assert.match(audioRoute, /announcements\/v3\/\$\{courseId\}\/\$\{itemId\}\.mp3/);
  assert.match(audioRoute, /await bucket\.delete/);
  assert.match(audioRoute, /const speech = `\$\{title\}\. \$\{description\}`/);
  assert.doesNotMatch(audioRoute, /const speech = `[^`]*(?:course|authorName)/);
  assert.match(dashboard, /item\.audioUrl \?/);
  assert.match(dashboard, /announcement-player-layer/);
  assert.match(dashboard, /OK, I got it/);
  assert.match(dashboard, /type="range"/);
});

test("assignment narration is generated once and only then shows Play", async () => {
  const audioRoute = await readFile(new URL("app/api/assignments/audio/route.ts", root), "utf8");
  const dashboardRoute = await readFile(new URL("app/api/dashboard/route.ts", root), "utf8");
  const dashboard = await readFile(new URL("app/dashboard/DashboardHome.tsx", root), "utf8");
  assert.match(audioRoute, /assignments\/v1\/\$\{courseId\}\/\$\{itemId\}\.mp3/);
  assert.match(audioRoute, /await bucket\.head\(key\)/);
  assert.match(audioRoute, /const speech = `\$\{title\}\. \$\{description\}`/);
  assert.match(audioRoute, /maleTeachers\.has\(name\).*"lux"/s);
  assert.match(audioRoute, /femaleTeachers\.has\(name\).*"luna"/s);
  assert.match(dashboardRoute, /assignments\/v1/);
  assert.match(dashboard, /item\.audioUrl \? <button className="assignment-audio-play"/);
  assert.match(dashboard, /\/api\/assignments\/audio/);
  assert.match(dashboard, /function AssignmentAudioPlayer/);
});

test("hosted Canvas requests use the protected BeauVizenor relay", async () => {
  const client = await readFile(new URL("lib/canvas-client.ts", root), "utf8");

  assert.match(client, /CANVAS_RELAY_BASE_URL = "https:\/\/beauvizenor\.com\/school-canvas-relay"/);
  assert.match(client, /getAppEnv\(\)\.BEAU_PROXY_ACCESS_KEY\?\.trim\(\)/);
  assert.match(client, /relayKey \? `\$\{CANVAS_RELAY_BASE_URL\}\$\{path\}` : `\$\{CANVAS_BASE_URL\}\$\{path\}`/);
  assert.match(client, /"X-Beau-Relay-Key": destination\.relayKey/);
  assert.match(client, /"X-Beau-Canvas-Authorization": `Bearer \$\{token\.trim\(\)\}`/);
  assert.match(client, /: \{ Authorization: `Bearer \$\{token\.trim\(\)\}` \}/);
  assert.match(client, /"User-Agent": CANVAS_USER_AGENT/);
  assert.doesNotMatch(client, /[?&](?:relay_key|access_key)=/i);
});

test("production Canvas APIs require the BeauVizenor proxy secret", async () => {
  const requestAuth = await readFile(new URL("lib/request-auth.ts", root), "utf8");
  const config = await readFile(new URL("next.config.ts", root), "utf8");
  assert.match(requestAuth, /x-beau-proxy-key/);
  assert.match(requestAuth, /BEAU_PROXY_ACCESS_KEY/);
  assert.match(config, /basePath:\s*"\/school"/);
});

test("internal navigation stays under the school base path", async () => {
  const form = await readFile(new URL("app/CanvasConnectionForm.tsx", root), "utf8");
  const dashboard = await readFile(new URL("app/dashboard/DashboardHome.tsx", root), "utf8");
  assert.match(form, /<a className="primary-link" href={appPath\("\/dashboard"\)}/);
  assert.match(dashboard, /href: appPath\("\/settings"\)/);
  assert.doesNotMatch(form, /href="\/dashboard"/);
  assert.doesNotMatch(form, /next\/link/);
});

test("family login uses server-side sessions and never commits PIN values", async () => {
  const auth = await readFile(new URL("lib/family-auth.ts", root), "utf8");
  const login = await readFile(new URL("app/FamilyLogin.tsx", root), "utf8");
  const dashboardRoute = await readFile(new URL("app/api/dashboard/route.ts", root), "utf8");
  const source = `${auth}\n${login}`;

  assert.match(auth, /HttpOnly; SameSite=Lax/);
  assert.match(auth, /MAX_LOGIN_ATTEMPTS = 5/);
  assert.match(auth, /FAMILY_AUTH_USERS/);
  assert.match(login, /const pinDigits = \["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"\]/);
  assert.match(login, /if \(nextPin\.length === 4\) void verifyPin/);
  assert.doesNotMatch(login, /<input/);
  assert.match(dashboardRoute, /readFamilySession/);
  assert.doesNotMatch(source, /pinHash\s*:\s*["'][^"']+/);
  assert.doesNotMatch(login, /value=["']\d{4}["']/);
  assert.doesNotMatch(source, /localStorage|sessionStorage/);
});

test("successful login changes scenes without navigating away from the school URL", async () => {
  const login = await readFile(new URL("app/FamilyLogin.tsx", root), "utf8");
  const dashboard = await readFile(new URL("app/dashboard/DashboardHome.tsx", root), "utf8");
  const styles = await readFile(new URL("app/globals.css", root), "utf8");

  assert.match(login, /gsap\.to\(card/);
  assert.match(login, /setView\("dashboard"\)/);
  assert.match(login, /<DashboardHome immersive onExit={returnToLogin}/);
  assert.doesNotMatch(login, /window\.location\.(?:assign|replace)\(appPath\("\/dashboard"\)\)/);
  assert.match(dashboard, /className={`school-app\$\{immersive \? " immersive-dashboard"/);
  assert.match(styles, /\.school-portal-shell\.dashboard-active/);
  assert.match(styles, /\.school-app\.immersive-dashboard/);
});

test("mobile red X closes the Android wrapper while the menu keeps Log Out", async () => {
  const dashboard = await readFile(new URL("app/dashboard/DashboardHome.tsx", root), "utf8");
  assert.match(dashboard, /BeauSchoolApp/);
  assert.match(dashboard, /beauschool:\/\/close/);
  assert.match(dashboard, /mobile-menu-logout-action[^>]*[\s\S]*?Log Out/);
  assert.match(dashboard, /async function signOut\(\)[\s\S]*?\/api\/auth\/logout/);
  const closeStart = dashboard.indexOf("function closeApp()");
  const closeEnd = dashboard.indexOf("if (!data && loading)", closeStart);
  assert.ok(closeStart >= 0 && closeEnd > closeStart);
  assert.doesNotMatch(dashboard.slice(closeStart, closeEnd), /logout|signOut/i);
});

test("login artwork uses lightweight WebP assets", async () => {
  const login = await readFile(new URL("app/FamilyLogin.tsx", root), "utf8");
  const styles = await readFile(new URL("app/globals.css", root), "utf8");
  const desktop = await stat(new URL("public/login-desktop.webp", root));
  const mobile = await stat(new URL("public/login-mobile.webp", root));

  assert.match(login, /login-mobile\.webp/);
  assert.match(login, /beau-profile\.webp/);
  assert.match(styles, /login-desktop\.webp/);
  assert.doesNotMatch(`${login}\n${styles}`, /login-(?:desktop|mobile)\.png/);
  assert.ok(desktop.size < 150_000);
  assert.ok(mobile.size < 200_000);
});

test("mobile dashboard uses the compact action bar and due-date sections", async () => {
  const dashboard = await readFile(new URL("app/dashboard/DashboardHome.tsx", root), "utf8");
  const styles = await readFile(new URL("app/globals.css", root), "utf8");
  const layout = await readFile(new URL("app/layout.tsx", root), "utf8");
  const menuArtwork = await stat(new URL("public/menu-button.webp", root));
  const mobileMenuArtwork = await Promise.all([
    "menu-todo.webp",
    "menu-classes.webp",
    "menu-inbox.webp",
    "menu-calendar.webp",
    "menu-notes.webp",
    "menu-chat.webp",
    "menu-inspiration.webp",
    "menu-resources.webp",
    "menu-stats.webp",
    "menu-admin.webp",
  ].map((file) => stat(new URL(`public/${file}`, root))));
  const gradeArtwork = await Promise.all([
    "grades-banner.webp",
    "grade-biology-garcia.webp",
    "grade-biology-baier.webp",
    "grade-algebra.webp",
    "grade-english.webp",
    "grade-hsva.webp",
    "grade-history.webp",
  ].map((file) => stat(new URL(`public/${file}`, root))));
  const logoutArtwork = await stat(new URL("public/logout-button.webp", root));
  const dueCountArtwork = await stat(new URL("public/due-count-web.webp", root));
  const dueTodayArtwork = await stat(new URL("public/due-today-banner.webp", root));
  const dueTomorrowArtwork = await stat(new URL("public/due-tomorrow-banner.webp", root));
  const thisWeekArtwork = await stat(new URL("public/this-week-banner.webp", root));
  const menuPopupArtwork = await stat(new URL("public/menu-popup-bg.webp", root));
  const seeInCanvasArtwork = await stat(new URL("public/see-in-canvas.webp", root));
  const assignmentDetailsPlayArtwork = await stat(new URL("public/assignment-details-play.webp", root));
  const futureAssignmentPlaybackArtwork = await Promise.all([
    "assignment-details-pause.webp",
    "assignment-details-stop.webp",
  ].map((file) => stat(new URL(`public/${file}`, root))));
  const panelPatterns = await Promise.all(Array.from({ length: 5 }, (_, index) => stat(new URL(`public/panel-pattern-${index + 1}.webp`, root))));

  assert.match(dashboard, /mobile-dashboard-bar/);
  assert.match(dashboard, /mobile-family-greeting/);
  assert.match(dashboard, /Oh hey, \$\{name\}!/);
  assert.match(dashboard, /Look, it’s \$\{name\}!/);
  assert.match(dashboard, /menu-button\.webp/);
  assert.match(dashboard, /logout-button\.webp/);
  assert.match(dashboard, /announcement-got-it\.webp/);
  assert.doesNotMatch(dashboard, /announcement-got-it\.png/);
  assert.match(dashboard, /due-count-web\.webp/);
  assert.ok(dueCountArtwork.size < 20_000);
  assert.doesNotMatch(dashboard, /mobile-sync-button|sync-button\.webp|className="sync-button"/);
  assert.match(dashboard, /AUTO_REFRESH_MS = 7 \* 60 \* 1000/);
  assert.match(dashboard, /window\.setInterval\(\(\) => void sync\(\), AUTO_REFRESH_MS\)/);
  assert.doesNotMatch(dashboard, /className="sync-loader"/);
  assert.match(layout, /Schoolbell/);
  assert.match(layout, /rel="preload" as="image" href="\/school\/menu-todo\.webp"/);
  assert.match(layout, /rel="preload" as="image" href="\/school\/menu-classes\.webp"/);
  assert.match(layout, /rel="preload" as="image" href="\/school\/menu-inbox\.webp"/);
  assert.match(layout, /rel="preload" as="image" href="\/school\/menu-calendar\.webp"/);
  assert.match(layout, /rel="preload" as="image" href="\/school\/menu-notes\.webp"/);
  assert.match(layout, /rel="preload" as="image" href="\/school\/menu-chat\.webp"/);
  assert.match(layout, /rel="preload" as="image" href="\/school\/menu-inspiration\.webp"/);
  assert.match(layout, /rel="preload" as="image" href="\/school\/menu-resources\.webp"/);
  assert.match(layout, /rel="preload" as="image" href="\/school\/menu-stats\.webp"/);
  assert.match(layout, /rel="preload" as="image" href="\/school\/menu-admin\.webp"/);
  assert.match(styles, /var\(--font-chalk\)/);
  assert.match(styles, /\.school-portal-shell\.dashboard-active \{ padding: 12px 16px; overflow: visible; \}/);
  assert.match(styles, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(dashboard, /mobile-school-menu/);
  assert.match(dashboard, /menu-todo\.webp/);
  assert.match(dashboard, /menu-classes\.webp/);
  assert.match(dashboard, /menu-inbox\.webp/);
  assert.match(dashboard, /menu-calendar\.webp/);
  assert.match(dashboard, /menu-notes\.webp/);
  assert.match(dashboard, /menu-chat\.webp/);
  assert.match(dashboard, /const mobileMenuItems:[\s\S]*?label: "To-Do List"[\s\S]*?label: "Inbox"[\s\S]*?label: "Chat"[\s\S]*?label: "Notes"[\s\S]*?label: "Classes"[\s\S]*?label: "Calendar"[\s\S]*?label: "Inspiration"[\s\S]*?label: "Resources"[\s\S]*?label: "Stats"[\s\S]*?label: "Admin"[\s\S]*?\];/);
  assert.match(dashboard, /menu-inspiration\.webp/);
  assert.match(dashboard, /menu-resources\.webp/);
  assert.match(dashboard, /menu-stats\.webp/);
  assert.match(dashboard, /menu-admin\.webp/);
  assert.ok(mobileMenuArtwork.every((asset) => asset.size < 70_000));
  assert.match(dashboard, /grade-artwork-grid/);
  assert.match(styles, /\.grade-artwork-percentage \{[^}]*left: 48%;[^}]*font-size: clamp\(24px, 4\.65vw, 54px\)/);
  assert.ok(gradeArtwork.every((asset) => asset.size < 90_000));
  assert.match(dashboard, /Due today/);
  assert.match(dashboard, /today-featured-slot/);
  assert.match(dashboard, /due-today-banner\.webp/);
  assert.match(dashboard, /tomorrow-featured-slot/);
  assert.match(dashboard, /due-tomorrow-banner\.webp/);
  assert.match(dashboard, /week-featured-slot/);
  assert.match(dashboard, /this-week-banner\.webp/);
  assert.match(dashboard, /spider-count-badge/);
  assert.match(dashboard, /Due tomorrow/);
  assert.match(dashboard, /Due this week/);
  assert.match(dashboard, /function hasTeacherInstructions\(item: ActionItem\)/);
  assert.match(dashboard, /const readableDescription = item\.description\.trim\(\)/);
  assert.match(dashboard, /plainCanvasText\(readableDescription\) !== plainCanvasText\(DEFAULT_ASSIGNMENT_INSTRUCTIONS\)/);
  assert.match(dashboard, /assignment-details-play\.webp/);
  assert.match(styles, /\.assignment-instructions-play \{ width: 42px; height: 42px;/);
  assert.match(dashboard, /shortOrdinalDay\(tomorrow\)/);
  assert.match(dashboard, /tone="today"/);
  assert.match(dashboard, /tone="tomorrow"/);
  assert.doesNotMatch(dashboard, /className="dashboard-footer"/);
  assert.doesNotMatch(dashboard, /upcoming-stat|upcoming-panel|Important upcoming/);
  assert.match(styles, /\.school-app \.school-sidebar \{ display: none; \}/);
  assert.match(styles, /\.school-app \.summary-card\.is-zero/);
  assert.match(styles, /\.school-app \.course-stat \{ display: none; \}/);
  assert.match(styles, /\.school-app \.critical-stat,/);
  assert.match(styles, /\.school-app \.critical-strip \{ display: none; \}/);
  assert.match(styles, /\.school-app \.schedule-panel,/);
  assert.match(styles, /\.school-app \.quick-panel \{ display: none; \}/);
  assert.match(styles, /\.featured-due-stack \{ width: 100%/);
  assert.match(styles, /\.due-featured-slot \{ width: 100%/);
  assert.match(styles, /background-color: #fff;/);
  assert.match(styles, /panel-pattern-5\.webp/);
  assert.match(styles, /\.school-app \.overview-hero \{ display: none; \}/);
  assert.match(styles, /@keyframes due-today-circle-pulse/);
  assert.match(styles, /\.due-tone-tomorrow \.spider-count-badge/);
  assert.match(styles, /\.due-featured-slot \.mobile-due-card \{ overflow: visible/);
  assert.match(dashboard, /IntersectionObserver/);
  assert.match(dashboard, /play\(hasAnimatedRef\.current \? 0 : 3\.3\)/);
  assert.match(dashboard, /"<\+=0\.5"/);
  assert.ok(menuArtwork.size < 30_000);
  assert.ok(menuPopupArtwork.size < 40_000);
  assert.ok(seeInCanvasArtwork.size < 40_000);
  assert.ok(assignmentDetailsPlayArtwork.size < 30_000);
  assert.ok(futureAssignmentPlaybackArtwork.every((asset) => asset.size < 30_000));
  assert.ok(logoutArtwork.size < 30_000);
  assert.ok(dueTodayArtwork.size < 100_000);
  assert.ok(dueTomorrowArtwork.size < 100_000);
  assert.ok(thisWeekArtwork.size < 100_000);
  assert.ok(panelPatterns.every((pattern) => pattern.size < 15_000));
});

test("assignments open a detailed accessible modal before leaving for Canvas", async () => {
  const dashboard = await readFile(new URL("app/dashboard/DashboardHome.tsx", root), "utf8");
  const dashboardRoute = await readFile(new URL("app/api/dashboard/route.ts", root), "utf8");
  const styles = await readFile(new URL("app/globals.css", root), "utf8");

  assert.match(dashboard, /role="dialog" aria-modal="true"/);
  assert.match(dashboard, /See in Canvas/);
  assert.match(dashboard, /Instructions &amp; details/);
  assert.match(dashboard, /DOMPurify\.sanitize/);
  assert.match(dashboard, /<h4>\{item\.title\}<\/h4>/);
  assert.match(dashboard, /Open \$\{item\.title\} in Canvas in a new browser window/);
  assert.match(dashboard, /\/api\/assignment-details\?course_id=/);
  assert.match(dashboard, /item_type=/);
  assert.match(dashboard, /function mergeCanvasInstructions\(/);
  assert.match(dashboard, /Additional Canvas details/);
  assert.match(dashboard, /return \{ \.\.\.current, \.\.\.body\.item, \.\.\.mergedInstructions \}/);
  assert.match(dashboard, /Loading the full item from Canvas/);
  assert.match(dashboard, /canvasCourseId: number \| null/);
  const assignmentDetails = await readFile(new URL("app/api/assignment-details/route.ts", root), "utf8");
  assert.match(assignmentDetails, /\/api\/v1\/courses\/\$\{courseId\}\/assignments\/\$\{itemId\}/);
  assert.match(assignmentDetails, /\/api\/v1\/courses\/\$\{courseId\}\/discussion_topics\/\$\{itemId\}/);
  assert.match(assignmentDetails, /readFamilySession/);
  assert.match(dashboard, /event\.key === "Escape"/);
  assert.match(dashboardRoute, /description: canvasHtmlToText/);
  assert.match(dashboardRoute, /item\.plannable\?\.message/);
  assert.match(dashboardRoute, /if \(itemType === "announcement"\) return null/);
  assert.match(dashboardRoute, /async function enrichDueAssignmentInstructions\(items: ActionItem\[\], token: string\)/);
  assert.match(dashboardRoute, /params\.append\("assignment_ids\[\]", String\(itemId\)\)/);
  assert.doesNotMatch(dashboardRoute, /item\.kind !== "assignment"\s*\|\| item\.description\.trim\(\)/);
  assert.match(dashboardRoute, /\/discussion_topics\/\$\{itemId\}/);
  assert.match(dashboardRoute, /details\.set\(`discussion_topic:\$\{courseId\}:\$\{itemId\}`/);
  assert.match(dashboardRoute, /descriptionHtml = assignment\.description\?\.trim\(\) \?\? ""/);
  assert.match(dashboardRoute, /critical: criticalWithAudio/);
  assert.match(dashboardRoute, /upcoming: upcomingWithAudio/);
  assert.match(dashboardRoute, /descriptionHtml/);
  assert.match(dashboardRoute, /submissionTypes:/);
  assert.match(styles, /\.assignment-modal-scroll \{[^}]*overflow-y: auto/);
  assert.match(styles, /\.assignment-modal-actions button \{ width: 100%/);
  assert.match(styles, /\.canvas-rich-content img,[\s\S]*max-width: 100%/);
  assert.match(styles, /\.canvas-rich-content iframe \{[^}]*aspect-ratio: 16 \/ 9/);
  assert.match(dashboard, /Pinch to zoom · drag to move/);
  assert.match(dashboard, /onPointerMove/);
  assert.match(dashboard, /onImageOpen=\{openExpandedImage\}/);
  assert.match(styles, /\.announcement-image-stage \{[^}]*touch-action: none/);
  assert.match(styles, /teacher-player-size\) \/ 2 - 28px/);
  assert.match(dashboard, /announcement-player-subject.*courseLabel\(playerItem\.course\)/);
  assert.match(dashboard, /announcement-player-subject.*assignmentCourseLabel\(item\.course\)/);
  assert.match(styles, /announcement-subject-gradient 4s/);
  assert.match(styles, /teacher-player-size\) \/ -2 - 4px/);
  assert.equal((dashboard.match(/className="announcement-player-close"/g) ?? []).length, 2);
  assert.match(styles, /\.announcement-player-done \{[^}]*box-shadow: none/);
  assert.match(styles, /\.announcement-modal-got-it \{[^}]*background: none/);
  assert.match(styles, /panel-pattern-2\.webp/);
  assert.match(dashboard, /see-in-canvas\.webp/);
  assert.match(dashboard, /logout-button\.webp/);
});

test("grade artwork opens a mobile course gradebook sorted by course score", async () => {
  const dashboard = await readFile(new URL("app/dashboard/DashboardHome.tsx", root), "utf8");
  const gradeRoute = await readFile(new URL("app/api/course-grades/route.ts", root), "utf8");
  const styles = await readFile(new URL("app/globals.css", root), "utf8");

  assert.match(dashboard, /function CourseGradebookView/);
  assert.match(dashboard, /onClick=\{\(\) => void openCourseGradebook\(course\)\}/);
  assert.match(dashboard, /return b\.percentage - a\.percentage/);
  assert.match(dashboard, /Due/);
  assert.match(dashboard, /Submitted/);
  assert.match(dashboard, /Status/);
  assert.match(dashboard, /Score/);
  assert.match(gradeRoute, /students\/submissions\?include\[\]=assignment/);
  assert.match(gradeRoute, /submissionStatus/);
  assert.match(styles, /\.course-gradebook-view/);
  assert.match(styles, /\.gradebook-assignment-card/);
  assert.match(dashboard, /className="gradebook-teacher-photo"/);
  assert.match(dashboard, /className="gradebook-overall"/);
  assert.match(styles, /\.gradebook-assignment-card dl \{[^}]*grid-template-columns: 1fr/);
  assert.match(styles, /\.course-gradebook-view \{[^}]*background: none/);
});

test("Canvas Inbox loads the ten newest conversations and full message threads", async () => {
  const dashboard = await readFile(new URL("app/dashboard/DashboardHome.tsx", root), "utf8");
  const inboxRoute = await readFile(new URL("app/api/inbox/route.ts", root), "utf8");
  const styles = await readFile(new URL("app/globals.css", root), "utf8");

  assert.match(inboxRoute, /isAuthorizedAppRequest/);
  assert.match(inboxRoute, /readFamilySession/);
  assert.match(inboxRoute, /per_page=10&include\[\]=participant_avatars/);
  assert.match(inboxRoute, /conversation_id/);
  assert.match(inboxRoute, /conversation\.messages/);
  assert.match(inboxRoute, /add_message/);
  assert.match(inboxRoute, /attachment_ids\[\]/);
  assert.match(inboxRoute, /canvasUploadConversationFile/);
  assert.match(inboxRoute, /isOwn/);
  assert.match(dashboard, /InboxThreadModal/);
  assert.match(dashboard, /Send reply/);
  assert.match(dashboard, /Replying to/);
  assert.match(dashboard, /Record audio/);
  assert.match(dashboard, /Canvas Inbox: the 10 most recent conversations/);
  assert.match(dashboard, /: "Read"/);
  assert.match(styles, /menu-popup-bg\.webp/);
  assert.match(styles, /\.inbox-conversation-list \{[^}]*overflow-y: auto/);
  assert.match(styles, /\.inbox-thread-scroll \{[^}]*grid-auto-rows: max-content[^}]*overflow-y: auto/);
  assert.match(styles, /\.inbox-thread-message\.is-own \{[^}]*width: 100%[^}]*justify-self: stretch/);
  assert.match(styles, /\.inbox-thread-message\.is-own \.inbox-message-date-bar \{[^}]*justify-self: stretch[^}]*text-align: left/);
  assert.match(styles, /\.inbox-thread-message\.is-own > div \{[^}]*width: 100%[^}]*min-width: 0/);
  assert.doesNotMatch(styles, /\.inbox-thread-message\.is-own \{[^}]*width: 91%/);
  assert.match(styles, /\.mobile-menu-backdrop/);
});

test("Classes and family boards use the shared animated feature view", async () => {
  const dashboard = await readFile(new URL("app/dashboard/DashboardHome.tsx", root), "utf8");
  const postsRoute = await readFile(new URL("app/api/posts/route.ts", root), "utf8");
  const styles = await readFile(new URL("app/globals.css", root), "utf8");

  assert.match(dashboard, /function ClassesView/);
  assert.match(dashboard, /Classes: \$\{classes\.length\} classes and course spaces/);
  assert.match(dashboard, /meeting\.days\.join\(" \/ "\)/);
  assert.match(dashboard, /Open Class in Canvas/);
  assert.match(styles, /\.portal-feature-view\.classes-view \{[^}]*background: none/);
  assert.match(styles, /\.class-box \{[^}]*background: rgba\(255,255,255,\.96\)/);
  assert.match(styles, /\.class-meetings > div:not\(\.class-time-missing\) \{[^}]*width: 70%[^}]*linear-gradient\(135deg,#268cff,#154aa8\)/);
  assert.match(styles, /white-space: nowrap/);
  assert.match(dashboard, /function PostBoardView/);
  assert.match(dashboard, /Make a new post/);
  assert.match(dashboard, /youtube-nocookie\.com\/embed/);
  assert.match(dashboard, /action: "inspiration"/);
  assert.match(dashboard, /action: "resources"/);
  assert.match(dashboard, /function FeatureBackBar/);
  assert.equal((dashboard.match(/<FeatureBackBar onBack=\{returnToDashboard\}/g) ?? []).length, 1);
  assert.doesNotMatch(dashboard, /aria-label="Return to dashboard">←<\/button>/);
  assert.match(postsRoute, /isAuthorizedAppRequest/);
  assert.match(postsRoute, /readFamilySession/);
  assert.match(postsRoute, /ensureFamilyPostsSchema/);
  assert.match(styles, /\.portal-feature-view/);
  assert.match(styles, /menu-popup-bg\.webp/);
  assert.match(styles, /\.post-board-create-bar \{ position: sticky/);
  assert.match(styles, /\.feature-back-bar \{/);
  assert.match(styles, /justify-content: center/);
  assert.doesNotMatch(dashboard, /className="portal-feature-header"/);
  assert.doesNotMatch(dashboard, /className="inbox-view-header"/);
  assert.match(styles, /\.portal-feature-view > \.portal-feature-header,[\s\S]*display: none !important/);
  assert.match(styles, /margin: 0 calc\(var\(--feature-pad\) \* -1\) calc\(var\(--feature-pad\) \* -1\)/);
});

test("family chat is persistent, paginated, link-aware, and sender controlled", async () => {
  const dashboard = await readFile(new URL("app/dashboard/DashboardHome.tsx", root), "utf8");
  const chatRoute = await readFile(new URL("app/api/chat/route.ts", root), "utf8");
  const schema = await readFile(new URL("db/schema.ts", root), "utf8");
  const styles = await readFile(new URL("app/globals.css", root), "utf8");

  assert.match(dashboard, /action: "chat"/);
  assert.match(dashboard, /function ChatView/);
  assert.match(dashboard, /Load 15 older messages/);
  assert.match(dashboard, /https\?:\\\/\\\/\[\^\\s\]\+/);
  assert.match(dashboard, /target="_blank" rel="noreferrer"/);
  assert.match(dashboard, /Only the sender|onDelete/);
  assert.match(chatRoute, /LIMIT 16/);
  assert.match(chatRoute, /WHERE id < \?/);
  assert.match(chatRoute, /existing\.author_username !== auth\.user\.username/);
  assert.match(chatRoute, /export async function PATCH/);
  assert.match(chatRoute, /export async function PUT/);
  assert.match(chatRoute, /SELECT message_id[\s\S]*family_chat_message_reads/);
  assert.match(chatRoute, /export async function DELETE/);
  assert.match(schema, /family_chat_messages/);
  assert.match(schema, /family_chat_message_reads/);
  assert.match(dashboard, /data-chat-message-id/);
  assert.match(dashboard, /chat-seen-row\$\{message\.seenBy\.length/);
  assert.match(dashboard, /entry\.intersectionRatio < 0\.35/);
  assert.match(dashboard, /function mergeChatRefresh/);
  assert.match(dashboard, /return changed \? merged : current/);
  assert.match(dashboard, /\[firstMessageId, latestMessageId, loading, messages\.length\]/);
  assert.match(dashboard, /\[activeView, adminLoading, chatLoading, postBoardLoading, postsByBoard\]/);
  assert.doesNotMatch(dashboard, /\[activeView, adminLoading, chatLoading, chatMessages/);
  assert.match(dashboard, /\[activeView, dashboardPreferences\.showAnnouncements, dashboardPreferencesLoaded, hasDashboardData\]/);
  assert.match(dashboard, /aria-label="Close school app"/);
  assert.match(dashboard, /mobile-menu-logout-action/);
  assert.match(styles, /\.chat-message\.is-mine/);
  assert.match(styles, /\.chat-message\.tone-girl/);
  assert.match(styles, /\.chat-seen-row/);
  assert.match(styles, /\.chat-seen-row\.is-empty/);
  assert.match(styles, /width: 26px; height: 26px/);
});

test("Canvas Inbox can start a complete teacher email with required subject and message", async () => {
  const dashboard = await readFile(new URL("app/dashboard/DashboardHome.tsx", root), "utf8");
  const inboxRoute = await readFile(new URL("app/api/inbox/route.ts", root), "utf8");
  const styles = await readFile(new URL("app/globals.css", root), "utf8");
  assert.match(dashboard, /email-a-teacher\.jpg/);
  assert.match(dashboard, /className="inbox-launch-row"/);
  assert.doesNotMatch(dashboard, /canvas-emails\.webp/);
  assert.match(dashboard, /conversations#filter=type=inbox/);
  assert.match(dashboard, /aria-label="Open Canvas Inbox"/);
  assert.match(dashboard, /target="_blank" rel="noopener noreferrer" aria-label="Open Canvas Inbox"/);
  assert.match(dashboard, /className="inbox-launch-row"[\s\S]*?className="email-teacher-launch"[\s\S]*?className="canvas-inbox-text-link"/);
  assert.match(styles, /\.inbox-launch-row \{ width: 100%;[^}]*grid-template-columns: minmax\(0, 1fr\)[^}]*background: transparent; box-shadow: none;/);
  assert.doesNotMatch(styles, /\.inbox-launch-row \{[^}]*grid-template-columns: minmax\(0, 8fr\) minmax\(0, 9fr\)/);
  assert.match(styles, /\.email-teacher-launch img \{ clip-path: inset\(13% 0 13% 0 round 999px\); \}/);
  assert.match(styles, /\.canvas-inbox-text-link \{[^}]*text-decoration: underline/);
  assert.match(dashboard, /Who would you like to email\?/);
  assert.match(dashboard, /disabled={!subject\.trim\(\) \|\| !message\.trim\(\) \|\| sending}/);
  assert.match(dashboard, /Record audio/);
  assert.match(inboxRoute, /recipients\[\]/);
  assert.match(inboxRoute, /force_new/);
});

test("admin stores percentages and controls dashboard section visibility", async () => {
  const dashboard = await readFile(new URL("app/dashboard/DashboardHome.tsx", root), "utf8");
  const dashboardRoute = await readFile(new URL("app/api/dashboard/route.ts", root), "utf8");
  const styles = await readFile(new URL("app/globals.css", root), "utf8");
  const adminRoute = await readFile(new URL("app/api/admin/route.ts", root), "utf8");
  const schema = await readFile(new URL("db/schema.ts", root), "utf8");
  const dbIndex = await readFile(new URL("db/index.ts", root), "utf8");
  const migration = await readFile(new URL("drizzle/0006_nice_the_hunter.sql", root), "utf8");

  assert.match(dashboard, /action: "admin"/);
  assert.match(dashboard, /function AdminView/);
  assert.match(dashboard, /showAnnouncements/);
  assert.match(dashboard, /title: "Announcements"/);
  assert.match(dashboard, /dashboardPreferencesLoaded && dashboardPreferences\.showAnnouncements \? <AnnouncementStack/);
  assert.match(dashboard, /showDueTodayWhenEmpty/);
  assert.match(dashboard, /showDueTomorrowWhenEmpty/);
  assert.match(dashboard, /showDueWeekWhenEmpty/);
  assert.match(dashboard, /className="week-item-due"/);
  assert.match(dashboard, /thisWeekDueLabel\(item\.dueAt\)/);
  assert.match(dashboard, /function letterGrade/);
  assert.match(dashboard, /grade-artwork-value/);
  assert.match(dashboard, /const scrollRoot = showcase\.closest<HTMLElement>\("\.school-workspace"\)/);
  assert.match(dashboard, /observerTargets\.set\(value\.closest<HTMLElement>\("\.grade-artwork-card"\)/);
  assert.match(dashboard, /scrollRoot\?\.addEventListener\("scroll", scheduleVisibilityCheck/);
  assert.match(dashboard, /window\.addEventListener\("scroll", scheduleVisibilityCheck/);
  assert.match(dashboard, /document\.addEventListener\("scroll", scheduleVisibilityCheck/);
  assert.match(dashboard, /window\.visualViewport\?\.addEventListener\("scroll", scheduleVisibilityCheck/);
  assert.match(dashboard, /window\.setInterval\(checkVisibility, 240\)/);
  assert.match(dashboard, /Math\.min\(scrollBounds\?\.bottom \?\? viewportBottom, viewportBottom\)/);
  assert.match(dashboard, /visibleHeight >= Math\.min\(triggerHeight \* 0\.35, 40\)/);
  assert.match(dashboard, /elastic\.out\(1\.25, 0\.24\)/);
  assert.match(dashboard, /scale: 0\.001, x: 0/);
  assert.doesNotMatch(dashboard, /flyFromX/);
  assert.match(dashboard, /const gradeTimeline = gsap\.timeline/);
  assert.match(dashboard, /grade-artwork-letter-motion/);
  assert.match(dashboard, /gsap\.to\(motion, \{[\s\S]*scale: 1\.26,[\s\S]*repeat: -1,[\s\S]*yoyo: true/);
  assert.match(dashboard, /gsap\.timeline\(\{ repeat: -1, repeatDelay: 0\.65 \}\)/);
  assert.match(dashboard, /\.to\(motion, \{ rotation: "\+=360"/);
  assert.match(dashboard, /startPersistentMotion\(value, motion\)/);
  assert.match(dashboard, /\}, \[activeView, gradeOverrides, hasDashboardData\]\);/);
  assert.match(dashboard, /const displayCourse = manualGrade[\s\S]*?score: manualGrade\.percentage, grade: letterGrade\(manualGrade\.percentage\)[\s\S]*?: course/);
  assert.match(dashboard, /course: displayCourse, artwork: artworkForCourse\(course\.name\), percentage: displayCourse\.score/);
  assert.match(dashboard, /gradeCards\.map\(\(\{ course, artwork: item, percentage \}\)[\s\S]*?openCourseGradebook\(course\)/);
  assert.doesNotMatch(dashboard, /percentage: course\.score \?\? manualGrade\?\.percentage/);
  assert.match(dashboardRoute, /function detailIdForPlannerItem\(/);
  assert.match(dashboardRoute, /discussion_topics/);
  assert.match(dashboardRoute, /source\.match\(\/\\\/courses\\\/\\d\+\\\/assignments\\\/\(\\d\+\)\/i\)/);
  assert.match(styles, /\.grade-tone-b \.grade-artwork-letter,[\s\S]*\.grade-tone-d \.grade-artwork-letter \{ left: 51%; \}/);
  assert.match(styles, /\.grade-artwork-value \{[^}]*visibility: hidden; opacity: 0;/);
  assert.doesNotMatch(dashboard, /autoAlpha: 0\.18/);
  assert.match(dashboard, /value\.dataset\.grade === "D"/);
  assert.match(dashboard, /value\.dataset\.grade === "F"/);
  assert.match(dashboard, /data-grade-rank/);
  assert.match(adminRoute, /isAuthorizedAppRequest/);
  assert.match(adminRoute, /readFamilySession/);
  assert.match(adminRoute, /show_announcements/);
  assert.match(adminRoute, /ON CONFLICT\(course_key\) DO UPDATE/);
  assert.match(schema, /showAnnouncements: integer\("show_announcements"/);
  assert.match(schema, /family_dashboard_settings/);
  assert.match(schema, /family_course_grades/);
  assert.match(dbIndex, /PRAGMA table_info\(family_dashboard_settings\)/);
  assert.match(dbIndex, /ALTER TABLE family_dashboard_settings ADD COLUMN show_announcements INTEGER NOT NULL DEFAULT 1/);
  assert.match(migration, /ALTER TABLE `family_dashboard_settings` ADD `show_announcements` integer DEFAULT true NOT NULL/);
});
