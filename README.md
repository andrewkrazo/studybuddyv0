# StudyBuddy v0

This repo keeps the visual prototype lightweight while the reusable app logic lives in `src/core`.
v0 can redesign screens freely and call these modules for behavior.

## Functionality Layer

- `src/core/api.mjs` exposes the app API v0 should use.
- `src/core/studybuddy.mjs` contains deterministic course-memory, lecture-ingestion, flashcard, quiz, and study-plan logic.
- `src/core/repository.mjs` includes in-memory and `localStorage` repositories.
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
```
