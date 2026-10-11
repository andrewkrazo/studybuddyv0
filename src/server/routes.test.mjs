import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryStudyBuddyRepository } from "../core/repository.mjs";
import { sampleLecture, seedState } from "../data/seed.mjs";
import { MemoryFileStorage } from "../materials/storage.mjs";
import { makePdf } from "../materials/test-fixtures.mjs";
import { createServerContext, handleApiRequest } from "./routes.mjs";

test("REST API creates courses and ingests lectures", async () => {
  const context = await createServerContext({
    repository: new InMemoryStudyBuddyRepository(seedState)
  });

  const addLecture = await handleApiRequest(new Request("http://test/api/courses/course_cs101/lectures", {
    method: "POST",
    body: JSON.stringify(sampleLecture)
  }), context);
  const addBody = await addLecture.json();

  assert.equal(addLecture.status, 201);
  assert.equal(addBody.course.memory.lectureCount, 1);

  const search = await handleApiRequest(new Request("http://test/api/courses/course_cs101/search?q=activation"), context);
  const searchBody = await search.json();

  assert.equal(search.status, 200);
  assert.equal(searchBody.results.length, 1);
});

test("REST API publishes a course into the library", async () => {
  const context = await createServerContext({ repository: new InMemoryStudyBuddyRepository() });
  const call = (path, init) => handleApiRequest(new Request(`http://test${path}`, init), context);

  const created = await call("/api/courses", {
    method: "POST",
    body: JSON.stringify({ name: "Algebra I", school: "Lincoln High School" })
  });
  assert.equal(created.status, 201);
  const { course } = await created.json();

  const early = await call(`/api/courses/${course.id}/publish`, { method: "POST" });
  assert.equal(early.status, 400);
  assert.match((await early.json()).error, /instructor/);

  const patched = await call(`/api/courses/${course.id}`, {
    method: "PATCH",
    body: JSON.stringify({ instructor: "Ms. Park" })
  });
  assert.equal(patched.status, 200);

  const published = await call(`/api/courses/${course.id}/publish`, { method: "POST" });
  assert.equal(published.status, 200);

  const library = await (await call("/api/library?q=algebra")).json();
  assert.equal(library.courses.length, 1);
  assert.equal(library.courses[0].instructor, "Ms. Park");

  const missing = await call("/api/courses/not-a-real-id/publish", { method: "POST" });
  assert.equal(missing.status, 404);

  const badJson = await call("/api/courses", { method: "POST", body: "{not json" });
  assert.equal(badJson.status, 400);
});

test("REST API uploads materials and searches them with citations", async () => {
  const context = await createServerContext({
    repository: new InMemoryStudyBuddyRepository(),
    fileStorage: new MemoryFileStorage()
  });
  const call = (path, init) => handleApiRequest(new Request(`http://test${path}`, init), context);
  const { course } = await (await call("/api/courses", { method: "POST", body: JSON.stringify({ name: "Biology" }) })).json();

  const upload = await call(`/api/courses/${course.id}/materials?kind=notes&filename=${encodeURIComponent("Unit 2.pdf")}`, {
    method: "POST",
    body: makePdf(["Osmosis is water moving across a membrane.", "Active transport uses energy."])
  });
  assert.equal(upload.status, 201);
  const { material } = await upload.json();
  assert.equal(material.segmentCount, 2);

  const search = await (await call(`/api/courses/${course.id}/sources?q=${encodeURIComponent("what is osmosis")}`)).json();
  assert.equal(search.results[0].citation, "Unit 2.pdf, p. 1");

  const bad = await call(`/api/courses/${course.id}/materials?kind=notes&filename=x.exe`, { method: "POST", body: "MZ..." });
  assert.equal(bad.status, 400);

  const huge = await call(`/api/courses/${course.id}/materials?kind=notes&filename=big.pdf`, {
    method: "POST",
    body: new Uint8Array(26 * 1024 * 1024)
  });
  assert.equal(huge.status, 413);

  const notServed = await call(`/api/materials/${material.id}/file`);
  assert.equal(notServed.status, 404);

  const removed = await call(`/api/courses/${course.id}/materials/${material.id}`, { method: "DELETE" });
  assert.equal(removed.status, 200);
  const after = await (await call(`/api/courses/${course.id}/sources?q=osmosis`)).json();
  assert.equal(after.results.length, 0);
});

test("REST API builds study plans", async () => {
  const context = await createServerContext({
    repository: new InMemoryStudyBuddyRepository(seedState)
  });

  await handleApiRequest(new Request("http://test/api/courses/course_cs101/lectures", {
    method: "POST",
    body: JSON.stringify(sampleLecture)
  }), context);

  const response = await handleApiRequest(new Request("http://test/api/courses/course_cs101/study-plan", {
    method: "POST",
    body: JSON.stringify({
      startDate: "2026-10-07T12:00:00.000Z",
      examDate: "2026-10-09",
      sessionsPerDay: 2
    })
  }), context);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.studyPlan.days.length, 2);
});
