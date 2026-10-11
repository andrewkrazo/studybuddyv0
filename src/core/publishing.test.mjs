import assert from "node:assert/strict";
import test from "node:test";
import { createStudyBuddyApi } from "./api.mjs";
import { InMemoryStudyBuddyRepository } from "./repository.mjs";
import { isUuid } from "./studybuddy.mjs";
import { sampleLecture } from "../data/seed.mjs";

function freshApi() {
  return createStudyBuddyApi({ repository: new InMemoryStudyBuddyRepository() });
}

const details = {
  name: "Biology",
  code: "BIO 1",
  school: "Lincoln High School",
  section: "Period 3",
  instructor: "Ms. Alvarez",
  instructorBio: "Teaches 10th grade biology."
};

test("new courses get UUID ids and start as drafts", async () => {
  const course = await freshApi().createCourse(details);
  assert.ok(isUuid(course.id));
  assert.equal(course.status, "draft");
  assert.equal(course.publishedAt, null);
  assert.equal(course.instructor, "Ms. Alvarez");
});

test("lectures and exercises also get UUID ids", async () => {
  const api = freshApi();
  const course = await api.createCourse(details);
  const updated = await api.addLecture(course.id, sampleLecture);
  assert.ok(isUuid(updated.lectures[0].id));
  assert.ok(updated.lectures[0].exercises.every((exercise) => isUuid(exercise.id)));
});

test("course title is required and lengths are limited", async () => {
  const api = freshApi();
  await assert.rejects(api.createCourse({ name: "   " }), /title is required/);
  await assert.rejects(api.createCourse({ name: "x".repeat(121) }), /120 characters/);
  await assert.rejects(api.createCourse({ ...details, instructorBio: "x".repeat(501) }), /500 characters/);
  await assert.rejects(api.createCourse({ name: 42 }), /must be text/);
});

test("legacy professor field maps to instructor", async () => {
  const course = await freshApi().createCourse({ name: "History", professor: "Mr. Chen" });
  assert.equal(course.instructor, "Mr. Chen");
});

test("drafts are hidden from the library until published", async () => {
  const api = freshApi();
  const course = await api.createCourse(details);
  assert.deepEqual(await api.listLibrary(), []);

  const published = await api.publishCourse(course.id);
  assert.equal(published.status, "published");
  assert.ok(published.publishedAt);

  const library = await api.listLibrary();
  assert.equal(library.length, 1);
  assert.equal(library[0].school, "Lincoln High School");

  await api.unpublishCourse(course.id);
  assert.deepEqual(await api.listLibrary(), []);
});

test("publishing requires a title, instructor and school", async () => {
  const api = freshApi();
  const course = await api.createCourse({ name: "Chemistry" });
  await assert.rejects(api.publishCourse(course.id), /instructor, school/);
});

test("a published course cannot be edited into an unpublishable state", async () => {
  const api = freshApi();
  const course = await api.createCourse(details);
  await api.publishCourse(course.id);
  await assert.rejects(api.updateCourse(course.id, { school: "" }), /school/);
  const renamed = await api.updateCourse(course.id, { name: "AP Biology" });
  assert.equal(renamed.name, "AP Biology");
  assert.equal(renamed.code, "BIO 1");
});

test("library entries never include lecture content", async () => {
  const api = freshApi();
  const course = await api.createCourse(details);
  await api.addLecture(course.id, sampleLecture);
  await api.publishCourse(course.id);

  const [entry] = await api.listLibrary();
  assert.equal(entry.lectureCount, 1);
  assert.equal(entry.lectures, undefined);
  assert.ok(!JSON.stringify(entry).includes("Backpropagation"));
});

test("library search matches title, code, school and instructor", async () => {
  const api = freshApi();
  const bio = await api.createCourse(details);
  const art = await api.createCourse({ ...details, name: "Studio Art", code: "ART 2", instructor: "Mr. Okafor" });
  await api.publishCourse(bio.id);
  await api.publishCourse(art.id);

  assert.equal((await api.listLibrary("okafor")).length, 1);
  assert.equal((await api.listLibrary("lincoln")).length, 2);
  assert.equal((await api.listLibrary("bio 1"))[0].name, "Biology");
  assert.equal((await api.listLibrary("nothing")).length, 0);
});
