const STOP_WORDS = new Set([
  "about", "after", "again", "also", "because", "before", "between", "class",
  "could", "course", "during", "every", "example", "from", "have", "into",
  "lecture", "lesson", "like", "more", "most", "professor", "really", "said",
  "should", "student", "students", "teacher", "that", "their", "there", "these",
  "thing", "this", "through", "today", "using", "very", "were", "what", "when",
  "where", "which", "while", "with", "would", "your"
]);

const DEFAULT_EXERCISE_TYPES = [
  "lecture-recap",
  "flashcards",
  "concept-check",
  "practice-quiz",
  "exam-review"
];

// IDs are plain UUIDs so they fit the uuid primary keys in Postgres.
// The prefix argument is kept for call-site readability only.
export function createId(_prefix = "id") {
  return globalThis.crypto.randomUUID();
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value) {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export const COURSE_STATUSES = ["draft", "published"];

const COURSE_TEXT_LIMITS = {
  name: 120,
  code: 40,
  school: 120,
  section: 40,
  instructor: 120,
  instructorBio: 500,
  term: 60,
  description: 2000,
  coverImageUrl: 2048
};

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
  }
}

// Picks the editable course details out of untrusted input, trimming strings
// and enforcing length limits. `professor` is accepted as a legacy alias for
// `instructor` so older callers keep working.
export function sanitizeCourseDetails(input = {}, { partial = false } = {}) {
  const source = { ...input };
  if (source.instructor === undefined && source.professor !== undefined) {
    source.instructor = source.professor;
  }

  const details = {};
  for (const [field, limit] of Object.entries(COURSE_TEXT_LIMITS)) {
    if (source[field] === undefined) {
      if (!partial) details[field] = "";
      continue;
    }
    if (source[field] !== null && typeof source[field] !== "string") {
      throw new ValidationError(`${field} must be text.`);
    }
    const value = normalizeWhitespace(source[field] ?? "");
    if (value.length > limit) {
      throw new ValidationError(`${field} must be ${limit} characters or fewer.`);
    }
    details[field] = value;
  }

  if (!partial && !details.name) throw new ValidationError("A course title is required.");
  if (partial && details.name === "") throw new ValidationError("A course title is required.");
  return details;
}

export function missingForPublish(course) {
  const missing = [];
  if (!course.name) missing.push("name");
  if (!course.instructor) missing.push("instructor");
  if (!course.school) missing.push("school");
  return missing;
}

// What students see in the library: course details only, never lecture
// transcripts, materials or teacher-only data.
export function toLibraryEntry(course) {
  return {
    id: course.id,
    name: course.name,
    code: course.code ?? "",
    school: course.school ?? "",
    section: course.section ?? "",
    instructor: course.instructor ?? course.professor ?? "",
    instructorBio: course.instructorBio ?? "",
    term: course.term ?? "",
    description: course.description ?? "",
    coverImageUrl: course.coverImageUrl ?? "",
    lectureCount: course.lectures?.length ?? 0,
    publishedAt: course.publishedAt ?? null
  };
}

export function matchesLibraryQuery(entry, query) {
  const needle = normalizeWhitespace(query).toLowerCase();
  if (!needle) return true;
  return [entry.name, entry.code, entry.school, entry.instructor, entry.section]
    .some((field) => String(field ?? "").toLowerCase().includes(needle));
}

export function nowIso() {
  return new Date().toISOString();
}

export function normalizeWhitespace(text = "") {
  return String(text).replace(/\s+/g, " ").trim();
}

export function splitSentences(text = "") {
  return normalizeWhitespace(text)
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

export function extractKeyTerms(text = "", options = {}) {
  const maxTerms = options.maxTerms ?? 12;
  const words = normalizeWhitespace(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3 && !STOP_WORDS.has(word));

  const counts = new Map();
  for (const word of words) counts.set(word, (counts.get(word) ?? 0) + 1);

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, maxTerms)
    .map(([term, count]) => ({ term, count }));
}

export function summarizeTranscript(transcript = "", options = {}) {
  const sentenceLimit = options.sentenceLimit ?? 4;
  const sentences = splitSentences(transcript);
  if (sentences.length <= sentenceLimit) return sentences.join(" ");

  const keyTerms = new Set(extractKeyTerms(transcript, { maxTerms: 16 }).map((item) => item.term));
  const scored = sentences.map((sentence, index) => {
    const lower = sentence.toLowerCase();
    let score = index === 0 ? 1.5 : 0;
    for (const term of keyTerms) if (lower.includes(term)) score += 1;
    return { sentence, index, score };
  });

  return scored
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, sentenceLimit)
    .sort((a, b) => a.index - b.index)
    .map((item) => item.sentence)
    .join(" ");
}

