import assert from "node:assert/strict";
import test from "node:test";
import { createStudyBuddyApi } from "./api.mjs";
import { InMemoryStudyBuddyRepository } from "./repository.mjs";
import { sampleLecture, seedState } from "../data/seed.mjs";

test("ingests a lecture and builds reusable course memory", async () => {
  const api = createStudyBuddyApi({
    repository: new InMemoryStudyBuddyRepository(seedState)
  });

  const course = await api.addLecture("course_cs101", sampleLecture);

  assert.equal(course.memory.lectureCount, 1);
  assert.ok(course.memory.summary.includes("Neural networks"));
  assert.ok(course.memory.keyTerms.length > 0);
  assert.ok(course.lectures[0].artifacts.flashcards.length > 0);
  assert.ok(course.lectures[0].artifacts.quiz.length > 0);
  assert.equal(course.progress.totalExercises, 5);
});

test("generates a study plan from course lectures and exam date", async () => {
  const api = createStudyBuddyApi({
    repository: new InMemoryStudyBuddyRepository(seedState)
  });

  await api.addLecture("course_cs101", sampleLecture);
  const plan = await api.buildStudyPlan("course_cs101", {
    startDate: "2026-10-07T12:00:00.000Z",
    examDate: "2026-10-10",
    sessionsPerDay: 2
  });

  assert.equal(plan.days.length, 3);
  assert.equal(plan.days[0].tasks.length, 2);
  assert.equal(plan.days.at(-1).focus, "exam-readiness");
});

test("tracks exercise progress", async () => {
  const api = createStudyBuddyApi({
    repository: new InMemoryStudyBuddyRepository(seedState)
  });

  let course = await api.addLecture("course_cs101", sampleLecture);
  const exerciseId = course.lectures[0].exercises[0].id;
  course = await api.completeExercise("course_cs101", exerciseId);

  assert.equal(course.progress.completedExercises, 1);
  assert.equal(course.lectures[0].exercises[0].status, "completed");
});

test("searches remembered lecture content", async () => {
  const api = createStudyBuddyApi({
    repository: new InMemoryStudyBuddyRepository(seedState)
  });

  await api.addLecture("course_cs101", sampleLecture);
  const hits = await api.search("course_cs101", "backpropagation");

  assert.equal(hits.length, 1);
  assert.ok(hits[0].hits.includes("transcript"));
});
