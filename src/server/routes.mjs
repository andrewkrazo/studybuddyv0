import { createStudyBuddyApi } from "../core/api.mjs";
import { createRepository } from "../core/repository.mjs";
import { PostgresStudyBuddyRepository } from "../db/postgres-repository.mjs";

export async function createServerContext(options = {}) {
  const repository = options.repository ?? await createServerRepository(options);
  return {
    api: createStudyBuddyApi({ repository })
  };
}

export async function createServerRepository(options = {}) {
  const storage = options.storage ?? process.env.STUDYBUDDY_STORAGE;
  if (storage === "postgres" || process.env.DATABASE_URL) {
    return PostgresStudyBuddyRepository.fromEnv(options);
  }
  return createRepository({ initialState: options.initialState });
}

export async function handleApiRequest(request, context) {
  const url = new URL(request.url, "http://localhost");
  const method = request.method.toUpperCase();
  const parts = url.pathname.split("/").filter(Boolean);
  const api = context.api;

  try {
    if (url.pathname === "/api/health" && method === "GET") {
      return json({ ok: true, storage: process.env.STUDYBUDDY_STORAGE ?? "memory" });
    }

    if (parts[0] !== "api") return json({ error: "Not found" }, 404);

    if (parts[1] === "courses" && parts.length === 2 && method === "GET") {
      return json({ courses: await api.listCourses() });
    }

    if (parts[1] === "courses" && parts.length === 2 && method === "POST") {
      return json({ course: await api.createCourse(await request.json()) }, 201);
    }

    const courseId = parts[2];
    if (parts[1] === "courses" && courseId && parts.length === 3 && method === "GET") {
      const course = await api.getCourse(courseId);
      return course ? json({ course }) : json({ error: "Course not found" }, 404);
    }

    if (parts[1] === "courses" && courseId && parts[3] === "lectures" && method === "POST") {
      return json({ course: await api.addLecture(courseId, await request.json()) }, 201);
    }

    if (parts[1] === "courses" && courseId && parts[3] === "exam-dates" && method === "POST") {
      const body = await request.json();
      return json({ course: await api.addExamDate(courseId, body.examDate) }, 201);
    }

    if (parts[1] === "courses" && courseId && parts[3] === "study-plan" && method === "POST") {
      return json({ studyPlan: await api.buildStudyPlan(courseId, await request.json()) });
    }

    if (parts[1] === "courses" && courseId && parts[3] === "search" && method === "GET") {
      return json({ results: await api.search(courseId, url.searchParams.get("q") ?? "") });
    }

    if (parts[1] === "courses" && courseId && parts[3] === "export" && method === "GET") {
      return json({ course: await api.exportCourse(courseId) });
    }

    if (parts[1] === "courses" && courseId && parts[3] === "exercises" && parts[4] && method === "POST") {
      const action = parts[5];
      if (action === "complete") return json({ course: await api.completeExercise(courseId, parts[4]) });
      if (action === "reopen") return json({ course: await api.reopenExercise(courseId, parts[4]) });
    }

    return json({ error: "Not found" }, 404);
  } catch (error) {
    const status = /not found/i.test(error.message) ? 404 : 400;
    return json({ error: error.message }, status);
  }
}

export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers
    }
  });
}
