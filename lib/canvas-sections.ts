type Enrollment = { course_section_id?: number; type?: string };
type Section = { id: number; course_id?: number; name?: string };

export async function loadEnrolledCanvasSections(
  courseId: number,
  getAll: <T>(path: string) => Promise<T[]>,
  get: <T>(path: string) => Promise<T>,
) {
  let complete = true;
  const enrollments = await getAll<Enrollment>(`/api/v1/courses/${courseId}/enrollments?user_id=self&per_page=100`).catch(() => {
    complete = false;
    return [];
  });
  const ids = [...new Set(enrollments
    .filter((enrollment) => enrollment.type === "StudentEnrollment")
    .map((enrollment) => enrollment.course_section_id)
    .filter((id): id is number => Number.isSafeInteger(id) && Number(id) > 0))];
  const sections: Array<{ id: number; name: string }> = [];
  for (const id of ids) {
    try {
      const section = await get<Section>(`/api/v1/courses/${courseId}/sections/${id}`);
      if (section.id !== id || (section.course_id !== undefined && section.course_id !== courseId) || !section.name?.trim()) {
        complete = false;
        continue;
      }
      sections.push({ id, name: section.name.trim() });
    } catch {
      complete = false;
    }
  }
  return { sections, complete };
}
