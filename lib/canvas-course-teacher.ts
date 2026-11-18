export type CanvasTeacher = { id?: number; display_name?: string; avatar_image_url?: string | null };
export type TeacherCourse = { name: string; original_name?: string; course_code?: string; teachers?: CanvasTeacher[] };

export type CourseTeacher = { name: string | null; avatarUrl: string | null };

function normalizeNameForMatch(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function selectCourseTeacher(course: TeacherCourse): CourseTeacher | undefined {
  const teachers = Array.from(new Map((course.teachers ?? []).filter((teacher) => teacher.display_name?.trim()).map((teacher) => [teacher.id ?? normalizeNameForMatch(teacher.display_name!), teacher])).values());
  const courseWords = new Set(normalizeNameForMatch([course.name, course.original_name, course.course_code].filter(Boolean).join(" ")).split(" ").filter(Boolean));
  const matches = teachers.filter((teacher) => {
    const nameWords = normalizeNameForMatch(teacher.display_name!).split(" ").filter(Boolean);
    const surname = nameWords.at(-1);
    return Boolean(surname && surname.length > 2 && courseWords.has(surname));
  });
  if (matches.length === 1) {
    return {
      name: matches[0].display_name!.trim(),
      avatarUrl: matches[0].avatar_image_url?.trim() || null,
    };
  }

  // Some Canvas schools put the actual instructor surname in the course title
  // while the teachers include returns a coordinator or account-level teacher.
  const titleInstructor = course.name.match(/\s[-–—]\s*([\p{L}][\p{L}'’.-]*(?:\s+[\p{L}][\p{L}'’.-]*){0,2})\s*$/u)?.[1]?.trim();
  if (titleInstructor) return { name: titleInstructor, avatarUrl: null };

  if (teachers.length !== 1) return undefined;
  return {
    name: teachers[0].display_name!.trim(),
    avatarUrl: teachers[0].avatar_image_url?.trim() || null,
  };
}

