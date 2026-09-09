export type CanvasModuleItem = { title?: string; type?: string; page_url?: string; content_details?: { locked_for_user?: boolean } };
export type CanvasModule = {
  id: number;
  name?: string;
  items_count?: number;
  items?: CanvasModuleItem[];
};

export async function loadCanvasModules(
  courseId: number,
  getAll: <T>(path: string) => Promise<T[]>,
) {
  const modules = await getAll<CanvasModule>(`/api/v1/courses/${courseId}/modules?include[]=items&include[]=content_details&per_page=100`);
  let complete = true;
  let nextIndex = 0;
  const results = [...modules];
  await Promise.all(Array.from({ length: Math.min(3, modules.length) }, async () => {
    while (nextIndex < modules.length) {
      const index = nextIndex++;
      const module = modules[index];
      if (module.items_count === 0 || (Array.isArray(module.items) &&
        (module.items_count === undefined || module.items.length >= module.items_count))) continue;
      try {
        if (!Number.isSafeInteger(module.id) || module.id <= 0) throw new Error("Canvas module ID is missing.");
        const items = await getAll<CanvasModuleItem>(`/api/v1/courses/${courseId}/modules/${module.id}/items?include[]=content_details&per_page=100`);
        results[index] = { ...module, items };
        // The item count can include content hidden from the student. A
        // successfully exhausted paginated list is the accessible full list.
      } catch {
        complete = false;
      }
    }
  }));
  return { modules: results, complete };
}
