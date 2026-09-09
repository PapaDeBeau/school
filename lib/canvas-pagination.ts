export async function collectCanvasPages<T>(
  initialPath: string,
  baseUrl: string,
  getPage: (path: string) => Promise<{ items: T[]; link: string | null }>,
): Promise<T[]> {
  const origin = new URL(baseUrl).origin;
  const visited = new Set<string>();
  const items: T[] = [];
  let next: string | null = initialPath;
  while (next) {
    const url: URL = new URL(next, baseUrl);
    if (url.origin !== origin || !url.pathname.startsWith("/api/v1/") || url.username || url.password) {
      throw new Error("Canvas returned an invalid pagination address.");
    }
    const path = `${url.pathname}${url.search}`;
    if (visited.has(path) || visited.size >= 100) throw new Error("Canvas pagination could not be completed.");
    visited.add(path);
    const page = await getPage(path);
    if (!Array.isArray(page.items)) throw new Error("Canvas returned an unreadable list.");
    items.push(...page.items);
    next = null;
    for (const match of (page.link ?? "").matchAll(/<([^>]+)>\s*;([^,]*)/g)) {
      const relations = match[2].match(/\brel\s*=\s*"([^"]+)"/i)?.[1].split(/\s+/) ?? [];
      if (relations.includes("next")) { next = match[1]; break; }
    }
  }
  return items;
}