export function generateFlashcards({ transcript = "", summary = "", keyTerms = [] }, options = {}) {
  const maxCards = options.maxCards ?? 8;
  const sourceSentences = splitSentences(summary || transcript);
  const terms = keyTerms.length ? keyTerms.map((item) => item.term ?? item) : extractKeyTerms(transcript, { maxTerms: maxCards }).map((item) => item.term);

  return terms.slice(0, maxCards).map((term, index) => {
    const sentence = sourceSentences.find((item) => item.toLowerCase().includes(String(term).toLowerCase())) ?? sourceSentences[index % Math.max(sourceSentences.length, 1)] ?? "";
    return {
      id: createId("card"),
      front: `Explain ${titleCase(term)} in this professor's framing.`,
      back: sentence || `${titleCase(term)} is a recurring concept from this lecture.`,
      sourceTerm: term
    };
  });
}

export function generateQuiz({ transcript = "", keyTerms = [] }, options = {}) {
  const maxQuestions = options.maxQuestions ?? 5;
  const terms = keyTerms.length ? keyTerms.map((item) => item.term ?? item) : extractKeyTerms(transcript, { maxTerms: maxQuestions }).map((item) => item.term);
  const sentences = splitSentences(transcript);

  return terms.slice(0, maxQuestions).map((term, index) => {
    const answer = titleCase(term);
    const context = sentences.find((sentence) => sentence.toLowerCase().includes(String(term).toLowerCase())) ?? "";
    return {
      id: createId("quiz"),
      type: "short-answer",
      prompt: `How would you describe ${answer}, and why did it matter in lecture ${index + 1}?`,
      answer,
      explanation: context || `${answer} was identified as a high-signal topic in the transcript.`
    };
  });
}

export function generateExercises(lecture, options = {}) {
  const types = options.types ?? DEFAULT_EXERCISE_TYPES;
  const artifacts = lecture.artifacts ?? {};
  return types.map((type, index) => ({
    id: createId("exercise"),
    lectureId: lecture.id,
    type,
    title: titleForExercise(type, lecture.title),
    status: index === 0 ? "available" : "available",
    estimatedMinutes: estimateExerciseMinutes(type),
    payload: payloadForExercise(type, artifacts)
  }));
}

export function ingestLecture(course, input, options = {}) {
  const transcript = normalizeWhitespace(input.transcript ?? "");
  if (!transcript) throw new Error("A lecture transcript is required.");

  const lecture = {
    id: input.id ?? createId("lecture"),
    courseId: course.id,
    title: input.title ?? `Lecture ${(course.lectures?.length ?? 0) + 1}`,
    recordedAt: input.recordedAt ?? nowIso(),
    professor: input.professor ?? course.professor ?? null,
    transcript,
    summary: input.summary ?? summarizeTranscript(transcript),
    createdAt: nowIso()
  };

  const keyTerms = extractKeyTerms(transcript, { maxTerms: options.maxTerms ?? 12 });
  lecture.artifacts = {
    keyTerms,
    flashcards: generateFlashcards({ transcript, summary: lecture.summary, keyTerms }),
    quiz: generateQuiz({ transcript, keyTerms })
  };
  lecture.exercises = generateExercises(lecture);

  return rebuildCourseMemory({
    ...course,
    lectures: [...(course.lectures ?? []), lecture]
  });
}

export function rebuildCourseMemory(course) {
  const lectures = course.lectures ?? [];
  const transcriptText = lectures.map((lecture) => lecture.transcript).join(" ");
  const summaries = lectures.map((lecture) => lecture.summary).filter(Boolean);
  const keyTerms = extractKeyTerms(transcriptText, { maxTerms: 24 });
  const totalExercises = lectures.reduce((sum, lecture) => sum + (lecture.exercises?.length ?? 0), 0);
  const completedExercises = lectures.reduce((sum, lecture) => {
    return sum + (lecture.exercises ?? []).filter((exercise) => exercise.status === "completed").length;
  }, 0);

  return {
    ...course,
    lectures,
    memory: {
      lectureCount: lectures.length,
      summary: summarizeTranscript(summaries.join(" "), { sentenceLimit: 6 }),
      keyTerms,
      updatedAt: nowIso()
    },
    progress: {
      completedExercises,
      totalExercises,
      percent: totalExercises ? Math.round((completedExercises / totalExercises) * 100) : 0
    },
    updatedAt: nowIso()
  };
}

