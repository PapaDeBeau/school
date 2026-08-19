import { ensureFamilyAdminSchema, getD1 } from "../../../db";
import { familyUnauthorizedResponse, readFamilySession } from "../../../lib/family-auth";
import { isAuthorizedAppRequest, unauthorizedAppResponse } from "../../../lib/request-auth";

type SettingsRecord = {
  show_announcements: number;
  show_due_today_when_empty: number;
  show_due_tomorrow_when_empty: number;
  show_due_week_when_empty: number;
};

type GradeRecord = { course_key: string; course_name: string; percentage: number };

const responseHeaders = {
  "Cache-Control": "no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

function json(body: unknown, init?: ResponseInit) {
  return Response.json(body, { ...init, headers: { ...responseHeaders, ...init?.headers } });
}

async function authorize(request: Request) {
  if (!isAuthorizedAppRequest(request)) return { response: unauthorizedAppResponse(), user: null };
  const user = await readFamilySession(request);
  return user ? { response: null, user } : { response: familyUnauthorizedResponse(), user: null };
}

async function readAdminData() {
  await ensureFamilyAdminSchema();
  const d1 = getD1();
  const settings = await d1.prepare(`
    SELECT show_announcements, show_due_today_when_empty, show_due_tomorrow_when_empty, show_due_week_when_empty
    FROM family_dashboard_settings WHERE id = 1
  `).first<SettingsRecord>();
  const grades = await d1.prepare(`
    SELECT course_key, course_name, percentage FROM family_course_grades ORDER BY course_name ASC
  `).all<GradeRecord>();
  return {
    settings: {
      showAnnouncements: settings ? Boolean(settings.show_announcements) : true,
      showDueTodayWhenEmpty: settings ? Boolean(settings.show_due_today_when_empty) : true,
      showDueTomorrowWhenEmpty: settings ? Boolean(settings.show_due_tomorrow_when_empty) : true,
      showDueWeekWhenEmpty: settings ? Boolean(settings.show_due_week_when_empty) : true,
    },
    grades: (grades.results ?? []).map((grade) => ({ courseKey: grade.course_key, courseName: grade.course_name, percentage: grade.percentage })),
  };
}

export async function GET(request: Request) {
  const auth = await authorize(request);
  if (auth.response) return auth.response;
  return json(await readAdminData());
}

export async function PUT(request: Request) {
  const auth = await authorize(request);
  if (auth.response || !auth.user) return auth.response ?? familyUnauthorizedResponse();
  try {
    const payload = await request.json() as {
      settings?: { showAnnouncements?: unknown; showDueTodayWhenEmpty?: unknown; showDueTomorrowWhenEmpty?: unknown; showDueWeekWhenEmpty?: unknown };
      grades?: Array<{ courseKey?: unknown; courseName?: unknown; percentage?: unknown }>;
    };
    const settings = payload.settings;
    if (!settings || typeof settings.showAnnouncements !== "boolean" || typeof settings.showDueTodayWhenEmpty !== "boolean" || typeof settings.showDueTomorrowWhenEmpty !== "boolean" || typeof settings.showDueWeekWhenEmpty !== "boolean") {
      return json({ error: "All dashboard display toggles are required." }, { status: 400 });
    }
    if (!Array.isArray(payload.grades) || payload.grades.length > 30) return json({ error: "The course grade list is invalid." }, { status: 400 });

    const grades = payload.grades.map((grade) => {
      const courseKey = typeof grade.courseKey === "string" ? grade.courseKey.trim() : "";
      const courseName = typeof grade.courseName === "string" ? grade.courseName.trim() : "";
      const percentage = grade.percentage === null || grade.percentage === "" ? null : Number(grade.percentage);
      if (!courseKey || courseKey.length > 100 || !courseName || courseName.length > 200) throw new Error("One of the course names is invalid.");
      if (percentage !== null && (!Number.isFinite(percentage) || percentage < 0 || percentage > 100)) throw new Error(`Enter a percentage from 0 to 100 for ${courseName}.`);
      return { courseKey, courseName, percentage };
    });

    await ensureFamilyAdminSchema();
    const d1 = getD1();
    const now = new Date().toISOString();
    const statements = [
      d1.prepare(`
        INSERT INTO family_dashboard_settings
          (id, show_announcements, show_due_today_when_empty, show_due_tomorrow_when_empty, show_due_week_when_empty, updated_by, updated_at)
        VALUES (1, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          show_announcements = excluded.show_announcements,
          show_due_today_when_empty = excluded.show_due_today_when_empty,
          show_due_tomorrow_when_empty = excluded.show_due_tomorrow_when_empty,
          show_due_week_when_empty = excluded.show_due_week_when_empty,
          updated_by = excluded.updated_by,
          updated_at = excluded.updated_at
      `).bind(settings.showAnnouncements ? 1 : 0, settings.showDueTodayWhenEmpty ? 1 : 0, settings.showDueTomorrowWhenEmpty ? 1 : 0, settings.showDueWeekWhenEmpty ? 1 : 0, auth.user.username, now),
      ...grades.map((grade) => grade.percentage === null
        ? d1.prepare(`DELETE FROM family_course_grades WHERE course_key = ?`).bind(grade.courseKey)
        : d1.prepare(`
            INSERT INTO family_course_grades (course_key, course_name, percentage, updated_by, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(course_key) DO UPDATE SET
              course_name = excluded.course_name,
              percentage = excluded.percentage,
              updated_by = excluded.updated_by,
              updated_at = excluded.updated_at
          `).bind(grade.courseKey, grade.courseName, grade.percentage, auth.user.username, now)),
    ];
    await d1.batch(statements);
    return json(await readAdminData());
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Admin settings could not be saved." }, { status: 400 });
  }
}
