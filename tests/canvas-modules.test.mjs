import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadCanvasModules } from "../lib/canvas-modules.ts";
import { collectCanvasPages } from "../lib/canvas-pagination.ts";

const origin = "https://sequoiagrove.instructure.com";

test("omitted module items and a second page restore class times", async () => {
  const requests = [];
  const getAll = (path) => collectCanvasPages(path, origin, async (url) => {
    requests.push(url);
    if (url.includes("/modules?")) return { items: [{ id: 11, name: "Start here", items_count: 2 }], link: null };
    if (!url.includes("page=2")) return { items: [{ title: "Welcome" }], link: `<${origin}/api/v1/courses/630/modules/11/items?page=2>; rel="next"` };
    return { items: [{ title: "Zoom class T/Th 12:45 PM" }], link: null };
  });
  const result = await loadCanvasModules(630, getAll);
  assert.equal(result.complete, true);
  assert.equal(requests.length, 3);
  const route = await readFile(new URL("../app/api/dashboard/enrichment/route.ts", import.meta.url), "utf8");
  const { stripTypeScriptTypes } = await import("node:module");
  const start = route.indexOf("function classScheduleFromModules(");
  const end = route.indexOf("\nfunction normalizeAnnouncement", start);
  const parse = new Function(`${stripTypeScriptTypes(route.slice(start, end))}; return classScheduleFromModules;`)();
  const meetings = parse([{ id: 630, name: "Algebra", originalName: null, courseCode: null }], new Map([[630, result.modules]]));
  assert.deepEqual(meetings.map(({ day, time }) => ({ day, time })), [
    { day: "Tuesday", time: "12:45 PM" }, { day: "Thursday", time: "12:45 PM" },
  ]);
});

test("complete inline items and empty modules need no fallback", async () => {
  let requests = 0;
  const modules = [{ id: 1, items_count: 1, items: [{ title: "M/W 10:00 AM" }] }, { id: 2, items_count: 0 }];
  const result = await loadCanvasModules(630, async () => { requests++; return modules; });
  assert.equal(requests, 1);
  assert.equal(result.complete, true);
  assert.deepEqual(result.modules, modules);
});

test("truncated inline items trigger a complete reload", async () => {
  let requests = 0;
  const result = await loadCanvasModules(630, async () => ++requests === 1
    ? [{ id: 1, items_count: 2, items: [{ title: "Welcome" }] }]
    : [{ title: "Welcome" }, { title: "Live class M/W 2:00 PM" }]);
  assert.equal(result.complete, true);
  assert.equal(result.modules[0].items.length, 2);
});

test("item failure is distinct from a successful empty course", async () => {
  let requests = 0;
  const failed = await loadCanvasModules(630, async () => {
    if (++requests === 1) return [{ id: 1, items_count: 2 }, { id: 2, items_count: 1, items: [{ title: "Other module" }] }];
    throw new Error("Canvas request timed out.");
  });
  assert.equal(failed.complete, false);
  assert.equal(failed.modules[1].items[0].title, "Other module");
  const empty = await loadCanvasModules(630, async () => []);
  assert.deepEqual(empty, { modules: [], complete: true });
});

test("student-visible items remain complete when the total includes hidden items", async () => {
  let calls = 0;
  const result = await loadCanvasModules(630, async () => ++calls === 1
    ? [{ id: 1, items_count: 12 }]
    : [{ title: "Zoom class T/Th 12:45 PM" }]);
  assert.equal(result.complete, true);
  assert.equal(result.modules[0].items[0].title, "Zoom class T/Th 12:45 PM");
});

test("module-list or later-page failure cannot report a complete response", async () => {
  await assert.rejects(loadCanvasModules(630, async () => { throw new Error("unauthorized"); }), /unauthorized/);
  let calls = 0;
  await assert.rejects(collectCanvasPages("/api/v1/courses/630/modules", origin, async () => {
    if (++calls === 1) return { items: [{ id: 1 }], link: `<${origin}/api/v1/courses/630/modules?page=2>; rel="next"` };
    throw new Error("timeout");
  }), /timeout/);
});

test("pagination rejects foreign hosts and loops before another request", async () => {
  for (const next of ["https://example.com/api/v1/courses", `${origin}/api/v1/courses/630/modules`]) {
    let calls = 0;
    await assert.rejects(collectCanvasPages("/api/v1/courses/630/modules", origin, async () => {
      calls++; return { items: [], link: `<${next}>; rel="next"` };
    }), /pagination/);
    assert.equal(calls, 1);
  }
});
