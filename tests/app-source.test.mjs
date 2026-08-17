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
