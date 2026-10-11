import { createStudyBuddyApi } from "../core/api.mjs";
import { createRepository } from "../core/repository.mjs";
import { PostgresStudyBuddyRepository } from "../db/postgres-repository.mjs";
import { PostgresMaterialsRepository } from "../db/postgres-materials.mjs";
import { InMemoryMaterialsRepository } from "../materials/repository.mjs";
import { createMaterialsService, TooLargeError } from "../materials/service.mjs";
import { LocalFileStorage } from "../materials/storage.mjs";

export async function createServerContext(options = {}) {
  const repository = options.repository ?? await createServerRepository(options);
  const api = createStudyBuddyApi({ repository });
  const materialsRepository = options.materialsRepository
    ?? (repository instanceof PostgresStudyBuddyRepository
      ? new PostgresMaterialsRepository(repository.sql)
      : new InMemoryMaterialsRepository());
  return {
    api,
    materials: createMaterialsService({
      repository: materialsRepository,
      storage: options.fileStorage ?? new LocalFileStorage(),
      courses: api
    })
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

    if (parts[1] === "materials" && parts[2] && parts[3] === "file" && parts.length === 4 && method === "GET") {
      const file = await context.materials.coverFile(parts[2]);
      if (!file) return json({ error: "Not found" }, 404);
      return new Response(file.bytes, {
        headers: {
          "content-type": file.contentType,
          "cache-control": "public, max-age=3600",
          "x-content-type-options": "nosniff"
        }
      });
    }

    if (parts[1] === "library" && parts.length === 2 && method === "GET") {
      return json({ courses: await api.listLibrary(url.searchParams.get("q") ?? "") });
    }

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

    if (parts[1] === "courses" && courseId && parts.length === 3 && method === "PATCH") {
      return json({ course: await api.updateCourse(courseId, await request.json()) });
    }

    if (parts[1] === "courses" && courseId && parts[3] === "publish" && parts.length === 4 && method === "POST") {
      return json({ course: await api.publishCourse(courseId) });
    }

    if (parts[1] === "courses" && courseId && parts[3] === "unpublish" && parts.length === 4 && method === "POST") {
      return json({ course: await api.unpublishCourse(courseId) });
    }

    if (parts[1] === "courses" && courseId && parts[3] === "lectures" && method === "POST") {
      return json({ course: await api.addLecture(courseId, await request.json()) }, 201);
    }

    if (parts[1] === "courses" && courseId && parts[3] === "materials") {
      const materialId = parts[4];
      if (parts.length === 4 && method === "POST") {
        const bytes = new Uint8Array(await request.arrayBuffer());
        const material = await context.materials.upload(courseId, {
          kind: url.searchParams.get("kind") ?? "",
          filename: url.searchParams.get("filename") ?? "",
          bytes
        });
        return json({ material }, 201);
      }
      if (parts.length === 4 && method === "GET") {
        return json({ materials: await context.materials.list(courseId) });
      }
      if (materialId && parts.length === 5 && method === "DELETE") {
        return json({ material: await context.materials.remove(courseId, materialId) });
      }
      if (materialId && parts[5] === "passages" && parts.length === 6 && method === "GET") {
        return json({ passages: await context.materials.passages(courseId, materialId) });
      }
    }

    if (parts[1] === "courses" && courseId && parts[3] === "sources" && parts.length === 4 && method === "GET") {
      const limit = Number(url.searchParams.get("limit") ?? 8);
      return json({
        results: await context.materials.search(courseId, url.searchParams.get("q") ?? "", {
          limit: Number.isFinite(limit) ? Math.min(Math.max(1, limit), 25) : 8
        })
      });
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
    const status = error instanceof TooLargeError ? 413 : /not found/i.test(error.message) ? 404 : 400;
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
