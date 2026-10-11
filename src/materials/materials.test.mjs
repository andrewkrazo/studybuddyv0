import assert from "node:assert/strict";
import test from "node:test";
import { createStudyBuddyApi } from "../core/api.mjs";
import { InMemoryStudyBuddyRepository } from "../core/repository.mjs";
import { chunkSections } from "./chunk.mjs";
import { detectDocumentType, extractSections } from "./extract.mjs";
import { InMemoryMaterialsRepository } from "./repository.mjs";
import { cleanFilename, createMaterialsService } from "./service.mjs";
import { MemoryFileStorage } from "./storage.mjs";
import { makeDocx, makePdf, makePptx, PNG_BYTES } from "./test-fixtures.mjs";

const text = (s) => new TextEncoder().encode(s);

async function setup() {
  const courses = createStudyBuddyApi({ repository: new InMemoryStudyBuddyRepository() });
  const storage = new MemoryFileStorage();
  const materials = createMaterialsService({ repository: new InMemoryMaterialsRepository(), storage, courses });
  const course = await courses.createCourse({ name: "Biology", school: "Lincoln High School", instructor: "Ms. Alvarez" });
  return { courses, storage, materials, course };
}

test("PDF text is extracted per page", async () => {
  const { sections, pageCount } = await extractSections(makePdf(["Cells are the unit of life.", "Mitosis has four phases."]), "pdf");
  assert.equal(pageCount, 2);
  assert.deepEqual(sections.map((s) => s.location), [{ page: 1 }, { page: 2 }]);
  assert.match(sections[1].text, /Mitosis/);
});

test("PPTX slides follow presentation order and include speaker notes", async () => {
  const pptx = makePptx([
    { text: ["Unit 3: Photosynthesis", "Light & dark reactions"] },
    { text: ["Chlorophyll absorbs light"], notes: ["Remind students: chlorophyll reflects green light."] }
  ]);
  const { sections, pageCount } = await extractSections(pptx, "pptx");
  assert.equal(pageCount, 2);
  assert.deepEqual(sections.map((s) => s.location), [{ slide: 1 }, { slide: 2 }, { slide: 2, notes: true }]);
  assert.equal(sections[0].text, "Unit 3: Photosynthesis\nLight & dark reactions");
  assert.equal(sections[2].text, "Remind students: chlorophyll reflects green light.");
});

test("DOCX is split at headings", async () => {
  const docx = makeDocx([
    { heading: "Osmosis" }, { text: "Water moves across a membrane." },
    { heading: "Diffusion" }, { text: "Particles spread from high to low concentration." }
  ]);
  const { sections } = await extractSections(docx, "docx");
  assert.deepEqual(sections.map((s) => s.location.section), ["Osmosis", "Diffusion"]);
  assert.equal(sections[0].text, "Water moves across a membrane.");
});

test("Markdown is split at headings", async () => {
  const { sections } = await extractSections(text("Intro line\n# Enzymes\nEnzymes speed up reactions.\n## Denaturing\nHeat changes their shape."), "md");
  assert.deepEqual(sections.map((s) => s.location.section), [null, "Enzymes", "Denaturing"]);
});

test("file type comes from the bytes, not just the name", () => {
  assert.equal(detectDocumentType(makePdf(["x"]), "anything.bin"), "pdf");
  assert.throws(() => detectDocumentType(text("not really a pdf"), "notes.pdf"), /Unsupported file type/);
  assert.throws(() => detectDocumentType(text("x"), "old.ppt"), /\.pptx or PDF/);
  assert.throws(() => detectDocumentType(new Uint8Array([0xff, 0xfe, 0x00, 0x41]), "bad.txt"), /binary|UTF-8/);
});

