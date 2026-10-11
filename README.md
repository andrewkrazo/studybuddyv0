# Syllabuddy

This repo keeps the visual prototype lightweight while the reusable app logic lives in `src/core`.
v0 can redesign screens freely and call these modules for behavior.

## Functionality Layer

- `src/core/api.mjs` exposes the app API v0 should use.
- `src/core/studybuddy.mjs` contains deterministic course-memory, lecture-ingestion, flashcard, quiz, and study-plan logic.
- `src/core/repository.mjs` includes in-memory and `localStorage` repositories.
- `src/server/routes.mjs` exposes the same API as REST routes for a real backend.
- `src/db/postgres-repository.mjs` swaps storage to Neon/Postgres when `DATABASE_URL` is set.
- `src/db/drizzle-schema.mjs` and `src/db/migrations/0001_initial.sql` define the production tables.
- `src/data/seed.mjs` provides sample course and lecture data for prototypes.

## Example

```js
import { createStudyBuddyApi } from "./src/core/api.mjs";
import { sampleLecture } from "./src/data/seed.mjs";

const api = createStudyBuddyApi({
  repositoryOptions: { storage: "localStorage" }
});

const course = await api.createCourse({
  name: "Neural Networks",
  code: "CS 101",
  professor: "Professor Rivera",
  examDates: ["2026-11-18"]
});

await api.addLecture(course.id, sampleLecture);
const plan = await api.buildStudyPlan(course.id, { sessionsPerDay: 2 });
```

## Scripts

```bash
npm test
npm run dev
npm run dev:api     # API + static app on http://localhost:8787
npm run db:migrate  # apply src/db/migrations/*.sql to DATABASE_URL
```

Copy `.env.example` to `.env` and set `DATABASE_URL` to your Neon connection
string. `.env` is git-ignored: never commit it or upload it to GitHub.

## REST API

The frontend can keep using the core contract through HTTP:

- `GET /api/health`
- `GET /api/courses`
- `POST /api/courses`
- `GET /api/courses/:courseId`
- `PATCH /api/courses/:courseId` (title, code, school, section, instructor, instructorBio, description, coverImageUrl)
- `POST /api/courses/:courseId/publish` (requires title, instructor and school)
- `POST /api/courses/:courseId/unpublish`
- `GET /api/library?q=term` (published courses only; details, never lecture content)
- `POST /api/courses/:courseId/lectures`
- `POST /api/courses/:courseId/exam-dates`
- `POST /api/courses/:courseId/study-plan`
- `GET /api/courses/:courseId/search?q=term`
- `GET /api/courses/:courseId/export`
- `POST /api/courses/:courseId/exercises/:exerciseId/complete`
- `POST /api/courses/:courseId/exercises/:exerciseId/reopen`

By default the API uses in-memory storage. Set `DATABASE_URL` or `STUDYBUDDY_STORAGE=postgres`
to use Neon/Postgres.
