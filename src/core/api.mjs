import {
  buildStudyPlan,
  createId,
  ingestLecture,
  markExercise,
  matchesLibraryQuery,
  missingForPublish,
  rebuildCourseMemory,
  sanitizeCourseDetails,
  searchCourseMemory,
  toLibraryEntry,
  ValidationError
} from "./studybuddy.mjs";
import { createRepository } from "./repository.mjs";

export function createStudyBuddyApi(options = {}) {
  const repository = options.repository ?? createRepository(options.repositoryOptions);

  return {
    async listCourses() {
      return repository.listCourses();
    },

    async createCourse(input = {}) {
      const details = sanitizeCourseDetails(input);
      const course = rebuildCourseMemory({
        id: createId("course"),
        ...details,
        // Legacy field kept in sync for older screens that still read it.
        professor: details.instructor,
        status: "draft",
        publishedAt: null,
        examDates: input.examDates ?? [],
        lectures: [],
        createdAt: new Date().toISOString()
      });
      return repository.saveCourse(course);
    },

    async getCourse(courseId) {
      return repository.getCourse(courseId);
    },

    async updateCourse(courseId, input = {}) {
      const course = await requiredCourse(repository, courseId);
      const details = sanitizeCourseDetails(input, { partial: true });
      const next = { ...course, ...details };
      if (details.instructor !== undefined) next.professor = details.instructor;
      if (next.status === "published") assertPublishable(next);
      return repository.saveCourse(rebuildCourseMemory(next));
    },

    async publishCourse(courseId) {
      const course = await requiredCourse(repository, courseId);
      assertPublishable(course);
      return repository.saveCourse(rebuildCourseMemory({
        ...course,
        status: "published",
        publishedAt: course.publishedAt ?? new Date().toISOString()
      }));
    },

    async unpublishCourse(courseId) {
      const course = await requiredCourse(repository, courseId);
      return repository.saveCourse(rebuildCourseMemory({
        ...course,
        status: "draft",
        publishedAt: null
      }));
    },

    async listLibrary(query = "") {
      const courses = await repository.listCourses();
      return courses
        .filter((course) => course.status === "published")
        .map(toLibraryEntry)
        .filter((entry) => matchesLibraryQuery(entry, query));
    },

    async addLecture(courseId, lectureInput) {
      const course = await requiredCourse(repository, courseId);
      const updated = ingestLecture(course, lectureInput);
      return repository.saveCourse(updated);
    },

    async addExamDate(courseId, examDate) {
      const course = await requiredCourse(repository, courseId);
      const next = rebuildCourseMemory({
        ...course,
        examDates: [...(course.examDates ?? []), examDate].sort()
      });
      return repository.saveCourse(next);
    },

    async completeExercise(courseId, exerciseId) {
      const course = await requiredCourse(repository, courseId);
      return repository.saveCourse(markExercise(course, exerciseId, "completed"));
    },

    async reopenExercise(courseId, exerciseId) {
      const course = await requiredCourse(repository, courseId);
      return repository.saveCourse(markExercise(course, exerciseId, "available"));
    },

    async buildStudyPlan(courseId, options = {}) {
      const course = await requiredCourse(repository, courseId);
      const examDate = options.examDate ?? course.examDates?.[0] ?? null;
      return buildStudyPlan(course, { ...options, examDate });
    },

    async search(courseId, query) {
      const course = await requiredCourse(repository, courseId);
      return searchCourseMemory(course, query);
    },

    async exportCourse(courseId) {
      return requiredCourse(repository, courseId);
    }
  };
}

function assertPublishable(course) {
  const missing = missingForPublish(course);
  if (missing.length) {
    throw new ValidationError(`Add these before publishing: ${missing.join(", ")}.`);
  }
}

async function requiredCourse(repository, courseId) {
  const course = await repository.getCourse(courseId);
  if (!course) throw new Error(`Course not found: ${courseId}`);
  return course;
}