test("passages stay within one page and respect the size limit", () => {
  const long = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} about the cell cycle.`).join(" ");
  const passages = chunkSections([{ location: { page: 1 }, text: long }, { location: { page: 2 }, text: "Short page." }],
    { filename: "unit.pdf", maxChars: 300 });
  assert.ok(passages.length > 3);
  assert.ok(passages.every((p) => p.text.length <= 300));
  assert.equal(passages.at(-1).citation, "unit.pdf, p. 2");
  assert.ok(passages.slice(0, -1).every((p) => p.citation === "unit.pdf, p. 1"));
});

test("filenames are reduced to a safe base name", () => {
  assert.equal(cleanFilename("../../etc/passwd"), "passwd");
  assert.equal(cleanFilename("C:\\Users\\x\\Unit 1 <final>.pdf"), "Unit 1 final.pdf");
  assert.equal(cleanFilename(""), "file");
});

test("uploaded notes become searchable passages with citations", async () => {
  const { materials, course } = await setup();
  const material = await materials.upload(course.id, {
    kind: "slides",
    filename: "Unit3_Slides.pptx",
    bytes: makePptx([
      { text: ["Mitosis overview"] },
      { text: ["Photosynthesis converts light energy into chemical energy"], notes: ["Chloroplasts are where it happens."] }
    ])
  });
  assert.equal(material.status, "ready");
  assert.equal(material.segmentCount, 3);

  const results = await materials.search(course.id, "How does photosynthesis work?");
  assert.equal(results[0].citation, "Unit3_Slides.pptx, slide 2");
  assert.match(results[0].text, /light energy/);
});

test("search never returns another course's passages", async () => {
  const { courses, materials, course } = await setup();
  const other = await courses.createCourse({ name: "Chemistry", school: "Lincoln High School", instructor: "Mr. Chen" });
  await materials.upload(other.id, { kind: "notes", filename: "secret.md", bytes: text("# Titration\nTitration finds an unknown concentration.") });
  await materials.upload(course.id, { kind: "notes", filename: "bio.md", bytes: text("# Cells\nCells divide by mitosis.") });

  assert.equal((await materials.search(course.id, "titration concentration")).length, 0);
  assert.equal((await materials.search(other.id, "titration")).length, 1);
});

test("unreadable or empty files are rejected or flagged", async () => {
  const { materials, course } = await setup();
  await assert.rejects(materials.upload(course.id, { kind: "notes", filename: "x.pdf", bytes: text("hello") }), /Unsupported file type/);
  await assert.rejects(materials.upload(course.id, { kind: "notes", filename: "x.zip", bytes: text("PK") }), /one by one/);
  await assert.rejects(materials.upload(course.id, { kind: "syllabus", filename: "s.md", bytes: text("# Syllabus\nWeek 1") }), /PDF or DOCX/);
  await assert.rejects(materials.upload(course.id, { kind: "video", filename: "a.pdf", bytes: makePdf(["x"]) }), /Unknown material kind/);

  const scanned = await materials.upload(course.id, { kind: "syllabus", filename: "scan.pdf", bytes: makePdf([""]) });
  assert.equal(scanned.status, "no_text");
  assert.match(scanned.statusDetail, /scanned/);
});

test("search matches words that only appear in a section heading", async () => {
  const { materials, course } = await setup();
  await materials.upload(course.id, {
    kind: "notes",
    filename: "Unit 3 notes.md",
    bytes: text("# Osmosis\nWater moves across a membrane toward higher solute concentration.")
  });
  const [hit] = await materials.search(course.id, "How does osmosis work?");
  assert.equal(hit.citation, "Unit 3 notes.md, “Osmosis”");
});

test("deleting a file removes its passages and stored bytes", async () => {
  const { materials, storage, course } = await setup();
  const m = await materials.upload(course.id, { kind: "notes", filename: "n.txt", bytes: text("Meiosis makes gametes.") });
  assert.equal((await materials.search(course.id, "meiosis")).length, 1);
  await materials.remove(course.id, m.id);
  assert.equal((await materials.search(course.id, "meiosis")).length, 0);
  assert.equal(await storage.get(m.storageKey), null);
  await assert.rejects(materials.remove(course.id, m.id), /not found/);
});

test("a new syllabus replaces the old one", async () => {
  const { materials, course } = await setup();
  await materials.upload(course.id, { kind: "syllabus", filename: "old.pdf", bytes: makePdf(["Week one covers cells."]) });
  await materials.upload(course.id, { kind: "syllabus", filename: "new.pdf", bytes: makePdf(["Week one covers ecology."]) });
  const list = await materials.list(course.id);
  assert.deepEqual(list.map((m) => m.filename), ["new.pdf"]);
});

test("cover images update the course and are the only files served publicly", async () => {
  const { courses, materials, course } = await setup();
  const cover = await materials.upload(course.id, { kind: "cover", filename: "cover.png", bytes: PNG_BYTES });
  assert.equal((await courses.getCourse(course.id)).coverImageUrl, `/api/materials/${cover.id}/file`);
  assert.equal((await materials.coverFile(cover.id)).contentType, "image/png");

  const notes = await materials.upload(course.id, { kind: "notes", filename: "n.txt", bytes: text("Private teacher notes.") });
  assert.equal(await materials.coverFile(notes.id), null);

  await assert.rejects(materials.upload(course.id, { kind: "cover", filename: "c.png", bytes: makePdf(["x"]) }), /PNG, JPG or WEBP/);
  await materials.remove(course.id, cover.id);
  assert.equal((await courses.getCourse(course.id)).coverImageUrl, "");
});
