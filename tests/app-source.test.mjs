import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
