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
