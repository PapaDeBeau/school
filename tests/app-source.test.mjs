import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("dashboard contains the three priority surfaces", async () => {
  const dashboard = await readFile(new URL("app/dashboard/DashboardHome.tsx", root), "utf8");
  assert.match(dashboard, /Critical information/);
  assert.match(dashboard, /Important upcoming/);
  assert.match(dashboard, /This week/);
  assert.match(dashboard, /Courses &amp; grades/);
});

test("Canvas token routes remain server-only", async () => {
  const form = await readFile(new URL("app/CanvasConnectionForm.tsx", root), "utf8");
  const vault = await readFile(new URL("lib/canvas-vault.ts", root), "utf8");
  assert.match(form, /type={showToken \? "text" : "password"}/);
  assert.doesNotMatch(form, /localStorage|sessionStorage/);
  assert.match(vault, /AES-GCM/);
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
  const menuArtwork = await stat(new URL("public/menu-button.webp", root));
  const syncArtwork = await stat(new URL("public/sync-button.webp", root));
  const logoutArtwork = await stat(new URL("public/logout-button.webp", root));

  assert.match(dashboard, /mobile-dashboard-bar/);
  assert.match(dashboard, /mobile-family-greeting/);
  assert.match(dashboard, /Oh hey, \$\{name\}!/);
  assert.match(dashboard, /Look, it’s \$\{name\}!/);
  assert.match(dashboard, /menu-button\.webp/);
  assert.match(dashboard, /sync-button\.webp/);
  assert.match(dashboard, /logout-button\.webp/);
  assert.match(dashboard, /mobile-school-menu/);
  assert.match(dashboard, /Due today/);
  assert.match(dashboard, /Due tomorrow/);
  assert.match(dashboard, /Due this week/);
  assert.match(styles, /\.school-app \.school-sidebar \{ display: none; \}/);
  assert.match(styles, /\.school-app \.summary-card\.is-zero/);
  assert.match(styles, /\.school-app \.course-stat \{ display: none; \}/);
  assert.match(styles, /\.school-app \.critical-strip\.is-clear \{ display: none; \}/);
  assert.match(styles, /\.school-app \.schedule-panel,/);
  assert.match(styles, /\.school-app \.quick-panel \{ display: none; \}/);
  assert.ok(menuArtwork.size < 30_000);
  assert.ok(syncArtwork.size < 60_000);
  assert.ok(logoutArtwork.size < 30_000);
});

test("assignments open a detailed accessible modal before leaving for Canvas", async () => {
  const dashboard = await readFile(new URL("app/dashboard/DashboardHome.tsx", root), "utf8");
  const dashboardRoute = await readFile(new URL("app/api/dashboard/route.ts", root), "utf8");
  const styles = await readFile(new URL("app/globals.css", root), "utf8");

  assert.match(dashboard, /role="dialog" aria-modal="true"/);
  assert.match(dashboard, /See in Canvas/);
  assert.match(dashboard, /Instructions &amp; details/);
  assert.match(dashboard, /event\.key === "Escape"/);
  assert.match(dashboardRoute, /description: canvasHtmlToText/);
  assert.match(dashboardRoute, /submissionTypes:/);
  assert.match(styles, /\.assignment-modal-scroll \{[^}]*overflow-y: auto/);
  assert.match(styles, /\.assignment-modal-actions button \{ width: 100%/);
});