export function buildStudyPlan(course, options = {}) {
  const examDate = options.examDate ? new Date(options.examDate) : null;
  const now = options.startDate ? new Date(options.startDate) : new Date();
  const days = examDate && examDate > now
    ? Math.max(1, Math.ceil((examDate.getTime() - now.getTime()) / 86400000))
    : options.days ?? 7;
  const sessionsPerDay = options.sessionsPerDay ?? 1;
  const lectures = course.lectures ?? [];
  const queue = [];

  for (const lecture of lectures) {
    queue.push({ kind: "review", title: `Review ${lecture.title}`, lectureId: lecture.id, minutes: 18 });
    queue.push({ kind: "flashcards", title: `Flashcards: ${lecture.title}`, lectureId: lecture.id, minutes: 12 });
    queue.push({ kind: "quiz", title: `Practice quiz: ${lecture.title}`, lectureId: lecture.id, minutes: 15 });
  }

  if (!queue.length) {
    queue.push({ kind: "setup", title: "Record or upload the first lecture", minutes: 10 });
  }

  const plan = [];
  for (let day = 0; day < days; day += 1) {
    const date = new Date(now);
    date.setDate(now.getDate() + day);
    const tasks = [];
    for (let slot = 0; slot < sessionsPerDay; slot += 1) {
      tasks.push(queue[(day * sessionsPerDay + slot) % queue.length]);
    }
    plan.push({
      date: date.toISOString().slice(0, 10),
      focus: focusForDay(day, days),
      tasks
    });
  }

  return {
    courseId: course.id,
    examDate: examDate ? examDate.toISOString().slice(0, 10) : null,
    generatedAt: nowIso(),
    days: plan
  };
}

export function searchCourseMemory(course, query) {
  const normalized = normalizeWhitespace(query).toLowerCase();
  if (!normalized) return [];

  return (course.lectures ?? [])
    .flatMap((lecture) => {
      const hits = [];
      if (lecture.title.toLowerCase().includes(normalized)) hits.push("title");
      if (lecture.summary?.toLowerCase().includes(normalized)) hits.push("summary");
      if (lecture.transcript?.toLowerCase().includes(normalized)) hits.push("transcript");
      for (const term of lecture.artifacts?.keyTerms ?? []) {
        if (term.term.includes(normalized)) hits.push("key-term");
      }
      return hits.length ? [{ lectureId: lecture.id, title: lecture.title, hits }] : [];
    });
}

export function markExercise(course, exerciseId, status) {
  const next = {
    ...course,
    lectures: (course.lectures ?? []).map((lecture) => ({
      ...lecture,
      exercises: (lecture.exercises ?? []).map((exercise) => (
        exercise.id === exerciseId ? { ...exercise, status, updatedAt: nowIso() } : exercise
      ))
    }))
  };
  return rebuildCourseMemory(next);
}

export function titleCase(value) {
  return String(value)
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function titleForExercise(type, lectureTitle) {
  const titles = {
    "lecture-recap": `Recap ${lectureTitle}`,
    flashcards: `Flashcards for ${lectureTitle}`,
    "concept-check": `Concept check`,
    "practice-quiz": `Practice quiz`,
    "exam-review": `Exam review`
  };
  return titles[type] ?? titleCase(type);
}

function estimateExerciseMinutes(type) {
  return {
    "lecture-recap": 8,
    flashcards: 12,
    "concept-check": 10,
    "practice-quiz": 15,
    "exam-review": 20
  }[type] ?? 10;
}

function payloadForExercise(type, artifacts) {
  if (type === "flashcards") return { cards: artifacts.flashcards ?? [] };
  if (type === "practice-quiz" || type === "concept-check") return { questions: artifacts.quiz ?? [] };
  if (type === "exam-review") return { keyTerms: artifacts.keyTerms ?? [] };
  return { summary: artifacts.summary };
}

function focusForDay(day, days) {
  if (day === 0) return "reconstruct";
  if (day >= days - 2) return "exam-readiness";
  return day % 2 ? "retrieval-practice" : "spaced-review";
}
