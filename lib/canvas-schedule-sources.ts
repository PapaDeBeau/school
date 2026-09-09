import type { CanvasModule } from "./canvas-modules";

type CanvasPage = { title?: string; body?: string | null; locked_for_user?: boolean };
export type ScheduleSource = { title: string; html: string };

export async function loadCanvasScheduleSources(courseId: number, modules: CanvasModule[], get: <T>(path: string) => Promise<T>) {
  const sources: ScheduleSource[] = [];
  const pages = new Map<string, string>();
  for (const module of modules) {
    for (const item of module.items ?? []) {
      if (item.type === "Page" && item.page_url && !item.content_details?.locked_for_user && /zoom|live class|schedule|syllabus|information.*class|course information|welcome/i.test(item.title ?? "")) {
        pages.set(item.page_url, item.title ?? "Course page");
      }
    }
  }
  const paths = [
    { path: `/api/v1/courses/${courseId}/front_page`, title: "Course home" },
    ...[...pages].slice(0, 4).map(([page, title]) => ({ path: `/api/v1/courses/${courseId}/pages/${encodeURIComponent(page)}`, title })),
  ];
  const syllabus = await get<{ syllabus_body?: string | null }>(`/api/v1/courses/${courseId}?include[]=syllabus_body`).catch(() => null);
  if (syllabus?.syllabus_body) sources.push({ title: "Course syllabus", html: syllabus.syllabus_body });
  for (const item of paths) {
    const page = await get<CanvasPage>(item.path).catch(() => null);
    if (page?.body && !page.locked_for_user) sources.push({ title: page.title ?? item.title, html: page.body });
  }
  return sources;
}
